import { useState, useEffect, useCallback, useRef } from 'react';
import { Thread, ConversationMessage } from '../types';
import { cleanContentForLLM } from '../utils/content-filter';
import { useAppStore } from '../store/useAppStore';

export function useThreads() {
  const workspaceVersion = useAppStore((state) => state.workspaceVersion);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const loadThreads = useCallback(async () => {
    try {
      const response = await fetch('/api/conversations');
      if (response.ok) {
        const data = await response.json();
        const parsedThreads = data.map((thread: any) => ({
          ...thread,
          createdAt: new Date(thread.createdAt),
          updatedAt: new Date(thread.updatedAt),
          messages: thread.messages.map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          }))
        }));
        setThreads(parsedThreads);
        
        // Set the most recently updated thread as active, or create new one if none exist
        if (parsedThreads.length > 0) {
          const mostRecent = parsedThreads.sort((a: Thread, b: Thread) => 
            b.updatedAt.getTime() - a.updatedAt.getTime()
          )[0];
          setActiveThreadId(mostRecent.id);
        }
      }
    } catch (error) {
      console.error('Failed to load threads from file:', error);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Load threads from mindstrike-chats.json file on mount and when workspace changes
  useEffect(() => {
    loadThreads();
  }, [loadThreads, workspaceVersion]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Save threads to mindstrike-chats.json file with debouncing
  const saveThreads = useCallback(async (threadsToSave: Thread[]) => {
    // Clear any existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce the save operation
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch('/api/conversations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(threadsToSave),
          // signal: AbortSignal.timeout(5000) // 5 second timeout - commented out for compatibility
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
      } catch (error) {
        console.error('Failed to save threads to file:', error);
        // Don't throw here to avoid breaking the UI
      }
    }, 500); // 500ms debounce
  }, []);

  const createThread = useCallback(async (name?: string): Promise<string> => {
    const newThread: Thread = {
      id: Date.now().toString(),
      name: name || `Conversation ${threads.length + 1}`,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const updatedThreads = [newThread, ...threads];
    setThreads(updatedThreads);
    setActiveThreadId(newThread.id);
    await saveThreads(updatedThreads);
    
    return newThread.id;
  }, [threads, saveThreads]);

  const deleteThread = useCallback(async (threadId: string) => {
    const updatedThreads = threads.filter(t => t.id !== threadId);
    setThreads(updatedThreads);
    
    if (activeThreadId === threadId) {
      const newActiveId = updatedThreads.length > 0 ? updatedThreads[0].id : null;
      setActiveThreadId(newActiveId);
    }
    
    await saveThreads(updatedThreads);
  }, [threads, activeThreadId, saveThreads]);

  const renameThread = useCallback(async (threadId: string, newName: string) => {
    const updatedThreads = threads.map(thread =>
      thread.id === threadId
        ? { ...thread, name: newName, updatedAt: new Date() }
        : thread
    );
    setThreads(updatedThreads);
    await saveThreads(updatedThreads);
  }, [threads, saveThreads]);

  const updateThreadRole = useCallback(async (threadId: string, customRole?: string) => {
    const updatedThreads = threads.map(thread =>
      thread.id === threadId
        ? { ...thread, customRole, updatedAt: new Date() }
        : thread
    );
    setThreads(updatedThreads);
    await saveThreads(updatedThreads);
  }, [threads, saveThreads]);

  const generateThreadSummary = useCallback(async (threadId: string) => {
    // Find the thread with updated messages by refreshing from state
    setTimeout(async () => {
      try {
        // Re-fetch the current threads state to get the latest messages
        const response = await fetch('/api/conversations');
        if (!response.ok) return;
        
        const latestThreads = await response.json();
        const thread = latestThreads.find((t: any) => t.id === threadId);
        
        if (!thread || thread.messages.length < 2) {
  
          return;
        }

        // Get the first user message for title generation
        const userMsg = thread.messages.find((m: any) => m.role === 'user');
        if (!userMsg) return;

        // Generate title based on user's first message
        const titleResponse = await fetch('/api/generate-title', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            context: `User asked: ${cleanContentForLLM(userMsg.content).slice(0, 200)}`
          })
        });

        if (titleResponse.ok) {
          const result = await titleResponse.json();
          const title = cleanContentForLLM(result.title || '').trim();
          
          if (title && title.length > 0) {
            // Update the thread with the new title
            const updatedThreads = latestThreads.map((t: any) =>
              t.id === threadId
                ? { ...t, name: title, updatedAt: new Date().toISOString() }
                : t
            );
            
            // Save to file
            await fetch('/api/conversations', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(updatedThreads)
            });

            // Update local state
            const formattedThreads = updatedThreads.map((thread: any) => ({
              ...thread,
              createdAt: new Date(thread.createdAt),
              updatedAt: new Date(thread.updatedAt),
              messages: thread.messages.map((msg: any) => ({
                ...msg,
                timestamp: new Date(msg.timestamp)
              }))
            }));
            setThreads(formattedThreads);
          }
        }
      } catch (error) {
        console.error('Failed to generate thread title:', error);
      }
    }, 500); // Wait for messages to be fully saved
  }, [setThreads]);

  const updateThreadMessages = useCallback(async (threadId: string, messages: ConversationMessage[]) => {
    const currentThread = threads.find(t => t.id === threadId);
    const wasEmpty = !currentThread || currentThread.messages.length === 0;
    
    const updatedThreads = threads.map(thread =>
      thread.id === threadId
        ? { ...thread, messages, updatedAt: new Date() }
        : thread
    );
    setThreads(updatedThreads);
    await saveThreads(updatedThreads);
    
    // If this is the first time messages are added (thread was empty and now has 2+ messages), generate title
    if (wasEmpty && messages.length >= 2) {
      setTimeout(() => {
        generateThreadSummary(threadId);
      }, 200); // Small delay to ensure state is updated
    }
  }, [threads, saveThreads, generateThreadSummary]);

  const deleteMessage = useCallback(async (threadId: string, messageId: string) => {
    const thread = threads.find(t => t.id === threadId);
    if (!thread) return false;

    // Find the message to delete
    const messageIndex = thread.messages.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1) return false;

    const messageToDelete = thread.messages[messageIndex];
    let messagesToRemove = [messageId];

    // If deleting a user message, also delete the next assistant response (if it exists)
    if (messageToDelete.role === 'user' && messageIndex + 1 < thread.messages.length) {
      const nextMessage = thread.messages[messageIndex + 1];
      if (nextMessage.role === 'assistant') {
        messagesToRemove.push(nextMessage.id);
      }
    }

    const updatedMessages = thread.messages.filter(msg => !messagesToRemove.includes(msg.id));
    const updatedThreads = threads.map(t =>
      t.id === threadId
        ? { ...t, messages: updatedMessages, updatedAt: new Date() }
        : t
    );
    
    setThreads(updatedThreads);
    await saveThreads(updatedThreads);
    return true;
  }, [threads, saveThreads]);

  const getActiveThread = useCallback(() => {
    return threads.find(t => t.id === activeThreadId) || null;
  }, [threads, activeThreadId]);

  const selectThread = useCallback(async (threadId: string) => {
    setActiveThreadId(threadId);
    
    // Load the thread's conversation into the agent's context
    try {
      await fetch(`/api/load-thread/${threadId}`, {
        method: 'POST'
      });
    } catch (error) {
      console.error('Failed to load thread into agent:', error);
    }
  }, []);

  return {
    threads,
    activeThreadId,
    activeThread: getActiveThread(),
    isLoaded,
    loadThreads,
    createThread,
    deleteThread,
    renameThread,
    updateThreadRole,
    selectThread,
    updateThreadMessages,
    deleteMessage,
    generateThreadSummary
  };
}
