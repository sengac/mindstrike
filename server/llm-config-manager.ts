import fs from 'fs/promises';
import path from 'path';
import { logger } from './logger.js';
import { getLLMConfigDirectory } from './utils/settings-directory.js';

export interface LLMModel {
  id: string;
  serviceId: string;
  serviceName: string;
  model: string;
  displayName: string;
  baseURL: string;
  apiKey?: string;
  type: 'ollama' | 'vllm' | 'openai-compatible' | 'openai' | 'anthropic' | 'local';
  contextLength?: number;
  parameterCount?: string;
  quantization?: string;
  modelType?: string;
  available: boolean;
  isDefault?: boolean;
}

export interface CustomLLMService {
  id: string;
  name: string;
  baseURL: string;
  type: 'ollama' | 'vllm' | 'openai-compatible' | 'openai' | 'anthropic' | 'local';
  apiKey?: string;
  enabled: boolean;
  custom: boolean;
}

export interface LLMConfiguration {
  models: LLMModel[];
  customServices: CustomLLMService[];
  defaultModelId?: string;
  lastUpdated: Date;
}

export class LLMConfigManager {
  private configDirectory: string;
  private configPath: string;
  private configuration: LLMConfiguration | null = null;

  constructor() {
    this.configDirectory = getLLMConfigDirectory();
    this.configPath = path.join(this.configDirectory, 'config.json');
  }

  async loadConfiguration(): Promise<LLMConfiguration> {
    try {
      // Ensure config directory exists
      await fs.mkdir(this.configDirectory, { recursive: true });
      
      const data = await fs.readFile(this.configPath, 'utf-8');
      this.configuration = JSON.parse(data);
      
      // Ensure lastUpdated is a Date object
      if (this.configuration) {
        this.configuration.lastUpdated = new Date(this.configuration.lastUpdated);
      }
      
      return this.configuration!;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Create default configuration
        await fs.mkdir(this.configDirectory, { recursive: true });
        this.configuration = {
          models: [],
          customServices: [],
          lastUpdated: new Date()
        };
        await this.saveConfiguration();
        return this.configuration;
      }
      throw error;
    }
  }

  async saveConfiguration(): Promise<void> {
    if (!this.configuration) {
      throw new Error('No configuration to save');
    }

    this.configuration.lastUpdated = new Date();
    
    try {
      await fs.writeFile(
        this.configPath, 
        JSON.stringify(this.configuration, null, 2),
        'utf-8'
      );
    } catch (error) {
      logger.error('Failed to save LLM configuration:', error);
      throw error;
    }
  }

  async getModels(): Promise<LLMModel[]> {
    if (!this.configuration) {
      await this.loadConfiguration();
    }
    return this.configuration?.models || [];
  }

  async getDefaultModel(): Promise<LLMModel | null> {
    const models = await this.getModels();
    if (!this.configuration) {
      await this.loadConfiguration();
    }
    if (!this.configuration) return null;
    return models.find(m => m.id === this.configuration!.defaultModelId) || null;
  }

  async setDefaultModel(modelId: string): Promise<void> {
    if (!this.configuration) {
      await this.loadConfiguration();
    }
    if (!this.configuration) {
      throw new Error('Failed to load configuration');
    }

    const model = this.configuration.models.find(m => m.id === modelId);
    if (!model) {
      throw new Error(`Model with ID ${modelId} not found`);
    }

    // Clear previous default
    this.configuration.models.forEach(m => m.isDefault = false);
    
    // Set new default
    model.isDefault = true;
    this.configuration.defaultModelId = modelId;
    
    await this.saveConfiguration();
  }

  async addCustomService(service: Omit<CustomLLMService, 'id' | 'custom'>): Promise<CustomLLMService> {
    if (!this.configuration) {
      await this.loadConfiguration();
    }
    if (!this.configuration) {
      throw new Error('Failed to load configuration');
    }

    const newService: CustomLLMService = {
      ...service,
      id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      custom: true
    };

    this.configuration.customServices.push(newService);
    await this.saveConfiguration();
    
    return newService;
  }

  async updateCustomService(id: string, updates: Partial<CustomLLMService>): Promise<CustomLLMService> {
    if (!this.configuration) {
      await this.loadConfiguration();
    }
    if (!this.configuration) {
      throw new Error('Failed to load configuration');
    }

    const serviceIndex = this.configuration.customServices.findIndex(s => s.id === id);
    if (serviceIndex === -1) {
      throw new Error(`Custom service with ID ${id} not found`);
    }

    this.configuration.customServices[serviceIndex] = {
      ...this.configuration.customServices[serviceIndex],
      ...updates
    };

    await this.saveConfiguration();
    return this.configuration.customServices[serviceIndex];
  }

  async removeCustomService(id: string): Promise<void> {
    if (!this.configuration) {
      await this.loadConfiguration();
    }
    if (!this.configuration) {
      throw new Error('Failed to load configuration');
    }

    const initialLength = this.configuration.customServices.length;
    this.configuration.customServices = this.configuration.customServices.filter(s => s.id !== id);
    
    if (this.configuration.customServices.length === initialLength) {
      throw new Error(`Custom service with ID ${id} not found`);
    }

    // Remove models associated with this service
    this.configuration.models = this.configuration.models.filter(m => m.serviceId !== id);

    await this.saveConfiguration();
  }

  async getCustomServices(): Promise<CustomLLMService[]> {
    if (!this.configuration) {
      await this.loadConfiguration();
    }
    return this.configuration?.customServices || [];
  }

  async refreshModels(detectedServices: any[], localModels: any[] = []): Promise<LLMModel[]> {
    if (!this.configuration) {
      await this.loadConfiguration();
    }
    if (!this.configuration) {
      throw new Error('Failed to load configuration');
    }

    const newModels: LLMModel[] = [];

    // Keep track of detected service baseURLs to avoid duplicates
    const detectedBaseURLs = new Set(
      detectedServices.filter(s => s.available).map(s => s.baseURL)
    );

    // Process detected services
    for (const service of detectedServices) {
      if (!service.available) continue;

      if (service.modelsWithMetadata) {
        // New format with metadata
        for (const modelMeta of service.modelsWithMetadata) {
          newModels.push({
            id: `${service.id}:${modelMeta.name}`,
            serviceId: service.id,
            serviceName: service.name,
            model: modelMeta.name,
            displayName: `${modelMeta.display_name || modelMeta.name} | ${service.name}`,
            baseURL: service.baseURL,
            type: service.type,
            contextLength: modelMeta.context_length,
            parameterCount: modelMeta.parameter_count,
            quantization: modelMeta.quantization,
            modelType: modelMeta.model_type,
            available: true
          });
        }
      } else if (service.models) {
        // Legacy format
        for (const modelName of service.models) {
          newModels.push({
            id: `${service.id}:${modelName}`,
            serviceId: service.id,
            serviceName: service.name,
            model: modelName,
            displayName: `${modelName} | ${service.name}`,
            baseURL: service.baseURL,
            type: service.type,
            available: true
          });
        }
      }
    }

    // Process custom services (skip those that were already detected)
    for (const customService of this.configuration.customServices) {
      if (!customService.enabled) continue;
      
      // Skip custom services that match detected services to avoid duplicates
      if (detectedBaseURLs.has(customService.baseURL)) {
        continue;
      }

      try {
        // Test the service and get its models
        const models = await this.testCustomServiceModels(customService);
        
        // Get metadata for Ollama custom services
        if (customService.type === 'ollama' && models.length > 0) {
          try {
            const { LLMScanner } = require('./llm-scanner');
            const scanner = new LLMScanner();
            const modelsWithMetadata = await scanner.getAllModelsWithMetadata({
              ...customService,
              models
            });
            
            for (const modelMeta of modelsWithMetadata) {
              newModels.push({
                id: `${customService.id}:${modelMeta.name}`,
                serviceId: customService.id,
                serviceName: customService.name,
                model: modelMeta.name,
                displayName: `${modelMeta.name} | ${customService.name}`,
                baseURL: customService.baseURL,
                type: customService.type,
                apiKey: customService.apiKey,
                contextLength: modelMeta.context_length,
                available: true
              });
            }
          } catch (error) {
            logger.debug(`Failed to get metadata for custom Ollama service ${customService.name}:`, error);
            // Fallback to models without metadata
            for (const modelName of models) {
              newModels.push({
                id: `${customService.id}:${modelName}`,
                serviceId: customService.id,
                serviceName: customService.name,
                model: modelName,
                displayName: `${modelName} | ${customService.name}`,
                baseURL: customService.baseURL,
                type: customService.type,
                apiKey: customService.apiKey,
                available: true
              });
            }
          }
        } else {
          // Non-Ollama services or fallback
          for (const modelName of models) {
            newModels.push({
              id: `${customService.id}:${modelName}`,
              serviceId: customService.id,
              serviceName: customService.name,
              model: modelName,
              displayName: `${modelName} | ${customService.name}`,
              baseURL: customService.baseURL,
              type: customService.type,
              apiKey: customService.apiKey,
              available: true
            });
          }
        }
      } catch (error) {
        logger.warn(`Failed to refresh models for custom service ${customService.name}:`, error);
      }
    }

    // Process local models
    if (localModels.length > 0) {
      for (const localModel of localModels) {
        newModels.push({
          id: `local:${localModel.id}`,
          serviceId: 'local-llm',
          serviceName: 'Local Models (Built-in)',
          model: localModel.id,
          displayName: `${localModel.name} | Local Models`,
          baseURL: '/api/local-llm',
          type: 'local',
          contextLength: localModel.contextLength,
          parameterCount: localModel.parameterCount,
          quantization: localModel.quantization,
          modelType: localModel.modelType,
          available: true
        });
      }
    }

    // Preserve default model selection if it still exists
    const currentDefault = this.configuration.defaultModelId;
    const defaultStillExists = newModels.find(m => m.id === currentDefault);
    
    this.configuration.models = newModels;
    
    if (defaultStillExists) {
      const defaultModel = newModels.find(m => m.id === currentDefault);
      if (defaultModel) {
        defaultModel.isDefault = true;
      }
    } else {
      // Clear default if the model no longer exists
      this.configuration.defaultModelId = undefined;
    }

    await this.saveConfiguration();
    return newModels;
  }

  private async testCustomServiceModels(service: CustomLLMService): Promise<string[]> {
    let endpoint: string;
    switch (service.type) {
      case 'ollama':
        endpoint = '/api/tags';
        break;
      case 'vllm':
      case 'openai-compatible':
      case 'openai':
      case 'anthropic':
        endpoint = '/v1/models';
        break;
      default:
        throw new Error(`Unknown service type: ${service.type}`);
    }

    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    
    if (service.apiKey && (service.type === 'openai' || service.type === 'openai-compatible')) {
      headers['Authorization'] = `Bearer ${service.apiKey}`;
    }
    
    if (service.apiKey && service.type === 'anthropic') {
      headers['x-api-key'] = service.apiKey;
      headers['anthropic-version'] = '2023-06-01';
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`${service.baseURL}${endpoint}`, {
        headers,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      let models: string[] = [];
      if (service.type === 'ollama') {
        models = data?.models?.map((m: any) => m.name || m.model || '').filter(Boolean) || [];
      } else if (service.type === 'anthropic') {
        models = data?.data?.map((m: any) => m.id || m.name || '').filter(Boolean) || [];
      } else {
        models = data?.data?.map((m: any) => m.id || m.model || '').filter(Boolean) || [];
      }

      return models;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  async getConfiguration(): Promise<LLMConfiguration> {
    if (!this.configuration) {
      await this.loadConfiguration();
    }
    if (!this.configuration) {
      throw new Error('Failed to load configuration');
    }
    return this.configuration;
  }
}
