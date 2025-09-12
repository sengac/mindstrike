import { useState, useEffect, useCallback } from 'react';
import { X, Play, Square, Loader2, Cpu, Download } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import toast from 'react-hot-toast';
import { modelEvents } from '../utils/modelEvents';

interface LocalModelInfo {
  id: string;
  name: string;
  filename: string;
  path: string;
  size: number;
  downloaded: boolean;
  downloading: boolean;
  downloadProgress?: number;
  modelType: string;
  contextLength?: number;
  parameterCount?: string;
  quantization?: string;
}

interface ModelStatus {
  loaded: boolean;
  info?: LocalModelInfo;
}

interface LocalModelLoadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  targetModelId?: string; // The model that needs to be loaded (optional)
  onModelLoaded: () => void; // Callback when model is successfully loaded
}

export function LocalModelLoadDialog({ 
  isOpen, 
  onClose, 
  targetModelId, 
  onModelLoaded 
}: LocalModelLoadDialogProps) {
  // Hooks
  const { setActivePanel } = useAppStore();
  
  // State
  const [localModels, setLocalModels] = useState<LocalModelInfo[]>([]);
  const [modelStatuses, setModelStatuses] = useState<Map<string, ModelStatus>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingModelId, setLoadingModelId] = useState<string | null>(null);


  // Helper functions
  const formatFileSize = (bytes: number): string => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const getModelTypeColor = (type: string) => {
    switch (type) {
      case 'chat': return 'bg-blue-600';
      case 'code': return 'bg-green-600';
      case 'unknown': return 'bg-gray-600';
      default: return 'bg-purple-600';
    }
  };

  // API functions

  const fetchModelsAndStatuses = useCallback(async () => {
    try {
      setLoading(true);
      
      // Load local models
      const modelsResponse = await fetch('/api/local-llm/models');
      if (modelsResponse.ok) {
        const models = await modelsResponse.json();
        setLocalModels(models);
        
        // Load status for each model
        const statuses = new Map<string, ModelStatus>();
        await Promise.all(
          models.map(async (model: LocalModelInfo) => {
            try {
              const statusResponse = await fetch(`/api/local-llm/models/${model.id}/status`);
              if (statusResponse.ok) {
                const status = await statusResponse.json();
                statuses.set(model.id, status);
              }
            } catch (error) {
              console.error(`Error loading status for model ${model.id}:`, error);
            }
          })
        );
        setModelStatuses(statuses);
      }
    } catch (error) {
      console.error('Error loading local LLM data:', error);
      if (error instanceof TypeError && error.message.includes('NetworkError')) {
        toast.error('Server not running.', { duration: 5000 });
      } else {
        toast.error('Failed to load local LLM data');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadModel = useCallback(async (modelId: string, isAutoLoad = false) => {
    try {
      setLoadingModelId(modelId);
      
      const response = await fetch(`/api/local-llm/models/${modelId}/load`, {
        method: 'POST',
      });

      if (response.ok) {
        if (!isAutoLoad) {
          toast.success('Model loaded successfully');
        }
        
        // Refresh model status
        await fetchModelsAndStatuses();
        
        // Emit event to trigger global model rescan since local model state changed
        modelEvents.emit('models-changed');
        
        // Handle target model completion
        if (targetModelId && modelId === targetModelId) {
          onModelLoaded();
          onClose();
        }
      } else {
        const error = await response.json();
        
        // Handle memory issues with auto-retry
        if (isAutoLoad && error.error?.toLowerCase().includes('memory')) {
          await handleMemoryIssueRetry(modelId);
          return;
        }
        
        const message = isAutoLoad 
          ? `Failed to start model: ${error.error || 'Unknown error'}`
          : error.error || 'Failed to load model';
        toast.error(message);
      }
    } catch (error) {
      console.error('Error loading model:', error);
      const message = isAutoLoad 
        ? 'Failed to start model due to connection error'
        : 'Failed to load model';
      toast.error(message);
    } finally {
      setLoadingModelId(null);
    }
  }, [targetModelId, onModelLoaded, onClose, fetchModelsAndStatuses]);

  const handleMemoryIssueRetry = useCallback(async (targetModelId: string) => {
    try {
      toast('Insufficient memory detected. Unloading other models...', {
        duration: 4000,
        icon: 'ℹ️'
      });
      
      // Get all loaded models except the target
      const loadedModelIds = Array.from(modelStatuses.entries())
        .filter(([id, status]) => status.loaded && id !== targetModelId)
        .map(([id]) => id);
      
      if (loadedModelIds.length === 0) {
        toast.error('No other models to unload. Please try a smaller model.');
        return;
      }
      
      // Unload all other models
      await Promise.all(
        loadedModelIds.map(async (modelId) => {
          try {
            await fetch(`/api/local-llm/models/${modelId}/unload`, {
              method: 'POST',
            });
          } catch (error) {
            console.error(`Error unloading model ${modelId}:`, error);
          }
        })
      );
      
      // Refresh states
      await fetchModelsAndStatuses();
      
      toast('Retrying model loading...', {
        duration: 3000,
        icon: 'ℹ️'
      });
      
      // Retry after a brief delay
      setTimeout(() => {
        loadModel(targetModelId, true);
      }, 1000);
      
    } catch (error) {
      console.error('Error during memory issue retry:', error);
      toast.error('Failed to free up memory and retry');
    }
  }, [modelStatuses, fetchModelsAndStatuses, loadModel]);

  const unloadModel = useCallback(async (modelId: string) => {
    try {
      const response = await fetch(`/api/local-llm/models/${modelId}/unload`, {
        method: 'POST',
      });

      if (response.ok) {
        toast.success('Model unloaded successfully');
        
        // Refresh model status
        await fetchModelsAndStatuses();
        
        // Emit event to trigger global model rescan since local model state changed
        modelEvents.emit('models-changed');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to unload model');
      }
    } catch (error) {
      console.error('Error unloading model:', error);
      toast.error('Failed to unload model');
    }
  }, [fetchModelsAndStatuses]);

  // Initial data loading
  useEffect(() => {
    if (isOpen) {
      fetchModelsAndStatuses();
    }
  }, [isOpen, fetchModelsAndStatuses]);

  // Auto-load target model when data is available
  useEffect(() => {
    if (!isOpen || !targetModelId || loadingModelId || loading) return;
    
    const targetModel = localModels.find(m => m.id === targetModelId);
    const isAlreadyLoaded = modelStatuses.get(targetModelId)?.loaded;
    
    if (targetModel && !isAlreadyLoaded) {
      loadModel(targetModelId, true);
    }
  }, [isOpen, targetModelId, localModels, modelStatuses, loadingModelId, loading, loadModel]);



  if (!isOpen) return null;
  
  // Don't show dialog UI when auto-loading a specific model
  // Just handle the loading logic in the background
  if (targetModelId) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg border border-gray-700 w-full max-w-4xl max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <Cpu size={24} className="text-blue-400" />
            <h2 className="text-xl font-semibold text-white">Local Model Management</h2>
          </div>
          <div className="flex items-center gap-2">
            {!loading && localModels.length > 0 && (
              <button
                onClick={() => {
                  setActivePanel('settings');
                  onClose();
                  // Scroll to Available Models section after a brief delay
                  setTimeout(() => {
                    const element = document.getElementById('available-models');
                    if (element) {
                      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                  }, 300);
                }}
                className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors"
                title="Go to Available Models section"
              >
                <Download size={16} />
                Available Models
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-800 rounded transition-colors text-gray-400 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(80vh-120px)]">
          {/* Model List */}
          <div>
            
            {loading ? (
              <div className="text-center py-8">
                <Loader2 size={24} className="text-blue-400 animate-spin mx-auto mb-2" />
                <p className="text-gray-400">Loading local LLM models...</p>
              </div>
            ) : localModels.length === 0 ? (
              <div className="text-center py-8">
                <Cpu size={48} className="text-gray-600 mx-auto mb-4" />
                <h4 className="text-lg font-medium text-gray-400 mb-2">No Local Models</h4>
                <p className="text-gray-500 mb-4">Download models in Settings to get started.</p>
                <button
                  onClick={() => {
                    setActivePanel('settings');
                    onClose();
                    // Scroll to Available Models section after a brief delay
                    setTimeout(() => {
                      const element = document.getElementById('available-models');
                      if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }
                    }, 300);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors mx-auto"
                  title="Go to Available Models section"
                >
                  <Download size={16} />
                  Available Models
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {localModels.map((model) => {
                  const status = modelStatuses.get(model.id);
                  const isLoaded = status?.loaded || false;
                  const isTarget = targetModelId === model.id;
                  const isCurrentlyLoading = loadingModelId === model.id;
                  
                  return (
                    <div key={model.id} className="p-4 bg-gray-800 rounded-lg border border-gray-700">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <Cpu size={16} className="text-blue-400" />
                            <h4 className="text-white font-medium">{model.name}</h4>
                            
                            {isTarget && (
                              <span className="px-2 py-1 text-xs bg-blue-600 text-white rounded-full">
                                Auto-Starting
                              </span>
                            )}
                            
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              isLoaded ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'
                            }`}>
                              {isLoaded ? 'Loaded' : 'Not Loaded'}
                            </span>
                            
                            <span className={`px-2 py-1 text-xs rounded-full text-white ${getModelTypeColor(model.modelType)}`}>
                              {model.modelType}
                            </span>
                            
                            {model.parameterCount && (
                              <span className="px-2 py-1 text-xs bg-indigo-600 text-white rounded-full">
                                {model.parameterCount}
                              </span>
                            )}
                            
                            {model.quantization && (
                              <span className="px-2 py-1 text-xs bg-orange-600 text-white rounded-full">
                                {model.quantization}
                              </span>
                            )}
                          </div>
                          
                          <div className="space-y-1 text-sm">
                            <div className="flex items-center gap-2">
                              <span className="text-gray-400 w-20">File:</span>
                              <span className="text-gray-300 font-mono">{model.filename}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-400 w-20">Size:</span>
                              <span className="text-gray-300">{formatFileSize(model.size)}</span>
                            </div>
                            {model.contextLength && (
                              <div className="flex items-center gap-2">
                                <span className="text-gray-400 w-20">Context:</span>
                                <span className="text-gray-300">{model.contextLength.toLocaleString()} tokens</span>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 ml-4">
                          {isLoaded ? (
                            <button
                              onClick={() => unloadModel(model.id)}
                              className="p-2 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-orange-400"
                              title="Unload model"
                            >
                              <Square size={14} />
                            </button>
                          ) : (
                            <button
                              onClick={() => loadModel(model.id)}
                              disabled={isCurrentlyLoading}
                              className="p-2 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-green-400 disabled:text-gray-600"
                              title="Load model"
                            >
                              {isCurrentlyLoading ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <Play size={14} />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
