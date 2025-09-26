import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InternalServerErrorException } from '@nestjs/common';
import { LlmConfigController } from '../llm-config.controller';
import type { LlmConfigService } from '../services/llm-config.service';

describe('LlmConfigController', () => {
  let controller: LlmConfigController;
  let mockLlmConfigService: Partial<LlmConfigService>;

  beforeEach(() => {
    mockLlmConfigService = {
      getModels: vi.fn(),
      getDefaultModel: vi.fn(),
      setDefaultModel: vi.fn(),
    };

    controller = new LlmConfigController(
      mockLlmConfigService as LlmConfigService
    );
  });

  describe('getModels', () => {
    it('should return list of all configured models', async () => {
      const mockModels = [
        {
          id: 'openai-gpt-4',
          serviceId: 'openai-service',
          serviceName: 'OpenAI',
          model: 'gpt-4',
          displayName: 'GPT-4',
          baseURL: 'https://api.openai.com/v1',
          type: 'openai' as const,
          available: true,
          isDefault: true,
        },
        {
          id: 'anthropic-claude-3',
          serviceId: 'anthropic-service',
          serviceName: 'Anthropic',
          model: 'claude-3-opus-20240229',
          displayName: 'Claude 3 Opus',
          baseURL: 'https://api.anthropic.com',
          type: 'anthropic' as const,
          available: true,
          isDefault: false,
        },
      ];

      (
        mockLlmConfigService.getModels as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockModels);

      const result = await controller.getModels();

      expect(result).toEqual(mockModels);
      expect(mockLlmConfigService.getModels).toHaveBeenCalled();
    });

    it('should throw InternalServerErrorException when service fails', async () => {
      const error = new Error('Service error');
      (
        mockLlmConfigService.getModels as ReturnType<typeof vi.fn>
      ).mockRejectedValue(error);

      await expect(controller.getModels()).rejects.toThrow(
        InternalServerErrorException
      );
    });

    it('should return empty array when no models configured', async () => {
      (
        mockLlmConfigService.getModels as ReturnType<typeof vi.fn>
      ).mockResolvedValue([]);

      const result = await controller.getModels();

      expect(result).toEqual([]);
    });
  });

  describe('getDefaultModel', () => {
    it('should return the default model', async () => {
      const mockDefaultModel = {
        id: 'openai-gpt-4',
        serviceId: 'openai-service',
        serviceName: 'OpenAI',
        model: 'gpt-4',
        displayName: 'GPT-4',
        baseURL: 'https://api.openai.com/v1',
        type: 'openai' as const,
        available: true,
        isDefault: true,
      };

      (
        mockLlmConfigService.getDefaultModel as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockDefaultModel);

      const result = await controller.getDefaultModel();

      expect(result).toEqual(mockDefaultModel);
      expect(mockLlmConfigService.getDefaultModel).toHaveBeenCalled();
    });

    it('should throw InternalServerErrorException when no default model configured', async () => {
      (
        mockLlmConfigService.getDefaultModel as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      await expect(controller.getDefaultModel()).rejects.toThrow(
        InternalServerErrorException
      );
    });

    it('should throw InternalServerErrorException when service fails', async () => {
      const error = new Error('Service error');
      (
        mockLlmConfigService.getDefaultModel as ReturnType<typeof vi.fn>
      ).mockRejectedValue(error);

      await expect(controller.getDefaultModel()).rejects.toThrow(
        InternalServerErrorException
      );
    });
  });

  describe('setDefaultModel', () => {
    it('should set the default model successfully', async () => {
      const modelId = 'openai-gpt-4';
      const body = { modelId };

      (
        mockLlmConfigService.setDefaultModel as ReturnType<typeof vi.fn>
      ).mockResolvedValue(undefined);

      const result = await controller.setDefaultModel(body);

      expect(result).toEqual({
        success: true,
        modelId,
      });
      expect(mockLlmConfigService.setDefaultModel).toHaveBeenCalledWith(
        modelId
      );
    });

    it('should throw InternalServerErrorException when service fails', async () => {
      const modelId = 'invalid-model';
      const body = { modelId };
      const error = new Error('Model not found');

      (
        mockLlmConfigService.setDefaultModel as ReturnType<typeof vi.fn>
      ).mockRejectedValue(error);

      await expect(controller.setDefaultModel(body)).rejects.toThrow(
        InternalServerErrorException
      );
      expect(mockLlmConfigService.setDefaultModel).toHaveBeenCalledWith(
        modelId
      );
    });
  });
});
