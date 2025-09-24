import { create } from 'zustand';
import type { LLMModel } from '../hooks/useModels';
import { modelEvents } from '../utils/modelEvents';
import { sseEventBus } from '../utils/sseEventBus';
import { SSEEventType } from '../types';
import { logger } from '../utils/logger';

interface ModelsState {
  models: LLMModel[];
  isLoading: boolean;
  error: string | null;
  defaultModelId: string | null;

  // Actions
  setModels: (models: LLMModel[]) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setDefaultModel: (modelId: string) => Promise<void>;
  fetchModels: () => Promise<void>;
  rescanModels: () => Promise<void>;
  getDefaultModel: () => LLMModel | null;
}

export const useModelsStore = create<ModelsState>((set, get) => ({
  models: [],
  isLoading: true,
  error: null,
  defaultModelId: null,

  setModels: models => {
    const defaultModel = models.find(m => m.isDefault);
    set({
      models,
      defaultModelId: defaultModel?.id || null,
      error: null,
    });
  },

  setIsLoading: isLoading => set({ isLoading }),

  setError: error => set({ error }),

  setDefaultModel: async (modelId: string) => {
    try {
      const { models, defaultModelId } = get();

      // Check if we're switching away from a local model
      const currentModel = models.find(m => m.id === defaultModelId);
      const newModel = models.find(m => m.id === modelId);

      // If switching from local to non-local model, unload all local models
      if (currentModel?.type === 'local' && newModel?.type !== 'local') {
        try {
          // Find all currently loaded local models and unload them
          const localModelsResponse = await fetch('/api/local-llm/models');
          if (localModelsResponse.ok) {
            const localModels = await localModelsResponse.json();

            // Check if any local models are loaded
            const loadedModels = localModels.filter(
              (model: { status: string }) => model.status === 'loaded'
            );
            if (loadedModels.length > 0) {
              logger.info(
                `Unloading ${loadedModels.length} local model(s) to free memory...`
              );
            }

            // Unload all loaded local models
            for (const model of localModels) {
              if (model.status === 'loaded') {
                try {
                  await fetch(`/api/local-llm/models/${model.id}/unload`, {
                    method: 'POST',
                  });
                  logger.info(`Unloaded local model: ${model.name}`);
                } catch (unloadError) {
                  logger.warn(`Failed to unload local model ${model.name}:`, {
                    error: unloadError,
                  });
                }
              }
            }
          }
        } catch (error) {
          logger.warn('Failed to unload local models:', { error });
          // Continue with model switching even if unloading fails
        }
      }

      const response = await fetch('/api/llm/default-model', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ modelId }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Update local state
      const updatedModels = models.map(model => ({
        ...model,
        isDefault: model.id === modelId,
      }));

      set({
        models: updatedModels,
        defaultModelId: modelId,
        error: null,
      });

      // Store in global app store
      const { useAppStore } = await import('./useAppStore');
      useAppStore.getState().setLastUsedModel(modelId);

      // Update system info after model change
      const { useSystemInformationStore } = await import(
        './useSystemInformationStore'
      );
      useSystemInformationStore.getState().updateSystemInfo();
    } catch (error) {
      logger.error('Failed to set default model:', error);
      set({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to set default model',
      });
      throw error;
    }
  },

  fetchModels: async () => {
    try {
      set({ isLoading: true, error: null });

      const response = await fetch('/api/llm/models');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const fetchedModels = await response.json();
      get().setModels(fetchedModels);

      // Auto-select last used model if available
      const { useAppStore } = await import('./useAppStore');
      const lastUsedModel = useAppStore.getState().lastUsedModel;

      if (lastUsedModel && !fetchedModels.find((m: LLMModel) => m.isDefault)) {
        const lastUsedStillExists = fetchedModels.find(
          (m: LLMModel) => m.id === lastUsedModel.modelId
        );
        if (lastUsedStillExists) {
          await get().setDefaultModel(lastUsedModel.modelId);
        }
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to fetch models';
      set({ error: errorMessage });
    } finally {
      set({ isLoading: false });
    }
  },

  rescanModels: async () => {
    try {
      set({ isLoading: true, error: null });

      const response = await fetch('/api/llm/rescan', { method: 'POST' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      await get().fetchModels();
    } catch (error) {
      logger.error('Failed to rescan models:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to rescan models';
      set({ error: errorMessage });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  getDefaultModel: () => {
    const { models, defaultModelId } = get();
    return models.find(model => model.id === defaultModelId) || null;
  },
}));

// Event Bus Subscription for model updates
let modelsUnsubscribe: (() => void) | null = null;

export function initializeModelsEventSubscription(): void {
  if (modelsUnsubscribe) {
    return; // Already subscribed
  }

  modelsUnsubscribe = sseEventBus.subscribe(
    SSEEventType.MODELS_UPDATED,
    _event => {
      const { isLoading, fetchModels } = useModelsStore.getState();
      if (!isLoading) {
        fetchModels().catch(error =>
          logger.error(
            'Failed to fetch models on SSE models updated event:',
            error
          )
        );
      }
    }
  );
}

// Auto-initialize subscription and model events when module loads
if (typeof window !== 'undefined') {
  setTimeout(() => {
    initializeModelsEventSubscription();

    // Listen for model change events
    const handleModelChange = () => {
      const { isLoading, rescanModels } = useModelsStore.getState();
      if (!isLoading) {
        rescanModels().catch(error =>
          logger.error('Failed to rescan models on model change event:', error)
        );
      }
    };

    modelEvents.on('models-changed', handleModelChange);
    modelEvents.on('local-model-downloaded', handleModelChange);
    modelEvents.on('service-added', handleModelChange);
    modelEvents.on('service-removed', handleModelChange);

    // Initial fetch
    useModelsStore
      .getState()
      .fetchModels()
      .catch(error =>
        logger.error('Failed to fetch models during initialization:', error)
      );
  }, 100);
}
