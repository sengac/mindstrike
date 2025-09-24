import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelDiscovery } from '../modelDiscovery';
import type { ModelFileManager } from '../modelFileManager';
import type { ModelDownloader } from '../modelDownloader';
import type { ContextCalculator } from '../contextCalculator';
import type { LocalModelInfo, ModelDownloadInfo } from '../../localLlmManager';
import type { DynamicModelInfo } from '../../modelFetcher';

describe('ModelDiscovery', () => {
  let modelDiscovery: ModelDiscovery;
  let mockFileManager: Partial<ModelFileManager>;
  let mockDownloader: Partial<ModelDownloader>;
  let mockContextCalculator: Partial<ContextCalculator>;

  const mockLocalModel: LocalModelInfo = {
    id: 'model1',
    name: 'Test Model',
    filename: 'test-model.gguf',
    path: '/models/test-model.gguf',
    size: 1000000,
    downloaded: true,
    downloading: false,
    contextLength: 4096,
    parameterCount: '7B',
    quantization: 'Q4_K_M',
    layerCount: 32,
  };

  const mockRemoteModel: DynamicModelInfo = {
    name: 'Remote Model',
    url: 'https://example.com/model.gguf',
    filename: 'remote-model.gguf',
    size: 2000000,
    description: 'A remote model',
    contextLength: 8192,
    parameterCount: '13B',
    quantization: 'Q5_K_M',
    downloads: 1000,
    modelId: 'remote1',
    accessibility: 'accessible',
    huggingFaceUrl: 'https://huggingface.co/model',
    username: 'user',
  };

  beforeEach(() => {
    mockFileManager = {
      getLocalModels: vi.fn().mockResolvedValue([mockLocalModel]),
      getModelPath: vi.fn((filename: string) => `/models/${filename}`),
      deleteModelFile: vi.fn().mockResolvedValue(undefined),
    };

    mockDownloader = {
      getAvailableModels: vi.fn().mockResolvedValue([mockRemoteModel]),
      searchModels: vi.fn().mockResolvedValue([mockRemoteModel]),
      downloadModel: vi.fn().mockResolvedValue(undefined),
      cancelDownload: vi.fn().mockReturnValue(true),
      getDownloadProgress: vi
        .fn()
        .mockReturnValue({ progress: 50, speed: '10 MB/s' }),
    };

    mockContextCalculator = {
      calculateSafeContextSize: vi.fn().mockResolvedValue(4096),
    };

    modelDiscovery = new ModelDiscovery(
      mockFileManager as ModelFileManager,
      mockDownloader as ModelDownloader,
      mockContextCalculator as ContextCalculator
    );
  });

  describe('getLocalModels', () => {
    it('should return local models', async () => {
      const result = await modelDiscovery.getLocalModels();

      expect(result).toEqual([mockLocalModel]);
      expect(mockFileManager.getLocalModels).toHaveBeenCalled();
    });
  });

  describe('getAvailableModels', () => {
    it('should return both local and remote models', async () => {
      const result = await modelDiscovery.getAvailableModels();

      expect(result).toEqual({
        local: [mockLocalModel],
        remote: [mockRemoteModel],
      });
      expect(mockFileManager.getLocalModels).toHaveBeenCalled();
      expect(mockDownloader.getAvailableModels).toHaveBeenCalled();
    });
  });

  describe('searchModels', () => {
    it('should filter local models by query and get remote results', async () => {
      const result = await modelDiscovery.searchModels('test');

      expect(result).toEqual({
        local: [mockLocalModel],
        remote: [mockRemoteModel],
      });
      expect(mockDownloader.searchModels).toHaveBeenCalledWith('test');
    });

    it('should filter by filename when name does not match', async () => {
      const result = await modelDiscovery.searchModels('gguf');

      expect(result.local).toHaveLength(1);
      expect(result.local[0]).toEqual(mockLocalModel);
    });

    it('should return empty local results when no matches', async () => {
      const result = await modelDiscovery.searchModels('nonexistent');

      expect(result.local).toHaveLength(0);
    });
  });

  describe('downloadModel', () => {
    it('should download a model with progress callback', async () => {
      const onProgress = vi.fn();
      const modelInfo: ModelDownloadInfo = {
        name: 'Download Model',
        url: 'https://example.com/download.gguf',
        filename: 'download.gguf',
        size: 3000000,
        description: 'A model to download',
      };

      await modelDiscovery.downloadModel(modelInfo, onProgress);

      expect(mockFileManager.getModelPath).toHaveBeenCalledWith(
        'download.gguf'
      );
      expect(mockDownloader.downloadModel).toHaveBeenCalledWith(
        modelInfo,
        '/models/download.gguf',
        { onProgress }
      );
    });
  });

  describe('cancelDownload', () => {
    it('should cancel a download by filename', () => {
      const result = modelDiscovery.cancelDownload('test.gguf');

      expect(result).toBe(true);
      expect(mockDownloader.cancelDownload).toHaveBeenCalledWith('test.gguf');
    });
  });

  describe('getDownloadProgress', () => {
    it('should get download progress by filename', () => {
      const result = modelDiscovery.getDownloadProgress('test.gguf');

      expect(result).toEqual({ progress: 50, speed: '10 MB/s' });
      expect(mockDownloader.getDownloadProgress).toHaveBeenCalledWith(
        'test.gguf'
      );
    });
  });

  describe('deleteModel', () => {
    it('should delete a model by ID', async () => {
      await modelDiscovery.deleteModel('model1');

      expect(mockFileManager.deleteModelFile).toHaveBeenCalledWith(
        '/models/test-model.gguf'
      );
    });

    it('should throw error if model not found', async () => {
      await expect(modelDiscovery.deleteModel('nonexistent')).rejects.toThrow(
        'Model nonexistent not found'
      );
    });
  });
});
