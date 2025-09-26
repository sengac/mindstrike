import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InternalServerErrorException } from '@nestjs/common';
import { LlmConfigController } from '../llm-config.controller';
import type { LlmConfigService } from '../services/llm-config.service';

describe('LlmConfigController - Rescan Functionality', () => {
  let controller: LlmConfigController;
  let mockLlmConfigService: Partial<LlmConfigService>;

  beforeEach(() => {
    mockLlmConfigService = {
      rescanServices: vi.fn(),
      getModels: vi.fn(),
      getDefaultModel: vi.fn(),
      setDefaultModel: vi.fn(),
    };

    controller = new LlmConfigController(
      mockLlmConfigService as LlmConfigService
    );
  });

  describe('rescanServices', () => {
    it('should rescan services successfully', async () => {
      const mockResult = {
        scannedServices: [
          {
            id: 'ollama',
            name: 'Ollama',
            baseURL: 'http://localhost:11434',
            available: true,
          },
          {
            id: 'vllm',
            name: 'vLLM',
            baseURL: 'http://localhost:8000',
            available: true,
          },
        ],
        addedServices: [
          {
            id: 'new-service',
            name: 'New Service',
            baseURL: 'http://localhost:8080',
          },
        ],
        removedServices: [
          {
            id: 'old-service',
            name: 'Old Service',
            baseURL: 'http://localhost:9999',
          },
        ],
      };

      (
        mockLlmConfigService.rescanServices as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResult);

      const result = await controller.rescanServices();

      expect(result).toEqual(mockResult);
      expect(mockLlmConfigService.rescanServices).toHaveBeenCalled();
    });

    it('should handle rescan with no changes', async () => {
      const mockResult = {
        scannedServices: [
          {
            id: 'ollama',
            name: 'Ollama',
            baseURL: 'http://localhost:11434',
            available: true,
          },
        ],
        addedServices: undefined,
        removedServices: undefined,
      };

      (
        mockLlmConfigService.rescanServices as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResult);

      const result = await controller.rescanServices();

      expect(result).toEqual(mockResult);
      expect(result.addedServices).toBeUndefined();
      expect(result.removedServices).toBeUndefined();
    });

    it('should handle empty scan results', async () => {
      const mockResult = {
        scannedServices: [],
        addedServices: undefined,
        removedServices: undefined,
      };

      (
        mockLlmConfigService.rescanServices as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResult);

      const result = await controller.rescanServices();

      expect(result).toEqual(mockResult);
      expect(result.scannedServices).toEqual([]);
    });

    it('should throw InternalServerErrorException when service fails', async () => {
      const error = new Error('Scanner not available');

      (
        mockLlmConfigService.rescanServices as ReturnType<typeof vi.fn>
      ).mockRejectedValue(error);

      await expect(controller.rescanServices()).rejects.toThrow(
        InternalServerErrorException
      );
      expect(mockLlmConfigService.rescanServices).toHaveBeenCalled();
    });

    it('should handle unknown error types', async () => {
      const error = 'Unknown error string';

      (
        mockLlmConfigService.rescanServices as ReturnType<typeof vi.fn>
      ).mockRejectedValue(error);

      await expect(controller.rescanServices()).rejects.toThrow(
        'Failed to rescan LLM services'
      );
    });
  });
});
