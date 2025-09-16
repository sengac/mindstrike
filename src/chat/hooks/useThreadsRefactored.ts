import { useCallback } from 'react';
import { useThreadsStore } from '../../store/useThreadsStore';
import { useChatMessagesStore } from '../../store/useChatMessagesStore';

export function useThreadsRefactored() {
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
    updateThreadRole,
    clearThread
  } = useThreadsStore();

  const { loadMessages, clearMessages } = useChatMessagesStore();

  const selectThreadAndLoadMessages = useCallback(async (threadId: string) => {
    selectThread(threadId);
    await loadMessages(threadId);
  }, [selectThread, loadMessages]);

  const createThreadAndSelect = useCallback(async (name?: string): Promise<string> => {
    const threadId = await createThread(name);
    // Clear current messages and load new (empty) thread
    clearMessages();
    await loadMessages(threadId);
    return threadId;
  }, [createThread, clearMessages, loadMessages]);

  const deleteThreadAndSelectNext = useCallback(async (threadId: string) => {
    await deleteThread(threadId);
    // If the deleted thread was active, the store will auto-select the next one
    const newActiveThreadId = useThreadsStore.getState().activeThreadId;
    if (newActiveThreadId) {
      await loadMessages(newActiveThreadId);
    } else {
      clearMessages();
    }
  }, [deleteThread, loadMessages, clearMessages]);

  const clearThreadMessages = useCallback(async (threadId: string) => {
    await clearThread(threadId);
    // Reload messages if this is the active thread
    if (threadId === activeThreadId) {
      await loadMessages(threadId);
    }
  }, [clearThread, activeThreadId, loadMessages]);

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
    updateThreadRole,
    clearThread: clearThreadMessages
  };
}
