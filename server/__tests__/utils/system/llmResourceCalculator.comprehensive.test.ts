/**
 * Comprehensive tests for LLM Resource Calculator
 * Tests GPU memory allocation and resource optimization for LLM inference
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LLMResourceCalculator,
  example,
} from '../../../utils/system/llmResourceCalculator.js';
import type {
  CPUInfo,
  GpuInfo,
  ModelInfo,
  Options,
  MemoryEstimate,
} from '../../../utils/system/llmResourceCalculator.js';
import {
  mockGPUConfigurations,
  mockModelConfigurations,
  expectedResults,
  performanceBenchmarks,
} from '../../fixtures/systemTestData.js';

// Create compatible CPU configurations
const createResourceCPU = (
  cores: number,
  efficiencyCores: number = 0
): CPUInfo => ({
  coreCount: cores,
  efficiencyCoreCount: efficiencyCores,
});

const testCPUConfigurations = {
  intel12thGen: createResourceCPU(12, 4),
  amdRyzen: createResourceCPU(16, 0),
  appleM2: createResourceCPU(10, 4),
  lowEnd: createResourceCPU(4, 0),
  serverCPU: createResourceCPU(28, 0),
};

describe('LLMResourceCalculator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getOptimalThreadCount', () => {
    it('should return 0 for empty CPU array', () => {
      const result = LLMResourceCalculator.getOptimalThreadCount([]);
      expect(result).toBe(0);
    });

    it('should calculate optimal threads using performance cores only', () => {
      const cpus = [testCPUConfigurations.intel12thGen];
      const result = LLMResourceCalculator.getOptimalThreadCount(cpus);

      expect(result).toBe(8); // 12 total - 4 efficiency = 8 performance cores
    });

    it('should handle CPUs without efficiency cores', () => {
      const cpus = [testCPUConfigurations.amdRyzen];
      const result = LLMResourceCalculator.getOptimalThreadCount(cpus);

      expect(result).toBe(16); // All cores are performance cores
    });

    it('should aggregate across multiple CPUs', () => {
      const cpus = [
        testCPUConfigurations.intel12thGen,
        testCPUConfigurations.amdRyzen,
      ];
      const result = LLMResourceCalculator.getOptimalThreadCount(cpus);

      expect(result).toBe(24); // 8 + 16 performance cores
    });

    it('should handle edge case of all efficiency cores', () => {
      const efficiencyOnlyCPU = createResourceCPU(8, 8);
      const result = LLMResourceCalculator.getOptimalThreadCount([
        efficiencyOnlyCPU,
      ]);

      expect(result).toBe(0); // No performance cores available
    });
  });

  describe('getDefaultOptions', () => {
    it('should return valid default configuration', () => {
      const options = LLMResourceCalculator.getDefaultOptions();

      expect(options).toMatchObject({
        numCtx: 4096,
        numBatch: 512,
        numGPU: -1, // Auto-calculate
        numThread: 0, // Auto-calculate
        temperature: 0.8,
        topK: 40,
        topP: 0.9,
        repeatPenalty: 1.1,
      });

      // Validate types and ranges
      expect(typeof options.numCtx).toBe('number');
      expect(typeof options.numBatch).toBe('number');
      expect(typeof options.temperature).toBe('number');
      expect(options.numCtx).toBeGreaterThan(0);
      expect(options.numBatch).toBeGreaterThan(0);
      expect(options.temperature).toBeGreaterThan(0);
      expect(options.topK).toBeGreaterThan(0);
      expect(options.topP).toBeGreaterThan(0);
      expect(options.topP).toBeLessThanOrEqual(1);
      expect(options.repeatPenalty).toBeGreaterThan(0);
    });
  });

  describe('validateContextSize', () => {
    it('should return requested context when within model limits', () => {
      const requestedCtx = 2048;
      const modelTrainCtx = 4096;

      const result = LLMResourceCalculator.validateContextSize(
        requestedCtx,
        modelTrainCtx
      );
      expect(result).toBe(requestedCtx);
    });

    it('should cap context to model training context when exceeded', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const requestedCtx = 8192;
      const modelTrainCtx = 4096;

      const result = LLMResourceCalculator.validateContextSize(
        requestedCtx,
        modelTrainCtx
      );
      expect(result).toBe(modelTrainCtx);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          `Requested context size ${requestedCtx} too large`
        )
      );

      consoleSpy.mockRestore();
    });

    it('should handle parallel processing correctly', () => {
      const requestedCtx = 8192;
      const modelTrainCtx = 4096;
      const numParallel = 2;

      const result = LLMResourceCalculator.validateContextSize(
        requestedCtx,
        modelTrainCtx,
        numParallel
      );
      expect(result).toBe(modelTrainCtx * numParallel); // 4096 * 2 = 8192
    });

    it('should handle zero or negative model training context', () => {
      const requestedCtx = 2048;
      const modelTrainCtx = 0;

      const result = LLMResourceCalculator.validateContextSize(
        requestedCtx,
        modelTrainCtx
      );
      expect(result).toBe(requestedCtx); // Should not validate when modelTrainCtx is 0
    });

    it('should handle edge cases with large parallel counts', () => {
      const requestedCtx = 1000;
      const modelTrainCtx = 4096;
      const numParallel = 10;

      // requestedCtx / numParallel = 100, which is less than modelTrainCtx
      const result = LLMResourceCalculator.validateContextSize(
        requestedCtx,
        modelTrainCtx,
        numParallel
      );
      expect(result).toBe(requestedCtx);
    });
  });

  describe('flashAttentionSupported', () => {
    it('should return true for Metal GPUs', () => {
      const gpus = [mockGPUConfigurations.appleMetalM2];
      const result = LLMResourceCalculator.flashAttentionSupported(gpus);
      expect(result).toBe(true);
    });

    it('should return true for modern CUDA GPUs', () => {
      const gpus = [mockGPUConfigurations.rtx4090];
      const result = LLMResourceCalculator.flashAttentionSupported(gpus);
      expect(result).toBe(true);
    });

    it('should return false for older CUDA GPUs', () => {
      const oldGPU: GpuInfo = {
        ...mockGPUConfigurations.rtx3080,
        driverMajor: 6, // Below required version 7
        driverMinor: 5,
      };

      const gpus = [oldGPU];
      const result = LLMResourceCalculator.flashAttentionSupported(gpus);
      expect(result).toBe(false);
    });

    it('should return true for ROCm GPUs', () => {
      const gpus = [mockGPUConfigurations.amdRX6800XT];
      const result = LLMResourceCalculator.flashAttentionSupported(gpus);
      expect(result).toBe(true);
    });

    it('should return false if any GPU does not support flash attention', () => {
      const modernGPU = mockGPUConfigurations.rtx4090;
      const oldGPU: GpuInfo = {
        ...mockGPUConfigurations.rtx3080,
        driverMajor: 6, // Does not support flash attention
      };

      const gpus = [modernGPU, oldGPU];
      const result = LLMResourceCalculator.flashAttentionSupported(gpus);
      expect(result).toBe(false);
    });

    it('should return true for empty GPU array (edge case)', () => {
      const result = LLMResourceCalculator.flashAttentionSupported([]);
      expect(result).toBe(true); // Vacuous truth
    });
  });

  describe('estimateGPULayers', () => {
    const defaultOptions: Options = LLMResourceCalculator.getDefaultOptions();

    it('should fully load small model on high-memory GPU', () => {
      const gpus = [mockGPUConfigurations.rtx4090];
      const model = mockModelConfigurations.llama7b;

      const estimate = LLMResourceCalculator.estimateGPULayers(
        gpus,
        model,
        defaultOptions
      );

      expect(estimate.layers).toBe(model.blockCount);
      expect(estimate.fullyLoaded).toBe(true);
      expect(estimate.vramSize).toBeGreaterThan(0);
      expect(estimate.vramSize).toBeLessThan(gpus[0].freeMemory);
    });

    it('should partially load large model on limited GPU memory', () => {
      const gpus = [mockGPUConfigurations.rtx3080]; // 10GB GPU
      const model = mockModelConfigurations.llama70b; // 70B model

      const estimate = LLMResourceCalculator.estimateGPULayers(
        gpus,
        model,
        defaultOptions
      );

      // A 70B model is ~140GB, so even 10GB can only fit a few layers
      expect(estimate.layers).toBeGreaterThan(0);
      expect(estimate.layers).toBeLessThan(model.blockCount);
      expect(estimate.fullyLoaded).toBe(false);
    });

    it('should return zero layers when GPU memory is insufficient', () => {
      const tinyGPU: GpuInfo = {
        ...mockGPUConfigurations.lowMemoryGPU,
        freeMemory: 512 * 1024 * 1024, // Only 512MB free
      };

      const gpus = [tinyGPU];
      const model = mockModelConfigurations.llama13b;

      const estimate = LLMResourceCalculator.estimateGPULayers(
        gpus,
        model,
        defaultOptions
      );

      expect(estimate.layers).toBe(0);
      expect(estimate.fullyLoaded).toBe(false);
      expect(estimate.vramSize).toBe(0);
    });

    it('should distribute layers across multiple GPUs', () => {
      const gpus = mockGPUConfigurations.multiGPU;
      const model = mockModelConfigurations.llama13b;

      const estimate = LLMResourceCalculator.estimateGPULayers(
        gpus,
        model,
        defaultOptions
      );

      expect(estimate.layers).toBeGreaterThan(0);
      expect(estimate.gpuSizes).toHaveLength(gpus.length);
      expect(estimate.tensorSplit).toBeTruthy();

      // Verify both GPUs are utilized
      expect(estimate.gpuSizes[0]).toBeGreaterThan(0);
      expect(estimate.gpuSizes[1]).toBeGreaterThan(0);
    });

    it('should respect numGPU limit when specified', () => {
      const gpus = [mockGPUConfigurations.rtx4090];
      const model = mockModelConfigurations.llama7b;
      const options = { ...defaultOptions, numGPU: 16 }; // Limit to 16 layers

      const estimate = LLMResourceCalculator.estimateGPULayers(
        gpus,
        model,
        options
      );

      expect(estimate.layers).toBeLessThanOrEqual(16);
    });

    it('should handle models with grouped query attention (GQA)', () => {
      const gpus = [mockGPUConfigurations.rtx4090];
      const model = mockModelConfigurations.llama70b; // Has GQA (8 KV heads vs 64 query heads)

      const estimate = LLMResourceCalculator.estimateGPULayers(
        gpus,
        model,
        defaultOptions
      );

      expect(estimate).toBeDefined();
      expect(estimate.layers).toBeGreaterThanOrEqual(0);
      // GQA should reduce KV cache memory requirements
    });

    it('should account for KV cache in memory calculations', () => {
      const gpus = [mockGPUConfigurations.rtx4090];
      const model = mockModelConfigurations.llama7b;

      const smallContext = { ...defaultOptions, numCtx: 1024 };
      const largeContext = { ...defaultOptions, numCtx: 8192 };

      const estimateSmall = LLMResourceCalculator.estimateGPULayers(
        gpus,
        model,
        smallContext
      );
      const estimateLarge = LLMResourceCalculator.estimateGPULayers(
        gpus,
        model,
        largeContext
      );

      // Larger context should use more VRAM due to KV cache
      expect(estimateLarge.vramSize).toBeGreaterThan(estimateSmall.vramSize);

      // Might fit fewer layers with larger context
      expect(estimateLarge.layers).toBeLessThanOrEqual(estimateSmall.layers);
    });

    it('should handle batch size impact on memory', () => {
      const gpus = [mockGPUConfigurations.rtx4090];
      const model = mockModelConfigurations.llama7b;

      const smallBatch = { ...defaultOptions, numBatch: 128 };
      const largeBatch = { ...defaultOptions, numBatch: 1024 };

      const estimateSmall = LLMResourceCalculator.estimateGPULayers(
        gpus,
        model,
        smallBatch
      );
      const estimateLarge = LLMResourceCalculator.estimateGPULayers(
        gpus,
        model,
        largeBatch
      );

      // Larger batch size affects computation graph size
      expect(estimateLarge.vramSize).toBeGreaterThanOrEqual(
        estimateSmall.vramSize
      );
    });

    it('should complete estimation within performance benchmark', () => {
      const startTime = Date.now();

      const gpus = mockGPUConfigurations.multiGPU;
      const model = mockModelConfigurations.mixtral8x7b; // Complex model

      LLMResourceCalculator.estimateGPULayers(gpus, model, defaultOptions);

      const estimationTime = Date.now() - startTime;
      expect(estimationTime).toBeLessThan(
        performanceBenchmarks.resourceCalculationTime.maxMs
      );
    });

    it('should handle models without explicit size information', () => {
      const gpus = [mockGPUConfigurations.rtx4090];
      const modelWithoutSize: ModelInfo = {
        ...mockModelConfigurations.llama7b,
        modelSize: undefined, // Force fallback calculation
      };

      const estimate = LLMResourceCalculator.estimateGPULayers(
        gpus,
        modelWithoutSize,
        defaultOptions
      );

      expect(estimate.layers).toBeGreaterThan(0);
      expect(estimate.totalSize).toBeGreaterThan(0); // Should estimate size
    });

    it('should validate memory estimate structure', () => {
      const gpus = [mockGPUConfigurations.rtx4090];
      const model = mockModelConfigurations.llama7b;

      const estimate = LLMResourceCalculator.estimateGPULayers(
        gpus,
        model,
        defaultOptions
      );

      // Validate structure
      expect(estimate).toHaveProperty('layers');
      expect(estimate).toHaveProperty('graph');
      expect(estimate).toHaveProperty('vramSize');
      expect(estimate).toHaveProperty('totalSize');
      expect(estimate).toHaveProperty('tensorSplit');
      expect(estimate).toHaveProperty('gpuSizes');
      expect(estimate).toHaveProperty('fullyLoaded');

      // Validate types
      expect(typeof estimate.layers).toBe('number');
      expect(typeof estimate.graph).toBe('number');
      expect(typeof estimate.vramSize).toBe('number');
      expect(typeof estimate.totalSize).toBe('number');
      expect(typeof estimate.tensorSplit).toBe('string');
      expect(typeof estimate.fullyLoaded).toBe('boolean');
      expect(Array.isArray(estimate.gpuSizes)).toBe(true);

      // Validate ranges
      expect(estimate.layers).toBeGreaterThanOrEqual(0);
      expect(estimate.graph).toBeGreaterThanOrEqual(0);
      expect(estimate.vramSize).toBeGreaterThanOrEqual(0);
      expect(estimate.totalSize).toBeGreaterThan(0);
    });
  });

  describe('calculateOptimalConfig', () => {
    const testCPUs = [testCPUConfigurations.intel12thGen];
    const testGPUs = [mockGPUConfigurations.rtx4090];
    const testModel = mockModelConfigurations.llama7b;

    it('should return complete configuration with estimate', () => {
      const config = LLMResourceCalculator.calculateOptimalConfig(
        testCPUs,
        testGPUs,
        testModel
      );

      expect(config).toHaveProperty('numCtx');
      expect(config).toHaveProperty('numBatch');
      expect(config).toHaveProperty('numGPU');
      expect(config).toHaveProperty('numThread');
      expect(config).toHaveProperty('temperature');
      expect(config).toHaveProperty('topK');
      expect(config).toHaveProperty('topP');
      expect(config).toHaveProperty('repeatPenalty');
      expect(config).toHaveProperty('estimate');

      expect(config.estimate).toHaveProperty('layers');
      expect(config.estimate).toHaveProperty('fullyLoaded');
    });

    it('should auto-calculate thread count when not specified', () => {
      const config = LLMResourceCalculator.calculateOptimalConfig(
        testCPUs,
        testGPUs,
        testModel,
        { numThread: 0 } // Auto-calculate
      );

      const expectedThreads =
        LLMResourceCalculator.getOptimalThreadCount(testCPUs);
      expect(config.numThread).toBe(expectedThreads);
    });

    it('should preserve user-specified thread count', () => {
      const userThreads = 4;
      const config = LLMResourceCalculator.calculateOptimalConfig(
        testCPUs,
        testGPUs,
        testModel,
        { numThread: userThreads }
      );

      expect(config.numThread).toBe(userThreads);
    });

    it('should auto-calculate GPU layers when numGPU is -1', () => {
      const config = LLMResourceCalculator.calculateOptimalConfig(
        testCPUs,
        testGPUs,
        testModel,
        { numGPU: -1 } // Auto-calculate
      );

      expect(config.numGPU).toBe(config.estimate.layers);
      expect(config.numGPU).toBeGreaterThanOrEqual(0);
    });

    it('should respect user-specified GPU layers', () => {
      const userGPULayers = 16;
      const config = LLMResourceCalculator.calculateOptimalConfig(
        testCPUs,
        testGPUs,
        testModel,
        { numGPU: userGPULayers }
      );

      expect(config.numGPU).toBe(userGPULayers);
    });

    it('should validate and adjust context size', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const config = LLMResourceCalculator.calculateOptimalConfig(
        testCPUs,
        testGPUs,
        testModel,
        { numCtx: 16384 } // Larger than model's training context
      );

      expect(config.numCtx).toBe(testModel.trainCtx); // Should be capped
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should merge user options with defaults', () => {
      const userOptions = {
        temperature: 0.5,
        topK: 20,
        numCtx: 2048,
      };

      const config = LLMResourceCalculator.calculateOptimalConfig(
        testCPUs,
        testGPUs,
        testModel,
        userOptions
      );

      // Should use user values
      expect(config.temperature).toBe(0.5);
      expect(config.topK).toBe(20);
      expect(config.numCtx).toBe(2048);

      // Should use defaults for unspecified options
      const defaults = LLMResourceCalculator.getDefaultOptions();
      expect(config.numBatch).toBe(defaults.numBatch);
      expect(config.topP).toBe(defaults.topP);
      expect(config.repeatPenalty).toBe(defaults.repeatPenalty);
    });

    it('should handle empty GPU configuration', () => {
      const config = LLMResourceCalculator.calculateOptimalConfig(
        testCPUs,
        [], // No GPUs
        testModel
      );

      expect(config.estimate.layers).toBe(0);
      expect(config.estimate.fullyLoaded).toBe(false);
      expect(config.numGPU).toBe(0);
    });

    it('should optimize for different model sizes', () => {
      const models = [
        mockModelConfigurations.llama7b,
        mockModelConfigurations.llama13b,
        mockModelConfigurations.llama70b,
      ];

      models.forEach(model => {
        const config = LLMResourceCalculator.calculateOptimalConfig(
          testCPUs,
          testGPUs,
          model
        );

        expect(config.estimate.layers).toBeGreaterThanOrEqual(0);
        expect(config.estimate.layers).toBeLessThanOrEqual(model.blockCount);

        // Larger models should use more VRAM when possible
        expect(config.estimate.vramSize).toBeGreaterThan(0);
      });
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle zero-core CPU configuration', () => {
      const zeroCPU = createResourceCPU(0, 0);
      const result = LLMResourceCalculator.getOptimalThreadCount([zeroCPU]);
      expect(result).toBe(0);
    });

    it('should handle negative efficiency core count', () => {
      const negativeCPU = createResourceCPU(8, -2); // Invalid configuration
      const result = LLMResourceCalculator.getOptimalThreadCount([negativeCPU]);
      expect(result).toBe(10); // Should treat as 8 - (-2) = 10
    });

    it('should handle GPU with zero free memory', () => {
      const noMemoryGPU: GpuInfo = {
        ...mockGPUConfigurations.rtx4090,
        freeMemory: 0,
      };

      const estimate = LLMResourceCalculator.estimateGPULayers(
        [noMemoryGPU],
        mockModelConfigurations.llama7b,
        LLMResourceCalculator.getDefaultOptions()
      );

      expect(estimate.layers).toBe(0);
      expect(estimate.vramSize).toBe(0);
    });

    it('should handle model with zero block count', () => {
      const zeroBlockModel: ModelInfo = {
        ...mockModelConfigurations.llama7b,
        blockCount: 0,
      };

      const estimate = LLMResourceCalculator.estimateGPULayers(
        [mockGPUConfigurations.rtx4090],
        zeroBlockModel,
        LLMResourceCalculator.getDefaultOptions()
      );

      expect(estimate.layers).toBe(0);
      expect(estimate.fullyLoaded).toBe(false); // No blocks to load
    });

    it('should handle extreme context sizes', () => {
      const extremeOptions = {
        ...LLMResourceCalculator.getDefaultOptions(),
        numCtx: 1000000, // 1M tokens
        numBatch: 10000,
      };

      const estimate = LLMResourceCalculator.estimateGPULayers(
        [mockGPUConfigurations.rtx4090],
        mockModelConfigurations.llama7b,
        extremeOptions
      );

      // Should handle gracefully, possibly with zero layers due to KV cache size
      expect(estimate.layers).toBeGreaterThanOrEqual(0);
    });

    it('should handle very small models', () => {
      const tinyModel: ModelInfo = {
        blockCount: 1,
        trainCtx: 512,
        headCountMax: 4,
        headCountKVMin: 4,
        supportsFlashAttention: false,
        supportsKVCacheType: () => true,
        modelSize: 100 * 1024 * 1024, // 100MB
      };

      const estimate = LLMResourceCalculator.estimateGPULayers(
        [mockGPUConfigurations.rtx4090],
        tinyModel,
        LLMResourceCalculator.getDefaultOptions()
      );

      expect(estimate.layers).toBe(1);
      expect(estimate.fullyLoaded).toBe(true);
    });

    it('should handle multiple identical GPUs', () => {
      const identicalGPUs = Array(4).fill(mockGPUConfigurations.rtx3080);

      const estimate = LLMResourceCalculator.estimateGPULayers(
        identicalGPUs,
        mockModelConfigurations.llama13b,
        LLMResourceCalculator.getDefaultOptions()
      );

      expect(estimate.gpuSizes).toHaveLength(identicalGPUs.length);
      expect(estimate.tensorSplit).toContain(','); // Should have splits
    });
  });

  describe('KV Cache calculations (tested through public interface)', () => {
    it('should account for different model architectures in KV cache', () => {
      const models = [
        mockModelConfigurations.llama7b, // Standard attention
        mockModelConfigurations.llama70b, // Grouped query attention (GQA)
        mockModelConfigurations.mixtral8x7b, // MoE with GQA
      ];

      const gpus = [mockGPUConfigurations.rtx4090];
      const options = LLMResourceCalculator.getDefaultOptions();

      models.forEach(model => {
        const estimate = LLMResourceCalculator.estimateGPULayers(
          gpus,
          model,
          options
        );

        expect(estimate).toBeDefined();
        expect(estimate.vramSize).toBeGreaterThan(0);

        // Models with fewer KV heads (GQA) should use less memory
        if (model.headCountKVMin < model.headCountMax) {
          expect(estimate.layers).toBeGreaterThan(0);
        }
      });
    });

    it('should scale KV cache with context length', () => {
      const contextSizes = [1024, 2048, 4096, 8192];
      const gpus = [mockGPUConfigurations.rtx4090];
      const model = mockModelConfigurations.llama7b;

      const estimates = contextSizes.map(numCtx => {
        const options = {
          ...LLMResourceCalculator.getDefaultOptions(),
          numCtx,
        };
        return LLMResourceCalculator.estimateGPULayers(gpus, model, options);
      });

      // VRAM usage should increase with context size
      for (let i = 1; i < estimates.length; i++) {
        expect(estimates[i].vramSize).toBeGreaterThan(
          estimates[i - 1].vramSize
        );
      }
    });
  });

  describe('Integration with example function', () => {
    it('should run example without errors', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      example();

      expect(consoleSpy).toHaveBeenCalled();

      const loggedOutput = consoleSpy.mock.calls
        .map(call => call.join(' '))
        .join('\n');
      expect(loggedOutput).toContain('Optimal Configuration:');
      expect(loggedOutput).toContain('Context Size:');
      expect(loggedOutput).toContain('Thread Count:');
      expect(loggedOutput).toContain('GPU Layers:');
      expect(loggedOutput).toContain('Estimated VRAM:');

      consoleSpy.mockRestore();
    });
  });

  describe('Memory calculation accuracy', () => {
    it('should produce realistic memory estimates for known configurations', () => {
      const config = expectedResults.llama7bOn24GBGpu;

      const estimate = LLMResourceCalculator.estimateGPULayers(
        [mockGPUConfigurations.rtx4090],
        mockModelConfigurations.llama7b,
        LLMResourceCalculator.getDefaultOptions()
      );

      if (config.shouldFitCompletely) {
        expect(estimate.fullyLoaded).toBe(true);
        expect(estimate.layers).toBe(
          mockModelConfigurations.llama7b.blockCount
        );
      }

      // VRAM usage should be within reasonable bounds
      expect(estimate.vramSize).toBeGreaterThan(4 * 1024 * 1024 * 1024); // At least 4GB
      expect(estimate.vramSize).toBeLessThan(
        mockGPUConfigurations.rtx4090.freeMemory
      );
    });

    it('should handle partial loading for large models', () => {
      const config = expectedResults.llama70bOn24GBGpu;

      const estimate = LLMResourceCalculator.estimateGPULayers(
        [mockGPUConfigurations.rtx4090],
        mockModelConfigurations.llama70b,
        LLMResourceCalculator.getDefaultOptions()
      );

      if (config.shouldFitPartially) {
        expect(estimate.fullyLoaded).toBe(false);
        expect(estimate.layers).toBeGreaterThan(0);
        expect(estimate.layers).toBeLessThan(
          mockModelConfigurations.llama70b.blockCount
        );
      }
    });
  });

  describe('Performance and scalability', () => {
    it('should handle many GPUs efficiently', () => {
      const startTime = Date.now();

      const manyGPUs = Array(32).fill(mockGPUConfigurations.rtx3080);

      const estimate = LLMResourceCalculator.estimateGPULayers(
        manyGPUs,
        mockModelConfigurations.llama13b,
        LLMResourceCalculator.getDefaultOptions()
      );

      const calculationTime = Date.now() - startTime;
      expect(calculationTime).toBeLessThan(
        performanceBenchmarks.resourceCalculationTime.maxMs
      );

      expect(estimate.gpuSizes).toHaveLength(manyGPUs.length);
    });

    it('should handle large models efficiently', () => {
      const startTime = Date.now();

      const largeModel: ModelInfo = {
        ...mockModelConfigurations.llama70b,
        blockCount: 200, // Very large model
      };

      LLMResourceCalculator.estimateGPULayers(
        [mockGPUConfigurations.rtx4090],
        largeModel,
        LLMResourceCalculator.getDefaultOptions()
      );

      const calculationTime = Date.now() - startTime;
      expect(calculationTime).toBeLessThan(
        performanceBenchmarks.resourceCalculationTime.maxMs
      );
    });
  });
});
