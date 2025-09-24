import { logger } from './logger.js';

export interface AvailableLLMService {
  id: string;
  name: string;
  baseURL: string;
  models: string[];
  type:
    | 'ollama'
    | 'vllm'
    | 'openai-compatible'
    | 'anthropic'
    | 'perplexity'
    | 'google';
  available: boolean;
  modelsWithMetadata?: ModelMetadata[];
}

export interface ModelMetadata {
  name: string;
  context_length?: number;
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
        type: 'ollama' as const,
      },
      {
        id: 'vllm-local',
        name: 'vLLM (Local)',
        baseURL: 'http://localhost:8000',
        type: 'vllm' as const,
      },
      {
        id: 'vllm-alt',
        name: 'vLLM (Alt Port)',
        baseURL: 'http://localhost:8080',
        type: 'vllm' as const,
      },
      {
        id: 'openai-compatible-8001',
        name: 'OpenAI Compatible (Port 8001)',
        baseURL: 'http://localhost:8001',
        type: 'openai-compatible' as const,
      },
    ];

    this.services = [];

    for (const service of potentialServices) {
      try {
        const models = await this.checkService(service);
        const serviceInfo: AvailableLLMService = {
          ...service,
          models,
          available: models.length > 0,
        };

        // Get metadata for models if service is available
        if (models.length > 0) {
          try {
            const modelsWithMetadata =
              await this.getAllModelsWithMetadata(serviceInfo);
            serviceInfo.modelsWithMetadata = modelsWithMetadata;
          } catch (error) {
            logger.debug(`Failed to get metadata for ${service.name}:`, error);
          }
        }

        this.services.push(serviceInfo);

        if (models.length > 0) {
          logger.info(
            `✓ Found ${service.name} with ${models.length} models: ${models.slice(0, 3).join(', ')}${models.length > 3 ? '...' : ''}`
          );
        }
      } catch (error) {
        this.services.push({
          ...service,
          models: [],
          available: false,
        });
        logger.debug(
          `✗ ${service.name} not available: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    const availableCount = this.services.filter(s => s.available).length;
    logger.info(`Scan complete: ${availableCount} LLM services available`);

    return this.services;
  }

  private async checkService(service: {
    baseURL: string;
    type: string;
  }): Promise<string[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

    try {
      let endpoint: string;
      let expectedResponseStructure: (
        data: Record<string, unknown>
      ) => string[];

      switch (service.type) {
        case 'ollama':
          endpoint = '/api/tags';
          expectedResponseStructure = data => {
            if (data?.models && Array.isArray(data.models)) {
              return data.models
                .map(
                  (model: { name?: string; model?: string }) =>
                    model.name || model.model || ''
                )
                .filter(Boolean);
            }
            return [];
          };
          break;

        case 'vllm':
        case 'openai-compatible':
          endpoint = '/v1/models';
          expectedResponseStructure = data => {
            if (data?.data && Array.isArray(data.data)) {
              return data.data
                .map(
                  (model: { id?: string; model?: string }) =>
                    model.id || model.model || ''
                )
                .filter(Boolean);
            }
            return [];
          };
          break;

        case 'anthropic':
          endpoint = '/v1/models';
          expectedResponseStructure = data => {
            if (data?.data && Array.isArray(data.data)) {
              return data.data
                .map(
                  (model: unknown) =>
                    (model as { id?: string; name?: string }).id ||
                    (model as { id?: string; name?: string }).name ||
                    ''
                )
                .filter(Boolean);
            }
            return [];
          };
          break;

        case 'perplexity':
          // Perplexity doesn't have a models endpoint, so we'll return known models
          return this.getPerplexityModels();

        case 'google':
          // Google doesn't expose a models endpoint via API, so we'll return known models
          return this.getGoogleModels();

        default:
          throw new Error(`Unknown service type: ${service.type}`);
      }

      const response = await fetch(`${service.baseURL}${endpoint}`, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
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

  async getModelMetadata(
    service: AvailableLLMService,
    modelName: string
  ): Promise<ModelMetadata | null> {
    if (service.type === 'anthropic') {
      // Get context length from documented values
      const contextLength = this.getAnthropicContextLength(modelName);
      return {
        name: modelName,
        context_length: contextLength,
      };
    }

    if (service.type === 'perplexity') {
      // Get context length from documented values
      const contextLength = this.getPerplexityContextLength(modelName);
      return {
        name: modelName,
        context_length: contextLength,
      };
    }

    if (service.type === 'google') {
      // Get context length from documented values
      const contextLength = this.getGoogleContextLength(modelName);
      return {
        name: modelName,
        context_length: contextLength,
      };
    }

    if (service.type !== 'ollama') {
      logger.debug(
        `Model metadata only supported for Ollama, Anthropic, Perplexity, and Google services, service type: ${service.type}`
      );
      return null;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    try {
      const response = await fetch(`${service.baseURL}/api/show`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelName,
        }),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Extract context length from model_info
      let contextLength: number | undefined;

      if (data?.model_info) {
        const modelInfo = data.model_info;

        // Search for any field ending with 'context_length' (most robust approach)
        for (const key of Object.keys(modelInfo)) {
          if (key.endsWith('context_length')) {
            contextLength = modelInfo[key];
            break;
          }
        }

        // Fallback to direct property access if needed
        if (!contextLength) {
          contextLength =
            modelInfo['context_length'] || modelInfo.context_length;
        }
      }

      return {
        name: modelName,
        context_length: contextLength,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        logger.debug(`Timeout getting metadata for model ${modelName}`);
      } else {
        logger.debug(
          `Error getting metadata for model ${modelName}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      return null;
    }
  }

  async getAllModelsWithMetadata(
    service: AvailableLLMService
  ): Promise<ModelMetadata[]> {
    if (
      service.type !== 'ollama' &&
      service.type !== 'anthropic' &&
      service.type !== 'perplexity' &&
      service.type !== 'google'
    ) {
      return service.models.map(name => ({ name }));
    }

    const modelsWithMetadata: ModelMetadata[] = [];

    for (const modelName of service.models) {
      const metadata = await this.getModelMetadata(service, modelName);
      if (metadata) {
        modelsWithMetadata.push(metadata);
      } else {
        modelsWithMetadata.push({ name: modelName });
      }
    }

    return modelsWithMetadata;
  }

  private getAnthropicContextLength(modelName: string): number {
    // Anthropic's API doesn't provide context length, so we use documented values from their manuals
    const model = modelName.toLowerCase();

    // Claude 3.5 Sonnet models
    if (
      model.includes('claude-3-5-sonnet') ||
      model.includes('claude-3.5-sonnet')
    ) {
      return 200000;
    }

    // Claude 3 models
    if (model.includes('claude-3-opus')) {
      return 200000;
    }
    if (model.includes('claude-3-sonnet')) {
      return 200000;
    }
    if (model.includes('claude-3-haiku')) {
      return 200000;
    }

    // Claude 2 models
    if (model.includes('claude-2.1')) {
      return 200000;
    }
    if (
      model.includes('claude-2.0') ||
      (model.includes('claude-2') && !model.includes('claude-2.1'))
    ) {
      return 100000;
    }

    // Claude Instant models
    if (model.includes('claude-instant')) {
      return 100000;
    }

    // Newer Claude models (Claude 4, etc.) - default to latest specification
    if (model.includes('claude-4') || model.includes('claude-opus-4')) {
      return 200000;
    }

    // Default for any other Claude models
    if (model.includes('claude')) {
      return 200000;
    }

    logger.debug(
      `Unknown Anthropic model: ${modelName}, using default context length`
    );
    return 200000; // Default for unknown Anthropic models
  }

  private async scanPerplexityService(
    service: AvailableLLMService
  ): Promise<AvailableLLMService> {
    // Perplexity doesn't expose a models endpoint, so we'll use the known models
    const knownModels = ['sonar-pro', 'sonar', 'sonar-deep-research'];

    const modelsWithMetadata = knownModels.map(modelName => ({
      name: modelName,
      contextLength: this.getPerplexityContextLength(modelName),
    }));

    return {
      ...service,
      models: knownModels,
      available: true,
      modelsWithMetadata,
    };
  }

  private getPerplexityContextLength(modelName: string): number {
    const model = modelName.toLowerCase();

    // Perplexity's documented context lengths
    if (model.includes('sonar-pro')) {
      return 127000; // sonar-pro context length
    }

    if (model.includes('sonar-deep-research')) {
      return 127000; // sonar-deep-research context length
    }

    if (model.includes('sonar')) {
      return 127000; // sonar context length
    }

    logger.debug(
      `Unknown Perplexity model: ${modelName}, using default context length`
    );
    return 127000; // Default for unknown Perplexity models
  }

  private async scanGoogleService(
    service: AvailableLLMService
  ): Promise<AvailableLLMService> {
    // Google doesn't expose a models endpoint via API, so we'll use the known models
    const knownModels = [
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-pro',
    ];

    const modelsWithMetadata = knownModels.map(modelName => ({
      name: modelName,
      contextLength: this.getGoogleContextLength(modelName),
    }));

    return {
      ...service,
      models: knownModels,
      available: true,
      modelsWithMetadata,
    };
  }

  private getGoogleContextLength(modelName: string): number {
    const model = modelName.toLowerCase();

    // Google Gemini documented context lengths
    if (model.includes('gemini-1.5-pro') || model.includes('gemini-2.5-pro')) {
      return 2000000; // 2M tokens for Gemini 1.5/2.5 Pro
    }

    if (
      model.includes('gemini-1.5-flash') ||
      model.includes('gemini-2.5-flash')
    ) {
      return 1000000; // 1M tokens for Gemini 1.5/2.5 Flash
    }

    if (model.includes('gemini-pro')) {
      return 32768; // 32K tokens for Gemini Pro (1.0)
    }

    logger.debug(
      `Unknown Google model: ${modelName}, using default context length`
    );
    return 1000000; // Default for unknown Google models
  }

  private getPerplexityModels(): string[] {
    return ['sonar-pro', 'sonar', 'sonar-deep-research'];
  }

  private getGoogleModels(): string[] {
    return [
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-pro',
    ];
  }
}
