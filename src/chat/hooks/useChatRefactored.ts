import { useState, useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  ConversationMessage,
  ImageAttachment,
  NotesAttachment,
  ToolCall,
} from '../../types';
import { useResponseValidation } from '../../hooks/useResponseValidation';
// SSE decoder functions are no longer needed - using direct SSE event bus
import { isSSEChunkEvent, isSSEMessageEvent } from '../../types/sse-events';
import { useChatMessagesStore } from '../../store/useChatMessagesStore';
import { useThreadsStore } from '../../store/useThreadsStore';
import { sseEventBus } from '../../utils/sseEventBus';

interface UseChatProps {
  threadId?: string;
  isAgentMode?: boolean;
}

export function useChatRefactored({
  threadId,
  isAgentMode = false,
}: UseChatProps = {}) {
  const [localModelError, setLocalModelError] = useState<{
    modelId: string;
    error: string;
  } | null>(null);
  const validation = useResponseValidation();

  // Get store state and actions
  const {
    messages,
    isLoading,
    isStreaming,
    error,
    loadMessages,
    addMessage,
    updateMessage,
    setMessages,
    setStreaming,
    setError,
  } = useChatMessagesStore();

  const { activeThreadId } = useThreadsStore();
  const currentThreadId = threadId || activeThreadId;

  // Load messages when thread changes
  useEffect(() => {
    if (currentThreadId) {
      loadMessages(currentThreadId);
    }
  }, [currentThreadId]); // Remove loadMessages from deps to prevent infinite loop

  // Validate and potentially fix a message before displaying
  const validateAndProcessMessage = useCallback(
    async (message: ConversationMessage): Promise<ConversationMessage> => {
      if (message.role === 'assistant') {
        try {
          const { message: validatedMessage, hasChanges } =
            await validation.validateMessage(message);

          if (hasChanges) {
            // Message was automatically corrected
          }

          return validatedMessage;
        } catch (error) {
          console.error('Message validation failed:', error);
          return message; // Return original if validation fails
        }
      }
      return message;
    },
    [validation]
  );

  // Subscribe to unified event bus for real-time streaming events
  useEffect(() => {
    const unsubscribeContentChunk = sseEventBus.subscribe(
      'content-chunk',
      async event => {
        const data = event.data;
        if (isSSEChunkEvent(data)) {
          // Handle real-time content chunks for character-by-character streaming
          const chatStore = useChatMessagesStore.getState();
          const messages = chatStore.messages;
          const lastMessage = messages[messages.length - 1];

          if (
            lastMessage &&
            lastMessage.role === 'assistant' &&
            lastMessage.status === 'processing'
          ) {
            // Update the existing streaming message
            chatStore.updateMessage(lastMessage.id, {
              ...lastMessage,
              content: lastMessage.content + data.chunk,
            });
          }
          // Note: Do NOT create assistant messages here - server will send message-update with proper ID
        }
      }
    );

    const unsubscribeMessageUpdate = sseEventBus.subscribe(
      'message-update',
      async event => {
        const data = event.data;
        if (isSSEMessageEvent(data)) {
          // Server sends complete message with server-generated ID
          const messageData = data.message;
          const assistantMessage = {
            id: messageData.id,
            role: 'assistant' as const,
            content: messageData.content,
            timestamp: new Date(messageData.timestamp),
            status: (messageData.status || 'processing') as
              | 'processing'
              | 'completed'
              | 'cancelled',
            model: messageData.model as string | undefined,
            toolCalls: messageData.toolCalls as ToolCall[] | undefined,
            toolResults: messageData.toolResults as
              | Array<{ name: string; result: unknown }>
              | undefined,
          };

          // Check if message already exists
          const chatStore = useChatMessagesStore.getState();
          const messages = chatStore.messages;
          const existingMessage = messages.find(
            msg => msg.id === assistantMessage.id
          );

          if (existingMessage) {
            // Update existing message
            chatStore.updateMessage(assistantMessage.id, assistantMessage);
          } else {
            // Add new message (first time we see this assistant message)
            chatStore.addMessage(assistantMessage);
            // Keep streaming=true until message is completed
          }
        }
      }
    );

    const unsubscribeCompleted = sseEventBus.subscribe(
      'completed',
      async event => {
        const data = event.data;
        if (isSSEMessageEvent(data)) {
          // Final message completion
          const messageData = data.message;
          const completedMessage = {
            id: messageData.id,
            role: 'assistant' as const,
            content: messageData.content,
            timestamp: new Date(messageData.timestamp),
            status: 'completed' as const,
            model: messageData.model as string | undefined,
            toolCalls: messageData.toolCalls as ToolCall[] | undefined,
            toolResults: messageData.toolResults as
              | Array<{ name: string; result: unknown }>
              | undefined,
          };

          const chatStore = useChatMessagesStore.getState();
          chatStore.updateMessage(completedMessage.id, completedMessage);
          chatStore.setStreaming(false);
        }
      }
    );

    return () => {
      unsubscribeContentChunk();
      unsubscribeMessageUpdate();
      unsubscribeCompleted();
    };
  }, []); // Empty dependency array - event handlers access store directly

  const sendMessage = useCallback(
    async (
      content: string,
      images?: ImageAttachment[],
      notes?: NotesAttachment[]
    ) => {
      if (!currentThreadId) {
        toast.error('No active thread selected');
        return;
      }

      // Handle /clear command
      if (content.trim() === '/clear') {
        try {
          await useThreadsStore.getState().clearThread(currentThreadId);
          // Reload messages after clearing
          await loadMessages(currentThreadId);
        } catch {
          toast.error('Failed to clear conversation');
        }
        return;
      }

      setStreaming(true);
      setError(null);

      // Check if this is the first message in the thread
      const isFirstMessage = messages.length === 0;

      // Add user message to the store immediately
      const userMessage: ConversationMessage = {
        id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'user',
        content,
        timestamp: new Date(),
        images: images || [],
        notes: notes || [],
      };
      addMessage(userMessage);

      try {
        const requestBody = {
          message: content,
          messageId: userMessage.id, // Send the client-generated message ID
          threadId: currentThreadId,
          images: images || [],
          notes: notes || [],
          isAgentMode,
        };

        // Send HTTP POST - SSE event bus will handle streaming updates
        const response = await fetch('/api/message', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error || `HTTP error! status: ${response.status}`
          );
        }

        // Response contains the message - SSE will handle real-time updates
        await response.json();

        // Generate thread name for first message exchange
        if (isFirstMessage && currentThreadId) {
          try {
            const titleResponse = await fetch('/api/generate-title', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                context: `User asked: ${content.slice(0, 200)}`,
              }),
            });

            if (titleResponse.ok) {
              const result = await titleResponse.json();
              const title = result.title?.trim();
              if (title && title.length > 0) {
                await useThreadsStore
                  .getState()
                  .renameThread(currentThreadId, title);
              }
            }
          } catch (error) {
            console.error(
              '[useChatRefactored] Failed to generate thread title:',
              error
            );
          }
        }

        // Reload thread list to update message count and name
        useThreadsStore.getState().loadThreads();
      } catch (error) {
        console.error('SSE Error:', error);
        toast.error(`Failed to send message: ${error}`);
        setError(`Failed to send message: ${error}`);
        setStreaming(false); // Only set false on error
      }
    },
    [
      currentThreadId,
      messages.length,
      isAgentMode,
      addMessage,
      updateMessage,
      setStreaming,
      setError,
      loadMessages,
      validateAndProcessMessage,
    ]
  );

  const clearConversation = useCallback(async () => {
    if (!currentThreadId) return;

    try {
      await useThreadsStore.getState().clearThread(currentThreadId);
      await loadMessages(currentThreadId);
    } catch (error) {
      console.error('Failed to clear conversation:', error);
      toast.error('Failed to clear conversation');
    }
  }, [currentThreadId, loadMessages]);

  const cancelStreaming = useCallback(() => {
    setStreaming(false);
    // Find the currently streaming message and mark it as cancelled
    const streamingMessage = messages.find(
      msg => msg.role === 'assistant' && msg.status === 'processing'
    );
    if (streamingMessage) {
      updateMessage(streamingMessage.id, {
        status: 'cancelled' as const,
        content: streamingMessage.content + '\n\n[Cancelled by user]',
      });
    }
  }, [messages, updateMessage, setStreaming]);

  const clearLocalModelError = useCallback(() => {
    setLocalModelError(null);
  }, []);

  const regenerateMessage = useCallback(
    async (messageId: string) => {
      if (!currentThreadId) {
        toast.error('No active thread selected');
        return;
      }

      setStreaming(true);
      setError(null);

      // Find the message and get the previous user message to regenerate from
      const messageIndex = messages.findIndex(msg => msg.id === messageId);
      if (messageIndex === -1 || messageIndex === 0) {
        setStreaming(false);
        return;
      }

      // Find the last user message before this assistant message
      const userMessageIndex = messages
        .slice(0, messageIndex)
        .reverse()
        .findIndex(msg => msg.role === 'user');
      if (userMessageIndex === -1) {
        setStreaming(false);
        return;
      }

      const actualUserIndex = messageIndex - 1 - userMessageIndex;
      const userMessage = messages[actualUserIndex];

      // Remove the assistant message and all messages after it locally for immediate UI feedback
      const messagesBeforeRegeneration = messages.slice(0, messageIndex);
      setMessages(messagesBeforeRegeneration);

      try {
        // Send HTTP POST for regeneration - SSE will handle streaming updates
        const response = await fetch('/api/message', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: userMessage.content,
            threadId: currentThreadId,
            images: userMessage.images || [],
            notes: userMessage.notes || [],
            isAgentMode,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error || `HTTP error! status: ${response.status}`
          );
        }

        // Response contains the message - SSE will handle real-time updates
        await response.json();
      } catch (error) {
        console.error('SSE Error:', error);
        toast.error(`Failed to regenerate message: ${error}`);
        setError(`Failed to regenerate message: ${error}`);
        await loadMessages(currentThreadId); // Reload from server
      } finally {
        setStreaming(false);
      }
    },
    [
      currentThreadId,
      messages,
      isAgentMode,
      addMessage,
      updateMessage,
      setStreaming,
      setError,
      loadMessages,
      validateAndProcessMessage,
    ]
  );

  const editMessage = useCallback(
    async (messageId: string, newContent: string) => {
      if (!currentThreadId) {
        toast.error('No active thread selected');
        return;
      }

      setStreaming(true);
      setError(null);

      // Find the message to edit
      const messageIndex = messages.findIndex(msg => msg.id === messageId);
      if (messageIndex === -1) {
        setStreaming(false);
        return;
      }

      // Update the user message with new content locally
      const updatedMessages = [...messages];
      updatedMessages[messageIndex] = {
        ...updatedMessages[messageIndex],
        content: newContent,
      };

      // Remove all assistant messages after this user message
      const messagesBeforeRegeneration = updatedMessages.slice(
        0,
        messageIndex + 1
      );
      setMessages(messagesBeforeRegeneration);

      try {
        // Send HTTP POST for edit - SSE will handle streaming updates
        const response = await fetch('/api/message', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: newContent,
            threadId: currentThreadId,
            images: [],
            isAgentMode,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error || `HTTP error! status: ${response.status}`
          );
        }

        // Response contains the message - SSE will handle real-time updates
        await response.json();
      } catch (error) {
        console.error('SSE Error:', error);
        toast.error(`Failed to edit message: ${error}`);
        setError(`Failed to edit message: ${error}`);
        await loadMessages(currentThreadId); // Reload from server
      } finally {
        setStreaming(false);
      }
    },
    [
      currentThreadId,
      messages,
      isAgentMode,
      addMessage,
      updateMessage,
      setStreaming,
      setError,
      loadMessages,
      validateAndProcessMessage,
    ]
  );

  const cancelToolCalls = useCallback(
    async (messageId: string) => {
      try {
        const response = await fetch('/api/message/cancel', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ messageId, threadId: currentThreadId }),
        });

        if (response.ok) {
          // The SSE stream will send the cancelled update automatically
          // so we don't need to manually update the message here
        }
      } catch (error) {
        console.error('Failed to cancel tool calls:', error);
      }
    },
    [currentThreadId]
  );

  const retryLastMessage = useCallback(async () => {
    if (messages.length === 0) return;

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== 'user') return;

    setStreaming(true);
    setError(null);

    try {
      const requestBody = {
        message: lastMessage.content,
        threadId: currentThreadId,
        images: lastMessage.images || [],
        isAgentMode,
      };

      // Send HTTP POST for retry - SSE will handle streaming updates
      const response = await fetch('/api/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `HTTP error! status: ${response.status}`
        );
      }

      // Response contains the message - SSE will handle real-time updates
      await response.json();
    } catch (error: unknown) {
      console.error('Error retrying message:', error);
      setError(`Failed to retry message: ${error}`);
      setStreaming(false);
    }
  }, [
    messages,
    currentThreadId,
    validateAndProcessMessage,
    addMessage,
    updateMessage,
    setStreaming,
    setError,
  ]);

  return {
    messages,
    isLoading: isLoading || isStreaming,
    sendMessage,
    clearConversation,
    cancelStreaming,
    regenerateMessage,
    editMessage,
    cancelToolCalls,
    retryLastMessage,
    validation,
    localModelError,
    clearLocalModelError,
    error,
  };
}
