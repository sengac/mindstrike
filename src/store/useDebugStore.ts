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
}

interface DebugState {
  entries: LLMDebugEntry[];
  isConnected: boolean;
  addEntry: (entry: Omit<LLMDebugEntry, 'id' | 'timestamp'>) => void;
  clearEntries: () => void;
  setConnected: (connected: boolean) => void;
}

export const useDebugStore = create<DebugState>()(
  subscribeWithSelector((set, get) => ({
    entries: [],
    isConnected: false,

    addEntry: (entry) => {
      const newEntry: LLMDebugEntry = {
        ...entry,
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
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
        const { addEntry } = useDebugStore.getState();

        addEntry({
          type: data.entryType,
          title: data.title,
          content: data.content,
          duration: data.duration,
          model: data.model,
          endpoint: data.endpoint,
        });
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
