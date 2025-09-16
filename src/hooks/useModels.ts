import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { modelEvents } from '../utils/modelEvents';

export interface LLMModel {
  id: string;
  serviceId: string;
  serviceName: string;
  model: string;
  displayName: string;
  baseURL: string;
  apiKey?: string;
  type:
    | 'ollama'
    | 'vllm'
    | 'openai-compatible'
    | 'openai'
    | 'anthropic'
    | 'perplexity'
    | 'google'
    | 'local';
  contextLength?: number;
  parameterCount?: string;
  quantization?: string;

  available: boolean;
  isDefault?: boolean;
}

export interface CustomLLMService {
  id: string;
  name: string;
  baseURL: string;
  type:
    | 'ollama'
    | 'vllm'
    | 'openai-compatible'
    | 'openai'
    | 'anthropic'
    | 'perplexity'
    | 'google'
    | 'local';
  apiKey?: string;
  enabled: boolean;
  custom: boolean;
}

export function useModels() {
  const [models, setModels] = useState<LLMModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { lastUsedModel, setLastUsedModel } = useAppStore();

  const fetchModels = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/llm/models');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const fetchedModels = await response.json();
      setModels(fetchedModels);

      // Auto-select last used model if available
      if (lastUsedModel && !fetchedModels.find((m: LLMModel) => m.isDefault)) {
        const lastUsedStillExists = fetchedModels.find(
          (m: LLMModel) => m.id === lastUsedModel.modelId
        );
        if (lastUsedStillExists) {
          await setDefaultModel(lastUsedModel.modelId);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch models');
    } finally {
      setIsLoading(false);
    }
  }, [lastUsedModel]);

  const setDefaultModel = useCallback(
    async (modelId: string) => {
      try {
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
        setModels(prev =>
          prev.map(model => ({
            ...model,
            isDefault: model.id === modelId,
          }))
        );

        // Store in localStorage
        setLastUsedModel(modelId);
      } catch (error) {
        console.error('Failed to set default model:', error);
        throw error;
      }
    },
    [setLastUsedModel]
  );

  const getDefaultModel = useCallback(() => {
    return models.find(model => model.isDefault) || null;
  }, [models]);

  const rescanModels = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/llm/rescan', { method: 'POST' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      await fetchModels();
    } catch (error) {
      console.error('Failed to rescan models:', error);
      setError(
        error instanceof Error ? error.message : 'Failed to rescan models'
      );
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [fetchModels]);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  // Listen for model change events
  useEffect(() => {
    const handleModelChange = () => {
      if (!isLoading) {
        rescanModels();
      }
    };

    modelEvents.on('models-changed', handleModelChange);
    modelEvents.on('local-model-downloaded', handleModelChange);
    modelEvents.on('service-added', handleModelChange);
    modelEvents.on('service-removed', handleModelChange);

    return () => {
      modelEvents.off('models-changed', handleModelChange);
      modelEvents.off('local-model-downloaded', handleModelChange);
      modelEvents.off('service-added', handleModelChange);
      modelEvents.off('service-removed', handleModelChange);
    };
  }, [rescanModels, isLoading]);

  // Server-Sent Events for real-time model updates
  useEffect(() => {
    const eventSource = new EventSource('/api/llm/model-updates');

    eventSource.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'models-updated' && !isLoading) {
          fetchModels();
        }
      } catch (error) {
        console.error('Error parsing SSE data:', error);
      }
    };

    return () => eventSource.close();
  }, [fetchModels, isLoading]);

  return {
    models,
    isLoading,
    error,
    defaultModel: getDefaultModel(),
    setDefaultModel,
    rescanModels,
    refetch: fetchModels,
  };
}

export function useCustomServices() {
  const [services, setServices] = useState<CustomLLMService[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get access to rescanModels from the main useModels hook
  // We'll create a separate hook for global rescan notifications

  const fetchServices = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/llm/custom-services');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const fetchedServices = await response.json();
      setServices(fetchedServices);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to fetch custom services'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  const addService = useCallback(
    async (service: Omit<CustomLLMService, 'id' | 'custom'>) => {
      try {
        const response = await fetch('/api/llm/custom-services', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(service),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const newService = await response.json();
        setServices(prev => [...prev, newService]);

        // Emit event to trigger model rescan
        modelEvents.emit('service-added');

        return newService;
      } catch (error) {
        console.error('Failed to add custom service:', error);
        throw error;
      }
    },
    []
  );

  const updateService = useCallback(
    async (id: string, updates: Partial<CustomLLMService>) => {
      try {
        const response = await fetch(`/api/llm/custom-services/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updates),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const updatedService = await response.json();
        setServices(prev =>
          prev.map(service => (service.id === id ? updatedService : service))
        );

        // Emit event to trigger model rescan if service was enabled/disabled
        modelEvents.emit('service-added');

        return updatedService;
      } catch (error) {
        console.error('Failed to update custom service:', error);
        throw error;
      }
    },
    []
  );

  const removeService = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/llm/custom-services/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      setServices(prev => prev.filter(service => service.id !== id));

      // Emit event to trigger model rescan
      modelEvents.emit('service-removed');
    } catch (error) {
      console.error('Failed to remove custom service:', error);
      throw error;
    }
  }, []);

  const testService = useCallback(
    async (
      service: CustomLLMService
    ): Promise<{ success: boolean; error?: string; models?: string[] }> => {
      try {
        const response = await fetch('/api/llm/test-service', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            baseURL: service.baseURL,
            type: service.type,
            apiKey: service.apiKey,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Connection failed',
        };
      }
    },
    []
  );

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  return {
    services,
    isLoading,
    error,
    addService,
    updateService,
    removeService,
    testService,
    refetch: fetchServices,
  };
}
