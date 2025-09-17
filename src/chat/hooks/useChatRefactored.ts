import { useState, useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  ConversationMessage,
  ImageAttachment,
  NotesAttachment,
} from '../../types';
import { useResponseValidation } from '../../hooks/useResponseValidation';
import {
  decodeSseEventData,
  isSseCompletedData,
  isSseLocalModelNotLoadedData,
  isSseMessageUpdateData,
  isSseContentChunkData,
} from '../../utils/sseDecoder';
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
    const unsubscribeContentChunk = sseEventBus.subscribe('content-chunk', async (event) => {
      const data = event.data;
      if (data && data.chunk) {
        // Handle real-time content chunks for character-by-character streaming
        const chatStore = useChatMessagesStore.getState();
        const messages = chatStore.messages;
        const lastMessage = messages[messages.length - 1];
        
        if (lastMessage && lastMessage.role === 'assistant' && lastMessage.status === 'processing') {
          // Update the existing streaming message
          chatStore.updateMessage(lastMessage.id, {
            ...lastMessage,
            content: lastMessage.content + data.chunk,
          });
        }
        // Note: Do NOT create assistant messages here - server will send message-update with proper ID
      }
    });

    const unsubscribeMessageUpdate = sseEventBus.subscribe('message-update', async (event) => {
      const data = event.data;
      if (data && data.message) {
        console.log('[CHAT DEBUG] message-update event received:', data.message.status);
        // Server sends complete message with server-generated ID
        const messageData = data.message;
        const assistantMessage = {
          id: messageData.id,
          role: 'assistant' as const,
          content: messageData.content,
          timestamp: new Date(messageData.timestamp),
          status: (messageData.status || 'processing') as 'processing' | 'completed' | 'cancelled',
          model: messageData.model,
          toolCalls: messageData.toolCalls,
          toolResults: messageData.toolResults,
        };
        
        // Check if message already exists
        const chatStore = useChatMessagesStore.getState();
        const messages = chatStore.messages;
        const existingMessage = messages.find(msg => msg.id === assistantMessage.id);
        
        if (existingMessage) {
          // Update existing message
          chatStore.updateMessage(assistantMessage.id, assistantMessage);
        } else {
          // Add new message (first time we see this assistant message)
          console.log('[CHAT DEBUG] Adding new assistant message, keeping streaming=true');
          chatStore.addMessage(assistantMessage);
          // Keep streaming=true until message is completed
        }
      }
    });

    const unsubscribeCompleted = sseEventBus.subscribe('completed', async (event) => {
      const data = event.data;
      if (data && data.message) {
        console.log('[CHAT DEBUG] completed event received, setting streaming=false');
        // Final message completion
        const messageData = data.message;
        const completedMessage = {
          id: messageData.id,
          role: 'assistant' as const,
          content: messageData.content,
          timestamp: new Date(messageData.timestamp),
          status: 'completed' as const,
          model: messageData.model,
          toolCalls: messageData.toolCalls,
          toolResults: messageData.toolResults,
        };
        
        const chatStore = useChatMessagesStore.getState();
        chatStore.updateMessage(completedMessage.id, completedMessage);
        chatStore.setStreaming(false);
      }
    });

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

      console.log('[CHAT DEBUG] Setting streaming=true');
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

        // Start the streaming request - unified event bus will handle all streaming
        const response = await fetch('/api/message/stream', {
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

        // Just consume the response - the unified event bus handles streaming
        await response.text();

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
        // Use SSE for real-time streaming regeneration
        const response = await fetch('/api/message/stream', {
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

        // Process SSE stream similar to sendMessage
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
                const decodedData = await decodeSseEventData(data);

                if (decodedData.type === 'connected') {
                  // SSE connected
                } else if (decodedData.type === 'content-chunk') {
                  if (!assistantMessage) {
                    assistantMessage = {
                      id: Date.now().toString(),
                      role: 'assistant' as const,
                      content: decodedData.chunk || '',
                      timestamp: new Date(),
                      status: 'processing' as const,
                      model: 'Streaming...',
                    };
                    addMessage(assistantMessage);
                    setStreaming(false);
                  } else {
                    updateMessage(assistantMessage.id, {
                      content:
                        assistantMessage.content + (decodedData.chunk || ''),
                    });
                    assistantMessage.content += decodedData.chunk || '';
                  }
                } else if (decodedData.type === 'message-update') {
                  const message = decodedData.message as ConversationMessage;
                  const updatedMsg = {
                    ...message,
                    timestamp: new Date(message.timestamp),
                  };

                  if (!assistantMessage) {
                    assistantMessage = updatedMsg;
                    addMessage(updatedMsg);
                  } else {
                    assistantMessage = updatedMsg;
                    updateMessage(updatedMsg.id, updatedMsg);
                  }
                } else if (
                  decodedData.type === 'completed' &&
                  isSseCompletedData(decodedData)
                ) {
                  const finalMsg = {
                    ...decodedData.message,
                    timestamp: new Date(decodedData.message.timestamp),
                  } as ConversationMessage;

                  const validatedFinalMsg =
                    await validateAndProcessMessage(finalMsg);

                  if (assistantMessage) {
                    updateMessage(validatedFinalMsg.id, validatedFinalMsg);
                  } else {
                    addMessage(validatedFinalMsg);
                  }

                  setStreaming(false);
                  useThreadsStore.getState().loadThreads();
                } else if (decodedData.type === 'error') {
                  toast.error(
                    `Regenerate Error: ${decodedData.error || 'Unknown error'}`
                  );
                  setStreaming(false);
                  return;
                } else if (
                  decodedData.type === 'local-model-not-loaded' &&
                  isSseLocalModelNotLoadedData(decodedData)
                ) {
                  setLocalModelError({
                    modelId: decodedData.modelId,
                    error: decodedData.error,
                  });
                  setStreaming(false);
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
        // Use SSE for real-time updates
        const response = await fetch('/api/message/stream', {
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

        // Process SSE stream similar to sendMessage
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
                const decodedData = await decodeSseEventData(data);

                if (decodedData.type === 'connected') {
                  // SSE connected
                } else if (
                  decodedData.type === 'content-chunk' &&
                  isSseContentChunkData(decodedData)
                ) {
                  const chunk = decodedData.chunk || decodedData.content || '';
                  if (!assistantMessage) {
                    assistantMessage = {
                      id: Date.now().toString(),
                      role: 'assistant' as const,
                      content: chunk,
                      timestamp: new Date(),
                      status: 'processing' as const,
                      model: 'Streaming...',
                    };
                    addMessage(assistantMessage);
                    setStreaming(false);
                  } else {
                    updateMessage(assistantMessage.id, {
                      content: assistantMessage.content + chunk,
                    });
                    assistantMessage.content += chunk;
                  }
                } else if (
                  decodedData.type === 'message-update' &&
                  isSseMessageUpdateData(decodedData)
                ) {
                  const updatedMsg = {
                    ...decodedData.message,
                    timestamp: new Date(decodedData.message.timestamp),
                  } as ConversationMessage;

                  if (!assistantMessage) {
                    assistantMessage = updatedMsg;
                    addMessage(updatedMsg);
                  } else {
                    assistantMessage = updatedMsg;
                    updateMessage(updatedMsg.id, updatedMsg);
                  }
                } else if (
                  decodedData.type === 'completed' &&
                  isSseCompletedData(decodedData)
                ) {
                  const finalMsg = {
                    ...decodedData.message,
                    timestamp: new Date(decodedData.message.timestamp),
                  } as ConversationMessage;

                  const validatedFinalMsg =
                    await validateAndProcessMessage(finalMsg);

                  if (assistantMessage) {
                    updateMessage(validatedFinalMsg.id, validatedFinalMsg);
                  } else {
                    addMessage(validatedFinalMsg);
                  }

                  setStreaming(false);
                  useThreadsStore.getState().loadThreads();
                } else if (decodedData.type === 'error') {
                  toast.error(
                    `Edit Error: ${decodedData.error || 'Unknown error'}`
                  );
                  setStreaming(false);
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

      // Use SSE for real-time updates
      const response = await fetch('/api/message/stream', {
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

      // Process SSE stream similar to sendMessage
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Failed to get response reader');
      }
      const decoder = new TextDecoder();
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
              const decodedData = await decodeSseEventData(data);

              if (
                decodedData.type === 'content-chunk' &&
                isSseContentChunkData(decodedData)
              ) {
                const chunk = decodedData.chunk || decodedData.content || '';
                if (!assistantMessage) {
                  assistantMessage = {
                    id: Date.now().toString(),
                    role: 'assistant' as const,
                    content: chunk,
                    timestamp: new Date(),
                    status: 'processing' as const,
                    model: 'Streaming...',
                  };
                  addMessage(assistantMessage);
                  setStreaming(false);
                } else {
                  updateMessage(assistantMessage.id, {
                    content: assistantMessage.content + chunk,
                  });
                  assistantMessage.content += chunk;
                }
              } else if (
                decodedData.type === 'message-update' &&
                isSseMessageUpdateData(decodedData)
              ) {
                const updatedMessage = {
                  ...decodedData.message,
                  timestamp: new Date(decodedData.message.timestamp),
                } as ConversationMessage;

                const validatedMessage =
                  await validateAndProcessMessage(updatedMessage);

                if (assistantMessage) {
                  updateMessage(validatedMessage.id, validatedMessage);
                } else {
                  assistantMessage = validatedMessage;
                  addMessage(validatedMessage);
                }
              } else if (
                decodedData.type === 'completed' &&
                isSseCompletedData(decodedData)
              ) {
                const finalMsg = {
                  ...decodedData.message,
                  timestamp: new Date(decodedData.message.timestamp),
                } as ConversationMessage;

                const validatedFinalMsg =
                  await validateAndProcessMessage(finalMsg);

                if (assistantMessage) {
                  updateMessage(validatedFinalMsg.id, validatedFinalMsg);
                } else {
                  addMessage(validatedFinalMsg);
                }

                setStreaming(false);
              } else if (decodedData.type === 'error') {
                throw new Error(decodedData.error || 'Unknown error');
              } else if (
                decodedData.type === 'local-model-not-loaded' &&
                isSseLocalModelNotLoadedData(decodedData)
              ) {
                setLocalModelError({
                  modelId: decodedData.modelId,
                  error: decodedData.error,
                });
                setStreaming(false);
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
