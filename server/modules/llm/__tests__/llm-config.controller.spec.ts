import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LlmConfigController } from '../llm-config.controller';
import type { LlmConfigService } from '../services/llm-config.service';
import type { GlobalLlmConfigService } from '../../shared/services/global-llm-config.service';
import type { ModuleRef } from '@nestjs/core';

describe('LlmConfigController', () => {
  let controller: LlmConfigController;
  let mockLlmConfigService: Partial<LlmConfigService>;
  let mockGlobalLlmConfigService: Partial<GlobalLlmConfigService>;
  let mockModuleRef: Partial<ModuleRef>;

  beforeEach(() => {
    mockLlmConfigService = {
      getModels: vi.fn(),
      getDefaultModel: vi.fn(),
      setDefaultModel: vi.fn(),
    };

    mockGlobalLlmConfigService = {
      refreshLLMConfig: vi.fn(),
    };

    mockModuleRef = {
      get: vi.fn(),
    };

    controller = new LlmConfigController(
      mockLlmConfigService as LlmConfigService,
      mockGlobalLlmConfigService as GlobalLlmConfigService,
      mockModuleRef as ModuleRef
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

    it('should throw error when service fails', async () => {
      const error = new Error('Service error');
      (
        mockLlmConfigService.getModels as ReturnType<typeof vi.fn>
      ).mockRejectedValue(error);

      await expect(controller.getModels()).rejects.toThrow('Service error');
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

    it('should throw HttpException when no default model configured', async () => {
      (
        mockLlmConfigService.getDefaultModel as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      await expect(controller.getDefaultModel()).rejects.toThrow(
        'No default model configured'
      );
    });

    it('should throw error when service fails', async () => {
      const error = new Error('Service error');
      (
        mockLlmConfigService.getDefaultModel as ReturnType<typeof vi.fn>
      ).mockRejectedValue(error);

      await expect(controller.getDefaultModel()).rejects.toThrow(
        'Service error'
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
      (
        mockGlobalLlmConfigService.refreshLLMConfig as ReturnType<typeof vi.fn>
      ).mockResolvedValue(undefined);
      (mockModuleRef.get as ReturnType<typeof vi.fn>).mockReturnValue({
        updateAllAgentsLLMConfig: vi.fn().mockResolvedValue(undefined),
      });

      const result = await controller.setDefaultModel(body);

      expect(result).toEqual({
        message: 'Default model updated successfully',
      });
      expect(mockLlmConfigService.setDefaultModel).toHaveBeenCalledWith(
        modelId
      );
      expect(mockGlobalLlmConfigService.refreshLLMConfig).toHaveBeenCalled();
    });

    it('should throw error when service fails', async () => {
      const modelId = 'invalid-model';
      const body = { modelId };
      const error = new Error('Model not found');

      (
        mockLlmConfigService.setDefaultModel as ReturnType<typeof vi.fn>
      ).mockRejectedValue(error);

      await expect(controller.setDefaultModel(body)).rejects.toThrow(
        'Model not found'
      );
      expect(mockLlmConfigService.setDefaultModel).toHaveBeenCalledWith(
        modelId
      );
    });
  });
});
