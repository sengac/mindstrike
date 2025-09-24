import { useCallback } from 'react';
import { useThreadsStore } from '../../store/useThreadsStore';
import { useChatThreadStore } from '../../store/useChatThreadStore';

export function useThreads() {
  const {
    threads,
    activeThreadId,
    isLoaded,
    isLoading,
    error,
    loadThreads,
    createThread,
    selectThread,
    deleteThread,
    renameThread,
    updateThreadPrompt,
    clearThread,
  } = useThreadsStore();

  const selectThreadAndLoadMessages = useCallback(
    async (threadId: string) => {
      selectThread(threadId);
      const threadStore = useChatThreadStore(threadId);
      await threadStore.getState().loadMessages();
    },
    [selectThread]
  );

  const createThreadAndSelect = useCallback(
    async (name?: string): Promise<string> => {
      const threadId = await createThread(name);
      // Clear current messages and load new (empty) thread - handled by thread switching
      const threadStore = useChatThreadStore(threadId);
      await threadStore.getState().loadMessages();
      return threadId;
    },
    [createThread]
  );

  const deleteThreadAndSelectNext = useCallback(
    async (threadId: string) => {
      await deleteThread(threadId);
      // If the deleted thread was active, the store will auto-select the next one
      const newActiveThreadId = useThreadsStore.getState().activeThreadId;
      if (newActiveThreadId) {
        const threadStore = useChatThreadStore(newActiveThreadId);
        await threadStore.getState().loadMessages();
      }
      // If no active thread, the UI will handle showing empty state
    },
    [deleteThread]
  );

  const clearThreadMessages = useCallback(
    async (threadId: string) => {
      await clearThread(threadId);
      // Reload messages if this is the active thread
      if (threadId === activeThreadId) {
        const threadStore = useChatThreadStore(threadId);
        await threadStore.getState().loadMessages();
      }
    },
    [clearThread, activeThreadId]
  );

  const getActiveThread = useCallback(() => {
    return threads.find(t => t.id === activeThreadId) || null;
  }, [threads, activeThreadId]);

  return {
    threads,
    activeThreadId,
    activeThread: getActiveThread(),
    isLoaded,
    isLoading,
    error,
    loadThreads,
    createThread: createThreadAndSelect,
    selectThread: selectThreadAndLoadMessages,
    deleteThread: deleteThreadAndSelectNext,
    renameThread,
    updateThreadPrompt,
    clearThread: clearThreadMessages,
  };
}
