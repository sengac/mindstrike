import { useState, useCallback, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import type {
  ConversationMessage,
  ImageAttachment,
  NotesAttachment,
  ToolCall,
} from '../../types';
import { useResponseValidation } from '../../hooks/useResponseValidation';
// SSE decoder functions are no longer needed - using direct SSE event bus
import { isSSEChunkEvent, isSSEMessageEvent } from '../../types/sseEvents';
import { useChatThreadStore } from '../../store/useChatThreadStore';
import { useThreadsStore } from '../../store/useThreadsStore';
import { sseEventBus } from '../../utils/sseEventBus';
import { logger } from '../../utils/logger';

interface UseChatProps {
  threadId?: string;
  isAgentMode?: boolean;
}

export function useChat({ threadId, isAgentMode = false }: UseChatProps = {}) {
  const [localModelError, setLocalModelError] = useState<{
    modelId: string;
    error: string;
  } | null>(null);
  const validation = useResponseValidation();

  // Track if the next completed message should trigger thread name generation
  const pendingTitleGeneration = useRef<{
    threadId: string;
    userContent: string;
  } | null>(null);

  const { activeThreadId } = useThreadsStore();
  const currentThreadId = threadId ?? activeThreadId;

  // Get per-thread store state and actions
  // Always use a valid threadId to avoid conditional hook calls
  const safeThreadId = currentThreadId ?? 'fallback';
  const threadStore = useChatThreadStore(safeThreadId);
  const storeState = threadStore();

  // Use the store state if we have a valid thread, otherwise provide defaults
  const {
    messages,
    isLoading,
    isLoadingThread,
    error,
    loadMessages,
    addMessage,
    updateMessage,
    setMessages,
    setError,
  } = currentThreadId
    ? storeState
    : {
        messages: [],
        isLoading: false,
        isLoadingThread: false,
        error: null,
        loadMessages: async () => {},
        addMessage: () => {},
        updateMessage: () => {},
        setMessages: () => {},
        setError: () => {},
      };

  // Derive streaming state from actual message status instead of global state
  const isStreaming = messages.some(
    msg => msg.role === 'assistant' && msg.status === 'processing'
  );

  // Load messages when thread changes
  useEffect(() => {
    if (currentThreadId) {
      loadMessages().catch(error => {
        logger.error('[useChat] Failed to load messages:', error);
      });
    }
  }, [currentThreadId, loadMessages]); // Include loadMessages for proper dependency tracking

  // Subscribe to unified event bus for real-time streaming events
  useEffect(() => {
    if (!currentThreadId) {
      return;
    }

    const subscriptionThreadId = currentThreadId; // Capture thread ID at subscription time

    const unsubscribeContentChunk = sseEventBus.subscribe(
      'content-chunk',
      event => {
        // Double-check that we're still on the same thread
        if (subscriptionThreadId !== currentThreadId) {
          return;
        }
        const data = event.data;
        if (isSSEChunkEvent(data)) {
          // Only process if this is for the currently selected thread
          if (event.threadId && event.threadId !== currentThreadId) {
            return;
          }

          // Handle real-time content chunks for character-by-character streaming
          if (!currentThreadId) {
            return;
          }
          const chatStore = threadStore.getState();

          // Clear loading state when streaming starts (first chunk received)
          chatStore.setLoading(false);

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
      event => {
        // Double-check that we're still on the same thread
        if (subscriptionThreadId !== currentThreadId) {
          return;
        }
        const data = event.data;
        if (isSSEMessageEvent(data)) {
          // Only process if this is for the currently selected thread
          if (event.threadId && event.threadId !== currentThreadId) {
            return;
          }

          // Server sends complete message with server-generated ID
          const messageData = data.message;
          const assistantMessage = {
            id: messageData.id,
            role: 'assistant' as const,
            content: messageData.content,
            timestamp: new Date(messageData.timestamp),
            status: (messageData.status ?? 'processing') as
              | 'processing'
              | 'completed'
              | 'cancelled',
            model: messageData.model as string | undefined,
            toolCalls: messageData.toolCalls as ToolCall[] | undefined,
            toolResults: messageData.toolResults as
              | Array<{ name: string; result: unknown }>
              | undefined,
            citations: messageData.citations as string[] | undefined,
            medianTokensPerSecond: messageData.medianTokensPerSecond as
              | number
              | undefined,
            totalTokens: messageData.totalTokens as number | undefined,
          };

          // Check if message already exists
          if (!currentThreadId) {
            return;
          }
          const chatStore = threadStore.getState();
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
            // Clear loading state when streaming begins
            chatStore.setLoading(false);
          }
        }
      }
    );

    const unsubscribeCompleted = sseEventBus.subscribe('completed', event => {
      const data = event.data;
      if (isSSEMessageEvent(data)) {
        // Only process if this is for the currently selected thread
        if (event.threadId && event.threadId !== currentThreadId) {
          return;
        }

        // Final message completion with token metrics
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
          citations: messageData.citations as string[] | undefined,
          medianTokensPerSecond: messageData.medianTokensPerSecond as
            | number
            | undefined,
          totalTokens: messageData.totalTokens as number | undefined,
        };

        if (!currentThreadId) {
          return;
        }
        const chatStore = threadStore.getState();
        chatStore.updateMessage(completedMessage.id, completedMessage);

        // Generate thread title if this was the first message exchange
        if (pendingTitleGeneration.current) {
          const { threadId: titleThreadId, userContent } =
            pendingTitleGeneration.current;
          pendingTitleGeneration.current = null; // Clear the pending state

          // Wrap async code in IIFE to avoid making the event handler async
          (async () => {
            try {
              const titleResponse = await fetch('/api/generate-title', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  context: `User asked: ${userContent}`,
                }),
              });

              if (titleResponse.ok) {
                const result = (await titleResponse.json()) as {
                  title?: string;
                };
                const title = result.title?.trim();
                if (title && title.length > 0) {
                  await useThreadsStore
                    .getState()
                    .renameThread(titleThreadId, title);
                  // Reload thread list to update the displayed name
                  useThreadsStore
                    .getState()
                    .loadThreads()
                    .catch(error => {
                      logger.error(
                        '[useChat] Failed to reload threads after title generation:',
                        error
                      );
                    });
                }
              }
            } catch (error) {
              logger.error('[useChat] Failed to generate thread title:', error);
            }
          })().catch(error => {
            logger.error('[useChat] Failed to generate thread title:', error);
          });
        }
      }
    });

    const unsubscribeCancelled = sseEventBus.subscribe('cancelled', event => {
      const data = event.data;
      // Only process if this is for the currently selected thread
      if (event.threadId && event.threadId !== currentThreadId) {
        return;
      }

      // Update message status to cancelled
      if (data && typeof data === 'object' && 'messageId' in data) {
        const messageId = data.messageId as string;
        if (!currentThreadId) {
          return;
        }
        const chatStore = threadStore.getState();
        const message = chatStore.messages.find(m => m.id === messageId);
        if (message) {
          chatStore.updateMessage(messageId, { status: 'cancelled' });
        }
      }
    });

    const unsubscribeMessagesDeleted = sseEventBus.subscribe(
      'messages-deleted',
      event => {
        const data = event.data;
        if (data && typeof data === 'object' && 'messageIds' in data) {
          const messageIds = data.messageIds as string[];
          if (!currentThreadId) {
            return;
          }
          const chatStore = threadStore.getState();

          // Remove all deleted messages from the store
          messageIds.forEach(messageId => {
            chatStore.removeMessage(messageId);
          });
        }
      }
    );

    return () => {
      unsubscribeContentChunk();
      unsubscribeMessageUpdate();
      unsubscribeCompleted();
      unsubscribeCancelled();
      unsubscribeMessagesDeleted();
    };
  }, [currentThreadId, threadStore]); // Re-subscribe when currentThreadId changes

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
          await loadMessages();
        } catch {
          toast.error('Failed to clear conversation');
        }
        return;
      }

      setError(null);

      // Set loading state when sending message
      if (currentThreadId) {
        const chatStore = threadStore.getState();
        chatStore.setLoading(true);
      }

      // Check if this is the first message in the thread
      const isFirstMessage = messages.length === 0;

      // Track if we need to generate a title after completion
      if (isFirstMessage) {
        pendingTitleGeneration.current = {
          threadId: currentThreadId,
          userContent: content.slice(0, 200),
        };
      }

      // Add user message to the store immediately
      const userMessage: ConversationMessage = {
        id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'user',
        content,
        timestamp: new Date(),
        images: images ?? [],
        notes: notes ?? [],
      };
      addMessage(userMessage);

      try {
        const requestBody = {
          message: content,
          messageId: userMessage.id, // Send the client-generated message ID
          threadId: currentThreadId,
          images: images ?? [],
          notes: notes ?? [],
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
          const errorData = (await response
            .json()
            .catch(() => ({}) as { error?: string })) as { error?: string };
          throw new Error(
            errorData.error ?? `HTTP error! status: ${response.status}`
          );
        }

        // Response contains the message - SSE will handle real-time updates
        await response.json();

        // Reload thread list to update message count and name
        useThreadsStore
          .getState()
          .loadThreads()
          .catch(error => {
            logger.error(
              '[useChat] Failed to reload threads after message:',
              error
            );
          });
      } catch (error) {
        logger.error('SSE Error:', error);
        toast.error(`Failed to send message: ${error}`);
        setError(`Failed to send message: ${error}`);
        // Clear loading state on error
        if (currentThreadId) {
          const chatStore = threadStore.getState();
          chatStore.setLoading(false);
        }
      }
    },
    [
      currentThreadId,
      messages.length,
      isAgentMode,
      addMessage,
      setError,
      loadMessages,
      threadStore,
    ]
  );

  const clearConversation = useCallback(async () => {
    if (!currentThreadId) {
      return;
    }

    try {
      await useThreadsStore.getState().clearThread(currentThreadId);
      await loadMessages();
    } catch (error) {
      logger.error('Failed to clear conversation:', error);
      toast.error('Failed to clear conversation');
    }
  }, [currentThreadId, loadMessages]);

  const cancelStreaming = useCallback(async () => {
    // Find the currently streaming message
    const streamingMessage = messages.find(
      msg => msg.role === 'assistant' && msg.status === 'processing'
    );
    if (streamingMessage && currentThreadId) {
      // Call the server cancel endpoint
      try {
        const response = await fetch('/api/message/cancel', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messageId: streamingMessage.id,
            threadId: currentThreadId,
          }),
        });

        if (response.ok) {
          // The SSE stream will send the cancelled update automatically
          // so we don't need to manually update the message here
        } else {
          // Fallback to local cancellation if server call fails
          updateMessage(streamingMessage.id, {
            status: 'cancelled' as const,
            content: streamingMessage.content + '\n\n[Cancelled by user]',
          });
        }
      } catch (error) {
        logger.error('Failed to cancel streaming:', error);
        // Fallback to local cancellation
        updateMessage(streamingMessage.id, {
          status: 'cancelled' as const,
          content: streamingMessage.content + '\n\n[Cancelled by user]',
        });
      }
    }
  }, [messages, updateMessage, currentThreadId]);

  const clearLocalModelError = useCallback(() => {
    setLocalModelError(null);
  }, []);

  const regenerateMessage = useCallback(
    async (messageId: string) => {
      if (!currentThreadId) {
        toast.error('No active thread selected');
        return;
      }

      setError(null);

      // Set loading state when regenerating message
      if (currentThreadId) {
        const chatStore = threadStore.getState();
        chatStore.setLoading(true);
      }

      // Find the message and get the previous user message to regenerate from
      const messageIndex = messages.findIndex(msg => msg.id === messageId);
      if (messageIndex === -1 || messageIndex === 0) {
        return;
      }

      // Find the last user message before this assistant message
      const userMessageIndex = messages
        .slice(0, messageIndex)
        .reverse()
        .findIndex(msg => msg.role === 'user');
      if (userMessageIndex === -1) {
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
            images: userMessage.images ?? [],
            notes: userMessage.notes ?? [],
            isAgentMode,
          }),
        });

        if (!response.ok) {
          const errorData = (await response
            .json()
            .catch(() => ({}) as { error?: string })) as { error?: string };
          throw new Error(
            errorData.error ?? `HTTP error! status: ${response.status}`
          );
        }

        // Response contains the message - SSE will handle real-time updates
        await response.json();
      } catch (error) {
        logger.error('SSE Error:', error);
        toast.error(`Failed to regenerate message: ${error}`);
        setError(`Failed to regenerate message: ${error}`);
        // Clear loading state on error
        if (currentThreadId) {
          const chatStore = threadStore.getState();
          chatStore.setLoading(false);
        }
        await loadMessages(); // Reload from server
      }
    },
    [
      currentThreadId,
      messages,
      isAgentMode,
      setError,
      loadMessages,
      setMessages,
      threadStore,
    ]
  );

  const editMessage = useCallback(
    async (messageId: string, newContent: string) => {
      if (!currentThreadId) {
        toast.error('No active thread selected');
        return;
      }

      setError(null);

      // Find the message to edit
      const messageIndex = messages.findIndex(msg => msg.id === messageId);
      if (messageIndex === -1) {
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
          const errorData = (await response
            .json()
            .catch(() => ({}) as { error?: string })) as { error?: string };
          throw new Error(
            errorData.error ?? `HTTP error! status: ${response.status}`
          );
        }

        // Response contains the message - SSE will handle real-time updates
        await response.json();
      } catch (error) {
        logger.error('SSE Error:', error);
        toast.error(`Failed to edit message: ${error}`);
        setError(`Failed to edit message: ${error}`);
        await loadMessages(); // Reload from server
      } finally {
        // Streaming state is derived from message status
      }
    },
    [
      currentThreadId,
      messages,
      isAgentMode,
      setError,
      loadMessages,
      setMessages,
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
        logger.error('Failed to cancel tool calls:', error);
      }
    },
    [currentThreadId]
  );

  const retryLastMessage = useCallback(async () => {
    if (messages.length === 0) {
      return;
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== 'user') {
      return;
    }

    setError(null);

    try {
      const requestBody = {
        message: lastMessage.content,
        threadId: currentThreadId,
        images: lastMessage.images ?? [],
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
        const errorData = (await response
          .json()
          .catch(() => ({}) as { error?: string })) as { error?: string };
        throw new Error(
          errorData.error ?? `HTTP error! status: ${response.status}`
        );
      }

      // Response contains the message - SSE will handle real-time updates
      await response.json();
    } catch (error: unknown) {
      logger.error('Error retrying message:', error);
      setError(`Failed to retry message: ${error}`);
      // Streaming state is derived from message status
    }
  }, [messages, currentThreadId, setError, isAgentMode]);

  return {
    messages,
    isLoading: isLoading || isStreaming,
    isLoadingThread,
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
