import { useState, useEffect } from 'react';
import { CustomLLMService } from './useLlmServices';

export interface AvailableLLMService {
  id: string;
  name: string;
  baseURL: string;
  models: string[];
  type: 'ollama' | 'vllm' | 'openai-compatible' | 'openai' | 'anthropic';
  available: boolean;
}

export interface LLMModel {
  serviceId: string;
  serviceName: string;
  model: string;
  baseURL: string;
  displayName: string;
  apiKey?: string;
  type: 'ollama' | 'vllm' | 'openai-compatible' | 'openai' | 'anthropic';
  contextLength?: number;
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
      
      // Get detected services with metadata from server
      const response = await fetch('/api/llm/available-with-metadata');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const detectedServices: any[] = await response.json();
      
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
      
      // Add custom services that are enabled and fetch their models
      for (const customService of customServices) {
        if (customService.enabled) {
          try {
            // Test the service and get its actual models
            const testResponse = await fetch('/api/llm/test-service', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                baseURL: customService.baseURL,
                type: customService.type,
                apiKey: customService.apiKey
              })
            });

            if (testResponse.ok) {
              const testResult = await testResponse.json();
              if (testResult.success && testResult.models && testResult.models.length > 0) {
                allServices.push({
                  id: customService.id,
                  name: customService.name,
                  baseURL: customService.baseURL,
                  type: customService.type,
                  available: true,
                  models: testResult.models
                });
              }
            }
          } catch (error) {
            // If testing fails, skip this service or add with default model
            console.warn(`Failed to test custom service ${customService.name}:`, error);
          }
        }
      }
      
      setServices(allServices);
      
      // Flatten services into individual models
      const allModels: LLMModel[] = [];
      allServices.forEach(service => {
        if (service.available) {
          const customService = customServices.find(cs => cs.id === service.id);
          
          // Handle services with metadata (from new API)
          if (service.modelsWithMetadata) {
            service.modelsWithMetadata.forEach((modelMeta: any) => {
              allModels.push({
                serviceId: service.id,
                serviceName: service.name,
                model: modelMeta.name,
                baseURL: service.baseURL,
                displayName: `${modelMeta.name} | ${service.name}`,
                apiKey: customService?.apiKey,
                type: service.type,
                contextLength: modelMeta.context_length
              });
            });
          }
          // Fallback for services without metadata (legacy)
          else if (service.models && service.models.length > 0) {
            service.models.forEach((model: string) => {
              allModels.push({
                serviceId: service.id,
                serviceName: service.name,
                model,
                baseURL: service.baseURL,
                displayName: `${model} | ${service.name}`,
                apiKey: customService?.apiKey,
                type: service.type
              });
            });
          }
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
