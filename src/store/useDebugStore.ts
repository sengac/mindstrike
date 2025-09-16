import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  decodeSseEventData,
  isSseDebugEntryData,
  isSseTokenStatsData,
} from '../utils/sseDecoder';

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
      const state = get();
      const newEntry: LLMDebugEntry = {
        ...entry,
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        // Include current token stats if we're generating and this is a response
        ...(state.isGenerating &&
          entry.type === 'response' && {
            tokensPerSecond: state.currentTokensPerSecond,
            totalTokens: state.currentTotalTokens,
          }),
      };

      set(state => ({
        entries: [newEntry, ...state.entries.slice(0, 999)], // Keep max 1000 entries
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

// Global SSE listener for debug messages
let debugSSEInitialized = false;
let currentDebugEventSource: EventSource | null = null;

function createDebugSSEConnection(): EventSource {
  const eventSource = new EventSource('/api/debug/stream');

  eventSource.onopen = () => {
    useDebugStore.getState().setConnected(true);
  };

  eventSource.onmessage = async event => {
    try {
      const data = JSON.parse(event.data);

      // Decode the entire data object
      const decodedData = await decodeSseEventData(data);

      if (
        decodedData.type === 'debug-entry' &&
        isSseDebugEntryData(decodedData)
      ) {
        const { addEntry } = useDebugStore.getState();

        addEntry({
          type: decodedData.entryType,
          title: decodedData.title,
          content: decodedData.content,
          duration: decodedData.duration,
          model: decodedData.model,
          endpoint: decodedData.endpoint,
          tokensPerSecond: decodedData.tokensPerSecond,
          totalTokens: decodedData.totalTokens,
        });

        // Update current stats from any response with token stats (regardless of generation state)
        if (
          decodedData.entryType === 'response' &&
          decodedData.tokensPerSecond &&
          decodedData.totalTokens
        ) {
          const { updateTokenStats } = useDebugStore.getState();
          updateTokenStats(
            decodedData.tokensPerSecond,
            decodedData.totalTokens
          );
        }
      } else if (
        decodedData.type === 'token-stats' &&
        isSseTokenStatsData(decodedData)
      ) {
        // Handle real-time token statistics updates
        const { updateTokenStats } = useDebugStore.getState();
        updateTokenStats(decodedData.tokensPerSecond, decodedData.totalTokens);
      } else if (decodedData.type === 'generation-status') {
        // Handle generation start/stop
        const { setGenerating } = useDebugStore.getState();
        setGenerating(
          typeof decodedData.generating === 'boolean'
            ? decodedData.generating
            : false
        );
      }
    } catch (error) {
      console.error('Error parsing debug SSE data:', error);
    }
  };

  eventSource.onerror = error => {
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

// Auto-initialize when store is first accessed
useDebugStore.subscribe(
  state => state.isConnected,
  () => {
    if (!debugSSEInitialized) {
      initializeDebugSSE();
    }
  },
  { fireImmediately: true }
);
