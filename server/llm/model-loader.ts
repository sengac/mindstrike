import type { LocalModelInfo } from '../local-llm-manager.js';
import { sharedLlamaInstance } from '../shared-llama-instance.js';
import { logger } from '../logger.js';
import { GPU_LAYERS } from './constants.js';
import type { ModelRegistry } from './model-registry.js';
import type { LlamaSessionManager } from './session-manager.js';
import type { ModelSettingsService } from './model-settings-service.js';
import type { ModelDiscovery } from './model-discovery.js';

/**
 * Handles model loading and unloading operations
 */
export class ModelLoader {
  constructor(
    private registry: ModelRegistry,
    private sessionManager: LlamaSessionManager,
    private settingsService: ModelSettingsService,
    private modelDiscovery: ModelDiscovery
  ) {}

  /**
   * Load a model by ID or name
   */
  async loadModel(modelIdOrName: string, threadId?: string): Promise<void> {
    // Find model info
    const models = await this.modelDiscovery.getLocalModels();
    let modelInfo = models.find(
      m => m.id === modelIdOrName || m.name === modelIdOrName
    );

    if (!modelInfo && modelIdOrName.endsWith('.gguf')) {
      modelInfo = models.find(m => m.filename === modelIdOrName);
    }

    if (!modelInfo) {
      throw new Error(`Model ${modelIdOrName} not found`);
    }

    const modelId = modelInfo.id;

    // Check if already loaded
    if (this.registry.isModelActive(modelId)) {
      logger.info(`Model ${modelId} is already loaded`);
      if (threadId) {
        this.registry.associateThread(modelId, threadId);
      }
      return;
    }

    // Check if already loading
    const loadingLock = this.registry.getLoadingLock(modelId);
    if (loadingLock) {
      logger.info(`Model ${modelId} is already being loaded, waiting...`);
      await loadingLock;
      if (threadId) {
        this.registry.associateThread(modelId, threadId);
      }
      return;
    }

    // Create loading lock
    const loadingPromise = this._loadModel(modelInfo, threadId);
    this.registry.setLoadingLock(modelId, loadingPromise);

    try {
      await loadingPromise;
    } catch (error) {
      logger.error(`Failed to load model ${modelId}:`, error);
      throw error;
    }
  }

  /**
   * Internal model loading logic
   */
  private async _loadModel(
    modelInfo: LocalModelInfo,
    threadId?: string
  ): Promise<void> {
    const modelId = modelInfo.id;

    try {
      // Unload other models to free memory
      const otherModelIds = this.registry
        .getActiveModelIds()
        .filter(id => id !== modelId);
      for (const otherModelId of otherModelIds) {
        await this.unloadModel(otherModelId);
      }

      // Get optimal settings
      const existingSettings =
        await this.settingsService.getModelSettings(modelId);
      const settings = await this.settingsService.calculateOptimalSettings(
        modelId,
        existingSettings
      );

      // Load model
      const llama = await sharedLlamaInstance.getLlama();
      const model = await llama.loadModel({
        modelPath: modelInfo.path,
        gpuLayers: modelInfo.layerCount
          ? Math.min(
              settings.gpuLayers ?? GPU_LAYERS.NONE,
              modelInfo.layerCount
            )
          : settings.gpuLayers,
      });

      // Create context
      const context = await model.createContext({
        contextSize: settings.contextSize,
        batchSize: settings.batchSize,
      });

      // Create session
      const sessionId = `${modelId}-main`;
      const session = await this.sessionManager.createSession(
        sessionId,
        model,
        {
          contextSize: settings.contextSize!,
          batchSize: settings.batchSize!,
        }
      );

      // Register model
      this.registry.registerModel(modelId, model, context, session, {
        modelPath: modelInfo.path,
        contextSize: settings.contextSize!,
        gpuLayers: settings.gpuLayers!,
        batchSize: settings.batchSize!,
        threadId,
      });

      logger.info(`Successfully loaded model ${modelId}`);
    } catch (error) {
      logger.error(`Failed to load model ${modelId}:`, error);
      throw error;
    }
  }

  /**
   * Unload a model
   */
  async unloadModel(modelId: string): Promise<void> {
    const activeModel = this.registry.getModelRuntimeInfo(modelId);
    if (!activeModel) {
      logger.warn(`Model ${modelId} is not loaded`);
      return;
    }

    try {
      // Dispose session
      const sessionId = `${modelId}-main`;
      await this.sessionManager.disposeSession(sessionId);

      // Unregister model (handles disposal)
      await this.registry.unregisterModel(modelId);

      logger.info(`Successfully unloaded model ${modelId}`);
    } catch (error) {
      logger.error(`Error unloading model ${modelId}:`, error);
      throw error;
    }
  }

  /**
   * Check if a model should be deleted (unload if active)
   */
  async prepareModelForDeletion(modelId: string): Promise<void> {
    if (this.registry.isModelActive(modelId)) {
      await this.unloadModel(modelId);
    }
  }
}
