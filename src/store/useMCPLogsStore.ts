import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { decodeSseData } from '../utils/sseDecoder';

export interface MCPLogEntry {
  id: string;
  timestamp: number;
  serverId: string;
  level: 'info' | 'error' | 'warn';
  message: string;
}

interface MCPLogsState {
  logs: MCPLogEntry[];
  isConnected: boolean;
  addLog: (log: MCPLogEntry) => void;
  clearLogs: () => void;
  setConnected: (connected: boolean) => void;
  fetchLogs: () => Promise<void>;
}

export const useMCPLogsStore = create<MCPLogsState>()(
  subscribeWithSelector((set, get) => ({
    logs: [],
    isConnected: false,

    addLog: (log) => {
      set((state) => ({
        logs: [log, ...state.logs.slice(0, 999)] // Keep max 1000 logs
      }));
    },

    clearLogs: () => {
      set({ logs: [] });
    },

    setConnected: (connected) => {
      set({ isConnected: connected });
    },

    fetchLogs: async () => {
      try {
        const response = await fetch('/api/mcp/logs');
        if (response.ok) {
          const data = await response.json();
          set({ logs: data.logs || [] });
        }
      } catch (error) {
        console.error('Failed to fetch MCP logs:', error);
      }
    }
  }))
);

// Global SSE listener for MCP logs
let mcpLogsSSEInitialized = false;
let currentMCPLogsEventSource: EventSource | null = null;

function createMCPLogsSSEConnection(): EventSource {
  const eventSource = new EventSource('/api/mcp/logs/stream');
  
  eventSource.onopen = () => {
    useMCPLogsStore.getState().setConnected(true);
  };
  
  eventSource.onmessage = async (event) => {
    try {
      const data = JSON.parse(event.data);

      // Decode the entire data object using the shared SSE decoder
      const decodedData = await decodeSseData(data);

      if (decodedData.type === 'mcp-log') {
        const { addLog } = useMCPLogsStore.getState();
        addLog({
          id: decodedData.id,
          timestamp: decodedData.timestamp,
          serverId: decodedData.serverId,
          level: decodedData.level,
          message: decodedData.message
        });
      }
    } catch (error) {
      console.error('Error parsing MCP logs SSE data:', error);
    }
  };

  eventSource.onerror = (error) => {
    console.error('MCP logs SSE connection error:', error);
    useMCPLogsStore.getState().setConnected(false);
    
    if (eventSource.readyState === EventSource.CLOSED) {
      setTimeout(() => {
        currentMCPLogsEventSource = createMCPLogsSSEConnection();
      }, 5000);
    }
  };

  return eventSource;
}

export function initializeMCPLogsSSE() {
  if (mcpLogsSSEInitialized) return;
  mcpLogsSSEInitialized = true;
  
  // Close any existing connection
  if (currentMCPLogsEventSource) {
    currentMCPLogsEventSource.close();
  }
  
  // Create new connection
  currentMCPLogsEventSource = createMCPLogsSSEConnection();
  
  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    if (currentMCPLogsEventSource) {
      currentMCPLogsEventSource.close();
    }
  });
}

// Auto-initialize when store is accessed
useMCPLogsStore.subscribe(
  (state) => state.isConnected,
  () => {
    if (!mcpLogsSSEInitialized) {
      initializeMCPLogsSSE();
    }
  },
  { fireImmediately: true }
);
