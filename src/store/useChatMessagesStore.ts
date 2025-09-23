import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { ConversationMessage } from '../types';
import { logger } from '../utils/logger';
// Note: SSE event handling moved to per-thread stores

export interface ChatMessagesState {
  // Display state only
  threadId: string | null;
  messages: ConversationMessage[];
  isLoading: boolean;
  loadingThreadId: string | null; // Track which thread is currently loading
  isLoadingThread: boolean;
  isStreaming: boolean;
  streamingThreadId: string | null; // Track which thread is currently streaming
  error: string | null;

  // Actions (API calls only)
  loadMessages: (threadId: string) => Promise<void>;
  clearMessages: () => void;

  // Internal state updates (only called by SSE events)
  addMessage: (message: ConversationMessage) => void;
  updateMessage: (
    messageId: string,
    updates: Partial<ConversationMessage>
  ) => void;
  removeMessage: (messageId: string) => void;
  setMessages: (messages: ConversationMessage[]) => void;
  setStreaming: (isStreaming: boolean, threadId?: string) => void;
  setLoading: (isLoading: boolean, threadId?: string) => void;
  setError: (error: string | null) => void;
}

export const useChatMessagesStore = create<ChatMessagesState>()(
  subscribeWithSelector((set, _get) => ({
    // Initial state
    threadId: null,
    messages: [],
    isLoading: false,
    loadingThreadId: null,
    isLoadingThread: false,
    isStreaming: false,
    streamingThreadId: null,
    error: null,

    // Actions
    loadMessages: async (threadId: string) => {
      set({ isLoadingThread: true, error: null, threadId });

      try {
        const response = await fetch(`/api/threads/${threadId}/messages`);

        if (!response.ok) {
          throw new Error(`Failed to load messages: ${response.status}`);
        }

        const messagesData = await response.json();

        const messages: ConversationMessage[] = messagesData.map(
          (msg: Record<string, unknown>) => ({
            ...msg,
            timestamp: new Date(msg.timestamp as string),
          })
        );

        set({
          messages,
          isLoadingThread: false,
          isStreaming: false,
          streamingThreadId: null,
        });
      } catch (error: unknown) {
        logger.error('[useChatMessagesStore] Error loading messages:', error);
        set({
          error: error instanceof Error ? error.message : 'Unknown error',
          isLoadingThread: false,
          isStreaming: false,
          streamingThreadId: null,
          messages: [],
        });
      }
    },

    clearMessages: () => {
      set({
        threadId: null,
        messages: [],
        isLoading: false,
        loadingThreadId: null,
        isLoadingThread: false,
        isStreaming: false,
        error: null,
      });
    },

    // Internal state updates (called by SSE events or UI components)
    addMessage: (message: ConversationMessage) => {
      set(state => ({
        messages: [...state.messages, message],
      }));
    },

    updateMessage: (
      messageId: string,
      updates: Partial<ConversationMessage>
    ) => {
      set(state => ({
        messages: state.messages.map(msg =>
          msg.id === messageId ? { ...msg, ...updates } : msg
        ),
      }));
    },

    removeMessage: (messageId: string) => {
      set(state => ({
        messages: state.messages.filter(msg => msg.id !== messageId),
      }));
    },

    setMessages: (messages: ConversationMessage[]) => {
      set({ messages });
    },

    setStreaming: (isStreaming: boolean, threadId?: string) => {
      set({
        isStreaming,
        streamingThreadId: isStreaming ? threadId || null : null,
      });
    },

    setLoading: (isLoading: boolean, threadId?: string) => {
      set({
        isLoading,
        loadingThreadId: isLoading ? threadId || null : null,
      });
    },

    setError: (error: string | null) => {
      set({ error });
    },
  }))
);

// Helper function to get the current thread ID
export const getCurrentThreadId = () =>
  useChatMessagesStore.getState().threadId;

// Note: SSE subscriptions are now handled per-thread in useChatThreadStore
// This global subscription is kept for backward compatibility but should not be used
