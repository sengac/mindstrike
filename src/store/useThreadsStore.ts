import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export interface ThreadMetadata {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  customRole?: string;
  [key: string]: unknown; // Allow additional properties for ListItem compatibility
}

export interface ThreadsState {
  // Display state only
  threads: ThreadMetadata[];
  activeThreadId: string | null;
  isLoaded: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions (API calls only)
  loadThreads: () => Promise<void>;
  createThread: (name?: string) => Promise<string>;
  selectThread: (threadId: string) => void;
  deleteThread: (threadId: string) => Promise<void>;
  renameThread: (threadId: string, newName: string) => Promise<void>;
  updateThreadRole: (threadId: string, customRole?: string) => Promise<void>;
  clearThread: (threadId: string) => Promise<void>;

  // Internal state updates
  setThreads: (threads: ThreadMetadata[]) => void;
  setActiveThreadId: (threadId: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useThreadsStore = create<ThreadsState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    threads: [],
    activeThreadId: null,
    isLoaded: false,
    isLoading: false,
    error: null,

    // Actions
    loadThreads: async () => {
      set({ isLoading: true, error: null });

      try {
        const response = await fetch('/api/threads');
        if (!response.ok) {
          throw new Error(`Failed to load threads: ${response.status}`);
        }

        const threadsData = await response.json();
        const threads: ThreadMetadata[] = threadsData.map((thread: unknown) => {
          const threadObj = thread as Record<string, unknown>;
          return {
            ...threadObj,
            createdAt: new Date(threadObj.createdAt as string),
            updatedAt: new Date(threadObj.updatedAt as string),
          } as ThreadMetadata;
        });

        set({
          threads,
          isLoaded: true,
          isLoading: false,
          // Auto-select most recent thread if none selected
          activeThreadId:
            get().activeThreadId || (threads.length > 0 ? threads[0].id : null),
        });
      } catch (error: unknown) {
        console.error('Failed to load threads:', error);
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        set({ error: errorMessage, isLoading: false });
      }
    },

    createThread: async (name?: string) => {
      set({ isLoading: true, error: null });

      try {
        const response = await fetch('/api/threads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });

        if (!response.ok) {
          throw new Error(`Failed to create thread: ${response.status}`);
        }

        const newThread = await response.json();
        const threadMetadata: ThreadMetadata = {
          id: newThread.id,
          name: newThread.name,
          createdAt: new Date(newThread.createdAt),
          updatedAt: new Date(newThread.updatedAt),
          messageCount: 0,
        };

        set(state => ({
          threads: [threadMetadata, ...state.threads],
          activeThreadId: newThread.id,
          isLoading: false,
        }));

        return newThread.id;
      } catch (error: unknown) {
        console.error('Failed to create thread:', error);
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        set({ error: errorMessage, isLoading: false });
        throw error;
      }
    },

    selectThread: (threadId: string) => {
      set({ activeThreadId: threadId });
    },

    deleteThread: async (threadId: string) => {
      set({ isLoading: true, error: null });

      try {
        const response = await fetch(`/api/threads/${threadId}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          throw new Error(`Failed to delete thread: ${response.status}`);
        }

        const state = get();
        const updatedThreads = state.threads.filter(t => t.id !== threadId);
        const newActiveThreadId =
          state.activeThreadId === threadId
            ? updatedThreads.length > 0
              ? updatedThreads[0].id
              : null
            : state.activeThreadId;

        set({
          threads: updatedThreads,
          activeThreadId: newActiveThreadId,
          isLoading: false,
        });
      } catch (error: unknown) {
        console.error('Failed to delete thread:', error);
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        set({ error: errorMessage, isLoading: false });
      }
    },

    renameThread: async (threadId: string, newName: string) => {
      try {
        const response = await fetch(`/api/threads/${threadId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName }),
        });

        if (!response.ok) {
          throw new Error(`Failed to rename thread: ${response.status}`);
        }

        set(state => ({
          threads: state.threads.map(thread =>
            thread.id === threadId
              ? { ...thread, name: newName, updatedAt: new Date() }
              : thread
          ),
        }));
      } catch (error: unknown) {
        console.error('Failed to rename thread:', error);
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        set({ error: errorMessage });
      }
    },

    updateThreadRole: async (threadId: string, customRole?: string) => {
      try {
        const response = await fetch(`/api/threads/${threadId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customRole }),
        });

        if (!response.ok) {
          throw new Error(`Failed to update thread role: ${response.status}`);
        }

        // No local state update needed for custom role
      } catch (error: unknown) {
        console.error('Failed to update thread role:', error);
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        set({ error: errorMessage });
      }
    },

    clearThread: async (threadId: string) => {
      try {
        const response = await fetch(`/api/threads/${threadId}/clear`, {
          method: 'POST',
        });

        if (!response.ok) {
          throw new Error(`Failed to clear thread: ${response.status}`);
        }

        set(state => ({
          threads: state.threads.map(thread =>
            thread.id === threadId
              ? { ...thread, messageCount: 0, updatedAt: new Date() }
              : thread
          ),
        }));
      } catch (error: unknown) {
        console.error('Failed to clear thread:', error);
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        set({ error: errorMessage });
      }
    },

    // Internal state setters
    setThreads: threads => set({ threads }),
    setActiveThreadId: activeThreadId => set({ activeThreadId }),
    setLoading: isLoading => set({ isLoading }),
    setError: error => set({ error }),
  }))
);

// Auto-load threads on store creation
useThreadsStore.getState().loadThreads();
