import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { ConversationMessage, ImageAttachment, NotesAttachment } from '../types';
import { useResponseValidation } from './useResponseValidation';

interface UseChatProps {
  threadId?: string;
  messages?: ConversationMessage[];
  onMessagesUpdate?: (messages: ConversationMessage[]) => void;
  onFirstMessage?: () => void;
}

export function useChat({ threadId, messages: initialMessages = [], onMessagesUpdate, onFirstMessage }: UseChatProps = {}) {
  const [messages, setMessages] = useState<ConversationMessage[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [localModelError, setLocalModelError] = useState<{ modelId: string; error: string } | null>(null);
  const isUpdatingFromProps = useRef(false);
  const validation = useResponseValidation();

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

  // Validate and potentially fix a message before displaying
  const validateAndProcessMessage = useCallback(async (message: ConversationMessage): Promise<ConversationMessage> => {
    if (message.role === 'assistant') {
      try {
        const { message: validatedMessage, hasChanges } = await validation.validateMessage(message);
        
        if (hasChanges) {
    
        }
        
        return validatedMessage;
      } catch (error) {
        console.error('Message validation failed:', error);
        return message; // Return original if validation fails
      }
    }
    return message;
  }, [validation]);

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
          timestamp: new Date(msg.timestamp)
        })));
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  }, [threadId]);

  useEffect(() => {
    loadConversation();
  }, [loadConversation]);

  const sendMessage = useCallback(async (content: string, images?: ImageAttachment[], notes?: NotesAttachment[]) => {
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
      timestamp: new Date(),
      images: images || [],
      notes: notes || []
    };
    let currentMessages = [...messages, userMessage];
    setMessages(currentMessages);

    try {
      const requestBody = { message: content, threadId, images: images || [], notes: notes || [] };
      
      // Use SSE for real-time updates
      const response = await fetch('/api/message/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
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
              if (data.type === 'connected') {
                // SSE connected
              } else if (data.type === 'message-update') {
                const updatedMsg = {
                ...data.message,
                timestamp: new Date(data.message.timestamp)
                };
                
                // For streaming updates, we'll validate on completion instead of every update
                // This prevents validation from running on partial content
                if (!assistantMessage) {
                // First update - add the message
                assistantMessage = updatedMsg;
                currentMessages = [...currentMessages, updatedMsg];
                } else {
                // Update existing message
                  assistantMessage = updatedMsg;
                  currentMessages = currentMessages.map(msg => 
                   msg.id === updatedMsg.id ? updatedMsg : msg
                 );
                }
                setMessages([...currentMessages]);
                
                } else if (data.type === 'completed') {
              const finalMsg = {
              ...data.message,
                timestamp: new Date(data.message.timestamp)
                 };
                
                // Validate final message
                const validatedFinalMsg = await validateAndProcessMessage(finalMsg);
                
                if (assistantMessage) {
                  currentMessages = currentMessages.map(msg => 
                    msg.id === validatedFinalMsg.id ? validatedFinalMsg : msg
                  );
                } else {
                  currentMessages = [...currentMessages, validatedFinalMsg];
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
              } else if (data.type === 'local-model-not-loaded') {
                // Set the error to trigger the dialog which will auto-load the model
                setLocalModelError({
                  modelId: data.modelId,
                  error: data.error
                });
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
          timestamp: new Date(assistantMessage.timestamp)
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
        body: JSON.stringify({ message: newContent, threadId, images: [] })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
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
            if (data.type === 'connected') {
              // SSE connected
            } else if (data.type === 'message-update') {
            const updatedMsg = {
            ...data.message,
              timestamp: new Date(data.message.timestamp)
            };
            
            // Validate message before adding/updating
            const validatedMsg = await validateAndProcessMessage(updatedMsg);
            
            if (!assistantMessage) {
              // First update - add the message
            assistantMessage = validatedMsg;
            currentMessages = [...currentMessages, validatedMsg];
            } else {
            // Update existing message
              assistantMessage = validatedMsg;
                   currentMessages = currentMessages.map(msg => 
                     msg.id === validatedMsg.id ? validatedMsg : msg
                   );
                 }
                 setMessages([...currentMessages]);
                
              } else if (data.type === 'completed') {

              const finalMsg = {
              ...data.message,
                timestamp: new Date(data.message.timestamp)
                 };
                
                // Validate final message
                const validatedFinalMsg = await validateAndProcessMessage(finalMsg);
                
                if (assistantMessage) {
                  currentMessages = currentMessages.map(msg => 
                    msg.id === validatedFinalMsg.id ? validatedFinalMsg : msg
                  );
                } else {
                  currentMessages = [...currentMessages, validatedFinalMsg];
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

  const clearLocalModelError = useCallback(() => {
    setLocalModelError(null);
  }, []);

  const retryLastMessage = useCallback(async () => {
    if (messages.length === 0) return;
    
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== 'user') return;
    
    setIsLoading(true);
    
    try {
      const requestBody = { message: lastMessage.content, threadId, images: lastMessage.images || [] };
      
      // Use SSE for real-time updates
      const response = await fetch('/api/message/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let currentMessages = [...messages];
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
              
              if (data.type === 'message-update') {
                const updatedMessage = {
                  ...data.message,
                  timestamp: new Date(data.message.timestamp)
                };
                
                const validatedMessage = await validateAndProcessMessage(updatedMessage);
                
                if (assistantMessage) {
                  currentMessages = currentMessages.map(msg => 
                    msg.id === validatedMessage.id ? validatedMessage : msg
                  );
                } else {
                  assistantMessage = validatedMessage;
                  currentMessages = [...currentMessages, validatedMessage];
                }
                setMessages([...currentMessages]);
                
              } else if (data.type === 'completed') {
                const finalMsg = {
                  ...data.message,
                  timestamp: new Date(data.message.timestamp)
                };
                
                const validatedFinalMsg = await validateAndProcessMessage(finalMsg);
                
                if (assistantMessage) {
                  currentMessages = currentMessages.map(msg => 
                    msg.id === validatedFinalMsg.id ? validatedFinalMsg : msg
                  );
                } else {
                  currentMessages = [...currentMessages, validatedFinalMsg];
                }
                
                setMessages([...currentMessages]);
                setIsLoading(false);
                
              } else if (data.type === 'error') {
                throw new Error(data.error);
              } else if (data.type === 'local-model-not-loaded') {
                setLocalModelError({
                  modelId: data.modelId,
                  error: data.error
                });
                setIsLoading(false);
                return;
              }
            } catch (parseError) {
              console.error('Error parsing SSE data:', parseError);
            }
          }
        }
      }
    } catch (error: any) {
      console.error('Error retrying message:', error);
      setIsLoading(false);
    }
  }, [messages, threadId, validateAndProcessMessage]);

  return {
    messages,
    isLoading,
    sendMessage,
    clearConversation,
    regenerateMessage,
    cancelToolCalls,
    editMessage,
    validation,
    localModelError,
    clearLocalModelError,
    retryLastMessage
  };
}
