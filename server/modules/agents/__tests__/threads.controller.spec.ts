import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ThreadsController } from '../threads.controller';
import type { AgentsService } from '../agents.service';
import type { ConversationService } from '../../chat/services/conversation.service';

describe('ThreadsController', () => {
  let controller: ThreadsController;
  let mockAgentsService: Partial<AgentsService>;
  let mockConversationService: Partial<ConversationService>;

  const mockThread = {
    id: 'thread-123',
    name: 'Test Thread',
    messages: [],
    customPrompt: 'Custom prompt',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    mockAgentsService = {};

    mockConversationService = {
      getThreadList: vi.fn().mockReturnValue([
        {
          id: 'thread-123',
          name: 'Test Thread',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          messageCount: 5,
        },
      ]),
      getThread: vi.fn().mockReturnValue(mockThread),
      createThread: vi.fn().mockResolvedValue(mockThread),
      load: vi.fn().mockResolvedValue(undefined),
      renameThread: vi.fn().mockResolvedValue(true),
      updateThreadPrompt: vi.fn().mockResolvedValue(true),
      deleteThread: vi.fn().mockResolvedValue(true),
      clearThread: vi.fn().mockResolvedValue(true),
    };

    controller = new ThreadsController(
      mockAgentsService as AgentsService,
      mockConversationService as ConversationService
    );
  });

  describe('getAllThreads', () => {
    it('should return all threads', async () => {
      const result = await controller.getAllThreads();

      expect(result).toEqual([
        {
          id: 'thread-123',
          title: 'Test Thread',
          type: 'chat',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          messageCount: 5,
        },
      ]);
      expect(mockConversationService.getThreadList).toHaveBeenCalled();
    });

    it('should handle pagination', async () => {
      (
        mockConversationService.getThreadList as ReturnType<typeof vi.fn>
      ).mockReturnValue([
        {
          id: '1',
          name: 'Thread 1',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
          messageCount: 1,
        },
        {
          id: '2',
          name: 'Thread 2',
          createdAt: '2024-01-02',
          updatedAt: '2024-01-02',
          messageCount: 2,
        },
        {
          id: '3',
          name: 'Thread 3',
          createdAt: '2024-01-03',
          updatedAt: '2024-01-03',
          messageCount: 3,
        },
      ]);

      const result = await controller.getAllThreads(undefined, 2, 1);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('2');
      expect(result[1].id).toBe('3');
    });
  });

  describe('getThread', () => {
    it('should return thread details', async () => {
      const result = await controller.getThread('thread-123');

      expect(result).toEqual({
        id: 'thread-123',
        title: 'Test Thread',
        type: 'chat',
        metadata: {
          customPrompt: 'Custom prompt',
          messageCount: 0,
        },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      });
      expect(mockConversationService.getThread).toHaveBeenCalledWith(
        'thread-123'
      );
    });

    it('should throw NotFoundException when thread not found', async () => {
      (
        mockConversationService.getThread as ReturnType<typeof vi.fn>
      ).mockReturnValue(null);

      await expect(controller.getThread('non-existent')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('createThread', () => {
    it('should create a new thread', async () => {
      const dto = { title: 'New Thread' };

      const result = await controller.createThread(dto);

      expect(result).toEqual({
        id: 'thread-123',
        title: 'Test Thread',
        type: 'chat',
      });
      expect(mockConversationService.createThread).toHaveBeenCalledWith(
        'New Thread'
      );
    });

    it('should update custom prompt if provided', async () => {
      const dto = {
        title: 'New Thread',
        metadata: { customPrompt: 'Custom prompt' },
      };

      await controller.createThread(dto);

      expect(mockConversationService.updateThreadPrompt).toHaveBeenCalledWith(
        'thread-123',
        'Custom prompt'
      );
    });
  });

  describe('updateThread', () => {
    it('should update thread title', async () => {
      const dto = { title: 'Updated Title', metadata: {} };

      const result = await controller.updateThread('thread-123', dto);

      expect(result).toEqual({ success: true });
      expect(mockConversationService.load).toHaveBeenCalled();
      expect(mockConversationService.renameThread).toHaveBeenCalledWith(
        'thread-123',
        'Updated Title'
      );
    });

    it('should update custom prompt', async () => {
      const dto = { metadata: { customPrompt: 'New prompt' } };

      const result = await controller.updateThread('thread-123', dto);

      expect(result).toEqual({ success: true });
      expect(mockConversationService.updateThreadPrompt).toHaveBeenCalledWith(
        'thread-123',
        'New prompt'
      );
    });

    it('should handle both title and prompt updates', async () => {
      const dto = {
        title: 'New Title',
        metadata: { customPrompt: 'New prompt' },
      };

      await controller.updateThread('thread-123', dto);

      expect(mockConversationService.renameThread).toHaveBeenCalled();
      expect(mockConversationService.updateThreadPrompt).toHaveBeenCalled();
    });
  });

  describe('deleteThread', () => {
    it('should delete a thread successfully', async () => {
      const result = await controller.deleteThread('thread-123');

      expect(result).toEqual({ success: true });
      expect(mockConversationService.load).toHaveBeenCalled();
      expect(mockConversationService.deleteThread).toHaveBeenCalledWith(
        'thread-123'
      );
    });

    it('should throw NotFoundException when thread not found', async () => {
      (
        mockConversationService.deleteThread as ReturnType<typeof vi.fn>
      ).mockResolvedValue(false);

      await expect(controller.deleteThread('non-existent')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should handle load timeout', async () => {
      (
        mockConversationService.load as ReturnType<typeof vi.fn>
      ).mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 4000))
      );

      await expect(controller.deleteThread('thread-123')).rejects.toThrow(
        'Conversation manager load timeout in delete thread'
      );
    });
  });

  describe('clearThread', () => {
    it('should clear thread messages successfully', async () => {
      const result = await controller.clearThread('thread-123');

      expect(result).toEqual({ success: true });
      expect(mockConversationService.load).toHaveBeenCalled();
      expect(mockConversationService.clearThread).toHaveBeenCalledWith(
        'thread-123'
      );
    });

    it('should throw NotFoundException when thread not found', async () => {
      (
        mockConversationService.clearThread as ReturnType<typeof vi.fn>
      ).mockResolvedValue(false);

      await expect(controller.clearThread('non-existent')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('forkThread', () => {
    it('should return stub implementation', async () => {
      const result = await controller.forkThread('thread-123');

      expect(result).toEqual({
        id: 'thread_fork_stub',
        originalId: 'thread-123',
        title: 'Forked Thread',
      });
    });
  });
});
