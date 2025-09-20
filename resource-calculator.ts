/**
 * Resource Calculator - TypeScript implementation
 */

interface CPUInfo {
  coreCount: number;
  efficiencyCoreCount: number;
}

interface GpuInfo {
  id: string;
  library: string; // "cuda", "rocm", "metal", "cpu"
  totalMemory: number;
  freeMemory: number;
  minimumMemory: number;
  driverMajor: number;
  driverMinor: number;
  compute: string;
  name: string;
  variant: string;
}

interface ModelInfo {
  blockCount: number;
  trainCtx: number;
  headCountMax: number;
  headCountKVMin: number;
  supportsFlashAttention: boolean;
  supportsKVCacheType: (type: string) => boolean;
}

interface Options {
  numCtx: number;
  numBatch: number;
  numGPU: number;
  numThread: number;
  temperature: number;
  topK: number;
  topP: number;
  repeatPenalty: number;
}

interface MemoryEstimate {
  layers: number;
  graph: number;
  vramSize: number;
  totalSize: number;
  tensorSplit: string;
  gpuSizes: number[];
  fullyLoaded: boolean;
}

class ResourceCalculator {
  private static readonly GPU_OVERHEAD_DEFAULT = 0;
  private static readonly FLASH_ATTENTION_ENABLED = false;
  private static readonly CONTEXT_LENGTH_DEFAULT = 4096;

  /**
   * Calculate optimal thread count based on CPU cores
   * Based on discover/types.go:158-169
   */
  static getOptimalThreadCount(cpus: CPUInfo[]): number {
    if (cpus.length === 0) {
      return 0;
    }

    let coreCount = 0;
    for (const cpu of cpus) {
      // Use performance cores only (exclude efficiency cores)
      coreCount += cpu.coreCount - cpu.efficiencyCoreCount;
    }

    return coreCount;
  }

  /**
   * Get default options for model inference
   * Based on api/types.go:652-677
   */
  static getDefaultOptions(): Options {
    return {
      numCtx: this.CONTEXT_LENGTH_DEFAULT,
      numBatch: 512,
      numGPU: -1, // -1 indicates dynamic GPU layer calculation
      numThread: 0, // 0 lets runtime decide
      temperature: 0.8,
      topK: 40,
      topP: 0.9,
      repeatPenalty: 1.1,
    };
  }

  /**
   * Validate and adjust context size based on model training context
   * Based on llm/server.go:144-146
   */
  static validateContextSize(
    requestedCtx: number,
    modelTrainCtx: number,
    numParallel: number = 1
  ): number {
    if (requestedCtx / numParallel > modelTrainCtx && modelTrainCtx > 0) {
      console.warn(
        `Requested context size ${requestedCtx} too large for model (train_ctx: ${modelTrainCtx})`
      );
      return modelTrainCtx * numParallel;
    }
    return requestedCtx;
  }

  /**
   * Check if flash attention is supported by GPU
   * Based on discover/types.go:172-180
   */
  static flashAttentionSupported(gpus: GpuInfo[]): boolean {
    for (const gpu of gpus) {
      const supportsFA =
        gpu.library === 'metal' ||
        (gpu.library === 'cuda' && gpu.driverMajor >= 7) ||
        gpu.library === 'rocm';

      if (!supportsFA) {
        return false;
      }
    }
    return true;
  }

  /**
   * Estimate GPU layers that can be loaded
   * Simplified version of llm/memory.go:74-361
   */
  static estimateGPULayers(
    gpus: GpuInfo[],
    modelInfo: ModelInfo,
    options: Options,
    numParallel: number = 1
  ): MemoryEstimate {
    const overhead = this.GPU_OVERHEAD_DEFAULT;

    // Calculate layer size estimate (simplified)
    const layerSize = Math.floor(modelInfo.blockCount * 1024 * 1024 * 100); // ~100MB per layer estimate

    // Calculate KV cache size
    const kvCacheSize = this.calculateKVCacheSize(
      options.numCtx,
      options.numBatch,
      numParallel
    );

    // Calculate graph sizes
    const graphPartialOffload = this.calculateGraphSize(
      modelInfo,
      options.numCtx,
      false
    );
    const graphFullOffload = this.calculateGraphSize(
      modelInfo,
      options.numCtx,
      true
    );

    // Filter GPUs that have enough memory for at least one layer
    const viableGpus = gpus.filter(gpu => {
      const requiredMemory =
        overhead +
        gpu.minimumMemory +
        layerSize * 2 +
        Math.max(graphPartialOffload, graphFullOffload);
      return gpu.freeMemory >= requiredMemory;
    });

    if (viableGpus.length === 0) {
      return {
        layers: 0,
        graph: 0,
        vramSize: 0,
        totalSize: layerSize * modelInfo.blockCount,
        tensorSplit: '',
        gpuSizes: [],
        fullyLoaded: false,
      };
    }

    // Distribute layers across GPUs
    let layerCount = 0;
    const gpuAllocations = new Array(viableGpus.length).fill(0);
    const layerCounts = new Array(viableGpus.length).fill(0);

    // Initialize GPU allocations with minimum memory
    viableGpus.forEach((gpu, i) => {
      gpuAllocations[i] = gpu.minimumMemory + layerSize;
    });

    // Distribute layers
    for (let i = modelInfo.blockCount - 1; i >= 0; i--) {
      if (options.numGPU >= 0 && layerCount >= options.numGPU) {
        break;
      }

      // Find GPU with most available space
      let bestGpu = -1;
      let bestAvailable = 0;

      for (let j = 0; j < viableGpus.length; j++) {
        const used =
          gpuAllocations[j] + Math.max(graphPartialOffload, graphFullOffload);
        const available = viableGpus[j].freeMemory - overhead - used;

        if (available >= layerSize && available > bestAvailable) {
          bestGpu = j;
          bestAvailable = available;
        }
      }

      if (bestGpu >= 0) {
        gpuAllocations[bestGpu] += layerSize;
        layerCounts[bestGpu]++;
        layerCount++;
      } else {
        break;
      }
    }

    const fullyLoaded = layerCount >= modelInfo.blockCount;
    const graphSize = fullyLoaded ? graphFullOffload : graphPartialOffload;

    // Add graph allocation to each GPU with layers
    viableGpus.forEach((_, i) => {
      if (layerCounts[i] > 0) {
        gpuAllocations[i] += graphSize;
      }
    });

    const totalVRAM = gpuAllocations.reduce((sum, alloc) => sum + alloc, 0);
    const tensorSplit = viableGpus.length > 1 ? layerCounts.join(',') : '';

    return {
      layers: layerCount,
      graph: graphSize,
      vramSize: totalVRAM,
      totalSize: layerSize * modelInfo.blockCount,
      tensorSplit,
      gpuSizes: gpuAllocations,
      fullyLoaded,
    };
  }

  /**
   * Calculate KV cache size based on context and batch size
   */
  private static calculateKVCacheSize(
    numCtx: number,
    numBatch: number,
    numParallel: number
  ): number {
    // Simplified KV cache calculation
    // Real implementation depends on model architecture
    return numCtx * numBatch * numParallel * 8; // bytes per token estimate
  }

  /**
   * Calculate graph size for computation
   */
  private static calculateGraphSize(
    modelInfo: ModelInfo,
    numCtx: number,
    fullOffload: boolean
  ): number {
    // Simplified graph size calculation
    const baseSize = numCtx * 1024; // Base computation graph size

    if (fullOffload) {
      return baseSize * 2; // Full offload needs more memory
    }

    // Partial offload calculation
    const headsKV = modelInfo.headCountKVMin || 1;
    const gqa = modelInfo.headCountMax / headsKV;

    return Math.floor((baseSize * gqa) / 6);
  }

  /**
   * Calculate optimal configuration for a model
   */
  static calculateOptimalConfig(
    cpus: CPUInfo[],
    gpus: GpuInfo[],
    modelInfo: ModelInfo,
    userOptions: Partial<Options> = {}
  ): Options & { estimate: MemoryEstimate } {
    const defaultOptions = this.getDefaultOptions();
    const options = { ...defaultOptions, ...userOptions };

    // Calculate optimal thread count if not specified
    if (options.numThread === 0) {
      options.numThread = this.getOptimalThreadCount(cpus);
    }

    // Validate context size
    options.numCtx = this.validateContextSize(
      options.numCtx,
      modelInfo.trainCtx
    );

    // Estimate GPU layers
    const estimate = this.estimateGPULayers(gpus, modelInfo, options);

    // Auto-set GPU layers if requested
    if (options.numGPU < 0 && estimate.layers > 0) {
      options.numGPU = estimate.layers;
    }

    return { ...options, estimate };
  }
}

// Example usage
function example() {
  const cpus: CPUInfo[] = [
    { coreCount: 12, efficiencyCoreCount: 4 }, // 8 performance cores
  ];

  const gpus: GpuInfo[] = [
    {
      id: '0',
      library: 'cuda',
      totalMemory: 24 * 1024 * 1024 * 1024, // 24GB
      freeMemory: 20 * 1024 * 1024 * 1024, // 20GB free
      minimumMemory: 1024 * 1024 * 1024, // 1GB minimum
      driverMajor: 12,
      driverMinor: 0,
      compute: '8.9',
      name: 'RTX 4090',
      variant: '',
    },
  ];

  const modelInfo: ModelInfo = {
    blockCount: 32,
    trainCtx: 4096,
    headCountMax: 32,
    headCountKVMin: 8,
    supportsFlashAttention: true,
    supportsKVCacheType: (type: string) => type === 'f16',
  };

  const config = ResourceCalculator.calculateOptimalConfig(
    cpus,
    gpus,
    modelInfo,
    { numCtx: 8192 } // User wants 8k context
  );

  console.log('Optimal Configuration:');
  console.log(`- Context Size: ${config.numCtx}`);
  console.log(`- Batch Size: ${config.numBatch}`);
  console.log(`- Thread Count: ${config.numThread}`);
  console.log(`- GPU Layers: ${config.numGPU}`);
  console.log(
    `- Estimated VRAM: ${Math.round(config.estimate.vramSize / 1024 / 1024 / 1024)}GB`
  );
  console.log(`- Fully Loaded: ${config.estimate.fullyLoaded}`);
  console.log(`- Tensor Split: ${config.estimate.tensorSplit || 'N/A'}`);
}

export { ResourceCalculator, example };
