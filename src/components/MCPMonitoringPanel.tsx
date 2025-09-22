import { useState, useEffect } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Activity,
  Terminal,
  Eye,
  Zap,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import { useMCPMonitoringStore } from '../store/useMCPMonitoringStore';

interface MCPMonitoringPanelProps {
  className?: string;
}

export function MCPMonitoringPanel({
  className = '',
}: MCPMonitoringPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedServer, setSelectedServer] = useState<string | null>(null);

  const {
    processLogs,
    isConnected,
    fetchProcessInfo,
    fetchProcessLogs,
    getConnectedProcesses,
    getProcessLogsForServer,
  } = useMCPMonitoringStore();

  useEffect(() => {
    // Initial fetch only - SSE handles real-time updates
    fetchProcessInfo();
    fetchProcessLogs();
  }, [fetchProcessInfo, fetchProcessLogs]);

  const connectedProcesses = getConnectedProcesses();
  const recentProcessLogs = processLogs.slice(0, 20); // Show last 20 process logs
  const serverProcessLogs = selectedServer
    ? getProcessLogsForServer(selectedServer)
    : [];

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const formatPid = (pid: number | null) => {
    return pid ? `PID: ${pid}` : 'No PID';
  };

  const getProcessStatusIcon = (process: any) => {
    if (process.isConnected) {
      return <CheckCircle size={14} className="text-green-400" />;
    }
    return <AlertTriangle size={14} className="text-red-400" />;
  };

  return (
    <div
      className={`bg-gray-800 rounded-lg border border-gray-700 ${className}`}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-750 transition-colors rounded-lg"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center">
            <Activity size={16} className="text-purple-400" />
          </div>
          <div className="text-left">
            <h3 className="font-medium text-white">MCP Process Monitoring</h3>
            <p className="text-sm text-gray-400">
              {connectedProcesses.length} connected • {processLogs.length}{' '}
              process messages
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}
          />
          {isExpanded ? (
            <ChevronDown size={20} className="text-gray-400" />
          ) : (
            <ChevronRight size={20} className="text-gray-400" />
          )}
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-gray-700">
          {/* Process Info Section */}
          <div className="p-4 border-b border-gray-700">
            <div className="flex items-center gap-2 mb-3">
              <Zap size={16} className="text-blue-400" />
              <h4 className="font-medium text-white">Running Processes</h4>
            </div>

            {connectedProcesses.length === 0 ? (
              <p className="text-sm text-gray-500">No connected MCP servers</p>
            ) : (
              <div className="space-y-2">
                {connectedProcesses.map(process => (
                  <div
                    key={process.serverId}
                    className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      {getProcessStatusIcon(process)}
                      <div>
                        <div className="font-medium text-sm text-white">
                          {process.serverId}
                        </div>
                        <div className="text-xs text-gray-400">
                          {formatPid(process.pid)} •{' '}
                          {process.hasStderr ? 'Has stderr' : 'No stderr'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-xs text-gray-500">
                        {formatTimestamp(process.lastSeen)}
                      </div>
                      {serverProcessLogs.length > 0 && (
                        <button
                          onClick={() =>
                            setSelectedServer(
                              selectedServer === process.serverId
                                ? null
                                : process.serverId
                            )
                          }
                          className="flex items-center gap-1 px-2 py-1 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 text-xs rounded transition-colors"
                        >
                          <Eye size={12} />
                          Logs
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Process Logs Section */}
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Terminal size={16} className="text-orange-400" />
              <h4 className="font-medium text-white">
                {selectedServer
                  ? `Process Logs - ${selectedServer}`
                  : 'Recent Process Output'}
              </h4>
              {selectedServer && (
                <button
                  onClick={() => setSelectedServer(null)}
                  className="text-xs text-gray-400 hover:text-white transition-colors"
                >
                  Show All
                </button>
              )}
            </div>

            <div className="bg-gray-900 rounded-lg p-3 max-h-64 overflow-y-auto">
              {(selectedServer ? serverProcessLogs : recentProcessLogs)
                .length === 0 ? (
                <p className="text-sm text-gray-500 font-mono">
                  {selectedServer
                    ? `No process output from ${selectedServer}`
                    : 'No process output captured yet'}
                </p>
              ) : (
                <div className="space-y-1">
                  {(selectedServer ? serverProcessLogs : recentProcessLogs).map(
                    log => (
                      <div key={log.id} className="text-sm font-mono">
                        <div className="flex items-start gap-2">
                          <span className="text-gray-500 shrink-0">
                            {formatTimestamp(log.timestamp)}
                          </span>
                          <span
                            className={`shrink-0 text-xs px-1 rounded ${
                              log.type === 'stderr'
                                ? 'bg-red-500/20 text-red-400'
                                : 'bg-blue-500/20 text-blue-400'
                            }`}
                          >
                            {log.type}
                          </span>
                          {!selectedServer && (
                            <span className="text-purple-400 shrink-0">
                              [{log.serverId}]
                            </span>
                          )}
                          <span
                            className={`break-all ${
                              log.type === 'stderr'
                                ? 'text-red-300'
                                : 'text-green-400'
                            }`}
                          >
                            {log.message}
                          </span>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>

            {(selectedServer ? serverProcessLogs : recentProcessLogs).length >
              0 && (
              <div className="mt-2 text-xs text-gray-500">
                <span>
                  Showing{' '}
                  {selectedServer
                    ? serverProcessLogs.length
                    : Math.min(20, recentProcessLogs.length)}
                  {selectedServer ? ' server logs' : ' recent logs'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
