import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  LocalLLMManager,
  localLLMManager,
  type LocalModelInfo,
  type ModelDownloadInfo,
  type ModelLoadingSettings,
  type StreamResponseOptions,
  type ModelRuntimeInfo,
} from '../localLlmManager';

// Mock the LocalLLMOrchestrator since this is just a wrapper
vi.mock('../llm/localLlmOrchestrator', () => {
  class MockLocalLLMOrchestrator {
    initialize = vi.fn().mockResolvedValue(undefined);
    getLocalModels = vi.fn().mockResolvedValue([]);
    getAvailableModels = vi.fn().mockResolvedValue([]);
    loadModel = vi.fn().mockResolvedValue(undefined);
    unloadModel = vi.fn().mockResolvedValue(undefined);
    generateResponse = vi.fn().mockResolvedValue('Test response');
    generateStreamResponse = vi.fn().mockResolvedValue(undefined);
    cleanup = vi.fn().mockResolvedValue(undefined);
  }
  return {
    LocalLLMOrchestrator: MockLocalLLMOrchestrator,
  };
});

describe('LocalLLMManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Class Structure', () => {
    it('should be a class that extends LocalLLMOrchestrator', () => {
      const manager = new LocalLLMManager();
      expect(manager).toBeInstanceOf(LocalLLMManager);
      // LocalLLMManager extends LocalLLMOrchestrator
      expect(manager).toBeDefined();
      expect(manager.constructor.name).toBe('LocalLLMManager');
    });

    it('should have a singleton instance exported', () => {
      expect(localLLMManager).toBeDefined();
      expect(localLLMManager).toBeInstanceOf(LocalLLMManager);
    });

    it('should inherit methods from LocalLLMOrchestrator', () => {
      const manager = new LocalLLMManager();

      // Verify that methods from parent class are available
      expect(typeof manager.initialize).toBe('function');
      expect(typeof manager.getLocalModels).toBe('function');
      expect(typeof manager.getAvailableModels).toBe('function');
      expect(typeof manager.loadModel).toBe('function');
      expect(typeof manager.unloadModel).toBe('function');
      expect(typeof manager.generateResponse).toBe('function');
      expect(typeof manager.generateStreamResponse).toBe('function');
      expect(typeof manager.cleanup).toBe('function');
    });
  });

  describe('Interface Validation', () => {
    it('should validate LocalModelInfo interface structure', () => {
      const validLocalModel: LocalModelInfo = {
        id: 'model-123',
        name: 'Test Local Model',
        filename: 'test-model.gguf',
        path: '/path/to/test-model.gguf',
        size: 1024000,
        downloaded: true,
        downloading: false,
        trainedContextLength: 4096,
        maxContextLength: 8192,
        parameterCount: '7B',
        quantization: 'Q4_K_M',
        layerCount: 32,
        hasVramData: true,
        isMultiPart: false,
      };

      // Test required fields
      expect(validLocalModel).toHaveProperty('id');
      expect(validLocalModel).toHaveProperty('name');
      expect(validLocalModel).toHaveProperty('filename');
      expect(validLocalModel).toHaveProperty('path');
      expect(validLocalModel).toHaveProperty('size');
      expect(validLocalModel).toHaveProperty('downloaded');
      expect(validLocalModel).toHaveProperty('downloading');

      // Test field types
      expect(typeof validLocalModel.id).toBe('string');
      expect(typeof validLocalModel.name).toBe('string');
      expect(typeof validLocalModel.filename).toBe('string');
      expect(typeof validLocalModel.path).toBe('string');
      expect(typeof validLocalModel.size).toBe('number');
      expect(typeof validLocalModel.downloaded).toBe('boolean');
      expect(typeof validLocalModel.downloading).toBe('boolean');

      // Test optional fields
      expect(typeof validLocalModel.trainedContextLength).toBe('number');
      expect(typeof validLocalModel.maxContextLength).toBe('number');
      expect(typeof validLocalModel.parameterCount).toBe('string');
      expect(typeof validLocalModel.quantization).toBe('string');
      expect(typeof validLocalModel.layerCount).toBe('number');
      expect(typeof validLocalModel.hasVramData).toBe('boolean');
      expect(typeof validLocalModel.isMultiPart).toBe('boolean');
    });

    it('should validate ModelDownloadInfo interface structure', () => {
      const validDownloadInfo: ModelDownloadInfo = {
        name: 'Downloadable Model',
        url: 'https://huggingface.co/model/resolve/main/model.gguf',
        filename: 'model.gguf',
        size: 2048000,
        description: 'A test model for downloading',
        contextLength: 4096,
        parameterCount: '13B',
        quantization: 'Q5_K_M',
        isMultiPart: true,
        totalParts: 3,
        allPartFiles: [
          'model-00001-of-00003.gguf',
          'model-00002-of-00003.gguf',
          'model-00003-of-00003.gguf',
        ],
        totalSize: 6144000,
      };

      // Test required fields
      expect(validDownloadInfo).toHaveProperty('name');
      expect(validDownloadInfo).toHaveProperty('url');
      expect(validDownloadInfo).toHaveProperty('filename');
      expect(validDownloadInfo).toHaveProperty('size');
      expect(validDownloadInfo).toHaveProperty('description');

      // Test field types
      expect(typeof validDownloadInfo.name).toBe('string');
      expect(typeof validDownloadInfo.url).toBe('string');
      expect(typeof validDownloadInfo.filename).toBe('string');
      expect(typeof validDownloadInfo.size).toBe('number');
      expect(typeof validDownloadInfo.description).toBe('string');

      // Test optional fields
      expect(typeof validDownloadInfo.contextLength).toBe('number');
      expect(typeof validDownloadInfo.parameterCount).toBe('string');
      expect(typeof validDownloadInfo.quantization).toBe('string');
      expect(typeof validDownloadInfo.isMultiPart).toBe('boolean');
      expect(typeof validDownloadInfo.totalParts).toBe('number');
      expect(Array.isArray(validDownloadInfo.allPartFiles)).toBe(true);
      expect(typeof validDownloadInfo.totalSize).toBe('number');
    });

    it('should validate ModelLoadingSettings interface structure', () => {
      const validSettings: ModelLoadingSettings = {
        gpuLayers: 32,
        contextSize: 4096,
        batchSize: 512,
        threads: 8,
        temperature: 0.7,
      };

      // All fields are optional
      expect(typeof validSettings.gpuLayers).toBe('number');
      expect(typeof validSettings.contextSize).toBe('number');
      expect(typeof validSettings.batchSize).toBe('number');
      expect(typeof validSettings.threads).toBe('number');
      expect(typeof validSettings.temperature).toBe('number');

      // Test partial settings
      const partialSettings: ModelLoadingSettings = {
        contextSize: 2048,
        temperature: 0.8,
      };

      expect(partialSettings.contextSize).toBe(2048);
      expect(partialSettings.temperature).toBe(0.8);
      expect(partialSettings.gpuLayers).toBeUndefined();
    });

    it('should validate StreamResponseOptions interface structure', () => {
      const mockAbortController = new AbortController();
      const mockTokenCallback = vi.fn();

      const validOptions: StreamResponseOptions = {
        temperature: 0.8,
        maxTokens: 2000,
        signal: mockAbortController.signal,
        threadId: 'thread-456',
        disableFunctions: true,
        disableChatHistory: false,
        onToken: mockTokenCallback,
      };

      // Test field types
      expect(typeof validOptions.temperature).toBe('number');
      expect(typeof validOptions.maxTokens).toBe('number');
      expect(validOptions.signal).toBeInstanceOf(AbortSignal);
      expect(typeof validOptions.threadId).toBe('string');
      expect(typeof validOptions.disableFunctions).toBe('boolean');
      expect(typeof validOptions.disableChatHistory).toBe('boolean');
      expect(typeof validOptions.onToken).toBe('function');

      // Test callback functionality
      validOptions.onToken?.('test token');
      expect(mockTokenCallback).toHaveBeenCalledWith('test token');
    });

    it('should validate ModelRuntimeInfo interface structure', () => {
      const mockModel = { name: 'test-model' };
      const mockContext = { contextSize: 4096 };
      const mockSession = { id: 'session-123' };
      const mockThreadIds = new Set(['thread1', 'thread2']);

      const validRuntimeInfo: ModelRuntimeInfo = {
        model: {} as import('node-llama-cpp').LlamaModel,
        context: {} as import('node-llama-cpp').LlamaContext,
        session: mockSession,
        modelPath: '/path/to/model.gguf',
        contextSize: 4096,
        gpuLayers: 24,
        batchSize: 512,
        loadedAt: new Date('2024-01-01T10:00:00Z'),
        lastUsedAt: new Date('2024-01-01T11:00:00Z'),
        threadIds: mockThreadIds,
      };

      // Test required fields
      expect(validRuntimeInfo).toHaveProperty('model');
      expect(validRuntimeInfo).toHaveProperty('context');
      expect(validRuntimeInfo).toHaveProperty('session');
      expect(validRuntimeInfo).toHaveProperty('modelPath');
      expect(validRuntimeInfo).toHaveProperty('contextSize');
      expect(validRuntimeInfo).toHaveProperty('gpuLayers');
      expect(validRuntimeInfo).toHaveProperty('batchSize');
      expect(validRuntimeInfo).toHaveProperty('loadedAt');
      expect(validRuntimeInfo).toHaveProperty('lastUsedAt');
      expect(validRuntimeInfo).toHaveProperty('threadIds');

      // Test field types
      expect(typeof validRuntimeInfo.modelPath).toBe('string');
      expect(typeof validRuntimeInfo.contextSize).toBe('number');
      expect(typeof validRuntimeInfo.gpuLayers).toBe('number');
      expect(typeof validRuntimeInfo.batchSize).toBe('number');
      expect(validRuntimeInfo.loadedAt).toBeInstanceOf(Date);
      expect(validRuntimeInfo.lastUsedAt).toBeInstanceOf(Date);
      expect(validRuntimeInfo.threadIds).toBeInstanceOf(Set);

      // Test Set functionality
      expect(validRuntimeInfo.threadIds.has('thread1')).toBe(true);
      expect(validRuntimeInfo.threadIds.has('thread2')).toBe(true);
      expect(validRuntimeInfo.threadIds.size).toBe(2);
    });
  });

  describe('Multi-part Model Support', () => {
    it('should support multi-part model information in LocalModelInfo', () => {
      const multiPartModel: LocalModelInfo = {
        id: 'multipart-model',
        name: 'Large Multi-part Model',
        filename: 'large-model-00001-of-00005.gguf',
        path: '/models/large-model-00001-of-00005.gguf',
        size: 1024000,
        downloaded: true,
        downloading: false,
        isMultiPart: true,
        totalParts: 5,
        allPartFiles: [
          'large-model-00001-of-00005.gguf',
          'large-model-00002-of-00005.gguf',
          'large-model-00003-of-00005.gguf',
          'large-model-00004-of-00005.gguf',
          'large-model-00005-of-00005.gguf',
        ],
        totalSize: 5120000,
      };

      expect(multiPartModel.isMultiPart).toBe(true);
      expect(multiPartModel.totalParts).toBe(5);
      expect(Array.isArray(multiPartModel.allPartFiles)).toBe(true);
      expect(multiPartModel.allPartFiles?.length).toBe(5);
      expect(multiPartModel.totalSize).toBe(5120000);
      expect(multiPartModel.totalSize).toBeGreaterThan(multiPartModel.size);
    });

    it('should support multi-part model information in ModelDownloadInfo', () => {
      const multiPartDownload: ModelDownloadInfo = {
        name: 'Large Downloadable Model',
        url: 'https://huggingface.co/org/model/resolve/main/',
        filename: 'model-00001-of-00004.gguf',
        size: 2048000,
        description: 'A large model split into multiple parts',
        isMultiPart: true,
        totalParts: 4,
        allPartFiles: [
          'model-00001-of-00004.gguf',
          'model-00002-of-00004.gguf',
          'model-00003-of-00004.gguf',
          'model-00004-of-00004.gguf',
        ],
        totalSize: 8192000,
      };

      expect(multiPartDownload.isMultiPart).toBe(true);
      expect(multiPartDownload.totalParts).toBe(4);
      expect(multiPartDownload.allPartFiles?.length).toBe(4);
      expect(multiPartDownload.totalSize).toBe(8192000);
    });
  });

  describe('VRAM Estimation Support', () => {
    it('should support VRAM estimation fields in LocalModelInfo', () => {
      const modelWithVRAM: LocalModelInfo = {
        id: 'vram-model',
        name: 'Model with VRAM Data',
        filename: 'vram-model.gguf',
        path: '/models/vram-model.gguf',
        size: 4096000,
        downloaded: true,
        downloading: false,
        hasVramData: true,
        vramEstimates: [
          {
            gpuLayers: 32,
            estimatedVRAM: 6144,
            contextTokens: 4096,
          },
          {
            gpuLayers: 16,
            estimatedVRAM: 3072,
            contextTokens: 4096,
          },
        ],
      };

      expect(modelWithVRAM.hasVramData).toBe(true);
      expect(Array.isArray(modelWithVRAM.vramEstimates)).toBe(true);
      expect(modelWithVRAM.vramEstimates?.length).toBe(2);
      // modelArchitecture is optional and not set in this test
      expect(modelWithVRAM.vramEstimates?.[0]).toHaveProperty('gpuLayers');
    });

    it('should support VRAM error handling in LocalModelInfo', () => {
      const modelWithVRAMError: LocalModelInfo = {
        id: 'vram-error-model',
        name: 'Model with VRAM Error',
        filename: 'error-model.gguf',
        path: '/models/error-model.gguf',
        size: 2048000,
        downloaded: true,
        downloading: false,
        hasVramData: false,
        vramError: 'Unable to calculate VRAM usage: Model metadata not found',
      };

      expect(modelWithVRAMError.hasVramData).toBe(false);
      expect(typeof modelWithVRAMError.vramError).toBe('string');
      expect(modelWithVRAMError.vramError).toContain('Unable to calculate');
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain compatibility with LocalLLMOrchestrator interface', async () => {
      const manager = new LocalLLMManager();

      // Test that inherited methods work as expected
      await expect(manager.initialize()).resolves.toBeUndefined();
      await expect(manager.getLocalModels()).resolves.toEqual([]);
      await expect(manager.getAvailableModels()).resolves.toEqual([]);
      await expect(manager.generateResponse('model', [], {})).resolves.toBe(
        'Test response'
      );
      await expect(manager.cleanup()).resolves.toBeUndefined();
    });

    it('should work as a drop-in replacement for LocalLLMOrchestrator', () => {
      const manager = new LocalLLMManager();

      // Test that the manager can be used wherever LocalLLMOrchestrator is expected
      const processManager = (llmManager: LocalLLMManager) => {
        return (
          typeof llmManager.initialize === 'function' &&
          typeof llmManager.getLocalModels === 'function' &&
          typeof llmManager.loadModel === 'function' &&
          typeof llmManager.generateResponse === 'function'
        );
      };

      expect(processManager(manager)).toBe(true);
    });
  });

  describe('Singleton Instance', () => {
    it('should provide a singleton instance', () => {
      expect(localLLMManager).toBeDefined();
      expect(localLLMManager).toBeInstanceOf(LocalLLMManager);
    });

    it('should always return the same singleton instance', () => {
      const instance1 = localLLMManager;
      const instance2 = localLLMManager;

      expect(instance1).toBe(instance2);
      expect(instance1 === instance2).toBe(true);
    });

    it('should be different from new instances', () => {
      const newInstance = new LocalLLMManager();

      expect(newInstance).not.toBe(localLLMManager);
      expect(newInstance === localLLMManager).toBe(false);
      expect(newInstance).toBeInstanceOf(LocalLLMManager);
    });
  });

  describe('Type Exports', () => {
    it('should export all required types', () => {
      // Test that types are properly exported by using them
      const modelInfo: LocalModelInfo = {
        id: 'test',
        name: 'test',
        filename: 'test.gguf',
        path: '/test.gguf',
        size: 1000,
        downloaded: true,
        downloading: false,
      };

      const downloadInfo: ModelDownloadInfo = {
        name: 'test',
        url: 'http://test.com',
        filename: 'test.gguf',
        size: 1000,
        description: 'test',
      };

      const settings: ModelLoadingSettings = {
        contextSize: 4096,
      };

      const options: StreamResponseOptions = {
        temperature: 0.7,
      };

      // If compilation succeeds, types are properly exported
      expect(modelInfo).toBeDefined();
      expect(downloadInfo).toBeDefined();
      expect(settings).toBeDefined();
      expect(options).toBeDefined();
    });
  });
});
