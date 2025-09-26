import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowAgentService } from '../workflow-agent.service';
import type { SseService } from '../../../events/services/sse.service';
import type { LfsService } from '../../../content/services/lfs.service';
import { SSEEventType } from '../../../../../src/types';

describe('WorkflowAgentService', () => {
  let service: WorkflowAgentService;
  let mockSseService: Partial<SseService>;
  let mockLfsService: Partial<LfsService>;

  beforeEach(() => {
    mockSseService = {
      broadcast: vi.fn(),
    };

    mockLfsService = {
      storeContent: vi.fn(),
      retrieveContent: vi.fn(),
      getSummaryByReference: vi.fn(),
      getStats: vi.fn(),
    };

    service = new WorkflowAgentService(
      mockSseService as SseService,
      mockLfsService as LfsService,
      { workspaceRoot: '/test' },
      'test-agent-id'
    );
  });

  describe('basic functionality', () => {
    it('should create an instance', () => {
      expect(service).toBeDefined();
      expect(service.getAgentType()).toBe('workflow');
    });

    it('should return the default workflow role', () => {
      const role = service.getRole();
      expect(role).toContain('sophisticated workflow agent');
      expect(role).toContain('ReAct methodology');
    });

    it('should set chat topic', () => {
      service.setChatTopic('test-topic');
      // Chat topic is private, so we just verify the method executes without error
      expect(() => service.setChatTopic('another-topic')).not.toThrow();
    });
  });

  describe('processWorkflow', () => {
    it('should process a simple workflow', async () => {
      const workflowId = 'test-workflow-123';
      const message = 'Test message';

      const result = await service.processWorkflow(workflowId, message);

      expect(result).toBeDefined();
      expect(result.workflowId).toBe(workflowId);
      expect(result.content).toBeDefined();
      expect(typeof result.content).toBe('string');
    });

    it('should broadcast workflow status events', async () => {
      const workflowId = 'test-workflow-123';
      const message = 'Navigate to google.com and search for something';

      await service.processWorkflow(workflowId, message);

      // Verify SSE broadcasts were made
      expect(mockSseService.broadcast).toHaveBeenCalled();

      const broadcastCalls = (
        mockSseService.broadcast as ReturnType<typeof vi.fn>
      ).mock.calls;

      // Check for reasoning phase broadcast
      const reasoningCall = broadcastCalls.find(
        call => call[1]?.phase === 'reasoning'
      );
      expect(reasoningCall).toBeDefined();
      expect(reasoningCall?.[1].type).toBe(SSEEventType.WORKFLOW_STATUS);
      expect(reasoningCall?.[1].workflowId).toBe(workflowId);

      // Check for planning phase broadcast
      const planningCall = broadcastCalls.find(
        call => call[1]?.phase === 'planning'
      );
      expect(planningCall).toBeDefined();
      expect(planningCall?.[1].type).toBe(SSEEventType.WORKFLOW_STATUS);

      // Check for completion broadcast
      const completeCall = broadcastCalls.find(
        call => call[1]?.type === SSEEventType.WORKFLOW_COMPLETE
      );
      expect(completeCall).toBeDefined();
      expect(completeCall?.[1].workflowId).toBe(workflowId);
    });

    it('should handle browser navigation workflow', async () => {
      const workflowId = 'browser-workflow-123';
      const message = 'Navigate to google.com and take a screenshot';

      const result = await service.processWorkflow(workflowId, message);

      expect(result.content).toContain('completed successfully');

      // Check that appropriate workflow phases were executed
      const broadcastCalls = (
        mockSseService.broadcast as ReturnType<typeof vi.fn>
      ).mock.calls;
      const executionCalls = broadcastCalls.filter(
        call => call[1]?.phase === 'execution'
      );
      expect(executionCalls.length).toBeGreaterThan(0);
    });

    it('should handle file operation workflow', async () => {
      const workflowId = 'file-workflow-123';
      const message =
        'Read the file "test.txt" and list files in current directory';

      const result = await service.processWorkflow(workflowId, message);

      expect(result.content).toBeDefined();
      expect(result.workflowId).toBe(workflowId);
    });
  });

  describe('processMessage', () => {
    it('should process a message with generated workflow ID', async () => {
      const threadId = 'thread-123';
      const message = 'Test message for processing';

      const result = await service.processMessage(threadId, message);

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(typeof result.content).toBe('string');
    });

    it('should include images and notes in processing', async () => {
      const threadId = 'thread-456';
      const message = 'Process with attachments';
      const images = [{ url: 'image1.png', data: 'base64data' }];
      const notes = [{ content: 'Note 1' }];

      const result = await service.processMessage(
        threadId,
        message,
        images,
        notes
      );

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });

    it('should handle conversation history', async () => {
      const threadId = 'thread-789';
      const message = 'Continue conversation';
      const conversationHistory = [
        { role: 'user' as const, content: 'Previous message' },
        { role: 'assistant' as const, content: 'Previous response' },
      ];

      const result = await service.processMessage(
        threadId,
        message,
        undefined,
        undefined,
        conversationHistory
      );

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle errors in workflow processing', async () => {
      // Mock an error in the broadcast method
      (mockSseService.broadcast as ReturnType<typeof vi.fn>).mockImplementation(
        () => {
          if (
            (mockSseService.broadcast as ReturnType<typeof vi.fn>).mock.calls
              .length > 3
          ) {
            throw new Error('Broadcast error');
          }
        }
      );

      const workflowId = 'error-workflow';
      const message = 'This will cause an error';

      await expect(
        service.processWorkflow(workflowId, message)
      ).rejects.toThrow();
    });
  });
});
