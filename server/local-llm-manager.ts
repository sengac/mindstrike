import {
  LlamaModel,
  LlamaContext,
  LlamaChatSession,
  readGgufFileInfo,
  ChatHistoryItem,
  defineChatSessionFunction,
} from 'node-llama-cpp';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

import { getLocalModelsDirectory } from './utils/settings-directory.js';
import { modelFetcher, DynamicModelInfo } from './model-fetcher.js';
import { logger } from './logger.js';
import { modelSettingsManager } from './utils/model-settings-manager.js';
import { systemInfoManager, SystemInformation } from './system-info-manager.js';
import { LLMResourceCalculator } from './utils/system/llm-resource-calculator.js';
import { sharedLlamaInstance } from './shared-llama-instance.js';
import { parentPort } from 'worker_threads';
import { MCPTool } from './mcp-manager.js';

interface MCPToolsResponse {
  id: string;
  type: 'mcpToolsResponse';
  data: MCPTool[];
}

interface MCPToolExecutionResponse {
  id: string;
  type: 'mcpToolExecutionResponse';
  data: MCPToolResult | MCPToolResult[];
}

interface MCPToolResult {
  type: string;
  text?: string;
  [key: string]: unknown;
}

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
  private activeModels = new Map<
    string,
    {
      model: LlamaModel;
      context: LlamaContext;
      session: LlamaChatSession;
      runtimeInfo: ModelRuntimeInfo;
    }
  >();

  private downloadingModels = new Set<string>();
  private downloadControllers = new Map<string, AbortController>();
  private downloadProgress = new Map<
    string,
    { progress: number; speed: string }
  >();
  private modelSettings = new Map<string, ModelLoadingSettings>();
  private contextSizeCache = new Map<
    string,
    { contextSize: number; timestamp: number }
  >();
  private loadingLocks = new Map<string, Promise<void>>();

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

    // Load model settings from persistent storage
    this.loadModelSettingsFromDisk();
  }

  /**
   * Get MCP tools from main thread via postMessage
   */
  private async getMCPTools(): Promise<MCPTool[]> {
    return new Promise(resolve => {
      // Request MCP tools from main thread
      const messageId = Date.now().toString();

      const handleMessage = (message: MCPToolsResponse) => {
        if (message.id === messageId && message.type === 'mcpToolsResponse') {
          parentPort?.removeListener('message', handleMessage);
          resolve(message.data);
        }
      };

      parentPort?.on('message', handleMessage);

      // Send request to main thread
      parentPort?.postMessage({
        id: messageId,
        type: 'mcpToolsRequest',
      });
    });
  }

  /**
   * Convert MCP tools to node-llama-cpp function format with Anthropic-style tool call returns
   */
  private convertMCPToolsToNodeLlamaFormat(
    mcpTools: MCPTool[],
    pushChunk?: Function
  ): Record<string, ReturnType<typeof defineChatSessionFunction>> {
    const functions: Record<
      string,
      ReturnType<typeof defineChatSessionFunction>
    > = {};

    if (!mcpTools || !mcpTools.length) {
      return functions;
    }

    for (const tool of mcpTools) {
      const functionDef = defineChatSessionFunction({
        description: tool.description || `Execute ${tool.name} tool`,
        params: tool.inputSchema || {
          type: 'object',
          properties: {},
        },
        async handler(params: unknown) {
          console.log(
            '[LocalLLMManager] Tool call requested for:',
            tool.name,
            'with params:',
            params
          );

          // Return tool call in Anthropic format (DO NOT EXECUTE)
          const toolCall = {
            type: 'tool_use',
            id: Date.now().toString(),
            name: tool.name,
            input: params || {},
          };

          console.log(
            '[LocalLLMManager] Returning tool call in Anthropic format:',
            toolCall
          );
          // if (typeof pushChunk === 'function') {
          //   pushChunk('```json\n' + JSON.stringify(toolCall) + '\n```');
          // }
          return JSON.stringify(toolCall);
        },
      });

      functions[tool.name] = functionDef;
    }

    return functions;
  }

  /**
   * Calculate a safe context size based on available VRAM
   */
  private async calculateSafeContextSize(
    modelSizeBytes: number,
    requestedContextSize: number,
    filename: string
  ): Promise<number> {
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
      const llama = await sharedLlamaInstance.getLlama();
      const vramState = await llama.getVramState();

      // Get model metadata to use the proper VRAM calculation formulas
      // We need: hidden_size, num_hidden_layers, num_attention_heads, num_key_value_heads
      // For now, estimate these from model size (we'll improve this later with GGUF metadata)

      // Rough estimates for a 9B model based on typical architectures
      const estimatedConfig = {
        hidden_size: 4096, // typical for 9B models
        num_hidden_layers: 48, // you mentioned 48 layers
        num_attention_heads: 32, // typical ratio
        num_key_value_heads: 8, // typical GQA ratio
      };

      // Use the actual VRAM calculation formulas from the HuggingFace calculator:

      // 1. KV Cache calculation
      const kvCache = (context: number) => {
        const n_gqa =
          estimatedConfig.num_attention_heads /
          estimatedConfig.num_key_value_heads;
        const n_embd_gqa = estimatedConfig.hidden_size / n_gqa;
        const n_elements =
          n_embd_gqa * (estimatedConfig.num_hidden_layers * context);
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
        return (
          inp_tokens + inp_embd + inp_pos + inp_KQ_mask + inp_K_shift + inp_sum
        );
      };

      // 3. Compute Buffer calculation
      const computeBuffer = (context: number) => {
        return (
          ((context / 1024) * 2 + 0.75) *
          estimatedConfig.num_attention_heads *
          1024 *
          1024
        );
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
        this.contextSizeCache.set(cacheKey, {
          contextSize: requestedContextSize,
          timestamp: Date.now(),
        });
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
      this.contextSizeCache.set(cacheKey, {
        contextSize: bestSize,
        timestamp: Date.now(),
      });
      return bestSize;
    } catch (error) {
      console.error(
        `Error calculating safe context size: ${error instanceof Error ? error.message : 'Unknown error'}`
      );

      // Don't use a fallback - this hides the real problem
      // Instead, throw the error so we can see what's actually failing
      throw new Error(
        `Cannot determine safe context size: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
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
      const matchingRemoteModel = remoteModels.find(
        rm => rm.filename === filename
      );

      // Try to read GGUF metadata for layer count and context length
      let layerCount: number | undefined;
      let maxContextLength: number | undefined;
      try {
        const ggufInfo = await readGgufFileInfo(fullPath);
        if (ggufInfo.metadata) {
          const metadata = ggufInfo.metadata as {
            llama?: { block_count?: number; context_length?: number };
            [key: string]: unknown;
          };
          if (metadata.llama) {
            layerCount = metadata.llama.block_count;
            maxContextLength = metadata.llama.context_length;
          } else {
            // Try other common architecture names
            const architectures = ['llama', 'mistral', 'gpt', 'qwen'];
            for (const arch of architectures) {
              const archData = metadata[arch] as
                | { block_count?: number; context_length?: number }
                | undefined;
              if (archData) {
                if (archData.block_count) {
                  layerCount = archData.block_count;
                }
                if (archData.context_length) {
                  maxContextLength = archData.context_length;
                }
                if (layerCount || maxContextLength) {
                  break;
                }
              }
            }
          }
        }
      } catch {
        // Silently fail - metadata is optional
      }

      // Get user settings for this model
      const userSettings = await this.getModelSettings(id);

      // Always calculate safe context size based on available VRAM
      const requestedContextSize =
        userSettings.contextSize ||
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
        contextSize: actualContextLength,
      };

      models.push({
        id,
        name:
          matchingRemoteModel?.name ||
          modelInfo.name ||
          filename.replace('.gguf', ''),
        filename,
        path: fullPath,
        size: stats.size,
        downloaded: true,
        downloading: false,
        contextLength: actualContextLength,
        parameterCount:
          matchingRemoteModel?.parameterCount || modelInfo.parameterCount,
        quantization:
          matchingRemoteModel?.quantization || modelInfo.quantization,
        layerCount,
        maxContextLength,
        loadingSettings: updatedSettings,
      });
    }

    return models;
  }

  /**
   * Get available models for download (dynamic from Hugging Face)
   */
  async getAvailableModels(): Promise<
    (ModelDownloadInfo | DynamicModelInfo)[]
  > {
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
  async searchModels(
    query: string
  ): Promise<(ModelDownloadInfo | DynamicModelInfo)[]> {
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
        'User-Agent': 'mindstrike-local-llm/1.0',
      };

      try {
        const { modelFetcher } = await import('./model-fetcher.js');
        if (modelFetcher.hasHuggingFaceToken()) {
          // Note: We don't expose the actual token, just check if it exists
          const fs = await import('fs/promises');
          const path = await import('path');
          const { getMindstrikeDirectory } = await import(
            './utils/settings-directory.js'
          );

          const tokenFile = path.join(getMindstrikeDirectory(), 'hf-token');
          const token = await fs.readFile(tokenFile, 'utf-8');
          headers['Authorization'] = `Bearer ${token.trim()}`;
        }
      } catch {
        logger.debug('No Hugging Face token available for download');
      }

      const response = await fetch(modelInfo.url, {
        signal: abortController.signal,
        headers,
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

        if (totalSize > 0 && timeDiff >= 1000) {
          // Update every second
          const progress = (downloadedBytes / totalSize) * 100;
          const bytesDiff = downloadedBytes - lastBytes;
          const speed = this.formatSpeed(bytesDiff / (timeDiff / 1000));

          this.downloadProgress.set(filename, {
            progress: Math.round(progress),
            speed,
          });

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
  async setModelSettings(
    modelId: string,
    settings: ModelLoadingSettings
  ): Promise<void> {
    this.modelSettings.set(modelId, settings);
    await modelSettingsManager.saveModelSettings(modelId, settings);
  }

  /**
   * Convert SystemInformation to LLMResourceCalculator format
   */
  private convertToCalculatorFormat(systemInfo: SystemInformation): {
    cpus: Array<{ coreCount: number; efficiencyCoreCount: number }>;
    gpus: Array<{
      id: string;
      library: string;
      totalMemory: number;
      freeMemory: number;
      minimumMemory: number;
      driverMajor: number;
      driverMinor: number;
      compute: string;
      name: string;
      variant: string;
    }>;
  } {
    const cpus = [
      {
        coreCount: systemInfo.cpuThreads,
        efficiencyCoreCount: 0, // We don't have efficiency core info, so assume all are performance cores
      },
    ];

    const gpus = [];
    if (
      systemInfo.hasGpu &&
      systemInfo.vramState &&
      systemInfo.vramState.total > 0
    ) {
      gpus.push({
        id: '0',
        library:
          systemInfo.gpuType === 'NVIDIA'
            ? 'cuda'
            : systemInfo.gpuType === 'AMD'
              ? 'rocm'
              : systemInfo.gpuType === 'Apple'
                ? 'metal'
                : 'cpu',
        totalMemory: systemInfo.vramState.total,
        freeMemory: systemInfo.vramState.free,
        minimumMemory: 1024 * 1024 * 1024, // 1GB minimum
        driverMajor: 12, // Assume modern driver
        driverMinor: 0,
        compute: '8.0', // Assume modern compute capability
        name: systemInfo.gpuType || 'Unknown GPU',
        variant: '',
      });
    }

    return { cpus, gpus };
  }

  /**
   * Create model info for the calculator from our model data
   */
  private createModelInfo(modelInfo: LocalModelInfo): {
    blockCount: number;
    trainCtx: number;
    headCountMax: number;
    headCountKVMin: number;
    supportsFlashAttention: boolean;
    supportsKVCacheType: (type: string) => boolean;
    modelSize?: number;
  } {
    // Estimate model layers based on size if not available
    const modelSizeGB = modelInfo.size / (1024 * 1024 * 1024);
    const estimatedLayers =
      modelInfo.layerCount ||
      Math.max(32, Math.min(80, Math.floor(modelSizeGB * 8)));

    return {
      blockCount: estimatedLayers,
      trainCtx: modelInfo.maxContextLength || modelInfo.contextLength || 4096,
      headCountMax: 32, // Common default
      headCountKVMin: 8, // Common GQA ratio
      supportsFlashAttention: true, // Assume modern architecture
      supportsKVCacheType: (type: string) => type === 'f16',
      modelSize: modelInfo.size, // Pass actual model size in bytes
    };
  }

  /**
   * Calculate optimal GPU layers AND batch size using LLMResourceCalculator
   */
  private async calculateOptimalGpuAndBatchSettings(
    modelInfo: LocalModelInfo,
    contextSize: number,
    systemInfo: SystemInformation
  ): Promise<{ optimalGpuLayers: number; optimalBatchSize: number }> {
    try {
      // Convert to calculator format
      const { cpus, gpus } = this.convertToCalculatorFormat(systemInfo);
      const calcModelInfo = this.createModelInfo(modelInfo);

      // Use LLMResourceCalculator to get optimal configuration
      const config = LLMResourceCalculator.calculateOptimalConfig(
        cpus,
        gpus,
        calcModelInfo,
        {
          numCtx: contextSize,
          numBatch: 512, // Default batch size
          numGPU: -1, // Always use auto-calculation for optimal GPU layers
        }
      );

      if (config.numGPU === -1) {
        console.error(
          'ERROR: LLMResourceCalculator returned -1 for numGPU - this should not happen!'
        );
      }

      // Handle fallback to CPU if no GPU layers can be loaded
      if (config.numGPU === 0 || !systemInfo.hasGpu) {
        console.log('Falling back to CPU-only mode');
        return {
          optimalGpuLayers: 0,
          optimalBatchSize: await this.calculateCpuBatchSize(
            modelInfo,
            contextSize,
            systemInfo
          ),
        };
      }

      return {
        optimalGpuLayers: config.numGPU,
        optimalBatchSize: config.numBatch,
      };
    } catch (error) {
      console.warn('Failed to calculate optimal GPU/batch settings:', error);
      return {
        optimalGpuLayers: this.getFallbackGpuLayers(),
        optimalBatchSize: this.getFallbackBatchSize(modelInfo, contextSize),
      };
    }
  }

  private async calculateCpuBatchSize(
    modelInfo: LocalModelInfo,
    contextSize: number,
    systemInfo: SystemInformation
  ): Promise<number> {
    const modelSizeGB = modelInfo.size / (1024 * 1024) / 1024;
    const estimatedParams = modelSizeGB * 0.5; // Rough param estimation

    // Calculate context memory requirements
    const bytesPerParam = 2; // FP16
    const contextMemoryGB =
      (contextSize * estimatedParams * bytesPerParam) / (1024 * 1024 * 1024);

    // Calculate available memory for batch processing
    let availableForBatch = systemInfo.freeRAM - modelSizeGB - contextMemoryGB;

    // If we have VRAM, we can use some of that for batch processing
    if (systemInfo.hasGpu && systemInfo.vramState) {
      const vramFreeGB = systemInfo.vramState.free / (1024 * 1024 * 1024);
      // Use a portion of available VRAM for batch processing
      availableForBatch += vramFreeGB * 0.3;
    }

    // Reserve some memory for system operations
    availableForBatch = Math.max(0, availableForBatch - 1.0); // Reserve 1GB

    // Calculate batch size based on available memory
    const memoryPerTokenBatch =
      (estimatedParams * bytesPerParam) / (1024 * 1024); // MB per token in batch
    const maxBatchSize = Math.floor(
      (availableForBatch * 1024) / memoryPerTokenBatch
    );

    // CPU-specific constraints
    const cpuOptimalBatch = Math.min(maxBatchSize, 512); // CPU doesn't benefit from huge batches
    const finalBatchSize = Math.max(1, cpuOptimalBatch);

    console.log(`CPU Batch Size Calculation:
      Model Size: ${modelSizeGB.toFixed(1)}GB
      Context Size: ${contextSize} tokens
      Context Memory: ${contextMemoryGB.toFixed(2)}GB
      Free RAM: ${systemInfo.freeRAM.toFixed(1)}GB
      VRAM Available: ${systemInfo.vramState ? (systemInfo.vramState.free / (1024 * 1024 * 1024)).toFixed(1) : 0}GB
      Available for Batch: ${availableForBatch.toFixed(1)}GB
      Memory per Token (batch): ${memoryPerTokenBatch.toFixed(2)}MB
      Max Batch Size: ${maxBatchSize}
      Final Batch Size: ${finalBatchSize}`);

    return finalBatchSize;
  }

  private getFallbackGpuLayers(): number {
    // Don't return -1 as fallback - calculate a reasonable estimate
    // This is used when the advanced calculation fails
    return 0; // Safe fallback: use CPU-only mode
  }

  private getFallbackBatchSize(
    modelInfo: LocalModelInfo,
    contextSize: number
  ): number {
    const modelSizeMB = modelInfo.size / (1024 * 1024);

    // More reasonable fallback batch sizes based on model size and context
    if (modelSizeMB > 15000) {
      // Very large models (>15GB)
      return contextSize > 8192 ? 1024 : 2048;
    } else if (modelSizeMB > 8000) {
      // Large models (8-15GB)
      return contextSize > 8192 ? 2048 : 4096;
    } else if (modelSizeMB > 4000) {
      // Medium models (4-8GB)
      return contextSize > 8192 ? 4096 : 8192;
    } else {
      // Small models (<4GB)
      return contextSize > 8192 ? 8192 : 16384;
    }
  }

  /**
   * Calculate optimal context size based on available memory and model characteristics
   */
  private async calculateOptimalContextSize(
    modelInfo: LocalModelInfo,
    systemInfo: SystemInformation
  ): Promise<number> {
    const modelMaxContext = modelInfo.contextLength;

    // Convert to calculator format
    const { cpus, gpus } = this.convertToCalculatorFormat(systemInfo);
    const calcModelInfo = this.createModelInfo(modelInfo);

    // Get default options to start with reasonable context
    const defaultOptions = LLMResourceCalculator.getDefaultOptions();

    // Use model's max context if available, otherwise use a reasonable default
    const requestedContext = modelMaxContext || defaultOptions.numCtx;

    // Validate context size using LLMResourceCalculator
    const validatedContext = LLMResourceCalculator.validateContextSize(
      requestedContext,
      calcModelInfo.trainCtx
    );

    // Ensure minimum viable context
    const optimalContext = Math.max(512, validatedContext);

    return optimalContext;
  }

  /**
   * Calculate optimal settings for a model (used by reset button)
   */
  async calculateOptimalSettings(
    modelId: string
  ): Promise<ModelLoadingSettings> {
    const models = await this.getLocalModels();
    const modelInfo = models.find(m => m.id === modelId);

    if (!modelInfo) {
      throw new Error(`Model not found: ${modelId}`);
    }

    // Use the same logic as mergeSettingsWithDefaults but with empty user settings
    const emptyUserSettings: ModelLoadingSettings = {};
    return await this.mergeSettingsWithDefaults(emptyUserSettings, modelInfo);
  }

  /**
   * Merge user settings with intelligent defaults
   * USER SETTINGS ALWAYS TAKE PRECEDENCE
   */
  private async mergeSettingsWithDefaults(
    userSettings: ModelLoadingSettings,
    modelInfo: LocalModelInfo
  ): Promise<ModelLoadingSettings> {
    // Get system information once for all calculations
    const systemInfo = await systemInfoManager.getSystemInfo();

    // Calculate optimal context size based on available memory and model characteristics
    const defaultContextSize = await this.calculateOptimalContextSize(
      modelInfo,
      systemInfo
    );

    const { optimalGpuLayers, optimalBatchSize } =
      await this.calculateOptimalGpuAndBatchSettings(
        modelInfo,
        defaultContextSize,
        systemInfo
      );

    const defaults = {
      gpuLayers: optimalGpuLayers,
      contextSize: defaultContextSize,
      batchSize: optimalBatchSize,
      threads: systemInfo.cpuThreads,
      temperature: 0.7,
    };

    // User settings override defaults completely - NEVER auto-override user choices
    // Special case: if user set gpuLayers to -1, use the calculated optimal value
    const effective = {
      gpuLayers:
        userSettings.gpuLayers === -1
          ? defaults.gpuLayers
          : (userSettings.gpuLayers ?? defaults.gpuLayers),
      contextSize: userSettings.contextSize ?? defaults.contextSize,
      batchSize: userSettings.batchSize ?? defaults.batchSize,
      threads: userSettings.threads ?? defaults.threads,
      temperature: userSettings.temperature ?? defaults.temperature,
    };

    // Log what we're using and why
    if (userSettings.gpuLayers === -1) {
      console.log(
        `AUTO-CALCULATED GPU layers: ${effective.gpuLayers} (user set -1 for auto)`
      );
    } else if (userSettings.gpuLayers !== undefined) {
      logger.info(`Using USER-SET GPU layers: ${effective.gpuLayers}`);
    }

    if (userSettings.contextSize !== undefined) {
      logger.info(`Using USER-SET context size: ${effective.contextSize}`);
    }

    return effective;
  }

  /**
   * Get loading settings for a model
   */
  async getModelSettings(modelId: string): Promise<ModelLoadingSettings> {
    // First check in-memory cache
    const cached = this.modelSettings.get(modelId);
    if (cached) {
      return cached;
    }

    // Load from persistent storage
    const persisted = await modelSettingsManager.loadModelSettings(modelId);
    if (persisted) {
      this.modelSettings.set(modelId, persisted);
      return persisted;
    }

    return {};
  }

  /**
   * Load model settings from persistent storage
   */
  private async loadModelSettingsFromDisk(): Promise<void> {
    try {
      const allSettings = await modelSettingsManager.loadAllModelSettings();
      for (const [modelId, settings] of Object.entries(allSettings)) {
        this.modelSettings.set(modelId, settings);
      }
    } catch (error) {
      console.error('Error loading model settings from disk:', error);
    }
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
  async loadModel(modelIdOrName: string, threadId?: string): Promise<void> {
    // Try to find by ID first
    let modelInfo: LocalModelInfo | undefined = undefined;
    const models = await this.getLocalModels();

    modelInfo = models.find(m => m.id === modelIdOrName);

    // If not found by ID, try by name
    if (!modelInfo) {
      modelInfo = models.find(
        m => m.name === modelIdOrName || m.filename === modelIdOrName
      );
    }

    if (!modelInfo) {
      throw new Error('Model not found');
    }

    // Use the actual model ID for storage
    const modelId = modelInfo.id;

    if (this.activeModels.has(modelId)) {
      return; // Already loaded
    }

    // Check if this model is already being loaded
    if (this.loadingLocks.has(modelId)) {
      console.log(
        `Model ${modelInfo.name} is already being loaded, waiting...`
      );
      await this.loadingLocks.get(modelId);
      return;
    }

    // Create a loading promise and store it in the lock map
    const loadingPromise = this._doLoadModel(modelId, modelInfo, threadId);
    this.loadingLocks.set(modelId, loadingPromise);

    try {
      await loadingPromise;
    } finally {
      // Always clean up the lock when done
      this.loadingLocks.delete(modelId);
    }
  }

  /**
   * Internal method that does the actual model loading
   */
  private async _doLoadModel(
    modelId: string,
    modelInfo: LocalModelInfo,
    threadId?: string
  ): Promise<void> {
    // Unload all other models first to free up memory
    // This ensures only one local model is loaded at a time
    const otherModelIds = Array.from(this.activeModels.keys()).filter(
      id => id !== modelId
    );
    for (const otherModelId of otherModelIds) {
      console.log(`Unloading previous model: ${otherModelId}`);
      await this.unloadModel(otherModelId);
    }

    logger.info(`Loading model: ${modelInfo.name}`);
    logger.info(
      `Model file size: ${(modelInfo.size / (1024 * 1024)).toFixed(2)} MB`
    );

    const startTime = Date.now();

    // Use shared llama instance
    const llama = await sharedLlamaInstance.getLlama();

    logger.info(`Available GPU: ${llama.gpu}`);
    if (modelInfo.layerCount) {
      console.log(`Model has ${modelInfo.layerCount} layers`);
    }

    // PROPER SETTINGS LOGIC:
    // 1. Load existing settings to see what user has explicitly set
    const existingSettings = await this.getModelSettings(modelId);

    // 2. Determine effective values - user settings take absolute precedence
    const effectiveSettings = await this.mergeSettingsWithDefaults(
      existingSettings,
      modelInfo
    );

    logger.info(`Existing settings for ${modelId}:`, existingSettings);
    logger.info(`Effective settings:`, effectiveSettings);

    // 3. Load the model with effective settings
    const model = await llama.loadModel({
      modelPath: modelInfo.path,
      gpuLayers: effectiveSettings.gpuLayers,
    });

    // 4. Use effective settings for context creation
    const contextSize = effectiveSettings.contextSize!; // guaranteed to have value from defaults

    // 5. NEVER override user-set values, only warn if potentially problematic
    if (existingSettings.contextSize && contextSize > 8192) {
      console.warn(
        `User set high context size ${contextSize} - may cause VRAM issues`
      );
    }

    // Use effective settings for all parameters
    const batchSize = effectiveSettings.batchSize;
    const threads = effectiveSettings.threads;

    // Create context and session using shared method
    const { context, session } = await this.createSessionForModel(
      model,
      contextSize,
      batchSize!,
      threads!
    );

    // Populate session with existing conversation history if thread ID is provided
    if (threadId) {
      await this.populateSessionWithHistory(session, threadId);
    }

    const loadingTime = Date.now() - startTime;

    // Create runtime info
    const runtimeInfo: ModelRuntimeInfo = {
      actualGpuLayers: effectiveSettings.gpuLayers,
      gpuType: llama.gpu || 'none',
      loadingTime: loadingTime,
    };

    this.activeModels.set(modelId, { model, context, session, runtimeInfo });

    logger.info(`Model loaded successfully: ${modelInfo.name}`);
    logger.info(
      `Loading took ${loadingTime}ms with ${effectiveSettings.gpuLayers === -1 ? 'all' : effectiveSettings.gpuLayers} GPU layers`
    );

    // Update system info to get accurate VRAM state
    const { systemInfoManager } = await import('./system-info-manager.js');
    await systemInfoManager.getSystemInfo();
  }

  /**
   * Update session history for a specific thread
   */
  async updateSessionHistory(
    modelIdOrName: string,
    threadId: string
  ): Promise<void> {
    // First try to use it as an ID
    let activeModel = this.activeModels.get(modelIdOrName);
    if (!activeModel) {
      // Try to find by name
      const modelId = await this.findModelIdByName(modelIdOrName);
      if (modelId) {
        activeModel = this.activeModels.get(modelId);
      }
    }

    if (!activeModel) {
      // Model not loaded, silently skip session update
      return;
    }

    await this.populateSessionWithHistory(activeModel.session, threadId);
  }

  /**
   * Populate a LlamaChatSession with existing conversation history
   * Only includes messages that have been fully processed (status: 'completed')
   * Excludes any unprocessed messages to prevent LLM confusion
   */
  private async populateSessionWithHistory(
    session: LlamaChatSession,
    threadId: string
  ): Promise<void> {
    try {
      // Clear existing chat history first to ensure clean state
      session.setChatHistory([]);

      // Import ConversationManager to get thread history
      const { ConversationManager } = await import('./conversation-manager.js');
      const { getWorkspaceRoot } = await import(
        './utils/settings-directory.js'
      );

      const workspaceRoot = await getWorkspaceRoot();
      if (!workspaceRoot) {
        logger.error('No workspace root found');
        return;
      }
      const conversationManager = new ConversationManager(workspaceRoot);
      await conversationManager.load();

      const allMessages = conversationManager.getThreadMessages(threadId);

      if (allMessages.length === 0) {
        logger.info(`No existing history found for thread ${threadId}`);
        return;
      }

      // Filter to only include completed messages to avoid LLM confusion
      // This excludes any messages with status 'processing' or 'cancelled'
      const completedMessages = allMessages.filter(
        msg => msg.status === 'completed'
      );

      if (completedMessages.length === 0) {
        logger.info(`No completed messages found for thread ${threadId}`);
        return;
      }

      // Convert completed messages to the format expected by LlamaChatSession
      const chatHistory: ChatHistoryItem[] = completedMessages.map(msg => {
        if (msg.role === 'user') {
          return {
            type: 'user' as const,
            text: msg.content,
          };
        } else {
          return {
            type: 'model' as const,
            response: [msg.content],
          };
        }
      });

      // Set the chat history in the session
      // Remove the last user message if it has no model response to prevent duplication
      if (
        chatHistory.length > 0 &&
        chatHistory[chatHistory.length - 1].type === 'user'
      ) {
        chatHistory.pop();
      }
      session.setChatHistory(chatHistory);

      logger.info(
        `Populated session with ${chatHistory.length} completed messages from thread ${threadId} (filtered ${allMessages.length - completedMessages.length} unprocessed messages)`
      );
    } catch (error) {
      logger.error(
        `Failed to populate session with history for thread ${threadId}:`,
        error
      );
      // Don't throw - continue with empty session rather than failing model load
    }
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

    // Force system info refresh after model unloading to update VRAM state
    const { systemInfoManager } = await import('./system-info-manager.js');
    systemInfoManager.invalidateCache();
    // Get fresh system info to update VRAM state
    await systemInfoManager.getSystemInfo();
  }

  /**
   * Find model ID by name (filename without extension)
   */
  private async findModelIdByName(modelName: string): Promise<string | null> {
    const models = await this.getLocalModels();
    const model = models.find(
      m => m.name === modelName || m.filename === modelName
    );
    return model ? model.id : null;
  }

  /**
   * Create a new session for an existing model
   */
  private async createSessionForModel(
    model: LlamaModel,
    contextSize: number,
    batchSize: number,
    threads?: number,
    systemPrompt?: string
  ): Promise<{ context: LlamaContext; session: LlamaChatSession }> {
    const context = await model.createContext({
      contextSize: contextSize,
      batchSize: batchSize,
      threads: threads,
    });

    const session = new LlamaChatSession({
      contextSequence: context.getSequence(),
      systemPrompt: systemPrompt,
    });

    return { context, session };
  }

  /**
   * Recreate llama session and reload chat history
   */
  private async recreateSession(
    modelIdOrName: string,
    threadId?: string
  ): Promise<void> {
    console.log(`Recreating session for model: ${modelIdOrName}`);

    // First try to use it as an ID
    let activeModel = this.activeModels.get(modelIdOrName);
    let actualModelId = modelIdOrName;

    // If not found, try to find by name
    if (!activeModel) {
      const modelId = await this.findModelIdByName(modelIdOrName);
      if (modelId) {
        activeModel = this.activeModels.get(modelId);
        actualModelId = modelId;
      }
    }

    if (!activeModel) {
      throw new Error('Model not found for session recreation');
    }

    // Save current chat history
    const currentHistory = activeModel.session.getChatHistory();
    console.log(`Saved ${currentHistory.length} chat history items`);

    // Get current context settings
    const contextSize = activeModel.context.contextSize;
    const batchSize = activeModel.context.batchSize;
    const threads = activeModel.context.currentThreads;

    // Dispose old session and context
    activeModel.session.dispose();
    activeModel.context.dispose();

    // Create new context and session using shared method
    const { context: newContext, session: newSession } =
      await this.createSessionForModel(
        activeModel.model,
        contextSize,
        batchSize,
        threads // preserve threads configuration from model settings
      );

    // Populate session with thread history if threadId is provided
    if (threadId) {
      await this.populateSessionWithHistory(newSession, threadId);
    }

    // Update active model with new context and session
    this.activeModels.set(actualModelId, {
      model: activeModel.model,
      context: newContext,
      session: newSession,
      runtimeInfo: activeModel.runtimeInfo,
    });

    // Note: No need to manually reload chat history here since populateSessionWithHistory
    // already loaded the thread history into the new session

    console.log(`Session recreated successfully for model: ${modelIdOrName}`);
  }

  /**
   * Generate response using a loaded model (supports both model ID and model name)
   */
  async generateResponse(
    modelIdOrName: string,
    previousMessages: Array<{ role: string; content: string }>,
    options?: {
      temperature?: number;
      maxTokens?: number;
      threadId?: string;
      disableFunctions?: boolean;
      disableChatHistory?: boolean;
    }
  ): Promise<string> {
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
      // Try to load the model with thread ID if provided
      if (options?.threadId) {
        await this.loadModel(modelIdOrName, options.threadId);
        activeModel = this.activeModels.get(modelIdOrName);
        if (!activeModel) {
          const modelId = await this.findModelIdByName(modelIdOrName);
          if (modelId) {
            activeModel = this.activeModels.get(modelId);
          }
        }
      }

      if (!activeModel) {
        logger.error('Model not loaded', {
          modelIdOrName,
          activeModelKeys: Array.from(this.activeModels.keys()),
        });
        throw new Error('Model not loaded. Please load the model first.');
      }
    }

    // Use proper chat session with message history
    let { session } = activeModel;

    // Extract user message
    let message = '';

    for (const messagePrevious of previousMessages) {
      if (messagePrevious.role === 'user') {
        message = messagePrevious.content;
      }
    }

    if (!message) {
      throw new Error('No user message found');
    }

    // Get MCP tools and convert them to node-llama-cpp format only if functions are enabled
    let functions = {};
    if (!options?.disableFunctions) {
      const mcpTools = await this.getMCPTools();
      functions = this.convertMCPToolsToNodeLlamaFormat(mcpTools);
    }

    // Mark inference start to prevent system info queries during generation
    sharedLlamaInstance.markInferenceStart();

    console.log('CURRENT CHAT HISTORY (NO STREAM)', session.getChatHistory());

    // Save current chat history if disableChatHistory is true
    let initialChatHistory: ChatHistoryItem[] | undefined;
    if (options?.disableChatHistory) {
      initialChatHistory = session.getChatHistory();
    }

    try {
      const response = await session.prompt(message, {
        temperature: options?.temperature || 0.7,
        maxTokens: options?.maxTokens || 2048,
        functions, // Pass MCP tools as functions
        // Enable async processing with yielding to prevent blocking
        onToken: async () => {
          // Yield control to event loop periodically during generation
          if (Math.random() < 0.1) {
            // 10% chance to yield control
            await new Promise(resolve => setImmediate(resolve));
          }
        },
      });

      // Reset chat history to before the prompt if disableChatHistory is true
      if (options?.disableChatHistory && initialChatHistory) {
        session.setChatHistory(initialChatHistory);
      }

      return response;
    } catch (error) {
      console.error(
        'Error during generateResponse, recreating session for next time:',
        error
      );

      // Recreate session and reload chat history to ensure clean state for next chat
      try {
        await this.recreateSession(modelIdOrName, options?.threadId);
        console.log('Session recreated successfully for future chats');
      } catch (recreateError) {
        console.error('Failed to recreate session:', recreateError);
      }

      // Re-throw the original error
      throw error;
    } finally {
      // Mark inference end to process any queued system info requests
      sharedLlamaInstance.markInferenceEnd();
    }
  }

  /**
   * Generate streaming response (supports both model ID and model name)
   */
  async *generateStreamResponse(
    modelIdOrName: string,
    previousMessages: Array<{ role: string; content: string }>,
    options?: {
      temperature?: number;
      maxTokens?: number;
      signal?: AbortSignal;
      threadId?: string;
      disableFunctions?: boolean;
      disableChatHistory?: boolean;
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
      // Try to load the model with thread ID if provided
      if (options?.threadId) {
        await this.loadModel(modelIdOrName, options.threadId);
        activeModel = this.activeModels.get(modelIdOrName);
        if (!activeModel) {
          const modelId = await this.findModelIdByName(modelIdOrName);
          if (modelId) {
            activeModel = this.activeModels.get(modelId);
          }
        }
      }

      if (!activeModel) {
        throw new Error('Model not loaded. Please load the model first.');
      }
    }

    // Use proper chat session with message history
    let { session } = activeModel;

    // Extract last user message
    let message = '';

    for (const previousMessage of previousMessages) {
      if (previousMessage.role === 'user') {
        message = previousMessage.content;
      }
    }

    if (!message) {
      throw new Error('No user message found');
    }

    // Generate streaming response with real-time streaming
    let resolveChunk: ((chunk: string | null) => void) | null = null;
    let chunkQueue: Array<string | null> = [];

    const getNextChunk = (): Promise<string | null> => {
      if (chunkQueue.length > 0) {
        return Promise.resolve(chunkQueue.shift()!);
      }
      return new Promise(resolve => {
        resolveChunk = resolve;
      });
    };

    const pushChunk = (chunk: string | null) => {
      if (resolveChunk) {
        resolveChunk(chunk);
        resolveChunk = null;
      } else {
        chunkQueue.push(chunk);
      }
    };

    // Get MCP tools and convert them to node-llama-cpp format only if functions are enabled
    let functions = {};
    if (!options?.disableFunctions) {
      const mcpTools = await this.getMCPTools();
      functions = this.convertMCPToolsToNodeLlamaFormat(mcpTools, pushChunk);
    }

    // Mark inference start to prevent system info queries during generation
    sharedLlamaInstance.markInferenceStart();

    // Save current chat history if disableChatHistory is true
    let initialChatHistory: ChatHistoryItem[] | undefined;
    if (options?.disableChatHistory) {
      initialChatHistory = session.getChatHistory();
    }

    console.log('CURRENT CHAT HISTORY (STREAMING)', session.getChatHistory());

    try {
      // Start the prompt asynchronously
      const promptPromise = session
        .prompt(message, {
          temperature: options?.temperature || 0.7,
          maxTokens: options?.maxTokens || 2048,
          functions, // Pass MCP tools as functions
          onTextChunk: (chunk: string) => {
            pushChunk(chunk);
          },
        })
        .then(() => {
          // Reset chat history to before the prompt if disableChatHistory is true
          if (options?.disableChatHistory && initialChatHistory) {
            session.setChatHistory(initialChatHistory);
          }
          // Signal end of stream
          pushChunk(null);
        })
        .catch(async error => {
          console.error(
            'Error during generateStreamResponse, recreating session for next time:',
            error
          );

          // Recreate session and reload chat history to ensure clean state for next chat
          try {
            await this.recreateSession(modelIdOrName, options?.threadId);
            console.log('Session recreated successfully for future chats');
          } catch (recreateError) {
            console.error('Failed to recreate session:', recreateError);
          }

          // Signal end of stream and re-throw the original error
          pushChunk(null);
          throw error;
        });

      // Yield chunks as they arrive
      let chunk: string | null;
      while ((chunk = await getNextChunk()) !== null) {
        // Check for cancellation
        if (options?.signal?.aborted) {
          throw new Error('Generation cancelled');
        }
        yield chunk;
      }

      // Wait for prompt to complete
      await promptPromise;
    } finally {
      // Mark inference end to process any queued system info requests
      sharedLlamaInstance.markInferenceEnd();
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
      info,
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
      /(f16|f32|fp16|fp32)/i,
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
      quantization,
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
  getDownloadProgress(filename: string): {
    isDownloading: boolean;
    progress: number;
    speed?: string;
  } {
    const isDownloading = this.downloadingModels.has(filename);
    const progressInfo = this.downloadProgress.get(filename);

    return {
      isDownloading,
      progress: progressInfo?.progress || 0,
      speed: progressInfo?.speed,
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
