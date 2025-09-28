import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LlmController } from '../llm.controller';
import type { LlmService } from '../services/llm.service';
import type { ModelDiscoveryService } from '../services/model-discovery.service';
import type { ModelDownloadService } from '../services/model-download.service';
import type { LocalLlmService } from '../services/local-llm.service';
import type { DownloadModelDto } from '../dto/llm.dto';

describe('LlmController - Download Endpoints', () => {
  let controller: LlmController;
  let mockLlmService: Partial<LlmService>;
  let mockDiscoveryService: Partial<ModelDiscoveryService>;
  let mockDownloadService: Partial<ModelDownloadService>;
  let mockLocalLlmService: Partial<LocalLlmService>;

  beforeEach(() => {
    mockLlmService = {};
    mockDiscoveryService = {};
    mockDownloadService = {
      downloadModel: vi.fn(),
      cancelDownload: vi.fn(),
    };
    mockLocalLlmService = {};

    controller = new LlmController(
      mockLlmService as LlmService,
      mockDiscoveryService as ModelDiscoveryService,
      mockDownloadService as ModelDownloadService,
      mockLocalLlmService as LocalLlmService
    );
  });

  describe('downloadModel', () => {
    it('should successfully start a model download with all fields', async () => {
      const downloadDto: DownloadModelDto = {
        modelUrl: 'https://huggingface.co/test/model.gguf',
        modelName: 'Test Model',
        filename: 'test-model.gguf',
        size: 1000000,
        trainedContextLength: 4096,
        maxContextLength: 8192,
        parameterCount: '7B',
        quantization: 'Q4_K_M',
      };

      const expectedResponse = {
        success: true,
        message: 'Model download started',
        downloadId: 'test-download-id',
        name: 'Test Model',
        filename: 'test-model.gguf',
      };

      (
        mockDownloadService.downloadModel as ReturnType<typeof vi.fn>
      ).mockResolvedValue(expectedResponse);

      const result = await controller.downloadModel(downloadDto);

      expect(result).toEqual(expectedResponse);
      expect(mockDownloadService.downloadModel).toHaveBeenCalledWith(
        downloadDto
      );
    });

    it('should handle download with minimal required fields', async () => {
      const downloadDto: DownloadModelDto = {
        modelUrl: 'https://huggingface.co/test/model.gguf',
        filename: 'test-model.gguf',
      };

      const expectedResponse = {
        success: true,
        message: 'Model download started',
        downloadId: 'test-download-id',
        name: 'test-model.gguf',
        filename: 'test-model.gguf',
      };

      (
        mockDownloadService.downloadModel as ReturnType<typeof vi.fn>
      ).mockResolvedValue(expectedResponse);

      const result = await controller.downloadModel(downloadDto);

      expect(result).toEqual(expectedResponse);
      expect(mockDownloadService.downloadModel).toHaveBeenCalledWith(
        downloadDto
      );
    });

    it('should accept trainedContextLength and maxContextLength fields', async () => {
      const downloadDto: DownloadModelDto = {
        modelUrl: 'https://huggingface.co/test/model.gguf',
        filename: 'test-model.gguf',
        trainedContextLength: 128000,
        maxContextLength: 256000,
      };

      const expectedResponse = {
        success: true,
        message: 'Model download started',
        downloadId: 'test-id',
        name: 'test-model.gguf',
        filename: 'test-model.gguf',
      };

      (
        mockDownloadService.downloadModel as ReturnType<typeof vi.fn>
      ).mockResolvedValue(expectedResponse);

      const result = await controller.downloadModel(downloadDto);

      expect(mockDownloadService.downloadModel).toHaveBeenCalledWith(
        expect.objectContaining({
          trainedContextLength: 128000,
          maxContextLength: 256000,
        })
      );
      expect(result).toEqual(expectedResponse);
    });

    it('should handle multi-part model downloads', async () => {
      const downloadDto: DownloadModelDto = {
        modelUrl: 'https://huggingface.co/test/model.gguf',
        modelName: 'Large Model',
        filename: 'model-00001-of-00003.gguf',
        size: 5000000000,
        isMultiPart: true,
        totalParts: 3,
        allPartFiles: [
          'model-00001-of-00003.gguf',
          'model-00002-of-00003.gguf',
          'model-00003-of-00003.gguf',
        ],
        totalSize: 15000000000,
      };

      const expectedResponse = {
        success: true,
        message: 'Model download started',
        downloadId: 'multipart-id',
        name: 'Large Model',
        filename: 'model-00001-of-00003.gguf',
      };

      (
        mockDownloadService.downloadModel as ReturnType<typeof vi.fn>
      ).mockResolvedValue(expectedResponse);

      const result = await controller.downloadModel(downloadDto);

      expect(mockDownloadService.downloadModel).toHaveBeenCalledWith(
        expect.objectContaining({
          isMultiPart: true,
          totalParts: 3,
          allPartFiles: downloadDto.allPartFiles,
          totalSize: 15000000000,
        })
      );
      expect(result).toEqual(expectedResponse);
    });

    it('should handle service errors gracefully', async () => {
      const downloadDto: DownloadModelDto = {
        modelUrl: 'https://huggingface.co/test/model.gguf',
        filename: 'test-model.gguf',
      };

      const error = new Error('Download service error');
      (
        mockDownloadService.downloadModel as ReturnType<typeof vi.fn>
      ).mockRejectedValue(error);

      await expect(controller.downloadModel(downloadDto)).rejects.toThrow(
        'Download service error'
      );
    });

    it('should pass through all optional fields', async () => {
      const downloadDto: DownloadModelDto = {
        modelUrl: 'https://huggingface.co/test/model.gguf',
        modelName: 'Test Model',
        filename: 'test-model.gguf',
        size: 1000000,
        description: 'Test description',
        contextLength: 2048,
        trainedContextLength: 4096,
        maxContextLength: 8192,
        parameterCount: '7B',
        quantization: 'Q4_K_M',
        isMultiPart: false,
        totalParts: 1,
        allPartFiles: ['test-model.gguf'],
        totalSize: 1000000,
      };

      (
        mockDownloadService.downloadModel as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ success: true });

      await controller.downloadModel(downloadDto);

      expect(mockDownloadService.downloadModel).toHaveBeenCalledWith(
        downloadDto
      );
    });
  });

  describe('cancelDownload', () => {
    it('should successfully cancel a download', async () => {
      const filename = 'test-model.gguf';

      const expectedResponse = {
        success: true,
        message: 'Download cancelled',
        filename: filename,
      };

      (
        mockDownloadService.cancelDownload as ReturnType<typeof vi.fn>
      ).mockResolvedValue(expectedResponse);

      const result = await controller.cancelDownload(filename);

      expect(result).toEqual(expectedResponse);
      expect(mockDownloadService.cancelDownload).toHaveBeenCalledWith(filename);
    });

    it('should handle cancel for non-existent download', async () => {
      const filename = 'non-existent.gguf';

      const expectedResponse = {
        success: false,
        message: 'Download not found or not in progress',
      };

      (
        mockDownloadService.cancelDownload as ReturnType<typeof vi.fn>
      ).mockResolvedValue(expectedResponse);

      const result = await controller.cancelDownload(filename);

      expect(result).toEqual(expectedResponse);
      expect(mockDownloadService.cancelDownload).toHaveBeenCalledWith(filename);
    });

    it('should handle special characters in filename', async () => {
      const filename = 'model-with-special-chars_v1.2.gguf';

      const expectedResponse = {
        success: true,
        message: 'Download cancelled',
        filename: filename,
      };

      (
        mockDownloadService.cancelDownload as ReturnType<typeof vi.fn>
      ).mockResolvedValue(expectedResponse);

      const result = await controller.cancelDownload(filename);

      expect(result).toEqual(expectedResponse);
      expect(mockDownloadService.cancelDownload).toHaveBeenCalledWith(filename);
    });

    it('should handle service errors when cancelling', async () => {
      const filename = 'test-model.gguf';
      const error = new Error('Cancel service error');

      (
        mockDownloadService.cancelDownload as ReturnType<typeof vi.fn>
      ).mockRejectedValue(error);

      await expect(controller.cancelDownload(filename)).rejects.toThrow(
        'Cancel service error'
      );
    });
  });
});
