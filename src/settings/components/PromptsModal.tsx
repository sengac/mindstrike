import React, { useState } from 'react';
import {
  X,
  Terminal,
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { BaseDialog } from '../../components/shared/BaseDialog';
import { useDialogAnimation } from '../../hooks/useDialogAnimation';
import { logger } from '../../utils/logger';

interface PromptsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPrompt: string;
  defaultPrompt: string;
  onPromptChange: (customPrompt?: string) => void;
}

export const PromptsModal: React.FC<PromptsModalProps> = ({
  isOpen,
  onClose,
  currentPrompt,
  defaultPrompt,
  onPromptChange,
}) => {
  const { shouldRender, isVisible, handleClose } = useDialogAnimation(
    isOpen,
    onClose
  );
  const [manualPrompt, setManualPrompt] = useState(
    currentPrompt !== defaultPrompt ? currentPrompt : ''
  );
  const [customPrompt, setCustomPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showCustomPrompt, setShowCustomPrompt] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState('');
  const [showGenerator, setShowGenerator] = useState(false);

  if (!shouldRender) {
    return null;
  }

  const handleGeneratePrompt = async () => {
    if (!customPrompt.trim()) {
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch('/api/generate-prompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ personality: customPrompt.trim() }),
      });

      if (response.ok) {
        const data = await response.json();
        setGeneratedPrompt(data.prompt);
        setShowCustomPrompt(true);
      } else {
        logger.error('Failed to generate prompt');
      }
    } catch (error) {
      logger.error('Error generating prompt:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApplyPrompt = () => {
    onPromptChange(generatedPrompt);
    handleClose();
    setCustomPrompt('');
    setGeneratedPrompt('');
    setShowCustomPrompt(false);
    setShowGenerator(false);
  };

  const handleApplyManualPrompt = () => {
    onPromptChange(manualPrompt.trim() || undefined);
    handleClose();
    setManualPrompt('');
    setCustomPrompt('');
    setShowGenerator(false);
  };

  const handleUseDefault = () => {
    onPromptChange();
    handleClose();
    setManualPrompt('');
    setCustomPrompt('');
    setGeneratedPrompt('');
    setShowCustomPrompt(false);
    setShowGenerator(false);
  };

  const isUsingDefault = currentPrompt === defaultPrompt;

  return (
    <BaseDialog
      isOpen={shouldRender}
      onClose={handleClose}
      isVisible={isVisible}
      maxWidth="max-w-2xl"
      className="max-h-[80vh] overflow-y-auto"
    >
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
              <Terminal size={20} className="text-purple-600" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-white">Custom Prompts</h3>
              <p className="text-sm text-gray-400">
                Customize your assistant's role and behavior
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-200 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {!showCustomPrompt ? (
          <>
            {/* Current Prompt Display */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Current Prompt
              </label>
              <div className="bg-gray-700 border border-gray-600 rounded-lg p-3 text-sm text-gray-300">
                {currentPrompt}
              </div>
              {isUsingDefault && (
                <p className="text-xs text-gray-500 mt-1">
                  Currently using default prompt
                </p>
              )}
            </div>

            {/* Manual Prompt Input */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Custom Prompt
              </label>
              <textarea
                value={manualPrompt}
                onChange={e => setManualPrompt(e.target.value)}
                placeholder="Enter your custom prompt here..."
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                rows={4}
              />
            </div>

            {/* Generate Prompt Toggle */}
            <div className="mb-6">
              <button
                onClick={() => setShowGenerator(!showGenerator)}
                className="flex items-center space-x-2 text-purple-400 hover:text-purple-300 transition-colors"
              >
                {showGenerator ? (
                  <ChevronUp size={16} />
                ) : (
                  <ChevronDown size={16} />
                )}
                <span className="text-sm font-medium">
                  {showGenerator ? 'Hide' : 'Show'} Prompt Generator
                </span>
              </button>
            </div>

            {/* Prompt Generator (Slide Down) */}
            <div
              className={`transition-all duration-300 ease-in-out overflow-hidden ${
                showGenerator
                  ? 'max-h-96 opacity-100 mb-6'
                  : 'max-h-0 opacity-0'
              }`}
            >
              <div className="border border-gray-600 rounded-lg p-4 bg-gray-800">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Describe Your Ideal Assistant Behavior
                </label>
                <textarea
                  value={customPrompt}
                  onChange={e => setCustomPrompt(e.target.value)}
                  placeholder="e.g., 'A friendly, enthusiastic coding mentor who explains things clearly and encourages best practices'"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                  rows={3}
                  disabled={isGenerating}
                />
                <button
                  onClick={handleGeneratePrompt}
                  disabled={!customPrompt.trim() || isGenerating}
                  className="mt-3 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded transition-colors flex items-center space-x-2"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Generating...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      <span>Generate Prompt</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-3 justify-end">
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
                disabled={isGenerating}
              >
                Cancel
              </button>

              {!isUsingDefault && (
                <button
                  onClick={handleUseDefault}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                  disabled={isGenerating}
                >
                  Use Default
                </button>
              )}

              <button
                onClick={handleApplyManualPrompt}
                disabled={isGenerating}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
              >
                Apply Prompt
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Generated Prompt Preview */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Generated Prompt Definition
              </label>
              <div className="bg-gray-700 border border-gray-600 rounded-lg p-3 text-sm text-gray-300 max-h-48 overflow-y-auto">
                {generatedPrompt}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-3 justify-end">
              <button
                onClick={() => setShowCustomPrompt(false)}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
              >
                Back
              </button>

              <button
                onClick={handleApplyPrompt}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
              >
                Apply Prompt
              </button>
            </div>
          </>
        )}
      </div>
    </BaseDialog>
  );
};
