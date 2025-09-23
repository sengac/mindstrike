import React, { useState, useRef, useEffect } from 'react';
import { ChevronUp, Cpu, RefreshCw, Settings } from 'lucide-react';
import type { LLMModel } from '../../hooks/useModels';
import {
  getContextDescription,
  getActualContextSize,
} from '../../utils/tokenUtils';
import { useAppStore } from '../../store/useAppStore';
import { useModelsStore } from '../../store/useModelsStore';
import toast from 'react-hot-toast';

interface ModelSelectionPopupProps {
  className?: string;
}

const ModelSelectionPopup: React.FC<ModelSelectionPopupProps> = ({
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const {
    models,
    isLoading,
    error,
    setDefaultModel,
    rescanModels,
    getDefaultModel,
  } = useModelsStore();
  const { setActiveView } = useAppStore();
  const defaultModel = getDefaultModel();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Auto-select first model if none selected and models are available
  useEffect(() => {
    if (models.length === 0) {
      return;
    }

    // If no default model is set, auto-select the first available model
    if (!defaultModel) {
      setDefaultModel(models[0].id).catch((error: unknown) => {
        console.error('Failed to set default model:', error);
        toast.error('Failed to set default model');
      });
    }
  }, [models, defaultModel, setDefaultModel]);

  const handleModelSelect = async (model: LLMModel) => {
    try {
      await setDefaultModel(model.id);
      setIsOpen(false);
      toast.success(`Switched to ${model.displayName}`);
    } catch (error) {
      console.error('Failed to set default model:', error);
      toast.error('Failed to switch model');
    }
  };

  const handleRescan = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      toast.success('Rescanning for available models...');
      await rescanModels();
      toast.success('Model scan completed');
    } catch (error) {
      console.error('Failed to rescan models:', error);
      toast.error('Failed to rescan models');
    }
  };

  const handleDownloadModels = () => {
    setActiveView('settings');
    setIsOpen(false);
  };

  const displayText = defaultModel
    ? defaultModel.displayName.split(' | ')[0]
    : models.length > 0
      ? 'Select Model'
      : 'No models';

  return (
    <div className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="p-1.5 bg-gray-600 hover:bg-gray-700 rounded-md transition-colors text-white flex items-center gap-1"
        title={defaultModel?.displayName || displayText}
      >
        <Cpu size={14} />
        <ChevronUp
          size={14}
          className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          ref={popupRef}
          className="absolute bottom-full left-0 mb-2 w-80 bg-dark-bg border border-gray-600 rounded-lg shadow-lg z-50 max-h-64 overflow-hidden"
        >
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Cpu size={16} className="text-gray-400" />
                <h3 className="text-sm font-medium text-gray-200">
                  Select Model
                </h3>
              </div>
              <button
                onClick={handleRescan}
                className="p-1 hover:bg-gray-700 rounded transition-colors"
                title="Rescan for available models"
              >
                <RefreshCw
                  size={14}
                  className={`text-gray-400 ${isLoading ? 'animate-spin' : ''}`}
                />
              </button>
            </div>

            <div className="max-h-48 overflow-y-auto">
              {error && (
                <div className="mb-3 p-2 bg-red-900/20 border border-red-600/30 rounded text-xs text-red-400">
                  Error: {error}
                </div>
              )}

              {isLoading && (
                <div className="flex items-center justify-center py-4 text-xs text-gray-400">
                  <RefreshCw size={12} className="animate-spin mr-2" />
                  Scanning for models...
                </div>
              )}

              {!isLoading && models.length === 0 && (
                <div className="text-center py-4 space-y-3">
                  <div className="text-xs text-gray-400">
                    No models available. Download LLMs from settings.
                  </div>
                  <button
                    onClick={handleDownloadModels}
                    className="w-full flex items-center justify-center gap-2 p-2 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                  >
                    <Settings size={12} />
                    Download Models
                  </button>
                </div>
              )}

              {models.length > 0 && (
                <div className="space-y-1">
                  {models.map((model: LLMModel) => {
                    const actualContext = getActualContextSize(model);
                    const contextInfo = actualContext
                      ? getContextDescription(actualContext)
                      : '';
                    return (
                      <button
                        key={`${model.serviceId}-${model.model}`}
                        onClick={() => handleModelSelect(model)}
                        className={`w-full text-left p-3 rounded-lg transition-colors group ${
                          model.isDefault
                            ? 'bg-blue-900/30 hover:bg-blue-900/40'
                            : 'bg-dark-hover hover:bg-gray-700'
                        }`}
                        title={`${model.displayName}${contextInfo ? ` - ${contextInfo}` : ''}`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex-shrink-0 ${
                              model.isDefault
                                ? 'text-blue-300'
                                : 'text-gray-400 group-hover:text-gray-200'
                            }`}
                          >
                            <Cpu size={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div
                              className={`text-sm font-medium truncate ${
                                model.isDefault
                                  ? 'text-blue-200 group-hover:text-blue-100'
                                  : 'text-gray-200 group-hover:text-white'
                              }`}
                            >
                              {model.displayName.split(' | ')[0]}
                            </div>
                            <div
                              className={`text-xs truncate flex items-center gap-1 ${
                                model.isDefault
                                  ? 'text-blue-300/70'
                                  : 'text-gray-400'
                              }`}
                            >
                              <span>{model.serviceName}</span>
                              {contextInfo && (
                                <>
                                  <span>•</span>
                                  <span>{contextInfo}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelSelectionPopup;
