import { create } from 'zustand';
import { toast } from 'react-hot-toast';
import { logger } from '../utils/logger';

export type CacheType = 'fp16' | 'q8_0' | 'q4_0';

export interface VRAMConfiguration {
  gpuLayers: number;
  contextSize: number;
  cacheType: CacheType;
  label: string;
}

export interface VRAMEstimate {
  expected: number;
  conservative: number;
}

export interface VRAMEstimateInfo extends VRAMEstimate {
  config: VRAMConfiguration;
}

export interface ModelArchitecture {
  layers?: number;
  kvHeads?: number;
  embeddingDim?: number;
  contextLength?: number;
  feedForwardDim?: number;
  modelSizeMB?: number;
}

export interface AvailableModel {
  name: string;
  url: string;
  filename: string;
  modelId?: string;
  size?: number;
  description?: string;

  contextLength?: number; // This is the estimated/guessed value, to be removed eventually
  trainedContextLength?: number;
  maxContextLength?: number;
  parameterCount?: string;
  quantization?: string;
  huggingFaceUrl?: string;
  downloads?: number;
  username?: string;
  likes?: number;
  updatedAt?: string;

  // VRAM calculation fields
  vramEstimates?: VRAMEstimateInfo[];
  modelArchitecture?: ModelArchitecture;
  hasVramData?: boolean;
  vramError?: string;
  isFetchingVram?: boolean; // Track if VRAM data is being fetched

  // Multi-part model fields
  isMultiPart?: boolean;
  totalParts?: number;
  allPartFiles?: string[];
  totalSize?: number;
}

interface AvailableModelsState {
  // Data
  availableModels: AvailableModel[];
  searchResults: AvailableModel[];

  // Search state
  searchQuery: string;
  hasSearched: boolean;
  isSearching: boolean;

  // Loading state
  isLoading: boolean;
  loadingAvailable: boolean;

  // Pagination and filtering
  currentPage: number;
  itemsPerPage: number;

  // Actions
  setSearchQuery: (query: string) => void;
  performSearch: (searchType?: string) => Promise<void>;
  clearSearch: () => void;
  loadAvailableModels: () => Promise<void>;
  loadCachedModels: () => Promise<boolean>;
  checkForModelUpdates: (visibleModelIds?: string[]) => Promise<void>;
  setCurrentPage: (page: number) => void;

  // Getters
  getDisplayModels: () => AvailableModel[];
  getTotalPages: () => number;
}

export const useAvailableModelsStore = create<AvailableModelsState>(
  (set, get) => ({
    // Initial state
    availableModels: [],
    searchResults: [],
    searchQuery: '',
    hasSearched: false,
    isSearching: false,
    isLoading: false,
    loadingAvailable: false,
    currentPage: 1,
    itemsPerPage: 20,

    setSearchQuery: (query: string) => {
      set({ searchQuery: query });

      // Clear search results when query becomes empty
      if (query.trim().length === 0) {
        set({
          searchResults: [],
          hasSearched: false,
          currentPage: 1,
        });
      }
    },

    performSearch: async (searchType: string = 'all') => {
      const { searchQuery } = get();

      if (!searchQuery.trim()) {
        // If no search query, clear search results and show all models
        set({
          searchResults: [],
          hasSearched: false,
          currentPage: 1,
        });
        return;
      }

      if (searchQuery.trim().length < 3) {
        toast.error('Please enter at least 3 characters to search');
        return;
      }

      try {
        set({ isSearching: true });

        const response = await fetch('/api/local-llm/search-models', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: searchQuery.trim(),
            searchType: searchType,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to search models');
        }

        const data = (await response.json()) as {
          models?: AvailableModel[];
        };
        set({
          searchResults: data.models ?? [],
          hasSearched: true,
          currentPage: 1,
        });

        const searchTypeText = searchType === 'all' ? 'all fields' : searchType;
        toast.success(
          `Found ${data.models?.length ?? 0} models for "${searchQuery.trim()}" in ${searchTypeText}`
        );
      } catch (error) {
        logger.error('Error searching models:', error);

        // Handle specific error messages from server
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        if (
          errorMessage.includes('timed out') ||
          errorMessage.includes('504')
        ) {
          toast.error(
            'Search timed out. HuggingFace API is slow. Try a more specific search term.'
          );
        } else if (
          errorMessage.includes('temporarily unavailable') ||
          errorMessage.includes('502')
        ) {
          toast.error(
            'HuggingFace API is temporarily unavailable. Please try again later.'
          );
        } else {
          toast.error(
            'Failed to search models. Try again or search for different terms.'
          );
        }
      } finally {
        set({ isSearching: false });
      }
    },

    clearSearch: () => {
      set({
        searchQuery: '',
        searchResults: [],
        hasSearched: false,
        currentPage: 1,
      });
    },

    loadCachedModels: async () => {
      try {
        const response = await fetch('/api/local-llm/available-models-cached');
        if (response.ok) {
          const data = (await response.json()) as AvailableModel[];
          const models = data ?? [];
          set({ availableModels: models });
          return models.length > 0;
        } else {
          logger.error('Failed to load cached models:', response.statusText);
          return false;
        }
      } catch (error) {
        logger.error('Error loading cached models:', error);
        return false;
      }
    },

    loadAvailableModels: async () => {
      try {
        set({ loadingAvailable: true });

        const response = await fetch('/api/local-llm/available-models');
        if (response.ok) {
          const data = (await response.json()) as AvailableModel[];
          set({ availableModels: data ?? [] });
        } else {
          logger.error('Failed to load available models:', response.statusText);
        }
      } catch (error) {
        logger.error('Error loading available models:', error);
      } finally {
        set({ loadingAvailable: false });
      }
    },

    checkForModelUpdates: async (visibleModelIds?: string[]) => {
      const { availableModels, searchResults } = get();

      // Get all current model IDs
      const allModels = [...availableModels, ...searchResults];
      const allModelIds = allModels.map(m => m.modelId ?? m.filename);

      // Determine which models are visible and need VRAM data
      let modelsToFetchVram: string[] = [];
      if (visibleModelIds && visibleModelIds.length > 0) {
        // Only fetch VRAM for visible models that don't have it yet
        const visibleModels = allModels.filter(m =>
          visibleModelIds.includes(m.modelId ?? m.filename)
        );
        modelsToFetchVram = visibleModels
          .filter(m => !m.hasVramData && !m.isFetchingVram && !m.vramError)
          .map(m => m.modelId ?? m.filename);

        // Mark visible models as fetching
        if (modelsToFetchVram.length > 0) {
          set(state => {
            const updatedAvailable = state.availableModels.map(model => {
              const shouldFetch = modelsToFetchVram.includes(
                model.modelId ?? model.filename
              );
              return shouldFetch ? { ...model, isFetchingVram: true } : model;
            });

            const updatedSearch = state.searchResults.map(model => {
              const shouldFetch = modelsToFetchVram.includes(
                model.modelId ?? model.filename
              );
              return shouldFetch ? { ...model, isFetchingVram: true } : model;
            });

            return {
              availableModels: updatedAvailable,
              searchResults: updatedSearch,
            };
          });
        }
      }

      try {
        const response = await fetch('/api/local-llm/check-model-updates', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            modelIds: allModelIds,
            visibleModelIds: modelsToFetchVram,
          }),
        });

        if (response.ok) {
          const data = (await response.json()) as {
            models?: AvailableModel[];
          };
          const updatedModels = data.models ?? [];

          if (updatedModels.length > 0) {
            // Update both availableModels and searchResults with new data
            set(state => {
              const updatedAvailable = state.availableModels.map(model => {
                const update = updatedModels.find(
                  (u: AvailableModel) =>
                    (u.modelId ?? u.filename) ===
                    (model.modelId ?? model.filename)
                );
                if (update) {
                  return { ...update, isFetchingVram: false } as AvailableModel;
                }
                // If no update found but was marked as fetching, unmark it
                const wasFetching = modelsToFetchVram.includes(
                  model.modelId ?? model.filename
                );
                return wasFetching
                  ? { ...model, isFetchingVram: false }
                  : model;
              });

              const updatedSearch = state.searchResults.map(model => {
                const update = updatedModels.find(
                  (u: AvailableModel) =>
                    (u.modelId ?? u.filename) ===
                    (model.modelId ?? model.filename)
                );
                if (update) {
                  return { ...update, isFetchingVram: false } as AvailableModel;
                }
                // If no update found but was marked as fetching, unmark it
                const wasFetching = modelsToFetchVram.includes(
                  model.modelId ?? model.filename
                );
                return wasFetching
                  ? { ...model, isFetchingVram: false }
                  : model;
              });

              return {
                availableModels: updatedAvailable,
                searchResults: updatedSearch,
              };
            });
          } else {
            // No updates found, unmark fetching status
            set(state => {
              const updatedAvailable = state.availableModels.map(model => {
                const wasFetching = modelsToFetchVram.includes(
                  model.modelId ?? model.filename
                );
                return wasFetching
                  ? { ...model, isFetchingVram: false }
                  : model;
              });

              const updatedSearch = state.searchResults.map(model => {
                const wasFetching = modelsToFetchVram.includes(
                  model.modelId ?? model.filename
                );
                return wasFetching
                  ? { ...model, isFetchingVram: false }
                  : model;
              });

              return {
                availableModels: updatedAvailable,
                searchResults: updatedSearch,
              };
            });
          }
        }
      } catch (error) {
        logger.debug('Error checking for model updates:', {
          error: String(error),
        });

        // Unmark fetching status on error
        if (modelsToFetchVram.length > 0) {
          set(state => {
            const updatedAvailable = state.availableModels.map(model => {
              const wasFetching = modelsToFetchVram.includes(
                model.modelId ?? model.filename
              );
              return wasFetching ? { ...model, isFetchingVram: false } : model;
            });

            const updatedSearch = state.searchResults.map(model => {
              const wasFetching = modelsToFetchVram.includes(
                model.modelId ?? model.filename
              );
              return wasFetching ? { ...model, isFetchingVram: false } : model;
            });

            return {
              availableModels: updatedAvailable,
              searchResults: updatedSearch,
            };
          });
        }
      }
    },

    setCurrentPage: (page: number) => {
      set({ currentPage: page });
    },

    getDisplayModels: () => {
      const { hasSearched, searchQuery, searchResults, availableModels } =
        get();
      return hasSearched && searchQuery.trim()
        ? searchResults
        : availableModels;
    },

    getTotalPages: () => {
      const { itemsPerPage } = get();
      const displayModels = get().getDisplayModels();
      return Math.ceil(displayModels.length / itemsPerPage);
    },
  })
);
