import { BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import type { ModuleRef } from '@nestjs/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessageService } from './message.service';
import type { ConversationService } from './conversation.service';
import type { AgentPoolService } from '../../agents/services/agent-pool.service';
import type { SseService } from '../../events/services/sse.service';

describe('MessageService', () => {
  let service: MessageService;
  let mockConversationService: Partial<ConversationService>;
  let mockAgentPoolService: Partial<AgentPoolService>;
  let mockSseService: Partial<SseService>;
  let mockModuleRef: Partial<ModuleRef>;

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
      getAgent: vi.fn().mockReturnValue(null),
      getCurrentAgent: vi.fn().mockReturnValue(null),
      getCurrentThreadId: vi.fn().mockReturnValue('current-thread'),
      syncCurrentAgentWithThread: vi.fn().mockResolvedValue(undefined),
    };

    mockSseService = {
      broadcast: vi.fn(),
      addClient: vi.fn(),
      removeClient: vi.fn(),
    };

    // Mock ModuleRef to return the AgentPoolService
    mockModuleRef = {
      get: vi.fn().mockReturnValue(mockAgentPoolService),
    };

    // Directly instantiate the service with mocked dependencies
    service = new MessageService(
      mockConversationService as ConversationService,
      mockSseService as SseService,
      mockModuleRef as ModuleRef
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

    it('should throw BadRequestException when LLM model is not configured', async () => {
      const dto = {
        message: 'Test message',
        threadId: 'test-thread',
      };

      await expect(service.processMessage(dto)).rejects.toThrow(
        new BadRequestException(
          'No LLM model configured. Please select a model from the available options.'
        )
      );
    });

    it('should process message with configured LLM', async () => {
      const dto = {
        message: 'Test message',
        messageId: 'msg-123',
        threadId: 'test-thread',
      };

      // Configure LLM
      service.setCurrentLlmConfig({ model: 'gpt-4' });

      // Mock agent with processMessage method
      const mockAgent = {
        processMessage: vi.fn().mockResolvedValue({
          id: 'response-123',
          content: 'Response',
          timestamp: new Date(),
          status: 'completed',
        }),
      };

      mockAgentPoolService.getCurrentAgent.mockReturnValue(mockAgent);

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

    it('should handle missing LLM configuration', async () => {
      const dto = {
        message: 'Test message',
      };

      await service.streamMessage(dto, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error:
          'No LLM model configured. Please select a model from the available options.',
      });
    });

    it('should stream message with valid configuration', async () => {
      const dto = {
        message: 'Test message',
        threadId: 'test-thread',
      };

      // Configure LLM
      service.setCurrentLlmConfig({ model: 'gpt-4' });

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

      mockAgentPoolService.getCurrentAgent.mockReturnValue(mockAgent);

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

    it('should handle concurrent messages to different threads', async () => {
      service.setCurrentLlmConfig({ model: 'gpt-4' });

      const mockAgent1 = {
        processMessage: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
          return {
            id: 'msg-1',
            content: 'Response 1',
            timestamp: new Date(),
            status: 'completed',
          };
        }),
      };

      const mockAgent2 = {
        processMessage: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
          return {
            id: 'msg-2',
            content: 'Response 2',
            timestamp: new Date(),
            status: 'completed',
          };
        }),
      };

      mockAgentPoolService.getAgent
        .mockReturnValueOnce(mockAgent1)
        .mockReturnValueOnce(mockAgent2);
      mockAgentPoolService.getCurrentAgent
        .mockReturnValueOnce(mockAgent1)
        .mockReturnValueOnce(mockAgent2);

      // Start two concurrent messages
      const promise1 = service.processMessage({
        message: 'Message 1',
        threadId: 'thread-1',
      });

      const promise2 = service.processMessage({
        message: 'Message 2',
        threadId: 'thread-2',
      });

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toEqual({ status: 'processing' });
      expect(result2).toEqual({ status: 'processing' });

      // Both agents should have been called
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(mockAgent1.processMessage).toHaveBeenCalled();
      expect(mockAgent2.processMessage).toHaveBeenCalled();
    });

    it('should handle message with notes attachment', async () => {
      const dto = {
        message: 'Test with notes',
        notes: [
          { content: 'Note 1', nodeLabel: 'Node A' },
          { content: 'Note 2', nodeLabel: 'Node B' },
        ],
        threadId: 'test-thread',
      };

      service.setCurrentLlmConfig({ model: 'gpt-4' });

      const mockAgent = {
        processMessage: vi.fn().mockResolvedValue({
          id: 'msg-1',
          content: 'Processed with notes',
          timestamp: new Date(),
          status: 'completed',
        }),
      };

      mockAgentPoolService.getCurrentAgent.mockReturnValue(mockAgent);

      await service.streamMessage(dto, mockRes as Response);
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify notes were passed to agent
      expect(mockAgent.processMessage).toHaveBeenCalledWith(
        'test-thread',
        'Test with notes',
        expect.objectContaining({
          notes: dto.notes,
        })
      );
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

    it('should throw BadRequestException when no active task', async () => {
      const dto = { messageId: 'msg-123', threadId: 'test-thread' };

      await expect(service.cancelMessage(dto)).rejects.toThrow(
        new BadRequestException('No active processing found for this thread')
      );
    });

    it('should cancel message during streaming', async () => {
      service.setCurrentLlmConfig({ model: 'gpt-4' });

      let abortSignal: AbortSignal | undefined;
      const mockAgent = {
        processMessage: vi
          .fn()
          .mockImplementation(async (threadId, message, options) => {
            abortSignal = options.signal;
            // Simulate long-running process
            await new Promise((resolve, reject) => {
              const timeout = setTimeout(resolve, 1000);
              options.signal.addEventListener('abort', () => {
                clearTimeout(timeout);
                reject(new Error('AbortError'));
              });
            });
            return {
              id: 'msg-1',
              content: 'Should not reach here',
              timestamp: new Date(),
              status: 'completed',
            };
          }),
      };

      mockAgentPoolService.getCurrentAgent.mockReturnValue(mockAgent);

      // Start processing
      const processingPromise = service.processMessage({
        message: 'Long message',
        threadId: 'test-thread',
        messageId: 'msg-123',
      });

      // Wait for processing to start
      await new Promise(resolve => setTimeout(resolve, 50));

      // Cancel the message
      const cancelResult = await service.cancelMessage({
        messageId: 'msg-123',
        threadId: 'test-thread',
      });

      expect(cancelResult).toEqual({ success: true });
      expect(abortSignal?.aborted).toBe(true);

      // Verify cancellation was broadcast
      expect(mockSseService.broadcast).toHaveBeenCalledWith('unified-events', {
        type: 'cancelled',
        threadId: 'test-thread',
        messageId: 'msg-123',
      });

      // Verify message status was updated
      expect(mockConversationService.updateMessage).toHaveBeenCalledWith(
        'test-thread',
        'msg-123',
        { status: 'cancelled' }
      );

      await processingPromise;
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

    it('should handle deletion error gracefully', async () => {
      const messageId = 'msg-123';

      mockConversationService.deleteMessageFromAllThreads.mockRejectedValue(
        new Error('Database error')
      );

      await expect(service.deleteMessage(messageId)).rejects.toThrow(
        new BadRequestException('Internal server error')
      );
    });

    it('should sync only current thread after deletion', async () => {
      const messageId = 'msg-123';

      mockConversationService.deleteMessageFromAllThreads.mockResolvedValue({
        deletedMessageIds: [messageId],
        affectedThreadIds: ['thread-1', 'thread-2', 'thread-3'],
      });

      // Only thread-2 is current (getCurrentThreadId is called once per affected thread)
      mockAgentPoolService.getCurrentThreadId
        .mockReturnValueOnce('other-thread') // for thread-1 check
        .mockReturnValueOnce('thread-2') // for thread-2 check - MATCH!
        .mockReturnValueOnce('other-thread'); // for thread-3 check

      await service.deleteMessage(messageId);

      // Should only sync thread-2
      expect(
        mockAgentPoolService.syncCurrentAgentWithThread
      ).toHaveBeenCalledTimes(1);
      expect(
        mockAgentPoolService.syncCurrentAgentWithThread
      ).toHaveBeenCalledWith('thread-2');
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
      mockAgentPoolService.getCurrentAgent.mockReturnValue(mockAgent);

      const result = await service.loadThread(threadId);

      expect(result).toEqual({ success: true });
      expect(mockAgentPoolService.setCurrentThread).toHaveBeenCalledWith(
        threadId
      );
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
      mockAgentPoolService.getCurrentAgent.mockReturnValue(mockAgent);

      const result = await service.loadThread(threadId);

      expect(result).toEqual({ success: true });
      expect(mockAgent.clearConversation).toHaveBeenCalledWith(threadId);
    });

    it('should handle agent without clearConversation method', async () => {
      const threadId = 'non-existent';

      mockConversationService.getConversations.mockReturnValue([]);

      // Agent without clearConversation method
      const mockAgent = {};
      mockAgentPoolService.getCurrentAgent.mockReturnValue(mockAgent);

      const result = await service.loadThread(threadId);

      // Should still succeed
      expect(result).toEqual({ success: true });
    });

    it('should handle thread without custom prompt', async () => {
      const threadId = 'test-thread';
      const mockThread = {
        id: threadId,
        messages: [{ id: 'msg-1', content: 'Hello' }],
        // No customPrompt
      };

      mockConversationService.getConversations.mockReturnValue([mockThread]);

      const mockAgent = {
        loadConversation: vi.fn().mockResolvedValue(undefined),
        updatePrompt: vi.fn().mockResolvedValue(undefined),
      };
      mockAgentPoolService.getCurrentAgent.mockReturnValue(mockAgent);

      const result = await service.loadThread(threadId);

      expect(result).toEqual({ success: true });
      expect(mockAgent.updatePrompt).toHaveBeenCalledWith(threadId, undefined);
    });

    it('should handle loadThread error gracefully', async () => {
      const threadId = 'test-thread';

      mockAgentPoolService.setCurrentThread.mockRejectedValue(
        new Error('Thread locked')
      );

      await expect(service.loadThread(threadId)).rejects.toThrow(
        new BadRequestException('Failed to load thread')
      );
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
