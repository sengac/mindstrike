import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { ConversationMessage } from '../types';

interface UseChatProps {
  threadId?: string;
  messages?: ConversationMessage[];
  onMessagesUpdate?: (messages: ConversationMessage[]) => void;
  onFirstMessage?: () => void;
}

export function useChat({ threadId, messages: initialMessages = [], onMessagesUpdate, onFirstMessage }: UseChatProps = {}) {
  const [messages, setMessages] = useState<ConversationMessage[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const isUpdatingFromProps = useRef(false);

  // Update messages when initialMessages prop changes
  useEffect(() => {
    isUpdatingFromProps.current = true;
    setMessages(initialMessages);
    setTimeout(() => {
      isUpdatingFromProps.current = false;
    }, 0);
  }, [initialMessages]);

  // Only call onMessagesUpdate when messages change due to user interaction (not props)
  const notifyMessagesUpdate = useCallback((newMessages: ConversationMessage[]) => {
    if (onMessagesUpdate) {
      onMessagesUpdate(newMessages);
    }
  }, [onMessagesUpdate]);

  const loadConversation = useCallback(async () => {
    // If we have a threadId, we're using the new thread system
    if (threadId) {
      return;
    }
    
    try {
      const response = await fetch('/api/conversation');
      if (response.ok) {
        const data = await response.json();
        setMessages(data.map((msg: any) => ({
          ...msg,
          timest: new Date(msg.timest)
        })));
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  }, [threadId]);

  useEffect(() => {
    loadConversation();
  }, [loadConversation]);

  const sendMessage = useCallback(async (content: string) => {
    // Handle /clear command
    if (content.trim() === '/clear') {
      await clearConversation();
      return;
    }

    setIsLoading(true);
    
    // Check if this is the first message in the thread
    const isFirstMessage = messages.length === 0;
    
    // Add user message immediately
    const userMessage: ConversationMessage = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timest: new Date()
    };
    let currentMessages = [...messages, userMessage];
    setMessages(currentMessages);

    try {
      // Use SSE for real-time updates
      const response = await fetch('/api/message/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: content, threadId })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body reader available');
      }

      let assistantMessage: ConversationMessage | null = null;

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              console.log('📡 SSE Message received (sendMessage):', data.type, data);
              
              if (data.type === 'connected') {
                 console.log('✅ SSE connected');
              } else if (data.type === 'message-update') {
                const updatedMsg = {
                ...data.message,
                timest: new Date(data.message.timest)
                };
                
                console.log('🔄 Message update - Status:', updatedMsg.status, 'Tool calls:', updatedMsg.toolCalls?.length || 0, updatedMsg);
                
                if (!assistantMessage) {
                // First update - add the message
                  console.log('➕ Adding new assistant message');
                assistantMessage = updatedMsg;
                currentMessages = [...currentMessages, updatedMsg];
                } else {
                // Update existing message
                console.log('🔄 Updating existing message');
                  assistantMessage = updatedMsg;
                  currentMessages = currentMessages.map(msg => 
                     msg.id === updatedMsg.id ? updatedMsg : msg
                   );
                 }
                 console.log('📝 Setting messages state, total:', currentMessages.length);
                 setMessages([...currentMessages]);
                
              } else if (data.type === 'completed') {
              console.log('✅ Message completed');
              const finalMsg = {
              ...data.message,
                timest: new Date(data.message.timest)
                 };
                
                if (assistantMessage) {
                  currentMessages = currentMessages.map(msg => 
                    msg.id === finalMsg.id ? finalMsg : msg
                  );
                } else {
                  currentMessages = [...currentMessages, finalMsg];
                }
                
                setMessages([...currentMessages]);
                notifyMessagesUpdate([...currentMessages]);
                
                // Set loading to false when message is completed
                setIsLoading(false);
                
                // Trigger first message callback if this was the first exchange
                if (isFirstMessage && onFirstMessage) {
                  onFirstMessage();
                }
                
              } else if (data.type === 'error') {
                toast.error(`Connection Error: ${data.error}`);
                setIsLoading(false);
                return;
              }
            } catch (parseError) {
              console.error('Error parsing SSE data:', parseError);
            }
          }
        }
      }

    } catch (error) {
      console.error('SSE Error:', error);
      toast.error(`Failed to send message: ${error}`);
    } finally {
      setIsLoading(false);
    }
  }, [messages, onFirstMessage, notifyMessagesUpdate]);

  const clearConversation = useCallback(async () => {
    try {
      const response = await fetch('/api/conversation/clear', {
        method: 'POST'
      });
      if (response.ok) {
        setMessages([]);
        notifyMessagesUpdate([]);
      }
    } catch (error) {
      console.error('Failed to clear conversation:', error);
    }
  }, [notifyMessagesUpdate]);

  const cancelToolCalls = useCallback(async (messageId: string) => {
    try {
      const response = await fetch('/api/message/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ messageId, threadId })
      });

      if (response.ok) {
        // The SSE stream will send the cancelled update automatically
        // so we don't need to manually update the message here
        console.log('Tool calls cancelled for message:', messageId);
      }
    } catch (error) {
      console.error('Failed to cancel tool calls:', error);
    }
  }, []);

  const regenerateMessage = useCallback(async (messageId: string) => {
    setIsLoading(true);
    
    // Find the message and get the previous user message to regenerate from
    const messageIndex = messages.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1 || messageIndex === 0) {
      setIsLoading(false);
      return;
    }
    
    // Find the last user message before this assistant message
    const userMessageIndex = messages.slice(0, messageIndex).reverse().findIndex(msg => msg.role === 'user');
    if (userMessageIndex === -1) {
      setIsLoading(false);
      return;
    }
    
    const actualUserIndex = messageIndex - 1 - userMessageIndex;
    const userMessage = messages[actualUserIndex];
    
    // Remove the assistant message and all messages after it
    const messagesBeforeRegeneration = messages.slice(0, messageIndex);
    setMessages(messagesBeforeRegeneration);

    try {
      const response = await fetch('/api/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: userMessage.content, threadId })
      });

      if (response.ok) {
        const assistantMessage = await response.json();
        const assistantMsg = {
          ...assistantMessage,
          timest: new Date(assistantMessage.timest)
        };
        const finalMessages = [...messagesBeforeRegeneration, assistantMsg];
        setMessages(finalMessages);
        notifyMessagesUpdate(finalMessages);
      } else {
        const errorData = await response.json();
        toast.error(`Failed to regenerate: ${errorData.error}`);
        setMessages(messagesBeforeRegeneration);
        notifyMessagesUpdate(messagesBeforeRegeneration);
      }
    } catch (error) {
      toast.error(`Failed to regenerate message: ${error}`);
      setMessages(messagesBeforeRegeneration);
      notifyMessagesUpdate(messagesBeforeRegeneration);
    } finally {
      setIsLoading(false);
    }
  }, [messages, notifyMessagesUpdate]);

  const editMessage = useCallback(async (messageId: string, newContent: string) => {
    setIsLoading(true);
    
    // Find the message to edit
    const messageIndex = messages.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1) {
      setIsLoading(false);
      return;
    }
    
    // Update the user message with new content
    const updatedMessages = [...messages];
    updatedMessages[messageIndex] = {
      ...updatedMessages[messageIndex],
      content: newContent
    };
    
    // Remove all assistant messages after this user message
    const messagesBeforeRegeneration = updatedMessages.slice(0, messageIndex + 1);
    setMessages(messagesBeforeRegeneration);

    try {
      // Use SSE for real-time updates
      const response = await fetch('/api/message/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: newContent, threadId })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body reader available');
      }

      let assistantMessage: ConversationMessage | null = null;
      let currentMessages = [...messagesBeforeRegeneration];

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
            const data = JSON.parse(line.slice(6));
            console.log('📡 SSE Message received (regenerate):', data.type, data);
            
            if (data.type === 'connected') {
              console.log('✅ SSE connected');
            } else if (data.type === 'message-update') {
            const updatedMsg = {
            ...data.message,
              timest: new Date(data.message.timest)
            };
            
            console.log('🔄 Message update - Status:', updatedMsg.status, 'Tool calls:', updatedMsg.toolCalls?.length || 0, updatedMsg);
            
            if (!assistantMessage) {
              // First update - add the message
            console.log('➕ Adding new assistant message');
            assistantMessage = updatedMsg;
            currentMessages = [...currentMessages, updatedMsg];
            } else {
            // Update existing message
              console.log('🔄 Updating existing message');
              assistantMessage = updatedMsg;
                   currentMessages = currentMessages.map(msg => 
                     msg.id === updatedMsg.id ? updatedMsg : msg
                   );
                 }
                 console.log('📝 Setting messages state, total:', currentMessages.length);
                 setMessages([...currentMessages]);
                
              } else if (data.type === 'completed') {
              console.log('✅ Message completed (regenerate)');
              const finalMsg = {
              ...data.message,
                timest: new Date(data.message.timest)
                 };
                
                if (assistantMessage) {
                  currentMessages = currentMessages.map(msg => 
                    msg.id === finalMsg.id ? finalMsg : msg
                  );
                } else {
                  currentMessages = [...currentMessages, finalMsg];
                }
                
                setMessages([...currentMessages]);
                notifyMessagesUpdate([...currentMessages]);
                
              } else if (data.type === 'error') {
                toast.error(`Edit Error: ${data.error}`);
                setIsLoading(false);
                return;
              }
            } catch (parseError) {
              console.error('Error parsing SSE data:', parseError);
            }
          }
        }
      }

    } catch (error) {
      console.error('SSE Error:', error);
      toast.error(`Failed to edit message: ${error}`);
      setMessages(messagesBeforeRegeneration);
      notifyMessagesUpdate(messagesBeforeRegeneration);
    } finally {
      setIsLoading(false);
    }
  }, [messages, notifyMessagesUpdate]);

  return {
    messages,
    isLoading,
    sendMessage,
    clearConversation,
    regenerateMessage,
    cancelToolCalls,
    editMessage
  };
}
