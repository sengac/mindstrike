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
  
  eventSource.onmessage = async (event) => {
    try {
      const data = JSON.parse(event.data);

      // Helper function to decode base64 encoded values (UTF-8 compatible)
      const decodeValue = async (value: any): Promise<any> => {
        if (value && typeof value === 'object' && value._base64 === true) {
          const binaryString = atob(value.data);
          const bytes = Uint8Array.from(binaryString, c => c.charCodeAt(0));
          return new TextDecoder('utf-8').decode(bytes);
        }
        if (value && typeof value === 'object' && value._large_content === true) {
          try {
            const response = await fetch(`/api/large-content/${value.contentId}`);
            const responseData = await response.json();
            return responseData.content || `[Large content not found: ${value.contentId}]`;
          } catch (error) {
            return `[Error fetching large content: ${value.contentId}]`;
          }
        }
        return value;
      };

      if (await decodeValue(data.type) === 'debug-entry') {
        const entryType = await decodeValue(data.entryType);
        const title = await decodeValue(data.title);
        const { addEntry, isGenerating } = useDebugStore.getState();

        addEntry({
          type: entryType,
          title: title,
          content: await decodeValue(data.content),
          duration: data.duration,
          model: await decodeValue(data.model),
          endpoint: await decodeValue(data.endpoint),
          tokensPerSecond: data.tokensPerSecond,
          totalTokens: data.totalTokens,
        });

        // Update current stats from any response with token stats (regardless of generation state)
        if (data.entryType === 'response' && data.tokensPerSecond && data.totalTokens) {
          const { updateTokenStats } = useDebugStore.getState();
          updateTokenStats(data.tokensPerSecond, data.totalTokens);
        }
      } else if (await decodeValue(data.type) === 'token-stats') {
        // Handle real-time token statistics updates
        const { updateTokenStats } = useDebugStore.getState();
        updateTokenStats(data.tokensPerSecond || 0, data.totalTokens || 0);
      } else if (await decodeValue(data.type) === 'generation-status') {
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

// Auto-initialize when store is first accessed
useDebugStore.subscribe(
  (state) => state.isConnected,
  () => {
    if (!debugSSEInitialized) {
      initializeDebugSSE();
    }
  },
  { fireImmediately: true }
);
