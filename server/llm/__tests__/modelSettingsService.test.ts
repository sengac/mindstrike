import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ModelSettingsService } from '../modelSettingsService';
import type { ContextCalculator } from '../contextCalculator';
import type { ModelRegistry } from '../modelRegistry';
import type { ModelDiscovery } from '../modelDiscovery';
import type {
  LocalModelInfo,
  ModelLoadingSettings,
} from '../../localLlmManager';
import { modelSettingsManager } from '../../utils/modelSettingsManager';
import type {
  LlamaModel,
  LlamaContext,
  LlamaChatSession,
} from 'node-llama-cpp';

vi.mock('../../utils/modelSettingsManager', () => ({
  modelSettingsManager: {
    saveModelSettings: vi.fn(),
    loadModelSettings: vi.fn(),
  },
}));

describe('ModelSettingsService', () => {
  let settingsService: ModelSettingsService;
  let mockContextCalculator: Partial<ContextCalculator>;
  let mockRegistry: Partial<ModelRegistry>;
  let mockModelDiscovery: Partial<ModelDiscovery>;

  const mockLocalModel: LocalModelInfo = {
    id: 'model1',
    name: 'Test Model',
    filename: 'test-model.gguf',
    path: '/models/test-model.gguf',
    size: 1000000,
    downloaded: true,
    downloading: false,
    contextLength: 4096,
    layerCount: 32,
  };

  const mockSettings: ModelLoadingSettings = {
    gpuLayers: 24,
    contextSize: 4096,
    batchSize: 512,
    threads: 8,
    temperature: 0.7,
  };

  const mockRuntimeInfo = {
    model: {} as LlamaModel,
    context: {} as LlamaContext,
    session: {} as LlamaChatSession,
    modelPath: '/models/test-model.gguf',
    contextSize: 4096,
    gpuLayers: 24,
    batchSize: 512,
    loadedAt: new Date(),
    lastUsedAt: new Date(),
    threadIds: new Set(['thread1']),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockContextCalculator = {
      calculateOptimalSettings: vi.fn().mockResolvedValue(mockSettings),
      clearCache: vi.fn(),
    };

    mockRegistry = {
      getModelRuntimeInfo: vi.fn().mockReturnValue(null),
    };

    mockModelDiscovery = {
      getLocalModels: vi.fn().mockResolvedValue([mockLocalModel]),
    };

    settingsService = new ModelSettingsService(
      mockContextCalculator as ContextCalculator,
      mockRegistry as ModelRegistry,
      mockModelDiscovery as ModelDiscovery
    );
  });

  describe('setModelSettings', () => {
    it('should save model settings', async () => {
      await settingsService.setModelSettings('model1', mockSettings);

      expect(modelSettingsManager.saveModelSettings).toHaveBeenCalledWith(
        'model1',
        mockSettings
      );
    });
  });

  describe('calculateOptimalSettings', () => {
    it('should calculate optimal settings for a model', async () => {
      const userSettings = { gpuLayers: 16 };
      const result = await settingsService.calculateOptimalSettings(
        'model1',
        userSettings
      );

      expect(result).toEqual(mockSettings);
      expect(mockModelDiscovery.getLocalModels).toHaveBeenCalled();
      expect(
        mockContextCalculator.calculateOptimalSettings
      ).toHaveBeenCalledWith(mockLocalModel, userSettings);
    });

    it('should throw error if model not found', async () => {
      mockModelDiscovery.getLocalModels = vi.fn().mockResolvedValue([]);

      await expect(
        settingsService.calculateOptimalSettings('model1')
      ).rejects.toThrow('Model model1 not found');
    });
  });

  describe('getModelSettings', () => {
    it('should return runtime settings if model is loaded', async () => {
      mockRegistry.getModelRuntimeInfo = vi
        .fn()
        .mockReturnValue(mockRuntimeInfo);

      const result = await settingsService.getModelSettings('model1');

      expect(result).toEqual({
        gpuLayers: 24,
        contextSize: 4096,
        batchSize: 512,
      });
      expect(mockRegistry.getModelRuntimeInfo).toHaveBeenCalledWith('model1');
    });

    it('should return persisted settings if available', async () => {
      vi.mocked(modelSettingsManager.loadModelSettings).mockResolvedValue(
        mockSettings
      );

      const result = await settingsService.getModelSettings('model1');

      expect(result).toEqual(mockSettings);
      expect(modelSettingsManager.loadModelSettings).toHaveBeenCalledWith(
        'model1'
      );
    });

    it('should calculate default settings if none exist', async () => {
      vi.mocked(modelSettingsManager.loadModelSettings).mockResolvedValue(null);

      const result = await settingsService.getModelSettings('model1');

      expect(result).toEqual(mockSettings);
      expect(mockContextCalculator.calculateOptimalSettings).toHaveBeenCalled();
    });
  });

  describe('getModelRuntimeInfo', () => {
    // Store original platform
    const originalPlatform = process.platform;

    afterEach(() => {
      // Restore original platform after each test
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true,
      });
    });

    describe('GPU type detection by platform', () => {
      it('should return "metal" GPU type on macOS (darwin) with GPU layers', () => {
        Object.defineProperty(process, 'platform', {
          value: 'darwin',
          configurable: true,
        });

        mockRegistry.getModelRuntimeInfo = vi
          .fn()
          .mockReturnValue(mockRuntimeInfo);

        const result = settingsService.getModelRuntimeInfo('model1');

        expect(result).toEqual({
          actualGpuLayers: mockRuntimeInfo.gpuLayers,
          gpuType: 'metal',
          loadingTime: expect.any(Number),
        });
      });

      it('should return "cuda" GPU type on Linux with GPU layers', () => {
        Object.defineProperty(process, 'platform', {
          value: 'linux',
          configurable: true,
        });

        mockRegistry.getModelRuntimeInfo = vi
          .fn()
          .mockReturnValue(mockRuntimeInfo);

        const result = settingsService.getModelRuntimeInfo('model1');

        expect(result).toEqual({
          actualGpuLayers: mockRuntimeInfo.gpuLayers,
          gpuType: 'cuda',
          loadingTime: expect.any(Number),
        });
      });

      it('should return "cuda" GPU type on Windows with GPU layers', () => {
        Object.defineProperty(process, 'platform', {
          value: 'win32',
          configurable: true,
        });

        mockRegistry.getModelRuntimeInfo = vi
          .fn()
          .mockReturnValue(mockRuntimeInfo);

        const result = settingsService.getModelRuntimeInfo('model1');

        expect(result).toEqual({
          actualGpuLayers: mockRuntimeInfo.gpuLayers,
          gpuType: 'cuda',
          loadingTime: expect.any(Number),
        });
      });

      it('should return "cpu" GPU type when no GPU layers are used (0 layers)', () => {
        Object.defineProperty(process, 'platform', {
          value: 'darwin',
          configurable: true,
        });

        const cpuOnlyRuntimeInfo = {
          ...mockRuntimeInfo,
          gpuLayers: 0,
        };

        mockRegistry.getModelRuntimeInfo = vi
          .fn()
          .mockReturnValue(cpuOnlyRuntimeInfo);

        const result = settingsService.getModelRuntimeInfo('model1');

        expect(result).toEqual({
          actualGpuLayers: 0,
          gpuType: 'cpu',
          loadingTime: expect.any(Number),
        });
      });

      it('should return "cpu" GPU type on any platform when GPU layers is 0', () => {
        const platforms = ['darwin', 'linux', 'win32', 'freebsd', 'openbsd'];
        const cpuOnlyRuntimeInfo = {
          ...mockRuntimeInfo,
          gpuLayers: 0,
        };

        platforms.forEach(platform => {
          Object.defineProperty(process, 'platform', {
            value: platform,
            configurable: true,
          });

          mockRegistry.getModelRuntimeInfo = vi
            .fn()
            .mockReturnValue(cpuOnlyRuntimeInfo);

          const result = settingsService.getModelRuntimeInfo('model1');

          expect(result?.gpuType).toBe('cpu');
        });
      });

      it('should handle unknown platforms by defaulting to "cpu" when no GPU match', () => {
        Object.defineProperty(process, 'platform', {
          value: 'freebsd',
          configurable: true,
        });

        mockRegistry.getModelRuntimeInfo = vi
          .fn()
          .mockReturnValue(mockRuntimeInfo);

        const result = settingsService.getModelRuntimeInfo('model1');

        expect(result).toEqual({
          actualGpuLayers: mockRuntimeInfo.gpuLayers,
          gpuType: 'cpu',
          loadingTime: expect.any(Number),
        });
      });
    });

    describe('edge cases', () => {
      it('should handle negative GPU layers as CPU mode', () => {
        const negativeGpuRuntimeInfo = {
          ...mockRuntimeInfo,
          gpuLayers: -1,
        };

        mockRegistry.getModelRuntimeInfo = vi
          .fn()
          .mockReturnValue(negativeGpuRuntimeInfo);

        const result = settingsService.getModelRuntimeInfo('model1');

        expect(result).toEqual({
          actualGpuLayers: -1,
          gpuType: 'cpu',
          loadingTime: expect.any(Number),
        });
      });

      it('should handle very large GPU layer counts correctly on macOS', () => {
        Object.defineProperty(process, 'platform', {
          value: 'darwin',
          configurable: true,
        });

        const largeGpuRuntimeInfo = {
          ...mockRuntimeInfo,
          gpuLayers: 128,
        };

        mockRegistry.getModelRuntimeInfo = vi
          .fn()
          .mockReturnValue(largeGpuRuntimeInfo);

        const result = settingsService.getModelRuntimeInfo('model1');

        expect(result).toEqual({
          actualGpuLayers: 128,
          gpuType: 'metal',
          loadingTime: expect.any(Number),
        });
      });

      it('should handle missing GPU layers property', () => {
        // Create runtime info without gpuLayers property
        const { gpuLayers, ...runtimeInfoWithoutGpuLayers } = mockRuntimeInfo;
        const incompleteRuntimeInfo = {
          ...runtimeInfoWithoutGpuLayers,
          // gpuLayers is intentionally omitted
        };

        mockRegistry.getModelRuntimeInfo = vi
          .fn()
          .mockReturnValue(incompleteRuntimeInfo);

        const result = settingsService.getModelRuntimeInfo('model1');

        expect(result).toEqual({
          actualGpuLayers: undefined,
          gpuType: 'cpu',
          loadingTime: expect.any(Number),
        });
      });

      it('should handle fractional GPU layers', () => {
        Object.defineProperty(process, 'platform', {
          value: 'linux',
          configurable: true,
        });

        const fractionalGpuRuntimeInfo = {
          ...mockRuntimeInfo,
          gpuLayers: 0.5,
        };

        mockRegistry.getModelRuntimeInfo = vi
          .fn()
          .mockReturnValue(fractionalGpuRuntimeInfo);

        const result = settingsService.getModelRuntimeInfo('model1');

        expect(result).toEqual({
          actualGpuLayers: 0.5,
          gpuType: 'cuda',
          loadingTime: expect.any(Number),
        });
      });

      it('should handle empty platform string', () => {
        Object.defineProperty(process, 'platform', {
          value: '',
          configurable: true,
        });

        mockRegistry.getModelRuntimeInfo = vi
          .fn()
          .mockReturnValue(mockRuntimeInfo);

        const result = settingsService.getModelRuntimeInfo('model1');

        expect(result).toEqual({
          actualGpuLayers: mockRuntimeInfo.gpuLayers,
          gpuType: 'cpu',
          loadingTime: expect.any(Number),
        });
      });
    });

    it('should return serializable data without native objects', () => {
      mockRegistry.getModelRuntimeInfo = vi
        .fn()
        .mockReturnValue(mockRuntimeInfo);

      const result = settingsService.getModelRuntimeInfo('model1');

      // Verify no native objects are included
      expect(result).toBeDefined();
      expect(result?.actualGpuLayers).toBe(24);
      expect(result?.loadingTime).toBeGreaterThanOrEqual(0);

      // Ensure native objects are NOT included
      expect(result).not.toHaveProperty('model');
      expect(result).not.toHaveProperty('context');
      expect(result).not.toHaveProperty('session');

      // Verify the result can be serialized (no DataCloneError)
      expect(() => JSON.stringify(result)).not.toThrow();
    });

    it('should return undefined if model not loaded', () => {
      mockRegistry.getModelRuntimeInfo = vi.fn().mockReturnValue(null);

      const result = settingsService.getModelRuntimeInfo('model1');

      expect(result).toBeUndefined();
    });

    it('should calculate loading time correctly', () => {
      const fiveSecondsAgo = new Date(Date.now() - 5000);
      const runtimeInfoWithOldLoadTime = {
        ...mockRuntimeInfo,
        loadedAt: fiveSecondsAgo,
      };

      mockRegistry.getModelRuntimeInfo = vi
        .fn()
        .mockReturnValue(runtimeInfoWithOldLoadTime);

      const result = settingsService.getModelRuntimeInfo('model1');

      expect(result?.loadingTime).toBeGreaterThanOrEqual(5000);
      expect(result?.loadingTime).toBeLessThan(6000); // Allow some margin
    });
  });

  describe('clearContextSizeCache', () => {
    it('should clear the context calculator cache', () => {
      settingsService.clearContextSizeCache();

      expect(mockContextCalculator.clearCache).toHaveBeenCalled();
    });
  });
});
