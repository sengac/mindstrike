import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, RefreshCw, Cpu, Settings } from 'lucide-react';
import { LLMModel } from '../../hooks/useModels';
import {
  getContextDescription,
  getActualContextSize,
} from '../../utils/tokenUtils';
import { useAppStore } from '../../store/useAppStore';
import { useModelsStore } from '../../store/useModelsStore';
import toast from 'react-hot-toast';

interface ModelSelectorProps {
  className?: string;
}

export function ModelSelector({ className = '' }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const {
    models,
    isLoading,
    error,
    setDefaultModel,
    rescanModels,
    getDefaultModel,
  } = useModelsStore();
  const { setActivePanel } = useAppStore();
  const defaultModel = getDefaultModel();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-select first model if none selected and models are available
  useEffect(() => {
    if (models.length === 0) return;

    // If no default model is set, auto-select the first available model
    if (!defaultModel) {
      setDefaultModel(models[0].id).catch((error: any) => {
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

  const displayText = defaultModel
    ? defaultModel.displayName
    : models.length > 0
      ? 'Select Model'
      : 'No models available';

  const truncateText = (text: string, maxLength: number = 30) => {
    return text.length > maxLength
      ? text.substring(0, maxLength) + '...'
      : text;
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-200 transition-colors min-w-[220px] justify-between"
        disabled={isLoading || models.length === 0}
        title={defaultModel?.displayName || displayText}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Cpu size={14} className="text-gray-400 flex-shrink-0" />
          <span className="truncate text-left">
            {truncateText(displayText)}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <div
            onClick={handleRescan}
            className="p-0.5 hover:bg-gray-600 rounded transition-colors cursor-pointer"
            title="Rescan for available models"
          >
            <RefreshCw
              size={12}
              className={`text-gray-400 ${isLoading ? 'animate-spin' : ''}`}
            />
          </div>
          <ChevronDown
            size={14}
            className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-dark-hover border border-gray-600 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
          {error && (
            <div className="px-3 py-2 text-xs text-red-400 border-b border-gray-700">
              Error: {error}
            </div>
          )}

          {isLoading && (
            <div className="px-3 py-2 text-xs text-gray-400 flex items-center gap-2">
              <RefreshCw size={12} className="animate-spin" />
              Scanning for models...
            </div>
          )}

          {!isLoading && models.length === 0 && (
            <div className="px-3 py-3 space-y-3">
              <div className="text-xs text-gray-400 text-center">
                No models available. You can download LLMs from the settings
                area and run them locally.
              </div>
              <button
                onClick={() => {
                  setActivePanel('settings');
                  setIsOpen(false);
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
              >
                <Settings size={12} />
                Download Models
              </button>
            </div>
          )}

          {models.map((model: LLMModel) => {
            const actualContext = getActualContextSize(model);
            const contextInfo = actualContext
              ? getContextDescription(actualContext)
              : '';
            return (
              <button
                key={`${model.serviceId}-${model.model}`}
                onClick={() => handleModelSelect(model)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-700 transition-colors border-b border-gray-700 last:border-b-0 ${
                  model.isDefault ? 'bg-gray-600 text-white' : 'text-gray-200'
                }`}
                title={`${model.displayName}${contextInfo ? ` - ${contextInfo}` : ''}`}
              >
                <div className="flex flex-col gap-0.5">
                  <div className="font-medium truncate">
                    {model.displayName.split(' | ')[0]}
                  </div>
                  <div className="text-xs text-gray-400 truncate flex items-center gap-1">
                    <span>{model.serviceName}</span>
                    {contextInfo && (
                      <>
                        <span>•</span>
                        <span>{contextInfo}</span>
                      </>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
