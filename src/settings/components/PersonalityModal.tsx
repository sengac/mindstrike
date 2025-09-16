import React, { useState } from 'react';
import { X, User, Sparkles, Loader2 } from 'lucide-react';
import { BaseDialog } from '../../components/shared/BaseDialog';
import { useDialogAnimation } from '../../hooks/useDialogAnimation';

interface PersonalityModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRole: string;
  defaultRole: string;
  onRoleChange: (customRole?: string) => void;
}

export const PersonalityModal: React.FC<PersonalityModalProps> = ({
  isOpen,
  onClose,
  currentRole,
  defaultRole,
  onRoleChange,
}) => {
  const { shouldRender, isVisible, handleClose } = useDialogAnimation(
    isOpen,
    onClose
  );
  const [customPersonality, setCustomPersonality] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showCustomRole, setShowCustomRole] = useState(false);
  const [generatedRole, setGeneratedRole] = useState('');

  if (!shouldRender) return null;

  const handleGenerateRole = async () => {
    if (!customPersonality.trim()) return;

    setIsGenerating(true);
    try {
      const response = await fetch('/api/generate-role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ personality: customPersonality.trim() }),
      });

      if (response.ok) {
        const data = await response.json();
        setGeneratedRole(data.role);
        setShowCustomRole(true);
      } else {
        console.error('Failed to generate role');
      }
    } catch (error) {
      console.error('Error generating role:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApplyRole = () => {
    onRoleChange(generatedRole);
    handleClose();
    setCustomPersonality('');
    setGeneratedRole('');
    setShowCustomRole(false);
  };

  const handleUseDefault = () => {
    onRoleChange();
    handleClose();
    setCustomPersonality('');
    setGeneratedRole('');
    setShowCustomRole(false);
  };

  const isUsingDefault = currentRole === defaultRole;

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
              <User size={20} className="text-purple-600" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-white">
                Change Personality
              </h3>
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

        {!showCustomRole ? (
          <>
            {/* Current Role Display */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Current Role
              </label>
              <div className="bg-gray-700 border border-gray-600 rounded-lg p-3 text-sm text-gray-300">
                {currentRole}
              </div>
              {isUsingDefault && (
                <p className="text-xs text-gray-500 mt-1">
                  Currently using default role
                </p>
              )}
            </div>

            {/* Personality Input */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Describe Your Ideal Assistant Personality
              </label>
              <textarea
                value={customPersonality}
                onChange={e => setCustomPersonality(e.target.value)}
                placeholder="e.g., 'A friendly, enthusiastic coding mentor who explains things clearly and encourages best practices'"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                rows={3}
                disabled={isGenerating}
              />
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
                onClick={handleGenerateRole}
                disabled={!customPersonality.trim() || isGenerating}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded transition-colors flex items-center space-x-2"
              >
                {isGenerating ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>Generate Role</span>
                  </>
                )}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Generated Role Preview */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Generated Role Definition
              </label>
              <div className="bg-gray-700 border border-gray-600 rounded-lg p-3 text-sm text-gray-300 max-h-48 overflow-y-auto">
                {generatedRole}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-3 justify-end">
              <button
                onClick={() => setShowCustomRole(false)}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
              >
                Back
              </button>

              <button
                onClick={handleApplyRole}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
              >
                Apply Role
              </button>
            </div>
          </>
        )}
      </div>
    </BaseDialog>
  );
};
