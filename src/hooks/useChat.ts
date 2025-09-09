import { useState, useEffect, useCallback, useRef } from 'react';
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
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);

    try {
      const response = await fetch('/api/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: content })
      });

      if (response.ok) {
        const assistantMessage = await response.json();
        const assistantMsg = {
          ...assistantMessage,
          timest: new Date(assistantMessage.timest)
        };
        const finalMessages = [...newMessages, assistantMsg];
        setMessages(finalMessages);
        notifyMessagesUpdate(finalMessages);
        
        // Trigger first message callback if this was the first exchange
        if (isFirstMessage && onFirstMessage) {
          onFirstMessage();
        }
      } else {
        const errorData = await response.json();
        const errorMessage: ConversationMessage = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `Error: ${errorData.error}`,
          timest: new Date()
        };
        const errorMessages = [...newMessages, errorMessage];
        setMessages(errorMessages);
        notifyMessagesUpdate(errorMessages);
      }
    } catch (error) {
      const errorMessage: ConversationMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Error: Failed to send message - ${error}`,
        timest: new Date()
      };
      const errorMessages = [...newMessages, errorMessage];
      setMessages(errorMessages);
      notifyMessagesUpdate(errorMessages);
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

  return {
    messages,
    isLoading,
    sendMessage,
    clearConversation
  };
}
