import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useDownloadStore, startDownloadTracking } from '../store/useDownloadStore';
import { useAvailableModelsStore } from '../store/useAvailableModelsStore';
import { 
  Download, 
  Trash2, 
  Play, 
  Square, 
  HardDrive, 
  Cpu, 
  Loader2, 
  CheckCircle, 
  Clock,
  X,
  Key,
  Eye,
  EyeOff,
  Save,
  Lock,
  ExternalLink,
  AlertTriangle,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  User,
  Heart,
  Calendar,
  ChevronLeft,
  ChevronRight,
  FolderOpen
} from 'lucide-react';
import toast from 'react-hot-toast';
import { modelEvents } from '../utils/modelEvents';
import { ConfirmDialog } from './shared/ConfirmDialog';
import { ModelSearchProgress } from './ModelSearchProgress';
import { useModelScanStore } from '../store/useModelScanStore';

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
  modelId?: string;
  size?: number;
  description?: string;
  modelType: string;
  contextLength?: number;
  parameterCount?: string;
  quantization?: string;
  huggingFaceUrl?: string;
  downloads?: number;
  username?: string;
  likes?: number;
  updatedAt?: string;
}

interface ModelStatus {
  loaded: boolean;
  info?: LocalModelInfo;
}

export function LocalLLMManager() {
  const [localModels, setLocalModels] = useState<LocalModelInfo[]>([]);
  const [modelStatuses, setModelStatuses] = useState<Map<string, ModelStatus>>(new Map());
  const [loadingLocalModels, setLoadingLocalModels] = useState(true);

  const [hfToken, setHfToken] = useState<string>('');
  const [showHfToken, setShowHfToken] = useState(false);

  const [actualToken, setActualToken] = useState<string>(''); // Store the actual token value
  const [isTokenSaved, setIsTokenSaved] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [pendingDeleteModelId, setPendingDeleteModelId] = useState<string>('');
  const [pendingCancelFilename, setPendingCancelFilename] = useState<string>('');
  const [selectedModelType, setSelectedModelType] = useState<string>('all');
  const [selectedParameterSize, setSelectedParameterSize] = useState<string>('all');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [sortBy, setSortBy] = useState<'downloads' | 'likes' | 'updated' | 'name'>('downloads');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showHfConfigDialog, setShowHfConfigDialog] = useState(false);
  const [searchType, setSearchType] = useState<'all' | 'name' | 'username' | 'description' | 'modelType'>('all');
  
  // Model scan store
  const { isScanning: isScanningModels, startScan, startSearch } = useModelScanStore();
  // Pagination constants
  const DEFAULT_ITEMS_PER_PAGE = 10;
  
  const [localCurrentPage, setLocalCurrentPage] = useState(1);
  const [localItemsPerPage, setLocalItemsPerPage] = useState(DEFAULT_ITEMS_PER_PAGE);

  // Use the Zustand store for search functionality
  const {
    searchQuery,
    setSearchQuery,
    isSearching,
    clearSearch,
    availableModels,
    searchResults,
    hasSearched,
    loadingAvailable,
    loadCachedModels,
    getDisplayModels
  } = useAvailableModelsStore();

  // Use download store for progress tracking
  const downloads = useDownloadStore((state) => state.downloads);

  // Filter and sort available models (deduplicate by filename first)
  const rawModels = getDisplayModels();
  const uniqueModels = rawModels.filter((model, index, array) => 
    array.findIndex(m => m.filename === model.filename) === index
  );
  const modelsToFilter = uniqueModels;
  
  const filteredModels = modelsToFilter.filter(model => {
    // Client-side search filter disabled - no filtering on search input
    // if (!hasSearched && searchQuery.trim() && searchQuery.trim().length >= 1) {
    //   const query = searchQuery.toLowerCase().trim();
    //   const matchesName = model.name.toLowerCase().includes(query);
    //   const matchesDescription = model.description?.toLowerCase().includes(query);
    //   const matchesUsername = model.username?.toLowerCase().includes(query);
    //   const matchesModelType = model.modelType.toLowerCase().includes(query);
    //   const matchesParameterCount = model.parameterCount?.toLowerCase().includes(query);
    //   const matchesQuantization = model.quantization?.toLowerCase().includes(query);
    //   
    //   if (!matchesName && !matchesDescription && !matchesUsername && !matchesModelType && !matchesParameterCount && !matchesQuantization) {
    //     return false;
    //   }
    // }

    // Model type filter
    if (selectedModelType !== 'all' && model.modelType !== selectedModelType) {
      return false;
    }

    // Parameter size filter
    if (selectedParameterSize !== 'all') {
      const paramCount = model.parameterCount?.toLowerCase() || '';
      switch (selectedParameterSize) {
        case 'small': // Under 7B
          return paramCount.includes('1b') || paramCount.includes('3b') || paramCount.includes('4b') || paramCount.includes('6b');
        case 'medium': // 7B-13B
          return paramCount.includes('7b') || paramCount.includes('8b') || paramCount.includes('9b') || 
                 paramCount.includes('10b') || paramCount.includes('11b') || paramCount.includes('12b') || 
                 paramCount.includes('13b');
        case 'large': // 14B+
          return !paramCount.includes('1b') && !paramCount.includes('3b') && !paramCount.includes('4b') && 
                 !paramCount.includes('6b') && !paramCount.includes('7b') && !paramCount.includes('8b') && 
                 !paramCount.includes('9b') && !paramCount.includes('10b') && !paramCount.includes('11b') && 
                 !paramCount.includes('12b') && !paramCount.includes('13b') && paramCount.includes('b');
        default:
          return true;
      }
    }

    return true;
  });

  // Sort filtered models with stable sort (using name as secondary sort)
  const sortedModels = [...filteredModels].sort((a, b) => {
    let comparison = 0;
    
    switch (sortBy) {
      case 'downloads':
        comparison = (a.downloads || 0) - (b.downloads || 0);
        break;
      case 'likes':
        comparison = (a.likes || 0) - (b.likes || 0);
        break;
      case 'updated':
        const aDate = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bDate = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        comparison = aDate - bDate;
        break;
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      default:
        comparison = (a.downloads || 0) - (b.downloads || 0);
    }
    
    // If primary sort is equal, use name as secondary sort for stability
    if (comparison === 0 && sortBy !== 'name') {
      comparison = a.name.localeCompare(b.name);
    }
    
    return sortOrder === 'desc' ? -comparison : comparison;
  });

  // Pagination - use local state for component-level pagination
  const totalPages = Math.ceil(sortedModels.length / localItemsPerPage);
  const startIndex = (localCurrentPage - 1) * localItemsPerPage;
  const endIndex = startIndex + localItemsPerPage;
  const filteredAvailableModels = sortedModels.slice(startIndex, endIndex);

  useEffect(() => {
    loadData();
    loadHfTokenStatus();

    // Listen for model download completion to refresh the downloaded models list
    const handleModelDownloaded = () => {
      loadLocalModels();
    };

    modelEvents.on('local-model-downloaded', handleModelDownloaded);

    return () => {
      modelEvents.off('local-model-downloaded', handleModelDownloaded);
    };
  }, []);

  // Auto-trigger Find Models when available models list is empty
  useEffect(() => {
    const triggerAutoScan = async () => {
      // Only auto-trigger if we're not already scanning/searching and we have loaded available models
      if (!isScanningModels && !isSearching && !loadingAvailable && availableModels.length === 0 && !hasSearched) {
        console.log('No available models found, checking for cached models first...');
        try {
          // First try to load cached models
          const hasCachedModels = await loadCachedModels();
          if (!hasCachedModels) {
            console.log('No cached models found, auto-triggering model scan...');
            await startScan();
          } else {
            console.log('Loaded cached models successfully');
          }
        } catch (error) {
          console.error('Failed to auto-start model scan:', error);
        }
      }
    };

    triggerAutoScan();
  }, [availableModels, loadingAvailable, isScanningModels, isSearching, hasSearched, startScan, loadCachedModels]);

  // This is now handled by the store

  // Reset pagination when filters change
  useEffect(() => {
    setLocalCurrentPage(1);
  }, [selectedModelType, selectedParameterSize, sortBy, sortOrder]);

  // Reset pagination when search results change
  useEffect(() => {
    setLocalCurrentPage(1);
  }, [searchResults, availableModels, hasSearched]);

  const handleSearchButton = async () => {
    // If there's no search query and no advanced filters, trigger a model scan
    const hasFilters = selectedModelType !== 'all' || selectedParameterSize !== 'all' || 
                      sortBy !== 'downloads' || sortOrder !== 'desc';
    
    if (!searchQuery.trim() && !hasFilters) {
      // No search query and no filters - start a full model scan
      try {
        await startScan();
      } catch (error) {
        console.error('Failed to start model scan:', error);
        toast.error('Failed to start model scan');
      }
    } else {
      // Has search query or filters - use unified search system
      try {
        const filters = {
          selectedModelType,
          selectedParameterSize,
          sortBy,
          sortOrder
        };
        await startSearch(searchQuery, searchType, filters);
      } catch (error) {
        console.error('Failed to start search:', error);
        toast.error('Failed to start search');
      }
    }
  };

  const loadLocalModels = async () => {
    try {
      setLoadingLocalModels(true);
      
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
    } catch (error) {
      console.error('Error loading local models:', error);
      if (error instanceof TypeError && error.message.includes('NetworkError')) {
        toast.error('Server not running.', { duration: 5000 });
      } else {
        toast.error('Failed to load downloaded models');
      }
    } finally {
      setLoadingLocalModels(false);
    }
  };

  const loadData = async () => {
    // Load local models first (instant)
    await loadLocalModels();
    
    // Try to load cached models first (fast)
    try {
      const hasCachedModels = await loadCachedModels();
      if (!hasCachedModels) {
        console.log('No cached models found during initial load');
        // The auto-scan useEffect will handle this case
      }
    } catch (error) {
      console.error('Error loading cached models:', error);
      // The auto-scan useEffect will handle this case
    }
  };

  const loadHfTokenStatus = async () => {
    try {
      const response = await fetch('/api/local-llm/hf-token/status');
      if (response.ok) {
        const data = await response.json();
        if (data.hasToken) {
          setHfToken('•'.repeat(20)); // Show masked token
          setIsTokenSaved(true);
          setActualToken(''); // We don't have the actual token initially
        } else {
          setIsTokenSaved(false);
          setHfToken('');
          setActualToken('');
        }
      }
    } catch (error) {
      console.error('Error loading HF token status:', error);
    }
  };

  const handleSaveHfToken = async () => {
    try {
      const response = await fetch('/api/local-llm/hf-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: hfToken }),
      });

      if (response.ok) {
        toast.success('Hugging Face token saved successfully');
        setActualToken(hfToken); // Store the actual token
        setHfToken('•'.repeat(20)); // Show masked token
        setIsTokenSaved(true);
        setShowHfToken(false);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to save token');
      }
    } catch (error) {
      console.error('Error saving HF token:', error);
      toast.error('Failed to save token');
    }
  };

  const handleToggleTokenVisibility = async () => {
    if (!showHfToken && isTokenSaved && !actualToken) {
      // If we want to show the token but don't have it cached, fetch it
      try {
        const response = await fetch('/api/local-llm/hf-token');
        if (response.ok) {
          const data = await response.json();
          setActualToken(data.token);
          setHfToken(data.token);
        }
      } catch (error) {
        console.error('Error fetching token:', error);
        toast.error('Failed to retrieve token');
        return;
      }
    } else if (!showHfToken && isTokenSaved && actualToken) {
      // We have the actual token cached, show it
      setHfToken(actualToken);
    } else if (showHfToken && isTokenSaved) {
      // Hide the token by showing masked version
      setHfToken('•'.repeat(20));
    }
    
    setShowHfToken(!showHfToken);
  };

  const handleTokenChange = (value: string) => {
    setHfToken(value);
    if (isTokenSaved && value !== '•'.repeat(20)) {
      // User is editing a saved token, update the actual token cache
      setActualToken(value);
    }
  };

  const handleDismissError = (filename: string) => {
    // Remove the download from the store to clear the error
    useDownloadStore.getState().removeDownload(filename);
  };



  // Simple function to start download tracking
  const startDownloadProgressStream = (filename: string) => {
    startDownloadTracking(filename);
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
        // Start SSE tracking for this download
        startDownloadProgressStream(model.filename);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to start download');
      }
    } catch (error) {
      console.error('Error starting download:', error);
      toast.error('Failed to start download');
    }
  };

  const handleCancelDownload = (filename: string) => {
    setPendingCancelFilename(filename);
    setShowCancelConfirm(true);
  };

  const confirmCancelDownload = async () => {
    try {
      const response = await fetch(`/api/local-llm/download/${pendingCancelFilename}/cancel`, {
        method: 'POST',
      });

      if (response.ok) {
        // The global store will handle cleanup when it receives the cancellation event
        toast.success('Download cancelled');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to cancel download');
      }
    } catch (error) {
      console.error('Error cancelling download:', error);
      toast.error('Failed to cancel download');
    }
    setPendingCancelFilename('');
  };

  const handleDelete = (modelId: string) => {
    setPendingDeleteModelId(modelId);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    try {
      const response = await fetch(`/api/local-llm/models/${pendingDeleteModelId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('Model deleted successfully');
        loadLocalModels(); // Reload downloaded models only
        
        // Emit event to trigger global model rescan
        modelEvents.emit('models-changed');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to delete model');
      }
    } catch (error) {
      console.error('Error deleting model:', error);
      toast.error('Failed to delete model');
    }
    setPendingDeleteModelId('');
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
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to unload model');
      }
    } catch (error) {
      console.error('Error unloading model:', error);
      toast.error('Failed to unload model');
    }
  };

  const handleOpenModelsDirectory = async () => {
    try {
      const response = await fetch('/api/local-llm/open-models-directory', {
        method: 'POST',
      });

      if (response.ok) {
        toast.success('Opened models directory');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to open models directory');
      }
    } catch (error) {
      console.error('Error opening models directory:', error);
      toast.error('Failed to open models directory');
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



  return (
    <div className="space-y-6">

      {/* Downloaded Models */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <HardDrive size={20} className="text-blue-400" />
            <h3 className="text-lg font-medium text-white">Downloaded Models</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadLocalModels}
              disabled={loadingLocalModels}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed rounded-lg text-sm text-white transition-colors"
              title="Scan models folder for new or removed models"
            >
              {loadingLocalModels ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Search size={14} />
              )}
              Scan Models Folder
            </button>
            <button
              onClick={handleOpenModelsDirectory}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-white transition-colors"
              title="Open models directory"
            >
              <FolderOpen size={14} />
              Open Folder
            </button>
          </div>
        </div>

        {loadingLocalModels ? (
          <div className="text-center py-8">
            <Loader2 size={48} className="text-blue-400 animate-spin mx-auto mb-4" />
            <h4 className="text-lg font-medium text-gray-400 mb-2">Scanning for Downloaded Models</h4>
            <p className="text-gray-500">Checking for models in your local storage...</p>
          </div>
        ) : localModels.length === 0 ? (
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Download size={20} className="text-green-400" />
            <h3 className="text-lg font-medium text-white">Available Models</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHfConfigDialog(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 rounded-lg text-sm text-white transition-colors"
              title="Configure Hugging Face API token"
            >
              <Key size={14} />
              Hugging Face API key
            </button>
          </div>
        </div>

        {/* Model Sources Information */}
        <div className="p-4 bg-blue-900/20 border border-blue-600/30 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="text-blue-400 mt-0.5" />
            <div className="text-sm">
              <p className="text-blue-200 mb-2">
                <strong>Available Models:</strong> Models are sourced from <a href="https://huggingface.co" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">Hugging Face's</a> community-driven model hub.
              </p>
              <ul className="text-blue-300 space-y-1 text-xs">
                <li>• Thousands of open-source language models from various organizations and researchers</li>
                <li>• Some popular models (Llama, Gemma, etc.) require a free <a href="https://huggingface.co" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">Hugging Face</a> account and API token</li>
                <li>• Configure your token using the button above to download restricted models</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="space-y-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
          {/* Search Bar */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSearchButton();
                  }
                }}
                placeholder={searchType === 'all' ? "Search models by name, description, username, or specs..." : `Search by ${searchType}...`}
                className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <select
              value={searchType}
              onChange={(e) => setSearchType(e.target.value as 'all' | 'name' | 'username' | 'description' | 'modelType')}
              className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Fields</option>
              <option value="name">Model Name</option>
              <option value="username">Username</option>
              <option value="description">Description</option>
              <option value="modelType">Model Type</option>
            </select>
            <button
              onClick={handleSearchButton}
              disabled={isSearching || isScanningModels}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed rounded-lg text-sm text-white transition-colors"
              title="Search for models"
            >
              {isSearching || isScanningModels ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Search size={14} />
              )}
              {searchQuery.trim() ? 'Search' : 'Find Models'}
            </button>
          </div>

          {/* Filter Toggle */}
          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className="flex items-center gap-2 text-sm text-gray-300 hover:text-white transition-colors"
          >
            <Filter size={14} />
            Advanced Filters
            {showAdvancedFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {/* Advanced Filters */}
          {showAdvancedFilters && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 pt-2">
              {/* Model Type Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Model Type</label>
                <select
                  value={selectedModelType}
                  onChange={(e) => setSelectedModelType(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="all">All Types</option>
                  <option value="chat">Chat</option>
                  <option value="code">Code</option>
                  <option value="embedding">Embedding</option>
                  <option value="vision">Vision</option>
                </select>
              </div>

              {/* Parameter Size Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Parameter Size</label>
                <select
                  value={selectedParameterSize}
                  onChange={(e) => setSelectedParameterSize(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="all">All Sizes</option>
                  <option value="small">Small (&lt; 7B)</option>
                  <option value="medium">Medium (7B-13B)</option>
                  <option value="large">Large (14B+)</option>
                </select>
              </div>

              {/* Sort By Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Sort By</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'downloads' | 'likes' | 'updated' | 'name')}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="downloads">Downloads</option>
                  <option value="likes">Likes</option>
                  <option value="updated">Last Updated</option>
                  <option value="name">Name</option>
                </select>
              </div>

              {/* Sort Order Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Sort Order</label>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="desc">High to Low</option>
                  <option value="asc">Low to High</option>
                </select>
              </div>

              {/* Items Per Page Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Items Per Page</label>
                <select
                  value={localItemsPerPage}
                  onChange={(e) => {
                  setLocalItemsPerPage(Number(e.target.value));
                  setLocalCurrentPage(1); // Reset to first page when changing items per page
                  }}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>
          )}

          {/* Results count and clear filters */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-400">
              {hasSearched && searchQuery.trim() ? (
                <>
                  Found {searchResults.length} models for "{searchQuery.trim()}"
                  {selectedModelType !== 'all' || selectedParameterSize !== 'all' 
                    ? ` (${sortedModels.length} after filters)` 
                    : ''}
                  {sortedModels.length > localItemsPerPage && (
                    <> • Showing {startIndex + 1}-{Math.min(endIndex, sortedModels.length)} of {sortedModels.length}</>
                  )}
                </>
              ) : (
                <>
                  {sortedModels.length > localItemsPerPage ? (
                    <>Showing {startIndex + 1}-{Math.min(endIndex, sortedModels.length)} of {sortedModels.length} models</>
                  ) : (
                    <>Showing {sortedModels.length} of {availableModels.length} models</>
                  )}
                </>
              )}
            </div>
            {(searchQuery || selectedModelType !== 'all' || selectedParameterSize !== 'all' || sortBy !== 'downloads' || sortOrder !== 'desc' || localItemsPerPage !== DEFAULT_ITEMS_PER_PAGE) && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedModelType('all');
                  setSelectedParameterSize('all');
                  setSortBy('downloads');
                  setSortOrder('desc');
                  setLocalItemsPerPage(DEFAULT_ITEMS_PER_PAGE);
                  clearSearch();
                }}
                className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 hover:text-white transition-colors"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* Top Pagination Controls */}
        {!loadingAvailable && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setLocalCurrentPage(localCurrentPage - 1)}
              disabled={localCurrentPage === 1}
              className="flex items-center gap-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed disabled:text-gray-500 rounded-lg text-sm text-white transition-colors"
            >
              <ChevronLeft size={14} />
              Previous
            </button>
            
            <div className="flex items-center gap-1">
              {/* Show page numbers */}
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let pageNum;
                if (totalPages <= 7) {
                  pageNum = i + 1;
                } else if (localCurrentPage <= 4) {
                  pageNum = i + 1;
                } else if (localCurrentPage >= totalPages - 3) {
                  pageNum = totalPages - 6 + i;
                } else {
                  pageNum = localCurrentPage - 3 + i;
                }
                
                return (
                  <button
                    key={pageNum}
                    onClick={() => setLocalCurrentPage(pageNum)}
                    className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                      localCurrentPage === pageNum
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            
            <button
              onClick={() => setLocalCurrentPage(localCurrentPage + 1)}
              disabled={localCurrentPage === totalPages}
              className="flex items-center gap-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed disabled:text-gray-500 rounded-lg text-sm text-white transition-colors"
            >
              Next
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        {(isScanningModels || isSearching) ? (
          <ModelSearchProgress
            isVisible={true}
            isSearching={isSearching}
            isScanningModels={isScanningModels}
            onClose={() => {}}
          />
        ) : loadingAvailable ? (
          <div className="text-center py-8">
            <Loader2 size={24} className="text-blue-400 animate-spin mx-auto mb-2" />
            <p className="text-gray-400">Loading available models...</p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {filteredAvailableModels.map((model) => {
              const progressInfo = downloads.get(model.filename);
              const isDownloading = Boolean(progressInfo);
              const progress = progressInfo?.progress || 0;
              const speed = progressInfo?.speed || '0 B/s';
              const isAlreadyDownloaded = localModels.some(local => local.filename === model.filename);
              const hasError = progressInfo?.errorType;
            
            return (
              <div key={`${model.filename}-${model.name}-${model.url}`} className="p-4 bg-gray-800 rounded-lg border border-gray-700">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <Download size={16} className="text-green-400" />
                      <h4 className="text-white font-medium">{model.modelId || model.name}</h4>
                      {model.huggingFaceUrl && (
                        <a
                          href={model.huggingFaceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-blue-400"
                          title="View on Hugging Face"
                        >
                          <ExternalLink size={12} />
                        </a>
                      )}
                      <span className={`px-2 py-1 text-xs rounded-full text-white ${getModelTypeColor(model.modelType)}`}>
                        {model.modelType}
                      </span>

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
                      {model.username && (
                        <div className="flex items-center gap-2">
                          <User size={12} className="text-gray-400" />
                          <span className="text-gray-400 w-16">By:</span>
                          <a
                            href={`https://huggingface.co/${model.username}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-300 hover:text-blue-200 hover:underline transition-colors"
                          >
                            {model.username}
                          </a>
                        </div>
                      )}
                    </div>

                    {/* Model Stats */}
                    {(model.downloads || model.likes) && (
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                        {model.downloads && (
                          <div className="flex items-center gap-1">
                            <Download size={12} />
                            <span>{model.downloads.toLocaleString()} downloads</span>
                          </div>
                        )}
                        {model.likes && (
                          <div className="flex items-center gap-1">
                            <Heart size={12} />
                            <span>{model.likes.toLocaleString()} likes</span>
                          </div>
                        )}
                        {model.updatedAt && (
                          <div className="flex items-center gap-1">
                            <Calendar size={12} />
                            <span>Updated {new Date(model.updatedAt).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Download Progress */}
                    {isDownloading && !hasError && (
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

                    {/* Download Error */}
                    {hasError && (
                      <div className="mt-3 p-3 bg-red-900/20 border border-red-600/30 rounded-lg">
                        <div className="flex items-start gap-3">
                          <AlertTriangle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-sm font-medium text-red-200">Download Error</span>
                              {progressInfo?.errorType === '403' && progressInfo?.huggingFaceUrl && (
                                <a
                                  href={progressInfo.huggingFaceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs text-white transition-colors"
                                >
                                  <ExternalLink size={10} />
                                  Request Access
                                </a>
                              )}
                            </div>
                            <p className="text-sm text-red-300">
                              {progressInfo?.errorMessage || 'Download failed'}
                            </p>
                            {progressInfo?.errorType === '403' && (
                              <p className="text-xs text-red-400 mt-1">
                                This model requires permission to access. Click the acknowledgement button on Hugging Face.
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => handleDismissError(model.filename)}
                            className="p-1 hover:bg-red-800/50 rounded transition-colors text-red-400 hover:text-red-300"
                            title="Dismiss error"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 ml-4">
                    {isAlreadyDownloaded ? (
                      <span className="p-2 text-green-400" title="Already downloaded">
                        <CheckCircle size={14} />
                      </span>
                    ) : hasError ? (
                      <button
                        onClick={() => handleDownload(model)}
                        className="p-2 hover:bg-gray-700 rounded transition-colors text-red-400 hover:text-red-300"
                        title="Retry download"
                      >
                        <Download size={14} />
                      </button>
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

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <button
                  onClick={() => setLocalCurrentPage(localCurrentPage - 1)}
                  disabled={localCurrentPage === 1}
                  className="flex items-center gap-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed disabled:text-gray-500 rounded-lg text-sm text-white transition-colors"
                >
                  <ChevronLeft size={14} />
                  Previous
                </button>
                
                <div className="flex items-center gap-1">
                  {/* Show page numbers */}
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 7) {
                      pageNum = i + 1;
                    } else if (localCurrentPage <= 4) {
                      pageNum = i + 1;
                    } else if (localCurrentPage >= totalPages - 3) {
                      pageNum = totalPages - 6 + i;
                    } else {
                      pageNum = localCurrentPage - 3 + i;
                    }
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setLocalCurrentPage(pageNum)}
                        className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                          localCurrentPage === pageNum
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                
                <button
                  onClick={() => setLocalCurrentPage(localCurrentPage + 1)}
                  disabled={localCurrentPage === totalPages}
                  className="flex items-center gap-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed disabled:text-gray-500 rounded-lg text-sm text-white transition-colors"
                >
                  Next
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Hugging Face Configuration Dialog */}
      {showHfConfigDialog && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
          <div className="bg-gray-900 rounded-lg border border-gray-700 w-full max-w-md max-h-[80vh] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-700">
              <div className="flex items-center gap-3">
                <Key size={20} className="text-yellow-400" />
                <h2 className="text-lg font-semibold text-white">Hugging Face API Configuration</h2>
              </div>
              <button
                onClick={() => setShowHfConfigDialog(false)}
                className="p-2 hover:bg-gray-800 rounded transition-colors text-gray-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-400">
                Some models require a Hugging Face token to access. This enables downloading gated models like Llama and Gemma.
              </p>
              
              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <input
                    type={showHfToken ? 'text' : 'password'}
                    value={hfToken}
                    onChange={(e) => handleTokenChange(e.target.value)}
                    placeholder="Enter your Hugging Face token (hf_...)"
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 pr-10 text-white text-sm"
                  />
                  <button
                    onClick={handleToggleTokenVisibility}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-600 rounded"
                    type="button"
                  >
                    {showHfToken ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <button
                  onClick={handleSaveHfToken}
                  disabled={!hfToken || hfToken === '•'.repeat(20)}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-white text-sm transition-colors"
                >
                  <Save size={14} />
                  Save
                </button>
              </div>
              
              <div className="flex items-start gap-2 text-xs text-gray-500">
                <Lock size={12} className="mt-0.5 flex-shrink-0" />
                <span>Token is stored on your server in the server configuration directory, and only used for Hugging Face API requests.</span>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDelete}
        title="Delete Model"
        message="Are you sure you want to delete this model? This action cannot be undone and will permanently remove the model from your system."
        confirmText="Delete Model"
        type="danger"
        icon={<Trash2 size={20} />}
      />

      <ConfirmDialog
        isOpen={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        onConfirm={confirmCancelDownload}
        title="Cancel Download"
        message="Are you sure you want to cancel this download? All progress will be lost."
        confirmText="Cancel Download"
        type="warning"
        icon={<X size={20} />}
      />


    </div>
  );
}
