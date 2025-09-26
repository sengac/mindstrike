import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InternalServerErrorException } from '@nestjs/common';
import { RolesController } from '../roles.controller';
import type { AgentPoolService } from '../services/agent-pool.service';

interface MockAgent {
  getCurrentPrompt: ReturnType<typeof vi.fn>;
  getDefaultPrompt: ReturnType<typeof vi.fn>;
  updatePrompt: ReturnType<typeof vi.fn>;
}

describe('RolesController', () => {
  let controller: RolesController;
  let mockAgentPoolService: Partial<AgentPoolService>;
  let mockAgent: MockAgent;

  beforeEach(() => {
    mockAgent = {
      getCurrentPrompt: vi.fn().mockReturnValue('Current prompt'),
      getDefaultPrompt: vi.fn().mockReturnValue('Default prompt'),
      updatePrompt: vi.fn().mockResolvedValue(undefined),
    };

    mockAgentPoolService = {
      getAgent: vi.fn().mockReturnValue(mockAgent),
    };

    controller = new RolesController(mockAgentPoolService as AgentPoolService);
  });

  describe('getPromptHandlerDefault (GET /api/role)', () => {
    it('should get default prompt when threadId is not provided', async () => {
      const result = await controller.getPromptHandlerDefault();

      expect(result).toEqual({
        currentPrompt: 'Current prompt',
        defaultPrompt: 'Default prompt',
        isDefault: false,
        hasCustomPrompt: false,
      });
      expect(mockAgentPoolService.getAgent).toHaveBeenCalledWith('default');
    });
  });

  describe('getPromptHandlerWithThread (GET /api/role/:threadId)', () => {
    it('should get prompt for specific thread', async () => {
      const threadId = 'test-thread-123';
      const result = await controller.getPromptHandlerWithThread(threadId);

      expect(result).toEqual({
        currentPrompt: 'Current prompt',
        defaultPrompt: 'Default prompt',
        isDefault: false,
        hasCustomPrompt: false,
      });
      expect(mockAgentPoolService.getAgent).toHaveBeenCalledWith(threadId);
    });

    it('should indicate when using default prompt', async () => {
      mockAgent.getCurrentPrompt.mockReturnValue('Default prompt');

      const result = await controller.getPromptHandlerWithThread('test-thread');

      expect(result.isDefault).toBe(true);
    });

    it('should handle errors', async () => {
      const error = new Error('Agent not found');
      (
        mockAgentPoolService.getAgent as ReturnType<typeof vi.fn>
      ).mockImplementation(() => {
        throw error;
      });

      await expect(controller.getPromptHandlerDefault()).rejects.toThrow(
        InternalServerErrorException
      );
    });
  });

  describe('setPromptHandlerDefault (POST /api/role)', () => {
    it('should set default prompt when threadId is not provided', async () => {
      const body = { customPrompt: 'Custom prompt text' };
      const result = await controller.setPromptHandlerDefault(body);

      expect(result).toEqual({ success: true });
      expect(mockAgentPoolService.getAgent).toHaveBeenCalledWith('default');
      expect(mockAgent.updatePrompt).toHaveBeenCalledWith(
        'default',
        'Custom prompt text'
      );
    });
  });

  describe('setPromptHandlerWithThread (POST /api/role/:threadId)', () => {
    it('should set prompt for specific thread', async () => {
      const threadId = 'test-thread-123';
      const body = { customPrompt: 'Thread-specific prompt' };
      const result = await controller.setPromptHandlerWithThread(
        threadId,
        body
      );

      expect(result).toEqual({ success: true });
      expect(mockAgentPoolService.getAgent).toHaveBeenCalledWith(threadId);
      expect(mockAgent.updatePrompt).toHaveBeenCalledWith(
        threadId,
        'Thread-specific prompt'
      );
    });

    it('should clear custom prompt when customPrompt is not provided', async () => {
      const threadId = 'test-thread-123';
      const body = {};
      const result = await controller.setPromptHandlerWithThread(
        threadId,
        body
      );

      expect(result).toEqual({ success: true });
      expect(mockAgent.updatePrompt).toHaveBeenCalledWith(threadId, undefined);
    });

    it('should handle errors during prompt update', async () => {
      const error = new Error('Update failed');
      mockAgent.updatePrompt.mockRejectedValue(error);

      const body = { customPrompt: 'Test prompt' };
      await expect(
        controller.setPromptHandlerWithThread('thread', body)
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('route behavior consistency', () => {
    it('should handle default route same as explicit "default" threadId', async () => {
      const resultDefault = await controller.getPromptHandlerDefault();
      const resultExplicit =
        await controller.getPromptHandlerWithThread('default');

      expect(resultDefault).toEqual(resultExplicit);
    });

    it('should treat empty string threadId as "default"', async () => {
      const result = await controller.getPromptHandlerWithThread('');
      expect(mockAgentPoolService.getAgent).toHaveBeenCalledWith('default');
    });
  });

  describe('thread prompts tracking', () => {
    it('should track custom prompts in threadPrompts map', async () => {
      const threadId = 'test-thread-123';
      const customPrompt = 'Custom prompt';

      // Set a custom prompt
      await controller.setPromptHandlerWithThread(threadId, { customPrompt });

      // Get prompt info - should show hasCustomPrompt as true
      const result = await controller.getPromptHandlerWithThread(threadId);
      expect(result.hasCustomPrompt).toBe(true);
    });

    it('should remove from threadPrompts map when clearing', async () => {
      const threadId = 'test-thread-123';

      // Set a custom prompt
      await controller.setPromptHandlerWithThread(threadId, {
        customPrompt: 'Test',
      });

      // Clear it
      await controller.setPromptHandlerWithThread(threadId, {});

      // Should no longer have custom prompt
      const result = await controller.getPromptHandlerWithThread(threadId);
      expect(result.hasCustomPrompt).toBe(false);
    });
  });
});
