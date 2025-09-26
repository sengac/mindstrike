import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { sseEventBus } from '../utils/sseEventBus';
import { SSEEventType } from '../types';
import { isSSELogEvent } from '../types/sseEvents';
import { logger } from '../utils/logger';

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
  subscribeWithSelector(set => ({
    logs: [],
    isConnected: false,

    addLog: log => {
      set(state => ({
        logs: [log, ...state.logs.slice(0, 999)], // Keep max 1000 logs
      }));
    },

    clearLogs: () => {
      set({ logs: [] });
    },

    setConnected: connected => {
      set({ isConnected: connected });
    },

    fetchLogs: async () => {
      try {
        const response = await fetch('/api/mcp/logs');
        if (response.ok) {
          const data = await response.json();
          // Ensure logs is always an array
          const logs = Array.isArray(data.logs) ? data.logs : [];
          set({ logs });
        }
      } catch (error) {
        logger.error('Failed to fetch MCP logs:', error);
        // Reset to empty array on error
        set({ logs: [] });
      }
    },
  }))
);

// Event Bus Subscriptions for MCP logs
let mcpLogsUnsubscribe: (() => void) | null = null;

function initializeMCPLogsEventSubscription(): void {
  if (mcpLogsUnsubscribe) {
    return; // Already subscribed
  }

  mcpLogsUnsubscribe = sseEventBus.subscribe(SSEEventType.MCP_LOG, event => {
    const { addLog } = useMCPLogsStore.getState();
    // Handle nested data structure from unified SSE
    if (!isSSELogEvent(event.data)) {
      return;
    }
    const data = event.data;

    addLog({
      id: data.id as string,
      timestamp: data.timestamp,
      serverId: data.serverId as string,
      level: data.level as 'info' | 'error' | 'warn',
      message: data.message,
    });
  });
}

// Auto-initialize subscription when module loads
if (typeof window !== 'undefined') {
  setTimeout(initializeMCPLogsEventSubscription, 100);
}
