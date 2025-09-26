import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InternalServerErrorException } from '@nestjs/common';
import { RolesController } from '../roles.controller';
import type { AgentPoolService, Agent } from '../services/agent-pool.service';

describe('RolesController', () => {
  let controller: RolesController;
  let mockAgentPoolService: Partial<AgentPoolService>;
  let mockAgent: Partial<Agent>;

  beforeEach(() => {
    mockAgent = {
      getCurrentPrompt: vi.fn().mockReturnValue('Current prompt text'),
      getDefaultPrompt: vi.fn().mockReturnValue('Default prompt text'),
      updatePrompt: vi.fn(),
    };

    mockAgentPoolService = {
      getAgent: vi.fn().mockReturnValue(mockAgent),
    };

    controller = new RolesController(mockAgentPoolService as AgentPoolService);
  });

  describe('GET /api/role', () => {
    it('should return default prompt configuration', async () => {
      const result = await controller.getDefaultPrompt();

      expect(result).toEqual({
        currentPrompt: 'Current prompt text',
        defaultPrompt: 'Default prompt text',
        isDefault: false,
        hasCustomPrompt: false,
      });
      expect(mockAgentPoolService.getAgent).toHaveBeenCalledWith('default');
    });

    it('should handle errors when getting default prompt', async () => {
      const error = new Error('Agent error');
      (
        mockAgentPoolService.getAgent as ReturnType<typeof vi.fn>
      ).mockImplementation(() => {
        throw error;
      });

      await expect(controller.getDefaultPrompt()).rejects.toThrow(
        InternalServerErrorException
      );
    });
  });

  describe('GET /api/role/:threadId', () => {
    it('should return thread prompt configuration', async () => {
      const threadId = 'test-thread-123';
      const result = await controller.getThreadPrompt(threadId);

      expect(result).toEqual({
        currentPrompt: 'Current prompt text',
        defaultPrompt: 'Default prompt text',
        isDefault: false,
        hasCustomPrompt: false,
      });
      expect(mockAgentPoolService.getAgent).toHaveBeenCalledWith(threadId);
    });

    it('should correctly identify when using default prompt', async () => {
      const threadId = 'test-thread-123';
      (mockAgent.getCurrentPrompt as ReturnType<typeof vi.fn>).mockReturnValue(
        'Same prompt'
      );
      (mockAgent.getDefaultPrompt as ReturnType<typeof vi.fn>).mockReturnValue(
        'Same prompt'
      );

      const result = await controller.getThreadPrompt(threadId);

      expect(result.isDefault).toBe(true);
    });

    it('should track custom prompts', async () => {
      const threadId = 'test-thread-123';

      // First set a custom prompt
      await controller.setThreadPrompt(threadId, {
        customPrompt: 'Custom prompt',
      });

      // Then get the prompt
      const result = await controller.getThreadPrompt(threadId);

      expect(result.hasCustomPrompt).toBe(true);
    });

    it('should handle errors when getting thread prompt', async () => {
      const threadId = 'test-thread-123';
      const error = new Error('Agent not found');
      (
        mockAgentPoolService.getAgent as ReturnType<typeof vi.fn>
      ).mockImplementation(() => {
        throw error;
      });

      await expect(controller.getThreadPrompt(threadId)).rejects.toThrow(
        InternalServerErrorException
      );
    });
  });

  describe('POST /api/role', () => {
    it('should set default prompt successfully', async () => {
      const customPrompt = 'New custom prompt';
      const result = await controller.setDefaultPrompt({ customPrompt });

      expect(result).toEqual({ success: true });
      expect(mockAgentPoolService.getAgent).toHaveBeenCalledWith('default');
      expect(mockAgent.updatePrompt).toHaveBeenCalledWith(
        'default',
        customPrompt
      );
    });

    it('should clear default prompt when customPrompt is undefined', async () => {
      const result = await controller.setDefaultPrompt({});

      expect(result).toEqual({ success: true });
      expect(mockAgent.updatePrompt).toHaveBeenCalledWith('default', undefined);
    });

    it('should handle errors when setting default prompt', async () => {
      const error = new Error('Update failed');
      (mockAgent.updatePrompt as ReturnType<typeof vi.fn>).mockImplementation(
        () => {
          throw error;
        }
      );

      await expect(
        controller.setDefaultPrompt({ customPrompt: 'Test' })
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('POST /api/role/:threadId', () => {
    it('should set thread prompt successfully', async () => {
      const threadId = 'test-thread-123';
      const customPrompt = 'Thread custom prompt';
      const result = await controller.setThreadPrompt(threadId, {
        customPrompt,
      });

      expect(result).toEqual({ success: true });
      expect(mockAgentPoolService.getAgent).toHaveBeenCalledWith(threadId);
      expect(mockAgent.updatePrompt).toHaveBeenCalledWith(
        threadId,
        customPrompt
      );
    });

    it('should store custom prompt in threadPrompts map', async () => {
      const threadId = 'test-thread-123';
      const customPrompt = 'Thread custom prompt';

      await controller.setThreadPrompt(threadId, { customPrompt });

      // Verify the prompt is stored (check hasCustomPrompt)
      const promptInfo = await controller.getThreadPrompt(threadId);
      expect(promptInfo.hasCustomPrompt).toBe(true);
    });

    it('should remove thread prompt when customPrompt is undefined', async () => {
      const threadId = 'test-thread-123';

      // First set a custom prompt
      await controller.setThreadPrompt(threadId, { customPrompt: 'Test' });

      // Then clear it
      await controller.setThreadPrompt(threadId, {});

      // Verify it's removed
      const promptInfo = await controller.getThreadPrompt(threadId);
      expect(promptInfo.hasCustomPrompt).toBe(false);
      expect(mockAgent.updatePrompt).toHaveBeenLastCalledWith(
        threadId,
        undefined
      );
    });

    it('should handle errors when setting thread prompt', async () => {
      const threadId = 'test-thread-123';
      const error = new Error('Update failed');
      (mockAgent.updatePrompt as ReturnType<typeof vi.fn>).mockImplementation(
        () => {
          throw error;
        }
      );

      await expect(
        controller.setThreadPrompt(threadId, { customPrompt: 'Test' })
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should handle non-Error objects thrown', async () => {
      const threadId = 'test-thread-123';
      (mockAgent.updatePrompt as ReturnType<typeof vi.fn>).mockImplementation(
        () => {
          throw 'String error';
        }
      );

      await expect(
        controller.setThreadPrompt(threadId, { customPrompt: 'Test' })
      ).rejects.toThrow('Unknown error');
    });
  });
});
