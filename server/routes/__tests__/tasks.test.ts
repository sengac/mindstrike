import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';

// Import fixtures
import {
  mockTaskUpdate,
  mockWorkflowId,
  createMockRequest,
  createMockResponse,
} from './fixtures/tasksFixtures';

// Hoist mocks before imports
const { mockSSEManager, mockLogger } = vi.hoisted(() => {
  const sseManager = {
    broadcast: vi.fn(),
    addClient: vi.fn(),
    removeClient: vi.fn(),
    getClients: vi.fn().mockReturnValue([]),
  };
  const logger = {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
  };
  return {
    mockSSEManager: sseManager,
    mockLogger: logger,
  };
});

// Mock dependencies
vi.mock('../../sseManager', () => ({
  sseManager: mockSSEManager,
}));

vi.mock('../../logger', () => ({
  logger: mockLogger,
}));

// Import after mocking
import router, { broadcastTaskUpdate } from '../tasks';

// Helper to get route handler
const getRouteHandler = (method: string, path: string) => {
  const layer = router.stack.find(
    (layer: { route?: { path: string; methods: Record<string, boolean> } }) =>
      layer.route?.path === path && layer.route?.methods[method]
  );
  if (!layer) {
    throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  }
  return layer.route.stack[0].handle;
};

describe('tasks Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /stream/:workflowId', () => {
    it('should add SSE client successfully', () => {
      const mockReq = createMockRequest({ workflowId: mockWorkflowId });
      const mockRes = createMockResponse();

      const handler = getRouteHandler('get', '/stream/:workflowId');
      handler(mockReq as Request, mockRes as Response);

      // Verify logger was called with correct info
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Task SSE client connected',
        expect.objectContaining({
          clientId: expect.stringContaining(`task-${mockWorkflowId}-`),
          workflowId: mockWorkflowId,
          topic: `tasks-${mockWorkflowId}`,
        })
      );

      // Verify SSE manager added the client
      expect(mockSSEManager.addClient).toHaveBeenCalledWith(
        expect.stringContaining(`task-${mockWorkflowId}-`),
        mockRes,
        `tasks-${mockWorkflowId}`
      );
    });

    it('should handle errors when adding SSE client fails', () => {
      const mockReq = createMockRequest({ workflowId: mockWorkflowId });
      const mockRes = createMockResponse();

      const error = new Error('SSE connection failed');
      mockSSEManager.addClient.mockImplementation(() => {
        throw error;
      });

      const handler = getRouteHandler('get', '/stream/:workflowId');
      handler(mockReq as Request, mockRes as Response);

      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to add task SSE client:',
        error
      );

      // Verify error response was sent
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to establish SSE connection',
      });
    });

    it('should generate unique client IDs', async () => {
      const mockReq = createMockRequest({ workflowId: mockWorkflowId });
      const mockRes1 = createMockResponse();
      const mockRes2 = createMockResponse();

      const handler = getRouteHandler('get', '/stream/:workflowId');

      // First call
      handler(mockReq as Request, mockRes1 as Response);
      const firstCall = mockSSEManager.addClient.mock.calls[0];
      const firstClientId = firstCall[0];

      // Wait a tiny bit to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 1));

      // Second call
      handler(mockReq as Request, mockRes2 as Response);
      const secondCall = mockSSEManager.addClient.mock.calls[1];
      const secondClientId = secondCall[0];

      // Client IDs should be different (they include timestamp and random string)
      expect(firstClientId).not.toBe(secondClientId);
      expect(firstClientId).toContain(`task-${mockWorkflowId}-`);
      expect(secondClientId).toContain(`task-${mockWorkflowId}-`);
    });

    it('should create correct topic for different workflow IDs', () => {
      const workflows = ['workflow-1', 'workflow-2', 'workflow-3'];

      workflows.forEach(workflowId => {
        vi.clearAllMocks();

        const mockReq = createMockRequest({ workflowId });
        const mockRes = createMockResponse();

        const handler = getRouteHandler('get', '/stream/:workflowId');
        handler(mockReq as Request, mockRes as Response);

        expect(mockSSEManager.addClient).toHaveBeenCalledWith(
          expect.any(String),
          mockRes,
          `tasks-${workflowId}`
        );
      });
    });
  });

  describe('broadcastTaskUpdate function', () => {
    it('should broadcast task update with correct data', () => {
      const workflowId = 'test-workflow-456';
      const data = mockTaskUpdate;

      broadcastTaskUpdate(workflowId, data);

      expect(mockSSEManager.broadcast).toHaveBeenCalledWith(
        'unified-events',
        expect.objectContaining({
          ...data,
          workflowId,
          timestamp: expect.any(Number),
        })
      );
    });

    it('should include timestamp in broadcast', () => {
      const workflowId = 'test-workflow-789';
      const data = { status: 'completed' };

      const beforeTime = Date.now();
      broadcastTaskUpdate(workflowId, data);
      const afterTime = Date.now();

      const broadcastCall = mockSSEManager.broadcast.mock.calls[0];
      const broadcastData = broadcastCall[1];

      expect(broadcastData.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(broadcastData.timestamp).toBeLessThanOrEqual(afterTime);
    });

    it('should handle empty data object', () => {
      const workflowId = 'test-workflow-empty';
      const data = {};

      broadcastTaskUpdate(workflowId, data);

      expect(mockSSEManager.broadcast).toHaveBeenCalledWith(
        'unified-events',
        expect.objectContaining({
          workflowId,
          timestamp: expect.any(Number),
        })
      );
    });

    it('should preserve all data properties', () => {
      const workflowId = 'test-workflow-complex';
      const complexData = {
        type: 'progress',
        status: 'running',
        progress: 75,
        message: 'Processing step 3 of 4',
        details: {
          currentStep: 3,
          totalSteps: 4,
          stepName: 'Validation',
        },
        metadata: {
          startTime: Date.now(),
          estimatedCompletion: Date.now() + 5000,
        },
      };

      broadcastTaskUpdate(workflowId, complexData);

      expect(mockSSEManager.broadcast).toHaveBeenCalledWith(
        'unified-events',
        expect.objectContaining({
          ...complexData,
          workflowId,
          timestamp: expect.any(Number),
        })
      );
    });

    it('should handle multiple rapid broadcasts', () => {
      const workflowId = 'test-workflow-rapid';

      for (let i = 0; i < 10; i++) {
        broadcastTaskUpdate(workflowId, {
          progress: i * 10,
          message: `Step ${i}`,
        });
      }

      expect(mockSSEManager.broadcast).toHaveBeenCalledTimes(10);

      // Verify each broadcast has unique data
      mockSSEManager.broadcast.mock.calls.forEach((call, index) => {
        expect(call[1]).toMatchObject({
          progress: index * 10,
          message: `Step ${index}`,
          workflowId,
        });
      });
    });
  });

  describe('Edge Cases and Integration', () => {
    it('should handle special characters in workflow ID', () => {
      const specialWorkflowId = 'workflow-!@#$%^&*()_+-=[]{}|;:,.<>?';
      const mockReq = createMockRequest({ workflowId: specialWorkflowId });
      const mockRes = createMockResponse();

      const handler = getRouteHandler('get', '/stream/:workflowId');
      handler(mockReq as Request, mockRes as Response);

      expect(mockSSEManager.addClient).toHaveBeenCalledWith(
        expect.stringContaining(`task-${specialWorkflowId}-`),
        mockRes,
        `tasks-${specialWorkflowId}`
      );
    });

    it('should handle undefined workflow ID gracefully', () => {
      const mockReq = createMockRequest({ workflowId: undefined });
      const mockRes = createMockResponse();

      const handler = getRouteHandler('get', '/stream/:workflowId');
      handler(mockReq as Request, mockRes as Response);

      expect(mockSSEManager.addClient).toHaveBeenCalledWith(
        expect.stringContaining('task-undefined-'),
        mockRes,
        'tasks-undefined'
      );
    });

    it('should handle concurrent SSE connections for same workflow', () => {
      vi.clearAllMocks(); // Clear previous test calls
      const mockReq = createMockRequest({ workflowId: mockWorkflowId });
      const responses = Array.from({ length: 5 }, () => createMockResponse());

      const handler = getRouteHandler('get', '/stream/:workflowId');

      // Add slight delay to ensure unique timestamps
      responses.forEach((mockRes, index) => {
        // Mock Date.now to return different values
        const originalDateNow = Date.now;
        Date.now = vi.fn().mockReturnValue(1000000000000 + index);
        handler(mockReq as Request, mockRes as Response);
        Date.now = originalDateNow;
      });

      expect(mockSSEManager.addClient).toHaveBeenCalledTimes(5);

      // All should have same topic but different client IDs
      const calls = mockSSEManager.addClient.mock.calls;
      const clientIds = calls.map(call => call[0]);
      const topics = calls.map(call => call[2]);

      // All topics should be the same
      expect(new Set(topics).size).toBe(1);
      expect(topics[0]).toBe(`tasks-${mockWorkflowId}`);

      // All client IDs should be unique
      expect(new Set(clientIds).size).toBe(5);
    });

    it('should handle SSE manager throwing different error types', () => {
      const mockReq = createMockRequest({ workflowId: mockWorkflowId });
      const mockRes = createMockResponse();

      // Test with string error
      mockSSEManager.addClient.mockImplementation(() => {
        throw 'String error';
      });

      const handler = getRouteHandler('get', '/stream/:workflowId');
      handler(mockReq as Request, mockRes as Response);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to add task SSE client:',
        'String error'
      );
      expect(mockRes.status).toHaveBeenCalledWith(500);

      // Reset and test with object error
      vi.clearAllMocks();
      mockSSEManager.addClient.mockImplementation(() => {
        throw { code: 'ERR_001', message: 'Object error' };
      });

      handler(mockReq as Request, mockRes as Response);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to add task SSE client:',
        { code: 'ERR_001', message: 'Object error' }
      );
      expect(mockRes.status).toHaveBeenCalledWith(500);
    });

    it('should export router as default', () => {
      expect(router).toBeDefined();
      expect(router.stack).toBeDefined();
      expect(router.stack.length).toBeGreaterThan(0);
    });

    it('should export broadcastTaskUpdate as named export', () => {
      expect(broadcastTaskUpdate).toBeDefined();
      expect(typeof broadcastTaskUpdate).toBe('function');
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle high frequency broadcasts', () => {
      vi.clearAllMocks(); // Clear previous test calls
      const workflowId = 'perf-test';
      const iterations = 100;

      const start = Date.now();
      for (let i = 0; i < iterations; i++) {
        broadcastTaskUpdate(workflowId, { iteration: i });
      }
      const duration = Date.now() - start;

      expect(mockSSEManager.broadcast).toHaveBeenCalledTimes(iterations);
      // Should complete within reasonable time (< 100ms for 100 broadcasts)
      expect(duration).toBeLessThan(100);
    });

    it('should handle large data payloads', () => {
      const workflowId = 'large-payload-test';
      const largeData = {
        results: Array.from({ length: 1000 }, (_, i) => ({
          id: `item-${i}`,
          value: Math.random(),
          metadata: {
            timestamp: Date.now(),
            processed: true,
            details: `Details for item ${i}`,
          },
        })),
        summary: {
          total: 1000,
          processed: 1000,
          failed: 0,
        },
      };

      broadcastTaskUpdate(workflowId, largeData);

      const broadcastCall = mockSSEManager.broadcast.mock.calls[0];
      expect(broadcastCall[1].results).toHaveLength(1000);
      expect(broadcastCall[1].workflowId).toBe(workflowId);
    });
  });
});
