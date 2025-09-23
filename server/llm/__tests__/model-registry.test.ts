import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ModelRegistry } from '../model-registry.js';
import type {
  LlamaModel,
  LlamaContext,
  LlamaChatSession,
} from 'node-llama-cpp';

vi.mock('../../logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('ModelRegistry', () => {
  let registry: ModelRegistry;
  let mockModel: LlamaModel;
  let mockContext: LlamaContext;
  let mockSession: LlamaChatSession;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new ModelRegistry();

    // Mock model, context, and session
    mockModel = {
      dispose: vi.fn().mockResolvedValue(undefined),
    } as any;

    mockContext = {
      dispose: vi.fn().mockResolvedValue(undefined),
    } as any;

    mockSession = {
      context: mockContext,
    } as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('registerModel', () => {
    it('should register a model with metadata', () => {
      const metadata = {
        modelPath: '/path/to/model.gguf',
        contextSize: 4096,
        gpuLayers: 24,
        batchSize: 512,
        threadId: 'thread-1',
      };

      registry.registerModel(
        'model-1',
        mockModel,
        mockContext,
        mockSession,
        metadata
      );

      const info = registry.getModelRuntimeInfo('model-1');
      expect(info).toBeDefined();
      expect(info?.modelPath).toBe('/path/to/model.gguf');
      expect(info?.contextSize).toBe(4096);
      expect(info?.gpuLayers).toBe(24);
      expect(info?.threadIds.has('thread-1')).toBe(true);
    });

    it('should initialize usage stats on registration', () => {
      registry.registerModel('model-1', mockModel, mockContext, mockSession, {
        modelPath: '/path/to/model.gguf',
        contextSize: 4096,
        gpuLayers: 24,
        batchSize: 512,
      });

      const stats = registry.getUsageStats('model-1');
      expect(stats).toBeDefined();
      expect(stats?.totalPrompts).toBe(0);
      expect(stats?.totalTokens).toBe(0);
    });
  });

  describe('getModelRuntimeInfo', () => {
    it('should return model info and update last used time', () => {
      const beforeRegister = new Date();

      registry.registerModel('model-1', mockModel, mockContext, mockSession, {
        modelPath: '/path/to/model.gguf',
        contextSize: 4096,
        gpuLayers: 24,
        batchSize: 512,
      });

      const info = registry.getModelRuntimeInfo('model-1');
      expect(info).toBeDefined();
      expect(info?.lastUsedAt.getTime()).toBeGreaterThanOrEqual(
        beforeRegister.getTime()
      );
    });

    it('should return undefined for non-existent model', () => {
      const info = registry.getModelRuntimeInfo('non-existent');
      expect(info).toBeUndefined();
    });
  });

  describe('getModelByThreadId', () => {
    it('should return model associated with thread', () => {
      registry.registerModel('model-1', mockModel, mockContext, mockSession, {
        modelPath: '/path/to/model.gguf',
        contextSize: 4096,
        gpuLayers: 24,
        batchSize: 512,
        threadId: 'thread-1',
      });

      const info = registry.getModelByThreadId('thread-1');
      expect(info).toBeDefined();
      expect(info?.modelPath).toBe('/path/to/model.gguf');
    });

    it('should return undefined for unassociated thread', () => {
      const info = registry.getModelByThreadId('unknown-thread');
      expect(info).toBeUndefined();
    });
  });

  describe('associateThread', () => {
    it('should associate thread with model', () => {
      registry.registerModel('model-1', mockModel, mockContext, mockSession, {
        modelPath: '/path/to/model.gguf',
        contextSize: 4096,
        gpuLayers: 24,
        batchSize: 512,
      });

      registry.associateThread('model-1', 'thread-2');

      const info = registry.getModelRuntimeInfo('model-1');
      expect(info?.threadIds.has('thread-2')).toBe(true);
    });
  });

  describe('disassociateThread', () => {
    it('should remove thread from all models', () => {
      registry.registerModel('model-1', mockModel, mockContext, mockSession, {
        modelPath: '/path/to/model1.gguf',
        contextSize: 4096,
        gpuLayers: 24,
        batchSize: 512,
        threadId: 'thread-1',
      });

      registry.registerModel('model-2', mockModel, mockContext, mockSession, {
        modelPath: '/path/to/model2.gguf',
        contextSize: 4096,
        gpuLayers: 24,
        batchSize: 512,
        threadId: 'thread-1',
      });

      registry.disassociateThread('thread-1');

      const info1 = registry.getModelRuntimeInfo('model-1');
      const info2 = registry.getModelRuntimeInfo('model-2');
      expect(info1?.threadIds.has('thread-1')).toBe(false);
      expect(info2?.threadIds.has('thread-1')).toBe(false);
    });
  });

  describe('unregisterModel', () => {
    it('should unregister model and dispose resources', async () => {
      registry.registerModel('model-1', mockModel, mockContext, mockSession, {
        modelPath: '/path/to/model.gguf',
        contextSize: 4096,
        gpuLayers: 24,
        batchSize: 512,
      });

      await registry.unregisterModel('model-1');

      expect(mockContext.dispose).toHaveBeenCalled();
      expect(mockModel.dispose).toHaveBeenCalled();
      expect(registry.getModelRuntimeInfo('model-1')).toBeUndefined();
    });

    it('should handle disposal errors gracefully', async () => {
      vi.mocked(mockContext.dispose).mockRejectedValue(
        new Error('Dispose error')
      );

      registry.registerModel('model-1', mockModel, mockContext, mockSession, {
        modelPath: '/path/to/model.gguf',
        contextSize: 4096,
        gpuLayers: 24,
        batchSize: 512,
      });

      await expect(registry.unregisterModel('model-1')).resolves.not.toThrow();

      expect(registry.getModelRuntimeInfo('model-1')).toBeUndefined();
    });
  });

  describe('getModelStatus', () => {
    it('should return loaded status for active model', () => {
      registry.registerModel('model-1', mockModel, mockContext, mockSession, {
        modelPath: '/path/to/model.gguf',
        contextSize: 4096,
        gpuLayers: 24,
        batchSize: 512,
      });

      const status = registry.getModelStatus('model-1');
      expect(status).toEqual({
        loaded: true,
        loading: false,
        contextSize: 4096,
        gpuLayers: 24,
      });
    });

    it('should return loading status when loading lock exists', () => {
      const loadingPromise = new Promise<void>(() => {});
      registry.setLoadingLock('model-1', loadingPromise);

      const status = registry.getModelStatus('model-1');
      expect(status).toEqual({
        loaded: false,
        loading: true,
      });
    });

    it('should return not loaded status for unknown model', () => {
      const status = registry.getModelStatus('unknown');
      expect(status).toEqual({
        loaded: false,
        loading: false,
      });
    });
  });

  describe('loading locks', () => {
    it('should set and clear loading lock', async () => {
      const loadingPromise = Promise.resolve();
      registry.setLoadingLock('model-1', loadingPromise);

      expect(registry.getLoadingLock('model-1')).toBe(loadingPromise);
      expect(registry.isModelLoading('model-1')).toBe(true);

      await loadingPromise;

      // Lock should be cleared after promise resolves
      expect(registry.getLoadingLock('model-1')).toBeUndefined();
      expect(registry.isModelLoading('model-1')).toBe(false);
    });
  });

  describe('getLeastRecentlyUsedModel', () => {
    it('should return model with oldest last used time', async () => {
      const now = Date.now();

      // Register models with different times
      registry.registerModel('model-1', mockModel, mockContext, mockSession, {
        modelPath: '/path/to/model1.gguf',
        contextSize: 4096,
        gpuLayers: 24,
        batchSize: 512,
      });

      // Manually set an older time for model-1
      const info1 = registry.getModelRuntimeInfo('model-1');
      if (info1) {
        info1.lastUsedAt = new Date(now - 10000);
      }

      registry.registerModel('model-2', mockModel, mockContext, mockSession, {
        modelPath: '/path/to/model2.gguf',
        contextSize: 4096,
        gpuLayers: 24,
        batchSize: 512,
      });

      const lruModel = registry.getLeastRecentlyUsedModel();
      expect(lruModel).toBe('model-1');
    });
  });

  describe('getUnassociatedModels', () => {
    it('should return models without thread associations', () => {
      registry.registerModel('model-1', mockModel, mockContext, mockSession, {
        modelPath: '/path/to/model1.gguf',
        contextSize: 4096,
        gpuLayers: 24,
        batchSize: 512,
        threadId: 'thread-1',
      });

      registry.registerModel('model-2', mockModel, mockContext, mockSession, {
        modelPath: '/path/to/model2.gguf',
        contextSize: 4096,
        gpuLayers: 24,
        batchSize: 512,
      });

      const unassociated = registry.getUnassociatedModels();
      expect(unassociated).toEqual(['model-2']);
    });
  });

  describe('usage statistics', () => {
    it('should record prompt usage', () => {
      registry.registerModel('model-1', mockModel, mockContext, mockSession, {
        modelPath: '/path/to/model.gguf',
        contextSize: 4096,
        gpuLayers: 24,
        batchSize: 512,
      });

      registry.recordPromptUsage('model-1', 100);
      registry.recordPromptUsage('model-1', 150);

      const stats = registry.getUsageStats('model-1');
      expect(stats?.totalPrompts).toBe(2);
      expect(stats?.totalTokens).toBe(250);
    });
  });

  describe('getAllModelsInfo', () => {
    it('should return info for all models', () => {
      registry.registerModel('model-1', mockModel, mockContext, mockSession, {
        modelPath: '/path/to/model1.gguf',
        contextSize: 4096,
        gpuLayers: 24,
        batchSize: 512,
      });

      registry.registerModel('model-2', mockModel, mockContext, mockSession, {
        modelPath: '/path/to/model2.gguf',
        contextSize: 8192,
        gpuLayers: 32,
        batchSize: 1024,
      });

      const allInfo = registry.getAllModelsInfo();
      expect(allInfo).toHaveLength(2);
      expect(allInfo[0].modelId).toBe('model-1');
      expect(allInfo[1].modelId).toBe('model-2');
    });
  });

  describe('clearAll', () => {
    it('should clear all models and stats', async () => {
      registry.registerModel('model-1', mockModel, mockContext, mockSession, {
        modelPath: '/path/to/model1.gguf',
        contextSize: 4096,
        gpuLayers: 24,
        batchSize: 512,
      });

      registry.registerModel('model-2', mockModel, mockContext, mockSession, {
        modelPath: '/path/to/model2.gguf',
        contextSize: 4096,
        gpuLayers: 24,
        batchSize: 512,
      });

      await registry.clearAll();

      expect(registry.getActiveModelIds()).toHaveLength(0);
      expect(registry.getUsageStats('model-1')).toBeUndefined();
    });
  });

  describe('getTotalMemoryUsage', () => {
    it('should estimate total memory usage', () => {
      registry.registerModel('model-1', mockModel, mockContext, mockSession, {
        modelPath: '/path/to/model1.gguf',
        contextSize: 4096,
        gpuLayers: 24,
        batchSize: 512,
      });

      registry.registerModel('model-2', mockModel, mockContext, mockSession, {
        modelPath: '/path/to/model2.gguf',
        contextSize: 8192,
        gpuLayers: 32,
        batchSize: 1024,
      });

      const usage = registry.getTotalMemoryUsage();
      expect(usage.modelCount).toBe(2);
      expect(usage.totalContextMemory).toBeGreaterThan(0);
    });
  });
});
