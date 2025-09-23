import { useState } from 'react';
import {
  FileText,
  Trash2,
  Copy,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Workflow,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { LLMDebugEntry } from '../store/useDebugStore';
import { useDebugStore } from '../store/useDebugStore';
import { useTaskStore } from '../store/useTaskStore';
import { useMCPLogsStore } from '../store/useMCPLogsStore';
import { JSONViewer } from './JSONViewer';
import { AppBar } from './AppBar';
import MCPIcon from './MCPIcon';
import type { LogsTabType } from '../types/logs';
import { MusicVisualization } from './MusicVisualization';

interface ApplicationLogsViewProps {
  initialTab?: LogsTabType;
}

// Wrapper component to make MCPIcon compatible with the tab structure
const MCPIconWrapper: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <MCPIcon size={size} />
);

export function ApplicationLogsView({
  initialTab = 'llm',
}: ApplicationLogsViewProps) {
  const { entries, clearEntries } = useDebugStore();
  const { currentWorkflow, workflows, getWorkflowProgress, getActiveTask } =
    useTaskStore();
  const { logs, clearLogs } = useMCPLogsStore();
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(
    new Set()
  );
  const [expandedWorkflows, setExpandedWorkflows] = useState<Set<string>>(
    new Set()
  );
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [expandedMCPLogs, setExpandedMCPLogs] = useState<Set<string>>(
    new Set()
  );
  const [filterType, setFilterType] = useState<
    'all' | 'request' | 'response' | 'error'
  >('all');
  const [mcpServerFilter, setMcpServerFilter] = useState<string>('all');
  const [mcpLevelFilter, setMcpLevelFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<LogsTabType>(initialTab);

  const handleClearEntries = () => {
    clearEntries();
    toast.success('LLM logs cleared');
  };

  const handleClearMCPLogs = () => {
    clearLogs();
    toast.success('MCP logs cleared');
  };

  const copyEntry = (entry: LLMDebugEntry) => {
    const text = `[${new Date(entry.timestamp).toISOString()}] ${entry.title}\n\n${entry.content}`;
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const copyMCPLog = (log: any) => {
    const text = `[${new Date(log.timestamp).toLocaleString()}] [${log.level?.toUpperCase()}] [${log.serverId}]\n\n${log.message}`;
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const renderMessageWithJSON = (message: string) => {
    // Helper function to find JSON structures (objects and arrays)
    const findJsonStructures = (text: string) => {
      const results = [];
      let i = 0;

      while (i < text.length) {
        const char = text[i];

        // Look for start of JSON (object or array)
        if (char === '{' || char === '[') {
          const startChar = char;
          const endChar = char === '{' ? '}' : ']';
          let depth = 1;
          let j = i + 1;
          let inString = false;
          let escaped = false;

          // Find the matching closing bracket/brace
          while (j < text.length && depth > 0) {
            const currentChar = text[j];

            if (escaped) {
              escaped = false;
            } else if (currentChar === '\\') {
              escaped = true;
            } else if (currentChar === '"' && !escaped) {
              inString = !inString;
            } else if (!inString) {
              if (currentChar === startChar) {
                depth++;
              } else if (currentChar === endChar) {
                depth--;
              }
            }

            j++;
          }

          if (depth === 0) {
            const jsonCandidate = text.slice(i, j);
            try {
              const parsed = JSON.parse(jsonCandidate);
              results.push({
                start: i,
                end: j,
                text: jsonCandidate,
                parsed: parsed,
              });
              i = j;
              continue;
            } catch {
              // Not valid JSON, continue searching
            }
          }
        }

        i++;
      }

      return results;
    };

    const jsonStructures = findJsonStructures(message);

    if (jsonStructures.length === 0) {
      return message;
    }

    const parts = [];
    let lastIndex = 0;

    jsonStructures.forEach((structure, _index) => {
      // Add text before the JSON
      if (structure.start > lastIndex) {
        parts.push(
          <span key={`text-${lastIndex}`}>
            {message.slice(lastIndex, structure.start)}
          </span>
        );
      }

      // Add the JSON viewer
      parts.push(
        <div
          key={`json-${structure.start}`}
          className="my-2 border border-gray-600 rounded bg-black/80 p-2"
        >
          <JSONViewer content={structure.parsed} showControls={true} />
        </div>
      );

      lastIndex = structure.end;
    });

    // Add remaining text
    if (lastIndex < message.length) {
      parts.push(
        <span key={`text-${lastIndex}`}>{message.slice(lastIndex)}</span>
      );
    }

    return parts;
  };

  const toggleExpanded = (entryId: string) => {
    const newExpanded = new Set(expandedEntries);
    if (newExpanded.has(entryId)) {
      newExpanded.delete(entryId);
    } else {
      newExpanded.add(entryId);
    }
    setExpandedEntries(newExpanded);
  };

  const toggleMCPLogExpanded = (logId: string) => {
    const newExpanded = new Set(expandedMCPLogs);
    if (newExpanded.has(logId)) {
      newExpanded.delete(logId);
    } else {
      newExpanded.add(logId);
    }
    setExpandedMCPLogs(newExpanded);
  };

  const toggleWorkflow = (workflowId: string) => {
    const newExpanded = new Set(expandedWorkflows);
    if (newExpanded.has(workflowId)) {
      newExpanded.delete(workflowId);
    } else {
      newExpanded.add(workflowId);
    }
    setExpandedWorkflows(newExpanded);
  };

  const toggleTask = (taskId: string) => {
    const newExpanded = new Set(expandedTasks);
    if (newExpanded.has(taskId)) {
      newExpanded.delete(taskId);
    } else {
      newExpanded.add(taskId);
    }
    setExpandedTasks(newExpanded);
  };

  const filteredEntries = entries.filter(
    entry =>
      (filterType === 'all' || entry.type === filterType) &&
      !(
        entry.type === 'response' &&
        (!entry.content || entry.content.trim() === '')
      )
  );

  const filteredMCPLogs = logs.filter(log => {
    if (mcpServerFilter !== 'all' && log.serverId !== mcpServerFilter) {
      return false;
    }
    if (mcpLevelFilter !== 'all' && log.level !== mcpLevelFilter) {
      return false;
    }
    return true;
  });

  // Get unique servers and levels for filter dropdowns
  const mcpServers = Array.from(new Set(logs.map(log => log.serverId))).sort();
  const mcpLevels = Array.from(new Set(logs.map(log => log.level))).sort();

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'request':
        return 'text-blue-400';
      case 'response':
        return 'text-green-400';
      case 'error':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'request':
        return '→';
      case 'response':
        return '←';
      case 'error':
        return '⚠';
      default:
        return '•';
    }
  };

  return (
    <div className="flex flex-col h-full bg-dark-bg">
      {/* Header */}
      <AppBar icon={FileText} title="Application Logs" />

      {/* Tab Navigation */}
      <div className="border-b border-gray-700">
        <div className="px-6">
          <nav className="flex space-x-8">
            {[
              {
                id: 'llm',
                label: 'LLM Logs',
                icon: MessageSquare,
                count: entries.length > 0 ? entries.length : null,
              },
              {
                id: 'tasks',
                label: 'Task Workflows',
                icon: Workflow,
                count: currentWorkflow
                  ? 'ACTIVE'
                  : workflows.length > 0
                    ? workflows.length
                    : null,
              },
              {
                id: 'mcp',
                label: 'MCP Logs',
                icon: MCPIconWrapper,
                count: logs.length > 0 ? logs.length : null,
              },
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as LogsTabType)}
                  className={`flex items-center gap-2 py-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-400'
                      : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
                  }`}
                >
                  <Icon size={16} />
                  {tab.label}
                  {tab.count && (
                    <span className="ml-2 px-2 py-1 text-xs bg-blue-600 text-white rounded-full">
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Controls - Show for debug and mcp tabs */}
      {(activeTab === 'llm' || activeTab === 'mcp') && (
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-4">
            {activeTab === 'llm' && (
              <>
                <select
                  value={filterType}
                  onChange={e => setFilterType(e.target.value as any)}
                  className="bg-gray-700 text-white px-3 py-1 rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Types</option>
                  <option value="request">Requests</option>
                  <option value="response">Responses</option>
                  <option value="error">Errors</option>
                </select>
                <span className="text-gray-400 text-sm">
                  {filteredEntries.length} entries
                </span>
              </>
            )}
            {activeTab === 'mcp' && (
              <>
                <select
                  value={mcpServerFilter}
                  onChange={e => setMcpServerFilter(e.target.value)}
                  className="bg-gray-700 text-white px-3 py-1 rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Servers</option>
                  {mcpServers.map(server => (
                    <option key={server} value={server}>
                      {server}
                    </option>
                  ))}
                </select>
                <select
                  value={mcpLevelFilter}
                  onChange={e => setMcpLevelFilter(e.target.value)}
                  className="bg-gray-700 text-white px-3 py-1 rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Levels</option>
                  {mcpLevels.map(level => (
                    <option key={level} value={level}>
                      {level.toUpperCase()}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-3">
                  <span className="text-gray-400 text-sm">
                    {filteredMCPLogs.length} of {logs.length} logs
                  </span>
                </div>
              </>
            )}
          </div>
          <button
            onClick={
              activeTab === 'llm' ? handleClearEntries : handleClearMCPLogs
            }
            className="flex items-center gap-2 px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
          >
            <Trash2 size={14} />
            Clear All
          </button>
        </div>
      )}

      {/* Content */}
      <div className="relative flex-1 overflow-y-auto p-6">
        <MusicVisualization className="absolute inset-0 w-full h-full pointer-events-none z-0" />
        <div className="relative z-10">
          {activeTab === 'llm' ? (
            // LLM Logs Tab
            filteredEntries.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                <FileText size={48} className="mx-auto mb-4 opacity-50" />
                <p>No LLM entries yet</p>
                <p className="text-sm mt-2">
                  LLM requests and responses will appear here
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredEntries.map(entry => (
                  <div
                    key={entry.id}
                    className="border border-gray-700 rounded-lg"
                  >
                    <div
                      className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-750 transition-colors"
                      onClick={() => toggleExpanded(entry.id)}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <div className="flex items-center gap-2">
                          {expandedEntries.has(entry.id) ? (
                            <ChevronDown size={16} />
                          ) : (
                            <ChevronRight size={16} />
                          )}
                          <span
                            className={`font-mono text-sm ${getTypeColor(entry.type)}`}
                          >
                            {getTypeIcon(entry.type)}
                          </span>
                        </div>
                        <div className="flex-1">
                          <div className="text-white font-medium">
                            {entry.title}
                          </div>
                          <div className="text-gray-400 text-sm">
                            {new Date(entry.timestamp).toLocaleString()}
                            {entry.model && ` • ${entry.model}`}
                            {entry.duration && ` • ${entry.duration}ms`}
                            {entry.tokensPerSecond &&
                              ` • ${entry.tokensPerSecond.toFixed(1)} tokens/sec`}
                            {entry.totalTokens &&
                              ` • ${entry.totalTokens.toLocaleString()} tokens`}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          copyEntry(entry);
                        }}
                        className="p-1 hover:bg-gray-600 rounded transition-colors"
                        title="Copy to clipboard"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                    {expandedEntries.has(entry.id) && (
                      <div className="border-t border-gray-700 p-3 bg-black/80 border border-gray-600">
                        <div className="font-mono">
                          <JSONViewer content={entry.content} />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : activeTab === 'tasks' ? (
            // Task Workflows Tab
            <div className="space-y-6">
              {/* Current Active Workflow */}
              {currentWorkflow && (
                <div className="border border-blue-600 rounded-lg bg-blue-900/20">
                  <div className="p-4 border-b border-blue-600/50">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-blue-400">
                        Active Workflow
                      </h3>
                      <span className="px-3 py-1 bg-blue-600 text-white text-sm rounded-full">
                        {currentWorkflow.status.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-gray-300 mt-2">
                      {currentWorkflow.originalQuery}
                    </p>
                  </div>

                  <div className="p-4">
                    {/* Progress Bar */}
                    <div className="mb-4">
                      <div className="flex justify-between text-sm text-gray-400 mb-2">
                        <span>
                          Progress:{' '}
                          {getWorkflowProgress(currentWorkflow.id).completed}/
                          {currentWorkflow.tasks.length} tasks
                        </span>
                        <span>
                          {getWorkflowProgress(currentWorkflow.id).percentage}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                          style={{
                            width: `${getWorkflowProgress(currentWorkflow.id).percentage}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Active Task */}
                    {getActiveTask() && (
                      <div className="mb-4 p-3 bg-blue-800/30 border border-blue-600/50 rounded">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-blue-400 font-medium">
                            Currently Active:
                          </span>
                          <span className="px-2 py-1 bg-blue-600 text-white text-xs rounded">
                            {getActiveTask()?.type.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-gray-200">
                          {getActiveTask()?.description}
                        </p>
                      </div>
                    )}

                    {/* Task List */}
                    <div className="space-y-2">
                      <h4 className="text-white font-medium">All Tasks:</h4>
                      {currentWorkflow.tasks.map((task, index) => (
                        <div
                          key={task.id}
                          className={`rounded ${
                            task.status === 'in-progress'
                              ? 'bg-blue-700/30 border border-blue-500/50'
                              : task.status === 'completed'
                                ? 'bg-green-700/30 border border-green-500/50'
                                : task.status === 'failed'
                                  ? 'bg-red-700/30 border border-red-500/50'
                                  : 'bg-gray-700/30'
                          }`}
                        >
                          <div
                            className={`p-3 flex items-center space-x-3 ${
                              task.status === 'completed' &&
                              (task.details || task.result)
                                ? 'cursor-pointer hover:opacity-80 transition-opacity'
                                : ''
                            }`}
                            onClick={
                              task.status === 'completed' &&
                              (task.details || task.result)
                                ? () => toggleTask(task.id)
                                : undefined
                            }
                          >
                            <span className="text-lg">
                              {task.status === 'completed'
                                ? '✅'
                                : task.status === 'in-progress'
                                  ? '🔄'
                                  : task.status === 'failed'
                                    ? '❌'
                                    : '⏳'}
                            </span>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs px-2 py-1 bg-gray-600 text-gray-200 rounded uppercase">
                                  {task.type}
                                </span>
                                <span
                                  className={`text-xs px-2 py-1 rounded uppercase ${
                                    task.priority === 'high'
                                      ? 'bg-red-600 text-white'
                                      : task.priority === 'medium'
                                        ? 'bg-yellow-600 text-white'
                                        : 'bg-green-600 text-white'
                                  }`}
                                >
                                  {task.priority}
                                </span>
                              </div>
                              <p className="text-gray-200 mt-1">
                                {task.description}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-400 font-mono text-sm">
                                #{index + 1}
                              </span>
                              {/* Show expand/collapse icon for completed tasks with details/results */}
                              {task.status === 'completed' &&
                                (task.details != null ||
                                  task.result != null) && (
                                  <span className="text-gray-400">
                                    {expandedTasks.has(task.id) ? (
                                      <ChevronDown size={16} />
                                    ) : (
                                      <ChevronRight size={16} />
                                    )}
                                  </span>
                                )}
                            </div>
                          </div>

                          {/* Expanded Details - Show for non-completed tasks or when expanded */}
                          {(task.status !== 'completed' ||
                            expandedTasks.has(task.id)) && (
                            <div className="mt-3 pl-8">
                              {/* Task Details */}
                              {task.details != null && (
                                <div className="mt-2 p-3 bg-black/80 rounded border border-gray-600 text-xs">
                                  <span className="text-green-400 font-medium block mb-2">
                                    Details:
                                  </span>
                                  <div className="font-mono">
                                    <JSONViewer
                                      content={JSON.stringify(
                                        task.details,
                                        null,
                                        2
                                      )}
                                    />
                                  </div>
                                </div>
                              )}

                              {/* Task Result */}
                              {task.result != null && (
                                <div className="mt-2 p-3 bg-black/80 rounded border border-gray-600 text-xs">
                                  <span className="text-green-400 font-medium block mb-2">
                                    Result:
                                  </span>
                                  <div className="font-mono">
                                    <JSONViewer
                                      content={JSON.stringify(
                                        task.result,
                                        null,
                                        2
                                      )}
                                    />
                                  </div>
                                </div>
                              )}

                              {task.error && (
                                <p className="text-red-400 text-sm mt-2">
                                  Error: {task.error}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Recent Workflows */}
              {workflows.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">
                    Recent Workflows
                  </h3>
                  <div className="space-y-3">
                    {workflows
                      .slice(-5)
                      .reverse()
                      .map(workflow => (
                        <div
                          key={workflow.id}
                          className="border border-gray-600 rounded-lg bg-gray-800/50"
                        >
                          <div
                            className="p-4 cursor-pointer hover:bg-gray-800/70 transition-colors"
                            onClick={() => toggleWorkflow(workflow.id)}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-gray-400">
                                  {expandedWorkflows.has(workflow.id) ? (
                                    <ChevronDown size={16} />
                                  ) : (
                                    <ChevronRight size={16} />
                                  )}
                                </span>
                                <span
                                  className={`px-2 py-1 text-xs rounded ${
                                    workflow.status === 'completed'
                                      ? 'bg-green-600 text-white'
                                      : workflow.status === 'failed'
                                        ? 'bg-red-600 text-white'
                                        : workflow.status === 'executing'
                                          ? 'bg-blue-600 text-white'
                                          : 'bg-gray-600 text-white'
                                  }`}
                                >
                                  {workflow.status.toUpperCase()}
                                </span>
                              </div>
                              <span className="text-gray-400 text-sm">
                                {new Date(workflow.createdAt).toLocaleString()}
                              </span>
                            </div>
                            <p className="text-gray-300 text-sm mb-2">
                              {workflow.originalQuery}
                            </p>
                            <div className="flex items-center gap-4 text-xs text-gray-400">
                              <span>
                                {
                                  workflow.tasks.filter(
                                    t => t.status === 'completed'
                                  ).length
                                }
                                /{workflow.tasks.length} tasks
                              </span>
                              {workflow.totalChanges > 0 && (
                                <span>{workflow.totalChanges} changes</span>
                              )}
                              {workflow.completedAt && (
                                <span>
                                  Duration:{' '}
                                  {Math.round(
                                    (new Date(workflow.completedAt).getTime() -
                                      new Date(workflow.createdAt).getTime()) /
                                      1000
                                  )}
                                  s
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Expanded Task Details */}
                          {expandedWorkflows.has(workflow.id) && (
                            <div className="border-t border-gray-600 p-4">
                              <h4 className="text-white font-medium mb-3">
                                Tasks:
                              </h4>
                              <div className="space-y-2">
                                {workflow.tasks.map((task, index) => (
                                  <div
                                    key={task.id}
                                    className={`rounded ${
                                      task.status === 'in-progress'
                                        ? 'bg-blue-700/30 border border-blue-500/50'
                                        : task.status === 'completed'
                                          ? 'bg-green-700/30 border border-green-500/50'
                                          : task.status === 'failed'
                                            ? 'bg-red-700/30 border border-red-500/50'
                                            : 'bg-gray-700/30'
                                    }`}
                                  >
                                    <div
                                      className={`p-3 flex items-start space-x-3 ${
                                        task.status === 'completed' &&
                                        (task.details || task.result)
                                          ? 'cursor-pointer hover:opacity-80 transition-opacity'
                                          : ''
                                      }`}
                                      onClick={
                                        task.status === 'completed' &&
                                        (task.details || task.result)
                                          ? () => toggleTask(task.id)
                                          : undefined
                                      }
                                    >
                                      <span className="text-lg mt-1">
                                        {task.status === 'completed'
                                          ? '✅'
                                          : task.status === 'in-progress'
                                            ? '🔄'
                                            : task.status === 'failed'
                                              ? '❌'
                                              : '⏳'}
                                      </span>
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                          <span className="text-xs px-2 py-1 bg-gray-600 text-gray-200 rounded uppercase">
                                            {task.type}
                                          </span>
                                          <span
                                            className={`text-xs px-2 py-1 rounded uppercase ${
                                              task.priority === 'high'
                                                ? 'bg-red-600 text-white'
                                                : task.priority === 'medium'
                                                  ? 'bg-yellow-600 text-white'
                                                  : 'bg-green-600 text-white'
                                            }`}
                                          >
                                            {task.priority}
                                          </span>
                                          <span className="text-gray-400 font-mono text-xs">
                                            #{index + 1}
                                          </span>
                                        </div>
                                        <p className="text-gray-200 text-sm mb-2">
                                          {task.description}
                                        </p>

                                        {task.completedAt && (
                                          <p className="text-gray-500 text-xs">
                                            Completed:{' '}
                                            {new Date(
                                              task.completedAt
                                            ).toLocaleString()}
                                          </p>
                                        )}
                                      </div>

                                      {/* Show expand/collapse icon for completed tasks with details/results */}
                                      {task.status === 'completed' &&
                                        (task.details != null ||
                                          task.result != null) && (
                                          <span className="text-gray-400">
                                            {expandedTasks.has(task.id) ? (
                                              <ChevronDown size={16} />
                                            ) : (
                                              <ChevronRight size={16} />
                                            )}
                                          </span>
                                        )}
                                    </div>

                                    {/* Expanded Details - Show for non-completed tasks or when expanded */}
                                    {(task.status !== 'completed' ||
                                      expandedTasks.has(task.id)) && (
                                      <div className="mt-3 pl-8">
                                        {/* Task Details */}
                                        {task.details != null && (
                                          <div className="mt-2 p-3 bg-black/80 rounded border border-gray-600 text-xs">
                                            <span className="text-green-400 font-medium block mb-2">
                                              Details:
                                            </span>
                                            <div className="font-mono">
                                              <JSONViewer
                                                content={JSON.stringify(
                                                  task.details,
                                                  null,
                                                  2
                                                )}
                                              />
                                            </div>
                                          </div>
                                        )}

                                        {/* Task Result */}
                                        {task.result != null && (
                                          <div className="mt-2 p-3 bg-black/80 rounded border border-gray-600 text-xs">
                                            <span className="text-green-400 font-medium block mb-2">
                                              Result:
                                            </span>
                                            <div className="font-mono">
                                              <JSONViewer
                                                content={JSON.stringify(
                                                  task.result,
                                                  null,
                                                  2
                                                )}
                                              />
                                            </div>
                                          </div>
                                        )}

                                        {task.error && (
                                          <p className="text-red-400 text-sm mt-2">
                                            Error: {task.error}
                                          </p>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Empty State */}
              {!currentWorkflow && workflows.length === 0 && (
                <div className="text-center text-gray-400 py-8">
                  <FileText size={48} className="mx-auto mb-4 opacity-50" />
                  <p>No task workflows yet</p>
                  <p className="text-sm mt-2">
                    Agentic workflows will appear here
                  </p>
                </div>
              )}
            </div>
          ) : activeTab === 'mcp' ? (
            // MCP Logs Tab
            filteredMCPLogs.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                <div className="mx-auto mb-4 opacity-50">
                  <MCPIcon size={48} className="mx-auto" />
                </div>
                <p>
                  {logs.length === 0
                    ? 'No MCP logs yet'
                    : 'No logs match the current filters'}
                </p>
                <p className="text-sm mt-2">
                  {logs.length === 0
                    ? 'MCP server activity will appear here'
                    : 'Try adjusting your server or level filters'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredMCPLogs.map(log => {
                  const getLevelColor = (level: string) => {
                    switch (level?.toLowerCase()) {
                      case 'error':
                        return 'text-red-400';
                      case 'warn':
                        return 'text-yellow-400';
                      case 'info':
                        return 'text-blue-400';
                      default:
                        return 'text-gray-400';
                    }
                  };

                  return (
                    <div
                      key={log.id}
                      className="border border-gray-700 rounded-lg"
                    >
                      <div
                        className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-750 transition-colors"
                        onClick={() => toggleMCPLogExpanded(log.id)}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <div className="flex items-center gap-2">
                            {expandedMCPLogs.has(log.id) ? (
                              <ChevronDown size={16} />
                            ) : (
                              <ChevronRight size={16} />
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span
                                className={`text-xs px-2 py-1 bg-gray-600 rounded uppercase font-mono ${getLevelColor(log.level || 'info')}`}
                              >
                                {log.level || 'LOG'}
                              </span>
                              {log.serverId && (
                                <span className="text-xs px-2 py-1 bg-green-600 text-white rounded font-mono">
                                  {log.serverId}
                                </span>
                              )}
                            </div>
                            <div className="text-gray-400 text-sm">
                              {new Date(log.timestamp).toLocaleString()}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            copyMCPLog(log);
                          }}
                          className="p-1 hover:bg-gray-600 rounded transition-colors"
                          title="Copy to clipboard"
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                      {expandedMCPLogs.has(log.id) && (
                        <div className="border-t border-gray-700 p-3 bg-black/80 border border-gray-600">
                          <div className="font-mono text-gray-300">
                            {renderMessageWithJSON(log.message)}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
