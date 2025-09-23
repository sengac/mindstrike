import type {
  LocalModelInfo,
  ModelDownloadInfo,
  ModelLoadingSettings,
  StreamResponseOptions,
} from '../local-llm-manager.js';
import type { DynamicModelInfo } from '../model-fetcher.js';

import { ModelFileManager } from './model-file-manager.js';
import { ModelDownloader } from './model-downloader.js';
import { ContextCalculator } from './context-calculator.js';
import { LlamaSessionManager } from './session-manager.js';
import { ModelResponseGenerator } from './response-generator.js';
import { ModelRegistry } from './model-registry.js';
import { ModelDiscovery } from './model-discovery.js';
import { ModelSettingsService } from './model-settings-service.js';
import { ModelLoader } from './model-loader.js';
import { ResponseService } from './response-service.js';
import { logger } from '../logger.js';

/**
 * Orchestrates all LLM operations through specialized services
 */
export class LocalLLMOrchestrator {
  private modelDiscovery: ModelDiscovery;
  private modelSettings: ModelSettingsService;
  private modelLoader: ModelLoader;
  private responseService: ResponseService;
  private registry: ModelRegistry;

  constructor() {
    // Initialize core modules
    const fileManager = new ModelFileManager();
    const downloader = new ModelDownloader();
    const contextCalculator = new ContextCalculator();
    const sessionManager = new LlamaSessionManager();
    const responseGenerator = new ModelResponseGenerator();
    this.registry = new ModelRegistry();

    // Initialize services
    this.modelDiscovery = new ModelDiscovery(
      fileManager,
      downloader,
      contextCalculator
    );

    this.modelSettings = new ModelSettingsService(
      contextCalculator,
      this.registry,
      this.modelDiscovery
    );

    this.modelLoader = new ModelLoader(
      this.registry,
      sessionManager,
      this.modelSettings,
      this.modelDiscovery
    );

    this.responseService = new ResponseService(
      this.registry,
      sessionManager,
      responseGenerator,
      fileManager
    );

    logger.info('LocalLLMOrchestrator initialized');
  }

  // Model Discovery Operations
  async getLocalModels(): Promise<LocalModelInfo[]> {
    return this.modelDiscovery.getLocalModels();
  }

  async getAvailableModels() {
    return this.modelDiscovery.getAvailableModels();
  }

  async searchModels(query: string) {
    return this.modelDiscovery.searchModels(query);
  }

  async downloadModel(
    modelInfo: ModelDownloadInfo | DynamicModelInfo,
    onProgress?: (progress: number, speed?: string) => void
  ): Promise<void> {
    return this.modelDiscovery.downloadModel(modelInfo, onProgress);
  }

  cancelDownload(filename: string): boolean {
    return this.modelDiscovery.cancelDownload(filename);
  }

  getDownloadProgress(filename: string) {
    return this.modelDiscovery.getDownloadProgress(filename);
  }

  async deleteModel(modelId: string): Promise<void> {
    await this.modelLoader.prepareModelForDeletion(modelId);
    return this.modelDiscovery.deleteModel(modelId);
  }

  // Model Settings Operations
  async setModelSettings(
    modelId: string,
    settings: ModelLoadingSettings
  ): Promise<void> {
    return this.modelSettings.setModelSettings(modelId, settings);
  }

  async calculateOptimalSettings(
    modelId: string,
    userSettings: ModelLoadingSettings = {}
  ): Promise<ModelLoadingSettings> {
    return this.modelSettings.calculateOptimalSettings(modelId, userSettings);
  }

  async getModelSettings(modelId: string): Promise<ModelLoadingSettings> {
    return this.modelSettings.getModelSettings(modelId);
  }

  getModelRuntimeInfo(modelId: string) {
    // Returns serializable runtime info for worker thread compatibility
    return this.modelSettings.getModelRuntimeInfo(modelId);
  }

  clearContextSizeCache(): void {
    this.modelSettings.clearContextSizeCache();
  }

  // Model Loading Operations
  async loadModel(modelIdOrName: string, threadId?: string): Promise<void> {
    return this.modelLoader.loadModel(modelIdOrName, threadId);
  }

  async unloadModel(modelId: string): Promise<void> {
    return this.modelLoader.unloadModel(modelId);
  }

  // Response Generation Operations
  async updateSessionHistory(
    modelIdOrName: string,
    threadId: string
  ): Promise<void> {
    return this.responseService.updateSessionHistory(modelIdOrName, threadId);
  }

  async generateResponse(
    modelIdOrName: string,
    previousMessages: Array<{ role: string; content: string }>,
    options?: {
      temperature?: number;
      maxTokens?: number;
      threadId?: string;
      disableFunctions?: boolean;
      disableChatHistory?: boolean;
      signal?: AbortSignal;
    }
  ): Promise<string> {
    return this.responseService.generateResponse(
      modelIdOrName,
      previousMessages,
      options
    );
  }

  async *generateStreamResponse(
    modelIdOrName: string,
    previousMessages: Array<{ role: string; content: string }>,
    options?: StreamResponseOptions
  ): AsyncGenerator<string, void, unknown> {
    yield* this.responseService.generateStreamResponse(
      modelIdOrName,
      previousMessages,
      options
    );
  }

  async getModelStatus(modelId: string) {
    return this.responseService.getModelStatus(modelId);
  }
}
