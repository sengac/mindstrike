import { useState, useEffect } from 'react';
import {
  useDownloadStore,
  startDownloadTracking,
} from '../../store/useDownloadStore';
import { useAvailableModelsStore } from '../../store/useAvailableModelsStore';
import { useLocalModelsStore } from '../../store/useLocalModelsStore';
import {
  Download,
  Trash2,
  HardDrive,
  Loader2,
  X,
  Key,
  AlertTriangle,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { modelEvents } from '../../utils/modelEvents';
import { ConfirmDialog } from '../../components/shared/ConfirmDialog';
import { ModelSearchProgress } from '../../components/ModelSearchProgress';
import { useModelScanStore } from '../../store/useModelScanStore';
import { HuggingFaceConfigDialog } from './HuggingFaceConfigDialog';
import { ModelList } from '../../components/shared/ModelList';
import { ModelCard } from '../../components/shared/ModelCard';
import { logger } from '../../utils/logger';

interface ModelDownloadInfo {
  name: string;
  url: string;
  filename: string;
  modelId?: string;
  size?: number;
  description?: string;
  trainedContextLength?: number;
  maxContextLength?: number;
  parameterCount?: string;
  quantization?: string;
  huggingFaceUrl?: string;
  // Multi-part model fields
  isMultiPart?: boolean;
  totalParts?: number;
  allPartFiles?: string[];
  totalSize?: number;
  downloads?: number;
  username?: string;
  likes?: number;
  updatedAt?: string;
}

export function LocalLLMManager() {
  // Use local models store
  const {
    localModels,
    modelStatuses,
    isLoading: loadingLocalModels,
    loadingModelId,
    modelLoadErrors,
    fetchModelsAndStatuses: loadLocalModels,
    loadModel: handleLoadModel,
    unloadModel: handleUnloadModel,
    deleteModel: handleDeleteModel,
    updateModelSettings: handleUpdateModelSettings,
    formatFileSize,
  } = useLocalModelsStore();

  const [hfToken, setHfToken] = useState<string>('');
  const [showHfToken, setShowHfToken] = useState(false);

  const [actualToken, setActualToken] = useState<string>(''); // Store the actual token value
  const [isTokenSaved, setIsTokenSaved] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [pendingDeleteModelId, setPendingDeleteModelId] = useState<string>('');
  const [pendingCancelFilename, setPendingCancelFilename] =
    useState<string>('');

  const [selectedParameterSize, setSelectedParameterSize] =
    useState<string>('all');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [sortBy, setSortBy] = useState<
    'downloads' | 'likes' | 'updated' | 'name'
  >('downloads');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showHfConfigDialog, setShowHfConfigDialog] = useState(false);
  const [searchType, setSearchType] = useState<
    'all' | 'name' | 'username' | 'description'
  >('all');

  // Model scan store
  const {
    isScanning: isScanningModels,
    startScan,
    startSearch,
  } = useModelScanStore();
  // Pagination constants
  const DEFAULT_ITEMS_PER_PAGE = 10;

  const [localCurrentPage, setLocalCurrentPage] = useState(1);
  const [localItemsPerPage, setLocalItemsPerPage] = useState(
    DEFAULT_ITEMS_PER_PAGE
  );

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
    getDisplayModels,
    checkForModelUpdates,
  } = useAvailableModelsStore();

  // Use download store for progress tracking
  const downloads = useDownloadStore(state => state.downloads);

  // Filter and sort available models (deduplicate by filename first)
  const rawModels = getDisplayModels();
  const uniqueModels = rawModels.filter(
    (model, index, array) =>
      array.findIndex(m => m.filename === model.filename) === index
  );
  const modelsToFilter = uniqueModels;

  const filteredModels = modelsToFilter.filter(model => {
    // Parameter size filter
    if (selectedParameterSize !== 'all') {
      const paramCount = model.parameterCount?.toLowerCase() ?? '';
      switch (selectedParameterSize) {
        case 'small': // Under 7B
          return (
            paramCount.includes('1b') ||
            paramCount.includes('3b') ||
            paramCount.includes('4b') ||
            paramCount.includes('6b')
          );
        case 'medium': // 7B-13B
          return (
            paramCount.includes('7b') ||
            paramCount.includes('8b') ||
            paramCount.includes('9b') ||
            paramCount.includes('10b') ||
            paramCount.includes('11b') ||
            paramCount.includes('12b') ||
            paramCount.includes('13b')
          );
        case 'large': // 14B+
          return (
            !paramCount.includes('1b') &&
            !paramCount.includes('3b') &&
            !paramCount.includes('4b') &&
            !paramCount.includes('6b') &&
            !paramCount.includes('7b') &&
            !paramCount.includes('8b') &&
            !paramCount.includes('9b') &&
            !paramCount.includes('10b') &&
            !paramCount.includes('11b') &&
            !paramCount.includes('12b') &&
            !paramCount.includes('13b') &&
            paramCount.includes('b')
          );
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
        comparison = (a.downloads ?? 0) - (b.downloads ?? 0);
        break;
      case 'likes':
        comparison = (a.likes ?? 0) - (b.likes ?? 0);
        break;
      case 'updated': {
        const aDate = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bDate = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        comparison = aDate - bDate;
        break;
      }
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      default:
        comparison = (a.downloads ?? 0) - (b.downloads ?? 0);
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
      if (
        !isScanningModels &&
        !isSearching &&
        !loadingAvailable &&
        availableModels.length === 0 &&
        !hasSearched
      ) {
        logger.info(
          'No available models found, checking for cached models first...'
        );
        try {
          // First try to load cached models
          const hasCachedModels = await loadCachedModels();
          if (!hasCachedModels) {
            logger.info(
              'No cached models found, auto-triggering model scan...'
            );
            await startScan();
          } else {
            logger.info('Loaded cached models successfully');
          }
        } catch (error) {
          logger.error('Failed to auto-start model scan:', error);
        }
      }
    };

    triggerAutoScan();
  }, [
    availableModels,
    loadingAvailable,
    isScanningModels,
    isSearching,
    hasSearched,
    startScan,
    loadCachedModels,
  ]);

  // This is now handled by the store

  // Reset pagination when filters change
  useEffect(() => {
    setLocalCurrentPage(1);
  }, [selectedParameterSize, sortBy, sortOrder]);

  // Reset pagination only when search query changes or search is performed
  useEffect(() => {
    setLocalCurrentPage(1);
  }, [searchQuery, hasSearched]);

  // Check for VRAM data updates for visible models only
  useEffect(() => {
    // Get IDs of currently visible models
    const visibleModelIds = filteredAvailableModels.map(
      m => m.modelId ?? m.filename
    );

    // Check if any visible models need VRAM data
    const hasModelsWithoutVram = filteredAvailableModels.some(
      m => !m.hasVramData && !m.isFetchingVram && !m.vramError
    );

    if (
      !hasModelsWithoutVram ||
      loadingAvailable ||
      isSearching ||
      visibleModelIds.length === 0
    ) {
      return;
    }

    // Check for updates every 5 seconds while visible models are missing VRAM data
    const interval = setInterval(() => {
      logger.info(
        `Checking for VRAM data updates for ${visibleModelIds.length} visible models...`
      );
      checkForModelUpdates(visibleModelIds);
    }, 5000);

    return () => clearInterval(interval);
  }, [
    filteredAvailableModels,
    loadingAvailable,
    isSearching,
    checkForModelUpdates,
  ]);

  const handleSearchButton = async () => {
    // If there's no search query and no advanced filters, trigger a model scan
    const hasFilters =
      selectedParameterSize !== 'all' ||
      sortBy !== 'downloads' ||
      sortOrder !== 'desc';

    if (!searchQuery.trim() && !hasFilters) {
      // No search query and no filters - start a full model scan
      try {
        await startScan();
      } catch (error) {
        logger.error('Failed to start model scan:', error);
        toast.error('Failed to start model scan');
      }
    } else {
      // Has search query or filters - use unified search system
      try {
        const filters = {
          selectedParameterSize,
          sortBy,
          sortOrder,
        };
        await startSearch(searchQuery, searchType, filters);
      } catch (error) {
        logger.error('Failed to start search:', error);
        toast.error('Failed to start search');
      }
    }
  };

  const loadData = async () => {
    // Load local models first (instant)
    await loadLocalModels();

    // Try to load cached models first (fast)
    try {
      const hasCachedModels = await loadCachedModels();
      if (!hasCachedModels) {
        logger.info('No cached models found during initial load');
        // The auto-scan useEffect will handle this case
      }
    } catch (error) {
      logger.error('Error loading cached models:', error);
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
      logger.error('Error loading HF token status:', error);
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
          trainedContextLength: model.trainedContextLength,
          maxContextLength: model.maxContextLength,
          parameterCount: model.parameterCount,
          quantization: model.quantization,
          // Pass multi-part info if available
          isMultiPart: model.isMultiPart,
          totalParts: model.totalParts,
          allPartFiles: model.allPartFiles,
          totalSize: model.totalSize,
        }),
      });

      if (response.ok) {
        toast.success(`Started downloading ${model.name}`);
        // Start SSE tracking for this download
        startDownloadProgressStream(model.filename);
      } else {
        const error = await response.json();
        toast.error(error.error ?? 'Failed to start download');
      }
    } catch (error) {
      logger.error('Error starting download:', error);
      toast.error('Failed to start download');
    }
  };

  const handleCancelDownload = (filename: string) => {
    setPendingCancelFilename(filename);
    setShowCancelConfirm(true);
  };

  const confirmCancelDownload = async () => {
    try {
      const response = await fetch(
        `/api/local-llm/download/${pendingCancelFilename}/cancel`,
        {
          method: 'POST',
        }
      );

      if (response.ok) {
        // The global store will handle cleanup when it receives the cancellation event
        toast.success('Download cancelled');
      } else {
        const error = await response.json();
        toast.error(error.error ?? 'Failed to cancel download');
      }
    } catch (error) {
      logger.error('Error cancelling download:', error);
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
      await handleDeleteModel(pendingDeleteModelId);
    } finally {
      setPendingDeleteModelId('');
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
        toast.error(error.error ?? 'Failed to open models directory');
      }
    } catch (error) {
      logger.error('Error opening models directory:', error);
      toast.error('Failed to open models directory');
    }
  };

  return (
    <div className="space-y-6">
      {/* Downloaded Models */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <HardDrive size={20} className="text-blue-400" />
            <h3 className="text-lg font-medium text-white">
              Downloaded Models
            </h3>
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

        <ModelList
          models={localModels}
          modelStatuses={modelStatuses}
          loading={loadingLocalModels}
          loadingModelId={loadingModelId}
          modelLoadErrors={modelLoadErrors}
          onLoad={handleLoadModel}
          onUnload={handleUnloadModel}
          onDelete={handleDelete}
          onUpdateSettings={handleUpdateModelSettings}
          formatFileSize={formatFileSize}
          emptyStateTitle="No Local Models"
          emptyStateDescription="Download models from the available models section below."
          emptyStateIcon={
            <HardDrive size={48} className="text-gray-600 mx-auto mb-4" />
          }
        />
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
                <strong>Available Models:</strong> Models are sourced from{' '}
                <a
                  href="https://huggingface.co"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  Hugging Face's
                </a>{' '}
                community-driven model hub.
              </p>
              <ul className="text-blue-300 space-y-1 text-xs">
                <li>
                  • Thousands of open-source language models from various
                  organizations and researchers
                </li>
                <li>
                  • Some popular models (Llama, Gemma, etc.) require a free{' '}
                  <a
                    href="https://huggingface.co"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    Hugging Face
                  </a>{' '}
                  account and API token
                </li>
                <li>
                  • Configure your token using the button above to download
                  restricted models
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="space-y-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
          {/* Search Bar */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    handleSearchButton();
                  }
                }}
                placeholder={
                  searchType === 'all'
                    ? 'Search models by name, description, username, or specs...'
                    : `Search by ${searchType}...`
                }
                className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <select
              value={searchType}
              onChange={e =>
                setSearchType(
                  e.target.value as 'all' | 'name' | 'username' | 'description'
                )
              }
              className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Fields</option>
              <option value="name">Model Name</option>
              <option value="username">Username</option>
              <option value="description">Description</option>
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
            {showAdvancedFilters ? (
              <ChevronUp size={14} />
            ) : (
              <ChevronDown size={14} />
            )}
          </button>

          {/* Advanced Filters */}
          {showAdvancedFilters && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
              {/* Parameter Size Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Parameter Size
                </label>
                <select
                  value={selectedParameterSize}
                  onChange={e => setSelectedParameterSize(e.target.value)}
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
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Sort By
                </label>
                <select
                  value={sortBy}
                  onChange={e =>
                    setSortBy(
                      e.target.value as
                        | 'downloads'
                        | 'likes'
                        | 'updated'
                        | 'name'
                    )
                  }
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
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Sort Order
                </label>
                <select
                  value={sortOrder}
                  onChange={e => setSortOrder(e.target.value as 'asc' | 'desc')}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="desc">High to Low</option>
                  <option value="asc">Low to High</option>
                </select>
              </div>

              {/* Items Per Page Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Items Per Page
                </label>
                <select
                  value={localItemsPerPage}
                  onChange={e => {
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
                  {selectedParameterSize !== 'all'
                    ? ` (${sortedModels.length} after filters)`
                    : ''}
                  {sortedModels.length > localItemsPerPage && (
                    <>
                      {' '}
                      • Showing {startIndex + 1}-
                      {Math.min(endIndex, sortedModels.length)} of{' '}
                      {sortedModels.length}
                    </>
                  )}
                </>
              ) : (
                <>
                  {sortedModels.length > localItemsPerPage ? (
                    <>
                      Showing {startIndex + 1}-
                      {Math.min(endIndex, sortedModels.length)} of{' '}
                      {sortedModels.length} models
                    </>
                  ) : (
                    <>
                      Showing {sortedModels.length} of {availableModels.length}{' '}
                      models
                    </>
                  )}
                </>
              )}
            </div>
            {(searchQuery ||
              selectedParameterSize !== 'all' ||
              sortBy !== 'downloads' ||
              sortOrder !== 'desc' ||
              localItemsPerPage !== DEFAULT_ITEMS_PER_PAGE) && (
              <button
                onClick={() => {
                  setSearchQuery('');
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

        {isScanningModels || isSearching ? (
          <ModelSearchProgress
            isVisible={true}
            isSearching={isSearching}
            isScanningModels={isScanningModels}
            onClose={() => {}}
          />
        ) : loadingAvailable ? (
          <div className="text-center py-8">
            <Loader2
              size={24}
              className="text-blue-400 animate-spin mx-auto mb-2"
            />
            <p className="text-gray-400">Loading available models...</p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {filteredAvailableModels.map(model => {
                const progressInfo = downloads.get(model.filename);
                const isAlreadyDownloaded = localModels.some(
                  local => local.filename === model.filename
                );

                // Transform the model data to match ModelCard's expected interface
                const modelForCard = {
                  id: model.filename,
                  name: model.modelId || model.name,
                  modelId: model.modelId,
                  filename: model.filename,
                  size: model.size || 0,
                  trainedContextLength: model.trainedContextLength,
                  maxContextLength: model.maxContextLength,
                  parameterCount: model.parameterCount,
                  quantization: model.quantization,
                  vramEstimates: model.vramEstimates,
                  modelArchitecture: model.modelArchitecture,
                  hasVramData: model.hasVramData,
                  vramError: model.vramError,
                  description: model.description,
                  huggingFaceUrl: model.huggingFaceUrl,
                  downloads: model.downloads,
                  username: model.username,
                  likes: model.likes,
                  updatedAt: model.updatedAt,
                  // Multi-part model fields
                  isMultiPart: model.isMultiPart,
                  totalParts: model.totalParts,
                  allPartFiles: model.allPartFiles,
                  totalSize: model.totalSize,
                };

                return (
                  <ModelCard
                    key={`${model.filename}-${model.name}-${model.url}`}
                    model={modelForCard}
                    formatFileSize={formatFileSize}
                    isDownloadable={true}
                    isAlreadyDownloaded={isAlreadyDownloaded}
                    downloadProgress={progressInfo}
                    onDownload={() => handleDownload(model)}
                    onCancelDownload={() =>
                      handleCancelDownload(model.filename)
                    }
                    onDismissError={() => handleDismissError(model.filename)}
                  />
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
      <HuggingFaceConfigDialog
        isOpen={showHfConfigDialog}
        onClose={() => setShowHfConfigDialog(false)}
        hfToken={hfToken}
        setHfToken={setHfToken}
        showHfToken={showHfToken}
        setShowHfToken={setShowHfToken}
        actualToken={actualToken}
        setActualToken={setActualToken}
        isTokenSaved={isTokenSaved}
        setIsTokenSaved={setIsTokenSaved}
      />

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
