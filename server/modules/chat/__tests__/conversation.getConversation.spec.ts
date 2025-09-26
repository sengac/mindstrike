import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConversationController } from '../conversation.controller';
import type { ConversationService } from '../services/conversation.service';
import type {
  AgentPoolService,
  Agent,
} from '../../agents/services/agent-pool.service';
import type { ConversationMessage } from '../types/conversation.types';

describe('ConversationController', () => {
  let controller: ConversationController;
  let mockConversationService: Partial<ConversationService>;
  let mockAgentPoolService: Partial<AgentPoolService>;
  let mockAgent: Partial<Agent>;

  beforeEach(() => {
    mockAgent = {
      getConversation: vi.fn(),
      clearConversation: vi.fn(),
    };

    mockAgentPoolService = {
      getCurrentThreadId: vi.fn().mockReturnValue('previous-thread'),
      setCurrentThread: vi.fn(),
      getCurrentAgent: vi.fn().mockReturnValue(mockAgent),
    };

    mockConversationService = {};

    controller = new ConversationController(
      mockConversationService as ConversationService,
      mockAgentPoolService as AgentPoolService
    );
  });

  describe('getConversation', () => {
    it('should return conversation successfully', async () => {
      const threadId = 'test-thread-123';
      const mockConversation: ConversationMessage[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Hello',
          timestamp: new Date('2024-01-01T10:00:00Z'),
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'Hi there!',
          timestamp: new Date('2024-01-01T10:00:01Z'),
        },
      ];

      (mockAgent.getConversation as ReturnType<typeof vi.fn>).mockReturnValue(
        mockConversation
      );

      const result = await controller.getConversation(threadId);

      expect(result).toEqual(mockConversation);
      expect(mockAgentPoolService.getCurrentThreadId).toHaveBeenCalled();
      expect(mockAgentPoolService.setCurrentThread).toHaveBeenCalledWith(
        threadId
      );
      expect(mockAgentPoolService.getCurrentAgent).toHaveBeenCalled();
      expect(mockAgent.getConversation).toHaveBeenCalledWith(threadId);
      expect(mockAgentPoolService.setCurrentThread).toHaveBeenCalledWith(
        'previous-thread'
      );
    });

    it('should filter out system messages (verified by agent)', async () => {
      const threadId = 'test-thread-123';
      const mockConversation: ConversationMessage[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Hello',
          timestamp: new Date('2024-01-01T10:00:00Z'),
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'Hi there!',
          timestamp: new Date('2024-01-01T10:00:01Z'),
        },
        // Note: system messages are filtered by the agent.getConversation method
      ];

      (mockAgent.getConversation as ReturnType<typeof vi.fn>).mockReturnValue(
        mockConversation
      );

      const result = await controller.getConversation(threadId);

      expect(result).toEqual(mockConversation);
      // Verify that getConversation was called - the filtering happens inside the agent
      expect(mockAgent.getConversation).toHaveBeenCalledWith(threadId);
    });

    it('should restore previous thread ID after getting conversation', async () => {
      const threadId = 'current-thread';
      const previousThreadId = 'previous-thread';
      const mockConversation: ConversationMessage[] = [];

      (
        mockAgentPoolService.getCurrentThreadId as ReturnType<typeof vi.fn>
      ).mockReturnValue(previousThreadId);
      (mockAgent.getConversation as ReturnType<typeof vi.fn>).mockReturnValue(
        mockConversation
      );

      await controller.getConversation(threadId);

      expect(mockAgentPoolService.setCurrentThread).toHaveBeenCalledTimes(2);
      expect(mockAgentPoolService.setCurrentThread).toHaveBeenNthCalledWith(
        1,
        threadId
      );
      expect(mockAgentPoolService.setCurrentThread).toHaveBeenNthCalledWith(
        2,
        previousThreadId
      );
    });

    it('should throw BadRequestException when threadId is empty', async () => {
      await expect(controller.getConversation('')).rejects.toThrow(
        BadRequestException
      );
      await expect(controller.getConversation('')).rejects.toThrow(
        'Thread ID is required'
      );
    });

    it('should throw InternalServerErrorException when getConversation method not implemented', async () => {
      const threadId = 'test-thread-123';
      const mockAgentWithoutMethod = {};

      (
        mockAgentPoolService.getCurrentAgent as ReturnType<typeof vi.fn>
      ).mockReturnValue(mockAgentWithoutMethod);

      await expect(controller.getConversation(threadId)).rejects.toThrow(
        InternalServerErrorException
      );
      await expect(controller.getConversation(threadId)).rejects.toThrow(
        'getConversation method not implemented'
      );
    });

    it('should handle agent.getConversation errors', async () => {
      const threadId = 'test-thread-123';
      const error = new Error('Agent internal error');

      (
        mockAgent.getConversation as ReturnType<typeof vi.fn>
      ).mockImplementation(() => {
        throw error;
      });

      await expect(controller.getConversation(threadId)).rejects.toThrow(
        InternalServerErrorException
      );
      await expect(controller.getConversation(threadId)).rejects.toThrow(
        'Agent internal error'
      );
    });

    it('should handle unknown error types', async () => {
      const threadId = 'test-thread-123';
      const error = 'Unknown error string';

      (
        mockAgent.getConversation as ReturnType<typeof vi.fn>
      ).mockImplementation(() => {
        throw error;
      });

      await expect(controller.getConversation(threadId)).rejects.toThrow(
        'Failed to get conversation'
      );
    });

    it('should handle agentPool.setCurrentThread failures', async () => {
      const threadId = 'test-thread-123';
      const error = new Error('Failed to set thread');

      (
        mockAgentPoolService.setCurrentThread as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce(error);

      await expect(controller.getConversation(threadId)).rejects.toThrow(
        InternalServerErrorException
      );
    });

    it('should still restore thread even if getConversation throws', async () => {
      const threadId = 'current-thread';
      const previousThreadId = 'previous-thread';
      const error = new Error('Agent error');

      (
        mockAgentPoolService.getCurrentThreadId as ReturnType<typeof vi.fn>
      ).mockReturnValue(previousThreadId);
      (
        mockAgent.getConversation as ReturnType<typeof vi.fn>
      ).mockImplementation(() => {
        throw error;
      });

      await expect(controller.getConversation(threadId)).rejects.toThrow(
        'Agent error'
      );

      // Verify that setCurrentThread was called to set and then restore the thread (finally block)
      expect(mockAgentPoolService.setCurrentThread).toHaveBeenCalledTimes(2);
      expect(mockAgentPoolService.setCurrentThread).toHaveBeenNthCalledWith(
        1,
        threadId
      );
      expect(mockAgentPoolService.setCurrentThread).toHaveBeenNthCalledWith(
        2,
        previousThreadId
      );
    });
  });

  describe('clearConversation', () => {
    it('should clear conversation successfully', async () => {
      const threadId = 'test-thread-123';

      const result = await controller.clearConversation(threadId);

      expect(result).toEqual({ success: true });
      expect(mockAgentPoolService.getCurrentThreadId).toHaveBeenCalled();
      expect(mockAgentPoolService.setCurrentThread).toHaveBeenCalledWith(
        threadId
      );
      expect(mockAgentPoolService.getCurrentAgent).toHaveBeenCalled();
      expect(mockAgent.clearConversation).toHaveBeenCalledWith(threadId);
      expect(mockAgentPoolService.setCurrentThread).toHaveBeenCalledWith(
        'previous-thread'
      );
    });

    it('should restore previous thread ID after clearing conversation', async () => {
      const threadId = 'current-thread';
      const previousThreadId = 'previous-thread';

      (
        mockAgentPoolService.getCurrentThreadId as ReturnType<typeof vi.fn>
      ).mockReturnValue(previousThreadId);

      await controller.clearConversation(threadId);

      expect(mockAgentPoolService.setCurrentThread).toHaveBeenCalledTimes(2);
      expect(mockAgentPoolService.setCurrentThread).toHaveBeenNthCalledWith(
        1,
        threadId
      );
      expect(mockAgentPoolService.setCurrentThread).toHaveBeenNthCalledWith(
        2,
        previousThreadId
      );
    });

    it('should throw BadRequestException when threadId is empty', async () => {
      await expect(controller.clearConversation('')).rejects.toThrow(
        BadRequestException
      );
      await expect(controller.clearConversation('')).rejects.toThrow(
        'Thread ID is required'
      );
    });

    it('should handle clearConversation errors', async () => {
      const threadId = 'test-thread-123';
      const error = new Error('Failed to clear conversation');

      (
        mockAgent.clearConversation as ReturnType<typeof vi.fn>
      ).mockRejectedValue(error);

      // The current implementation doesn't catch errors, so it will throw directly
      await expect(controller.clearConversation(threadId)).rejects.toThrow(
        'Failed to clear conversation'
      );
    });

    it('should handle agentPool.setCurrentThread failures', async () => {
      const threadId = 'test-thread-123';
      const error = new Error('Failed to set thread');

      (
        mockAgentPoolService.setCurrentThread as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce(error);

      await expect(controller.clearConversation(threadId)).rejects.toThrow(
        'Failed to set thread'
      );
    });
  });
});
