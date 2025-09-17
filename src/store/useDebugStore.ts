import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { sseEventBus } from '../utils/sseEventBus';
import { decodeSseEventData, isSseDebugEntryData, isSseTokenStatsData } from '../utils/sseDecoder';

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

// Event Bus Subscriptions
let debugUnsubscribeFunctions: (() => void)[] = [];
let debugSSEInitialized = false;

async function initializeDebugEventSubscriptions(): Promise<void> {
  if (debugUnsubscribeFunctions.length > 0) {
    return; // Already subscribed
  }

  console.log('[useDebugStore] Subscribing to debug events via SSE event bus');

  const handleDebugEvent = async (event: { data: any }) => {
    try {
      // Handle nested data structure from unified SSE - data is already decoded by event bus
      const eventData = event.data.data || event.data;
      
      console.log('[useDebugStore] Debug event data:', eventData);

      if (
        eventData.type === 'debug-entry' &&
        isSseDebugEntryData(eventData)
      ) {
        const { addEntry } = useDebugStore.getState();

        addEntry({
          type: eventData.entryType,
          title: eventData.title,
          content: eventData.content,
          duration: eventData.duration,
          model: eventData.model,
          endpoint: eventData.endpoint,
          tokensPerSecond: eventData.tokensPerSecond,
          totalTokens: eventData.totalTokens,
        });

        // Update current stats from any response with token stats (regardless of generation state)
        if (
          eventData.entryType === 'response' &&
          eventData.tokensPerSecond &&
          eventData.totalTokens
        ) {
          const { updateTokenStats } = useDebugStore.getState();
          updateTokenStats(
            eventData.tokensPerSecond,
            eventData.totalTokens
          );
        }
      } else if (
        eventData.type === 'token-stats' &&
        isSseTokenStatsData(eventData)
      ) {
        // Handle real-time token statistics updates
        const { updateTokenStats } = useDebugStore.getState();
        updateTokenStats(eventData.tokensPerSecond, eventData.totalTokens);
      } else if (eventData.type === 'generation-status') {
        // Handle generation start/stop
        const { setGenerating } = useDebugStore.getState();
        setGenerating(
          typeof eventData.generating === 'boolean'
            ? eventData.generating
            : false
        );
      }
    } catch (error) {
      console.error('Error parsing debug SSE data:', error);
    }
  };

  // Subscribe to SSE event bus for debug events
  const unsubscribe = sseEventBus.subscribe('debug-entry', handleDebugEvent);
  debugUnsubscribeFunctions.push(unsubscribe);

  const unsubscribeTokenStats = sseEventBus.subscribe('token-stats', handleDebugEvent);
  debugUnsubscribeFunctions.push(unsubscribeTokenStats);

  const unsubscribeGenerationStatus = sseEventBus.subscribe('generation-status', handleDebugEvent);
  debugUnsubscribeFunctions.push(unsubscribeGenerationStatus);
}

export async function initializeDebugSSE() {
  if (debugSSEInitialized) return;
  debugSSEInitialized = true;

  // Initialize event bus subscriptions
  await initializeDebugEventSubscriptions();

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    debugUnsubscribeFunctions.forEach(unsubscribe => unsubscribe());
    debugUnsubscribeFunctions = [];
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
