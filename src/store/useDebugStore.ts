import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { SSEEvent } from '../utils/sseEventBus';
import { sseEventBus } from '../utils/sseEventBus';
import { isSseDebugEntryData, isSseTokenStatsData } from '../utils/sseDecoder';
import { logger } from '../utils/logger';

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

  const handleDebugEvent = async (event: SSEEvent) => {
    try {
      // Handle nested data structure from unified SSE - data is already decoded by event bus
      const eventData = (event.data as { data?: unknown }).data ?? event.data;

      if (
        eventData &&
        typeof eventData === 'object' &&
        (eventData as Record<string, unknown>).type === 'debug-entry' &&
        isSseDebugEntryData(eventData as Record<string, unknown>)
      ) {
        const { addEntry } = useDebugStore.getState();

        const data = eventData as Record<string, unknown>;
        addEntry({
          type: data.entryType as 'request' | 'response' | 'error',
          title: data.title as string,
          content: data.content as string,
          duration: data.duration as number,
          model: data.model as string,
          endpoint: data.endpoint as string,
          tokensPerSecond: data.tokensPerSecond as number,
          totalTokens: data.totalTokens as number,
        });

        // Update current stats from any response with token stats (regardless of generation state)
        if (
          data.entryType === 'response' &&
          data.tokensPerSecond &&
          data.totalTokens
        ) {
          const { updateTokenStats } = useDebugStore.getState();
          updateTokenStats(
            data.tokensPerSecond as number,
            data.totalTokens as number
          );
        }
      } else if (
        eventData &&
        typeof eventData === 'object' &&
        (eventData as Record<string, unknown>).type === 'token-stats' &&
        isSseTokenStatsData(eventData as Record<string, unknown>)
      ) {
        // Handle real-time token statistics updates
        const { updateTokenStats } = useDebugStore.getState();
        const data = eventData as Record<string, unknown>;
        updateTokenStats(
          data.tokensPerSecond as number,
          data.totalTokens as number
        );
      } else if (
        eventData &&
        typeof eventData === 'object' &&
        (eventData as Record<string, unknown>).type === 'generation-status'
      ) {
        // Handle generation start/stop
        const { setGenerating } = useDebugStore.getState();
        const data = eventData as Record<string, unknown>;
        setGenerating(
          typeof data.generating === 'boolean' ? data.generating : false
        );
      }
    } catch (error) {
      logger.error('Error parsing debug SSE data:', error);
    }
  };

  // Subscribe to SSE event bus for debug events
  const unsubscribe = sseEventBus.subscribe('debug-entry', handleDebugEvent);
  debugUnsubscribeFunctions.push(unsubscribe);

  const unsubscribeTokenStats = sseEventBus.subscribe(
    'token-stats',
    handleDebugEvent
  );
  debugUnsubscribeFunctions.push(unsubscribeTokenStats);

  const unsubscribeGenerationStatus = sseEventBus.subscribe(
    'generation-status',
    handleDebugEvent
  );
  debugUnsubscribeFunctions.push(unsubscribeGenerationStatus);
}

export async function initializeDebugSSE() {
  if (debugSSEInitialized) {
    return;
  }
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
