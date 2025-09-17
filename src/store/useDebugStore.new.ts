import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { sseEventBus } from '../utils/sseEventBus';

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

    addEntry: entry => {
      const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const timestamp = Date.now();

      set(state => ({
        entries: [
          { ...entry, id, timestamp },
          ...state.entries.slice(0, 999), // Keep only last 1000 entries
        ],
      }));
    },

    clearEntries: () => {
      set({ entries: [] });
    },

    setConnected: connected => {
      set({ isConnected: connected });
    },

    updateTokenStats: (tokensPerSecond, totalTokens) => {
      set({
        currentTokensPerSecond: tokensPerSecond,
        currentTotalTokens: totalTokens,
        isGenerating: tokensPerSecond > 0, // Auto-detect generation state
      });
    },

    setGenerating: generating => {
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

// Event Bus Subscriptions
let debugUnsubscribeFunctions: (() => void)[] = [];

function initializeDebugEventSubscriptions(): void {
  if (debugUnsubscribeFunctions.length > 0) {
    return; // Already subscribed
  }

  console.log('[useDebugStore] Subscribing to debug events via SSE event bus');

  // Subscribe to debug entries
  debugUnsubscribeFunctions.push(
    sseEventBus.subscribe('debug-entry', (event) => {
      const { addEntry } = useDebugStore.getState();
      const data = event.data;

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

      // Update current stats from any response with token stats
      if (
        data.entryType === 'response' &&
        data.tokensPerSecond &&
        data.totalTokens
      ) {
        const { updateTokenStats } = useDebugStore.getState();
        updateTokenStats(data.tokensPerSecond, data.totalTokens);
      }
    })
  );

  // Subscribe to token stats
  debugUnsubscribeFunctions.push(
    sseEventBus.subscribe('token-stats', (event) => {
      const { updateTokenStats } = useDebugStore.getState();
      const data = event.data;
      updateTokenStats(data.tokensPerSecond, data.totalTokens);
    })
  );

  // Subscribe to generation status
  debugUnsubscribeFunctions.push(
    sseEventBus.subscribe('generation-status', (event) => {
      const { setGenerating } = useDebugStore.getState();
      const data = event.data;
      setGenerating(typeof data.generating === 'boolean' ? data.generating : false);
    })
  );

  // Mark as connected when event bus is working
  useDebugStore.getState().setConnected(true);
}

// Auto-initialize subscriptions when module loads
if (typeof window !== 'undefined') {
  setTimeout(initializeDebugEventSubscriptions, 100);
}
