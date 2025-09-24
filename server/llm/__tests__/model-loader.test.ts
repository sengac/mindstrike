import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelLoader } from '../model-loader.js';
import { ModelRegistry } from '../model-registry.js';
import { LlamaSessionManager } from '../session-manager.js';
import { ModelSettingsService } from '../model-settings-service.js';
import { ModelDiscovery } from '../model-discovery.js';
import { sharedLlamaInstance } from '../../shared-llama-instance.js';
import { logger } from '../../logger.js';
import type { LocalModelInfo } from '../../local-llm-manager.js';
import type { ModelRuntimeInfo } from '../model-registry.js';
import type {
  Llama,
  LlamaModel,
  LlamaContext,
  LlamaChatSession,
} from 'node-llama-cpp';

// Mock all dependencies
vi.mock('../../shared-llama-instance.js');
vi.mock('../../logger.js');
vi.mock('../model-registry.js');
vi.mock('../session-manager.js');
vi.mock('../model-settings-service.js');
vi.mock('../model-discovery.js');

describe('ModelLoader', () => {
  let modelLoader: ModelLoader;
  let mockRegistry: ModelRegistry;
  let mockSessionManager: LlamaSessionManager;
  let mockSettingsService: ModelSettingsService;
  let mockModelDiscovery: ModelDiscovery;

  const mockModelInfo: LocalModelInfo = {
    id: 'test-model-1',
    name: 'Test Model',
    filename: 'test-model.gguf',
    path: '/path/to/test-model.gguf',
    size: 1000000,
    downloaded: true,
    downloading: false,
    contextLength: 4096,
    layerCount: 32,
    parameterCount: '7B',
  };

  const mockSettings = {
    gpuLayers: 16,
    contextSize: 4096,
    batchSize: 512,
  };

  // Create properly typed mocks
  const mockModel: Partial<LlamaModel> = {
    createContext: vi.fn(),
    dispose: vi.fn(),
  };

  const mockContext: Partial<LlamaContext> = {
    dispose: vi.fn(),
  };

  const mockSession: Partial<LlamaChatSession> = {
    dispose: vi.fn(),
  };

  const mockLlama: Partial<Llama> = {
    loadModel: vi.fn(),
    dispose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock functions
    (mockModel.createContext as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockContext
    );
    (mockLlama.loadModel as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockModel
    );

    // Create mocked instances
    mockRegistry = new ModelRegistry();
    mockSessionManager = new LlamaSessionManager();
    mockSettingsService = new ModelSettingsService(null!, null!, null!);
    mockModelDiscovery = new ModelDiscovery(null!, null!, null!);

    // Setup default mocks
    vi.mocked(sharedLlamaInstance.getLlama).mockResolvedValue(
      mockLlama as Llama
    );
    vi.mocked(mockSessionManager.createSession).mockResolvedValue(
      mockSession as LlamaChatSession
    );

    vi.mocked(mockSettingsService.getModelSettings).mockResolvedValue(
      mockSettings
    );
    vi.mocked(mockSettingsService.calculateOptimalSettings).mockResolvedValue(
      mockSettings
    );

    modelLoader = new ModelLoader(
      mockRegistry,
      mockSessionManager,
      mockSettingsService,
      mockModelDiscovery
    );
  });

  describe('loadModel', () => {
    it('should throw error when model not found', async () => {
      vi.mocked(mockModelDiscovery.getLocalModels).mockResolvedValue([]);

      await expect(modelLoader.loadModel('non-existent')).rejects.toThrow(
        'Model non-existent not found'
      );
    });

    it('should find model by ID', async () => {
      vi.mocked(mockModelDiscovery.getLocalModels).mockResolvedValue([
        mockModelInfo,
      ]);
      vi.mocked(mockRegistry.isModelActive).mockReturnValue(false);
      vi.mocked(mockRegistry.getLoadingLock).mockReturnValue(undefined);
      vi.mocked(mockRegistry.getActiveModelIds).mockReturnValue([]);

      await modelLoader.loadModel('test-model-1');

      expect(mockRegistry.registerModel).toHaveBeenCalledWith(
        'test-model-1',
        mockModel as LlamaModel,
        mockContext as LlamaContext,
        mockSession as LlamaChatSession,
        expect.objectContaining({
          modelPath: '/path/to/test-model.gguf',
          contextSize: 4096,
          gpuLayers: 16,
          batchSize: 512,
        })
      );
    });

    it('should find model by name', async () => {
      vi.mocked(mockModelDiscovery.getLocalModels).mockResolvedValue([
        mockModelInfo,
      ]);
      vi.mocked(mockRegistry.isModelActive).mockReturnValue(false);
      vi.mocked(mockRegistry.getLoadingLock).mockReturnValue(undefined);
      vi.mocked(mockRegistry.getActiveModelIds).mockReturnValue([]);

      await modelLoader.loadModel('Test Model');

      expect(mockRegistry.registerModel).toHaveBeenCalled();
    });

    it('should find model by filename when ends with .gguf', async () => {
      vi.mocked(mockModelDiscovery.getLocalModels).mockResolvedValue([
        mockModelInfo,
      ]);
      vi.mocked(mockRegistry.isModelActive).mockReturnValue(false);
      vi.mocked(mockRegistry.getLoadingLock).mockReturnValue(undefined);
      vi.mocked(mockRegistry.getActiveModelIds).mockReturnValue([]);

      await modelLoader.loadModel('test-model.gguf');

      expect(mockRegistry.registerModel).toHaveBeenCalled();
    });

    it('should handle already loaded model', async () => {
      vi.mocked(mockModelDiscovery.getLocalModels).mockResolvedValue([
        mockModelInfo,
      ]);
      vi.mocked(mockRegistry.isModelActive).mockReturnValue(true);

      await modelLoader.loadModel('test-model-1', 'thread-123');

      expect(logger.info).toHaveBeenCalledWith(
        'Model test-model-1 is already loaded'
      );
      expect(mockRegistry.associateThread).toHaveBeenCalledWith(
        'test-model-1',
        'thread-123'
      );
      expect(
        mockLlama.loadModel as ReturnType<typeof vi.fn>
      ).not.toHaveBeenCalled();
    });

    it('should wait for model that is already loading', async () => {
      const loadingPromise = Promise.resolve();
      vi.mocked(mockModelDiscovery.getLocalModels).mockResolvedValue([
        mockModelInfo,
      ]);
      vi.mocked(mockRegistry.isModelActive).mockReturnValue(false);
      vi.mocked(mockRegistry.getLoadingLock).mockReturnValue(loadingPromise);

      await modelLoader.loadModel('test-model-1', 'thread-123');

      expect(logger.info).toHaveBeenCalledWith(
        'Model test-model-1 is already being loaded, waiting...'
      );
      expect(mockRegistry.associateThread).toHaveBeenCalledWith(
        'test-model-1',
        'thread-123'
      );
      expect(
        mockLlama.loadModel as ReturnType<typeof vi.fn>
      ).not.toHaveBeenCalled();
    });

    it('should unload other models before loading', async () => {
      vi.mocked(mockModelDiscovery.getLocalModels).mockResolvedValue([
        mockModelInfo,
      ]);
      vi.mocked(mockRegistry.isModelActive).mockReturnValue(false);
      vi.mocked(mockRegistry.getLoadingLock).mockReturnValue(undefined);
      vi.mocked(mockRegistry.getActiveModelIds).mockReturnValue([
        'other-model-1',
        'other-model-2',
      ]);
      vi.mocked(mockRegistry.getModelRuntimeInfo).mockImplementation(
        () => ({}) as ModelRuntimeInfo
      );

      await modelLoader.loadModel('test-model-1');

      expect(mockSessionManager.disposeSession).toHaveBeenCalledWith(
        'other-model-1-main'
      );
      expect(mockSessionManager.disposeSession).toHaveBeenCalledWith(
        'other-model-2-main'
      );
      expect(mockRegistry.unregisterModel).toHaveBeenCalledWith(
        'other-model-1'
      );
      expect(mockRegistry.unregisterModel).toHaveBeenCalledWith(
        'other-model-2'
      );
    });

    it('should handle loading error', async () => {
      const error = new Error('Loading failed');
      vi.mocked(mockModelDiscovery.getLocalModels).mockResolvedValue([
        mockModelInfo,
      ]);
      vi.mocked(mockRegistry.isModelActive).mockReturnValue(false);
      vi.mocked(mockRegistry.getLoadingLock).mockReturnValue(undefined);
      vi.mocked(mockRegistry.getActiveModelIds).mockReturnValue([]);
      (mockLlama.loadModel as ReturnType<typeof vi.fn>).mockRejectedValue(
        error
      );

      await expect(modelLoader.loadModel('test-model-1')).rejects.toThrow(
        'Loading failed'
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to load model test-model-1:',
        error
      );
    });

    it('should use layerCount to limit gpuLayers when available', async () => {
      const modelWithLayerCount = {
        ...mockModelInfo,
        layerCount: 10, // Less than settings.gpuLayers (16)
      };

      vi.mocked(mockModelDiscovery.getLocalModels).mockResolvedValue([
        modelWithLayerCount,
      ]);
      vi.mocked(mockRegistry.isModelActive).mockReturnValue(false);
      vi.mocked(mockRegistry.getLoadingLock).mockReturnValue(undefined);
      vi.mocked(mockRegistry.getActiveModelIds).mockReturnValue([]);

      await modelLoader.loadModel('test-model-1');

      expect(
        mockLlama.loadModel as ReturnType<typeof vi.fn>
      ).toHaveBeenCalledWith({
        modelPath: '/path/to/test-model.gguf',
        gpuLayers: 10, // Should use layerCount since it's less than settings
      });
    });

    it('should create session with correct parameters', async () => {
      vi.mocked(mockModelDiscovery.getLocalModels).mockResolvedValue([
        mockModelInfo,
      ]);
      vi.mocked(mockRegistry.isModelActive).mockReturnValue(false);
      vi.mocked(mockRegistry.getLoadingLock).mockReturnValue(undefined);
      vi.mocked(mockRegistry.getActiveModelIds).mockReturnValue([]);

      await modelLoader.loadModel('test-model-1');

      expect(mockSessionManager.createSession).toHaveBeenCalledWith(
        'test-model-1-main',
        mockModel,
        {
          contextSize: 4096,
          batchSize: 512,
        }
      );
    });

    it('should set loading lock during load', async () => {
      vi.mocked(mockModelDiscovery.getLocalModels).mockResolvedValue([
        mockModelInfo,
      ]);
      vi.mocked(mockRegistry.isModelActive).mockReturnValue(false);
      vi.mocked(mockRegistry.getLoadingLock).mockReturnValue(undefined);
      vi.mocked(mockRegistry.getActiveModelIds).mockReturnValue([]);

      await modelLoader.loadModel('test-model-1');

      expect(mockRegistry.setLoadingLock).toHaveBeenCalledWith(
        'test-model-1',
        expect.any(Promise)
      );
    });
  });

  describe('unloadModel', () => {
    it('should handle unloading non-loaded model', async () => {
      vi.mocked(mockRegistry.getModelRuntimeInfo).mockReturnValue(undefined);

      await modelLoader.unloadModel('non-loaded-model');

      expect(logger.warn).toHaveBeenCalledWith(
        'Model non-loaded-model is not loaded'
      );
      expect(mockSessionManager.disposeSession).not.toHaveBeenCalled();
    });

    it('should unload loaded model successfully', async () => {
      vi.mocked(mockRegistry.getModelRuntimeInfo).mockImplementation(
        () => ({}) as ModelRuntimeInfo
      );

      await modelLoader.unloadModel('test-model-1');

      expect(mockSessionManager.disposeSession).toHaveBeenCalledWith(
        'test-model-1-main'
      );
      expect(mockRegistry.unregisterModel).toHaveBeenCalledWith('test-model-1');
      expect(logger.info).toHaveBeenCalledWith(
        'Successfully unloaded model test-model-1'
      );
    });

    it('should handle unload errors', async () => {
      const error = new Error('Unload failed');
      vi.mocked(mockRegistry.getModelRuntimeInfo).mockImplementation(
        () => ({}) as ModelRuntimeInfo
      );
      vi.mocked(mockSessionManager.disposeSession).mockRejectedValue(error);

      await expect(modelLoader.unloadModel('test-model-1')).rejects.toThrow(
        'Unload failed'
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Error unloading model test-model-1:',
        error
      );
    });
  });

  describe('prepareModelForDeletion', () => {
    it('should skip unloading for non-active model', async () => {
      vi.mocked(mockRegistry.isModelActive).mockReturnValue(false);

      await modelLoader.prepareModelForDeletion('test-model-1');

      expect(mockRegistry.isModelActive).toHaveBeenCalledWith('test-model-1');
      expect(mockSessionManager.disposeSession).not.toHaveBeenCalled();
    });

    it('should unload active model', async () => {
      vi.mocked(mockRegistry.isModelActive).mockReturnValue(true);
      vi.mocked(mockRegistry.getModelRuntimeInfo).mockImplementation(
        () => ({}) as ModelRuntimeInfo
      );

      await modelLoader.prepareModelForDeletion('test-model-1');

      expect(mockRegistry.isModelActive).toHaveBeenCalledWith('test-model-1');
      expect(mockSessionManager.disposeSession).toHaveBeenCalledWith(
        'test-model-1-main'
      );
      expect(mockRegistry.unregisterModel).toHaveBeenCalledWith('test-model-1');
    });
  });
});
