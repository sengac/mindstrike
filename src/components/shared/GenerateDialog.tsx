import { useState, useEffect, useRef } from 'react';
import { X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTaskStore, type Task } from '../../store/useTaskStore';
import { useDialogAnimation } from '../../hooks/useDialogAnimation';
import { useDebugStore } from '../../store/useDebugStore';
import { BaseDialog } from './BaseDialog';

interface GenerateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  workflowId?: string;
  isGenerating?: boolean;
  input?: string;
  onInputChange?: (value: string) => void;
  onGenerate?: () => void;
  generationSummary?: string | null;
}

export function GenerateDialog({
  isOpen,
  onClose,
  workflowId,
  isGenerating = false,
  input = '',
  onInputChange,
  onGenerate,
  generationSummary
}: GenerateDialogProps) {
  const [dots, setDots] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const wasGeneratingRef = useRef(false);
  
  // Add animation for smooth appearance/disappearance
  const { shouldRender, isVisible, handleClose } = useDialogAnimation(isOpen, onClose);
  
  // Use debug store for token performance metrics with explicit selectors
  const currentTokensPerSecond = useDebugStore(state => state.currentTokensPerSecond);
  const currentTotalTokens = useDebugStore(state => state.currentTotalTokens);
  const updateTokenStats = useDebugStore(state => state.updateTokenStats);
  

  
  // PURE Zustand store consumer - NO EventSource here!
  const storeState = useTaskStore();
  
  // Get workflow data
  const currentWorkflow = storeState.currentWorkflow;
  const workflows = storeState.workflows;
  const workflowData = workflowId ? workflows.find(w => w.id === workflowId) : null;
  const displayWorkflow = currentWorkflow || workflowData;
  


  // Animate the dots
  useEffect(() => {
    if (!isVisible || !isGenerating) return;

    const interval = setInterval(() => {
      setDots(prev => {
        if (prev === '...') return '';
        return prev + '.';
      });
    }, 500);

    return () => clearInterval(interval);
  }, [isVisible, isGenerating]);

  // Force component updates every second during generation to ensure token stats refresh
  useEffect(() => {
    if (!isVisible || !isGenerating) return;

    const tokenInterval = setInterval(() => {
      // Force re-render by accessing store state (triggers subscription check)
      const currentState = useDebugStore.getState();
      if (currentState.currentTokensPerSecond > 0) {
        // If we have real token data, force component update
        updateTokenStats(currentState.currentTokensPerSecond, currentState.currentTotalTokens);
      } else {
        // Force re-render even with 0 values
        updateTokenStats(0, 0);
      }
    }, 1000);

    return () => clearInterval(tokenInterval);
  }, [isVisible, isGenerating, updateTokenStats]);

  // Focus input when dialog opens and not generating
  useEffect(() => {
    if (isVisible && !isGenerating && inputRef.current) {
      // Small delay to ensure the element is fully rendered and focusable
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isVisible, isGenerating]);

  // Handle generation completion - close dialog and show toast
  useEffect(() => {
    if (isGenerating) {
      wasGeneratingRef.current = true;
    } else if (wasGeneratingRef.current && isVisible) {
      // Generation just finished
      wasGeneratingRef.current = false;
      
      // Calculate progress for toast message
      let completedTasks = 0;
      if (displayWorkflow && displayWorkflow.tasks.length > 0) {
        completedTasks = displayWorkflow.tasks.filter((t: any) => t.status === 'completed').length;
      }
      
      // Close the dialog
      handleClose();
      
      // Show success toast with summary
      const message = generationSummary || 
                     (completedTasks > 0 ? `Generated ${completedTasks} ideas successfully` : 'Generation completed');
      toast.success(message);
    }
  }, [isGenerating, isVisible, handleClose, generationSummary, displayWorkflow]);

  // Helper functions for workflow data
  const getProgress = () => {
    if (!displayWorkflow || !displayWorkflow.tasks.length) return { completed: 0, total: 0, percentage: 0 };
    
    const completed = displayWorkflow.tasks.filter((t: Task) => t.status === 'completed').length;
    const total = displayWorkflow.tasks.length;
    const percentage = total > 0 ? (completed / total) * 100 : 0;
    
    return { completed, total, percentage };
  };
  
  const getActiveTask = () => {
    if (!displayWorkflow || !displayWorkflow.tasks.length) return null;
    return displayWorkflow.tasks.find((t: Task) => t.status === 'in-progress') || 
           displayWorkflow.tasks[displayWorkflow.currentTaskIndex] ||
           null;
  };

  if (!shouldRender) return null;

  const progress = getProgress();
  const activeTask = getActiveTask();

  return (
    <BaseDialog
      isOpen={shouldRender}
      onClose={handleClose}
      isVisible={isVisible}
      maxWidth="max-w-2xl"
      closeOnOverlayClick={!isGenerating}
      className={isGenerating ? 'p-8' : ''}
    >
        {/* Header */}
        <div className={`flex items-center justify-between ${isGenerating ? 'mb-6' : 'p-4 border-b border-gray-700'}`}>
          <div className="flex items-center gap-3">
            {isGenerating && <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />}
            <h2 className="text-xl font-semibold text-white">
              {isGenerating ? 'Generating Content' : 'Generate Ideas'}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-700 rounded-full transition-colors text-gray-400 hover:text-white"
            title={isGenerating ? "Cancel Generation" : "Close"}
          >
            <X size={20} />
          </button>
        </div>

        {!isGenerating ? (
          /* Input Form */
          <form className="p-6" onSubmit={(e) => { 
            e.preventDefault(); 
            onGenerate?.(); 
          }}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                What ideas would you like to explore for this node?
              </label>
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => onInputChange?.(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    handleClose();
                  }
                }}
                placeholder="Describe what you'd like to generate or explore..."
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                disabled={isGenerating}
              />
              <div className="mt-2 text-xs text-gray-400">
                Press Enter to generate, Esc to close
              </div>
            </div>
            

            
            {/* Footer for Input Form */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-700">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <input
                type="submit"
                value={isGenerating ? 'Generating...' : 'Generate'}
                disabled={!input.trim() || isGenerating}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded-lg font-medium transition-colors cursor-pointer"
              />
            </div>
          </form>
        ) : (
          /* Generation Progress */
          <>
            {/* Status */}
            <div className="mb-6">
              <p className="text-gray-300 text-lg font-medium">
                Generating...{dots}
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
                  {displayWorkflow.tasks.slice(0, 5).map((task: Task, index: number) => (
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
                    {currentTokensPerSecond.toFixed(1)}
                  </span>
                  <span className="text-gray-400 text-sm ml-1">tokens/sec</span>
                </div>
              </div>

              {/* Total tokens */}
              <div className="flex justify-between items-center p-3 bg-gray-700/50 rounded-lg">
                <span className="text-gray-300 font-medium">Tokens Generated</span>
                <div className="text-right">
                  <span className="text-white font-mono text-lg">
                    {currentTotalTokens.toLocaleString()}
                  </span>
                  <span className="text-gray-400 text-sm ml-1">tokens</span>
                </div>
              </div>
            </div>

            {/* Cancel Button */}
            <div className="mt-6 pt-4 border-t border-gray-600">
              <button
                onClick={handleClose}
                className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
              >
                Cancel Generation
              </button>
            </div>
          </>
        )}
    </BaseDialog>
  );
}
