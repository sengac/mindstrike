import { useState, useEffect } from 'react';
import { CustomLLMService } from './useLlmServices';

export interface AvailableLLMService {
  id: string;
  name: string;
  baseURL: string;
  models: string[];
  type: 'ollama' | 'vllm' | 'openai-compatible' | 'openai';
  available: boolean;
}

export interface LLMModel {
  serviceId: string;
  serviceName: string;
  model: string;
  baseURL: string;
  displayName: string;
  apiKey?: string;
  type: 'ollama' | 'vllm' | 'openai-compatible' | 'openai';
}

export function useAvailableModels() {
  const [services, setServices] = useState<AvailableLLMService[]>([]);
  const [models, setModels] = useState<LLMModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAvailableModels = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Get detected services from server
      const response = await fetch('/api/llm/available');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const detectedServices: AvailableLLMService[] = await response.json();
      
      // Get custom services from localStorage
      const loadCustomServices = (): CustomLLMService[] => {
        try {
          const saved = localStorage.getItem('customLlmServices');
          return saved ? JSON.parse(saved) : [];
        } catch (error) {
          return [];
        }
      };
      
      const customServices = loadCustomServices();
      
      // Combine both detected and custom services
      const allServices = [...detectedServices];
      
      // Add custom services that are enabled
      for (const customService of customServices) {
        if (customService.enabled) {
          // Test if custom service has models (simplified)
          allServices.push({
            id: customService.id,
            name: customService.name,
            baseURL: customService.baseURL,
            type: customService.type,
            available: true,
            models: ['default'] // We'll assume at least one model for now
          });
        }
      }
      
      setServices(allServices);
      
      // Flatten services into individual models
      const allModels: LLMModel[] = [];
      allServices.forEach(service => {
        if (service.available && service.models.length > 0) {
          const customService = customServices.find(cs => cs.id === service.id);
          service.models.forEach(model => {
            allModels.push({
              serviceId: service.id,
              serviceName: service.name,
              model,
              baseURL: service.baseURL,
              displayName: `${model} (${service.name})`,
              apiKey: customService?.apiKey,
              type: service.type
            });
          });
        }
      });
      
      setModels(allModels);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch available models');
    } finally {
      setIsLoading(false);
    }
  };

  const rescanModels = async () => {
    // Just call fetchAvailableModels to maintain consistency
    await fetchAvailableModels();
  };

  useEffect(() => {
    fetchAvailableModels();
  }, []);

  return {
    services,
    models,
    isLoading,
    error,
    rescanModels,
    refetch: fetchAvailableModels
  };
}
