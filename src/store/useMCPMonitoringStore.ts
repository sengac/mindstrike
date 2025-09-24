import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { sseEventBus } from '../utils/sseEventBus';
import { SSEEventType } from '../types';
import { logger } from '../utils/logger';
import {
  isSSEMCPProcessInfoEvent,
  isSSEMCPStdoutLogEvent,
  isSSEMCPStderrLogEvent,
  isSSEMCPServerConnectedEvent,
  isSSEMCPServerDisconnectedEvent,
} from '../types/sseEvents';

export interface MCPProcessInfo {
  serverId: string;
  pid: number | null;
  hasStderr: boolean;
  isConnected: boolean;
  lastSeen: number; // timestamp
}

export interface MCPProcessLog {
  id: string;
  timestamp: number;
  serverId: string;
  type: 'stdout' | 'stderr'; // Type of output
  message: string; // The actual output
}

interface MCPMonitoringState {
  // Process information for each server
  processes: Map<string, MCPProcessInfo>;

  // Recent process logs (both stdout and stderr)
  processLogs: MCPProcessLog[];

  // Connection status
  isConnected: boolean;

  // Actions
  updateProcessInfo: (processInfo: MCPProcessInfo[]) => void;
  updateSingleProcess: (
    serverId: string,
    info: Partial<MCPProcessInfo>
  ) => void;
  addProcessLog: (log: MCPProcessLog) => void;
  clearProcessLogs: () => void;
  setConnected: (connected: boolean) => void;
  fetchProcessInfo: () => Promise<void>;
  fetchProcessLogs: (
    serverId?: string,
    type?: 'stdout' | 'stderr'
  ) => Promise<void>;

  // Computed getters
  getProcessByServerId: (serverId: string) => MCPProcessInfo | undefined;
  getConnectedProcesses: () => MCPProcessInfo[];
  getProcessLogsForServer: (
    serverId: string,
    type?: 'stdout' | 'stderr'
  ) => MCPProcessLog[];
}

export const useMCPMonitoringStore = create<MCPMonitoringState>()(
  subscribeWithSelector((set, get) => ({
    processes: new Map(),
    processLogs: [],
    isConnected: false,

    updateProcessInfo: processInfoList => {
      set(state => {
        const newProcesses = new Map(state.processes);
        const now = Date.now();

        processInfoList.forEach(info => {
          newProcesses.set(info.serverId, {
            ...info,
            lastSeen: now,
          });
        });

        return { processes: newProcesses };
      });
    },

    updateSingleProcess: (serverId, updates) => {
      set(state => {
        const newProcesses = new Map(state.processes);
        const existing = newProcesses.get(serverId);

        if (existing) {
          newProcesses.set(serverId, {
            ...existing,
            ...updates,
            lastSeen: Date.now(),
          });
        } else {
          // Create new process info with defaults
          newProcesses.set(serverId, {
            serverId,
            pid: null,
            hasStderr: false,
            isConnected: false,
            lastSeen: Date.now(),
            ...updates,
          });
        }

        return { processes: newProcesses };
      });
    },

    addProcessLog: log => {
      set(state => ({
        processLogs: [log, ...state.processLogs.slice(0, 499)], // Keep max 500 process logs
      }));
    },

    clearProcessLogs: () => {
      set({ processLogs: [] });
    },

    setConnected: connected => {
      set({ isConnected: connected });
    },

    fetchProcessInfo: async () => {
      try {
        const response = await fetch('/api/mcp/processes');
        if (response.ok) {
          const data = await response.json();
          get().updateProcessInfo(data.processes || []);
        }
      } catch (error) {
        logger.error('Failed to fetch MCP process info:', error);
      }
    },

    fetchProcessLogs: async (serverId, type) => {
      try {
        let url = '/api/mcp/server-logs';
        const params = new URLSearchParams();

        if (serverId) {
          params.append('serverId', serverId);
        }
        if (type === 'stderr') {
          params.append('stderrOnly', 'true');
        }

        if (params.toString()) {
          url += '?' + params.toString();
        }

        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          const processLogs = (data.logs || [])
            .map((log: any) => {
              let logType: 'stdout' | 'stderr' = 'stderr';
              let cleanMessage = log.message;

              if (log.message.includes('[stderr]')) {
                logType = 'stderr';
                cleanMessage = log.message.replace('[stderr] ', '');
              } else if (log.message.includes('[protocol]')) {
                logType = 'stdout';
                cleanMessage = log.message.replace('[protocol] ', '');
              }

              return {
                id: log.id,
                timestamp: log.timestamp,
                serverId: log.serverId,
                type: logType,
                message: cleanMessage,
              };
            })
            .filter((log: MCPProcessLog) => !type || log.type === type);

          set({ processLogs });
        }
      } catch (error) {
        logger.error('Failed to fetch MCP process logs:', error);
      }
    },

    // Computed getters
    getProcessByServerId: serverId => {
      return get().processes.get(serverId);
    },

    getConnectedProcesses: () => {
      return Array.from(get().processes.values()).filter(p => p.isConnected);
    },

    getProcessLogsForServer: (serverId, type) => {
      const logs = get().processLogs.filter(log => log.serverId === serverId);
      return type ? logs.filter(log => log.type === type) : logs;
    },
  }))
);

// Event Bus Subscriptions for MCP monitoring
let mcpMonitoringUnsubscribe: (() => void)[] = [];

function initializeMCPMonitoringEventSubscription(): void {
  if (mcpMonitoringUnsubscribe.length > 0) {
    return; // Already subscribed
  }

  const { updateProcessInfo, updateSingleProcess, addProcessLog } =
    useMCPMonitoringStore.getState();

  // Subscribe to process info updates
  mcpMonitoringUnsubscribe.push(
    sseEventBus.subscribe(SSEEventType.MCP_PROCESS_INFO, event => {
      if (isSSEMCPProcessInfoEvent(event.data)) {
        // Convert SSE process info to store format
        const data = event.data as typeof event.data & { timestamp: number };
        const processInfoWithLastSeen = data.processes.map(p => ({
          ...p,
          lastSeen: data.timestamp,
        }));
        updateProcessInfo(processInfoWithLastSeen);
      }
    })
  );

  // Subscribe to stdout logs
  mcpMonitoringUnsubscribe.push(
    sseEventBus.subscribe(SSEEventType.MCP_STDOUT_LOG, event => {
      if (isSSEMCPStdoutLogEvent(event.data)) {
        addProcessLog({
          id: event.data.id,
          timestamp: event.data.timestamp,
          serverId: event.data.serverId,
          type: 'stdout',
          message: event.data.message,
        });
      }
    })
  );

  // Subscribe to stderr logs
  mcpMonitoringUnsubscribe.push(
    sseEventBus.subscribe(SSEEventType.MCP_STDERR_LOG, event => {
      if (isSSEMCPStderrLogEvent(event.data)) {
        addProcessLog({
          id: event.data.id,
          timestamp: event.data.timestamp,
          serverId: event.data.serverId,
          type: 'stderr',
          message: event.data.message,
        });
      }
    })
  );

  // Subscribe to server connection events
  mcpMonitoringUnsubscribe.push(
    sseEventBus.subscribe(SSEEventType.MCP_SERVER_CONNECTED, event => {
      if (isSSEMCPServerConnectedEvent(event.data)) {
        updateSingleProcess(event.data.serverId, {
          isConnected: true,
          pid: event.data.pid,
        });
      }
    })
  );

  mcpMonitoringUnsubscribe.push(
    sseEventBus.subscribe(SSEEventType.MCP_SERVER_DISCONNECTED, event => {
      if (isSSEMCPServerDisconnectedEvent(event.data)) {
        updateSingleProcess(event.data.serverId, {
          isConnected: false,
          pid: null,
        });
      }
    })
  );
}

// Cleanup function
export function cleanupMCPMonitoringSubscriptions(): void {
  mcpMonitoringUnsubscribe.forEach(unsub => unsub());
  mcpMonitoringUnsubscribe = [];
}

// Auto-initialize subscription when module loads
if (typeof window !== 'undefined') {
  setTimeout(initializeMCPMonitoringEventSubscription, 100);
}
