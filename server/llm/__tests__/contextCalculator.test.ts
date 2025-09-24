import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ContextCalculator } from '../contextCalculator';
import { sharedLlamaInstance } from '../../sharedLlamaInstance';
import { systemInfoManager } from '../../systemInfoManager';
import { LLMResourceCalculator } from '../../utils/system/llmResourceCalculator';
import type { SystemInformation } from '../../systemInfoManager';
import type { LocalModelInfo } from '../../localLlmManager';
import type { Llama } from 'node-llama-cpp';

// Type definitions for test mocks
interface MockModelInfo extends LocalModelInfo {
  layerCount: number;
  maxContextLength: number;
}

interface MockLlamaInstance extends Partial<Llama> {
  getVramState: () => Promise<{
    total: number;
    used: number;
    free: number;
    unifiedSize: number;
  }>;
}

interface MockResourceConfig {
  numGPU: number;
  numBatch: number;
  numCtx: number;
  numThread: number;
  temperature: number;
  topK: number;
  topP: number;
  repeatPenalty: number;
  estimate: {
    layers: number;
    graph: number;
    vramSize: number;
    totalSize: number;
    tensorSplit: string;
    gpuSizes: number[];
    fullyLoaded: boolean;
  };
}

// Mock dependencies
vi.mock('../../sharedLlamaInstance', () => ({
  sharedLlamaInstance: {
    getLlama: vi.fn(),
  },
}));

vi.mock('../../systemInfoManager', () => ({
  systemInfoManager: {
    getSystemInfo: vi.fn(),
  },
}));

vi.mock('../../utils/system/llmResourceCalculator', () => ({
  LLMResourceCalculator: {
    calculateOptimalConfig: vi.fn(),
    getDefaultOptions: vi.fn(() => ({ numCtx: 4096 })),
    validateContextSize: vi.fn(size => size),
  },
}));

vi.mock('../../logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('ContextCalculator', () => {
  let calculator: ContextCalculator;

  const mockSystemInfo: SystemInformation = {
    cpuThreads: 8,
    freeRAM: 16 * 1024 * 1024 * 1024, // 16GB in bytes
    totalRAM: 32 * 1024 * 1024 * 1024, // 32GB in bytes
    hasGpu: true,
    gpuType: 'NVIDIA',
    vramState: {
      total: 8 * 1024 * 1024 * 1024, // 8GB
      free: 6 * 1024 * 1024 * 1024, // 6GB free
      used: 2 * 1024 * 1024 * 1024, // 2GB used
    },
    diskSpace: {
      total: 1024 * 1024 * 1024 * 1024, // 1TB
      free: 500 * 1024 * 1024 * 1024, // 500GB
      used: 524 * 1024 * 1024 * 1024, // 524GB
    },
    lastUpdated: Date.now(),
  };

  const mockModelInfo: MockModelInfo = {
    id: 'test-model',
    name: 'Test Model',
    filename: 'test-model.gguf',
    path: '/path/to/model.gguf',
    size: 4 * 1024 * 1024 * 1024, // 4GB
    downloaded: true,
    downloading: false,
    contextLength: 4096,
    layerCount: 32,
    maxContextLength: 8192,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    calculator = new ContextCalculator();

    // Default mock implementations
    vi.mocked(systemInfoManager.getSystemInfo).mockResolvedValue(
      mockSystemInfo
    );
    const mockLlama: MockLlamaInstance = {
      getVramState: vi.fn().mockResolvedValue({
        total: 8 * 1024 * 1024 * 1024,
        used: 2 * 1024 * 1024 * 1024,
        free: 6 * 1024 * 1024 * 1024,
        unifiedSize: 0,
      }),
    };
    vi.mocked(sharedLlamaInstance.getLlama).mockResolvedValue(
      mockLlama as Llama
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('calculateSafeContextSize', () => {
    it('should return requested context size if it fits in VRAM', async () => {
      const modelSize = 4 * 1024 * 1024 * 1024; // 4GB
      const requestedContext = 4096;

      const result = await calculator.calculateSafeContextSize(
        modelSize,
        requestedContext,
        'model.gguf'
      );

      expect(result).toBe(requestedContext);
    });

    it('should use cached value if available and not expired', async () => {
      const modelSize = 4 * 1024 * 1024 * 1024;
      const requestedContext = 4096;
      const filename = 'model.gguf';

      // First call
      const result1 = await calculator.calculateSafeContextSize(
        modelSize,
        requestedContext,
        filename
      );

      // Second call should use cache
      const result2 = await calculator.calculateSafeContextSize(
        modelSize,
        requestedContext,
        filename
      );

      expect(result1).toBe(result2);
      // getLlama should only be called once due to caching
      expect(sharedLlamaInstance.getLlama).toHaveBeenCalledTimes(1);
    });

    it('should perform binary search for optimal context when requested size is too large', async () => {
      // Mock very limited VRAM
      const mockLlamaLimited: MockLlamaInstance = {
        getVramState: vi.fn().mockResolvedValue({
          total: 8 * 1024 * 1024 * 1024,
          used: 7 * 1024 * 1024 * 1024,
          free: 1 * 1024 * 1024 * 1024, // Only 1GB free
          unifiedSize: 0,
        }),
      };
      vi.mocked(sharedLlamaInstance.getLlama).mockResolvedValue(
        mockLlamaLimited as Llama
      );

      const modelSize = 4 * 1024 * 1024 * 1024;
      const requestedContext = 32768; // Very large context

      const result = await calculator.calculateSafeContextSize(
        modelSize,
        requestedContext,
        'model.gguf'
      );

      // Should return a smaller context size
      expect(result).toBeLessThan(requestedContext);
      expect(result).toBeGreaterThanOrEqual(512); // Minimum context
    });

    it('should throw error when VRAM state cannot be determined', async () => {
      vi.mocked(sharedLlamaInstance.getLlama).mockRejectedValue(
        new Error('Failed to get VRAM state')
      );

      await expect(
        calculator.calculateSafeContextSize(
          4 * 1024 * 1024 * 1024,
          4096,
          'model.gguf'
        )
      ).rejects.toThrow('Cannot determine safe context size');
    });
  });

  describe('calculateOptimalGpuAndBatchSettings', () => {
    it('should calculate optimal GPU layers and batch size', async () => {
      const mockConfig: MockResourceConfig = {
        numGPU: 24,
        numBatch: 512,
        numCtx: 4096,
        numThread: 8,
        temperature: 0.7,
        topK: 40,
        topP: 0.9,
        repeatPenalty: 1.1,
        estimate: {
          layers: 32,
          graph: 1000,
          vramSize: 4000000000,
          totalSize: 5000000000,
          tensorSplit: '',
          gpuSizes: [4000000000],
          fullyLoaded: true,
        },
      };
      vi.mocked(LLMResourceCalculator.calculateOptimalConfig).mockReturnValue(
        mockConfig
      );

      const result = await calculator.calculateOptimalGpuAndBatchSettings(
        mockModelInfo,
        4096
      );

      expect(result.optimalGpuLayers).toBe(24);
      expect(result.optimalBatchSize).toBe(512);
    });

    it('should fall back to CPU mode when no GPU available', async () => {
      const noGpuSystemInfo: SystemInformation = {
        ...mockSystemInfo,
        hasGpu: false,
      };
      vi.mocked(systemInfoManager.getSystemInfo).mockResolvedValue(
        noGpuSystemInfo
      );

      const mockCpuConfig: MockResourceConfig = {
        numGPU: 0,
        numBatch: 512,
        numCtx: 4096,
        numThread: 8,
        temperature: 0.7,
        topK: 40,
        topP: 0.9,
        repeatPenalty: 1.1,
        estimate: {
          layers: 0,
          graph: 1000,
          vramSize: 0,
          totalSize: 5000000000,
          tensorSplit: '',
          gpuSizes: [],
          fullyLoaded: false,
        },
      };
      vi.mocked(LLMResourceCalculator.calculateOptimalConfig).mockReturnValue(
        mockCpuConfig
      );

      const result = await calculator.calculateOptimalGpuAndBatchSettings(
        mockModelInfo,
        4096
      );

      expect(result.optimalGpuLayers).toBe(0);
      expect(result.optimalBatchSize).toBeGreaterThan(0);
    });

    it('should handle calculator errors gracefully', async () => {
      vi.mocked(
        LLMResourceCalculator.calculateOptimalConfig
      ).mockImplementation(() => {
        throw new Error('Calculator error');
      });

      const result = await calculator.calculateOptimalGpuAndBatchSettings(
        mockModelInfo,
        4096
      );

      // Should return fallback values
      expect(result.optimalGpuLayers).toBe(0);
      expect(result.optimalBatchSize).toBeGreaterThan(0);
    });
  });

  describe('calculateOptimalContextSize', () => {
    it('should calculate optimal context size based on model info', async () => {
      const result =
        await calculator.calculateOptimalContextSize(mockModelInfo);

      expect(result).toBeGreaterThanOrEqual(512);
      expect(LLMResourceCalculator.validateContextSize).toHaveBeenCalled();
    });

    it('should use model max context length if available', async () => {
      vi.mocked(LLMResourceCalculator.validateContextSize).mockReturnValue(
        8192
      );

      const testModelInfo: MockModelInfo = {
        ...mockModelInfo,
        maxContextLength: 8192,
      };
      const result =
        await calculator.calculateOptimalContextSize(testModelInfo);

      expect(result).toBe(8192);
    });

    it('should ensure minimum viable context of 512', async () => {
      vi.mocked(LLMResourceCalculator.validateContextSize).mockReturnValue(256);

      const result =
        await calculator.calculateOptimalContextSize(mockModelInfo);

      expect(result).toBe(512);
    });
  });

  describe('calculateOptimalSettings', () => {
    it('should return optimal settings with defaults', async () => {
      const mockOptimalConfig: MockResourceConfig = {
        numGPU: 24,
        numBatch: 512,
        numCtx: 4096,
        numThread: 8,
        temperature: 0.7,
        topK: 40,
        topP: 0.9,
        repeatPenalty: 1.1,
        estimate: {
          layers: 32,
          graph: 1000,
          vramSize: 4000000000,
          totalSize: 5000000000,
          tensorSplit: '',
          gpuSizes: [4000000000],
          fullyLoaded: true,
        },
      };
      vi.mocked(LLMResourceCalculator.calculateOptimalConfig).mockReturnValue(
        mockOptimalConfig
      );

      const result = await calculator.calculateOptimalSettings(mockModelInfo);

      expect(result).toEqual({
        gpuLayers: 24,
        contextSize: expect.any(Number),
        batchSize: 512,
        threads: 8,
        temperature: 0.7,
      });
    });

    it('should respect user settings over defaults', async () => {
      const mockUserSettingsConfig: MockResourceConfig = {
        numGPU: 24,
        numBatch: 512,
        numCtx: 4096,
        numThread: 8,
        temperature: 0.7,
        topK: 40,
        topP: 0.9,
        repeatPenalty: 1.1,
        estimate: {
          layers: 32,
          graph: 1000,
          vramSize: 4000000000,
          totalSize: 5000000000,
          tensorSplit: '',
          gpuSizes: [4000000000],
          fullyLoaded: true,
        },
      };
      vi.mocked(LLMResourceCalculator.calculateOptimalConfig).mockReturnValue(
        mockUserSettingsConfig
      );

      const userSettings = {
        gpuLayers: 16,
        contextSize: 2048,
        batchSize: 256,
        threads: 4,
        temperature: 0.9,
      };

      const result = await calculator.calculateOptimalSettings(
        mockModelInfo,
        userSettings
      );

      expect(result).toEqual(userSettings);
    });

    it('should auto-calculate GPU layers when user sets -1', async () => {
      const mockAutoGpuConfig: MockResourceConfig = {
        numGPU: 24,
        numBatch: 512,
        numCtx: 4096,
        numThread: 8,
        temperature: 0.7,
        topK: 40,
        topP: 0.9,
        repeatPenalty: 1.1,
        estimate: {
          layers: 32,
          graph: 1000,
          vramSize: 4000000000,
          totalSize: 5000000000,
          tensorSplit: '',
          gpuSizes: [4000000000],
          fullyLoaded: true,
        },
      };
      vi.mocked(LLMResourceCalculator.calculateOptimalConfig).mockReturnValue(
        mockAutoGpuConfig
      );

      const userSettings = {
        gpuLayers: -1,
      };

      const result = await calculator.calculateOptimalSettings(
        mockModelInfo,
        userSettings
      );

      expect(result.gpuLayers).toBe(24);
    });
  });

  describe('clearCache', () => {
    it('should clear the context size cache', async () => {
      // Populate cache
      await calculator.calculateSafeContextSize(
        4 * 1024 * 1024 * 1024,
        4096,
        'model.gguf'
      );

      // Clear cache
      calculator.clearCache();

      // Next call should not use cache
      await calculator.calculateSafeContextSize(
        4 * 1024 * 1024 * 1024,
        4096,
        'model.gguf'
      );

      // getLlama should be called twice (once before clear, once after)
      expect(sharedLlamaInstance.getLlama).toHaveBeenCalledTimes(2);
    });
  });

  describe('fallback batch size calculation', () => {
    it('should return appropriate batch sizes based on model size', async () => {
      vi.mocked(
        LLMResourceCalculator.calculateOptimalConfig
      ).mockImplementation(() => {
        throw new Error('Calculator error');
      });

      const testCases = [
        {
          size: 16 * 1024 * 1024 * 1024,
          contextSize: 16384,
          expectedBatch: 1024,
        },
        {
          size: 10 * 1024 * 1024 * 1024,
          contextSize: 8192,
          expectedBatch: 4096,
        },
        {
          size: 6 * 1024 * 1024 * 1024,
          contextSize: 4096,
          expectedBatch: 8192,
        },
        {
          size: 2 * 1024 * 1024 * 1024,
          contextSize: 4096,
          expectedBatch: 16384,
        },
      ];

      for (const { size, contextSize, expectedBatch } of testCases) {
        const modelInfo = { ...mockModelInfo, size };
        const result = await calculator.calculateOptimalGpuAndBatchSettings(
          modelInfo,
          contextSize
        );

        expect(result.optimalBatchSize).toBe(expectedBatch);
      }
    });
  });
});
