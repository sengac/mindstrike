import { getLlama, LlamaModel, LlamaContext, LlamaChatSession, readGgufFileInfo } from 'node-llama-cpp';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createHash } from 'crypto';
import { execSync } from 'child_process';
import { getLocalModelsDirectory } from './utils/settings-directory.js';
import { modelFetcher, DynamicModelInfo } from './model-fetcher.js';
import { logger } from './logger.js';

export interface ModelLoadingSettings {
  gpuLayers?: number; // -1 for auto, 0 for CPU only, positive number for specific layers
  contextSize?: number;
  batchSize?: number;
  threads?: number;
  temperature?: number; // 0.0 to 2.0, controls randomness of generation
}

export interface ModelRuntimeInfo {
  actualGpuLayers?: number;
  gpuType?: string;
  memoryUsage?: {
    vramUsedMB?: number;
    vramTotalMB?: number;
    vramPercent?: number;
  };
  loadingTime?: number; // milliseconds
}

export interface LocalModelInfo {
  id: string;
  name: string;
  filename: string;
  path: string;
  size: number;
  downloaded: boolean;
  downloading: boolean;
  downloadProgress?: number;
  contextLength?: number;
  parameterCount?: string;
  quantization?: string;
  loadingSettings?: ModelLoadingSettings;
  layerCount?: number; // Total layers in the model from GGUF metadata
  maxContextLength?: number; // Maximum context length from GGUF metadata (may differ from contextLength)
}

export interface ModelDownloadInfo {
  name: string;
  url: string;
  filename: string;
  size?: number;
  description?: string;
  contextLength?: number;
  parameterCount?: string;
  quantization?: string;
}



export class LocalLLMManager {
  private modelsDir: string;
  private activeModels = new Map<string, { model: LlamaModel; context: LlamaContext; session: LlamaChatSession; runtimeInfo: ModelRuntimeInfo }>();
  private downloadingModels = new Set<string>();
  private downloadControllers = new Map<string, AbortController>();
  private downloadProgress = new Map<string, { progress: number; speed: string }>();
  private modelSettings = new Map<string, ModelLoadingSettings>();
  private contextSizeCache = new Map<string, { contextSize: number; timestamp: number }>();

  // Clear cache to force recalculation (useful after fixing VRAM calculation bugs)
  clearContextSizeCache(): void {
    this.contextSizeCache.clear();
  }

  constructor() {
    // Use a dedicated directory for local LLM models
    this.modelsDir = getLocalModelsDirectory();
    this.ensureModelsDirectory();
    
    // Clear any stale cache on startup to ensure fresh calculations
    this.clearContextSizeCache();
  }

  /**
   * Calculate a safe context size based on available VRAM
   */
  private async calculateSafeContextSize(modelSizeBytes: number, requestedContextSize: number, filename: string): Promise<number> {
    // Cache key based on model size and requested context
    const cacheKey = `${filename}-${modelSizeBytes}-${requestedContextSize}`;
    const cached = this.contextSizeCache.get(cacheKey);
    
    // Use cache if less than 5 minutes old
    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
      // Only log cache usage in debug mode to reduce spam
      // console.log(`Using cached context size: ${cached.contextSize} for ${filename}`);
      return cached.contextSize;
    }
    
    try {
      const llama = await getLlama({ gpu: 'auto' });
      const vramState = await llama.getVramState();
      
      // Get model metadata to use the proper VRAM calculation formulas
      // We need: hidden_size, num_hidden_layers, num_attention_heads, num_key_value_heads
      // For now, estimate these from model size (we'll improve this later with GGUF metadata)
      const modelSizeGB = modelSizeBytes / (1024 * 1024 * 1024);
      
      // Rough estimates for a 9B model based on typical architectures
      const estimatedConfig = {
        hidden_size: 4096,           // typical for 9B models
        num_hidden_layers: 48,       // you mentioned 48 layers
        num_attention_heads: 32,     // typical ratio
        num_key_value_heads: 8       // typical GQA ratio
      };
      
      // Use the actual VRAM calculation formulas from the HuggingFace calculator:
      
      // 1. KV Cache calculation
      const kvCache = (context: number) => {
        const n_gqa = estimatedConfig.num_attention_heads / estimatedConfig.num_key_value_heads;
        const n_embd_gqa = estimatedConfig.hidden_size / n_gqa;
        const n_elements = n_embd_gqa * (estimatedConfig.num_hidden_layers * context);
        const size = 2 * n_elements;
        return size * (16 / 8); // 16-bit cache
      };
      
      // 2. Input Buffer calculation
      const inputBuffer = (context: number, bsz = 512) => {
        const inp_tokens = bsz;
        const inp_embd = estimatedConfig.hidden_size * bsz;
        const inp_pos = bsz;
        const inp_KQ_mask = context * bsz;
        const inp_K_shift = context;
        const inp_sum = bsz;
        return inp_tokens + inp_embd + inp_pos + inp_KQ_mask + inp_K_shift + inp_sum;
      };
      
      // 3. Compute Buffer calculation
      const computeBuffer = (context: number) => {
        return (context / 1024 * 2 + 0.75) * estimatedConfig.num_attention_heads * 1024 * 1024;
      };
      
      // Total context memory needed
      const contextMemoryBytes = (context: number) => {
        return kvCache(context) + inputBuffer(context) + computeBuffer(context);
      };
      
      // Use actual free VRAM instead of estimating model usage
      // Since we don't know exactly how much VRAM the model will use,
      // be conservative and reserve 80% of free VRAM for context
      const availableVramBytes = vramState.free * 0.8;
      
      // Calculate context memory for requested size
      const requestedContextMemory = contextMemoryBytes(requestedContextSize);
      
      // If it fits in available VRAM, use it
      if (requestedContextMemory <= availableVramBytes) {
        // Cache the result
        this.contextSizeCache.set(cacheKey, { contextSize: requestedContextSize, timestamp: Date.now() });
        return requestedContextSize;
      }
      
      // Binary search for the largest context that fits
      let low = 512;
      let high = requestedContextSize;
      let bestSize = 512;
      
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const midMemory = contextMemoryBytes(mid);
        
        if (midMemory <= availableVramBytes) {
          bestSize = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      
      // Cache the result
      this.contextSizeCache.set(cacheKey, { contextSize: bestSize, timestamp: Date.now() });
      return bestSize;
      
    } catch (error) {
      console.error(`Error calculating safe context size: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Don't use a fallback - this hides the real problem
      // Instead, throw the error so we can see what's actually failing
      throw new Error(`Cannot determine safe context size: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private calculateOptimalBatchSize(contextSize: number, modelSizeBytes: number): number {
    // Based on KV cache memory formula: 2 * contextSize * n_layers * n_heads * d_head * precision_bytes * batchSize
    // For a typical 9B model: ~48 layers, 32 heads, 128 d_head, 2 bytes (FP16)
    // Per-token KV cache = 2 * 48 * 32 * 128 * 2 = ~786KB per token
    
    const modelSizeGB = modelSizeBytes / (1024 * 1024 * 1024);
    const kvCachePerTokenBytes = 2 * 48 * 32 * 128 * 2; // ~786KB per token
    const kvCacheForContextMB = (contextSize * kvCachePerTokenBytes) / (1024 * 1024);
    
    // Conservative approach: limit batch to ensure total KV cache doesn't exceed context memory
    // Rule of thumb: batch size should be small enough that KV cache scales gracefully
    if (contextSize <= 2048) {
      return Math.min(512, Math.max(32, Math.floor(2048 / contextSize) * 32));
    } else if (contextSize <= 4096) {
      return Math.min(256, Math.max(16, Math.floor(4096 / contextSize) * 16));
    } else if (contextSize <= 8192) {
      return Math.min(128, Math.max(8, Math.floor(8192 / contextSize) * 8));
    } else {
      // For very large context, use minimal batch size
      return Math.min(64, Math.max(4, Math.floor(16384 / contextSize) * 4));
    }
  }

  private ensureModelsDirectory() {
    if (!fs.existsSync(this.modelsDir)) {
      fs.mkdirSync(this.modelsDir, { recursive: true });
    }
  }



  /**
   * Get all locally available models
   */
  async getLocalModels(): Promise<LocalModelInfo[]> {
    const models: LocalModelInfo[] = [];

    if (!fs.existsSync(this.modelsDir)) {
      return models;
    }

    const files = fs.readdirSync(this.modelsDir);
    const ggufFiles = files.filter(file => file.endsWith('.gguf'));

    for (const filename of ggufFiles) {
      const fullPath = path.join(this.modelsDir, filename);
      const stats = fs.statSync(fullPath);
      
      // Generate a unique ID for this model
      const id = createHash('md5').update(fullPath).digest('hex');
      
      // Try to extract model info from filename
      const modelInfo = this.parseModelFilename(filename);
      
      // Try to get remote model info from cache if available
      const remoteModels = await modelFetcher.getAvailableModels();
      const matchingRemoteModel = remoteModels.find(rm => rm.filename === filename);
      
      // Try to read GGUF metadata for layer count and context length
      let layerCount: number | undefined;
      let maxContextLength: number | undefined;
      try {
        const ggufInfo = await readGgufFileInfo(fullPath);
        if (ggufInfo.metadata) {
          const metadata = ggufInfo.metadata as any;
          if (metadata.llama) {
            layerCount = metadata.llama.block_count;
            maxContextLength = metadata.llama.context_length;
          } else {
            // Try other common architecture names
            const architectures = ['llama', 'mistral', 'gpt', 'qwen'];
            for (const arch of architectures) {
              if (metadata[arch]) {
                if (metadata[arch].block_count) {
                  layerCount = metadata[arch].block_count;
                }
                if (metadata[arch].context_length) {
                  maxContextLength = metadata[arch].context_length;
                }
                if (layerCount || maxContextLength) {
                  break;
                }
              }
            }
          }
        }
      } catch (error) {
        // Silently fail - metadata is optional
      }
      
      // Get user settings for this model
      const userSettings = this.getModelSettings(id);
      
      // Always calculate safe context size based on available VRAM
      const requestedContextSize = userSettings.contextSize || 
                                   maxContextLength || 
                                   matchingRemoteModel?.contextLength || 
                                   modelInfo.contextLength ||
                                   4096;
      
      const actualContextLength = await this.calculateSafeContextSize(
        stats.size,
        requestedContextSize,
        filename
      );

      // Update user settings with the calculated safe context size
      const updatedSettings = {
        ...userSettings,
        contextSize: actualContextLength
      };

      models.push({
        id,
        name: matchingRemoteModel?.name || modelInfo.name || filename.replace('.gguf', ''),
        filename,
        path: fullPath,
        size: stats.size,
        downloaded: true,
        downloading: false,
        contextLength: actualContextLength,
        parameterCount: matchingRemoteModel?.parameterCount || modelInfo.parameterCount,
        quantization: matchingRemoteModel?.quantization || modelInfo.quantization,
        layerCount,
        maxContextLength,
        loadingSettings: updatedSettings
      });
    }

    return models;
  }

  /**
   * Get available models for download (dynamic from Hugging Face)
   */
  async getAvailableModels(): Promise<(ModelDownloadInfo | DynamicModelInfo)[]> {
    try {
      // Get dynamic models from Hugging Face
      const dynamicModels = await modelFetcher.getAvailableModels();
      return dynamicModels;
    } catch (error) {
      logger.error('Failed to fetch dynamic models:', error);
      throw error;
    }
  }

  /**
   * Search for models by query
   */
  async searchModels(query: string): Promise<(ModelDownloadInfo | DynamicModelInfo)[]> {
    try {
      const dynamicModels = await modelFetcher.searchModels(query);
      
      // For search results, don't include static models - just return the search results
      return dynamicModels;
    } catch (error) {
      logger.error('Failed to search models:', error);
      throw error;
    }
  }

  /**
   * Download a model
   */
  async downloadModel(
    modelInfo: ModelDownloadInfo | DynamicModelInfo,
    onProgress?: (progress: number, speed?: string) => void
  ): Promise<string> {
    const filename = modelInfo.filename;
    const outputPath = path.join(this.modelsDir, filename);
    
    // Check if already exists
    if (fs.existsSync(outputPath)) {
      throw new Error('Model already exists');
    }

    // Check if already downloading
    if (this.downloadingModels.has(filename)) {
      throw new Error('Model is already being downloaded');
    }

    this.downloadingModels.add(filename);
    
    // Create abort controller for this download
    const abortController = new AbortController();
    this.downloadControllers.set(filename, abortController);

    try {
      console.log(`Starting download of ${modelInfo.name}...`);
      
      // Get Hugging Face token if available
      const headers: Record<string, string> = {
        'User-Agent': 'mindstrike-local-llm/1.0'
      };
      
      try {
        const { modelFetcher } = await import('./model-fetcher.js');
        if (modelFetcher.hasHuggingFaceToken()) {
          // Note: We don't expose the actual token, just check if it exists
          const fs = await import('fs/promises');
          const path = await import('path');
          const { getMindstrikeDirectory } = await import('./utils/settings-directory.js');
          
          const tokenFile = path.join(getMindstrikeDirectory(), 'hf-token');
          const token = await fs.readFile(tokenFile, 'utf-8');
          headers['Authorization'] = `Bearer ${token.trim()}`;
        }
      } catch (error) {
        logger.debug('No Hugging Face token available for download');
      }
      
      const response = await fetch(modelInfo.url, {
        signal: abortController.signal,
        headers
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('UNAUTHORIZED_HF_TOKEN_REQUIRED');
        } else if (response.status === 403) {
          throw new Error('FORBIDDEN_MODEL_ACCESS_REQUIRED');
        } else {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
      }

      const contentLength = response.headers.get('Content-Length');
      const totalSize = contentLength ? parseInt(contentLength, 10) : 0;
      
      const fileStream = fs.createWriteStream(outputPath);
      const reader = response.body?.getReader();
      
      if (!reader) {
        throw new Error('No response body');
      }

      let downloadedBytes = 0;
      let lastUpdate = Date.now();
      let lastBytes = 0;

      while (true) {
        if (abortController.signal.aborted) {
          fileStream.destroy();
          throw new Error('Download cancelled');
        }
        
        const { done, value } = await reader.read();
        
        if (done) break;
        
        fileStream.write(value);
        downloadedBytes += value.length;
        
        const now = Date.now();
        const timeDiff = now - lastUpdate;
        
        if (totalSize > 0 && timeDiff >= 1000) { // Update every second
          const progress = (downloadedBytes / totalSize) * 100;
          const bytesDiff = downloadedBytes - lastBytes;
          const speed = this.formatSpeed(bytesDiff / (timeDiff / 1000));
          
          this.downloadProgress.set(filename, { progress: Math.round(progress), speed });
          
          if (onProgress) {
            onProgress(Math.round(progress), speed);
          }
          
          lastUpdate = now;
          lastBytes = downloadedBytes;
        }
      }

      fileStream.end();
      
      // Final progress update
      if (totalSize > 0) {
        this.downloadProgress.set(filename, { progress: 100, speed: '0 B/s' });
        if (onProgress) {
          onProgress(100, '0 B/s');
        }
      }
      
      console.log(`Successfully downloaded ${modelInfo.name} to ${outputPath}`);
      return outputPath;
      
    } catch (error) {
      // Clean up partial download
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
      
      if (error instanceof Error && error.message === 'Download cancelled') {
        console.log(`Download cancelled: ${filename}`);
      } else {
        console.error(`Download failed: ${filename}`, error);
      }
      
      throw error;
    } finally {
      this.downloadingModels.delete(filename);
      this.downloadControllers.delete(filename);
      this.downloadProgress.delete(filename);
    }
  }

  /**
   * Delete a local model
   */
  async deleteModel(modelId: string): Promise<void> {
    const models = await this.getLocalModels();
    const model = models.find(m => m.id === modelId);
    
    if (!model) {
      throw new Error('Model not found');
    }

    // Close the model if it's active
    if (this.activeModels.has(modelId)) {
      const activeModel = this.activeModels.get(modelId)!;
      activeModel.context.dispose();
      this.activeModels.delete(modelId);
    }

    // Delete the file
    fs.unlinkSync(model.path);
  }

  /**
   * Set loading settings for a model
   */
  setModelSettings(modelId: string, settings: ModelLoadingSettings): void {
    this.modelSettings.set(modelId, settings);
  }

  /**
   * Get loading settings for a model
   */
  getModelSettings(modelId: string): ModelLoadingSettings {
    return this.modelSettings.get(modelId) || {};
  }

  /**
   * Get runtime info for a loaded model
   */
  getModelRuntimeInfo(modelId: string): ModelRuntimeInfo | undefined {
    return this.activeModels.get(modelId)?.runtimeInfo;
  }

  /**
   * Load a model for inference (supports both model ID and model name)
   */
  async loadModel(modelIdOrName: string): Promise<void> {
    // Try to find by ID first
    let modelInfo: any = null;
    const models = await this.getLocalModels();
    
    modelInfo = models.find(m => m.id === modelIdOrName);
    
    // If not found by ID, try by name
    if (!modelInfo) {
      modelInfo = models.find(m => m.name === modelIdOrName || m.filename === modelIdOrName);
    }
    
    if (!modelInfo) {
      throw new Error('Model not found');
    }

    // Use the actual model ID for storage
    const modelId = modelInfo.id;
    
    if (this.activeModels.has(modelId)) {
      return; // Already loaded
    }

    // Unload all other models first to free up memory
    // This ensures only one local model is loaded at a time
    const otherModelIds = Array.from(this.activeModels.keys()).filter(id => id !== modelId);
    for (const otherModelId of otherModelIds) {
      console.log(`Unloading previous model: ${otherModelId}`);
      await this.unloadModel(otherModelId);
    }

    console.log(`Loading model: ${modelInfo.name}`);
    console.log(`Model file size: ${(modelInfo.size / (1024 * 1024)).toFixed(2)} MB`);
    
    const startTime = Date.now();
    
    // Get user settings for this model
    const settings = this.getModelSettings(modelId);
    
    // Configure llama for async/non-blocking operation
    const llama = await getLlama({
      // Enable GPU acceleration if available
      gpu: 'auto',
    });
    
    console.log(`Available GPU: ${llama.gpu}`);
    if (modelInfo.layerCount) {
      console.log(`Model has ${modelInfo.layerCount} layers`);
    }
    
    // Determine GPU layers to use
    let gpuLayers = -1; // Default: use all layers
    
    if (settings.gpuLayers !== undefined) {
      // Use user-specified setting
      gpuLayers = settings.gpuLayers;
      console.log(`Using user-specified GPU layers: ${gpuLayers}`);
    } else {
      // Auto-detect based on model size
      const modelSizeMB = modelInfo.size / (1024 * 1024);
      if (modelSizeMB > 8000) { // Models larger than 8GB
        gpuLayers = 32; // Use only 32 layers on GPU
        console.log(`Large model detected (${modelSizeMB.toFixed(0)}MB), using ${gpuLayers} GPU layers for better performance`);
      } else if (modelSizeMB > 4000) { // Models larger than 4GB
        gpuLayers = 40; // Use 40 layers on GPU
        console.log(`Medium model detected (${modelSizeMB.toFixed(0)}MB), using ${gpuLayers} GPU layers`);
      } else {
        console.log(`Small model detected (${modelSizeMB.toFixed(0)}MB), using all GPU layers (-1)`);
      }
    }

    const model = await llama.loadModel({
      modelPath: modelInfo.path,
      gpuLayers: gpuLayers,
    });

    // Calculate safe context size based on current VRAM state
    let contextSize = settings.contextSize || modelInfo.contextLength || 4096;
    // Always validate context size against available VRAM
    const safeContextSize = await this.calculateSafeContextSize(
      modelInfo.size,
      contextSize,
      modelInfo.filename
    );
    
    // Update settings if we had to reduce the context size
    if (safeContextSize !== contextSize) {
      console.log(`Updating context size from ${contextSize} to ${safeContextSize}`);
      this.setModelSettings(modelId, { ...settings, contextSize: safeContextSize });
    }
    
    contextSize = safeContextSize;
    
    // Calculate appropriate batch size based on context and available memory
    const batchSize = settings.batchSize || this.calculateOptimalBatchSize(contextSize, modelInfo.size);
    const threads = settings.threads || Math.max(1, Math.floor(os.cpus().length / 2));
    const context = await model.createContext({
      contextSize: contextSize,
      // Configure for better async performance
      batchSize: batchSize, // Smaller batches for better responsiveness
      threads: threads, // Use half CPU cores to leave room for main thread
    });

    const session = new LlamaChatSession({
      contextSequence: context.getSequence(),
    });

    const loadingTime = Date.now() - startTime;
    
    // Create runtime info
    const runtimeInfo: ModelRuntimeInfo = {
      actualGpuLayers: gpuLayers,
      gpuType: llama.gpu || 'none',
      loadingTime: loadingTime,
      // TODO: Add memory usage detection if available
    };

    this.activeModels.set(modelId, { model, context, session, runtimeInfo });
    
    console.log(`Model loaded successfully: ${modelInfo.name}`);
    console.log(`Loading took ${loadingTime}ms with ${gpuLayers === -1 ? 'all' : gpuLayers} GPU layers`);
  }

  /**
   * Unload a model
   */
  async unloadModel(modelId: string): Promise<void> {
    const activeModel = this.activeModels.get(modelId);
    if (!activeModel) {
      return; // Not loaded
    }

    activeModel.context.dispose();
    this.activeModels.delete(modelId);
    console.log(`Model unloaded: ${modelId}`);
  }

  /**
   * Find model ID by name (filename without extension)
   */
  private async findModelIdByName(modelName: string): Promise<string | null> {
    const models = await this.getLocalModels();
    const model = models.find(m => m.name === modelName || m.filename === modelName);
    return model ? model.id : null;
  }

  /**
   * Generate response using a loaded model (supports both model ID and model name)
   */
  async generateResponse(
    modelIdOrName: string,
    messages: Array<{ role: string; content: string }>,
    options?: {
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<string> {
    // Removed verbose logging - only log errors and important events

    // First try to use it as an ID
    let activeModel = this.activeModels.get(modelIdOrName);
    
    // If not found, try to find by name
    if (!activeModel) {
      const modelId = await this.findModelIdByName(modelIdOrName);
      if (modelId) {
        activeModel = this.activeModels.get(modelId);
      }
    }
    
    if (!activeModel) {
      logger.error('Model not loaded', { modelIdOrName, activeModelKeys: Array.from(this.activeModels.keys()) });
      throw new Error('Model not loaded. Please load the model first.');
    }

    // Removed verbose logging

    // Use proper chat session with message history
    const { session } = activeModel;
    
    // Process messages in order to build conversation context
    let systemMessage = '';
    let lastUserMessage = '';
    
    for (const message of messages) {
      if (message.role === 'system') {
        systemMessage = message.content;
      } else if (message.role === 'user') {
        lastUserMessage = message.content;
      } else if (message.role === 'assistant') {
        // Previous assistant responses are part of conversation history
        // The session should maintain this context automatically
        continue;
      }
    }
    
    if (!lastUserMessage) {
      logger.error('No user message found in messages', { messages });
      throw new Error('No user message found');
    }

    // For LlamaChatSession, combine system and user message without chat formatting
    // The session.prompt() method handles chat formatting internally
    const finalPrompt = systemMessage 
      ? `${systemMessage}\n\n${lastUserMessage}` 
      : lastUserMessage;

    // Removed verbose logging

    // Removed verbose logging

    const response = await session.prompt(finalPrompt, {
      temperature: options?.temperature || 0.7,
      maxTokens: options?.maxTokens || 2048,
      // Enable async processing with yielding to prevent blocking
      onToken: async () => {
        // Yield control to event loop periodically during generation
        if (Math.random() < 0.1) { // 10% chance to yield control
          await new Promise(resolve => setImmediate(resolve));
        }
      }
    });

    // Removed verbose logging

    return response;
  }

  /**
   * Generate streaming response (supports both model ID and model name)
   */
  async *generateStreamResponse(
    modelIdOrName: string,
    messages: Array<{ role: string; content: string }>,
    options?: {
      temperature?: number;
      maxTokens?: number;
    }
  ): AsyncGenerator<string> {
    // First try to use it as an ID
    let activeModel = this.activeModels.get(modelIdOrName);
    
    // If not found, try to find by name
    if (!activeModel) {
      const modelId = await this.findModelIdByName(modelIdOrName);
      if (modelId) {
        activeModel = this.activeModels.get(modelId);
      }
    }
    
    if (!activeModel) {
      throw new Error('Model not loaded. Please load the model first.');
    }

    // Use proper chat session with message history
    const { session } = activeModel;
    
    // Process messages to build conversation context (same as non-streaming method)
    let systemMessage = '';
    let lastUserMessage = '';
    
    for (const message of messages) {
      if (message.role === 'system') {
        systemMessage = message.content;
      } else if (message.role === 'user') {
        lastUserMessage = message.content;
      } else if (message.role === 'assistant') {
        // Previous assistant responses are part of conversation history
        // The session should maintain this context automatically
        continue;
      }
    }
    
    if (!lastUserMessage) {
      throw new Error('No user message found');
    }

    // For LlamaChatSession, combine system and user message (same as non-streaming method)
    const finalPrompt = systemMessage 
      ? `${systemMessage}\n\n${lastUserMessage}` 
      : lastUserMessage;

    // Generate streaming response with async yielding to prevent blocking
    const response = await session.prompt(finalPrompt, {
      temperature: options?.temperature || 0.7,
      maxTokens: options?.maxTokens || 2048,
      // Enable async processing with yielding to prevent blocking
      onToken: async () => {
        // Yield control to event loop during generation
        await new Promise(resolve => setImmediate(resolve));
      }
    });
    
    // Simulate streaming by yielding characters/words with small delays
    const words = response.split(' ');
    let currentText = '';
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      currentText += (i === 0 ? '' : ' ') + word;
      
      // Yield word by word for more realistic streaming
      yield (i === 0 ? '' : ' ') + word;
      
      // Add a small delay to simulate real streaming and yield control (only if not the last word)
      if (i < words.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 50)); // 50ms delay between words
      }
      
      // Yield control to event loop every few words to prevent blocking
      if (i % 3 === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }
  }

  /**
   * Get model info and status
   */
  async getModelStatus(modelId: string): Promise<{
    loaded: boolean;
    info?: LocalModelInfo;
  }> {
    const models = await this.getLocalModels();
    const info = models.find(m => m.id === modelId);
    
    return {
      loaded: this.activeModels.has(modelId),
      info
    };
  }

  /**
   * Parse model filename to extract metadata
   */
  private parseModelFilename(filename: string): {
    name?: string;
    contextLength?: number;
    parameterCount?: string;
    quantization?: string;
  } {
    const lower = filename.toLowerCase();
    
    let name = filename.replace('.gguf', '');
    let contextLength: number | undefined;
    let parameterCount: string | undefined;
    let quantization: string | undefined;

    // Extract parameter count
    const paramMatch = filename.match(/(\d+\.?\d*)B/i);
    if (paramMatch) {
      parameterCount = paramMatch[1] + 'B';
    }

    // Enhanced quantization extraction
    const quantPatterns = [
      /(Q\d+_[A-Z]+_?[A-Z]*)/i,
      /(IQ\d+_[A-Z]+_?[A-Z]*)/i,
      /(Q\d+)/i,
      /(IQ\d+)/i,
      /(f16|f32|fp16|fp32)/i
    ];
    
    for (const pattern of quantPatterns) {
      const match = filename.match(pattern);
      if (match) {
        quantization = match[1].toUpperCase();
        break;
      }
    }
    
    // Default quantization for GGUF files if none detected
    if (!quantization && lower.includes('.gguf')) {
      quantization = 'F16';
    }

    // Extract context length (if specified)
    const contextMatch = filename.match(/(\d+)k/i);
    if (contextMatch) {
      contextLength = parseInt(contextMatch[1]) * 1024;
    }

    return {
      name,
      contextLength,
      parameterCount,
      quantization
    };
  }

  /**
   * Cancel a download
   */
  cancelDownload(filename: string): boolean {
    const controller = this.downloadControllers.get(filename);
    if (controller) {
      controller.abort();
      return true;
    }
    return false;
  }

  /**
   * Get download progress for a model
   */
  getDownloadProgress(filename: string): { isDownloading: boolean; progress: number; speed?: string } {
    const isDownloading = this.downloadingModels.has(filename);
    const progressInfo = this.downloadProgress.get(filename);
    
    return {
      isDownloading,
      progress: progressInfo?.progress || 0,
      speed: progressInfo?.speed
    };
  }

  /**
   * Format download speed
   */
  private formatSpeed(bytesPerSecond: number): string {
    const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    let speed = bytesPerSecond;
    let unitIndex = 0;

    while (speed >= 1024 && unitIndex < units.length - 1) {
      speed /= 1024;
      unitIndex++;
    }

    return `${speed.toFixed(1)} ${units[unitIndex]}`;
  }


}
