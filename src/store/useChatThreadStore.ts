import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { ConversationMessage } from '../types';

export interface ChatThreadState {
  // Thread identification
  threadId: string;

  // Core message state
  messages: ConversationMessage[];

  // Loading states
  isLoading: boolean;
  isLoadingThread: boolean;
  isStreaming: boolean;
  error: string | null;

  // Actions
  loadMessages: () => Promise<void>;
  clearMessages: () => void;

  // Internal state updates (called by SSE events or UI components)
  addMessage: (message: ConversationMessage) => void;
  updateMessage: (
    messageId: string,
    updates: Partial<ConversationMessage>
  ) => void;
  removeMessage: (messageId: string) => void;
  setMessages: (messages: ConversationMessage[]) => void;
  setStreaming: (isStreaming: boolean) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
}

// Store factory for per-thread chat stores
const createChatThreadStore = (threadId: string) =>
  create<ChatThreadState>()(
    subscribeWithSelector(set => ({
      // Initial state
      threadId,
      messages: [],
      isLoading: false,
      isLoadingThread: false,
      isStreaming: false,
      error: null,

      // Actions
      loadMessages: async () => {
        set({ isLoadingThread: true, error: null });

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
          });
        } catch (error: unknown) {
          console.error(
            `[useChatThreadStore:${threadId}] Error loading messages:`,
            error
          );
          set({
            error: error instanceof Error ? error.message : 'Unknown error',
            isLoadingThread: false,
            isStreaming: false,
            messages: [],
          });
        }
      },

      clearMessages: () => {
        set({
          messages: [],
          isLoading: false,
          isLoadingThread: false,
          isStreaming: false,
          error: null,
        });
      },

      // Internal state updates
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

      setStreaming: (isStreaming: boolean) => {
        set({ isStreaming });
      },

      setLoading: (isLoading: boolean) => {
        set({ isLoading });
      },

      setError: (error: string | null) => {
        set({ error });
      },
    }))
  );

// Global registry of thread stores
const chatThreadStores = new Map<
  string,
  ReturnType<typeof createChatThreadStore>
>();

export const useChatThreadStore = (threadId: string) => {
  if (!chatThreadStores.has(threadId)) {
    chatThreadStores.set(threadId, createChatThreadStore(threadId));
  }
  return chatThreadStores.get(threadId)!;
};

// Utility function to get store without React hook
export const getChatThreadStore = (threadId: string) => {
  if (!chatThreadStores.has(threadId)) {
    chatThreadStores.set(threadId, createChatThreadStore(threadId));
  }
  return chatThreadStores.get(threadId)!;
};

// Clean up stores when threads are removed
export const removeChatThreadStore = (threadId: string) => {
  const store = chatThreadStores.get(threadId);
  if (store) {
    // Clean up any resources if needed
    chatThreadStores.delete(threadId);
  }
};

// Get all active thread IDs
export const getActiveChatThreadIds = () => Array.from(chatThreadStores.keys());
