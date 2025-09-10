import { useState, useEffect } from 'react';

export interface CustomLLMService {
  id: string;
  name: string;
  baseURL: string;
  type: 'ollama' | 'vllm' | 'openai-compatible' | 'openai' | 'anthropic';
  apiKey?: string;
  enabled: boolean;
  custom: boolean; // Whether this was manually added by user
}

export interface LLMServiceConfig {
  detectedServices: CustomLLMService[];
  customServices: CustomLLMService[];
}

export function useLlmServices() {
  const [config, setConfig] = useState<LLMServiceConfig>({
    detectedServices: [],
    customServices: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load saved custom services from localStorage
  const loadCustomServices = (): CustomLLMService[] => {
    try {
      const saved = localStorage.getItem('customLlmServices');
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.error('Failed to load custom LLM services:', error);
      return [];
    }
  };

  // Save custom services to localStorage
  const saveCustomServices = (services: CustomLLMService[]) => {
    try {
      localStorage.setItem('customLlmServices', JSON.stringify(services));
    } catch (error) {
      console.error('Failed to save custom LLM services:', error);
    }
  };

  // Fetch detected services from server
  const fetchDetectedServices = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/llm/available');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const services = await response.json();
      
      // Convert server format to our format
      const detectedServices: CustomLLMService[] = services.map((service: any) => ({
        id: service.id,
        name: service.name,
        baseURL: service.baseURL,
        type: service.type,
        enabled: service.available,
        custom: false
      }));
      
      setConfig(prev => ({
        ...prev,
        detectedServices
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch services');
    } finally {
      setIsLoading(false);
    }
  };

  // Add a custom service
  const addCustomService = (service: Omit<CustomLLMService, 'id' | 'custom'>) => {
    const newService: CustomLLMService = {
      ...service,
      id: `custom-${Date.now()}`,
      custom: true
    };
    
    const updated = [...config.customServices, newService];
    setConfig(prev => ({
      ...prev,
      customServices: updated
    }));
    saveCustomServices(updated);
  };

  // Remove a custom service
  const removeCustomService = (id: string) => {
    const updated = config.customServices.filter(service => service.id !== id);
    setConfig(prev => ({
      ...prev,
      customServices: updated
    }));
    saveCustomServices(updated);
  };

  // Update a custom service
  const updateCustomService = (id: string, updates: Partial<CustomLLMService>) => {
    const updated = config.customServices.map(service =>
      service.id === id ? { ...service, ...updates } : service
    );
    setConfig(prev => ({
      ...prev,
      customServices: updated
    }));
    saveCustomServices(updated);
  };

  // Toggle service enabled state
  const toggleServiceEnabled = (id: string, isCustom: boolean) => {
    if (isCustom) {
      updateCustomService(id, { enabled: !config.customServices.find(s => s.id === id)?.enabled });
    } else {
      // For detected services, we can't really disable them, but we can track preference
      // This could be extended to maintain a preference state
    }
  };

  // Test a service connection
  const testService = async (service: CustomLLMService): Promise<{ success: boolean; error?: string; models?: string[] }> => {
    try {
      const response = await fetch('/api/llm/test-service', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          baseURL: service.baseURL,
          type: service.type,
          apiKey: service.apiKey
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Connection failed' 
      };
    }
  };

  // Rescan detected services
  const rescanServices = async () => {
    try {
      const response = await fetch('/api/llm/rescan', { method: 'POST' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      await fetchDetectedServices();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rescan services');
    }
  };

  // Initialize
  useEffect(() => {
    setConfig(prev => ({
      ...prev,
      customServices: loadCustomServices()
    }));
    fetchDetectedServices();
  }, []);

  return {
    config,
    isLoading,
    error,
    addCustomService,
    removeCustomService,
    updateCustomService,
    toggleServiceEnabled,
    testService,
    rescanServices,
    refresh: fetchDetectedServices
  };
}
