import { create } from 'zustand';
import { LLMModel } from '../hooks/useModels';
import { modelEvents } from '../utils/modelEvents';

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

  setModels: (models) => {
    const defaultModel = models.find(m => m.isDefault);
    set({ 
      models, 
      defaultModelId: defaultModel?.id || null,
      error: null 
    });
  },

  setIsLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  setDefaultModel: async (modelId: string) => {
    try {
      const response = await fetch('/api/llm/default-model', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ modelId })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Update local state
      const { models } = get();
      const updatedModels = models.map(model => ({
        ...model,
        isDefault: model.id === modelId
      }));
      
      set({ 
        models: updatedModels,
        defaultModelId: modelId,
        error: null
      });

      // Store in global app store
      const { useAppStore } = await import('./useAppStore');
      useAppStore.getState().setLastUsedModel(modelId);
    } catch (error) {
      console.error('Failed to set default model:', error);
      set({ error: error instanceof Error ? error.message : 'Failed to set default model' });
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
        const lastUsedStillExists = fetchedModels.find((m: LLMModel) => m.id === lastUsedModel.modelId);
        if (lastUsedStillExists) {
          await get().setDefaultModel(lastUsedModel.modelId);
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch models';
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
      console.error('Failed to rescan models:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to rescan models';
      set({ error: errorMessage });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  getDefaultModel: () => {
    const { models, defaultModelId } = get();
    return models.find(model => model.id === defaultModelId) || null;
  }
}));

// Global SSE listener that runs regardless of component mounting
let sseInitialized = false;
let currentEventSource: EventSource | null = null;
let initializationTimeout: number | null = null;

function createSSEConnection(): EventSource {
  // Server-Sent Events for real-time model updates
  const eventSource = new EventSource('/api/llm/model-updates');
  
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'models-updated') {
        const { isLoading, fetchModels } = useModelsStore.getState();
        if (!isLoading) {
          fetchModels().catch(console.error);
        }
      }
    } catch (error) {
      console.error('Error parsing SSE data:', error);
    }
  };

  eventSource.onerror = (error) => {
    console.error('SSE connection error:', error);
    
    // Only attempt reconnect if connection was closed
    if (eventSource.readyState === EventSource.CLOSED) {
      setTimeout(() => {
        currentEventSource = createSSEConnection();
      }, 5000);
    }
  };

  return eventSource;
}

export function initializeModelsSSE() {
  if (sseInitialized) return;
  sseInitialized = true;
  
  // Clear any existing timeout
  if (initializationTimeout) {
    clearTimeout(initializationTimeout);
  }
  
  // Close any existing connection
  if (currentEventSource) {
    currentEventSource.close();
    currentEventSource = null;
  }
  
  // Delay SSE connection to allow server to fully start
  initializationTimeout = window.setTimeout(() => {
    currentEventSource = createSSEConnection();
    initializationTimeout = null;
  }, 2000);
  
  // Listen for model change events
  const handleModelChange = () => {
    const { isLoading, rescanModels } = useModelsStore.getState();
    if (!isLoading) {
      rescanModels().catch(console.error);
    }
  };

  modelEvents.on('models-changed', handleModelChange);
  modelEvents.on('local-model-downloaded', handleModelChange);
  modelEvents.on('service-added', handleModelChange);
  modelEvents.on('service-removed', handleModelChange);

  // Initial fetch
  useModelsStore.getState().fetchModels().catch(console.error);
}
