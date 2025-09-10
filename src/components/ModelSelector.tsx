import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, RefreshCw, Cpu } from 'lucide-react';
import { useAvailableModels, LLMModel } from '../hooks/useAvailableModels';
import { getContextDescription } from '../utils/tokenUtils';
import toast from 'react-hot-toast';

interface ModelSelectorProps {
    selectedModel?: LLMModel;
    onModelSelect: (model: LLMModel) => void;
    className?: string;
}

export function ModelSelector({ selectedModel, onModelSelect, className = '' }: ModelSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const { models, isLoading, error, rescanModels } = useAvailableModels();

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Auto-select first model if none selected and models are available
    // Also validate that the selected model is still available
    useEffect(() => {
        if (models.length === 0) return;
        
        // Check if selected model is still available
        const isSelectedModelAvailable = selectedModel && 
            models.some(model => 
                model.serviceId === selectedModel.serviceId && 
                model.model === selectedModel.model
            );
        
        // If no model is selected or the selected model is no longer available,
        // auto-select the first available model
        if (!selectedModel || !isSelectedModelAvailable) {
            // Show toast notification if we're switching from an unavailable model
            if (selectedModel && !isSelectedModelAvailable) {
                toast.error(`Model "${selectedModel.displayName}" is no longer available. Switched to "${models[0].displayName}".`);
            }
            onModelSelect(models[0]);
        }
    }, [selectedModel, models, onModelSelect]);

    const handleModelSelect = (model: LLMModel) => {
        onModelSelect(model);
        setIsOpen(false);
    };

    const handleRescan = async (e: React.MouseEvent) => {
        e.stopPropagation();
        await rescanModels();
    };

    const displayText = selectedModel
        ? selectedModel.displayName
        : models.length > 0
            ? 'Select Model'
            : 'No models available';

    const truncateText = (text: string, maxLength: number = 30) => {
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    };

    return (
        <div className={`relative ${className}`} ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-200 transition-colors min-w-[220px] justify-between"
                disabled={isLoading || models.length === 0}
                title={selectedModel?.displayName || displayText}
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
                <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
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
                        <div className="px-3 py-2 text-xs text-gray-400">
                            No models found. Make sure Ollama, vLLM, or other compatible services are running.
                        </div>
                    )}

                    {models.map((model) => {
                        const contextInfo = model.contextLength ? getContextDescription(model.contextLength) : '';
                        return (
                            <button
                                key={`${model.serviceId}-${model.model}`}
                                onClick={() => handleModelSelect(model)}
                                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-700 transition-colors border-b border-gray-700 last:border-b-0 ${selectedModel?.serviceId === model.serviceId && selectedModel?.model === model.model
                                        ? 'bg-blue-600 text-white'
                                        : 'text-gray-200'
                                    }`}
                                title={`${model.displayName}${contextInfo ? ` - ${contextInfo}` : ''}`}
                            >
                                <div className="flex flex-col gap-0.5">
                                    <div className="font-medium truncate">{model.model}</div>
                                    <div className="text-xs text-gray-400 truncate flex items-center gap-1">
                                        <span>{model.serviceName}</span>
                                        {contextInfo && (
                                            <>
                                                <span>•</span>
                                                <span className="text-gray-500">{contextInfo}</span>
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
