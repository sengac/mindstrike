import React from 'react';
import { Loader2, CheckCircle, XCircle, Clock, Brain, List, Play, Eye, FileText } from 'lucide-react';
import { useTaskStore, TaskWorkflow } from '../../store/useTaskStore';

interface WorkflowProgressProps {
  workflowId: string;
  className?: string;
}

const getPhaseIcon = (phase: string) => {
  switch (phase) {
    case 'reasoning':
      return <Brain className="w-4 h-4" />;
    case 'planning':
      return <List className="w-4 h-4" />;
    case 'executing':
      return <Play className="w-4 h-4" />;
    case 'observing':
      return <Eye className="w-4 h-4" />;
    case 'finalizing':
      return <FileText className="w-4 h-4" />;
    default:
      return <Clock className="w-4 h-4" />;
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'completed':
      return <CheckCircle className="w-4 h-4 text-green-400" />;
    case 'failed':
      return <XCircle className="w-4 h-4 text-red-400" />;
    case 'in-progress':
      return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
    default:
      return <Clock className="w-4 h-4 text-gray-400" />;
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'completed':
      return 'text-green-400 bg-green-400/10 border-green-400/20';
    case 'failed':
      return 'text-red-400 bg-red-400/10 border-red-400/20';
    case 'in-progress':
      return 'text-blue-400 bg-blue-400/10 border-blue-400/20 animate-pulse';
    default:
      return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
  }
};

export const WorkflowProgress: React.FC<WorkflowProgressProps> = ({ workflowId, className = '' }) => {
  const { currentWorkflow, workflows, getWorkflowProgress } = useTaskStore();
  
  // Find the workflow by ID
  const workflow = currentWorkflow?.id === workflowId ? currentWorkflow : workflows.find(w => w.id === workflowId);
  
  if (!workflow) {
    return (
      <div className={`p-4 bg-gray-800 rounded-lg border border-gray-700 ${className}`}>
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
          <span className="text-gray-300">Initializing workflow...</span>
          <span className="text-xs text-gray-500">ID: {workflowId}</span>
        </div>
      </div>
    );
  }

  const progress = getWorkflowProgress(workflowId);
  const isActive = workflow.status === 'executing' || workflow.status === 'planning';

  return (
    <div className={`p-4 bg-gray-800 rounded-lg border border-gray-700 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {isActive ? (
            <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
          ) : workflow.status === 'completed' ? (
            <CheckCircle className="w-5 h-5 text-green-400" />
          ) : workflow.status === 'failed' ? (
            <XCircle className="w-5 h-5 text-red-400" />
          ) : (
            <Clock className="w-5 h-5 text-gray-400" />
          )}
          <h3 className="text-sm font-medium text-white">
            {isActive ? 'Processing Workflow' : 
             workflow.status === 'completed' ? 'Workflow Complete' :
             workflow.status === 'failed' ? 'Workflow Failed' : 'Workflow'}
          </h3>
        </div>
        
        {progress.total > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-400">{progress.completed}/{progress.total}</span>
            <div className="w-16 h-1 bg-gray-700 rounded">
              <div 
                className="h-full bg-purple-400 rounded transition-all duration-300"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
            <span className="text-purple-400 font-mono">{progress.percentage}%</span>
          </div>
        )}
      </div>

      {/* Task List */}
      {workflow.tasks.length > 0 && (
        <div className="space-y-2">
          {workflow.tasks.map((task, index) => {
            const isCurrentTask = index === workflow.currentTaskIndex;
            const statusColor = getStatusColor(task.status);
            
            return (
              <div
                key={task.id}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${statusColor}`}
              >
                {/* Status Icon */}
                <div className="flex-shrink-0 mt-0.5">
                  {getStatusIcon(task.status)}
                </div>
                
                {/* Task Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-gray-300">
                      Task {index + 1}
                    </span>
                    {task.priority && (
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        task.priority === 'high' ? 'bg-red-600 text-red-100' :
                        task.priority === 'medium' ? 'bg-yellow-600 text-yellow-100' :
                        'bg-gray-600 text-gray-100'
                      }`}>
                        {task.priority}
                      </span>
                    )}
                    {isCurrentTask && task.status === 'in-progress' && (
                      <div className="flex gap-1">
                        <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    )}
                  </div>
                  
                  <p className="text-sm text-gray-200 leading-relaxed">
                    {task.description}
                  </p>
                  
                  {/* Error Message */}
                  {task.error && (
                    <div className="mt-2 p-2 bg-red-900/30 border border-red-500/30 rounded text-xs text-red-200">
                      <strong>Error:</strong> {task.error}
                    </div>
                  )}
                  
                  {/* Task Result Preview */}
                  {task.result && task.status === 'completed' && (
                    <div className="mt-2 text-xs text-gray-400">
                      <div className="flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        <span>Completed</span>
                        {task.completedAt && (
                          <span className="text-gray-500">
                            at {new Date(task.completedAt).toLocaleTimeString()}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Status Message */}
      {workflow.status === 'planning' && workflow.tasks.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Creating task breakdown...</span>
        </div>
      )}
      
      {workflow.status === 'completed' && (
        <div className="mt-3 p-3 bg-green-900/20 border border-green-500/30 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-green-300">
            <CheckCircle className="w-4 h-4" />
            <span>All tasks completed successfully</span>
          </div>
          {workflow.totalChanges > 0 && (
            <p className="mt-1 text-xs text-green-400">
              Made {workflow.totalChanges} changes
            </p>
          )}
        </div>
      )}
      
      {workflow.status === 'failed' && (
        <div className="mt-3 p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-red-300">
            <XCircle className="w-4 h-4" />
            <span>Workflow failed</span>
          </div>
        </div>
      )}
    </div>
  );
};
