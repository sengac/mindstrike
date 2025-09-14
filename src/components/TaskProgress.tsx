import React, { useEffect } from 'react';
import { useTaskStore, connectToTaskUpdates } from '../store/useTaskStore';

interface TaskProgressProps {
  workflowId?: string;
  className?: string;
}

export const TaskProgress: React.FC<TaskProgressProps> = ({ workflowId, className = '' }) => {
  const {
    currentWorkflow,
    isVisible,
    isLoading,
    error,
    getWorkflowProgress,
    getActiveTask,
    clearCurrentWorkflow
  } = useTaskStore();

  // Connect to SSE updates when workflow starts
  useEffect(() => {
    if (workflowId && currentWorkflow?.id === workflowId) {
      const eventSource = connectToTaskUpdates(workflowId);
      return () => eventSource.close();
    }
  }, [workflowId, currentWorkflow?.id]);

  // Don't render if not visible or no workflow
  if (!isVisible || !currentWorkflow) {
    return null;
  }

  const progress = getWorkflowProgress(currentWorkflow.id);
  const activeTask = getActiveTask();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return '✅';
      case 'in-progress':
        return '🔄';
      case 'failed':
        return '❌';
      default:
        return '⏳';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'text-red-600 dark:text-red-400';
      case 'medium':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'low':
        return 'text-green-600 dark:text-green-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  return (
    <div className={`task-progress-container ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Task Progress
          </h3>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {currentWorkflow.status === 'planning' && 'Planning tasks...'}
              {currentWorkflow.status === 'executing' && 'Executing tasks...'}
              {currentWorkflow.status === 'completed' && 'Completed'}
              {currentWorkflow.status === 'failed' && 'Failed'}
            </span>
          </div>
        </div>
        
        {/* Close button */}
        <button
          onClick={clearCurrentWorkflow}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1"
          title="Close"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
          <span>Progress: {progress.completed}/{progress.total} tasks</span>
          <span>{progress.percentage}%</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progress.percentage}%` }}
          />
        </div>
      </div>

      {/* Original Query */}
      <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Original Request:
        </h4>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {currentWorkflow.originalQuery}
        </p>
      </div>

      {/* Active Task Highlight */}
      {activeTask && (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg">
          <div className="flex items-center space-x-2 mb-1">
            <span className="text-lg">{getStatusIcon(activeTask.status)}</span>
            <h4 className="text-sm font-medium text-blue-800 dark:text-blue-200">
              Currently Active:
            </h4>
          </div>
          <p className="text-sm text-blue-700 dark:text-blue-300">
            {activeTask.description}
          </p>
          {activeTask.status === 'in-progress' && (
            <div className="mt-2 flex items-center space-x-2">
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin opacity-60"></div>
              <span className="text-xs text-blue-600 dark:text-blue-400">
                Working on this task...
              </span>
            </div>
          )}
        </div>
      )}

      {/* Task List */}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {currentWorkflow.tasks.map((task, index) => (
          <div
            key={task.id}
            className={`flex items-center space-x-3 p-2 rounded-lg transition-colors ${
              task.status === 'in-progress'
                ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700'
                : task.status === 'completed'
                ? 'bg-green-50 dark:bg-green-900/30'
                : task.status === 'failed'
                ? 'bg-red-50 dark:bg-red-900/30'
                : 'bg-gray-50 dark:bg-gray-800'
            }`}
          >
            {/* Status Icon */}
            <span className="text-lg flex-shrink-0">
              {getStatusIcon(task.status)}
            </span>

            {/* Task Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  {task.type}
                </span>
                <span className={`text-xs font-medium uppercase tracking-wide ${getPriorityColor(task.priority)}`}>
                  {task.priority}
                </span>
              </div>
              <p className="text-sm text-gray-900 dark:text-gray-100 truncate">
                {task.description}
              </p>
              {task.error && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                  Error: {task.error}
                </p>
              )}
            </div>

            {/* Task Number */}
            <div className="flex-shrink-0 text-xs text-gray-500 dark:text-gray-400 font-mono">
              {index + 1}
            </div>
          </div>
        ))}
      </div>

      {/* Error Display */}
      {error && (
        <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg">
          <h4 className="text-sm font-medium text-red-800 dark:text-red-200 mb-1">
            Workflow Error:
          </h4>
          <p className="text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        </div>
      )}

      {/* Completion Summary */}
      {currentWorkflow.status === 'completed' && (
        <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg">
          <div className="flex items-center space-x-2 mb-1">
            <span className="text-lg">🎉</span>
            <h4 className="text-sm font-medium text-green-800 dark:text-green-200">
              Workflow Completed Successfully!
            </h4>
          </div>
          <p className="text-sm text-green-700 dark:text-green-300">
            {progress.completed} tasks completed • {currentWorkflow.totalChanges} changes made
          </p>
          {currentWorkflow.completedAt && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
              Finished at {currentWorkflow.completedAt.toLocaleTimeString()}
            </p>
          )}
        </div>
      )}

      {/* Loading State */}
      {isLoading && currentWorkflow.status === 'planning' && (
        <div className="mt-4 flex items-center justify-center space-x-2 p-4">
          <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Planning your tasks...
          </span>
        </div>
      )}
    </div>
  );
};

export default TaskProgress;
