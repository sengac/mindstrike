import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { LlmConfigController } from '../llm-config.controller';
import type { LlmConfigService } from '../services/llm-config.service';

// Mock fetch globally
global.fetch = vi.fn();

describe('LlmConfigController - POST /api/llm/test-service', () => {
  let controller: LlmConfigController;
  let mockLlmConfigService: Partial<LlmConfigService>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLlmConfigService = {
      testService: vi.fn(),
    };

    controller = new LlmConfigController(
      mockLlmConfigService as LlmConfigService
    );
  });

  describe('testService', () => {
    it('should test Ollama service successfully', async () => {
      const body = {
        baseURL: 'http://localhost:11434',
        type: 'ollama',
      };

      const mockResult = {
        success: true,
        models: ['llama2', 'mistral'],
      };

      (
        mockLlmConfigService.testService as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResult);

      const result = await controller.testService(body);

      expect(result).toEqual(mockResult);
      expect(mockLlmConfigService.testService).toHaveBeenCalledWith(
        body.baseURL,
        body.type,
        undefined
      );
    });

    it('should test OpenAI service with API key', async () => {
      const body = {
        baseURL: 'https://api.openai.com',
        type: 'openai',
        apiKey: 'test-api-key',
      };

      const mockResult = {
        success: true,
        models: ['gpt-4', 'gpt-3.5-turbo'],
      };

      (
        mockLlmConfigService.testService as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResult);

      const result = await controller.testService(body);

      expect(result).toEqual(mockResult);
      expect(mockLlmConfigService.testService).toHaveBeenCalledWith(
        body.baseURL,
        body.type,
        body.apiKey
      );
    });

    it('should test Anthropic service with API key', async () => {
      const body = {
        baseURL: 'https://api.anthropic.com',
        type: 'anthropic',
        apiKey: 'test-api-key',
      };

      const mockResult = {
        success: true,
        models: ['claude-3-opus', 'claude-3-sonnet'],
      };

      (
        mockLlmConfigService.testService as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResult);

      const result = await controller.testService(body);

      expect(result).toEqual(mockResult);
      expect(mockLlmConfigService.testService).toHaveBeenCalledWith(
        body.baseURL,
        body.type,
        body.apiKey
      );
    });

    it('should return Perplexity models without API call', async () => {
      const body = {
        baseURL: 'https://api.perplexity.ai',
        type: 'perplexity',
        apiKey: 'test-api-key',
      };

      const mockResult = {
        success: true,
        models: ['sonar-pro', 'sonar', 'sonar-deep-research'],
      };

      (
        mockLlmConfigService.testService as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResult);

      const result = await controller.testService(body);

      expect(result).toEqual(mockResult);
    });

    it('should return Google models without API call', async () => {
      const body = {
        baseURL: 'https://generativelanguage.googleapis.com',
        type: 'google',
        apiKey: 'test-api-key',
      };

      const mockResult = {
        success: true,
        models: [
          'gemini-1.5-pro',
          'gemini-1.5-flash',
          'gemini-2.5-pro',
          'gemini-2.5-flash',
          'gemini-pro',
        ],
      };

      (
        mockLlmConfigService.testService as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResult);

      const result = await controller.testService(body);

      expect(result).toEqual(mockResult);
    });

    it('should handle service test failure', async () => {
      const body = {
        baseURL: 'http://localhost:11434',
        type: 'ollama',
      };

      const mockResult = {
        success: false,
        error: 'Connection failed',
      };

      (
        mockLlmConfigService.testService as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResult);

      const result = await controller.testService(body);

      expect(result).toEqual(mockResult);
    });

    it('should handle HTTP error responses', async () => {
      const body = {
        baseURL: 'http://localhost:11434',
        type: 'ollama',
      };

      const mockResult = {
        success: false,
        error: 'HTTP 404: Not Found',
      };

      (
        mockLlmConfigService.testService as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResult);

      const result = await controller.testService(body);

      expect(result).toEqual(mockResult);
    });

    it('should handle timeout', async () => {
      const body = {
        baseURL: 'http://localhost:11434',
        type: 'ollama',
      };

      const mockResult = {
        success: false,
        error: 'Request timeout',
      };

      (
        mockLlmConfigService.testService as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResult);

      const result = await controller.testService(body);

      expect(result).toEqual(mockResult);
    });

    it('should throw BadRequestException when baseURL is missing', async () => {
      const body = {
        baseURL: '',
        type: 'ollama',
      };

      await expect(controller.testService(body)).rejects.toThrow(
        BadRequestException
      );
      await expect(controller.testService(body)).rejects.toThrow(
        'BaseURL and type are required'
      );
    });

    it('should throw BadRequestException when type is missing', async () => {
      const body = {
        baseURL: 'http://localhost:11434',
        type: '',
      };

      await expect(controller.testService(body)).rejects.toThrow(
        BadRequestException
      );
      await expect(controller.testService(body)).rejects.toThrow(
        'BaseURL and type are required'
      );
    });

    it('should handle unknown service type', async () => {
      const body = {
        baseURL: 'http://localhost:11434',
        type: 'unknown',
      };

      const error = new Error('Unknown service type: unknown');
      (
        mockLlmConfigService.testService as ReturnType<typeof vi.fn>
      ).mockRejectedValue(error);

      await expect(controller.testService(body)).rejects.toThrow(
        InternalServerErrorException
      );
    });

    it('should handle service errors', async () => {
      const body = {
        baseURL: 'http://localhost:11434',
        type: 'ollama',
      };

      const error = new Error('Network error');
      (
        mockLlmConfigService.testService as ReturnType<typeof vi.fn>
      ).mockRejectedValue(error);

      await expect(controller.testService(body)).rejects.toThrow(
        InternalServerErrorException
      );
      await expect(controller.testService(body)).rejects.toThrow(
        'Network error'
      );
    });
  });
});
