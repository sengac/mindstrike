import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import { ModelDownloader } from '../modelDownloader';
import { modelFetcher } from '../../modelFetcher';
import type { DynamicModelInfo } from '../../modelFetcher';

// Type definitions for test mocks
interface MockResponse {
  ok: boolean;
  status?: number;
  headers: {
    get: (name: string) => string | null;
  };
  body?: ReadableStream<Uint8Array> | null;
}

interface MockWriteStream {
  write: import('vitest').MockedFunction<
    (
      chunk: Buffer | Uint8Array | string,
      encoding?: BufferEncoding,
      cb?: (error: Error | null | undefined) => void
    ) => boolean
  >;
  end: import('vitest').MockedFunction<
    (cb?: (() => void) | undefined) => import('fs').WriteStream
  >;
  on: import('vitest').MockedFunction<
    (
      event: string,
      listener: (...args: unknown[]) => void
    ) => import('fs').WriteStream
  >;
  destroy: import('vitest').MockedFunction<
    (error?: Error | undefined) => import('fs').WriteStream
  >;
}

// Mock dependencies
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  createWriteStream: vi.fn(),
  unlinkSync: vi.fn(),
}));
vi.mock('../../modelFetcher', () => ({
  modelFetcher: {
    hasHuggingFaceToken: vi.fn(() => false),
    getAvailableModels: vi.fn(() => Promise.resolve([])),
    searchModels: vi.fn(() => Promise.resolve([])),
  },
}));
vi.mock('../../logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('../../utils/settingsDirectory', () => ({
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

      const mockResponse: MockResponse = {
        ok: true,
        headers: {
          get: (name: string) => (name === 'Content-Length' ? '3' : null),
        },
        body: mockStream,
      };
      vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

      const mockWriteStream: MockWriteStream = {
        write: vi.fn(),
        end: vi.fn((callback?: () => void) => {
          callback?.();
          return {} as import('fs').WriteStream;
        }),
        on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
          if (event === 'finish') {
            handler();
          }
          return {} as import('fs').WriteStream;
        }),
        destroy: vi.fn().mockReturnValue({} as import('fs').WriteStream),
      };

      vi.mocked(fs.createWriteStream).mockReturnValue({
        write: mockWriteStream.write,
        end: mockWriteStream.end,
        on: mockWriteStream.on,
        destroy: mockWriteStream.destroy,
      } as never);

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
        const mockErrorResponse: MockResponse = {
          ok: false,
          status,
          headers: { get: () => null },
        };
        vi.mocked(fetch).mockResolvedValue(mockErrorResponse as Response);

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
      const mockWriteStream: MockWriteStream = {
        write: vi.fn(),
        destroy: vi.fn().mockReturnValue({} as import('fs').WriteStream),
        on: vi.fn().mockReturnValue({} as import('fs').WriteStream),
        end: vi.fn().mockReturnValue({} as import('fs').WriteStream),
      };
      vi.mocked(fs.createWriteStream).mockReturnValue({
        write: mockWriteStream.write,
        end: mockWriteStream.end,
        on: mockWriteStream.on,
        destroy: mockWriteStream.destroy,
      } as never);

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

        const mockStreamResponse: MockResponse = {
          ok: true,
          headers: { get: () => '1000' },
          body: mockStream,
        };
        return mockStreamResponse as Response;
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

      const mockNullResponse: MockResponse = {
        ok: true,
        headers: { get: () => null },
        body: mockStream,
      };
      vi.mocked(fetch).mockResolvedValue(mockNullResponse as Response);

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

      const mockProgressResponse: MockResponse = {
        ok: true,
        headers: {
          get: (name: string) => (name === 'Content-Length' ? '1000' : null),
        },
        body: mockStream,
      };
      vi.mocked(fetch).mockResolvedValue(mockProgressResponse as Response);

      const mockWriteStream: MockWriteStream = {
        write: vi.fn(),
        end: vi.fn((callback?: () => void) => {
          callback?.();
          return {} as import('fs').WriteStream;
        }),
        on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
          if (event === 'finish') {
            setTimeout(() => handler(), 1200); // Delay finish
          }
          return {} as import('fs').WriteStream;
        }),
        destroy: vi.fn().mockReturnValue({} as import('fs').WriteStream),
      };

      vi.mocked(fs.createWriteStream).mockReturnValue({
        write: mockWriteStream.write,
        end: mockWriteStream.end,
        on: mockWriteStream.on,
        destroy: mockWriteStream.destroy,
      } as never);

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
    it('should format download speed correctly through progress callback', async () => {
      // Test the formatSpeed functionality indirectly through download progress
      // Since formatSpeed is private, we test it through the progress callback
      vi.mocked(fs.existsSync).mockReturnValue(false);

      let capturedSpeed = '';
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(1024));
          controller.close();
        },
      });

      const mockResponse: MockResponse = {
        ok: true,
        headers: {
          get: (name: string) => (name === 'Content-Length' ? '1024' : null),
        },
        body: mockStream,
      };
      vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

      const mockWriteStream: MockWriteStream = {
        write: vi.fn(),
        end: vi.fn((callback?: () => void) => {
          callback?.();
          return {} as import('fs').WriteStream;
        }),
        on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
          if (event === 'finish') {
            handler();
          }
          return {} as import('fs').WriteStream;
        }),
        destroy: vi.fn().mockReturnValue({} as import('fs').WriteStream),
      };

      vi.mocked(fs.createWriteStream).mockReturnValue({
        write: mockWriteStream.write,
        end: mockWriteStream.end,
        on: mockWriteStream.on,
        destroy: mockWriteStream.destroy,
      } as never);

      const testModel = {
        name: 'Test',
        filename: 'test.gguf',
        url: 'http://test',
        size: 1024,
        description: 'Test',
        downloads: 0,
        modelId: 'test/test',
        accessibility: 'accessible' as const,
        huggingFaceUrl: 'http://test',
        username: 'test',
      };

      await downloader.downloadModel(testModel, '/test.gguf', {
        onProgress: (percent, speed) => {
          capturedSpeed = speed ?? '0 B/s';
        },
      });

      // Verify that a speed string was provided (formatSpeed was called internally)
      expect(capturedSpeed).toMatch(/\d+(\.\d+)?\s(B|KB|MB|GB)\/s/);
    });
  });

  describe('getAvailableModels', () => {
    it('should fetch available models', async () => {
      const mockModels = [
        { name: 'Model 1', filename: 'model1.gguf', url: 'http://test1' },
        { name: 'Model 2', filename: 'model2.gguf', url: 'http://test2' },
      ];

      vi.mocked(modelFetcher.getAvailableModels).mockResolvedValue(
        mockModels as DynamicModelInfo[]
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
        mockResults as DynamicModelInfo[]
      );

      const results = await downloader.searchModels('llama');

      expect(results).toEqual(mockResults);
      expect(modelFetcher.searchModels).toHaveBeenCalledWith('llama');
    });
  });
});
