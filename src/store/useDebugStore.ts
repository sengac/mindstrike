import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export interface LLMDebugEntry {
  id: string;
  timestamp: number;
  type: 'request' | 'response' | 'error';
  title: string;
  content: string;
  duration?: number;
  model?: string;
  endpoint?: string;
  tokensPerSecond?: number;
  totalTokens?: number;
}

interface DebugState {
  entries: LLMDebugEntry[];
  isConnected: boolean;
  currentTokensPerSecond: number;
  currentTotalTokens: number;
  isGenerating: boolean;
  addEntry: (entry: Omit<LLMDebugEntry, 'id' | 'timestamp'>) => void;
  clearEntries: () => void;
  setConnected: (connected: boolean) => void;
  updateTokenStats: (tokensPerSecond: number, totalTokens: number) => void;
  setGenerating: (generating: boolean) => void;
}

export const useDebugStore = create<DebugState>()(
  subscribeWithSelector((set, get) => ({
    entries: [],
    isConnected: false,
    currentTokensPerSecond: 0,
    currentTotalTokens: 0,
    isGenerating: false,

    addEntry: (entry) => {
      const state = get();
      const newEntry: LLMDebugEntry = {
        ...entry,
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        // Include current token stats if we're generating and this is a response
        ...(state.isGenerating && entry.type === 'response' && {
          tokensPerSecond: state.currentTokensPerSecond,
          totalTokens: state.currentTotalTokens,
        }),
      };

      set((state) => ({
        entries: [newEntry, ...state.entries.slice(0, 999)] // Keep max 1000 entries
      }));
    },

    clearEntries: () => {
      set({ entries: [] });
    },

    setConnected: (connected) => {
      set({ isConnected: connected });
    },

    updateTokenStats: (tokensPerSecond, totalTokens) => {
      set({ currentTokensPerSecond: tokensPerSecond, currentTotalTokens: totalTokens });
    },

    setGenerating: (generating) => {
      const state = get();
      set({ isGenerating: generating });
      // Only reset token stats if we're actually stopping generation (was true, now false)
      if (!generating && state.isGenerating) {
        // Reset token stats when generation truly ends
        set({ currentTokensPerSecond: 0, currentTotalTokens: 0 });
      }
    },
  }))
);

// Global SSE listener for debug messages
let debugSSEInitialized = false;
let currentDebugEventSource: EventSource | null = null;

function createDebugSSEConnection(): EventSource {
  const eventSource = new EventSource('/api/debug/stream');
  
  eventSource.onopen = () => {
    
    useDebugStore.getState().setConnected(true);
  };
  
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === 'debug-entry') {
        const { addEntry, isGenerating } = useDebugStore.getState();

        addEntry({
          type: data.entryType,
          title: data.title,
          content: data.content,
          duration: data.duration,
          model: data.model,
          endpoint: data.endpoint,
          tokensPerSecond: data.tokensPerSecond,
          totalTokens: data.totalTokens,
        });

        // Update current stats from any response with token stats (regardless of generation state)
        if (data.entryType === 'response' && data.tokensPerSecond && data.totalTokens) {
          const { updateTokenStats } = useDebugStore.getState();
          updateTokenStats(data.tokensPerSecond, data.totalTokens);
        }
      } else if (data.type === 'token-stats') {
        // Handle real-time token statistics updates
        const { updateTokenStats } = useDebugStore.getState();
        updateTokenStats(data.tokensPerSecond || 0, data.totalTokens || 0);
      } else if (data.type === 'generation-status') {
        // Handle generation start/stop
        const { setGenerating } = useDebugStore.getState();
        setGenerating(data.generating || false);
      }
    } catch (error) {
      console.error('Error parsing debug SSE data:', error);
    }
  };

  eventSource.onerror = (error) => {
    console.error('Debug SSE connection error:', error);
    useDebugStore.getState().setConnected(false);
    
    if (eventSource.readyState === EventSource.CLOSED) {
      setTimeout(() => {
        currentDebugEventSource = createDebugSSEConnection();
      }, 5000);
    }
  };

  return eventSource;
}

export function initializeDebugSSE() {
  if (debugSSEInitialized) return;
  debugSSEInitialized = true;
  
  // Close any existing connection
  if (currentDebugEventSource) {
    currentDebugEventSource.close();
  }
  
  // Create new connection
  currentDebugEventSource = createDebugSSEConnection();
  
  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    if (currentDebugEventSource) {
      currentDebugEventSource.close();
    }
  });
}

// Auto-initialize when store is first used
useDebugStore.subscribe(
  (state) => state.entries,
  () => {
    if (!debugSSEInitialized) {
      initializeDebugSSE();
    }
  },
  { fireImmediately: false }
);
