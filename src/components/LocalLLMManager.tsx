import { useState, useEffect } from 'react';
import { 
  Download, 
  Trash2, 
  Play, 
  Square, 
  HardDrive, 
  Cpu, 
  Loader2, 
  CheckCircle, 
  Info,
  Clock,
  MemoryStick,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';

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

interface ModelDownloadInfo {
  name: string;
  url: string;
  filename: string;
  size?: number;
  description?: string;
  modelType: string;
  contextLength?: number;
  parameterCount?: string;
  quantization?: string;
}

interface ModelStatus {
  loaded: boolean;
  info?: LocalModelInfo;
}

export function LocalLLMManager() {
  const [localModels, setLocalModels] = useState<LocalModelInfo[]>([]);
  const [availableModels, setAvailableModels] = useState<ModelDownloadInfo[]>([]);
  const [modelStatuses, setModelStatuses] = useState<Map<string, ModelStatus>>(new Map());
  const [downloadProgress, setDownloadProgress] = useState<Map<string, { progress: number; speed?: string }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [memoryStats, setMemoryStats] = useState<{ loadedModels: number; totalMemoryUsage: string }>({
    loadedModels: 0,
    totalMemoryUsage: 'N/A'
  });
  const [eventSources, setEventSources] = useState<Map<string, EventSource>>(new Map());

  useEffect(() => {
    loadData();
    loadMemoryStats();
    
    // Poll for memory stats every 5 seconds
    const interval = setInterval(() => {
      loadMemoryStats();
    }, 5000);

    return () => {
      clearInterval(interval);
      // Close all EventSource connections
      eventSources.forEach(source => source.close());
    };
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load local models
      const modelsResponse = await fetch('/api/local-llm/models');
      if (modelsResponse.ok) {
        const models = await modelsResponse.json();
        setLocalModels(models);
        
        // Load status for each model
        const statuses = new Map<string, ModelStatus>();
        for (const model of models) {
          const statusResponse = await fetch(`/api/local-llm/models/${model.id}/status`);
          if (statusResponse.ok) {
            const status = await statusResponse.json();
            statuses.set(model.id, status);
          }
        }
        setModelStatuses(statuses);
      }
      
      // Load available models for download
      const availableResponse = await fetch('/api/local-llm/available-models');
      if (availableResponse.ok) {
        const available = await availableResponse.json();
        setAvailableModels(available);
      }
    } catch (error) {
      console.error('Error loading local LLM data:', error);
      toast.error('Failed to load local LLM data');
    } finally {
      setLoading(false);
    }
  };

  const loadMemoryStats = async () => {
    try {
      const response = await fetch('/api/local-llm/stats');
      if (response.ok) {
        const stats = await response.json();
        setMemoryStats(stats);
      }
    } catch (error) {
      console.error('Error loading memory stats:', error);
    }
  };

  const startDownloadProgressStream = (filename: string) => {
    // Don't start multiple streams for the same file
    if (eventSources.has(filename)) {
      return;
    }

    const eventSource = new EventSource(`/api/local-llm/download-progress-stream/${filename}`);
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setDownloadProgress(prev => {
          const newProgress = new Map(prev);
          if (data.isDownloading || data.progress > 0) {
            newProgress.set(filename, { progress: data.progress, speed: data.speed });
          } else {
            newProgress.delete(filename);
          }
          return newProgress;
        });

        // Handle completion or error
        if (data.completed) {
          toast.success('Download completed successfully');
          eventSource.close();
          setEventSources(prev => {
            const newSources = new Map(prev);
            newSources.delete(filename);
            return newSources;
          });
          // Remove from progress display
          setDownloadProgress(prev => {
            const newProgress = new Map(prev);
            newProgress.delete(filename);
            return newProgress;
          });
          loadData(); // Reload to show the new model
        } else if (data.error) {
          if (data.cancelled) {
            toast.success('Download cancelled');
          } else {
            toast.error(`Download failed: ${data.error}`);
          }
          eventSource.close();
          setEventSources(prev => {
            const newSources = new Map(prev);
            newSources.delete(filename);
            return newSources;
          });
          // Remove from progress display
          setDownloadProgress(prev => {
            const newProgress = new Map(prev);
            newProgress.delete(filename);
            return newProgress;
          });
        }
      } catch (error) {
        console.error('Error parsing SSE data:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      eventSource.close();
      setEventSources(prev => {
        const newSources = new Map(prev);
        newSources.delete(filename);
        return newSources;
      });
    };

    setEventSources(prev => new Map(prev.set(filename, eventSource)));
  };

  const handleDownload = async (model: ModelDownloadInfo) => {
    try {
      const response = await fetch('/api/local-llm/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          modelUrl: model.url,
          modelName: model.name,
          filename: model.filename,
          size: model.size,
          description: model.description,
          modelType: model.modelType,
          contextLength: model.contextLength,
          parameterCount: model.parameterCount,
          quantization: model.quantization
        }),
      });

      if (response.ok) {
        toast.success(`Started downloading ${model.name}`);
        // Start SSE connection for progress updates
        startDownloadProgressStream(model.filename);
        // Initialize progress display
        setDownloadProgress(prev => new Map(prev.set(model.filename, { progress: 0, speed: '0 B/s' })));
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to start download');
      }
    } catch (error) {
      console.error('Error starting download:', error);
      toast.error('Failed to start download');
    }
  };

  const handleCancelDownload = async (filename: string) => {
    try {
      const response = await fetch(`/api/local-llm/download/${filename}/cancel`, {
        method: 'POST',
      });

      if (response.ok) {
        // Close the EventSource connection
        const eventSource = eventSources.get(filename);
        if (eventSource) {
          eventSource.close();
          setEventSources(prev => {
            const newSources = new Map(prev);
            newSources.delete(filename);
            return newSources;
          });
        }
        
        // Remove from progress display
        setDownloadProgress(prev => {
          const newProgress = new Map(prev);
          newProgress.delete(filename);
          return newProgress;
        });
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to cancel download');
      }
    } catch (error) {
      console.error('Error cancelling download:', error);
      toast.error('Failed to cancel download');
    }
  };

  const handleDelete = async (modelId: string) => {
    if (!confirm('Are you sure you want to delete this model? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/local-llm/models/${modelId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('Model deleted successfully');
        loadData(); // Reload data
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to delete model');
      }
    } catch (error) {
      console.error('Error deleting model:', error);
      toast.error('Failed to delete model');
    }
  };

  const handleLoadModel = async (modelId: string) => {
    try {
      const response = await fetch(`/api/local-llm/models/${modelId}/load`, {
        method: 'POST',
      });

      if (response.ok) {
        toast.success('Model loaded successfully');
        // Update status
        const statusResponse = await fetch(`/api/local-llm/models/${modelId}/status`);
        if (statusResponse.ok) {
          const status = await statusResponse.json();
          setModelStatuses(prev => new Map(prev.set(modelId, status)));
        }
        loadMemoryStats();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to load model');
      }
    } catch (error) {
      console.error('Error loading model:', error);
      toast.error('Failed to load model');
    }
  };

  const handleUnloadModel = async (modelId: string) => {
    try {
      const response = await fetch(`/api/local-llm/models/${modelId}/unload`, {
        method: 'POST',
      });

      if (response.ok) {
        toast.success('Model unloaded successfully');
        // Update status
        const statusResponse = await fetch(`/api/local-llm/models/${modelId}/status`);
        if (statusResponse.ok) {
          const status = await statusResponse.json();
          setModelStatuses(prev => new Map(prev.set(modelId, status)));
        }
        loadMemoryStats();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to unload model');
      }
    } catch (error) {
      console.error('Error unloading model:', error);
      toast.error('Failed to unload model');
    }
  };

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

  if (loading) {
    return (
      <div className="text-center py-8">
        <Loader2 size={24} className="text-blue-400 animate-spin mx-auto mb-2" />
        <p className="text-gray-400">Loading local LLM models...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Memory Stats */}
      <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
        <div className="flex items-center gap-3 mb-3">
          <MemoryStick size={20} className="text-green-400" />
          <h3 className="text-lg font-medium text-white">Memory Usage</h3>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-400">Loaded Models:</span>
            <span className="text-white ml-2 font-mono">{memoryStats.loadedModels}</span>
          </div>
          <div>
            <span className="text-gray-400">Memory Usage:</span>
            <span className="text-white ml-2 font-mono">{memoryStats.totalMemoryUsage}</span>
          </div>
        </div>
      </div>

      {/* Downloaded Models */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <HardDrive size={20} className="text-blue-400" />
          <h3 className="text-lg font-medium text-white">Downloaded Models</h3>
        </div>

        {localModels.length === 0 ? (
          <div className="text-center py-8">
            <HardDrive size={48} className="text-gray-600 mx-auto mb-4" />
            <h4 className="text-lg font-medium text-gray-400 mb-2">No Local Models</h4>
            <p className="text-gray-500">Download models from the available models section below.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {localModels.map((model) => {
              const status = modelStatuses.get(model.id);
              const isLoaded = status?.loaded || false;
              
              return (
                <div key={model.id} className="p-4 bg-gray-800 rounded-lg border border-gray-700">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Cpu size={16} className="text-blue-400" />
                        <h4 className="text-white font-medium">{model.name}</h4>
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
                          onClick={() => handleUnloadModel(model.id)}
                          className="p-2 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-orange-400"
                          title="Unload model"
                        >
                          <Square size={14} />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleLoadModel(model.id)}
                          className="p-2 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-green-400"
                          title="Load model"
                        >
                          <Play size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(model.id)}
                        className="p-2 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-red-400"
                        title="Delete model"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Available Models for Download */}
      <div id="available-models" className="space-y-4">
        <div className="flex items-center gap-3">
          <Download size={20} className="text-green-400" />
          <h3 className="text-lg font-medium text-white">Available Models</h3>
        </div>

        <div className="space-y-3">
          {availableModels.map((model) => {
            const progressInfo = downloadProgress.get(model.filename);
            const isDownloading = Boolean(progressInfo);
            const progress = progressInfo?.progress || 0;
            const speed = progressInfo?.speed || '0 B/s';
            const isAlreadyDownloaded = localModels.some(local => local.filename === model.filename);
            
            return (
              <div key={model.filename} className="p-4 bg-gray-800 rounded-lg border border-gray-700">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <Download size={16} className="text-green-400" />
                      <h4 className="text-white font-medium">{model.name}</h4>
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
                      {isAlreadyDownloaded && (
                        <span className="px-2 py-1 text-xs bg-green-600 text-white rounded-full">
                          Downloaded
                        </span>
                      )}
                    </div>
                    
                    {model.description && (
                      <p className="text-gray-400 text-sm mb-2">{model.description}</p>
                    )}
                    
                    <div className="space-y-1 text-sm">
                      {model.size && (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400 w-20">Size:</span>
                          <span className="text-gray-300">{formatFileSize(model.size)}</span>
                        </div>
                      )}
                      {model.contextLength && (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400 w-20">Context:</span>
                          <span className="text-gray-300">{model.contextLength.toLocaleString()} tokens</span>
                        </div>
                      )}
                    </div>

                    {/* Download Progress */}
                    {isDownloading && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Loader2 size={14} className="animate-spin text-blue-400" />
                            <span className="text-sm text-blue-400">Downloading... {progress}%</span>
                            <span className="text-xs text-gray-400">({speed})</span>
                          </div>
                          <button
                            onClick={() => handleCancelDownload(model.filename)}
                            className="p-1 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-red-400"
                            title="Cancel download"
                          >
                            <X size={12} />
                          </button>
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${progress}%` }}
                          ></div>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 ml-4">
                    {isAlreadyDownloaded ? (
                      <span className="p-2 text-green-400" title="Already downloaded">
                        <CheckCircle size={14} />
                      </span>
                    ) : isDownloading ? (
                      <span className="p-2 text-blue-400" title="Downloading">
                        <Clock size={14} />
                      </span>
                    ) : (
                      <button
                        onClick={() => handleDownload(model)}
                        className="p-2 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-green-400"
                        title="Download model"
                      >
                        <Download size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>


    </div>
  );
}
