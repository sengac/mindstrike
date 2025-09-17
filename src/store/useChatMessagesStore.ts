import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { ConversationMessage } from '../types';
import { sseEventBus } from '../utils/sseEventBus';

export interface ChatMessagesState {
  // Display state only
  threadId: string | null;
  messages: ConversationMessage[];
  isLoading: boolean;
  isStreaming: boolean;
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
  setStreaming: (isStreaming: boolean) => void;
  setError: (error: string | null) => void;
}

export const useChatMessagesStore = create<ChatMessagesState>()(
  subscribeWithSelector((set, _get) => ({
    // Initial state
    threadId: null,
    messages: [],
    isLoading: false,
    isStreaming: false,
    error: null,

    // Actions
    loadMessages: async (threadId: string) => {
      set({ isLoading: true, error: null, threadId });

      try {
        const response = await fetch(`/api/threads/${threadId}/messages`);

        if (!response.ok) {
          throw new Error(`Failed to load messages: ${response.status}`);
        }

        const messagesData = await response.json();

        const messages: ConversationMessage[] = messagesData.map(
          (msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp),
          })
        );

        set({ messages, isLoading: false, isStreaming: false });
      } catch (error: any) {
        console.error('[useChatMessagesStore] Error loading messages:', error);
        set({
          error: error.message,
          isLoading: false,
          isStreaming: false,
          messages: [],
        });
      }
    },

    clearMessages: () => {
      set({
        threadId: null,
        messages: [],
        isLoading: false,
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

    setStreaming: (isStreaming: boolean) => {
      set({ isStreaming });
    },

    setError: (error: string | null) => {
      set({ error });
    },
  }))
);

// Helper function to get the current thread ID
export const getCurrentThreadId = () =>
  useChatMessagesStore.getState().threadId;

// Initialize message events subscription on module load
let unsubscribeMessageEvents: (() => void) | null = null;

// Subscribe to message events through the unified event bus
function initializeMessageEventsSubscription(): void {
if (unsubscribeMessageEvents) {
  return; // Already subscribed
  }

  console.log('[useChatMessagesStore] Subscribing to message events via SSE event bus');
  
  unsubscribeMessageEvents = sseEventBus.subscribe('messages-deleted', (event) => {
    console.log('[useChatMessagesStore] Processing messages-deleted:', event.data.messageIds);
    
    // Update the chat messages store directly
    const store = useChatMessagesStore.getState();
    store.setMessages(
      store.messages.filter(msg => !event.data.messageIds.includes(msg.id))
    );
  });
}

// Auto-initialize subscription when module loads
if (typeof window !== 'undefined') {
  // Small delay to ensure the event bus is ready
  setTimeout(initializeMessageEventsSubscription, 100);
}
