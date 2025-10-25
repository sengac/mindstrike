import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { getMindstrikeDirectory } from '../../../../server/utils/settingsDirectory';
import { SSEEventType } from '../../../../src/types';
import { loadMetadataFromUrl } from '../../../../server/utils/ggufVramCalculator';
import {
  calculateAllVRAMEstimates,
  type ModelArchitectureInfo,
  type VRAMEstimateInfo,
} from '../../../../src/shared/vramCalculator';

export interface ModelArchitecture {
  layers?: number;
  kvHeads?: number;
  embeddingDim?: number;
  contextLength?: number;
  feedForwardDim?: number;
  modelSizeMB?: number;
}

export interface DynamicModelInfo extends Record<string, unknown> {
  name: string;
  url: string;
  filename: string;
  size: number;
  description: string;
  trainedContextLength?: number;
  maxContextLength?: number;
  parameterCount?: string;
  quantization?: string;
  downloads: number;
  modelId: string;
  accessibility: 'accessible' | 'gated' | 'private' | 'checking' | 'error';
  accessibilityCheckedAt?: number;
  huggingFaceUrl: string;
  username: string;
  likes?: number;
  updatedAt?: string;
  // VRAM calculation fields
  vramEstimates?: VRAMEstimateInfo[];
  modelArchitecture?: ModelArchitecture;
  hasVramData?: boolean;
  vramError?: string;
  isFetchingVram?: boolean;
  // Multi-part model fields
  isMultiPart?: boolean;
  totalParts?: number;
  allPartFiles?: string[];
  totalSize?: number;
}

interface ModelAccessibilityCache {
  [modelId: string]: {
    accessibility: 'accessible' | 'gated' | 'private' | 'error';
    checkedAt: number;
    downloadUrl?: string;
  };
}

@Injectable()
export class ModelDiscoveryService {
  private readonly logger = new Logger(ModelDiscoveryService.name);
  private cache: Map<string, DynamicModelInfo> = new Map();
  private lastFetch = 0;
  private readonly CACHE_DURATION = 1000 * 60 * 60; // 1 hour
  private readonly ACCESSIBILITY_CACHE_DURATION = 1000 * 60 * 60 * 24; // 24 hours
  private accessibilityCache: ModelAccessibilityCache = {};
  private huggingFaceToken: string | null = null;
  private readonly cacheDir: string;
  private readonly cacheFile: string;
  private searchCache: Map<string, Set<string>> = new Map();
  private isFetching = false;
  private fetchPromise: Promise<void> | null = null;
  private fetchPromiseResolve: (() => void) | null = null;
  private vramFetchQueue: DynamicModelInfo[] = [];
  private isProcessingVramQueue = false;
  private vramFetchAttempts: Map<string, number> = new Map();
  private readonly MAX_VRAM_RETRIES = 2;
  private readonly VRAM_FETCH_CONCURRENCY = 2;
  private readonly VRAM_FETCH_TIMEOUT = 30000;
  private progressCallback?: (progress: {
    type:
      | 'started'
      | 'fetching-models'
      | 'checking-model'
      | 'model-checked'
      | 'info'
      | 'error'
      | typeof SSEEventType.COMPLETED
      | typeof SSEEventType.ERROR;
    message: string;
    modelName?: string;
    modelId?: string;
    accessibility?: string;
    current?: number;
    total?: number;
  }) => void;

  constructor(private configService: ConfigService) {
    this.cacheDir = path.join(getMindstrikeDirectory(), 'cache');
    this.cacheFile = path.join(this.cacheDir, 'available-models.json');
    this.ensureCacheDirectory();
    this.loadCacheFromFile();
  }

  private ensureCacheDirectory(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  private loadCacheFromFile(): void {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const cacheData = fs.readFileSync(this.cacheFile, 'utf-8');
        const data = JSON.parse(cacheData) as {
          models?: DynamicModelInfo[];
          timestamp?: number;
          searchCache?: Array<[string, Set<string>]>;
        };

        const models = data.models ?? [];
        this.cache = new Map();
        models.forEach((model: DynamicModelInfo) => {
          this.cache.set(model.modelId, model);
        });

        this.lastFetch = data.timestamp ?? 0;
        this.searchCache = new Map(data.searchCache ?? []);
        this.logger.debug(
          `Loaded available models cache with ${this.cache.size} models and ${this.searchCache.size} search queries`
        );
      }
    } catch (error) {
      this.logger.warn('Failed to load available models cache:', error);
      this.cache = new Map();
      this.searchCache = new Map();
      this.lastFetch = 0;
    }
  }

  private saveCacheToFile(): void {
    try {
      const cacheData = {
        models: Array.from(this.cache.values()),
        timestamp: this.lastFetch,
        searchCache: Array.from(this.searchCache.entries()),
      };
      fs.writeFileSync(this.cacheFile, JSON.stringify(cacheData, null, 2));
      this.logger.debug(
        `Saved available models cache with ${this.cache.size} models and ${this.searchCache.size} search queries`
      );
    } catch (error) {
      this.logger.warn('Failed to save available models cache:', error);
    }
  }

  /**
   * Get cached models only, without triggering any fetch
   */
  getCachedModels(): DynamicModelInfo[] {
    return Array.from(this.cache.values()).sort(
      (a, b) => b.downloads - a.downloads
    );
  }

  /**
   * Get models by their IDs
   */
  async getModelsById(modelIds: string[]): Promise<DynamicModelInfo[]> {
    const results: DynamicModelInfo[] = [];

    for (const modelId of modelIds) {
      const cached = this.cache.get(modelId);
      if (cached) {
        results.push(cached);
      } else {
        // In the real implementation, this would fetch from HuggingFace
        this.logger.warn(`Model ${modelId} not found in cache`);
      }
    }

    return results;
  }

  /**
   * Check for model updates
   */
  async checkModelUpdates(
    models: Array<{ modelId: string; downloadedAt?: string }>
  ): Promise<
    Array<{ modelId: string; hasUpdate: boolean; latestDate?: string }>
  > {
    const results = [];

    for (const model of models) {
      const cached = this.cache.get(model.modelId);
      if (cached) {
        const hasUpdate =
          model.downloadedAt && cached.updatedAt
            ? new Date(cached.updatedAt) > new Date(model.downloadedAt)
            : false;

        results.push({
          modelId: model.modelId,
          hasUpdate,
          latestDate: cached.updatedAt,
        });
      } else {
        results.push({
          modelId: model.modelId,
          hasUpdate: false,
        });
      }
    }

    return results;
  }

  /**
   * Fetch VRAM data for specific models
   */
  async fetchVRAMDataForModels(models: DynamicModelInfo[]): Promise<void> {
    const modelsNeedingVram = models.filter(
      m => !m.hasVramData && !m.vramError && !m.isFetchingVram && m.url
    );

    if (modelsNeedingVram.length === 0) {
      return;
    }

    this.logger.log(
      `Queueing VRAM fetch for ${modelsNeedingVram.length} models`
    );

    // Mark models as fetching
    for (const model of modelsNeedingVram) {
      model.isFetchingVram = true;
    }

    // Add models to queue
    this.vramFetchQueue.push(...modelsNeedingVram);

    // Process queue asynchronously (fire and forget)
    this.processVramFetchQueue().catch(error => {
      this.logger.error('Error processing VRAM fetch queue:', error);
    });
  }

  /**
   * Retry VRAM fetching for models
   */
  async retryVramFetch(): Promise<void> {
    const modelsNeedingVram = Array.from(this.cache.values()).filter(
      model => !model.hasVramData && !model.vramError
    );

    if (modelsNeedingVram.length === 0) {
      this.logger.log('No models need VRAM data');
      return;
    }

    this.logger.log(
      `Retrying VRAM fetch for ${modelsNeedingVram.length} models`
    );

    // Add models to queue
    this.vramFetchQueue.push(...modelsNeedingVram);

    // Process queue
    await this.processVramFetchQueue();
  }

  private async processVramFetchQueue(): Promise<void> {
    if (this.isProcessingVramQueue || this.vramFetchQueue.length === 0) {
      return;
    }

    this.isProcessingVramQueue = true;

    try {
      while (this.vramFetchQueue.length > 0) {
        const batch = this.vramFetchQueue.splice(
          0,
          this.VRAM_FETCH_CONCURRENCY
        );

        await Promise.all(
          batch.map(async model => {
            try {
              await this.fetchVramDataForModel(model);
              model.isFetchingVram = false;
            } catch (error) {
              this.logger.warn(
                `Failed to fetch VRAM data for ${model.name}:`,
                error
              );
              model.vramError = 'Failed to fetch VRAM data';
              model.isFetchingVram = false;
            }
          })
        );
      }
    } finally {
      this.isProcessingVramQueue = false;
      this.saveCacheToFile();
    }
  }

  private async fetchVramDataForModel(model: DynamicModelInfo): Promise<void> {
    const attempts = this.vramFetchAttempts.get(model.modelId) ?? 0;

    if (attempts >= this.MAX_VRAM_RETRIES) {
      model.vramError = 'Max retries exceeded';
      return;
    }

    this.vramFetchAttempts.set(model.modelId, attempts + 1);

    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), this.VRAM_FETCH_TIMEOUT)
      );

      const fetchPromise = loadMetadataFromUrl(model.url);
      const metadata = await Promise.race([fetchPromise, timeout]);

      if (metadata?.n_layers && metadata.embedding_dim) {
        // Prepare architecture info for shared VRAM calculator
        const architectureInfo: ModelArchitectureInfo = {
          layers: metadata.n_layers,
          kvHeads: metadata.n_kv_heads,
          embeddingDim: metadata.embedding_dim,
          contextLength: metadata.context_length,
          feedForwardDim: metadata.feed_forward_dim,
          modelSizeMB: metadata.model_size_mb,
        };

        // Calculate VRAM estimates using shared calculator
        const vramEstimates = calculateAllVRAMEstimates(architectureInfo);

        if (vramEstimates.length > 0) {
          model.vramEstimates = vramEstimates;
          model.hasVramData = true;
          model.modelArchitecture = {
            layers: metadata.n_layers,
            kvHeads: metadata.n_kv_heads,
            embeddingDim: metadata.embedding_dim,
            contextLength: metadata.context_length,
            feedForwardDim: metadata.feed_forward_dim,
            modelSizeMB: metadata.model_size_mb,
          };

          this.logger.debug(`Successfully fetched VRAM data for ${model.name}`);
        } else {
          this.logger.debug(`No VRAM estimates generated for ${model.name}`);
          model.vramError = 'Could not calculate VRAM estimates';
        }
      } else {
        this.logger.debug(
          `Incomplete metadata for ${model.name}, skipping VRAM calculation`
        );
        model.vramError = 'Incomplete metadata';
      }
    } catch (error) {
      this.logger.warn(`Failed to fetch VRAM data for ${model.name}:`, error);
      throw error;
    }
  }

  /**
   * Set HuggingFace token for API access in memory
   */
  setHuggingFaceTokenInMemory(token: string | null): void {
    this.huggingFaceToken = token;
  }

  /**
   * Set progress callback
   */
  setProgressCallback(callback: typeof this.progressCallback): void {
    this.progressCallback = callback;
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
    this.searchCache.clear();
    this.lastFetch = 0;
    this.accessibilityCache = {};
    this.vramFetchQueue = [];
    this.vramFetchAttempts.clear();
    this.saveCacheToFile();
  }

  /**
   * Get Ollama models
   */
  async getOllamaModels(): Promise<
    Array<{
      name: string;
      size: number;
      digest: string;
      modifiedAt: string;
    }>
  > {
    try {
      // In a real implementation, this would call the Ollama API
      // For now, return an empty array
      this.logger.debug('Fetching Ollama models');
      return [];
    } catch (error) {
      this.logger.error('Failed to fetch Ollama models:', error);
      return [];
    }
  }

  /**
   * Scan for local models
   */
  async scanForModels(): Promise<{ message: string; modelsFound: number }> {
    try {
      this.logger.log('Scanning for local models');

      // In a real implementation, this would scan the local filesystem
      // for GGUF files and update the cache
      const modelsFound = 0;

      return {
        message: `Scan completed. Found ${modelsFound} models.`,
        modelsFound,
      };
    } catch (error) {
      this.logger.error('Failed to scan for models:', error);
      throw error;
    }
  }

  async refreshModels(): Promise<{
    success: boolean;
    models: DynamicModelInfo[];
  }> {
    try {
      const { modelFetcher } = await import('../../../modelFetcher');
      const models = await modelFetcher.refreshAvailableModels();
      return { success: true, models };
    } catch (error) {
      this.logger.error('Error refreshing models:', error);
      throw error;
    }
  }

  async refreshAccessibility(): Promise<{
    success: boolean;
    models: DynamicModelInfo[];
  }> {
    try {
      const { modelFetcher } = await import('../../../modelFetcher');
      modelFetcher.clearAccessibilityCache();
      const models = await modelFetcher.refreshAvailableModels();
      return { success: true, models };
    } catch (error) {
      this.logger.error('Error refreshing accessibility:', error);
      throw error;
    }
  }

  async setHuggingFaceToken(
    token: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const { modelFetcher } = await import('../../../modelFetcher');
      await modelFetcher.setHuggingFaceToken(token);
      return {
        success: true,
        message: 'Hugging Face token saved. Rechecking gated models...',
      };
    } catch (error) {
      this.logger.error('Error setting Hugging Face token:', error);
      throw error;
    }
  }

  async removeHuggingFaceToken(): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const { modelFetcher } = await import('../../../modelFetcher');
      await modelFetcher.removeHuggingFaceToken();
      return { success: true, message: 'Hugging Face token removed' };
    } catch (error) {
      this.logger.error('Error removing Hugging Face token:', error);
      throw error;
    }
  }

  async getHuggingFaceToken(): Promise<{ token: string }> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const tokenFile = path.join(getMindstrikeDirectory(), 'hf-token');
      const token = await fs.readFile(tokenFile, 'utf-8');
      return { token: token.trim() };
    } catch (error) {
      this.logger.error('Error reading Hugging Face token:', error);
      throw error;
    }
  }

  async getHuggingFaceTokenStatus(): Promise<{ hasToken: boolean }> {
    try {
      const { modelFetcher } = await import('../../../modelFetcher');
      const hasToken = modelFetcher.hasHuggingFaceToken();
      return { hasToken };
    } catch (error) {
      this.logger.error('Error checking Hugging Face token status:', error);
      throw error;
    }
  }

  async updateModelsStream(res: import('express').Response): Promise<void> {
    try {
      const { modelFetcher } = await import('../../../modelFetcher');
      const { getLocalLLMManager } = await import('../../../localLlmSingleton');
      const llmManager = getLocalLLMManager();

      // Set up SSE
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      // Send initial connection event
      res.write(
        `data: {"type": "${SSEEventType.CONNECTED}", "message": "Connected to model update stream"}\n\n`
      );
      if ('flush' in res && typeof res.flush === 'function') {
        (res.flush as () => void)();
      }

      // Progress callback that sends updates via SSE
      const progressCallback = (progress: { [key: string]: unknown }) => {
        res.write(
          `data: ${JSON.stringify({
            type: 'progress',
            ...progress,
          })}\n\n`
        );
        if ('flush' in res && typeof res.flush === 'function') {
          (res.flush as () => void)();
        }
      };

      try {
        // Force refresh with progress
        const models =
          await modelFetcher.getAvailableModelsWithProgress(progressCallback);

        // Update the local LLM manager's cache
        const updatedModels = await llmManager.getAvailableModels();

        // Send final success event
        res.write(
          `data: ${JSON.stringify({
            type: SSEEventType.COMPLETED,
            message: `✅ Model update completed! Found ${models.length} models.`,
            models: updatedModels,
          })}\n\n`
        );
      } catch (error) {
        // Send error event
        res.write(
          `data: ${JSON.stringify({
            type: SSEEventType.ERROR,
            message: `❌ Failed to update models: ${error instanceof Error ? error.message : 'Unknown error'}`,
          })}\n\n`
        );
      }

      // Close the connection
      res.end();
    } catch (error) {
      this.logger.error('Error setting up model update stream:', error);
      throw error;
    }
  }

  async updateModels(): Promise<{
    success: boolean;
    models: DynamicModelInfo[];
  }> {
    try {
      const { modelFetcher } = await import('../../../modelFetcher');
      await modelFetcher.fetchPopularModels();
      const models = await modelFetcher.getAvailableModels();
      return { success: true, models };
    } catch (error) {
      this.logger.error('Error updating models:', error);
      throw error;
    }
  }

  async searchModels(
    query: string,
    searchType?: string
  ): Promise<{ models: DynamicModelInfo[] }> {
    try {
      const { modelFetcher } = await import('../../../modelFetcher');
      const models = await modelFetcher.searchModels(
        query,
        searchType || 'all'
      );
      return { models };
    } catch (error) {
      this.logger.error('Error searching models:', error);
      throw error;
    }
  }

  async clearSearchCache(): Promise<{ success: boolean; message: string }> {
    try {
      const { modelFetcher } = await import('../../../modelFetcher');
      modelFetcher.clearSearchCache();
      return { success: true, message: 'Search cache cleared' };
    } catch (error) {
      this.logger.error('Error clearing search cache:', error);
      throw error;
    }
  }
}
