import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '@nestjs/common';
import { getLLMConfigDirectory } from './settings-directory';

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

export interface LLMConfiguration {
  models: LLMModel[];
  customServices: CustomLLMService[];
  defaultModelId?: string;
  lastUpdated: Date;
}

interface DetectedService {
  id: string;
  name: string;
  baseURL: string;
  type: string;
  available: boolean;
  models?: string[];
  modelsWithMetadata?: Array<{
    name: string;
    display_name?: string;
    context_length?: number;
    parameter_count?: string;
    quantization?: string;
  }>;
}

interface LocalModel {
  id: string;
  name: string;
  trainedContextLength?: number;
  maxContextLength?: number;
  contextLength?: number;
  parameterCount?: string;
  quantization?: string;
}

export class LLMConfigManager {
  private readonly logger = new Logger(LLMConfigManager.name);
  private readonly configDirectory: string;
  private readonly configPath: string;
  private configuration: LLMConfiguration | null = null;

  constructor() {
    this.configDirectory = getLLMConfigDirectory();
    this.configPath = path.join(this.configDirectory, 'config.json');
  }

  private isValidConfiguration(obj: unknown): obj is LLMConfiguration {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'models' in obj &&
      Array.isArray((obj as { models: unknown }).models) &&
      'customServices' in obj &&
      Array.isArray((obj as { customServices: unknown }).customServices) &&
      'lastUpdated' in obj
    );
  }

  async loadConfiguration(): Promise<LLMConfiguration> {
    try {
      await fs.mkdir(this.configDirectory, { recursive: true });

      const data = await fs.readFile(this.configPath, 'utf-8');

      if (!data || data.trim() === '') {
        throw new Error('Empty configuration file');
      }

      const parsed: unknown = JSON.parse(data) as unknown;
      this.configuration = this.isValidConfiguration(parsed) ? parsed : null;

      if (!this.configuration) {
        throw new Error('Invalid configuration format');
      }

      this.configuration.lastUpdated = new Date(this.configuration.lastUpdated);

      return this.configuration;
    } catch (error: unknown) {
      if (
        (error as NodeJS.ErrnoException).code === 'ENOENT' ||
        (error as Error).message === 'Empty configuration file' ||
        (error as Error).message === 'Invalid configuration format' ||
        error instanceof SyntaxError
      ) {
        await fs.mkdir(this.configDirectory, { recursive: true });
        this.configuration = {
          models: [],
          customServices: [],
          lastUpdated: new Date(),
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
      this.logger.error('Failed to save LLM configuration:', error);
      throw error;
    }
  }

  async getModels(): Promise<LLMModel[]> {
    if (!this.configuration) {
      await this.loadConfiguration();
    }
    return this.configuration?.models ?? [];
  }

  async getDefaultModel(): Promise<LLMModel | null> {
    const models = await this.getModels();
    if (!this.configuration) {
      await this.loadConfiguration();
    }
    if (!this.configuration) {
      return null;
    }
    return (
      models.find(m => m.id === this.configuration!.defaultModelId) ?? null
    );
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

    this.configuration.models.forEach(m => (m.isDefault = false));

    model.isDefault = true;
    this.configuration.defaultModelId = modelId;

    await this.saveConfiguration();
  }

  async addCustomService(
    service: Omit<CustomLLMService, 'id' | 'custom'>
  ): Promise<CustomLLMService> {
    if (!this.configuration) {
      await this.loadConfiguration();
    }
    if (!this.configuration) {
      throw new Error('Failed to load configuration');
    }

    const newService: CustomLLMService = {
      ...service,
      id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      custom: true,
    };

    this.configuration.customServices.push(newService);
    await this.saveConfiguration();

    return newService;
  }

  async updateCustomService(
    id: string,
    updates: Partial<CustomLLMService>
  ): Promise<CustomLLMService> {
    if (!this.configuration) {
      await this.loadConfiguration();
    }
    if (!this.configuration) {
      throw new Error('Failed to load configuration');
    }

    const serviceIndex = this.configuration.customServices.findIndex(
      s => s.id === id
    );
    if (serviceIndex === -1) {
      throw new Error(`Custom service with ID ${id} not found`);
    }

    this.configuration.customServices[serviceIndex] = {
      ...this.configuration.customServices[serviceIndex],
      ...updates,
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
    this.configuration.customServices =
      this.configuration.customServices.filter(s => s.id !== id);

    if (this.configuration.customServices.length === initialLength) {
      throw new Error(`Custom service with ID ${id} not found`);
    }

    this.configuration.models = this.configuration.models.filter(
      m => m.serviceId !== id
    );

    await this.saveConfiguration();
  }

  async getCustomServices(): Promise<CustomLLMService[]> {
    if (!this.configuration) {
      await this.loadConfiguration();
    }
    return this.configuration?.customServices ?? [];
  }

  async refreshModels(
    detectedServices: DetectedService[],
    localModels: LocalModel[] = []
  ): Promise<LLMModel[]> {
    if (!this.configuration) {
      await this.loadConfiguration();
    }
    if (!this.configuration) {
      throw new Error('Failed to load configuration');
    }

    const newModels: LLMModel[] = [];

    const detectedBaseURLs = new Set(
      detectedServices.filter(s => s.available).map(s => s.baseURL)
    );

    for (const service of detectedServices) {
      if (!service.available) {
        continue;
      }

      if (service.modelsWithMetadata) {
        for (const modelMeta of service.modelsWithMetadata) {
          newModels.push({
            id: `${service.id}:${modelMeta.name}`,
            serviceId: service.id,
            serviceName: service.name,
            model: modelMeta.name,
            displayName: `${modelMeta.display_name ?? modelMeta.name} | ${service.name}`,
            baseURL: service.baseURL,
            type: service.type as LLMModel['type'],
            contextLength: modelMeta.context_length,
            parameterCount: modelMeta.parameter_count,
            quantization: modelMeta.quantization,
            available: true,
          });
        }
      } else if (service.models) {
        for (const modelName of service.models) {
          newModels.push({
            id: `${service.id}:${modelName}`,
            serviceId: service.id,
            serviceName: service.name,
            model: modelName,
            displayName: `${modelName} | ${service.name}`,
            baseURL: service.baseURL,
            type: service.type as LLMModel['type'],
            available: true,
          });
        }
      }
    }

    for (const customService of this.configuration.customServices) {
      if (!customService.enabled) {
        continue;
      }

      if (detectedBaseURLs.has(customService.baseURL)) {
        continue;
      }

      try {
        const models = await this.testCustomServiceModels(customService);

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
            available: true,
          });
        }
      } catch (error) {
        if (
          customService.name === 'Ollama (Local)' &&
          error &&
          typeof error === 'object' &&
          'cause' in error &&
          error.cause &&
          typeof error.cause === 'object' &&
          'code' in error.cause &&
          error.cause.code === 'ECONNREFUSED'
        ) {
          continue;
        }
        this.logger.warn(
          `Failed to refresh models for custom service ${customService.name}:`,
          error
        );
      }
    }

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
          contextLength:
            localModel.maxContextLength ??
            localModel.trainedContextLength ??
            localModel.contextLength,
          parameterCount: localModel.parameterCount,
          quantization: localModel.quantization,
          available: true,
        });
      }
    }

    const currentDefault = this.configuration.defaultModelId;
    const defaultStillExists = newModels.find(m => m.id === currentDefault);

    this.configuration.models = newModels;

    if (defaultStillExists) {
      const defaultModel = newModels.find(m => m.id === currentDefault);
      if (defaultModel) {
        defaultModel.isDefault = true;
      }
    } else {
      this.configuration.defaultModelId = undefined;
    }

    await this.saveConfiguration();
    return newModels;
  }

  private async testCustomServiceModels(
    service: CustomLLMService
  ): Promise<string[]> {
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
      case 'perplexity':
        return ['sonar-pro', 'sonar', 'sonar-deep-research'];
      case 'google':
        return [
          'gemini-1.5-pro',
          'gemini-1.5-flash',
          'gemini-2.5-pro',
          'gemini-2.5-flash',
          'gemini-pro',
        ];
      default:
        throw new Error(`Unknown service type: ${service.type}`);
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (
      service.apiKey &&
      (service.type === 'openai' || service.type === 'openai-compatible')
    ) {
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
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: unknown = await response.json();

      let models: string[] = [];
      if (service.type === 'ollama') {
        const responseData = data as {
          models?: Array<{ name?: string; model?: string }>;
        };
        models =
          responseData?.models
            ?.map(m => m.name ?? m.model ?? '')
            .filter(Boolean) ?? [];
      } else if (service.type === 'anthropic') {
        const responseData = data as {
          data?: Array<{ id?: string; name?: string }>;
        };
        models =
          responseData?.data?.map(m => m.id ?? m.name ?? '').filter(Boolean) ??
          [];
      } else {
        const responseData = data as {
          data?: Array<{ id?: string; name?: string }>;
        };
        models =
          responseData?.data
            ?.map(
              (m: unknown) =>
                (m as { id?: string; model?: string }).id ??
                (m as { id?: string; model?: string }).model ??
                ''
            )
            .filter(Boolean) ?? [];
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
