import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import type { ModuleRef } from '@nestjs/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessageService } from './message.service';
import type { ConversationService } from './conversation.service';
import type { AgentPoolService } from '../../agents/services/agent-pool.service';
import type { SseService } from '../../events/services/sse.service';
import type { GlobalLlmConfigService } from '../../shared/services/global-llm-config.service';

describe('MessageService', () => {
  let service: MessageService;
  let mockConversationService: Partial<ConversationService>;
  let mockAgentPoolService: Partial<AgentPoolService>;
  let mockSseService: Partial<SseService>;
  let mockModuleRef: Partial<ModuleRef>;
  let mockGlobalLlmConfigService: Partial<GlobalLlmConfigService>;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create mock implementations
    mockConversationService = {
      load: vi.fn().mockResolvedValue(undefined),
      save: vi.fn().mockResolvedValue(undefined),
      addMessage: vi.fn().mockResolvedValue(undefined),
      updateMessage: vi.fn().mockResolvedValue(undefined),
      deleteMessageFromAllThreads: vi.fn().mockResolvedValue({
        deletedMessageIds: [],
        affectedThreadIds: [],
      }),
      getConversations: vi.fn().mockReturnValue([]),
      getThread: vi.fn(),
      createThread: vi.fn(),
      updateThreadPrompt: vi.fn(),
    };

    mockAgentPoolService = {
      setCurrentThread: vi.fn().mockResolvedValue(undefined),
      getAgent: vi.fn().mockResolvedValue(null),
      getCurrentAgent: vi.fn().mockResolvedValue(null),
      getCurrentThreadId: vi.fn().mockReturnValue('current-thread'),
      syncCurrentAgentWithThread: vi.fn().mockResolvedValue(undefined),
    };

    mockSseService = {
      broadcast: vi.fn(),
      addClient: vi.fn(),
      removeClient: vi.fn(),
    };

    mockGlobalLlmConfigService = {
      getCurrentLlmConfig: vi.fn().mockReturnValue({
        baseURL: 'http://localhost:1234',
        model: 'llama-3.2-1b',
        displayName: 'Llama 3.2 1B',
        apiKey: 'test-api-key',
        type: 'local',
        contextLength: 8192,
      }),
      updateCurrentLlmConfig: vi.fn(),
      refreshLLMConfig: vi.fn(),
    };

    // Mock ModuleRef to return the AgentPoolService
    mockModuleRef = {
      get: vi.fn().mockReturnValue(mockAgentPoolService),
    };

    // Directly instantiate the service with mocked dependencies
    service = new MessageService(
      mockConversationService as ConversationService,
      mockSseService as SseService,
      mockModuleRef as ModuleRef,
      mockGlobalLlmConfigService as GlobalLlmConfigService
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should have access to cancellation manager', () => {
    const manager = service.getCancellationManager();
    expect(manager).toBeDefined();
    expect(manager.startTask).toBeDefined();
    expect(manager.cancelTask).toBeDefined();
  });

  // NEW TESTS FOR Global LLM Config Integration
  describe('Global LLM Config Integration', () => {
    it('should get LLM config from global service on initialization', () => {
      expect(mockGlobalLlmConfigService.getCurrentLlmConfig).toHaveBeenCalled();
    });

    it('should process message with configured LLM from global config', async () => {
      const dto = {
        message: 'Test message',
        threadId: 'test-thread',
      };

      const mockAgent = {
        processMessage: vi.fn().mockResolvedValue({
          id: 'response-123',
          content: 'Response',
          timestamp: new Date(),
          status: 'completed',
        }),
      };

      mockAgentPoolService.getCurrentAgent = vi
        .fn()
        .mockResolvedValue(mockAgent);

      const result = await service.processMessage(dto);

      expect(result).toEqual({ status: 'processing' });
      expect(mockAgentPoolService.setCurrentThread).toHaveBeenCalledWith(
        'test-thread'
      );
    });

    it('should handle when no model is configured in global config', async () => {
      // Mock empty global config
      (
        mockGlobalLlmConfigService.getCurrentLlmConfig as ReturnType<
          typeof vi.fn
        >
      ).mockReturnValue({
        baseURL: '',
        model: '',
        displayName: undefined,
        apiKey: undefined,
        type: undefined,
        contextLength: undefined,
      });

      // Create new service instance to test empty config
      const serviceWithEmptyConfig = new MessageService(
        mockConversationService as ConversationService,
        mockSseService as SseService,
        mockModuleRef as ModuleRef,
        mockGlobalLlmConfigService as GlobalLlmConfigService
      );

      const dto = {
        message: 'Test message',
        threadId: 'test-thread',
      };

      await expect(serviceWithEmptyConfig.processMessage(dto)).rejects.toThrow(
        new BadRequestException(
          'No LLM model configured. Please select a model from the available options.'
        )
      );
    });

    it('should delegate setCurrentLlmConfig to global service', () => {
      // Reset the mock
      (
        mockGlobalLlmConfigService.updateCurrentLlmConfig as ReturnType<
          typeof vi.fn
        >
      ).mockClear();

      const testConfig = { model: 'test-override' };
      service.setCurrentLlmConfig(testConfig);

      expect(
        mockGlobalLlmConfigService.updateCurrentLlmConfig
      ).toHaveBeenCalledTimes(1);
      expect(
        mockGlobalLlmConfigService.updateCurrentLlmConfig
      ).toHaveBeenCalledWith(testConfig);
    });

    it('should work with partial global LLM configuration', async () => {
      (
        mockGlobalLlmConfigService.getCurrentLlmConfig as ReturnType<
          typeof vi.fn
        >
      ).mockReturnValue({
        baseURL: '',
        model: 'partial-model',
        displayName: 'Partial Model',
        // Missing other properties
      });

      // Create new service instance to test partial config
      const serviceWithPartialConfig = new MessageService(
        mockConversationService as ConversationService,
        mockSseService as SseService,
        mockModuleRef as ModuleRef,
        mockGlobalLlmConfigService as GlobalLlmConfigService
      );

      const dto = {
        message: 'Test message',
        threadId: 'test-thread',
      };

      const mockAgent = {
        processMessage: vi.fn().mockResolvedValue({
          id: 'response-123',
          content: 'Response',
          timestamp: new Date(),
          status: 'completed',
        }),
      };

      mockAgentPoolService.getCurrentAgent = vi
        .fn()
        .mockResolvedValue(mockAgent);

      const result = await serviceWithPartialConfig.processMessage(dto);

      expect(result).toEqual({ status: 'processing' });
    });
  });

  describe('processMessage', () => {
    it('should throw BadRequestException when message and images are missing', async () => {
      const dto = {
        message: '',
        images: [],
        threadId: 'test-thread',
      };

      await expect(service.processMessage(dto)).rejects.toThrow(
        new BadRequestException('Message or images are required')
      );
    });

    it('should process message with configured LLM', async () => {
      const dto = {
        message: 'Test message',
        messageId: 'msg-123',
        threadId: 'test-thread',
      };

      // Mock agent with processMessage method
      const mockAgent = {
        processMessage: vi.fn().mockResolvedValue({
          id: 'response-123',
          content: 'Response',
          timestamp: new Date(),
          status: 'completed',
        }),
      };

      mockAgentPoolService.getCurrentAgent.mockResolvedValue(mockAgent);

      const result = await service.processMessage(dto);

      expect(result).toEqual({ status: 'processing' });
      expect(mockAgentPoolService.setCurrentThread).toHaveBeenCalledWith(
        'test-thread'
      );
      expect(mockConversationService.addMessage).toHaveBeenCalled();

      // Wait for async processing to start
      await new Promise(resolve => setTimeout(resolve, 10));
    });
  });

  describe('streamMessage', () => {
    let mockRes: Partial<Response> & {
      status: ReturnType<typeof vi.fn>;
      json: ReturnType<typeof vi.fn>;
      end: ReturnType<typeof vi.fn>;
      setHeader: ReturnType<typeof vi.fn>;
      write: ReturnType<typeof vi.fn>;
    };
    let sseClientId: string;
    let sseEvents: Array<{ type: string; data: unknown }> = [];

    beforeEach(() => {
      mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        end: vi.fn(),
        setHeader: vi.fn(),
        write: vi.fn(),
      };

      sseEvents = [];
      // Capture SSE events being broadcast
      mockSseService.broadcast = vi.fn().mockImplementation((topic, data) => {
        sseEvents.push({ type: topic, data });
      });
      mockSseService.addClient = vi.fn().mockImplementation(id => {
        sseClientId = id;
        return id;
      });
    });

    it('should handle invalid input', async () => {
      const dto = {
        message: '',
        images: [],
      };

      await service.streamMessage(dto, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Message or images are required',
      });
    });

    it('should stream message with valid configuration', async () => {
      const dto = {
        message: 'Test message',
        threadId: 'test-thread',
      };

      // Mock agent with processMessage method
      const mockAgent = {
        processMessage: vi
          .fn()
          .mockImplementation(async (threadId, message, options) => {
            // Simulate streaming updates
            await options.onUpdate({
              id: 'msg-1',
              content: 'Hello',
              timestamp: new Date(),
              status: 'processing',
            });
            await options.onUpdate({
              id: 'msg-1',
              content: 'Hello World',
              timestamp: new Date(),
              status: 'completed',
            });
            return {
              id: 'msg-1',
              content: 'Hello World',
              timestamp: new Date(),
              status: 'completed',
            };
          }),
      };

      mockAgentPoolService.getCurrentAgent.mockResolvedValue(mockAgent);

      await service.streamMessage(dto, mockRes as Response);

      // Allow async operations to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify SSE client was added with proper parameters
      expect(mockSseService.addClient).toHaveBeenCalledWith(
        expect.stringMatching(/^chat-\d+-[a-z0-9]+$/),
        mockRes,
        'unified-events'
      );

      // Verify user message was persisted
      expect(mockConversationService.addMessage).toHaveBeenCalledTimes(2); // user + assistant

      // Verify SSE events were broadcast
      expect(sseEvents.length).toBeGreaterThan(0);
      const completedEvent = sseEvents.find(
        e =>
          e.type === 'unified-events' &&
          (e.data as { type: string }).type === 'completed'
      );
      expect(completedEvent).toBeDefined();

      // Verify cleanup
      expect(mockRes.end).toHaveBeenCalled();
      expect(mockSseService.removeClient).toHaveBeenCalledWith(sseClientId);
    });
  });

  describe('cancelMessage', () => {
    it('should throw BadRequestException when messageId is missing', async () => {
      const dto = { messageId: '', threadId: 'test-thread' };

      await expect(service.cancelMessage(dto)).rejects.toThrow(
        new BadRequestException('Message ID is required')
      );
    });

    it('should throw BadRequestException when threadId is missing', async () => {
      const dto = { messageId: 'msg-123', threadId: '' };

      await expect(service.cancelMessage(dto)).rejects.toThrow(
        new BadRequestException('Thread ID is required')
      );
    });

    it('should cancel active task successfully', async () => {
      const dto = { messageId: 'msg-123', threadId: 'test-thread' };

      // Start a task first
      const cancellationManager = service.getCancellationManager();
      cancellationManager.startTask('test-thread');

      const result = await service.cancelMessage(dto);

      expect(result).toEqual({ success: true });
      expect(mockConversationService.updateMessage).toHaveBeenCalledWith(
        'test-thread',
        'msg-123',
        { status: 'cancelled' }
      );
      expect(mockSseService.broadcast).toHaveBeenCalledWith('unified-events', {
        type: 'cancelled',
        threadId: 'test-thread',
        messageId: 'msg-123',
      });
    });

    it('should throw NotFoundException when no active task', async () => {
      const dto = { messageId: 'msg-123', threadId: 'test-thread' };

      await expect(service.cancelMessage(dto)).rejects.toThrow(
        new NotFoundException('No active processing found for this thread')
      );
    });
  });

  describe('deleteMessage', () => {
    it('should throw BadRequestException when messageId is missing', async () => {
      await expect(service.deleteMessage('')).rejects.toThrow(
        new BadRequestException('Message ID is required')
      );
    });

    it('should delete message successfully', async () => {
      const messageId = 'msg-123';

      mockConversationService.deleteMessageFromAllThreads.mockResolvedValue({
        deletedMessageIds: [messageId],
        affectedThreadIds: ['thread-1', 'thread-2'],
      });
      mockAgentPoolService.getCurrentThreadId.mockReturnValue('thread-1');

      const result = await service.deleteMessage(messageId);

      expect(result).toEqual({
        success: true,
        deletedMessageIds: [messageId],
      });
      expect(mockConversationService.save).toHaveBeenCalled();
      expect(
        mockAgentPoolService.syncCurrentAgentWithThread
      ).toHaveBeenCalledWith('thread-1');
      expect(mockSseService.broadcast).toHaveBeenCalledWith('unified-events', {
        type: 'messages-deleted',
        messageIds: [messageId],
      });
    });

    it('should throw BadRequestException when message not found', async () => {
      const messageId = 'msg-123';

      mockConversationService.deleteMessageFromAllThreads.mockResolvedValue({
        deletedMessageIds: [],
        affectedThreadIds: [],
      });

      await expect(service.deleteMessage(messageId)).rejects.toThrow(
        new BadRequestException('Message not found')
      );
    });
  });

  describe('loadThread', () => {
    it('should throw BadRequestException when threadId is missing', async () => {
      await expect(service.loadThread('')).rejects.toThrow(
        new BadRequestException('Thread ID is required')
      );
    });

    it('should load existing thread successfully', async () => {
      const threadId = 'test-thread';
      const mockThread = {
        id: threadId,
        messages: [
          { id: 'msg-1', content: 'Hello' },
          { id: 'msg-2', content: 'World' },
        ],
        customPrompt: 'Custom system prompt',
      };

      mockConversationService.getConversations.mockReturnValue([mockThread]);

      const mockAgent = {
        loadConversation: vi.fn().mockResolvedValue(undefined),
        updatePrompt: vi.fn().mockResolvedValue(undefined),
      };
      mockAgentPoolService.getCurrentAgent = vi
        .fn()
        .mockResolvedValue(mockAgent);

      const result = await service.loadThread(threadId);

      expect(result).toEqual({ success: true });
      expect(mockAgentPoolService.setCurrentThread).toHaveBeenCalledWith(
        threadId
      );
      expect(mockAgentPoolService.getCurrentAgent).toHaveBeenCalled();
      expect(mockAgent.loadConversation).toHaveBeenCalledWith(
        threadId,
        mockThread.messages
      );
      expect(mockAgent.updatePrompt).toHaveBeenCalledWith(
        threadId,
        'Custom system prompt'
      );
    });

    it('should handle non-existent thread', async () => {
      const threadId = 'non-existent';

      mockConversationService.getConversations.mockReturnValue([]);

      const mockAgent = {
        clearConversation: vi.fn().mockResolvedValue(undefined),
      };
      mockAgentPoolService.getCurrentAgent.mockResolvedValue(mockAgent);

      const result = await service.loadThread(threadId);

      expect(result).toEqual({ success: true });
      expect(mockAgent.clearConversation).toHaveBeenCalledWith(threadId);
    });
  });

  describe('CancellationManager', () => {
    it('should manage task lifecycle', () => {
      const manager = service.getCancellationManager();
      const threadId = 'test-thread';

      // Start a task
      const controller = manager.startTask(threadId);
      expect(controller).toBeDefined();
      expect(controller.signal).toBeDefined();
      expect(manager.isTaskActive(threadId)).toBe(true);

      // Cancel the task
      const cancelled = manager.cancelTask(threadId);
      expect(cancelled).toBe(true);
      expect(manager.isTaskActive(threadId)).toBe(false);

      // Try to cancel non-existent task
      const notCancelled = manager.cancelTask('non-existent');
      expect(notCancelled).toBe(false);
    });

    it('should cleanup all tasks', () => {
      const manager = service.getCancellationManager();

      // Start multiple tasks
      manager.startTask('thread-1');
      manager.startTask('thread-2');
      manager.startTask('thread-3');

      expect(manager.isTaskActive('thread-1')).toBe(true);
      expect(manager.isTaskActive('thread-2')).toBe(true);
      expect(manager.isTaskActive('thread-3')).toBe(true);

      // Cleanup all
      manager.cleanup();

      expect(manager.isTaskActive('thread-1')).toBe(false);
      expect(manager.isTaskActive('thread-2')).toBe(false);
      expect(manager.isTaskActive('thread-3')).toBe(false);
    });
  });
});
