import { logger } from './logger.js';
import * as fs from 'fs';
import * as path from 'path';
import { getMindstrikeDirectory } from './utils/settings-directory.js';

export interface DynamicModelInfo {
  name: string;
  url: string;
  filename: string;
  size: number;
  description: string;
  modelType: 'chat' | 'code' | 'embedding' | 'vision';
  contextLength?: number;
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

export class ModelFetcher {
  private cache: Map<string, DynamicModelInfo> = new Map(); // Use Map for deduplication by modelId
  private lastFetch: number = 0;
  private readonly CACHE_DURATION = 1000 * 60 * 60; // 1 hour (unused now)
  private readonly ACCESSIBILITY_CACHE_DURATION = 1000 * 60 * 60 * 24; // 24 hours
  private accessibilityCache: ModelAccessibilityCache = {};
  private huggingFaceToken: string | null = null;
  private cacheDir: string;
  private cacheFile: string;
  private searchCache: Map<string, Set<string>> = new Map(); // Track which searches have been done
  private isFetching: boolean = false;
  private fetchPromise: Promise<void> | null = null;
  private fetchPromiseResolve: (() => void) | null = null;
  private progressCallback?: (progress: {
    type: 'started' | 'fetching-models' | 'checking-model' | 'model-checked' | 'completed' | 'error';
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
        const data = JSON.parse(cacheData);
        
        // Convert array to Map for deduplication
        const models = data.models || [];
        this.cache = new Map();
        models.forEach((model: DynamicModelInfo) => {
          this.cache.set(model.modelId, model);
        });
        
        this.lastFetch = data.timestamp || 0;
        this.searchCache = new Map(data.searchCache || []);
        logger.debug(`Loaded available models cache with ${this.cache.size} models and ${this.searchCache.size} search queries`);
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
        searchCache: Array.from(this.searchCache.entries())
      };
      fs.writeFileSync(this.cacheFile, JSON.stringify(cacheData, null, 2));
      logger.debug(`Saved available models cache with ${this.cache.size} models and ${this.searchCache.size} search queries`);
    } catch (error) {
      logger.warn('Failed to save available models cache:', error);
    }
  }

  private async waitForFetch(): Promise<void> {
    if (!this.fetchPromise) {
      this.fetchPromise = new Promise<void>((resolve) => {
        this.fetchPromiseResolve = resolve;
      });
    }
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
      logger.debug('Models are already being fetched, waiting for completion...');
      await this.waitForFetch();
      return this.getCachedModels();
    }

    try {
      this.isFetching = true;
      logger.info('Fetching popular models from Hugging Face for the first time...');
      await this.fetchPopularModels();
      return Array.from(this.cache.values()).sort((a, b) => b.downloads - a.downloads);
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
      return Array.from(this.cache.values()).sort((a, b) => b.downloads - a.downloads);
    } catch (error) {
      logger.error('Failed to refresh models from Hugging Face:', error);
      throw error;
    }
  }

  /**
   * Search for models by keyword and add to cache
   */
  async searchModels(query: string, searchType: string = 'all'): Promise<DynamicModelInfo[]> {
    const normalizedQuery = query.toLowerCase().trim();
    
    logger.info(`searchModels called with query: "${query}" (normalized: "${normalizedQuery}")`);
    
    if (!normalizedQuery) {
      logger.info('Empty query, returning all cached models');
      return Array.from(this.cache.values()).sort((a, b) => b.downloads - a.downloads);
    }

    // Check if we've already searched for this query
    if (this.searchCache.has(normalizedQuery)) {
      logger.info(`Found cached search for: ${normalizedQuery}`);
      const cachedModelIds = this.searchCache.get(normalizedQuery)!;
      const results = Array.from(cachedModelIds)
        .map(id => this.cache.get(id))
        .filter(model => model !== undefined) as DynamicModelInfo[];
      
      // If cached results are empty, remove from cache and search again
      if (results.length === 0) {
        logger.info(`Cached search for "${normalizedQuery}" has no results, clearing cache and searching again`);
        this.searchCache.delete(normalizedQuery);
      } else {
        logger.info(`Returning ${results.length} cached models for query: ${normalizedQuery}`);
        return results;
      }
    }

    try {
      logger.info(`Searching Hugging Face for: ${normalizedQuery} (searchType: ${searchType})`);
      const newModels = await this.fetchModelsBySearch(normalizedQuery);
      
      // Filter models based on search type if not 'all'
      let filteredModels = newModels;
      if (searchType !== 'all') {
        filteredModels = this.filterModelsBySearchType(newModels, normalizedQuery, searchType);
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

      logger.info(`Found ${newModels.length} models, filtered to ${filteredModels.length} for query: ${normalizedQuery} (searchType: ${searchType}), cached ${foundModelIds.size} model IDs`);
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
      type: 'started' | 'fetching-models' | 'checking-model' | 'model-checked' | 'completed' | 'error';
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
    
    logger.info(`searchModelsWithProgress called with query: "${query}" (normalized: "${normalizedQuery}")`);
    
    try {
      this.progressCallback({
        type: 'started',
        message: 'Starting search...'
      });

      if (!normalizedQuery) {
        logger.info('Empty query, returning all cached models');
        const models = Array.from(this.cache.values()).sort((a, b) => b.downloads - a.downloads);
        this.progressCallback({
          type: 'completed',
          message: `Search completed! Found ${models.length} models.`,
          total: models.length
        });
        return models;
      }

      // Check if we've already searched for this query
      if (this.searchCache.has(normalizedQuery)) {
        logger.info(`Found cached search for: ${normalizedQuery}`);
        const cachedModelIds = this.searchCache.get(normalizedQuery)!;
        const results = Array.from(cachedModelIds)
          .map(id => this.cache.get(id))
          .filter(model => model !== undefined) as DynamicModelInfo[];
        
        // If cached results are empty, remove from cache and search again
        if (results.length === 0) {
          logger.info(`Cached search for "${normalizedQuery}" has no results, clearing cache and searching again`);
          this.searchCache.delete(normalizedQuery);
        } else {
          logger.info(`Returning ${results.length} cached models for query: ${normalizedQuery}`);
          this.progressCallback({
            type: 'completed',
            message: `Search completed! Found ${results.length} cached models.`,
            total: results.length
          });
          return results;
        }
      }

      this.progressCallback({
        type: 'fetching-models',
        message: `Searching HuggingFace for "${query}"...`
      });

      logger.info(`Searching Hugging Face for: ${normalizedQuery} (searchType: ${searchType})`);
      const newModels = await this.fetchModelsBySearch(normalizedQuery);
      
      // Filter models based on search type if not 'all'
      let filteredModels = newModels;
      if (searchType !== 'all') {
        filteredModels = this.filterModelsBySearchType(newModels, normalizedQuery, searchType);
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

      logger.info(`Found ${newModels.length} models, filtered to ${filteredModels.length} for query: ${normalizedQuery} (searchType: ${searchType}), cached ${foundModelIds.size} model IDs`);
      
      const sortedResults = filteredModels.sort((a, b) => b.downloads - a.downloads);
      this.progressCallback({
        type: 'completed',
        message: `Search completed! Found ${sortedResults.length} models.`,
        total: sortedResults.length
      });
      
      return sortedResults;
    } catch (error) {
      logger.error(`Failed to search models for: ${normalizedQuery}`, error);
      this.progressCallback({
        type: 'error',
        message: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      throw error;
    }
  }

  /**
   * Get available models with progress updates
   */
  async getAvailableModelsWithProgress(
    progressCallback: (progress: {
      type: 'started' | 'fetching-models' | 'checking-model' | 'model-checked' | 'completed' | 'error';
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
        message: 'Starting popular models scan...'
      });

      await this.fetchPopularModels();
      const models = Array.from(this.cache.values()).sort((a, b) => b.downloads - a.downloads);
      
      this.progressCallback({
        type: 'completed',
        message: `Scan completed! Found ${models.length} models in cache.`,
        total: models.length
      });
      
      return models;
    } catch (error) {
      this.progressCallback({
        type: 'error',
        message: `Failed to fetch models: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      logger.error('Failed to fetch models from Hugging Face with progress:', error);
      throw error;
    } finally {
      this.progressCallback = undefined;
    }
  }

  /**
   * Fetch popular GGUF models from Hugging Face and add to cache
   */
  async fetchPopularModels(
    progressCallback?: (current: number, total: number, modelId?: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    // Search for popular GGUF models sorted by downloads - get more models now
    const url = 'https://huggingface.co/api/models?filter=gguf&sort=downloads&direction=-1&limit=200';
    
    this.progressCallback?.({
      type: 'fetching-models',
      message: 'Fetching model list from Hugging Face...'
    });

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'mindstrike-local-llm/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.status !== 429 ? response.statusText : 'Rate limit exceeded'}`);
    }

    const allModels: HuggingFaceModel[] = await response.json();
    
    // Filter for text generation models with broader criteria
    const textGenModels = allModels.filter(model => {
      const hasTextGenTag = model.tags.some(tag => 
        ['text-generation', 'conversational', 'text2text-generation', 'causal-lm'].includes(tag)
      );
      
      // Include popular models (>10k downloads) or well-known model families
      const isPopular = model.downloads > 10000;
      const isWellKnownFamily = model.id.toLowerCase().includes('llama') || 
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
    
    // Get detailed info for more models now (up to 60)
    const topModels = textGenModels.slice(0, 60);
    
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
        total: topModels.length
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
            total: topModels.length
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
          total: topModels.length
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
  private filterModelsBySearchType(models: DynamicModelInfo[], query: string, searchType: string): DynamicModelInfo[] {
    const lowerQuery = query.toLowerCase();
    
    return models.filter(model => {
      switch (searchType) {
        case 'name':
          return model.name.toLowerCase().includes(lowerQuery) || 
                 model.modelId.toLowerCase().includes(lowerQuery);
        case 'username':
          return model.username.toLowerCase().includes(lowerQuery);
        case 'description':
          return model.description?.toLowerCase().includes(lowerQuery) || false;
        case 'modelType':
          return model.modelType.toLowerCase().includes(lowerQuery);
        default:
          return true; // 'all' or unknown type - return all
      }
    });
  }

  /**
   * Search for models by keyword using Hugging Face search API
   */
  private async fetchModelsBySearch(query: string): Promise<DynamicModelInfo[]> {
    // Use HuggingFace search API with query
    const url = `https://huggingface.co/api/models?search=${encodeURIComponent(query)}&filter=gguf&sort=downloads&direction=-1&limit=100`;
    
    logger.info(`Fetching models from: ${url}`);
    
    this.progressCallback?.({
      type: 'fetching-models',
      message: `Searching for "${query}"...`
    });

    // Add timeout and retry logic
    let lastError: Error;
    let response: Response | undefined;
    
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        response = await fetch(url, {
          headers: {
            'User-Agent': 'mindstrike-local-llm/1.0'
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.status !== 429 ? response.statusText : 'Rate limit exceeded'}`);
        }
        
        // Success - exit retry loop
        break;
        
      } catch (error) {
        lastError = error as Error;
        response = undefined;
        logger.warn(`Search attempt ${attempt} failed:`, error);
        
        if (attempt < 2) {
          logger.info(`Retrying search in 2 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    
    // If we get here without a successful response, throw the last error
    if (!response) {
      throw lastError!;
    }

    const allModels: HuggingFaceModel[] = await response.json();
    logger.info(`HuggingFace returned ${allModels.length} models for query: ${query}`);
    
    // Filter for text generation models with broader criteria
    const textGenModels = allModels.filter(model => {
      const hasTextGenTag = model.tags.some(tag => 
        ['text-generation', 'conversational', 'text2text-generation', 'causal-lm'].includes(tag)
      );
      
      // Include any model that matches search (even with low downloads for search results)
      return hasTextGenTag;
    });
    
    logger.info(`After filtering for text-generation models: ${textGenModels.length} models`);

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
        total: modelsToProcess.length
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
            total: modelsToProcess.length
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
          total: modelsToProcess.length
        });
        continue;
      }
    }

    return modelInfos;
  }

  /**
   * Get detailed information for a specific model
   */
  private async getModelDetails(model: HuggingFaceModel): Promise<DynamicModelInfo | null> {
    const detailsUrl = `https://huggingface.co/api/models/${model.id}?blobs=true`;
    
    const response = await fetch(detailsUrl, {
      headers: {
        'User-Agent': 'mindstrike-local-llm/1.0'
      }
    });

    if (!response.ok) {
      logger.debug(`Failed to get model details for ${model.id}: ${response.status}`);
      return null;
    }

    const details: HuggingFaceModel = await response.json();
    
    // Check if this is a gated model and mark it as such
    const isGated = details.gated === true;
    
    if (!details.siblings) {
      return null;
    }

    // Look for Q4_K_M quantization first (good balance), then other common ones
    const preferredQuantizations = ['Q4_K_M', 'Q5_K_M', 'Q4_K_S', 'Q8_0', 'Q4_0'];
    
    let selectedFile: { rfilename: string; size: number } | null = null;
    
    for (const quant of preferredQuantizations) {
      const file = details.siblings.find(s => 
        s.rfilename.endsWith(`${quant}.gguf`) && 
        s.size < 15000000000 // Max 15GB
      );
      if (file) {
        selectedFile = file;
        break;
      }
    }

    // Fallback to any .gguf file under 15GB
    if (!selectedFile) {
      selectedFile = details.siblings.find(s => 
        s.rfilename.endsWith('.gguf') && 
        s.size < 15000000000
      ) || null;
    }

    if (!selectedFile) {
      return null;
    }

    // Extract model info
    const username = this.extractUsername(model.id);
    const parameterCount = this.extractParameterCount(model.id, selectedFile.rfilename, username);
    const quantization = this.extractQuantization(selectedFile.rfilename);
    const modelType = this.determineModelType(model.tags, model.id);
    
    // Generate download URL
    const downloadUrl = `https://huggingface.co/${model.id}/resolve/main/${selectedFile.rfilename}`;
    
    // Determine accessibility status
    let accessibility: 'accessible' | 'gated' | 'private' | 'error' = 'accessible';
    
    if (isGated) {
      accessibility = 'gated';
    } else {
      // Check if we have cached accessibility info
      const cached = this.accessibilityCache[model.id];
      const now = Date.now();
      
      if (cached && (now - cached.checkedAt) < this.ACCESSIBILITY_CACHE_DURATION) {
        accessibility = cached.accessibility;
      } else {
        // Test accessibility and cache result
        accessibility = await this.testModelAccessibility(downloadUrl);
        this.accessibilityCache[model.id] = {
          accessibility,
          checkedAt: now,
          downloadUrl
        };
        this.saveAccessibilityCache();
      }
    }
    
    return {
      name: this.formatModelName(model.id, parameterCount, quantization),
      url: downloadUrl,
      filename: selectedFile.rfilename,
      size: selectedFile.size,
      description: this.generateDescription(model.id, parameterCount, quantization, modelType, username),
      modelType,
      contextLength: this.estimateContextLength(model.tags, model.id),
      parameterCount,
      quantization,
      downloads: model.downloads,
      modelId: model.id,
      accessibility,
      accessibilityCheckedAt: Date.now(),
      huggingFaceUrl: `https://huggingface.co/${model.id}`,
      username,
      likes: model.likes,
      updatedAt: model.lastModified
    };
  }

  private extractUsername(modelId: string): string {
    const parts = modelId.split('/');
    return parts.length > 1 ? parts[0] : 'Unknown';
  }

  private extractParameterCount(modelId: string, filename: string, username: string): string {
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
      /(f16|f32|fp16|fp32)/i
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

  private determineModelType(tags: string[], modelId: string): 'chat' | 'code' | 'embedding' | 'vision' {
    const lowerModelId = modelId.toLowerCase();
    const allTags = tags.join(' ').toLowerCase();
    
    if (lowerModelId.includes('code') || allTags.includes('code')) {
      return 'code';
    }
    if (lowerModelId.includes('embed') || allTags.includes('embed')) {
      return 'embedding';
    }
    if (lowerModelId.includes('vision') || allTags.includes('vision')) {
      return 'vision';
    }
    return 'chat';
  }

  private estimateContextLength(tags: string[], modelId: string): number {
    const modelIdLower = modelId.toLowerCase();
    
    // Known context lengths for popular models
    if (modelIdLower.includes('llama-3')) return 8192;
    if (modelIdLower.includes('mistral')) return 8192;
    if (modelIdLower.includes('qwen')) return 32768;
    if (modelIdLower.includes('gemma')) return 8192;
    if (modelIdLower.includes('phi')) return 4096;
    if (modelIdLower.includes('codellama')) return 16384;
    
    return 4096; // Default fallback
  }

  private formatModelName(modelId: string, parameterCount: string, quantization: string): string {
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

  private generateDescription(modelId: string, parameterCount: string, quantization: string, modelType: string, username: string): string {
    const modelName = modelId.split('/').pop() || modelId;
    
    // Show parameter count if available, otherwise show username
    const paramInfo = parameterCount.includes('B') ? `(${parameterCount})` : `by ${parameterCount}`;
    let description = `${modelName} ${paramInfo} with ${quantization} quantization`;
    
    switch (modelType) {
      case 'chat':
        description += ' - optimized for conversational AI and general tasks';
        break;
      case 'code':
        description += ' - specialized for code generation and programming tasks';
        break;
      case 'embedding':
        description += ' - designed for text embeddings and semantic search';
        break;
      case 'vision':
        description += ' - multimodal model with vision capabilities';
        break;
    }
    
    return description;
  }

  /**
   * Test model accessibility by making a HEAD request
   */
  private async testModelAccessibility(url: string): Promise<'accessible' | 'gated' | 'private' | 'error'> {
    try {
      logger.info(`Checking accessibility for: ${url}`);
      
      const headers: Record<string, string> = {
        'User-Agent': 'mindstrike-local-llm/1.0'
      };
      
      // Add Hugging Face token if available
      if (this.huggingFaceToken) {
        headers['Authorization'] = `Bearer ${this.huggingFaceToken}`;
      }
      
      const response = await fetch(url, {
        method: 'HEAD',
        headers
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
      const { getHomeDirectory } = await import('./utils/settings-directory.js');
      
      const cacheFile = path.join(getHomeDirectory(), '.mindstrike-model-accessibility.json');
      const data = await fs.readFile(cacheFile, 'utf-8');
      this.accessibilityCache = JSON.parse(data);
      logger.debug('Loaded model accessibility cache');
    } catch (error) {
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
      const { getMindstrikeDirectory } = await import('./utils/settings-directory.js');
      
      const tokenFile = path.join(getMindstrikeDirectory(), 'hf-token');
      const token = await fs.readFile(tokenFile, 'utf-8');
      this.huggingFaceToken = token.trim();
      logger.info('Loaded Hugging Face token');
    } catch (error) {
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
      const { getMindstrikeDirectory } = await import('./utils/settings-directory.js');
      
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
      const { getHomeDirectory } = await import('./utils/settings-directory.js');
      
      const cacheFile = path.join(getHomeDirectory(), '.mindstrike-model-accessibility.json');
      await fs.writeFile(cacheFile, JSON.stringify(this.accessibilityCache, null, 2));
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
    this.saveAccessibilityCache();
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
    const gatedQueries = Array.from(this.searchCache.entries()).filter(([query, modelIds]) => 
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
      const { getMindstrikeDirectory } = await import('./utils/settings-directory.js');
      
      const tokenFile = path.join(getMindstrikeDirectory(), 'hf-token');
      await fs.unlink(tokenFile);
      this.huggingFaceToken = null;
      logger.info('Removed Hugging Face token');
      
      // Clear cache to recheck models without token
      this.clearAccessibilityCache();
    } catch (error) {
      logger.debug('Token file not found, nothing to remove');
    }
  }

  /**
   * Check if Hugging Face token is set
   */
  hasHuggingFaceToken(): boolean {
    return this.huggingFaceToken !== null;
  }
}

// Singleton instance
export const modelFetcher = new ModelFetcher();
