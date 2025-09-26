import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Response } from 'express';
import { TasksController } from '../tasks.controller';
import type { TasksService } from '../tasks.service';
import type { SseService } from '../../events/services/sse.service';

describe('TasksController', () => {
  let controller: TasksController;
  let mockTasksService: Partial<TasksService>;
  let mockSseService: Partial<SseService>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    mockTasksService = {};

    mockSseService = {
      addClient: vi.fn(),
    };

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    controller = new TasksController(
      mockTasksService as TasksService,
      mockSseService as SseService
    );
  });

  describe('streamTaskUpdates', () => {
    it('should establish SSE connection for workflow', async () => {
      const workflowId = 'test-workflow-123';

      await controller.streamTaskUpdates(workflowId, mockResponse as Response);

      expect(mockSseService.addClient).toHaveBeenCalled();
      const callArgs = (mockSseService.addClient as ReturnType<typeof vi.fn>)
        .mock.calls[0];
      expect(callArgs[0]).toMatch(/^task-test-workflow-123-\d+-\d+$/);
      expect(callArgs[1]).toBe(mockResponse);
      expect(callArgs[2]).toBe('tasks-test-workflow-123');
    });

    it('should generate unique client IDs', async () => {
      const workflowId = 'test-workflow-123';

      await controller.streamTaskUpdates(workflowId, mockResponse as Response);

      // Wait a millisecond to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 1));

      await controller.streamTaskUpdates(workflowId, mockResponse as Response);

      const calls = (mockSseService.addClient as ReturnType<typeof vi.fn>).mock
        .calls;
      expect(calls[0][0]).not.toBe(calls[1][0]);
      expect(calls[0][0]).toMatch(/^task-test-workflow-123-\d+-\d+$/);
      expect(calls[1][0]).toMatch(/^task-test-workflow-123-\d+-\d+$/);
    });

    it('should handle SSE service errors', async () => {
      const workflowId = 'test-workflow-123';
      const error = new Error('SSE service error');

      (mockSseService.addClient as ReturnType<typeof vi.fn>).mockImplementation(
        () => {
          throw error;
        }
      );

      await controller.streamTaskUpdates(workflowId, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Failed to establish SSE connection',
      });
    });

    it('should use correct topic for workflow', async () => {
      const workflowId = 'workflow-abc-456';

      await controller.streamTaskUpdates(workflowId, mockResponse as Response);

      const callArgs = (mockSseService.addClient as ReturnType<typeof vi.fn>)
        .mock.calls[0];
      expect(callArgs[2]).toBe('tasks-workflow-abc-456');
    });
  });
});
