import { useState, useEffect, useRef } from 'react';
import { X, Loader2, Brain, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { useDialogAnimation } from '../../hooks/useDialogAnimation';
import { useMindMapGeneration } from '../../store/useMindMapStore';
import { BaseDialog } from './BaseDialog';

interface GenerateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  input?: string;
  onInputChange?: (value: string) => void;
  onGenerate?: () => void;
}

export function GenerateDialog({
  isOpen,
  onClose,
  input = '',
  onInputChange,
  onGenerate,
}: GenerateDialogProps) {
  const [dots, setDots] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const wasGeneratingRef = useRef(false);

  const { shouldRender, isVisible, handleClose } = useDialogAnimation(
    isOpen,
    onClose
  );

  // Store state
  const {
    isGenerating,
    generationError,
    generationSummary,
    generationProgress,
    cancelIterativeGeneration,
  } = useMindMapGeneration();

  // Token performance metrics from generation progress
  const currentTokensPerSecond = generationProgress?.tokensPerSecond || 0;
  const currentTotalTokens = generationProgress?.totalTokens || 0;

  // Animate dots
  useEffect(() => {
    if (!isVisible || !isGenerating) {
      return;
    }
    const interval = setInterval(() => {
      setDots(prev => (prev === '...' ? '' : prev + '.'));
    }, 500);
    return () => clearInterval(interval);
  }, [isVisible, isGenerating]);

  // Focus input when dialog opens
  useEffect(() => {
    if (isVisible && !isGenerating && inputRef.current) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isVisible, isGenerating]);

  // Handle generation completion
  useEffect(() => {
    if (isGenerating) {
      wasGeneratingRef.current = true;
    } else if (wasGeneratingRef.current && isVisible) {
      wasGeneratingRef.current = false;
      handleClose();

      if (generationError) {
        toast.error(generationError);
      } else if (generationSummary) {
        toast.success(generationSummary);
      }
    }
  }, [
    isGenerating,
    isVisible,
    handleClose,
    generationSummary,
    generationError,
  ]);

  if (!shouldRender) {
    return null;
  }

  return (
    <BaseDialog
      isOpen={shouldRender}
      onClose={handleClose}
      isVisible={isVisible}
      maxWidth="max-w-lg"
      closeOnOverlayClick={!isGenerating}
    >
      {!isGenerating ? (
        // Input form
        <div className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <Brain className="w-6 h-6 text-purple-400" />
            <h2 className="text-xl font-semibold text-white">Generate Ideas</h2>
          </div>

          <form
            onSubmit={e => {
              e.preventDefault();
              onGenerate?.();
            }}
          >
            <div className="mb-6">
              <input
                ref={inputRef}
                value={input}
                onChange={e => onInputChange?.(e.target.value)}
                onKeyDown={e => e.key === 'Escape' && handleClose()}
                placeholder="What ideas would you like to explore?"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                disabled={isGenerating}
              />
              <p className="mt-2 text-xs text-gray-400">
                Press Enter to generate • Esc to close
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!input.trim() || isGenerating}
                className="flex-1 px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded-lg font-medium transition-colors"
              >
                Generate
              </button>
            </div>
          </form>
        </div>
      ) : (
        // Generation in progress
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
              <h2 className="text-xl font-semibold text-white">
                Generating{dots}
              </h2>
            </div>
            <button
              onClick={() => {
                cancelIterativeGeneration();
                handleClose();
              }}
              className="p-2 hover:bg-gray-700 rounded-full transition-colors text-gray-400 hover:text-white"
              title="Cancel Generation"
            >
              <X size={20} />
            </button>
          </div>

          {/* Token Performance - Compact side by side */}
          <div className="flex gap-4 mb-6">
            <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-gray-800 rounded-lg">
              <Zap className="w-4 h-4 text-blue-400" />
              <span className="text-gray-300 text-sm">Speed:</span>
              <span className="text-white font-mono text-sm ml-auto">
                {currentTokensPerSecond.toFixed(1)} tok/s
              </span>
            </div>
            <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-gray-800 rounded-lg">
              <div className="w-4 h-4 rounded bg-green-400" />
              <span className="text-gray-300 text-sm">Total:</span>
              <span className="text-white font-mono text-sm ml-auto">
                {currentTotalTokens.toLocaleString()}
              </span>
            </div>
          </div>

          {/* AI Reasoning Stream */}
          <div className="mb-6 p-4 bg-gray-800 rounded-xl border border-gray-700">
            <div className="flex items-center gap-2 mb-4">
              <Brain className="w-4 h-4 text-purple-400" />
              <span className="text-white font-medium">AI Reasoning</span>
              {generationProgress?.isComplete && (
                <span className="text-xs px-2 py-1 bg-green-600 text-white rounded-full ml-auto">
                  Complete
                </span>
              )}
            </div>

            {/* Original Query */}
            {input && (
              <div className="mb-4 p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 bg-blue-400 rounded-full" />
                  <span className="text-xs font-medium text-blue-300">
                    Your Request
                  </span>
                </div>
                <p className="text-sm text-blue-100 italic">"{input}"</p>
              </div>
            )}

            {/* Scrolling reasoning steps */}
            <div className="max-h-48 overflow-y-auto space-y-3 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
              {generationProgress ? (
                <div className="space-y-3">
                  {/* Current active step */}
                  <div className="flex items-start gap-3 p-3 bg-purple-900/30 border border-purple-500/50 rounded-lg animate-pulse">
                    <div className="w-2 h-2 bg-purple-400 rounded-full mt-2 animate-bounce" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-purple-300">
                          Step {generationProgress.currentStep}
                        </span>
                        {generationProgress.decision && (
                          <span className="text-xs px-2 py-0.5 bg-purple-600 text-purple-100 rounded">
                            {generationProgress.decision.replace('_', ' ')}
                          </span>
                        )}
                        <div className="flex gap-1 ml-auto">
                          <div
                            className="w-1 h-1 bg-purple-400 rounded-full animate-bounce"
                            style={{ animationDelay: '0ms' }}
                          />
                          <div
                            className="w-1 h-1 bg-purple-400 rounded-full animate-bounce"
                            style={{ animationDelay: '150ms' }}
                          />
                          <div
                            className="w-1 h-1 bg-purple-400 rounded-full animate-bounce"
                            style={{ animationDelay: '300ms' }}
                          />
                        </div>
                      </div>
                      <p className="text-sm text-gray-200 leading-relaxed">
                        {generationProgress.reasoning ||
                          'Analyzing and planning next steps...'}
                      </p>
                    </div>
                  </div>

                  {/* Previous completed steps (simulated for demo) */}
                  {generationProgress.currentStep > 1 && (
                    <div className="space-y-2">
                      {Array.from(
                        {
                          length: Math.min(
                            generationProgress.currentStep - 1,
                            3
                          ),
                        },
                        (_, i) => {
                          const stepNum =
                            generationProgress.currentStep - 1 - i;
                          return (
                            <div
                              key={stepNum}
                              className="flex items-start gap-3 p-3 bg-gray-700/50 rounded-lg opacity-70"
                            >
                              <div className="w-2 h-2 bg-green-400 rounded-full mt-2" />
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-medium text-gray-400">
                                    Step {stepNum}
                                  </span>
                                  <span className="text-xs px-2 py-0.5 bg-gray-600 text-gray-300 rounded">
                                    completed
                                  </span>
                                </div>
                                <p className="text-sm text-gray-400 leading-relaxed">
                                  {stepNum === 1
                                    ? 'Initial analysis of the topic and context'
                                    : stepNum === 2
                                      ? 'Generated conceptual framework and key themes'
                                      : 'Refined ideas and structured content'}
                                </p>
                              </div>
                            </div>
                          );
                        }
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* Initial loading state */
                <div className="flex items-start gap-3 p-3 bg-blue-900/30 border border-blue-500/50 rounded-lg">
                  <div className="w-2 h-2 bg-blue-400 rounded-full mt-2 animate-pulse" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-blue-300">
                        Initializing
                      </span>
                      <div className="flex gap-1 ml-auto">
                        <div
                          className="w-1 h-1 bg-blue-400 rounded-full animate-bounce"
                          style={{ animationDelay: '0ms' }}
                        />
                        <div
                          className="w-1 h-1 bg-blue-400 rounded-full animate-bounce"
                          style={{ animationDelay: '150ms' }}
                        />
                        <div
                          className="w-1 h-1 bg-blue-400 rounded-full animate-bounce"
                          style={{ animationDelay: '300ms' }}
                        />
                      </div>
                    </div>
                    <p className="text-sm text-gray-200 leading-relaxed">
                      Starting iterative reasoning process...
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Cancel button */}
          <button
            onClick={() => {
              cancelIterativeGeneration();
              handleClose();
            }}
            className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
          >
            Cancel Generation
          </button>
        </div>
      )}
    </BaseDialog>
  );
}
