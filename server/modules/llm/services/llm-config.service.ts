import { Injectable, Logger } from '@nestjs/common';
import {
  LLMConfigManager,
  LLMModel,
  CustomLLMService,
} from '../../../llmConfigManager';

@Injectable()
export class LlmConfigService {
  private readonly logger = new Logger(LlmConfigService.name);
  private llmConfigManager: LLMConfigManager;

  constructor() {
    this.llmConfigManager = new LLMConfigManager();
  }

  async getModels(): Promise<LLMModel[]> {
    try {
      const models = await this.llmConfigManager.getModels();
      this.logger.debug(
        `Retrieved ${models.length} models from LLMConfigManager`
      );
      return models;
    } catch (error) {
      this.logger.error('Error getting models from LLMConfigManager:', error);
      throw error;
    }
  }

  async getDefaultModel(): Promise<LLMModel | null> {
    try {
      const defaultModel = await this.llmConfigManager.getDefaultModel();
      this.logger.debug(
        `Retrieved default model: ${defaultModel?.id || 'none'}`
      );
      return defaultModel;
    } catch (error) {
      this.logger.error(
        'Error getting default model from LLMConfigManager:',
        error
      );
      throw error;
    }
  }

  async setDefaultModel(modelId: string): Promise<void> {
    try {
      await this.llmConfigManager.setDefaultModel(modelId);
      this.logger.log(`Set default model to: ${modelId}`);
    } catch (error) {
      this.logger.error('Error setting default model:', error);
      throw error;
    }
  }

  async refreshModels(
    detectedServices: unknown[],
    localModels: unknown[]
  ): Promise<void> {
    try {
      await this.llmConfigManager.refreshModels(detectedServices, localModels);
      this.logger.log('Refreshed models in LLMConfigManager');
    } catch (error) {
      this.logger.error('Error refreshing models:', error);
      throw error;
    }
  }

  async loadConfiguration(): Promise<void> {
    try {
      await this.llmConfigManager.loadConfiguration();
      this.logger.log('Loaded LLM configuration');
    } catch (error) {
      this.logger.error('Error loading LLM configuration:', error);
      throw error;
    }
  }

  async rescanServices(): Promise<{
    scannedServices: unknown[];
    addedServices?: unknown[];
    removedServices?: unknown[];
  }> {
    try {
      // Import the LLM scanner and local manager
      const { llmScanner } = await import('../../../llmScanner');
      const { getLocalLLMManager } = await import(
        '../../../../server/localLlmSingleton'
      );
      const { sseManager } = await import('../../../sseManager');
      const { SSEEventType } = await import('../../../../src/types');

      // Rescan services
      const services = await llmScanner.rescanServices();

      // Get existing custom services
      const existingServices = await this.llmConfigManager.getCustomServices();
      const existingBaseURLs = new Set(
        existingServices.map((s: { baseURL: string }) => s.baseURL)
      );
      const availableBaseURLs = new Set(
        services
          .filter(
            (s: { available: boolean; models: unknown[] }) =>
              s.available && s.models.length > 0
          )
          .map((s: { baseURL: string }) => s.baseURL)
      );

      // Auto-add discovered local services as custom services
      const availableServices = services.filter(
        (s: { available: boolean; models: unknown[] }) =>
          s.available && s.models.length > 0
      );
      const addedServices = [];

      for (const service of availableServices) {
        if (!existingBaseURLs.has(service.baseURL)) {
          try {
            const newService = await this.llmConfigManager.addCustomService({
              name: service.name,
              baseURL: service.baseURL,
              type: service.type,
              enabled: true,
            });
            addedServices.push(newService);
          } catch (error) {
            this.logger.warn(
              `Failed to auto-add service ${service.name}:`,
              error
            );
          }
        }
      }

      // Remove existing custom services that are no longer available (only local services)
      const removedServices = [];
      const localServiceTypes = ['ollama', 'vllm', 'openai-compatible'];

      for (const existingService of existingServices) {
        // Only remove local services that were likely auto-added
        if (
          localServiceTypes.includes(existingService.type) &&
          existingService.baseURL.includes('localhost') &&
          !availableBaseURLs.has(existingService.baseURL)
        ) {
          try {
            await this.llmConfigManager.removeCustomService(existingService.id);
            removedServices.push(existingService);
          } catch (error) {
            this.logger.warn(
              `Failed to auto-remove service ${existingService.name}:`,
              error
            );
          }
        }
      }

      // Get local models directly from the manager
      let localModels: unknown[] = [];
      try {
        const localLlmManager = getLocalLLMManager();
        localModels = await localLlmManager.getLocalModels();
      } catch (error) {
        this.logger.debug('Local LLM manager not available:', error);
      }

      // Refresh the unified model list with fresh scanned services
      await this.llmConfigManager.refreshModels(services, localModels);

      // Broadcast model updates to connected clients
      sseManager.broadcast('unified-events', {
        type: SSEEventType.MODELS_UPDATED,
        timestamp: Date.now(),
      });

      this.logger.log(
        `Rescanned ${services.length} services, added ${addedServices.length}, removed ${removedServices.length}`
      );

      return {
        scannedServices: services,
        addedServices: addedServices.length > 0 ? addedServices : undefined,
        removedServices:
          removedServices.length > 0 ? removedServices : undefined,
      };
    } catch (error) {
      this.logger.error('Error rescanning LLM services:', error);
      throw error;
    }
  }

  async getCustomServices(): Promise<CustomLLMService[]> {
    try {
      const customServices = await this.llmConfigManager.getCustomServices();
      this.logger.debug(
        `Retrieved ${customServices.length} custom services from LLMConfigManager`
      );
      return customServices;
    } catch (error) {
      this.logger.error(
        'Error getting custom services from LLMConfigManager:',
        error
      );
      throw error;
    }
  }

  async addCustomService(service: {
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
    enabled?: boolean;
  }): Promise<CustomLLMService> {
    try {
      const newService = await this.llmConfigManager.addCustomService(service);
      this.logger.log(`Added custom service: ${newService.name}`);
      return newService;
    } catch (error) {
      this.logger.error('Error adding custom service:', error);
      throw error;
    }
  }

  async updateCustomService(
    id: string,
    updates: {
      name?: string;
      baseURL?: string;
      type?: string;
      apiKey?: string;
      enabled?: boolean;
    }
  ): Promise<CustomLLMService> {
    try {
      const updatedService = await this.llmConfigManager.updateCustomService(
        id,
        updates
      );
      this.logger.log(`Updated custom service: ${id}`);
      return updatedService;
    } catch (error) {
      this.logger.error(`Error updating custom service ${id}:`, error);
      throw error;
    }
  }

  async removeCustomService(id: string): Promise<void> {
    try {
      await this.llmConfigManager.removeCustomService(id);
      this.logger.log(`Removed custom service: ${id}`);
    } catch (error) {
      this.logger.error(`Error removing custom service ${id}:`, error);
      throw error;
    }
  }

  async testService(
    baseURL: string,
    type: string,
    apiKey?: string
  ): Promise<{
    success: boolean;
    available?: boolean;
    models?: string[];
    error?: string;
  }> {
    try {
      if (!baseURL || !type) {
        throw new Error('baseURL and type are required');
      }

      let endpoint: string;
      switch (type) {
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
          // Return known Perplexity models
          return {
            success: true,
            models: ['sonar-pro', 'sonar', 'sonar-deep-research'],
          };
        case 'google':
          // Return known Google models
          return {
            success: true,
            models: [
              'gemini-1.5-pro',
              'gemini-1.5-flash',
              'gemini-2.5-pro',
              'gemini-2.5-flash',
              'gemini-pro',
            ],
          };
        default:
          throw new Error(`Unknown service type: ${type}`);
      }

      const headers: Record<string, string> = {
        Accept: 'application/json',
      };

      if (apiKey && (type === 'openai' || type === 'openai-compatible')) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      if (apiKey && type === 'anthropic') {
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
      }

      if (apiKey && type === 'perplexity') {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      if (apiKey && type === 'google') {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(`${baseURL}${endpoint}`, {
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          return {
            success: false,
            error: `HTTP ${response.status}: ${response.statusText}`,
          };
        }

        const data = (await response.json()) as unknown;

        let models: string[] = [];
        interface ModelResponse {
          id?: string;
          name?: string;
          model?: string;
        }

        interface OllamaResponse {
          models?: ModelResponse[];
        }

        interface OpenAIResponse {
          data?: ModelResponse[];
        }

        if (type === 'ollama') {
          const ollamaData = data as OllamaResponse;
          models =
            ollamaData?.models
              ?.map((m: ModelResponse) => m.name ?? m.model ?? '')
              .filter(Boolean) ?? [];
        } else if (type === 'anthropic') {
          const anthropicData = data as OpenAIResponse;
          models =
            anthropicData?.data
              ?.map((m: ModelResponse) => m.id ?? m.name ?? '')
              .filter(Boolean) ?? [];
        } else if (type === 'perplexity') {
          // This shouldn't be reached since we return early for perplexity, but just in case
          models = ['sonar-pro', 'sonar', 'sonar-deep-research'];
        } else if (type === 'google') {
          // This shouldn't be reached since we return early for google, but just in case
          models = [
            'gemini-1.5-pro',
            'gemini-1.5-flash',
            'gemini-2.5-pro',
            'gemini-2.5-flash',
            'gemini-pro',
          ];
        } else {
          const openaiData = data as OpenAIResponse;
          models =
            openaiData?.data
              ?.map((m: ModelResponse) => m.id ?? m.model ?? '')
              .filter(Boolean) ?? [];
        }

        return { success: true, models };
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          return { success: false, error: 'Request timeout' };
        } else {
          return {
            success: false,
            error:
              fetchError instanceof Error
                ? fetchError.message
                : 'Connection failed',
          };
        }
      }
    } catch (error) {
      this.logger.error(`Error testing LLM service at ${baseURL}:`, error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to test service',
      };
    }
  }
}
