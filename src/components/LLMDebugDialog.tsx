import { useState } from 'react';
import { X, Bug, Trash2, Copy, ChevronDown, ChevronRight, Wifi, WifiOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { useDebugStore, LLMDebugEntry } from '../store/useDebugStore';
import { useTaskStore } from '../store/useTaskStore';
import { JSONViewer } from './JSONViewer';
import { BaseDialog } from './shared/BaseDialog';
import { useDialogAnimation } from '../hooks/useDialogAnimation';

interface LLMDebugDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LLMDebugDialog({ isOpen, onClose }: LLMDebugDialogProps) {
  const { shouldRender, isVisible, handleClose } = useDialogAnimation(isOpen, onClose);
  const { entries, isConnected, clearEntries } = useDebugStore();
  const { currentWorkflow, workflows, getWorkflowProgress, getActiveTask } = useTaskStore();
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const [expandedWorkflows, setExpandedWorkflows] = useState<Set<string>>(new Set());
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<'all' | 'request' | 'response' | 'error'>('all');
  const [activeTab, setActiveTab] = useState<'debug' | 'tasks'>('debug');

  const handleClearEntries = () => {
    clearEntries();
    toast.success('Debug entries cleared');
  };

  const copyEntry = (entry: LLMDebugEntry) => {
    const text = `[${new Date(entry.timestamp).toISOString()}] ${entry.title}\n\n${entry.content}`;
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
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

  const filteredEntries = entries.filter(entry => 
    (filterType === 'all' || entry.type === filterType) &&
    !(entry.type === 'response' && (!entry.content || entry.content.trim() === ''))
  );

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'request': return 'text-blue-400';
      case 'response': return 'text-green-400';
      case 'error': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'request': return '→';
      case 'response': return '←';
      case 'error': return '⚠';
      default: return '•';
    }
  };

  if (!shouldRender) return null;

  return (
    <BaseDialog 
      isOpen={shouldRender} 
      onClose={handleClose}
      isVisible={isVisible}
      fullScreen={true}
      className="bg-gray-800 flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <Bug className="text-yellow-400" size={20} />
          <h2 className="text-xl font-semibold text-white">LLM Debug & Tasks</h2>
          <div className="flex items-center gap-2">
            {isConnected ? (
              <Wifi className="text-green-400" size={16} title="Connected to debug stream" />
            ) : (
              <WifiOff className="text-red-400" size={16} title="Disconnected from debug stream" />
            )}
            <span className="text-xs text-gray-400">
              {isConnected ? 'Live' : 'Offline'}
            </span>
          </div>
        </div>
        <button
          onClick={handleClose}
          className="p-2 hover:bg-gray-700 rounded transition-colors"
        >
          <X size={20} />
        </button>
      </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setActiveTab('debug')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'debug'
                ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/50'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Debug Logs
          </button>
          <button
            onClick={() => setActiveTab('tasks')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'tasks'
                ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/50'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Task Workflows
            {(currentWorkflow || workflows.length > 0) && (
              <span className="ml-2 px-2 py-1 text-xs bg-blue-600 text-white rounded-full">
                {currentWorkflow ? 'ACTIVE' : workflows.length}
              </span>
            )}
          </button>
        </div>

        {/* Controls - Only show for debug tab */}
        {activeTab === 'debug' && (
          <div className="flex items-center justify-between p-4 border-b border-gray-700">
            <div className="flex items-center gap-4">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
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
            </div>
            <button
              onClick={handleClearEntries}
              className="flex items-center gap-2 px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
            >
              <Trash2 size={14} />
              Clear All
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {activeTab === 'debug' ? (
            // Debug Logs Tab
            filteredEntries.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                <Bug size={48} className="mx-auto mb-4 opacity-50" />
                <p>No debug entries yet</p>
                <p className="text-sm mt-2">LLM requests and responses will appear here</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredEntries.map((entry) => (
                  <div key={entry.id} className="border border-gray-700 rounded-lg">
                    <div 
                      className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-750 transition-colors"
                      onClick={() => toggleExpanded(entry.id)}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <div className="flex items-center gap-2">
                          {expandedEntries.has(entry.id) ? 
                            <ChevronDown size={16} /> : 
                            <ChevronRight size={16} />
                          }
                          <span className={`font-mono text-sm ${getTypeColor(entry.type)}`}>
                            {getTypeIcon(entry.type)}
                          </span>
                        </div>
                        <div className="flex-1">
                          <div className="text-white font-medium">{entry.title}</div>
                          <div className="text-gray-400 text-sm">
                            {new Date(entry.timestamp).toLocaleString()}
                            {entry.model && ` • ${entry.model}`}
                            {entry.duration && ` • ${entry.duration}ms`}
                            {entry.tokensPerSecond && ` • ${entry.tokensPerSecond.toFixed(1)} tokens/sec`}
                            {entry.totalTokens && ` • ${entry.totalTokens.toLocaleString()} tokens`}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
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
          ) : (
            // Task Workflows Tab
            <div className="space-y-6">
              {/* Current Active Workflow */}
              {currentWorkflow && (
                <div className="border border-blue-600 rounded-lg bg-blue-900/20">
                  <div className="p-4 border-b border-blue-600/50">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-blue-400">Active Workflow</h3>
                      <span className="px-3 py-1 bg-blue-600 text-white text-sm rounded-full">
                        {currentWorkflow.status.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-gray-300 mt-2">{currentWorkflow.originalQuery}</p>
                  </div>
                  
                  <div className="p-4">
                    {/* Progress Bar */}
                    <div className="mb-4">
                      <div className="flex justify-between text-sm text-gray-400 mb-2">
                        <span>Progress: {getWorkflowProgress(currentWorkflow.id).completed}/{currentWorkflow.tasks.length} tasks</span>
                        <span>{getWorkflowProgress(currentWorkflow.id).percentage}%</span>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${getWorkflowProgress(currentWorkflow.id).percentage}%` }}
                        />
                      </div>
                    </div>

                    {/* Active Task */}
                    {getActiveTask() && (
                      <div className="mb-4 p-3 bg-blue-800/30 border border-blue-600/50 rounded">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-blue-400 font-medium">Currently Active:</span>
                          <span className="px-2 py-1 bg-blue-600 text-white text-xs rounded">
                            {getActiveTask()?.type.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-gray-200">{getActiveTask()?.description}</p>
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
                      task.status === 'completed' && (task.details || task.result) 
                       ? 'cursor-pointer hover:opacity-80 transition-opacity' 
                       : ''
                      }`}
                      onClick={task.status === 'completed' && (task.details || task.result) ? () => toggleTask(task.id) : undefined}
                      >
                      <span className="text-lg">
                      {task.status === 'completed' ? '✅' : 
                      task.status === 'in-progress' ? '🔄' : 
                      task.status === 'failed' ? '❌' : '⏳'}
                      </span>
                      <div className="flex-1">
                      <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-1 bg-gray-600 text-gray-200 rounded uppercase">
                      {task.type}
                      </span>
                        <span className={`text-xs px-2 py-1 rounded uppercase ${
                          task.priority === 'high' ? 'bg-red-600 text-white' :
                            task.priority === 'medium' ? 'bg-yellow-600 text-white' :
                            'bg-green-600 text-white'
                        }`}>
                          {task.priority}
                        </span>
                      </div>
                      <p className="text-gray-200 mt-1">{task.description}</p>
                      </div>
                      <div className="flex items-center gap-2">
                      <span className="text-gray-400 font-mono text-sm">#{index + 1}</span>
                      {/* Show expand/collapse icon for completed tasks with details/results */}
                      {task.status === 'completed' && (task.details || task.result) && (
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
                      {(task.status !== 'completed' || expandedTasks.has(task.id)) && (
                          <div className="mt-3 pl-8">
                              {/* Task Details */}
                               {task.details && (
                                 <div className="mt-2 p-3 bg-black/80 rounded border border-gray-600 text-xs">
                                   <span className="text-green-400 font-medium block mb-2">Details:</span>
                                   <div className="font-mono">
                                     <JSONViewer content={JSON.stringify(task.details, null, 2)} />
                                   </div>
                                 </div>
                               )}
                               
                               {/* Task Result */}
                               {task.result && (
                                 <div className="mt-2 p-3 bg-black/80 rounded border border-gray-600 text-xs">
                                   <span className="text-green-400 font-medium block mb-2">Result:</span>
                                   <div className="font-mono">
                                     <JSONViewer content={JSON.stringify(task.result, null, 2)} />
                                   </div>
                                 </div>
                               )}
                               
                               {task.error && (
                                 <p className="text-red-400 text-sm mt-2">Error: {task.error}</p>
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
                  <h3 className="text-lg font-semibold text-white mb-4">Recent Workflows</h3>
                  <div className="space-y-3">
                  {workflows.slice(-5).reverse().map((workflow) => (
                  <div key={workflow.id} className="border border-gray-600 rounded-lg bg-gray-800/50">
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
                  <span className={`px-2 py-1 text-xs rounded ${
                  workflow.status === 'completed' ? 'bg-green-600 text-white' :
                  workflow.status === 'failed' ? 'bg-red-600 text-white' :
                  workflow.status === 'executing' ? 'bg-blue-600 text-white' :
                  'bg-gray-600 text-white'
                  }`}>
                  {workflow.status.toUpperCase()}
                  </span>
                  </div>
                  <span className="text-gray-400 text-sm">
                  {new Date(workflow.createdAt).toLocaleString()}
                  </span>
                  </div>
                  <p className="text-gray-300 text-sm mb-2">{workflow.originalQuery}</p>
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                  <span>{workflow.tasks.filter(t => t.status === 'completed').length}/{workflow.tasks.length} tasks</span>
                  {workflow.totalChanges > 0 && <span>{workflow.totalChanges} changes</span>}
                  {workflow.completedAt && (
                  <span>Duration: {Math.round((new Date(workflow.completedAt).getTime() - new Date(workflow.createdAt).getTime()) / 1000)}s</span>
                  )}
                  </div>
                  </div>
                         
                         {/* Expanded Task Details */}
                         {expandedWorkflows.has(workflow.id) && (
                           <div className="border-t border-gray-600 p-4">
                             <h4 className="text-white font-medium mb-3">Tasks:</h4>
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
                                       task.status === 'completed' && (task.details || task.result) 
                                         ? 'cursor-pointer hover:opacity-80 transition-opacity' 
                                         : ''
                                     }`}
                                     onClick={task.status === 'completed' && (task.details || task.result) ? () => toggleTask(task.id) : undefined}
                                   >
                                     <span className="text-lg mt-1">
                                       {task.status === 'completed' ? '✅' : 
                                        task.status === 'in-progress' ? '🔄' : 
                                        task.status === 'failed' ? '❌' : '⏳'}
                                     </span>
                                     <div className="flex-1">
                                       <div className="flex items-center gap-2 mb-1">
                                         <span className="text-xs px-2 py-1 bg-gray-600 text-gray-200 rounded uppercase">
                                           {task.type}
                                         </span>
                                         <span className={`text-xs px-2 py-1 rounded uppercase ${
                                           task.priority === 'high' ? 'bg-red-600 text-white' :
                                           task.priority === 'medium' ? 'bg-yellow-600 text-white' :
                                           'bg-green-600 text-white'
                                         }`}>
                                           {task.priority}
                                         </span>
                                         <span className="text-gray-400 font-mono text-xs">#{index + 1}</span>
                                       </div>
                                       <p className="text-gray-200 text-sm mb-2">{task.description}</p>
                                       
                                       {task.completedAt && (
                                         <p className="text-gray-500 text-xs">
                                           Completed: {new Date(task.completedAt).toLocaleString()}
                                         </p>
                                       )}
                                     </div>
                                     
                                     {/* Show expand/collapse icon for completed tasks with details/results */}
                                     {task.status === 'completed' && (task.details || task.result) && (
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
                                   {(task.status !== 'completed' || expandedTasks.has(task.id)) && (
                                     <div className="mt-3 pl-8">
                                       {/* Task Details */}
                                       {task.details && (
                                         <div className="mt-2 p-3 bg-black/80 rounded border border-gray-600 text-xs">
                                           <span className="text-green-400 font-medium block mb-2">Details:</span>
                                           <div className="font-mono">
                                             <JSONViewer content={JSON.stringify(task.details, null, 2)} />
                                           </div>
                                         </div>
                                       )}
                                       
                                       {/* Task Result */}
                                       {task.result && (
                                         <div className="mt-2 p-3 bg-black/80 rounded border border-gray-600 text-xs">
                                           <span className="text-green-400 font-medium block mb-2">Result:</span>
                                           <div className="font-mono">
                                             <JSONViewer content={JSON.stringify(task.result, null, 2)} />
                                           </div>
                                         </div>
                                       )}
                                       
                                       {task.error && (
                                         <p className="text-red-400 text-sm mt-2">Error: {task.error}</p>
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
                  <Bug size={48} className="mx-auto mb-4 opacity-50" />
                  <p>No task workflows yet</p>
                  <p className="text-sm mt-2">Agentic mindmap generations will appear here</p>
                </div>
              )}
            </div>
          )}
        </div>
    </BaseDialog>
  );
}
