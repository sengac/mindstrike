import type { LlamaModel, LlamaContext } from 'node-llama-cpp';
import type { LlamaChatSession } from 'node-llama-cpp';
import { logger } from '../logger.js';
import { PROGRESS, MEMORY, CALCULATION } from './constants.js';

export interface ModelRuntimeInfo {
  model: LlamaModel;
  context: LlamaContext;
  session: LlamaChatSession;
  modelPath: string;
  contextSize: number;
  gpuLayers: number;
  batchSize: number;
  loadedAt: Date;
  lastUsedAt: Date;
  threadIds: Set<string>;
}

export interface ModelStatus {
  loaded: boolean;
  loading: boolean;
  contextSize?: number;
  gpuLayers?: number;
  error?: string;
}

export class ModelRegistry {
  private activeModels = new Map<string, ModelRuntimeInfo>();
  private loadingLocks = new Map<string, Promise<void>>();
  private modelUsageStats = new Map<
    string,
    {
      totalPrompts: number;
      totalTokens: number;
      lastAccessed: Date;
    }
  >();

  /**
   * Register a loaded model
   */
  registerModel(
    modelId: string,
    model: LlamaModel,
    context: LlamaContext,
    session: LlamaChatSession,
    metadata: {
      modelPath: string;
      contextSize: number;
      gpuLayers: number;
      batchSize: number;
      threadId?: string;
    }
  ): void {
    const runtimeInfo: ModelRuntimeInfo = {
      model,
      context,
      session,
      modelPath: metadata.modelPath,
      contextSize: metadata.contextSize,
      gpuLayers: metadata.gpuLayers,
      batchSize: metadata.batchSize,
      loadedAt: new Date(),
      lastUsedAt: new Date(),
      threadIds: new Set(metadata.threadId ? [metadata.threadId] : []),
    };

    this.activeModels.set(modelId, runtimeInfo);

    // Initialize usage stats
    if (!this.modelUsageStats.has(modelId)) {
      this.modelUsageStats.set(modelId, {
        totalPrompts: PROGRESS.INITIAL,
        totalTokens: PROGRESS.INITIAL,
        lastAccessed: new Date(),
      });
    }

    logger.info(
      `Registered model ${modelId} with ${metadata.gpuLayers} GPU layers`
    );
  }

  /**
   * Get runtime info for a model
   */
  getModelRuntimeInfo(modelId: string): ModelRuntimeInfo | undefined {
    const info = this.activeModels.get(modelId);
    if (info) {
      info.lastUsedAt = new Date();
      this.updateUsageStats(modelId);
    }
    return info;
  }

  /**
   * Get model by thread ID
   */
  getModelByThreadId(threadId: string): ModelRuntimeInfo | undefined {
    for (const [modelId, info] of this.activeModels.entries()) {
      if (info.threadIds.has(threadId)) {
        info.lastUsedAt = new Date();
        this.updateUsageStats(modelId);
        return info;
      }
    }
    return undefined;
  }

  /**
   * Associate a thread with a model
   */
  associateThread(modelId: string, threadId: string): void {
    const info = this.activeModels.get(modelId);
    if (info) {
      info.threadIds.add(threadId);
      logger.debug(`Associated thread ${threadId} with model ${modelId}`);
    }
  }

  /**
   * Disassociate a thread from all models
   */
  disassociateThread(threadId: string): void {
    for (const info of this.activeModels.values()) {
      info.threadIds.delete(threadId);
    }
  }

  /**
   * Unregister a model
   */
  async unregisterModel(modelId: string): Promise<void> {
    const info = this.activeModels.get(modelId);
    if (!info) {
      return;
    }

    try {
      // Dispose of resources
      if (info.context && typeof info.context.dispose === 'function') {
        await info.context.dispose();
      }

      if (info.model && typeof info.model.dispose === 'function') {
        await info.model.dispose();
      }
    } catch (error) {
      logger.error(`Error disposing model ${modelId}:`, error);
    }

    this.activeModels.delete(modelId);
    logger.info(`Unregistered model ${modelId}`);
  }

  /**
   * Get all active model IDs
   */
  getActiveModelIds(): string[] {
    return Array.from(this.activeModels.keys());
  }

  /**
   * Get model status
   */
  getModelStatus(modelId: string): ModelStatus {
    const info = this.activeModels.get(modelId);
    const isLoading = this.loadingLocks.has(modelId);

    if (info) {
      return {
        loaded: true,
        loading: false,
        contextSize: info.contextSize,
        gpuLayers: info.gpuLayers,
      };
    } else if (isLoading) {
      return {
        loaded: false,
        loading: true,
      };
    } else {
      return {
        loaded: false,
        loading: false,
      };
    }
  }

  /**
   * Set loading lock for a model
   */
  setLoadingLock(modelId: string, promise: Promise<void>): void {
    this.loadingLocks.set(modelId, promise);
    promise
      .finally(() => {
        this.loadingLocks.delete(modelId);
      })
      .catch(() => {
        // Error already handled by the original promise
      });
  }

  /**
   * Get loading lock for a model
   */
  getLoadingLock(modelId: string): Promise<void> | undefined {
    return this.loadingLocks.get(modelId);
  }

  /**
   * Check if model is active
   */
  isModelActive(modelId: string): boolean {
    return this.activeModels.has(modelId);
  }

  /**
   * Check if model is loading
   */
  isModelLoading(modelId: string): boolean {
    return this.loadingLocks.has(modelId);
  }

  /**
   * Get least recently used model
   */
  getLeastRecentlyUsedModel(): string | undefined {
    let lruModelId: string | undefined;
    let oldestTime = new Date();

    for (const [modelId, info] of this.activeModels.entries()) {
      if (info.lastUsedAt < oldestTime) {
        oldestTime = info.lastUsedAt;
        lruModelId = modelId;
      }
    }

    return lruModelId;
  }

  /**
   * Get models not associated with any thread
   */
  getUnassociatedModels(): string[] {
    const unassociated: string[] = [];

    for (const [modelId, info] of this.activeModels.entries()) {
      if (info.threadIds.size === PROGRESS.INITIAL) {
        unassociated.push(modelId);
      }
    }

    return unassociated;
  }

  /**
   * Update usage statistics
   */
  private updateUsageStats(modelId: string): void {
    const stats = this.modelUsageStats.get(modelId);
    if (stats) {
      stats.lastAccessed = new Date();
    }
  }

  /**
   * Record prompt usage
   */
  recordPromptUsage(modelId: string, tokensGenerated: number): void {
    const stats = this.modelUsageStats.get(modelId);
    if (stats) {
      stats.totalPrompts++;
      stats.totalTokens += tokensGenerated;
      stats.lastAccessed = new Date();
    }
  }

  /**
   * Get usage statistics for a model
   */
  getUsageStats(modelId: string) {
    return this.modelUsageStats.get(modelId);
  }

  /**
   * Get all models info
   */
  getAllModelsInfo(): Array<{
    modelId: string;
    info: ModelRuntimeInfo;
    stats:
      | {
          totalPrompts: number;
          totalTokens: number;
          lastAccessed: Date;
        }
      | undefined;
  }> {
    const result = [];

    for (const [modelId, info] of this.activeModels.entries()) {
      result.push({
        modelId,
        info,
        stats: this.getUsageStats(modelId),
      });
    }

    return result;
  }

  /**
   * Clear all models
   */
  async clearAll(): Promise<void> {
    const modelIds = this.getActiveModelIds();

    await Promise.all(modelIds.map(id => this.unregisterModel(id)));

    this.modelUsageStats.clear();
    this.loadingLocks.clear();
  }

  /**
   * Get total memory usage estimate
   */
  getTotalMemoryUsage(): {
    totalContextMemory: number;
    modelCount: number;
  } {
    let totalContextMemory = PROGRESS.INITIAL;
    let modelCount = PROGRESS.INITIAL;

    for (const info of this.activeModels.values()) {
      modelCount++;
      // Rough estimate: 2 bytes per parameter per context token
      const contextMemory =
        info.contextSize * CALCULATION.DIVISOR_TWO * MEMORY.BYTES_TO_KB; // Assuming ~1K params per token
      totalContextMemory += contextMemory;
    }

    return {
      totalContextMemory,
      modelCount,
    };
  }
}
