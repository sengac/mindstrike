import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { LlmConfigService } from '../../llm/services/llm-config.service';

export interface GlobalLLMConfig {
  baseURL: string;
  model: string;
  displayName?: string;
  apiKey?: string;
  type?:
    | 'ollama'
    | 'vllm'
    | 'openai-compatible'
    | 'openai'
    | 'anthropic'
    | 'perplexity'
    | 'google'
    | 'local';
  contextLength?: number;
  temperature?: number;
  maxTokens?: number;
}

@Injectable()
export class GlobalLlmConfigService implements OnModuleInit {
  private readonly logger = new Logger(GlobalLlmConfigService.name);

  // Global singleton config object (like Express currentLlmConfig)
  private readonly currentLlmConfig: GlobalLLMConfig = {
    baseURL: 'http://localhost:11434',
    model: '',
    displayName: undefined,
    apiKey: undefined,
    type: undefined,
    contextLength: undefined,
    temperature: undefined,
    maxTokens: undefined,
  };

  constructor(private readonly llmConfigService: LlmConfigService) {}

  async onModuleInit() {
    // Load default model configuration on startup (matching Express pattern)
    await this.loadDefaultLLMConfig();
  }

  private async loadDefaultLLMConfig(): Promise<void> {
    // Only load if not already set (matching Express logic)
    if (
      !this.currentLlmConfig.model ||
      this.currentLlmConfig.model.trim() === ''
    ) {
      try {
        const defaultModel = await this.llmConfigService.getDefaultModel();
        if (defaultModel) {
          this.currentLlmConfig.baseURL = defaultModel.baseURL;
          this.currentLlmConfig.model = defaultModel.model;
          this.currentLlmConfig.displayName = defaultModel.displayName;
          this.currentLlmConfig.apiKey = defaultModel.apiKey;
          this.currentLlmConfig.type = defaultModel.type;
          this.currentLlmConfig.contextLength = defaultModel.contextLength;
          this.currentLlmConfig.temperature = defaultModel.temperature;
          this.currentLlmConfig.maxTokens = defaultModel.maxTokens;

          this.logger.log(`Loaded default LLM model: ${defaultModel.model}`);
        } else {
          // If no default model is set, try to auto-select the first available model (like Express)
          const models = await this.llmConfigService.getModels();
          const firstAvailableModel = models.find(model => model.available);

          if (firstAvailableModel) {
            await this.llmConfigService.setDefaultModel(firstAvailableModel.id);

            this.currentLlmConfig.baseURL = firstAvailableModel.baseURL;
            this.currentLlmConfig.model = firstAvailableModel.model;
            this.currentLlmConfig.displayName = firstAvailableModel.displayName;
            this.currentLlmConfig.apiKey = firstAvailableModel.apiKey;
            this.currentLlmConfig.type = firstAvailableModel.type;
            this.currentLlmConfig.contextLength =
              firstAvailableModel.contextLength;
            this.currentLlmConfig.temperature = firstAvailableModel.temperature;
            this.currentLlmConfig.maxTokens = firstAvailableModel.maxTokens;

            this.logger.log(
              `Auto-selected and loaded LLM model: ${firstAvailableModel.model}`
            );
          } else {
            this.logger.warn('No available LLM models found');
          }
        }
      } catch (error) {
        this.logger.error('Failed to load default LLM model:', error);
      }
    }
  }

  /**
   * Get reference to the global LLM config (like Express pattern)
   * This returns the same object reference that can be shared across services
   */
  getCurrentLlmConfig(): GlobalLLMConfig {
    return this.currentLlmConfig;
  }

  /**
   * Update the global LLM config (like Express pattern)
   * This updates the shared object reference
   */
  updateCurrentLlmConfig(config: Partial<GlobalLLMConfig>): void {
    Object.assign(this.currentLlmConfig, config);
  }

  /**
   * Refresh LLM config from database (like Express refreshModelList function)
   */
  async refreshLLMConfig(): Promise<void> {
    const defaultModel = await this.llmConfigService.getDefaultModel();
    if (defaultModel) {
      this.currentLlmConfig.baseURL = defaultModel.baseURL;
      this.currentLlmConfig.model = defaultModel.model;
      this.currentLlmConfig.displayName = defaultModel.displayName;
      this.currentLlmConfig.apiKey = defaultModel.apiKey;
      this.currentLlmConfig.type = defaultModel.type;
      this.currentLlmConfig.contextLength = defaultModel.contextLength;
      this.currentLlmConfig.temperature = defaultModel.temperature;
      this.currentLlmConfig.maxTokens = defaultModel.maxTokens;

      this.logger.log(`Refreshed LLM config: ${defaultModel.model}`);
    }
  }
}
