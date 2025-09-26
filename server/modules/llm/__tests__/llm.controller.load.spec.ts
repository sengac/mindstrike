import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InternalServerErrorException } from '@nestjs/common';
import { LlmController } from '../llm.controller';
import type { LocalLlmService } from '../services/local-llm.service';
import type { LlmService } from '../services/llm.service';
import type { ModelDiscoveryService } from '../services/model-discovery.service';
import type { ModelDownloadService } from '../services/model-download.service';

describe('LlmController - Load/Unload Routes', () => {
  let controller: LlmController;
  let mockLocalLlmService: Partial<LocalLlmService>;
  let mockLlmService: Partial<LlmService>;
  let mockDiscoveryService: Partial<ModelDiscoveryService>;
  let mockDownloadService: Partial<ModelDownloadService>;

  beforeEach(() => {
    mockLocalLlmService = {
      loadModel: vi.fn(),
      unloadModel: vi.fn(),
      getModelStatus: vi.fn(),
    };

    mockLlmService = {};
    mockDiscoveryService = {};
    mockDownloadService = {};

    controller = new LlmController(
      mockLlmService as LlmService,
      mockDiscoveryService as ModelDiscoveryService,
      mockDownloadService as ModelDownloadService,
      mockLocalLlmService as LocalLlmService
    );
  });

  describe('loadModelById', () => {
    it('should load model successfully', async () => {
      const modelId = 'test-model-id';
      const mockResult = { message: 'Model loaded successfully' };

      (
        mockLocalLlmService.loadModel as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResult);

      const result = await controller.loadModelById(modelId);

      expect(result).toEqual(mockResult);
      expect(mockLocalLlmService.loadModel).toHaveBeenCalledWith(modelId);
    });

    it('should throw InternalServerErrorException when loading fails', async () => {
      const modelId = 'invalid-model';
      const error = new Error('Model not found');

      (
        mockLocalLlmService.loadModel as ReturnType<typeof vi.fn>
      ).mockRejectedValue(error);

      await expect(controller.loadModelById(modelId)).rejects.toThrow(
        InternalServerErrorException
      );
      expect(mockLocalLlmService.loadModel).toHaveBeenCalledWith(modelId);
    });

    it('should handle unknown error types', async () => {
      const modelId = 'test-model';
      const error = 'Unknown error string';

      (
        mockLocalLlmService.loadModel as ReturnType<typeof vi.fn>
      ).mockRejectedValue(error);

      await expect(controller.loadModelById(modelId)).rejects.toThrow(
        'Failed to load model'
      );
    });
  });

  describe('unloadModelById', () => {
    it('should unload model successfully', async () => {
      const modelId = 'test-model-id';
      const mockResult = { message: 'Model unloaded successfully' };

      (
        mockLocalLlmService.unloadModel as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResult);

      const result = await controller.unloadModelById(modelId);

      expect(result).toEqual(mockResult);
      expect(mockLocalLlmService.unloadModel).toHaveBeenCalledWith(modelId);
    });

    it('should throw InternalServerErrorException when unloading fails', async () => {
      const modelId = 'test-model';
      const error = new Error('Failed to unload model');

      (
        mockLocalLlmService.unloadModel as ReturnType<typeof vi.fn>
      ).mockRejectedValue(error);

      await expect(controller.unloadModelById(modelId)).rejects.toThrow(
        InternalServerErrorException
      );
      expect(mockLocalLlmService.unloadModel).toHaveBeenCalledWith(modelId);
    });

    it('should handle unknown error types', async () => {
      const modelId = 'test-model';
      const error = { message: 'Complex error object' };

      (
        mockLocalLlmService.unloadModel as ReturnType<typeof vi.fn>
      ).mockRejectedValue(error);

      await expect(controller.unloadModelById(modelId)).rejects.toThrow(
        'Failed to unload model'
      );
    });
  });
});
