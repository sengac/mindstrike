import { logger } from './logger';
import * as fs from 'fs';
import * as path from 'path';
import { getMindstrikeDirectory } from './utils/settingsDirectory';
import { SSEEventType } from '../src/types';
import {
  loadMetadataFromUrl,
  type GGUFMetadata,
} from './utils/ggufVramCalculator';
import {
  calculateAllVRAMEstimates,
  type ModelArchitectureInfo,
  type VRAMEstimateInfo,
} from '../src/shared/vramCalculator';

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
  // Multi-part model fields
  isMultiPart?: boolean;
  totalParts?: number;
  allPartFiles?: string[];
  totalSize?: number;
}

interface HuggingFaceModel {
  id: string;
  downloads: number;
  tags: string[];
  gated?: boolean;
  likes?: number;
  lastModified?: string;
  siblings?: Array<{
    rfilename: string;
    size: number;
  }>;
}

interface ModelAccessibilityCache {
  [modelId: string]: {
    accessibility: 'accessible' | 'gated' | 'private' | 'error';
    checkedAt: number;
    downloadUrl?: string;
  };
}

interface MultiPartInfo {
  isMultiPart: boolean;
  partNumber?: number;
  totalParts?: number;
  baseFilename?: string;
}

export class ModelFetcher {
  private cache: Map<string, DynamicModelInfo> = new Map(); // Use Map for deduplication by modelId
  private lastFetch: number = 0;
  private readonly CACHE_DURATION = 1000 * 60 * 60; // 1 hour (unused now)
  private readonly ACCESSIBILITY_CACHE_DURATION = 1000 * 60 * 60 * 24; // 24 hours
  private accessibilityCache: ModelAccessibilityCache = {};
  private huggingFaceToken: string | null = null;
  private readonly cacheDir: string;
  private readonly cacheFile: string;
  private searchCache: Map<string, Set<string>> = new Map(); // Track which searches have been done
  private isFetching: boolean = false;
  private fetchPromise: Promise<void> | null = null;
  private fetchPromiseResolve: (() => void) | null = null;
  private vramFetchQueue: DynamicModelInfo[] = []; // Queue for VRAM fetching
  private isProcessingVramQueue: boolean = false;
  private vramFetchAttempts: Map<string, number> = new Map(); // Track retry attempts
  private readonly MAX_VRAM_RETRIES = 2;
  private readonly VRAM_FETCH_CONCURRENCY = 2; // Process 2 models at a time
  private readonly VRAM_FETCH_TIMEOUT = 30000; // 30 seconds timeout for VRAM fetch
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

  constructor() {
    this.cacheDir = path.join(getMindstrikeDirectory(), 'cache');
    this.cacheFile = path.join(this.cacheDir, 'available-models.json');
    this.ensureCacheDirectory();
    this.loadCacheFromFile();
  }

  private ensureCacheDirectory() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  private loadCacheFromFile() {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const cacheData = fs.readFileSync(this.cacheFile, 'utf-8');
        const data = JSON.parse(cacheData) as {
          models?: DynamicModelInfo[];
          timestamp?: number;
          searchCache?: Array<[string, Set<string>]>;
        };

        // Convert array to Map for deduplication
        const models = data.models ?? [];
        this.cache = new Map();
        models.forEach((model: DynamicModelInfo) => {
          this.cache.set(model.modelId, model);
        });

        this.lastFetch = data.timestamp ?? 0;
        this.searchCache = new Map(data.searchCache ?? []);
        logger.debug(
          `Loaded available models cache with ${this.cache.size} models and ${this.searchCache.size} search queries`
        );
      }
    } catch (error) {
      logger.warn('Failed to load available models cache:', error);
      this.cache = new Map();
      this.searchCache = new Map();
      this.lastFetch = 0;
    }
  }

  private saveCacheToFile() {
    try {
      const cacheData = {
        models: Array.from(this.cache.values()),
        timestamp: this.lastFetch,
        searchCache: Array.from(this.searchCache.entries()),
      };
      fs.writeFileSync(this.cacheFile, JSON.stringify(cacheData, null, 2));
      logger.debug(
        `Saved available models cache with ${this.cache.size} models and ${this.searchCache.size} search queries`
      );
    } catch (error) {
      logger.warn('Failed to save available models cache:', error);
    }
  }

  private async waitForFetch(): Promise<void> {
    this.fetchPromise ??= new Promise<void>(resolve => {
      this.fetchPromiseResolve = resolve;
    });
    return this.fetchPromise;
  }

  private resolveFetchPromise() {
    if (this.fetchPromiseResolve) {
      this.fetchPromiseResolve();
      this.fetchPromise = null;
      this.fetchPromiseResolve = null;
    }
  }

  /**
   * Get cached models only, without triggering any fetch
   */
  getCachedModels(): DynamicModelInfo[] {
    return Array.from(this.cache.values())
      .sort((a, b) => b.downloads - a.downloads)
      .slice(0, 100); // Limit to 100 as requested
  }

  /**
   * Get specific models by their IDs
   */
  getModelsById(modelIds: string[]): DynamicModelInfo[] {
    const models = modelIds
      .map(id => this.cache.get(id))
      .filter((model): model is DynamicModelInfo => model !== undefined);

    // Don't automatically fetch VRAM data - let frontend explicitly request it

    return models;
  }

  /**
   * Get available models from cache
   */
  async getAvailableModels(): Promise<DynamicModelInfo[]> {
    // Return cached models sorted by downloads
    if (this.cache.size > 0) {
      logger.debug(`Returning ${this.cache.size} cached models`);
      return this.getCachedModels();
    }

    // Only fetch popular models if no cache exists (first time)
    // But prevent multiple simultaneous fetches
    if (this.isFetching) {
      logger.debug(
        'Models are already being fetched, waiting for completion...'
      );
      await this.waitForFetch();
      return this.getCachedModels();
    }

    try {
      this.isFetching = true;
      logger.info(
        'Fetching popular models from Hugging Face for the first time...'
      );
      await this.fetchPopularModels();
      return Array.from(this.cache.values()).sort(
        (a, b) => b.downloads - a.downloads
      );
    } catch (error) {
      logger.error('Failed to fetch models from Hugging Face:', error);
      return [];
    } finally {
      this.isFetching = false;
      this.resolveFetchPromise();
    }
  }

  /**
   * Force refresh popular models from Hugging Face
   */
  async refreshAvailableModels(): Promise<DynamicModelInfo[]> {
    try {
      logger.info('Force refreshing popular models from Hugging Face...');
      await this.fetchPopularModels();
      return Array.from(this.cache.values()).sort(
        (a, b) => b.downloads - a.downloads
      );
    } catch (error) {
      logger.error('Failed to refresh models from Hugging Face:', error);
      throw error;
    }
  }

  /**
   * Search for models by keyword and add to cache
   */
  async searchModels(
    query: string,
    searchType: string = 'all'
  ): Promise<DynamicModelInfo[]> {
    const normalizedQuery = query.toLowerCase().trim();

    logger.info(
      `searchModels called with query: "${query}" (normalized: "${normalizedQuery}")`
    );

    if (!normalizedQuery) {
      logger.info('Empty query, returning all cached models');
      return Array.from(this.cache.values()).sort(
        (a, b) => b.downloads - a.downloads
      );
    }

    // Check if we've already searched for this query
    if (this.searchCache.has(normalizedQuery)) {
      logger.info(`Found cached search for: ${normalizedQuery}`);
      const cachedModelIds = this.searchCache.get(normalizedQuery)!;
      const results = Array.from(cachedModelIds)
        .map(id => this.cache.get(id))
        .filter(model => model !== undefined);

      // If cached results are empty, remove from cache and search again
      if (results.length === 0) {
        logger.info(
          `Cached search for "${normalizedQuery}" has no results, clearing cache and searching again`
        );
        this.searchCache.delete(normalizedQuery);
      } else {
        logger.info(
          `Returning ${results.length} cached models for query: ${normalizedQuery}`
        );
        return results;
      }
    }

    try {
      logger.info(
        `Searching Hugging Face for: ${normalizedQuery} (searchType: ${searchType})`
      );
      const newModels = await this.fetchModelsBySearch(normalizedQuery);

      // Filter models based on search type if not 'all'
      let filteredModels = newModels;
      if (searchType !== 'all') {
        filteredModels = this.filterModelsBySearchType(
          newModels,
          normalizedQuery,
          searchType
        );
      }

      // Add new models to cache
      const foundModelIds = new Set<string>();
      filteredModels.forEach(model => {
        this.cache.set(model.modelId, model);
        foundModelIds.add(model.modelId);
      });

      // Cache the search results
      this.searchCache.set(normalizedQuery, foundModelIds);
      this.saveCacheToFile();

      logger.info(
        `Found ${newModels.length} models, filtered to ${filteredModels.length} for query: ${normalizedQuery} (searchType: ${searchType}), cached ${foundModelIds.size} model IDs`
      );
      return filteredModels.sort((a, b) => b.downloads - a.downloads);
    } catch (error) {
      logger.error(`Failed to search models for: ${normalizedQuery}`, error);
      throw error;
    }
  }

  /**
   * Search for models by keyword with progress updates
   */
  async searchModelsWithProgress(
    query: string,
    searchType: string = 'all',
    progressCallback: (progress: {
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
    }) => void
  ): Promise<DynamicModelInfo[]> {
    this.progressCallback = progressCallback;
    const normalizedQuery = query.toLowerCase().trim();

    logger.info(
      `searchModelsWithProgress called with query: "${query}" (normalized: "${normalizedQuery}")`
    );

    try {
      this.progressCallback({
        type: 'started',
        message: 'Starting search...',
      });

      if (!normalizedQuery) {
        logger.info('Empty query, returning all cached models');
        const models = Array.from(this.cache.values()).sort(
          (a, b) => b.downloads - a.downloads
        );
        this.progressCallback({
          type: SSEEventType.COMPLETED,
          message: `Search completed! Found ${models.length} models.`,
          total: models.length,
        });
        return models;
      }

      // Check if we've already searched for this query
      if (this.searchCache.has(normalizedQuery)) {
        logger.info(`Found cached search for: ${normalizedQuery}`);
        const cachedModelIds = this.searchCache.get(normalizedQuery)!;
        const results = Array.from(cachedModelIds)
          .map(id => this.cache.get(id))
          .filter(model => model !== undefined);

        // If cached results are empty, remove from cache and search again
        if (results.length === 0) {
          logger.info(
            `Cached search for "${normalizedQuery}" has no results, clearing cache and searching again`
          );
          this.searchCache.delete(normalizedQuery);
        } else {
          logger.info(
            `Returning ${results.length} cached models for query: ${normalizedQuery}`
          );
          this.progressCallback({
            type: SSEEventType.COMPLETED,
            message: `Search completed! Found ${results.length} cached models.`,
            total: results.length,
          });
          return results;
        }
      }

      this.progressCallback({
        type: 'fetching-models',
        message: `Searching HuggingFace for "${query}"...`,
      });

      logger.info(
        `Searching Hugging Face for: ${normalizedQuery} (searchType: ${searchType})`
      );
      const newModels = await this.fetchModelsBySearch(normalizedQuery);

      // Filter models based on search type if not 'all'
      let filteredModels = newModels;
      if (searchType !== 'all') {
        filteredModels = this.filterModelsBySearchType(
          newModels,
          normalizedQuery,
          searchType
        );
      }

      // Add new models to cache
      const foundModelIds = new Set<string>();
      filteredModels.forEach(model => {
        this.cache.set(model.modelId, model);
        foundModelIds.add(model.modelId);
      });

      // Cache the search results
      this.searchCache.set(normalizedQuery, foundModelIds);
      this.saveCacheToFile();

      logger.info(
        `Found ${newModels.length} models, filtered to ${filteredModels.length} for query: ${normalizedQuery} (searchType: ${searchType}), cached ${foundModelIds.size} model IDs`
      );

      const sortedResults = filteredModels.sort(
        (a, b) => b.downloads - a.downloads
      );
      this.progressCallback({
        type: SSEEventType.COMPLETED,
        message: `Search completed! Found ${sortedResults.length} models.`,
        total: sortedResults.length,
      });

      return sortedResults;
    } catch (error) {
      logger.error(`Failed to search models for: ${normalizedQuery}`, error);
      this.progressCallback({
        type: SSEEventType.ERROR,
        message: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
      throw error;
    }
  }

  /**
   * Get available models with progress updates
   */
  async getAvailableModelsWithProgress(
    progressCallback: (progress: {
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
    }) => void
  ): Promise<DynamicModelInfo[]> {
    this.progressCallback = progressCallback;

    try {
      this.progressCallback({
        type: 'started',
        message: 'Starting popular models scan...',
      });

      await this.fetchPopularModels();
      const models = Array.from(this.cache.values()).sort(
        (a, b) => b.downloads - a.downloads
      );

      this.progressCallback({
        type: SSEEventType.COMPLETED,
        message: `Scan completed! Found ${models.length} models in cache.`,
        total: models.length,
      });

      return models;
    } catch (error) {
      this.progressCallback({
        type: SSEEventType.ERROR,
        message: `Failed to fetch models: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
      logger.error(
        'Failed to fetch models from Hugging Face with progress:',
        error
      );
      throw error;
    } finally {
      this.progressCallback = undefined;
    }
  }

  /**
   * Fetch popular GGUF models from Hugging Face and add to cache
   */
  async fetchPopularModels(
    progressCallback?: (
      current: number,
      total: number,
      modelId?: string
    ) => void,
    signal?: AbortSignal
  ): Promise<void> {
    this.progressCallback?.({
      type: 'fetching-models',
      message: 'Fetching popular models from Hugging Face...',
    });

    // Fetch popular models using verified working API parameters
    // All these URLs have been tested and confirmed to work
    const fallbackUrls = [
      'https://huggingface.co/api/models?filter=gguf&sort=downloads&direction=-1&limit=150', // Most downloaded GGUF models
      'https://huggingface.co/api/models?filter=gguf&sort=lastModified&direction=-1&limit=150', // Recently updated GGUF models
      'https://huggingface.co/api/models?library=gguf&sort=downloads&direction=-1&limit=150', // Alternative filter approach
      'https://huggingface.co/api/models?filter=gguf&sort=downloads&limit=150', // Without direction parameter
      'https://huggingface.co/api/models?filter=gguf&limit=100', // Minimal fallback
    ];

    let currentUrlIndex = 0;
    let url = fallbackUrls[currentUrlIndex];

    // Implement retry logic with exponential backoff for rate limiting
    let retries = 0;
    const maxRetries = 3;
    let response: Response | null = null;

    while (retries <= maxRetries) {
      try {
        response = await fetch(url, {
          headers: {
            'User-Agent': 'mindstrike-local-llm/1.0',
          },
          signal,
        });

        if (response.ok) {
          break; // Success, exit retry loop
        }

        if (response.status === 429) {
          // Rate limited - implement exponential backoff
          if (retries >= maxRetries) {
            this.progressCallback?.({
              type: 'error',
              message:
                'Rate limit exceeded. Please wait a few minutes before trying again.',
            });
            throw new Error(
              'Rate limit exceeded. Please wait a few minutes before trying again.'
            );
          }

          const retryAfter = response.headers.get('Retry-After');
          let waitTime: number;

          if (retryAfter) {
            // If server provides Retry-After header, use it
            waitTime = isNaN(Number(retryAfter))
              ? new Date(retryAfter).getTime() - Date.now()
              : Number(retryAfter) * 1000;
          } else {
            // Otherwise use exponential backoff: 2^retries * 1000ms + jitter
            waitTime = Math.pow(2, retries) * 1000 + Math.random() * 1000;
          }

          // Cap wait time at 30 seconds
          waitTime = Math.min(waitTime, 30000);

          logger.warn(
            `HuggingFace API rate limit hit. Retrying in ${Math.ceil(waitTime / 1000)} seconds (attempt ${retries + 1}/${maxRetries})`
          );

          this.progressCallback?.({
            type: 'info',
            message: `Rate limited. Retrying in ${Math.ceil(waitTime / 1000)} seconds (attempt ${retries + 1}/${maxRetries})...`,
          });

          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, waitTime));
          retries++;
          continue;
        }

        // HTTP 400 Bad Request - could be temporary API issue or parameter problem
        if (response.status === 400) {
          logger.warn(
            `HuggingFace API returned 400 Bad Request. URL: ${url}. Attempt ${retries + 1}/${maxRetries + 1}`
          );

          // Try next URL in fallback list before retrying
          if (currentUrlIndex < fallbackUrls.length - 1) {
            currentUrlIndex++;
            url = fallbackUrls[currentUrlIndex];
            logger.info(`Trying fallback URL: ${url}`);

            this.progressCallback?.({
              type: 'info',
              message: `API request failed, trying alternative URL...`,
            });

            // Reset retries for the new URL
            retries = 0;
            continue;
          }

          if (retries >= maxRetries) {
            this.progressCallback?.({
              type: 'error',
              message:
                'Unable to fetch models from HuggingFace. All URL variations failed.',
            });
            throw new Error(
              `HTTP ${response.status}: ${response.statusText}. All verified API endpoints failed.`
            );
          }

          this.progressCallback?.({
            type: 'info',
            message: 'API request failed, retrying...',
          });

          // For 400 errors, wait a bit and retry (shorter wait than 429s)
          const waitTime = Math.min(1000 + Math.random() * 1000, 3000); // 1-2 second wait, max 3s
          logger.info(
            `Waiting ${Math.ceil(waitTime / 1000)} seconds before retrying due to 400 error`
          );
          await new Promise(resolve => setTimeout(resolve, waitTime));

          retries++;
          continue;
        } else {
          // Other HTTP errors (not 400 or 429)
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          this.progressCallback?.({
            type: 'info',
            message: 'Fetch aborted by user',
          });
          throw error;
        }
        if (retries >= maxRetries) {
          throw error;
        }
        retries++;
      }
    }

    if (!response?.ok) {
      throw new Error('Failed to fetch models after multiple attempts');
    }

    const allModels = (await response.json()) as HuggingFaceModel[];
    logger.info(`Fetched ${allModels.length} popular models from Hugging Face`);

    // Filter for text generation models with broader criteria
    const textGenModels = allModels.filter(model => {
      const hasTextGenTag = model.tags.some(tag =>
        [
          'text-generation',
          'conversational',
          'text2text-generation',
          'causal-lm',
        ].includes(tag)
      );

      // Include popular models (>10k downloads) or well-known model families
      const isPopular = model.downloads > 10000;
      const isWellKnownFamily =
        model.id.toLowerCase().includes('llama') ||
        model.id.toLowerCase().includes('mistral') ||
        model.id.toLowerCase().includes('qwen') ||
        model.id.toLowerCase().includes('gemma') ||
        model.id.toLowerCase().includes('phi') ||
        model.id.toLowerCase().includes('codellama') ||
        model.id.toLowerCase().includes('wizardlm') ||
        model.id.toLowerCase().includes('openchat') ||
        model.id.toLowerCase().includes('starling') ||
        model.id.toLowerCase().includes('solar') ||
        model.id.toLowerCase().includes('deepseek');

      return hasTextGenTag && (isPopular || isWellKnownFamily);
    });

    const modelInfos: DynamicModelInfo[] = [];

    // Process more models now that we're fetching both popular and recent (up to 80)
    const topModels = textGenModels.slice(0, 80);

    for (let i = 0; i < topModels.length; i++) {
      if (signal?.aborted) {
        throw new Error('Scan cancelled');
      }

      const model = topModels[i];

      // Call external progress callback
      progressCallback?.(i + 1, topModels.length, model.id);

      this.progressCallback?.({
        type: 'checking-model',
        message: `Checking model accessibility...`,
        modelName: model.id,
        modelId: model.id,
        current: i + 1,
        total: topModels.length,
      });

      try {
        const detailedModel = await this.getModelDetails(model);
        if (detailedModel) {
          modelInfos.push(detailedModel);

          this.progressCallback?.({
            type: 'model-checked',
            message: `${detailedModel.accessibility === 'accessible' ? '✅' : detailedModel.accessibility === 'gated' ? '🔒' : '❌'} ${model.id}`,
            modelName: model.id,
            modelId: model.id,
            accessibility: detailedModel.accessibility,
            current: i + 1,
            total: topModels.length,
          });
        }
      } catch (error) {
        logger.debug(`Failed to get details for model ${model.id}:`, error);

        this.progressCallback?.({
          type: 'model-checked',
          message: `❌ ${model.id} (error checking)`,
          modelName: model.id,
          modelId: model.id,
          accessibility: 'error',
          current: i + 1,
          total: topModels.length,
        });
        continue;
      }
    }

    // Add models to cache (no return, just cache them)
    modelInfos.forEach(model => {
      this.cache.set(model.modelId, model);
    });

    this.lastFetch = Date.now();
    this.saveCacheToFile();
  }

  /**
   * Filter models based on search type
   */
  private filterModelsBySearchType(
    models: DynamicModelInfo[],
    query: string,
    searchType: string
  ): DynamicModelInfo[] {
    const lowerQuery = query.toLowerCase();

    return models.filter(model => {
      switch (searchType) {
        case 'name':
          return (
            model.name.toLowerCase().includes(lowerQuery) ||
            model.modelId.toLowerCase().includes(lowerQuery)
          );
        case 'username':
          return model.username.toLowerCase().includes(lowerQuery);
        case 'description':
          return model.description?.toLowerCase().includes(lowerQuery) || false;

        default:
          return true; // 'all' or unknown type - return all
      }
    });
  }

  /**
   * Search for models by keyword using Hugging Face search API
   */
  private async fetchModelsBySearch(
    query: string
  ): Promise<DynamicModelInfo[]> {
    // Use HuggingFace search API with query - using trending sort
    const url = `https://huggingface.co/api/models?search=${encodeURIComponent(query)}&filter=gguf&sort=trending&direction=-1&limit=100`;

    logger.info(`Fetching trending models for query: ${query}`);

    this.progressCallback?.({
      type: 'fetching-models',
      message: `Searching for "${query}"...`,
    });

    // Add timeout and retry logic
    let allModels: HuggingFaceModel[] = [];

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        const response = await fetch(url, {
          headers: {
            'User-Agent': 'mindstrike-local-llm/1.0',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}: ${response.status !== 429 ? response.statusText : 'Rate limit exceeded'}`
          );
        }

        allModels = (await response.json()) as HuggingFaceModel[];

        // Success - exit retry loop
        break;
      } catch (error) {
        logger.warn(`Search attempt ${attempt} failed:`, error);

        if (attempt < 2) {
          logger.info(`Retrying search in 2 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          throw error;
        }
      }
    }

    logger.info(
      `HuggingFace returned ${allModels.length} trending models for query: ${query}`
    );

    // Filter for text generation models with broader criteria
    const textGenModels = allModels.filter(model => {
      const hasTextGenTag = model.tags.some(tag =>
        [
          'text-generation',
          'conversational',
          'text2text-generation',
          'causal-lm',
        ].includes(tag)
      );

      // Include any model that matches search (even with low downloads for search results)
      return hasTextGenTag;
    });

    logger.info(
      `After filtering for text-generation models: ${textGenModels.length} models`
    );

    const modelInfos: DynamicModelInfo[] = [];

    // Process all found models (up to 50)
    const modelsToProcess = textGenModels.slice(0, 50);

    for (let i = 0; i < modelsToProcess.length; i++) {
      const model = modelsToProcess[i];

      // Skip if we already have this model in cache
      if (this.cache.has(model.id)) {
        modelInfos.push(this.cache.get(model.id)!);
        continue;
      }

      this.progressCallback?.({
        type: 'checking-model',
        message: `Checking model accessibility...`,
        modelName: model.id,
        modelId: model.id,
        current: i + 1,
        total: modelsToProcess.length,
      });

      try {
        const detailedModel = await this.getModelDetails(model);
        if (detailedModel) {
          modelInfos.push(detailedModel);

          this.progressCallback?.({
            type: 'model-checked',
            message: `${detailedModel.accessibility === 'accessible' ? '✅' : detailedModel.accessibility === 'gated' ? '🔒' : '❌'} ${model.id}`,
            modelName: model.id,
            modelId: model.id,
            accessibility: detailedModel.accessibility,
            current: i + 1,
            total: modelsToProcess.length,
          });
        }
      } catch (error) {
        logger.debug(`Failed to get details for model ${model.id}:`, error);

        this.progressCallback?.({
          type: 'model-checked',
          message: `❌ ${model.id} (error checking)`,
          modelName: model.id,
          modelId: model.id,
          accessibility: 'error',
          current: i + 1,
          total: modelsToProcess.length,
        });
        continue;
      }
    }

    // Don't fetch VRAM data here - let frontend request it for visible models only

    return modelInfos;
  }

  /**
   * Add models to VRAM fetch queue and start processing
   */
  async fetchVRAMDataForModels(models: DynamicModelInfo[]): Promise<void> {
    // Only fetch for models that don't already have VRAM data (cached models will have hasVramData=true)
    const modelsNeedingVram = models.filter(
      m => !m.hasVramData && !m.vramError && m.url
    );

    if (modelsNeedingVram.length === 0) {
      logger.debug(
        `All ${models.length} models already have VRAM data cached or have errors`
      );
      return;
    }

    logger.info(
      `Adding ${modelsNeedingVram.length} models to VRAM fetch queue (${models.length - modelsNeedingVram.length} already cached)`
    );

    // Add models to queue (avoiding duplicates)
    const currentQueueIds = new Set(this.vramFetchQueue.map(m => m.modelId));
    const newModels = modelsNeedingVram.filter(
      m => !currentQueueIds.has(m.modelId)
    );

    if (newModels.length > 0) {
      this.vramFetchQueue.push(...newModels);
      logger.info(
        `Added ${newModels.length} new models to queue, ${modelsNeedingVram.length - newModels.length} were already queued`
      );
    }

    // Start processing queue if not already running
    if (!this.isProcessingVramQueue && this.vramFetchQueue.length > 0) {
      this.processVramFetchQueue().catch(error => {
        logger.error('Error processing VRAM fetch queue:', error);
      });
    }
  }

  /**
   * Process VRAM fetch queue with concurrency control
   */
  private async processVramFetchQueue(): Promise<void> {
    if (this.isProcessingVramQueue) {
      return;
    }

    this.isProcessingVramQueue = true;
    logger.info('Starting VRAM fetch queue processing');

    while (this.vramFetchQueue.length > 0) {
      // Take up to VRAM_FETCH_CONCURRENCY models from queue
      const batch = this.vramFetchQueue.splice(0, this.VRAM_FETCH_CONCURRENCY);

      logger.info(`Processing batch of ${batch.length} models for VRAM fetch`);

      // Process batch in parallel
      const promises = batch.map(async model => {
        const attempts = this.vramFetchAttempts.get(model.modelId) ?? 0;

        if (attempts >= this.MAX_VRAM_RETRIES) {
          logger.warn(
            `Max retries reached for ${model.modelId}, skipping VRAM fetch`
          );
          model.vramError = 'Max retries exceeded';
          this.cache.set(model.modelId, model);
          return;
        }

        try {
          logger.debug(
            `Fetching VRAM data for ${model.modelId} (attempt ${attempts + 1})`
          );

          // Longer timeout for VRAM fetching
          const vramData = await Promise.race([
            this.fetchVRAMData(model.url),
            new Promise<null>((_, reject) =>
              setTimeout(
                () => reject(new Error('VRAM fetch timeout')),
                this.VRAM_FETCH_TIMEOUT
              )
            ),
          ]);

          if (vramData) {
            model.vramEstimates = vramData.estimates;
            model.modelArchitecture = vramData.architecture;
            model.hasVramData = true;

            // Add the trained context length from GGUF metadata
            if (vramData.architecture.contextLength) {
              model.trainedContextLength = vramData.architecture.contextLength;
              model.maxContextLength = vramData.architecture.contextLength;
            }

            logger.info(
              `Successfully fetched VRAM data for ${model.modelId}, context: ${model.trainedContextLength}`
            );

            // Update cache with the new data
            this.cache.set(model.modelId, model);

            // Clear retry attempts on success
            this.vramFetchAttempts.delete(model.modelId);
          } else {
            throw new Error('VRAM data fetch returned null');
          }
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : 'Unknown error';
          logger.warn(
            `Failed to fetch VRAM data for ${model.modelId}: ${errorMsg}`
          );

          // Increment retry counter
          this.vramFetchAttempts.set(model.modelId, attempts + 1);

          // Re-add to queue if retries remaining
          if (attempts + 1 < this.MAX_VRAM_RETRIES) {
            logger.debug(
              `Re-queueing ${model.modelId} for VRAM fetch (retry ${attempts + 2})`
            );
            this.vramFetchQueue.push(model);
          } else {
            model.vramError = errorMsg;
            this.cache.set(model.modelId, model);
          }
        }
      });

      // Wait for batch to complete
      await Promise.allSettled(promises);

      // Save cache after each batch
      this.saveCacheToFile();

      // Small delay between batches to avoid overwhelming the network
      if (this.vramFetchQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    this.isProcessingVramQueue = false;
    logger.info('VRAM fetch queue processing completed');
  }

  /**
   * Check if a filename is part of a multi-part GGUF model
   */
  private isMultiPartFile(filename: string): MultiPartInfo {
    // Match pattern like: model.Q6_K.gguf-00001-of-00006.gguf
    const multiPartPattern = /^(.+\.gguf)-(\d{5})-of-(\d{5})\.gguf$/;
    const match = filename.match(multiPartPattern);

    if (match) {
      return {
        isMultiPart: true,
        partNumber: parseInt(match[2], 10),
        totalParts: parseInt(match[3], 10),
        baseFilename: match[1],
      };
    }

    return { isMultiPart: false };
  }

  /**
   * Get detailed information for a specific model
   */
  private async getModelDetails(
    model: HuggingFaceModel
  ): Promise<DynamicModelInfo | null> {
    const detailsUrl = `https://huggingface.co/api/models/${model.id}?blobs=true`;

    const response = await fetch(detailsUrl, {
      headers: {
        'User-Agent': 'mindstrike-local-llm/1.0',
      },
    });

    if (!response.ok) {
      logger.debug(
        `Failed to get model details for ${model.id}: ${response.status}`
      );
      return null;
    }

    const details = (await response.json()) as HuggingFaceModel;

    // Check if this is a gated model and mark it as such
    const isGated = details.gated === true;

    if (!details.siblings) {
      return null;
    }

    // Filter out non-first parts of multi-part models
    const ggufFiles = details.siblings.filter(s =>
      s.rfilename.endsWith('.gguf')
    );
    const validFiles: Array<{
      rfilename: string;
      size: number;
      multiPartInfo?: MultiPartInfo;
    }> = [];

    for (const file of ggufFiles) {
      const multiPartInfo = this.isMultiPartFile(file.rfilename);

      if (multiPartInfo.isMultiPart) {
        // Only include the first part of multi-part models
        if (multiPartInfo.partNumber === 1) {
          validFiles.push({ ...file, multiPartInfo });
        }
      } else {
        // Include all non-multi-part files
        validFiles.push({ ...file, multiPartInfo });
      }
    }

    // Look for Q4_K_M quantization first (good balance), then other common ones
    const preferredQuantizations = [
      'Q4_K_M',
      'Q5_K_M',
      'Q4_K_S',
      'Q8_0',
      'Q4_0',
    ];

    let selectedFile: {
      rfilename: string;
      size: number;
      multiPartInfo?: MultiPartInfo;
    } | null = null;

    for (const quant of preferredQuantizations) {
      const file = validFiles.find(s => {
        // For multi-part files, check if the base filename contains the quantization
        if (s.multiPartInfo?.isMultiPart) {
          return (
            s.multiPartInfo.baseFilename?.includes(quant) &&
            s.size < 15000000000
          );
        }
        // For single files, check as before
        return s.rfilename.endsWith(`${quant}.gguf`) && s.size < 15000000000;
      });
      if (file) {
        selectedFile = file;
        break;
      }
    }

    // NO FALLBACK - if we don't find a preferred quantization, skip this model
    if (!selectedFile) {
      return null;
    }

    // Handle multi-part models
    let isMultiPart = false;
    let totalParts = 1;
    let allPartFiles: string[] = [];
    let totalSize = selectedFile.size;

    if (selectedFile.multiPartInfo?.isMultiPart) {
      isMultiPart = true;
      totalParts = selectedFile.multiPartInfo.totalParts ?? 1;

      // Find all parts of this multi-part model
      const baseFilename = selectedFile.multiPartInfo.baseFilename;
      allPartFiles = [];
      totalSize = 0;

      for (let i = 1; i <= totalParts; i++) {
        const partFilename = `${baseFilename}-${String(i).padStart(5, '0')}-of-${String(totalParts).padStart(5, '0')}.gguf`;
        const partFile = details.siblings.find(
          s => s.rfilename === partFilename
        );

        if (!partFile) {
          // If any part is missing, skip this model entirely
          logger.debug(
            `Missing part ${i} of ${totalParts} for model ${model.id}`
          );
          return null;
        }

        allPartFiles.push(partFilename);
        totalSize += partFile.size;
      }
    }

    // Extract model info
    const username = this.extractUsername(model.id);
    const parameterCount = this.extractParameterCount(
      model.id,
      selectedFile.rfilename,
      username
    );
    const quantization = this.extractQuantization(
      isMultiPart && selectedFile.multiPartInfo?.baseFilename
        ? selectedFile.multiPartInfo.baseFilename
        : selectedFile.rfilename
    );

    // Generate download URL
    const downloadUrl = `https://huggingface.co/${model.id}/resolve/main/${selectedFile.rfilename}`;

    // Determine accessibility status
    let accessibility: 'accessible' | 'gated' | 'private' | 'error' =
      'accessible';

    if (isGated) {
      accessibility = 'gated';
    } else {
      // Check if we have cached accessibility info
      const cached = this.accessibilityCache[model.id];
      const now = Date.now();

      if (
        cached &&
        now - cached.checkedAt < this.ACCESSIBILITY_CACHE_DURATION
      ) {
        accessibility = cached.accessibility;
      } else {
        // Test accessibility and cache result
        accessibility = await this.testModelAccessibility(downloadUrl);
        this.accessibilityCache[model.id] = {
          accessibility,
          checkedAt: now,
          downloadUrl,
        };
        this.saveAccessibilityCache().catch(error => {
          logger.warn('Failed to save accessibility cache:', error);
        });
      }
    }

    // Prepare base model info
    const modelInfo: DynamicModelInfo = {
      name: this.formatModelName(model.id, parameterCount, quantization),
      url: downloadUrl,
      filename: selectedFile.rfilename.replace(/[/\\]/g, '_'),
      size: isMultiPart ? totalSize : selectedFile.size,
      description: this.generateDescription(
        model.id,
        parameterCount,
        quantization,
        isMultiPart,
        totalParts
      ),
      parameterCount,
      quantization,
      downloads: model.downloads,
      modelId: model.id,
      accessibility,
      accessibilityCheckedAt: Date.now(),
      huggingFaceUrl: `https://huggingface.co/${model.id}`,
      username: username,
      likes: model.likes,
      updatedAt: model.lastModified,
      hasVramData: false,
      // Add multi-part info
      isMultiPart,
      totalParts: isMultiPart ? totalParts : undefined,
      allPartFiles: isMultiPart ? allPartFiles : undefined,
      totalSize: isMultiPart ? totalSize : undefined,
    };

    // Skip initial VRAM fetch - let the queue handle it
    // This ensures all models get processed fairly
    logger.debug(
      `Model ${model.id} will have VRAM data fetched in background queue`
    );

    return modelInfo;
  }

  private extractUsername(modelId: string): string {
    const parts = modelId.split('/');
    return parts.length > 1 ? parts[0] : 'Unknown';
  }

  private extractParameterCount(
    modelId: string,
    filename: string,
    username: string
  ): string {
    // Try to extract from model ID first
    const idMatch = modelId.match(/(\d+(?:\.\d+)?)[Bb]/);
    if (idMatch) {
      return idMatch[1] + 'B';
    }

    // Try to extract from filename
    const fileMatch = filename.match(/(\d+(?:\.\d+)?)[Bb]/);
    if (fileMatch) {
      return fileMatch[1] + 'B';
    }

    // Return username instead of 'Unknown'
    return username;
  }

  private extractQuantization(filename: string): string {
    // Enhanced quantization pattern matching
    const patterns = [
      // Standard GGUF quantization patterns
      /\.(Q\d+_[A-Z]+_?[A-Z]*)\.gguf$/i,
      /\.(IQ\d+_[A-Z]+_?[A-Z]*)\.gguf$/i,
      /\.(Q\d+)\.gguf$/i,
      /\.(IQ\d+)\.gguf$/i,
      // Alternative patterns without file extension context
      /(Q\d+_[A-Z]+_?[A-Z]*)/i,
      /(IQ\d+_[A-Z]+_?[A-Z]*)/i,
      /(Q\d+)/i,
      /(IQ\d+)/i,
      // Common patterns like f16, f32
      /\.(f16|f32|fp16|fp32)\.gguf$/i,
      /(f16|f32|fp16|fp32)/i,
    ];

    for (const pattern of patterns) {
      const match = filename.match(pattern);
      if (match) {
        return match[1].toUpperCase();
      }
    }

    // Check if it's a GGUF file without quantization info
    if (filename.toLowerCase().includes('.gguf')) {
      return 'F16'; // Default assumption for GGUF files
    }

    return 'Unknown';
  }

  private estimateContextLength(tags: string[], modelId: string): number {
    const modelIdLower = modelId.toLowerCase();

    // Known context lengths for popular models
    if (modelIdLower.includes('llama-3')) {
      return 8192;
    }
    if (modelIdLower.includes('mistral')) {
      return 8192;
    }
    if (modelIdLower.includes('qwen')) {
      return 32768;
    }
    if (modelIdLower.includes('gemma')) {
      return 8192;
    }
    if (modelIdLower.includes('phi')) {
      return 4096;
    }
    if (modelIdLower.includes('codellama')) {
      return 16384;
    }

    return 4096; // Default fallback
  }

  private formatModelName(
    modelId: string,
    parameterCount: string,
    quantization: string
  ): string {
    // Extract the model name from the ID
    const parts = modelId.split('/');
    const modelName = parts[parts.length - 1];

    // Clean up the model name
    const cleanName = modelName
      .replace(/-GGUF$/, '')
      .replace(/-gguf$/, '')
      .replace(/^llama-/i, 'Llama ')
      .replace(/^mistral-/i, 'Mistral ')
      .replace(/^qwen/i, 'Qwen')
      .replace(/^gemma-/i, 'Gemma ')
      .replace(/^phi-/i, 'Phi ')
      .replace(/-/g, ' ');

    return `${cleanName} ${parameterCount} ${quantization}`;
  }

  private generateDescription(
    modelId: string,
    parameterCount: string,
    quantization: string,
    isMultiPart?: boolean,
    totalParts?: number
  ): string {
    const modelName = modelId.split('/').pop() ?? modelId;

    // Show parameter count if available, otherwise show username
    const paramInfo = parameterCount.includes('B')
      ? `(${parameterCount})`
      : `by ${parameterCount}`;

    let description = `${modelName} ${paramInfo} with ${quantization} quantization`;

    if (isMultiPart && totalParts) {
      description += ` [${totalParts}-part model]`;
    }

    return description;
  }

  /**
   * Fetch VRAM calculation data for a model
   */
  private async fetchVRAMData(modelUrl: string): Promise<{
    estimates: VRAMEstimateInfo[];
    architecture: ModelArchitecture;
  } | null> {
    try {
      // Fetch metadata without internal timeout (handled by caller)
      logger.debug(`Starting GGUF metadata fetch from: ${modelUrl}`);
      const metadata: GGUFMetadata = await loadMetadataFromUrl(modelUrl);
      logger.debug(`Successfully fetched GGUF metadata`);

      // Extract architecture info
      const architecture: ModelArchitecture = {
        layers: metadata.n_layers,
        kvHeads: metadata.n_kv_heads,
        embeddingDim: metadata.embedding_dim,
        contextLength: metadata.context_length,
        feedForwardDim: metadata.feed_forward_dim,
        modelSizeMB: metadata.model_size_mb,
      };

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
      const estimates = calculateAllVRAMEstimates(architectureInfo);

      return estimates.length > 0 ? { estimates, architecture } : null;
    } catch (error) {
      logger.debug('Error fetching VRAM data:', error);
      return null;
    }
  }

  /**
   * Test model accessibility by making a HEAD request
   */
  private async testModelAccessibility(
    url: string
  ): Promise<'accessible' | 'gated' | 'private' | 'error'> {
    try {
      logger.info(`Checking accessibility for: ${url}`);

      const headers: Record<string, string> = {
        'User-Agent': 'mindstrike-local-llm/1.0',
      };

      // Add Hugging Face token if available
      if (this.huggingFaceToken) {
        headers['Authorization'] = `Bearer ${this.huggingFaceToken}`;
      }

      const response = await fetch(url, {
        method: 'HEAD',
        headers,
      });

      if (response.ok) {
        logger.info(`✓ Model accessible: ${url}`);
        return 'accessible';
      } else if (response.status === 401) {
        logger.info(`🔒 Model gated/private: ${url} (401 Unauthorized)`);
        return 'gated';
      } else if (response.status === 403) {
        logger.info(`🔒 Model private: ${url} (403 Forbidden)`);
        return 'private';
      } else {
        logger.warn(`❌ Model error: ${url} (${response.status})`);
        return 'error';
      }
    } catch (error) {
      logger.error(`❌ Failed to check accessibility for ${url}:`, error);
      return 'error';
    }
  }

  /**
   * Load accessibility cache from file
   */
  private async loadAccessibilityCache(): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      const cacheFile = path.join(this.cacheDir, 'model-accessibility.json');
      const data = await fs.readFile(cacheFile, 'utf-8');
      this.accessibilityCache = JSON.parse(data) as ModelAccessibilityCache;
      logger.debug('Loaded model accessibility cache');
    } catch {
      // File doesn't exist or is invalid, start with empty cache
      this.accessibilityCache = {};
      logger.debug('Starting with empty accessibility cache');
    }
  }

  /**
   * Load Hugging Face token from settings
   */
  private async loadHuggingFaceToken(): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const { getMindstrikeDirectory } = await import(
        './utils/settingsDirectory.js'
      );

      const tokenFile = path.join(getMindstrikeDirectory(), 'hf-token');
      const token = await fs.readFile(tokenFile, 'utf-8');
      this.huggingFaceToken = token.trim();
      logger.info('Loaded Hugging Face token');
    } catch {
      // File doesn't exist, no token available
      this.huggingFaceToken = null;
      logger.debug('No Hugging Face token found');
    }
  }

  /**
   * Save Hugging Face token to settings
   */
  private async saveHuggingFaceToken(token: string): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const { getMindstrikeDirectory } = await import(
        './utils/settingsDirectory.js'
      );

      // Ensure the mindstrike directory exists
      const mindstrikeDir = getMindstrikeDirectory();
      await fs.mkdir(mindstrikeDir, { recursive: true });

      const tokenFile = path.join(mindstrikeDir, 'hf-token');
      await fs.writeFile(tokenFile, token, { mode: 0o600 }); // Restrict permissions
      this.huggingFaceToken = token;
      logger.info('Saved Hugging Face token');
    } catch (error) {
      logger.error('Failed to save Hugging Face token:', error);
      throw error;
    }
  }

  /**
   * Save accessibility cache to file
   */
  private async saveAccessibilityCache(): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      const cacheFile = path.join(this.cacheDir, 'model-accessibility.json');
      await fs.writeFile(
        cacheFile,
        JSON.stringify(this.accessibilityCache, null, 2)
      );
      logger.debug('Saved model accessibility cache');
    } catch (error) {
      logger.error('Failed to save accessibility cache:', error);
    }
  }

  /**
   * Initialize the model fetcher (load cache and token)
   */
  async initialize(): Promise<void> {
    await this.loadAccessibilityCache();
    await this.loadHuggingFaceToken();
  }

  /**
   * Clear the cache to force refresh on next request
   */
  clearCache(): void {
    this.cache = new Map();
    this.searchCache = new Map();
    this.lastFetch = 0;
    this.saveCacheToFile();
  }

  /**
   * Clear search cache for a specific query (for debugging)
   */
  clearSearchCacheForQuery(query: string): void {
    const normalizedQuery = query.toLowerCase().trim();
    this.searchCache.delete(normalizedQuery);
    this.saveCacheToFile();
    logger.info(`Cleared search cache for query: ${normalizedQuery}`);
  }

  /**
   * Clear accessibility cache to force recheck
   */
  clearAccessibilityCache(): void {
    this.accessibilityCache = {};
    this.saveAccessibilityCache().catch(error => {
      logger.warn('Failed to save accessibility cache:', error);
    });
  }

  /**
   * Set Hugging Face token and recheck gated models
   */
  async setHuggingFaceToken(token: string): Promise<void> {
    await this.saveHuggingFaceToken(token);

    // Clear accessibility cache for gated models to force recheck
    const gatedModels = Object.keys(this.accessibilityCache).filter(
      modelId => this.accessibilityCache[modelId].accessibility === 'gated'
    );

    for (const modelId of gatedModels) {
      delete this.accessibilityCache[modelId];
    }

    await this.saveAccessibilityCache();
    // Don't clear entire cache, just search cache for gated models
    const gatedQueries = Array.from(this.searchCache.entries()).filter(
      ([, modelIds]) =>
        Array.from(modelIds).some(id => {
          const model = this.cache.get(id);
          return model?.accessibility === 'gated';
        })
    );
    gatedQueries.forEach(([query]) => this.searchCache.delete(query));
  }

  /**
   * Remove Hugging Face token
   */
  async removeHuggingFaceToken(): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const { getMindstrikeDirectory } = await import(
        './utils/settingsDirectory.js'
      );

      const tokenFile = path.join(getMindstrikeDirectory(), 'hf-token');
      await fs.unlink(tokenFile);
      this.huggingFaceToken = null;
      logger.info('Removed Hugging Face token');

      // Clear cache to recheck models without token
      this.clearAccessibilityCache();
    } catch {
      logger.debug('Token file not found, nothing to remove');
    }
  }

  /**
   * Check if Hugging Face token is set
   */
  hasHuggingFaceToken(): boolean {
    return this.huggingFaceToken !== null;
  }

  /**
   * Manually retry VRAM fetching for all models that need it
   */
  retryVramFetching(): void {
    const modelsNeedingVram = Array.from(this.cache.values()).filter(
      m => !m.hasVramData && !m.vramError && m.url
    );

    if (modelsNeedingVram.length > 0) {
      logger.info(
        `Manually retrying VRAM fetch for ${modelsNeedingVram.length} models`
      );
      // Clear retry attempts to allow fresh retries
      this.vramFetchAttempts.clear();
      this.fetchVRAMDataForModels(modelsNeedingVram).catch(error => {
        logger.error('Failed to retry VRAM fetching:', error);
      });
    } else {
      logger.info('No models need VRAM fetching');
    }
  }
}

// Singleton instance
export const modelFetcher = new ModelFetcher();
