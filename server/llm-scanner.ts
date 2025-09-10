import { logger } from './logger.js';

export interface AvailableLLMService {
  id: string;
  name: string;
  baseURL: string;
  models: string[];
  type: 'ollama' | 'vllm' | 'openai-compatible';
  available: boolean;
}

export class LLMScanner {
  private services: AvailableLLMService[] = [];

  async scanAvailableServices(): Promise<AvailableLLMService[]> {
    logger.info('Scanning for available LLM services...');
    
    const potentialServices = [
      {
        id: 'ollama-local',
        name: 'Ollama (Local)',
        baseURL: 'http://localhost:11434',
        type: 'ollama' as const
      },
      {
        id: 'vllm-local',
        name: 'vLLM (Local)',
        baseURL: 'http://localhost:8000',
        type: 'vllm' as const
      },
      {
        id: 'vllm-alt',
        name: 'vLLM (Alt Port)',
        baseURL: 'http://localhost:8080',
        type: 'vllm' as const
      },
      {
        id: 'openai-compatible-8001',
        name: 'OpenAI Compatible (Port 8001)',
        baseURL: 'http://localhost:8001',
        type: 'openai-compatible' as const
      }
    ];

    this.services = [];

    for (const service of potentialServices) {
      try {
        const models = await this.checkService(service);
        this.services.push({
          ...service,
          models,
          available: models.length > 0
        });
        
        if (models.length > 0) {
          logger.info(`✓ Found ${service.name} with ${models.length} models: ${models.slice(0, 3).join(', ')}${models.length > 3 ? '...' : ''}`);
        }
      } catch (error) {
        this.services.push({
          ...service,
          models: [],
          available: false
        });
        logger.debug(`✗ ${service.name} not available: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const availableCount = this.services.filter(s => s.available).length;
    logger.info(`Scan complete: ${availableCount} LLM services available`);
    
    return this.services;
  }

  private async checkService(service: { baseURL: string; type: string }): Promise<string[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

    try {
      let endpoint: string;
      let expectedResponseStructure: (data: any) => string[];

      switch (service.type) {
        case 'ollama':
          endpoint = '/api/tags';
          expectedResponseStructure = (data) => {
            if (data?.models && Array.isArray(data.models)) {
              return data.models.map((model: any) => model.name || model.model || '').filter(Boolean);
            }
            return [];
          };
          break;
        
        case 'vllm':
        case 'openai-compatible':
          endpoint = '/v1/models';
          expectedResponseStructure = (data) => {
            if (data?.data && Array.isArray(data.data)) {
              return data.data.map((model: any) => model.id || model.model || '').filter(Boolean);
            }
            return [];
          };
          break;
        
        default:
          throw new Error(`Unknown service type: ${service.type}`);
      }

      const response = await fetch(`${service.baseURL}${endpoint}`, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return expectedResponseStructure(data);

    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  getAvailableServices(): AvailableLLMService[] {
    return this.services.filter(service => service.available);
  }

  getAllServices(): AvailableLLMService[] {
    return this.services;
  }

  async rescanServices(): Promise<AvailableLLMService[]> {
    return this.scanAvailableServices();
  }
}
