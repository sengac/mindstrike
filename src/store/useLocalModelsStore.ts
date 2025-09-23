import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import toast from 'react-hot-toast';
import { modelEvents } from '../utils/modelEvents';
import { logger } from '../utils/logger';

export interface ModelLoadingSettings {
  gpuLayers?: number; // -1 for auto, 0 for CPU only, positive number for specific layers
  contextSize?: number;
  batchSize?: number;
  threads?: number;
  temperature?: number; // 0.0 to 2.0, controls randomness of generation
}

// Enhanced settings that track what user has explicitly set
export interface ModelSettingsState {
  // User-specified values (sacred - never auto-override)
  userSettings: ModelLoadingSettings;
  // Auto-calculated fallbacks for unset values
  autoSettings: ModelLoadingSettings;
  // Merged effective settings for actual use
  effectiveSettings: ModelLoadingSettings;
  // Track which values were explicitly set by user
  userSetFlags: {
    gpuLayers?: boolean;
    contextSize?: boolean;
    batchSize?: boolean;
    threads?: boolean;
    temperature?: boolean;
  };
}

export interface ModelRuntimeInfo {
  actualGpuLayers?: number;
  gpuType?: string;
  memoryUsage?: {
    vramUsedMB?: number;
    vramTotalMB?: number;
    vramPercent?: number;
  };
  loadingTime?: number; // milliseconds
}

export interface LocalModelInfo {
  id: string;
  name: string;
  filename: string;
  path: string;
  size: number;
  downloaded: boolean;
  downloading: boolean;
  downloadProgress?: number;
  contextLength?: number;
  parameterCount?: string;
  quantization?: string;
  loadingSettings?: ModelLoadingSettings;
  layerCount?: number; // Total layers in the model from GGUF metadata
  maxContextLength?: number; // Maximum context length from GGUF metadata
}

export interface ModelStatus {
  loaded: boolean;
  info?: LocalModelInfo;
  runtimeInfo?: ModelRuntimeInfo;
}

interface LocalModelsState {
  // State
  localModels: LocalModelInfo[];
  modelStatuses: Map<string, ModelStatus>;
  isLoading: boolean;
  loadingModelId: string | null;
  error: string | null;

  // Actions
  setLocalModels: (models: LocalModelInfo[]) => void;
  setModelStatuses: (statuses: Map<string, ModelStatus>) => void;
  setIsLoading: (loading: boolean) => void;
  setLoadingModelId: (modelId: string | null) => void;
  setError: (error: string | null) => void;

  // Business logic actions
  fetchModelsAndStatuses: () => Promise<void>;
  loadModel: (modelId: string, isAutoLoad?: boolean) => Promise<void>;
  unloadModel: (modelId: string) => Promise<void>;
  deleteModel: (modelId: string) => Promise<void>;
  refreshModelStatus: (modelId: string) => Promise<void>;
  updateModelSettings: (
    modelId: string,
    settings: ModelLoadingSettings
  ) => Promise<void>;

  // Utility functions
  formatFileSize: (bytes: number) => string;
  getModelStatus: (modelId: string) => ModelStatus | undefined;
  isModelLoaded: (modelId: string) => boolean;
  isModelLoading: (modelId: string) => boolean;
}

export const useLocalModelsStore = create<LocalModelsState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    localModels: [],
    modelStatuses: new Map(),
    isLoading: false,
    loadingModelId: null,
    error: null,

    // Basic setters
    setLocalModels: models => set({ localModels: models }),
    setModelStatuses: statuses => set({ modelStatuses: statuses }),
    setIsLoading: loading => set({ isLoading: loading }),
    setLoadingModelId: modelId => set({ loadingModelId: modelId }),
    setError: error => set({ error }),

    // Main fetch function
    fetchModelsAndStatuses: async () => {
      try {
        set({ isLoading: true, error: null });

        // Load local models
        const modelsResponse = await fetch('/api/local-llm/models');
        if (modelsResponse.ok) {
          const models = await modelsResponse.json();

          // Load all model settings from server
          let allSettings: Record<string, any> = {};
          try {
            const settingsResponse = await fetch('/api/local-llm/settings');
            if (settingsResponse.ok) {
              allSettings = await settingsResponse.json();
            }
          } catch (error) {
            logger.error('Error loading server-side settings:', error);
          }

          // Merge server-calculated settings with user settings from server
          const modelsWithSettings = models.map((model: LocalModelInfo) => {
            const savedSettings = allSettings[model.id] || {};
            return {
              ...model,
              loadingSettings: {
                ...savedSettings, // User settings as base
                ...model.loadingSettings, // Server calculated settings take priority
              },
            };
          });

          set({ localModels: modelsWithSettings });

          // Load status for each model
          const statuses = new Map<string, ModelStatus>();
          await Promise.all(
            models.map(async (model: LocalModelInfo) => {
              try {
                const statusResponse = await fetch(
                  `/api/local-llm/models/${model.id}/status`
                );
                if (statusResponse.ok) {
                  const status = await statusResponse.json();
                  statuses.set(model.id, status);
                }
              } catch (error) {
                logger.error(
                  `Error loading status for model ${model.id}:`,
                  error
                );
              }
            })
          );
          set({ modelStatuses: statuses });
        }
      } catch (error) {
        logger.error('Error loading local LLM data:', error);
        const errorMessage =
          error instanceof TypeError && error.message.includes('NetworkError')
            ? 'Server not running.'
            : 'Failed to load local LLM data';

        set({ error: errorMessage });
        toast.error(errorMessage, { duration: 5000 });
      } finally {
        set({ isLoading: false });
      }
    },

    // Load model
    loadModel: async (modelId: string, isAutoLoad = false) => {
      const handleMemoryIssueRetry = async (targetModelId: string) => {
        try {
          toast('Insufficient memory detected. Unloading other models...', {
            duration: 4000,
            icon: 'ℹ️',
          });

          const { modelStatuses } = get();

          // Get all loaded models except the target
          const loadedModelIds = Array.from(modelStatuses.entries())
            .filter(([id, status]) => status.loaded && id !== targetModelId)
            .map(([id]) => id);

          if (loadedModelIds.length === 0) {
            toast.error(
              'No other models to unload. Please try a smaller model.'
            );
            return;
          }

          // Unload all other models
          await Promise.all(
            loadedModelIds.map(async modelId => {
              try {
                await fetch(`/api/local-llm/models/${modelId}/unload`, {
                  method: 'POST',
                });
              } catch (error) {
                logger.error(`Error unloading model ${modelId}:`, error);
              }
            })
          );

          // Refresh states
          await get().fetchModelsAndStatuses();

          toast('Retrying model loading...', {
            duration: 3000,
            icon: 'ℹ️',
          });

          // Retry after a brief delay
          setTimeout(() => {
            get().loadModel(targetModelId, true);
          }, 1000);
        } catch (error) {
          logger.error('Error during memory issue retry:', error);
          toast.error('Failed to free up memory and retry');
        }
      };

      try {
        set({ loadingModelId: modelId });

        const response = await fetch(`/api/local-llm/models/${modelId}/load`, {
          method: 'POST',
        });

        if (response.ok) {
          if (!isAutoLoad) {
            toast.success('Model loaded successfully');
          }

          // Refresh model status
          await get().fetchModelsAndStatuses();

          // Update system info after model load
          const { useSystemInformationStore } = await import(
            './use-system-information-store'
          );
          useSystemInformationStore.getState().updateSystemInfo();

          // Emit event to trigger global model rescan since local model state changed
          modelEvents.emit('models-changed');
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
        logger.error('Error loading model:', error);
        const message = isAutoLoad
          ? 'Failed to start model due to connection error'
          : 'Failed to load model';
        toast.error(message);
      } finally {
        set({ loadingModelId: null });
      }
    },

    // Unload model
    unloadModel: async (modelId: string) => {
      try {
        const response = await fetch(
          `/api/local-llm/models/${modelId}/unload`,
          {
            method: 'POST',
          }
        );

        if (response.ok) {
          toast.success('Model unloaded successfully');

          // Refresh model status
          await get().fetchModelsAndStatuses();

          // Update system info after model unload
          const { useSystemInformationStore } = await import(
            './use-system-information-store'
          );
          useSystemInformationStore.getState().updateSystemInfo();

          // Emit event to trigger global model rescan since local model state changed
          modelEvents.emit('models-changed');
        } else {
          const error = await response.json();
          toast.error(error.error || 'Failed to unload model');
        }
      } catch (error) {
        logger.error('Error unloading model:', error);
        toast.error('Failed to unload model');
      }
    },

    // Delete model
    deleteModel: async (modelId: string) => {
      try {
        const response = await fetch(`/api/local-llm/models/${modelId}`, {
          method: 'DELETE',
        });

        if (response.ok) {
          toast.success('Model deleted successfully');
          await get().fetchModelsAndStatuses(); // Reload data

          // Emit event to trigger global model rescan
          modelEvents.emit('models-changed');
        } else {
          const error = await response.json();
          toast.error(error.error || 'Failed to delete model');
        }
      } catch (error) {
        logger.error('Error deleting model:', error);
        toast.error('Failed to delete model');
      }
    },

    // Refresh single model status
    refreshModelStatus: async (modelId: string) => {
      try {
        const statusResponse = await fetch(
          `/api/local-llm/models/${modelId}/status`
        );
        if (statusResponse.ok) {
          const status = await statusResponse.json();
          const { modelStatuses } = get();
          const newStatuses = new Map(modelStatuses);
          newStatuses.set(modelId, status);
          set({ modelStatuses: newStatuses });
        }
      } catch (error) {
        logger.error(`Error refreshing status for model ${modelId}:`, error);
      }
    },

    // Update model loading settings
    updateModelSettings: async (
      modelId: string,
      settings: ModelLoadingSettings
    ) => {
      try {
        const response = await fetch(
          `/api/local-llm/models/${modelId}/settings`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(settings),
          }
        );

        if (response.ok) {
          // Update local model info with new settings
          const { localModels } = get();
          const updatedModels = localModels.map(model =>
            model.id === modelId
              ? {
                  ...model,
                  loadingSettings: { ...model.loadingSettings, ...settings },
                }
              : model
          );
          set({ localModels: updatedModels });

          toast.success('Model settings updated successfully');
        } else {
          const error = await response.json();
          toast.error(error.error || 'Failed to update model settings');
        }
      } catch (error) {
        logger.error('Error updating model settings:', error);
        toast.error('Failed to update model settings');
      }
    },

    // Utility functions
    formatFileSize: (bytes: number): string => {
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      let size = bytes;
      let unitIndex = 0;

      while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
      }

      return `${size.toFixed(1)} ${units[unitIndex]}`;
    },

    getModelStatus: (modelId: string) => {
      return get().modelStatuses.get(modelId);
    },

    isModelLoaded: (modelId: string) => {
      return get().modelStatuses.get(modelId)?.loaded || false;
    },

    isModelLoading: (modelId: string) => {
      return get().loadingModelId === modelId;
    },
  }))
);

// Global initialization and event handling
let localModelsInitialized = false;

export function initializeLocalModelsStore() {
  if (localModelsInitialized) {
    return;
  }
  localModelsInitialized = true;

  // Listen for model download completion to refresh the downloaded models list
  const handleModelDownloaded = () => {
    const { isLoading, fetchModelsAndStatuses } =
      useLocalModelsStore.getState();
    if (!isLoading) {
      fetchModelsAndStatuses().catch(error =>
        logger.error(
          'Failed to fetch models and statuses on model downloaded event:',
          error
        )
      );
    }
  };

  modelEvents.on('local-model-downloaded', handleModelDownloaded);
  modelEvents.on('models-changed', handleModelDownloaded);

  // Initial fetch
  useLocalModelsStore
    .getState()
    .fetchModelsAndStatuses()
    .catch(error =>
      logger.error(
        'Failed to fetch models and statuses during initialization:',
        error
      )
    );

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    modelEvents.off('local-model-downloaded', handleModelDownloaded);
    modelEvents.off('models-changed', handleModelDownloaded);
  });
}

// Auto-initialize when store is first used
useLocalModelsStore.subscribe(
  state => state.localModels,
  () => {
    if (!localModelsInitialized) {
      initializeLocalModelsStore();
    }
  },
  { fireImmediately: false }
);
