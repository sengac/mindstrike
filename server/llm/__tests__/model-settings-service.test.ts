import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelSettingsService } from '../model-settings-service.js';
import type { ContextCalculator } from '../context-calculator.js';
import type { ModelRegistry } from '../model-registry.js';
import type { ModelDiscovery } from '../model-discovery.js';
import type {
  LocalModelInfo,
  ModelLoadingSettings,
} from '../../local-llm-manager.js';
import { modelSettingsManager } from '../../utils/model-settings-manager.js';

vi.mock('../../utils/model-settings-manager.js', () => ({
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
    model: {} as any,
    context: {} as any,
    session: {} as any,
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
    it('should return formatted runtime info', () => {
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

    it('should return serializable data without native objects', () => {
      mockRegistry.getModelRuntimeInfo = vi
        .fn()
        .mockReturnValue(mockRuntimeInfo);

      const result = settingsService.getModelRuntimeInfo('model1');

      // Verify no native objects are included
      expect(result).toBeDefined();
      expect(result?.actualGpuLayers).toBe(24);
      expect(result?.gpuType).toBe('cuda');
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
  });

  describe('clearContextSizeCache', () => {
    it('should clear the context calculator cache', () => {
      settingsService.clearContextSizeCache();

      expect(mockContextCalculator.clearCache).toHaveBeenCalled();
    });
  });
});
