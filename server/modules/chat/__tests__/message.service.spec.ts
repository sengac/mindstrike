import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';
import { MessageService } from '../services/message.service';
import type { ConversationService } from '../services/conversation.service';
import type { AgentPoolService } from '../../agents/services/agent-pool.service';
import type { SseService } from '../../events/services/sse.service';
import type { CreateMessageDto } from '../dto/create-message.dto';
import type { GlobalLlmConfigService } from '../../shared/services/global-llm-config.service';

describe('MessageService', () => {
  let service: MessageService;
  let mockConversationService: Partial<ConversationService>;
  let mockAgentPoolService: Partial<AgentPoolService>;
  let mockSseService: Partial<SseService>;
  let mockModuleRef: Partial<ModuleRef>;
  let mockGlobalLlmConfigService: Partial<GlobalLlmConfigService>;

  beforeEach(() => {
    mockConversationService = {
      load: vi.fn().mockResolvedValue(undefined),
      addMessage: vi.fn().mockResolvedValue(undefined),
      updateMessage: vi.fn().mockResolvedValue(true),
    };

    mockAgentPoolService = {
      setCurrentThread: vi.fn().mockResolvedValue(undefined),
      getCurrentAgent: vi.fn().mockResolvedValue(null),
      getAgent: vi.fn().mockResolvedValue(null),
    };

    mockSseService = {
      broadcast: vi.fn(),
    };

    mockGlobalLlmConfigService = {
      getCurrentLlmConfig: vi.fn().mockReturnValue({
        baseURL: 'http://localhost:1234',
        model: '',
        displayName: undefined,
        apiKey: undefined,
        type: undefined,
        contextLength: undefined,
      }),
      updateCurrentLlmConfig: vi.fn(),
      refreshLLMConfig: vi.fn(),
    };

    // Mock ModuleRef to return the AgentPoolService
    mockModuleRef = {
      get: vi.fn().mockReturnValue(mockAgentPoolService),
    };

    service = new MessageService(
      mockConversationService as ConversationService,
      mockSseService as SseService,
      mockModuleRef as ModuleRef,
      mockGlobalLlmConfigService as GlobalLlmConfigService
    );
  });

  describe('processMessage', () => {
    it('should throw BadRequestException when message and images are empty', async () => {
      const dto: CreateMessageDto = {};

      await expect(service.processMessage(dto)).rejects.toThrow(
        BadRequestException
      );
      await expect(service.processMessage(dto)).rejects.toThrow(
        'Message or images are required'
      );
    });

    it('should throw BadRequestException when no LLM model is configured', async () => {
      const dto: CreateMessageDto = {
        message: 'Hello',
      };

      // The currentLlmConfig in the service has empty model by default
      await expect(service.processMessage(dto)).rejects.toThrow(
        BadRequestException
      );
      await expect(service.processMessage(dto)).rejects.toThrow(
        'No LLM model configured. Please select a model from the available options.'
      );
    });

    it('should accept message with valid input', async () => {
      const dto: CreateMessageDto = {
        message: 'Hello',
        threadId: 'test-thread',
        messageId: 'test-msg-123',
      };

      // Mock valid LLM config
      (
        mockGlobalLlmConfigService.getCurrentLlmConfig as ReturnType<
          typeof vi.fn
        >
      ).mockReturnValue({
        baseURL: 'http://localhost:1234',
        model: 'gpt-4',
        displayName: 'GPT-4',
        type: 'openai',
      });

      // Create new service instance with updated config
      const serviceWithConfig = new MessageService(
        mockConversationService as ConversationService,
        mockSseService as SseService,
        mockModuleRef as ModuleRef,
        mockGlobalLlmConfigService as GlobalLlmConfigService
      );

      const result = await serviceWithConfig.processMessage(dto);

      expect(result).toEqual({ status: 'processing' });
      expect(mockAgentPoolService.setCurrentThread).toHaveBeenCalledWith(
        'test-thread'
      );
      expect(mockConversationService.load).toHaveBeenCalled();
      expect(mockConversationService.addMessage).toHaveBeenCalledWith(
        'test-thread',
        expect.objectContaining({
          id: 'test-msg-123',
          role: 'user',
          content: 'Hello',
          status: 'completed',
        })
      );
    });

    it('should accept images without message', async () => {
      const dto: CreateMessageDto = {
        images: [{ data: 'base64data', mimeType: 'image/png' }],
        threadId: 'test-thread',
      };

      // Mock valid LLM config
      (
        mockGlobalLlmConfigService.getCurrentLlmConfig as ReturnType<
          typeof vi.fn
        >
      ).mockReturnValue({ model: 'gpt-4' });

      const serviceWithConfig = new MessageService(
        mockConversationService as ConversationService,
        mockSseService as SseService,
        mockModuleRef as ModuleRef,
        mockGlobalLlmConfigService as GlobalLlmConfigService
      );

      const result = await serviceWithConfig.processMessage(dto);

      expect(result).toEqual({ status: 'processing' });
      expect(mockConversationService.addMessage).toHaveBeenCalledWith(
        'test-thread',
        expect.objectContaining({
          role: 'user',
          content: '',
          images: [{ data: 'base64data', mimeType: 'image/png' }],
        })
      );
    });

    it('should handle missing threadId with default', async () => {
      const dto: CreateMessageDto = {
        message: 'Hello',
      };

      // Mock valid LLM config
      (
        mockGlobalLlmConfigService.getCurrentLlmConfig as ReturnType<
          typeof vi.fn
        >
      ).mockReturnValue({ model: 'gpt-4' });

      const serviceWithConfig = new MessageService(
        mockConversationService as ConversationService,
        mockSseService as SseService,
        mockModuleRef as ModuleRef,
        mockGlobalLlmConfigService as GlobalLlmConfigService
      );

      const result = await serviceWithConfig.processMessage(dto);

      expect(result).toEqual({ status: 'processing' });
      expect(mockConversationService.addMessage).toHaveBeenCalledWith(
        'default',
        expect.objectContaining({
          role: 'user',
          content: 'Hello',
        })
      );
    });

    it('should generate messageId when not provided', async () => {
      const dto: CreateMessageDto = {
        message: 'Hello',
      };

      // Mock valid LLM config
      (
        mockGlobalLlmConfigService.getCurrentLlmConfig as ReturnType<
          typeof vi.fn
        >
      ).mockReturnValue({ model: 'gpt-4' });

      const serviceWithConfig = new MessageService(
        mockConversationService as ConversationService,
        mockSseService as SseService,
        mockModuleRef as ModuleRef,
        mockGlobalLlmConfigService as GlobalLlmConfigService
      );

      await serviceWithConfig.processMessage(dto);

      expect(mockConversationService.addMessage).toHaveBeenCalledWith(
        'default',
        expect.objectContaining({
          id: expect.stringMatching(/^user-\d+-[a-z0-9]+$/),
          role: 'user',
          content: 'Hello',
        })
      );
    });

    it('should include notes and images in user message', async () => {
      const dto: CreateMessageDto = {
        message: 'Hello with attachments',
        images: [{ data: 'base64', mimeType: 'image/jpeg' }],
        notes: [{ content: 'A note', metadata: { type: 'reminder' } }],
      };

      // Mock valid LLM config
      (
        mockGlobalLlmConfigService.getCurrentLlmConfig as ReturnType<
          typeof vi.fn
        >
      ).mockReturnValue({ model: 'gpt-4' });

      const serviceWithConfig = new MessageService(
        mockConversationService as ConversationService,
        mockSseService as SseService,
        mockModuleRef as ModuleRef,
        mockGlobalLlmConfigService as GlobalLlmConfigService
      );

      await serviceWithConfig.processMessage(dto);

      expect(mockConversationService.addMessage).toHaveBeenCalledWith(
        'default',
        expect.objectContaining({
          role: 'user',
          content: 'Hello with attachments',
          images: [{ data: 'base64', mimeType: 'image/jpeg' }],
          notes: [{ content: 'A note', metadata: { type: 'reminder' } }],
        })
      );
    });
  });

  describe('getCancellationManager', () => {
    it('should return cancellation manager', () => {
      const manager = service.getCancellationManager();

      expect(manager).toBeDefined();
      expect(typeof manager.startTask).toBe('function');
      expect(typeof manager.cancelTask).toBe('function');
      expect(typeof manager.isTaskActive).toBe('function');
      expect(typeof manager.cleanup).toBe('function');
    });
  });
});
