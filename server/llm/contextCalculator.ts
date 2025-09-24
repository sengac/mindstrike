// LlamaModel type is used in interfaces but not directly in this file
import { sharedLlamaInstance } from '../sharedLlamaInstance';
import type { SystemInformation } from '../systemInfoManager';
import { systemInfoManager } from '../systemInfoManager';
import { LLMResourceCalculator } from '../utils/system/llmResourceCalculator';
import type { LocalModelInfo, ModelLoadingSettings } from '../localLlmManager';
import { logger } from '../logger';

export interface ContextSizeResult {
  contextSize: number;
  gpuLayers: number;
  batchSize: number;
}

export interface ModelResourceInfo {
  blockCount: number;
  trainCtx: number;
  headCountMax: number;
  headCountKVMin: number;
  supportsFlashAttention: boolean;
  supportsKVCacheType: (type: string) => boolean;
  modelSize?: number;
}

export class ContextCalculator {
  private readonly contextSizeCache = new Map<
    string,
    { contextSize: number; timestamp: number }
  >();
  private readonly cacheExpirationMs = 5 * 60 * 1000; // 5 minutes

  /**
   * Clear the context size cache
   */
  clearCache(): void {
    this.contextSizeCache.clear();
  }

  /**
   * Calculate a safe context size based on available VRAM
   */
  async calculateSafeContextSize(
    modelSizeBytes: number,
    requestedContextSize: number,
    filename: string
  ): Promise<number> {
    // Cache key based on model size and requested context
    const cacheKey = `${filename}-${modelSizeBytes}-${requestedContextSize}`;
    const cached = this.contextSizeCache.get(cacheKey);

    // Use cache if less than expiration time
    if (cached && Date.now() - cached.timestamp < this.cacheExpirationMs) {
      return cached.contextSize;
    }

    try {
      const llama = await sharedLlamaInstance.getLlama();
      const vramState = await llama.getVramState();

      // Model metadata estimates (will be improved with actual GGUF metadata)
      const estimatedConfig = {
        hidden_size: 4096, // typical for 9B models
        num_hidden_layers: 48, // typical layer count
        num_attention_heads: 32, // typical ratio
        num_key_value_heads: 8, // typical GQA ratio
      };

      // Use actual free VRAM instead of estimating model usage
      const availableVramBytes = vramState.free * 0.8; // Reserve 80% of free VRAM

      // Calculate context memory for requested size
      const requestedContextMemory = this.calculateContextMemory(
        requestedContextSize,
        estimatedConfig
      );

      // If it fits in available VRAM, use it
      if (requestedContextMemory <= availableVramBytes) {
        this.contextSizeCache.set(cacheKey, {
          contextSize: requestedContextSize,
          timestamp: Date.now(),
        });
        return requestedContextSize;
      }

      // Binary search for the largest context that fits
      const bestSize = this.binarySearchContextSize(
        availableVramBytes,
        requestedContextSize,
        estimatedConfig
      );

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

      // Don't use a fallback - throw error to expose the problem
      throw new Error(
        `Cannot determine safe context size: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Calculate context memory requirements
   */
  private calculateContextMemory(
    context: number,
    config: {
      hidden_size: number;
      num_hidden_layers: number;
      num_attention_heads: number;
      num_key_value_heads: number;
    }
  ): number {
    // KV Cache calculation
    const kvCache = this.calculateKVCache(context, config);

    // Input Buffer calculation
    const inputBuffer = this.calculateInputBuffer(context, config.hidden_size);

    // Compute Buffer calculation
    const computeBuffer = this.calculateComputeBuffer(
      context,
      config.num_attention_heads
    );

    return kvCache + inputBuffer + computeBuffer;
  }

  /**
   * Calculate KV cache memory
   */
  private calculateKVCache(
    context: number,
    config: {
      hidden_size: number;
      num_hidden_layers: number;
      num_attention_heads: number;
      num_key_value_heads: number;
    }
  ): number {
    const n_gqa = config.num_attention_heads / config.num_key_value_heads;
    const n_embd_gqa = config.hidden_size / n_gqa;
    const n_elements = n_embd_gqa * (config.num_hidden_layers * context);
    const size = 2 * n_elements;
    return size * (16 / 8); // 16-bit cache
  }

  /**
   * Calculate input buffer memory
   */
  private calculateInputBuffer(
    context: number,
    hiddenSize: number,
    bsz = 512
  ): number {
    const inp_tokens = bsz;
    const inp_embd = hiddenSize * bsz;
    const inp_pos = bsz;
    const inp_KQ_mask = context * bsz;
    const inp_K_shift = context;
    const inp_sum = bsz;
    return (
      inp_tokens + inp_embd + inp_pos + inp_KQ_mask + inp_K_shift + inp_sum
    );
  }

  /**
   * Calculate compute buffer memory
   */
  private calculateComputeBuffer(
    context: number,
    numAttentionHeads: number
  ): number {
    return ((context / 1024) * 2 + 0.75) * numAttentionHeads * 1024 * 1024;
  }

  /**
   * Binary search for optimal context size
   */
  private binarySearchContextSize(
    availableVramBytes: number,
    maxContext: number,
    config: {
      hidden_size: number;
      num_hidden_layers: number;
      num_attention_heads: number;
      num_key_value_heads: number;
    }
  ): number {
    let low = 512;
    let high = maxContext;
    let bestSize = 512;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const midMemory = this.calculateContextMemory(mid, config);

      if (midMemory <= availableVramBytes) {
        bestSize = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return bestSize;
  }

  /**
   * Calculate optimal GPU layers AND batch size using LLMResourceCalculator
   */
  async calculateOptimalGpuAndBatchSettings(
    modelInfo: LocalModelInfo,
    contextSize: number,
    systemInfo?: SystemInformation
  ): Promise<{ optimalGpuLayers: number; optimalBatchSize: number }> {
    try {
      // Get system info if not provided
      const sysInfo = systemInfo ?? (await systemInfoManager.getSystemInfo());

      // Convert to calculator format
      const { cpus, gpus } = this.convertToCalculatorFormat(sysInfo);
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
      if (config.numGPU === 0 || !sysInfo.hasGpu) {
        console.log('Falling back to CPU-only mode');
        return {
          optimalGpuLayers: 0,
          optimalBatchSize: await this.calculateCpuBatchSize(
            modelInfo,
            contextSize,
            sysInfo
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

  /**
   * Calculate optimal context size based on available memory and model characteristics
   */
  async calculateOptimalContextSize(
    modelInfo: LocalModelInfo
  ): Promise<number> {
    const modelMaxContext =
      modelInfo.maxContextLength ?? modelInfo.trainedContextLength;

    // Convert to calculator format
    const calcModelInfo = this.createModelInfo(modelInfo);

    // Get default options to start with reasonable context
    const defaultOptions = LLMResourceCalculator.getDefaultOptions();

    // Use model's max context if available, otherwise use a reasonable default
    const requestedContext = modelMaxContext ?? defaultOptions.numCtx;

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
   * Calculate CPU-specific batch size
   */
  private async calculateCpuBatchSize(
    modelInfo: LocalModelInfo,
    contextSize: number,
    systemInfo: SystemInformation
  ): Promise<number> {
    const modelSizeGB = modelInfo.size / (1024 * 1024 * 1024);
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
      availableForBatch += vramFreeGB * 0.3;
    }

    // Reserve some memory for system operations
    availableForBatch = Math.max(0, availableForBatch - 1.0);

    // Calculate batch size based on available memory
    const memoryPerTokenBatch =
      (estimatedParams * bytesPerParam) / (1024 * 1024); // MB per token in batch
    const maxBatchSize = Math.floor(
      (availableForBatch * 1024) / memoryPerTokenBatch
    );

    // CPU-specific constraints
    const cpuOptimalBatch = Math.min(maxBatchSize, 512);
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
        efficiencyCoreCount: 0, // Assume all are performance cores
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
        name: systemInfo.gpuType ?? 'Unknown GPU',
        variant: '',
      });
    }

    return { cpus, gpus };
  }

  /**
   * Create model info for the calculator from our model data
   */
  private createModelInfo(modelInfo: LocalModelInfo): ModelResourceInfo {
    // Estimate model layers based on size if not available
    const modelSizeGB = modelInfo.size / (1024 * 1024 * 1024);
    const estimatedLayers =
      modelInfo.layerCount ??
      Math.max(32, Math.min(80, Math.floor(modelSizeGB * 8)));

    return {
      blockCount: estimatedLayers,
      trainCtx:
        modelInfo.trainedContextLength ?? modelInfo.maxContextLength ?? 4096,
      headCountMax: 32, // Common default
      headCountKVMin: 8, // Common GQA ratio
      supportsFlashAttention: true, // Assume modern architecture
      supportsKVCacheType: (type: string) => type === 'f16',
      modelSize: modelInfo.size, // Pass actual model size in bytes
    };
  }

  /**
   * Get fallback GPU layers when calculation fails
   */
  private getFallbackGpuLayers(): number {
    return 0; // Safe fallback: use CPU-only mode
  }

  /**
   * Get fallback batch size based on model characteristics
   */
  private getFallbackBatchSize(
    modelInfo: LocalModelInfo,
    contextSize: number
  ): number {
    const modelSizeMB = modelInfo.size / (1024 * 1024);

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
   * Calculate optimal settings for a model
   */
  async calculateOptimalSettings(
    modelInfo: LocalModelInfo,
    userSettings: ModelLoadingSettings = {}
  ): Promise<ModelLoadingSettings> {
    const systemInfo = await systemInfoManager.getSystemInfo();

    // Calculate optimal context size
    const defaultContextSize =
      await this.calculateOptimalContextSize(modelInfo);

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

    // User settings override defaults completely
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
}
