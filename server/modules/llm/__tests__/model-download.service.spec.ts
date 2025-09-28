import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ModelDownloadService } from '../services/model-download.service';
import type { ConfigService } from '@nestjs/config';
import type { SseService } from '../../events/services/sse.service';
import type { DownloadModelDto } from '../dto/llm.dto';

// Create mock functions
const mockDownloadModel = vi.fn();
const mockCancelDownload = vi.fn();

// Mock the localLlmSingleton module
vi.mock('../../../localLlmSingleton', () => ({
  getLocalLLMManager: vi.fn(() => ({
    downloadModel: mockDownloadModel,
    cancelDownload: mockCancelDownload,
  })),
}));

describe('ModelDownloadService', () => {
  let service: ModelDownloadService;
  let mockConfigService: Partial<ConfigService>;
  let mockSseService: Partial<SseService>;

  beforeEach(() => {
    mockConfigService = {
      get: vi.fn(),
    };

    mockSseService = {
      broadcast: vi.fn(),
    };

    service = new ModelDownloadService(
      mockConfigService as ConfigService,
      mockSseService as SseService
    );

    // Clear all mocks before each test
    vi.clearAllMocks();
    mockDownloadModel.mockReset();
    mockCancelDownload.mockReset();
  });

  describe('downloadModel', () => {
    it('should handle Express-style field names correctly', async () => {
      const dto: DownloadModelDto = {
        modelUrl: 'https://example.com/model.gguf',
        modelName: 'Test Model',
        filename: 'test-model.gguf',
        size: 1000000,
        description: 'Test description',
        contextLength: 4096,
        parameterCount: '7B',
        quantization: 'Q4_K_M',
      };

      // No need to import, we already have the mock

      // Setup mock to simulate successful download
      mockDownloadModel.mockImplementation((modelInfo, progressCallback) => {
        // Simulate progress callback
        if (progressCallback) {
          progressCallback(50, '1.2 MB/s');
        }

        return Promise.resolve();
      });

      const result = await service.downloadModel(dto);

      expect(result).toEqual({
        success: true,
        message: 'Model download started',
        downloadId: expect.stringContaining('Test Model'),
        name: 'Test Model',
        filename: 'test-model.gguf',
      });

      // Verify the model info was transformed correctly
      expect(mockDownloadModel).toHaveBeenCalledWith(
        {
          name: 'Test Model',
          url: 'https://example.com/model.gguf',
          filename: 'test-model.gguf',
          size: 1000000,
          description: 'Test description',
          contextLength: 4096,
          parameterCount: '7B',
          quantization: 'Q4_K_M',
          isMultiPart: undefined,
          totalParts: undefined,
          allPartFiles: undefined,
          totalSize: undefined,
        },
        expect.any(Function)
      );

      // Verify SSE broadcast was called with progress
      expect(mockSseService.broadcast).toHaveBeenCalledWith('unified-events', {
        type: 'download-progress',
        data: {
          filename: 'test-model.gguf',
          progress: 50,
          speed: '1.2 MB/s',
          isDownloading: true,
        },
      });
    });

    it('should use filename as name when modelName is not provided', async () => {
      const dto: DownloadModelDto = {
        modelUrl: 'https://example.com/model.gguf',
        filename: 'test-model.gguf',
        size: 1000000,
      };

      // No need to import, we already have the mock
      mockDownloadModel.mockResolvedValue(undefined);

      const result = await service.downloadModel(dto);

      expect(result.name).toBe('test-model.gguf');

      expect(mockDownloadModel).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test-model.gguf',
          url: 'https://example.com/model.gguf',
          filename: 'test-model.gguf',
        }),
        expect.any(Function)
      );
    });

    it('should throw error when modelUrl is missing', async () => {
      const dto: DownloadModelDto = {
        filename: 'test-model.gguf',
        size: 1000000,
      };

      await expect(service.downloadModel(dto)).rejects.toThrow(
        'Model URL and filename are required'
      );
    });

    it('should throw error when filename is missing', async () => {
      const dto: DownloadModelDto = {
        modelUrl: 'https://example.com/model.gguf',
        size: 1000000,
      };

      await expect(service.downloadModel(dto)).rejects.toThrow(
        'Model URL and filename are required'
      );
    });

    it('should handle trainedContextLength and maxContextLength from client', async () => {
      const dto: DownloadModelDto = {
        modelUrl: 'https://example.com/model.gguf',
        modelName: 'Test Model',
        filename: 'test-model.gguf',
        size: 1000000,
        trainedContextLength: 4096,
        maxContextLength: 8192,
        // Note: contextLength is NOT sent by the client
      };

      // No need to import, we already have the mock
      mockDownloadModel.mockResolvedValue(undefined);

      await service.downloadModel(dto);

      // Verify that trainedContextLength is used for contextLength in modelInfo
      expect(mockDownloadModel).toHaveBeenCalledWith(
        expect.objectContaining({
          contextLength: 4096, // Should use trainedContextLength
        }),
        expect.any(Function)
      );
    });

    it('should prioritize contextLength over trainedContextLength and maxContextLength', async () => {
      const dto: DownloadModelDto = {
        modelUrl: 'https://example.com/model.gguf',
        modelName: 'Test Model',
        filename: 'test-model.gguf',
        size: 1000000,
        contextLength: 2048,
        trainedContextLength: 4096,
        maxContextLength: 8192,
      };

      mockDownloadModel.mockResolvedValue(undefined);

      await service.downloadModel(dto);

      // Verify that contextLength is used when provided
      expect(mockDownloadModel).toHaveBeenCalledWith(
        expect.objectContaining({
          contextLength: 2048, // Should use contextLength when provided
        }),
        expect.any(Function)
      );
    });

    it('should use maxContextLength when only maxContextLength is provided', async () => {
      const dto: DownloadModelDto = {
        modelUrl: 'https://example.com/model.gguf',
        modelName: 'Test Model',
        filename: 'test-model.gguf',
        size: 1000000,
        maxContextLength: 8192,
      };

      mockDownloadModel.mockResolvedValue(undefined);

      await service.downloadModel(dto);

      // Verify that maxContextLength is used when it's the only one provided
      expect(mockDownloadModel).toHaveBeenCalledWith(
        expect.objectContaining({
          contextLength: 8192, // Should use maxContextLength
        }),
        expect.any(Function)
      );
    });

    it('should handle undefined contextLength fields gracefully', async () => {
      const dto: DownloadModelDto = {
        modelUrl: 'https://example.com/model.gguf',
        modelName: 'Test Model',
        filename: 'test-model.gguf',
        size: 1000000,
        // No context length fields provided
      };

      mockDownloadModel.mockResolvedValue(undefined);

      await service.downloadModel(dto);

      // Verify that contextLength is undefined when no context fields are provided
      expect(mockDownloadModel).toHaveBeenCalledWith(
        expect.objectContaining({
          contextLength: undefined,
        }),
        expect.any(Function)
      );
    });

    it('should handle multi-part model fields', async () => {
      const dto: DownloadModelDto = {
        modelUrl: 'https://example.com/model.gguf',
        modelName: 'Large Model',
        filename: 'large-model-00001-of-00003.gguf',
        size: 5000000000,
        isMultiPart: true,
        totalParts: 3,
        allPartFiles: [
          'large-model-00001-of-00003.gguf',
          'large-model-00002-of-00003.gguf',
          'large-model-00003-of-00003.gguf',
        ],
        totalSize: 15000000000,
      };

      // No need to import, we already have the mock
      mockDownloadModel.mockResolvedValue(undefined);

      await service.downloadModel(dto);

      expect(mockDownloadModel).toHaveBeenCalledWith(
        expect.objectContaining({
          isMultiPart: true,
          totalParts: 3,
          allPartFiles: dto.allPartFiles,
          totalSize: 15000000000,
        }),
        expect.any(Function)
      );
    });
  });

  describe('cancelDownload', () => {
    it('should cancel download successfully', async () => {
      // No need to import, we already have the mock
      mockCancelDownload.mockResolvedValue(true);

      const result = await service.cancelDownload('test-model.gguf');

      expect(result).toEqual({
        success: true,
        message: 'Download cancelled',
        filename: 'test-model.gguf',
      });

      expect(mockCancelDownload).toHaveBeenCalledWith('test-model.gguf');

      // Verify SSE broadcast for cancellation
      expect(mockSseService.broadcast).toHaveBeenCalledWith('unified-events', {
        type: 'download-progress',
        data: {
          filename: 'test-model.gguf',
          progress: 0,
          speed: '0 B/s',
          isDownloading: false,
          error: 'cancelled',
        },
      });
    });

    it('should return error when download not found', async () => {
      // No need to import, we already have the mock
      mockCancelDownload.mockResolvedValue(false);

      const result = await service.cancelDownload('non-existent.gguf');

      expect(result).toEqual({
        success: false,
        message: 'Download not found or not in progress',
      });

      expect(mockSseService.broadcast).not.toHaveBeenCalled();
    });
  });
});
