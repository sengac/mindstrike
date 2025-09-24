import type { ModelLoadingSettings } from '../local-llm-manager.js';
import { modelSettingsManager } from '../utils/model-settings-manager.js';
import type { ContextCalculator } from './context-calculator.js';
import type { ModelRegistry } from './model-registry.js';
import type { ModelDiscovery } from './model-discovery.js';
import { logger } from '../logger.js';

// Serializable runtime info that matches the original API
export interface SerializableModelRuntimeInfo {
  actualGpuLayers?: number;
  gpuType?: string;
  memoryUsage?: {
    vramUsedMB?: number;
    vramTotalMB?: number;
    vramPercent?: number;
  };
  loadingTime?: number;
}

/**
 * Manages model loading settings and optimal configuration
 */
export class ModelSettingsService {
  constructor(
    private contextCalculator: ContextCalculator,
    private registry: ModelRegistry,
    private modelDiscovery: ModelDiscovery
  ) {}

  /**
   * Save model settings
   */
  async setModelSettings(
    modelId: string,
    settings: ModelLoadingSettings
  ): Promise<void> {
    await modelSettingsManager.saveModelSettings(modelId, settings);
    logger.debug(`Saved settings for model ${modelId}:`, settings);
  }

  /**
   * Calculate optimal settings for a model
   */
  async calculateOptimalSettings(
    modelId: string,
    userSettings: ModelLoadingSettings = {}
  ): Promise<ModelLoadingSettings> {
    const models = await this.modelDiscovery.getLocalModels();
    const modelInfo = models.find(m => m.id === modelId);

    if (!modelInfo) {
      throw new Error(`Model ${modelId} not found`);
    }

    return this.contextCalculator.calculateOptimalSettings(
      modelInfo,
      userSettings
    );
  }

  /**
   * Get model settings (runtime, persisted, or calculated)
   */
  async getModelSettings(modelId: string): Promise<ModelLoadingSettings> {
    // Check runtime info first
    const runtimeInfo = this.registry.getModelRuntimeInfo(modelId);
    if (runtimeInfo) {
      return {
        gpuLayers: runtimeInfo.gpuLayers,
        contextSize: runtimeInfo.contextSize,
        batchSize: runtimeInfo.batchSize,
      };
    }

    // Check persisted settings
    const persisted = await modelSettingsManager.loadModelSettings(modelId);
    if (persisted) {
      return persisted;
    }

    // Calculate defaults
    return this.calculateOptimalSettings(modelId);
  }

  /**
   * Get runtime info for a model (serializable version matching original API)
   */
  getModelRuntimeInfo(
    modelId: string
  ): SerializableModelRuntimeInfo | undefined {
    const info = this.registry.getModelRuntimeInfo(modelId);
    if (!info) {
      return undefined;
    }

    // Determine GPU type based on platform
    let gpuType = 'cpu';
    if (info.gpuLayers > 0) {
      const platform = process.platform;
      if (platform === 'darwin') {
        gpuType = 'metal';
      } else if (platform === 'linux' || platform === 'win32') {
        // Could be cuda or rocm, defaulting to cuda for now
        // TODO: Detect actual GPU vendor (NVIDIA vs AMD)
        gpuType = 'cuda';
      }
    }

    // Return only serializable data that matches the original ModelRuntimeInfo interface
    // Original interface only had: actualGpuLayers, gpuType, memoryUsage, loadingTime
    return {
      actualGpuLayers: info.gpuLayers,
      gpuType,
      loadingTime: Date.now() - info.loadedAt.getTime(),
      // TODO: Add memoryUsage if needed
    };
  }

  /**
   * Clear context size cache
   */
  clearContextSizeCache(): void {
    this.contextCalculator.clearCache();
  }
}
