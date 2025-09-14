import React, { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useTaskStore } from '../../store/useTaskStore';

interface GeneratingBlockerProps {
  isVisible: boolean;
  onCancel: () => void;
  status?: string;
  tokensPerSecond?: number;
  totalTokens?: number;
  workflowId?: string;
}

export function GeneratingBlocker({
  isVisible,
  onCancel,
  status = 'Generating...',
  tokensPerSecond = 0,
  totalTokens = 0,
  workflowId
}: GeneratingBlockerProps) {
  const [dots, setDots] = useState('');
  
  // PURE Zustand store consumer - NO EventSource here!
  const storeState = useTaskStore();
  
  // Get workflow data
  const currentWorkflow = storeState.currentWorkflow;
  const workflows = storeState.workflows;
  const workflowData = workflowId ? workflows[workflowId] : null;
  const displayWorkflow = currentWorkflow || workflowData;
  


  // Animate the dots
  useEffect(() => {
    if (!isVisible) return;

    const interval = setInterval(() => {
      setDots(prev => {
        if (prev === '...') return '';
        return prev + '.';
      });
    }, 500);

    return () => clearInterval(interval);
  }, [isVisible]);

  // Helper functions for workflow data
  const getProgress = () => {
    if (!displayWorkflow || !displayWorkflow.tasks.length) return { completed: 0, total: 0, percentage: 0 };
    
    const completed = displayWorkflow.tasks.filter(t => t.status === 'completed').length;
    const total = displayWorkflow.tasks.length;
    const percentage = total > 0 ? (completed / total) * 100 : 0;
    
    return { completed, total, percentage };
  };
  
  const getActiveTask = () => {
    if (!displayWorkflow || !displayWorkflow.tasks.length) return null;
    return displayWorkflow.tasks.find(t => t.status === 'in-progress') || 
           displayWorkflow.tasks[displayWorkflow.currentTaskIndex] ||
           null;
  };

  if (!isVisible) return null;

  const progress = getProgress();
  const activeTask = getActiveTask();

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-gray-800 border border-gray-600 rounded-lg p-8 max-w-md w-full mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
            <h2 className="text-xl font-semibold text-white">Generating Content</h2>
          </div>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-gray-700 rounded-full transition-colors text-gray-400 hover:text-white"
            title="Cancel Generation"
          >
            <X size={20} />
          </button>
        </div>

        {/* Status */}
        <div className="mb-6">
          <p className="text-gray-300 text-lg font-medium">
            {status}{dots}
          </p>
        </div>

        {/* Task Progress - Show when there's a workflow OR we're expecting one */}
        {(displayWorkflow || workflowId) && (
          <div className="mb-6 p-4 bg-gray-700/50 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-medium">Task Progress</h3>
              <span className="text-sm text-gray-400">
                {displayWorkflow && displayWorkflow.tasks.length > 0 ? (
                  `${progress.completed}/${progress.total} tasks`
                ) : workflowId ? (
                  'Planning tasks...'
                ) : (
                  'Preparing...'
                )}
              </span>
            </div>
            
            {displayWorkflow && displayWorkflow.tasks.length > 0 ? (
              <>
                {/* Progress Bar */}
                <div className="w-full bg-gray-600 rounded-full h-2 mb-4">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${progress.percentage}%` }}
                  />
                </div>

                {/* Active Task */}
                {activeTask && (
                  <div className="mb-3">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-sm text-gray-400">Currently working on:</span>
                      <span className="text-xs px-2 py-1 bg-blue-600 text-white rounded">
                        {activeTask.type.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-sm text-white">
                      {activeTask.description}
                    </p>
                  </div>
                )}

                {/* Task List - Compact View */}
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {displayWorkflow.tasks.slice(0, 5).map((task, index) => (
                    <div
                      key={task.id}
                      className={`flex items-center space-x-2 text-xs p-2 rounded ${
                        task.status === 'in-progress'
                          ? 'bg-blue-600/30 border border-blue-500/50'
                          : task.status === 'completed'
                          ? 'bg-green-600/30'
                          : task.status === 'failed'
                          ? 'bg-red-600/30'
                          : 'bg-gray-600/30'
                      }`}
                    >
                      <span className="text-sm">
                        {task.status === 'completed' ? '✅' : 
                         task.status === 'in-progress' ? '🔄' : 
                         task.status === 'failed' ? '❌' : '⏳'}
                      </span>
                      <span className="flex-1 text-gray-200 truncate">
                        {task.description}
                      </span>
                      <span className="text-gray-400 font-mono">
                        {index + 1}
                      </span>
                    </div>
                  ))}
                  {displayWorkflow.tasks.length > 5 && (
                    <div className="text-xs text-gray-400 text-center py-1">
                      ... and {displayWorkflow.tasks.length - 5} more tasks
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* Loading State */
              <div className="flex items-center justify-center py-8">
                <div className="flex items-center space-x-3">
                  <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-gray-300">
                    Planning tasks...
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="space-y-3">
          {/* Tokens per second */}
          <div className="flex justify-between items-center p-3 bg-gray-700/50 rounded-lg">
            <span className="text-gray-300 font-medium">Generation Speed</span>
            <div className="text-right">
              <span className="text-white font-mono text-lg">
                {tokensPerSecond.toFixed(1)}
              </span>
              <span className="text-gray-400 text-sm ml-1">tokens/sec</span>
            </div>
          </div>

          {/* Total tokens */}
          <div className="flex justify-between items-center p-3 bg-gray-700/50 rounded-lg">
            <span className="text-gray-300 font-medium">Tokens Generated</span>
            <div className="text-right">
              <span className="text-white font-mono text-lg">
                {totalTokens.toLocaleString()}
              </span>
              <span className="text-gray-400 text-sm ml-1">tokens</span>
            </div>
          </div>
        </div>

        {/* Cancel Button */}
        <div className="mt-6 pt-4 border-t border-gray-600">
          <button
            onClick={onCancel}
            className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
          >
            Cancel Generation
          </button>
        </div>
      </div>
    </div>
  );
}
