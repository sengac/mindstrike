import { useState, useEffect, useCallback } from 'react';
import { ConversationMessage } from '../types';

export function useChat() {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadConversation = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    loadConversation();
  }, [loadConversation]);

  const sendMessage = useCallback(async (content: string) => {
    setIsLoading(true);
    
    // Add user message immediately
    const userMessage: ConversationMessage = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timest: new Date()
    };
    setMessages(prev => [...prev, userMessage]);

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
        setMessages(prev => [...prev, {
          ...assistantMessage,
          timest: new Date(assistantMessage.timest)
        }]);
      } else {
        const errorData = await response.json();
        const errorMessage: ConversationMessage = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `Error: ${errorData.error}`,
          timest: new Date()
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    } catch (error) {
      const errorMessage: ConversationMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Error: Failed to send message - ${error}`,
        timest: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearConversation = useCallback(async () => {
    try {
      const response = await fetch('/api/conversation/clear', {
        method: 'POST'
      });
      if (response.ok) {
        setMessages([]);
      }
    } catch (error) {
      console.error('Failed to clear conversation:', error);
    }
  }, []);

  return {
    messages,
    isLoading,
    sendMessage,
    clearConversation
  };
}
