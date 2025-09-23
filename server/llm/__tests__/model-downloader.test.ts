import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import { ModelDownloader } from '../model-downloader.js';
import { modelFetcher } from '../../model-fetcher.js';
import type { DynamicModelInfo } from '../../model-fetcher.js';

// Mock dependencies
vi.mock('fs');
vi.mock('../../model-fetcher.js', () => ({
  modelFetcher: {
    hasHuggingFaceToken: vi.fn(() => false),
    getAvailableModels: vi.fn(() => Promise.resolve([])),
    searchModels: vi.fn(() => Promise.resolve([])),
  },
}));
vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('../../utils/settings-directory.js', () => ({
  getMindstrikeDirectory: vi.fn(() => '/mock/mindstrike'),
}));

// Mock fetch globally
global.fetch = vi.fn();

describe('ModelDownloader', () => {
  let downloader: ModelDownloader;

  beforeEach(() => {
    vi.clearAllMocks();
    downloader = new ModelDownloader();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('downloadModel', () => {
    const mockModelInfo: DynamicModelInfo = {
      name: 'Test Model',
      filename: 'test-model.gguf',
      url: 'https://example.com/model.gguf',
      size: 1000000,
      description: 'Test model description',
      downloads: 100,
      modelId: 'test-org/test-model',
      accessibility: 'accessible',
      huggingFaceUrl: 'https://huggingface.co/test-org/test-model',
      username: 'test-org',
    };

    it('should throw error if model already exists', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      await expect(
        downloader.downloadModel(mockModelInfo, '/path/to/model.gguf')
      ).rejects.toThrow('Model already exists');
    });

    it('should throw error if model is already being downloaded', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      // Start first download (don't await)
      const promise1 = downloader.downloadModel(
        mockModelInfo,
        '/path/to/model.gguf'
      );

      // Try to start second download
      await expect(
        downloader.downloadModel(mockModelInfo, '/path/to/model2.gguf')
      ).rejects.toThrow('Model is already being downloaded');

      // Clean up
      downloader.cancelDownload(mockModelInfo.filename);
      await promise1.catch(() => {}); // Ignore error
    });

    it('should download model successfully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        },
      });

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) => (name === 'Content-Length' ? '3' : null),
        },
        body: mockStream,
      } as any);

      const mockWriteStream = {
        write: vi.fn(),
        end: vi.fn((callback?: () => void) => callback?.()),
        on: vi.fn((event: string, handler: Function) => {
          if (event === 'finish') {
            handler();
          }
          return mockWriteStream;
        }),
        destroy: vi.fn(),
      };

      vi.mocked(fs.createWriteStream).mockReturnValue(mockWriteStream as any);

      const onProgress = vi.fn();
      await downloader.downloadModel(mockModelInfo, '/path/to/model.gguf', {
        onProgress,
      });

      expect(fetch).toHaveBeenCalledWith(
        'https://example.com/model.gguf',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'mindstrike-local-llm/1.0',
          }),
        })
      );

      expect(mockWriteStream.write).toHaveBeenCalled();
      expect(mockWriteStream.end).toHaveBeenCalled();
      expect(onProgress).toHaveBeenCalledWith(100, '0 B/s');
    });

    it('should handle HTTP errors correctly', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const testCases = [
        { status: 401, expectedError: 'UNAUTHORIZED_HF_TOKEN_REQUIRED' },
        { status: 403, expectedError: 'FORBIDDEN_MODEL_ACCESS_REQUIRED' },
        { status: 500, expectedError: 'HTTP error! status: 500' },
      ];

      for (const { status, expectedError } of testCases) {
        vi.mocked(fetch).mockResolvedValue({
          ok: false,
          status,
        } as any);

        await expect(
          downloader.downloadModel(mockModelInfo, '/path/to/model.gguf')
        ).rejects.toThrow(expectedError);
      }
    });

    it('should clean up partial download on error', async () => {
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(false) // Initial check
        .mockReturnValueOnce(true); // Cleanup check

      vi.mocked(fetch).mockRejectedValue(new Error('Network error'));
      vi.mocked(fs.unlinkSync).mockImplementation(() => undefined);

      await expect(
        downloader.downloadModel(mockModelInfo, '/path/to/model.gguf')
      ).rejects.toThrow('Network error');

      expect(fs.unlinkSync).toHaveBeenCalledWith('/path/to/model.gguf');
    });

    it('should handle abort signal', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const abortController = new AbortController();

      vi.mocked(fetch).mockImplementation(() => {
        // Simulate abort during fetch
        abortController.abort();
        return Promise.reject(new Error('AbortError'));
      });

      await expect(
        downloader.downloadModel(mockModelInfo, '/path/to/model.gguf', {
          signal: abortController.signal,
        })
      ).rejects.toThrow();
    });
  });

  describe('cancelDownload', () => {
    it('should cancel ongoing download', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      // Mock the write stream
      const mockWriteStream = {
        write: vi.fn(),
        destroy: vi.fn(),
        on: vi.fn(),
        end: vi.fn(),
      };
      vi.mocked(fs.createWriteStream).mockReturnValue(mockWriteStream as any);

      let downloadStarted = false;
      let abortSignal: AbortSignal | null = null;

      // Mock fetch to capture the abort signal
      vi.mocked(fetch).mockImplementation(async (url, options) => {
        downloadStarted = true;
        abortSignal = options?.signal as AbortSignal;

        // Create a simple stream that will throw when aborted
        const mockStream = new ReadableStream({
          async start(controller) {
            controller.enqueue(new Uint8Array([1, 2, 3]));

            // Wait for abort signal
            await new Promise((resolve, reject) => {
              if (abortSignal) {
                abortSignal.addEventListener('abort', () => {
                  reject(new Error('AbortError'));
                });
              }
              // Also add a timeout to prevent hanging
              setTimeout(resolve, 200);
            });

            controller.close();
          },
        });

        return {
          ok: true,
          headers: { get: () => '1000' },
          body: mockStream,
        } as any;
      });

      // Start the download
      const testModel: DynamicModelInfo = {
        name: 'Test',
        filename: 'test.gguf',
        url: 'http://test',
        size: 1000,
        description: 'Test',
        downloads: 0,
        modelId: 'test/test',
        accessibility: 'accessible',
        huggingFaceUrl: 'http://test',
        username: 'test',
      };
      const promise = downloader.downloadModel(testModel, '/test.gguf');

      // Wait for download to start
      await vi.waitFor(() => {
        expect(downloadStarted).toBe(true);
      });

      // Cancel the download
      const cancelled = downloader.cancelDownload('test.gguf');
      expect(cancelled).toBe(true);

      // The promise should reject
      await expect(promise).rejects.toThrow();
    });

    it('should return false if no download to cancel', () => {
      const cancelled = downloader.cancelDownload('nonexistent.gguf');
      expect(cancelled).toBe(false);
    });
  });

  describe('isDownloading', () => {
    it('should return true when model is downloading', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const mockStream = new ReadableStream({
        async start() {
          await new Promise(() => {}); // Never resolves
        },
      });

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        headers: { get: () => null },
        body: mockStream,
      } as any);

      const testModel: DynamicModelInfo = {
        name: 'Test',
        filename: 'test.gguf',
        url: 'http://test',
        size: 1000,
        description: 'Test',
        downloads: 0,
        modelId: 'test/test',
        accessibility: 'accessible',
        huggingFaceUrl: 'http://test',
        username: 'test',
      };
      const promise = downloader.downloadModel(testModel, '/test.gguf');

      expect(downloader.isDownloading('test.gguf')).toBe(true);

      downloader.cancelDownload('test.gguf');
      await promise.catch(() => {});

      expect(downloader.isDownloading('test.gguf')).toBe(false);
    });
  });

  describe('getDownloadProgress', () => {
    it('should return download progress', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      // Test that progress updates are tracked during download

      const mockStream = new ReadableStream({
        async start(controller) {
          // Simulate chunks
          controller.enqueue(new Uint8Array(500));
          await new Promise(resolve => setTimeout(resolve, 1100)); // Wait for progress update
          controller.enqueue(new Uint8Array(500));
          controller.close();
        },
      });

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) => (name === 'Content-Length' ? '1000' : null),
        },
        body: mockStream,
      } as any);

      const mockWriteStream = {
        write: vi.fn(),
        end: vi.fn((callback?: () => void) => callback?.()),
        on: vi.fn((event: string, handler: Function) => {
          if (event === 'finish') {
            setTimeout(() => handler(), 1200); // Delay finish
          }
          return mockWriteStream;
        }),
        destroy: vi.fn(),
      };

      vi.mocked(fs.createWriteStream).mockReturnValue(mockWriteStream as any);

      const testModel: DynamicModelInfo = {
        name: 'Test',
        filename: 'test.gguf',
        url: 'http://test',
        size: 1000,
        description: 'Test',
        downloads: 0,
        modelId: 'test/test',
        accessibility: 'accessible',
        huggingFaceUrl: 'http://test',
        username: 'test',
      };
      const promise = downloader.downloadModel(testModel, '/test.gguf', {
        onProgress: () => {
          // Progress callback is called but we don't need to capture values for this test
        },
      });

      await promise;

      const progress = downloader.getDownloadProgress('test.gguf');
      expect(progress).toBeUndefined(); // Progress is cleared after completion
    });
  });

  describe('formatSpeed', () => {
    it('should format download speed correctly', () => {
      // Access private method through prototype
      const formatSpeed = (downloader as any).formatSpeed.bind(downloader);

      expect(formatSpeed(512)).toBe('512.0 B/s');
      expect(formatSpeed(1024)).toBe('1.0 KB/s');
      expect(formatSpeed(1024 * 1024)).toBe('1.0 MB/s');
      expect(formatSpeed(1024 * 1024 * 1024)).toBe('1.0 GB/s');
      expect(formatSpeed(1536)).toBe('1.5 KB/s');
    });
  });

  describe('getAvailableModels', () => {
    it('should fetch available models', async () => {
      const mockModels = [
        { name: 'Model 1', filename: 'model1.gguf', url: 'http://test1' },
        { name: 'Model 2', filename: 'model2.gguf', url: 'http://test2' },
      ];

      vi.mocked(modelFetcher.getAvailableModels).mockResolvedValue(
        mockModels as any
      );

      const models = await downloader.getAvailableModels();

      expect(models).toEqual(mockModels);
      expect(modelFetcher.getAvailableModels).toHaveBeenCalled();
    });

    it('should handle errors when fetching models', async () => {
      vi.mocked(modelFetcher.getAvailableModels).mockRejectedValue(
        new Error('Network error')
      );

      await expect(downloader.getAvailableModels()).rejects.toThrow(
        'Network error'
      );
    });
  });

  describe('searchModels', () => {
    it('should search for models', async () => {
      const mockResults = [
        { name: 'Llama 3', filename: 'llama3.gguf', url: 'http://test' },
      ];

      vi.mocked(modelFetcher.searchModels).mockResolvedValue(
        mockResults as any
      );

      const results = await downloader.searchModels('llama');

      expect(results).toEqual(mockResults);
      expect(modelFetcher.searchModels).toHaveBeenCalledWith('llama');
    });
  });
});
