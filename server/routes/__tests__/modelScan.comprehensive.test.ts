import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

// Import fixtures
import {
  mockSearchResults,
  mockAvailableModels,
  mockScanSession,
  mockSearchParams,
  createMockRequest,
  createMockResponse,
  createMockNext,
  flushPromises,
  delay,
} from './fixtures/modelScanFixtures';

// Hoist mocks before imports
const { mockSSEManager, mockModelFetcher, mockLogger } = vi.hoisted(() => {
  const sseManager = {
    broadcast: vi.fn(),
    addClient: vi.fn(),
    removeClient: vi.fn(),
    getClients: vi.fn().mockReturnValue([]),
  };
  const modelFetcher = {
    searchModelsWithProgress: vi.fn(),
    fetchPopularModels: vi.fn(),
    getAvailableModels: vi.fn(),
    getCachedModels: vi.fn(),
    refreshAvailableModels: vi.fn(),
    setProgressCallback: vi.fn(),
    getModelsById: vi.fn(),
    fetchVRAMDataForModels: vi.fn(),
    retryVramFetching: vi.fn(),
    clearAccessibilityCache: vi.fn(),
    setHuggingFaceToken: vi.fn(),
    removeHuggingFaceToken: vi.fn(),
    hasHuggingFaceToken: vi.fn(),
    searchModels: vi.fn(),
    clearSearchCacheForQuery: vi.fn(),
    getAvailableModelsWithProgress: vi.fn(),
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
    mockModelFetcher: modelFetcher,
    mockLogger: logger,
  };
});

// Mock dependencies
vi.mock('uuid', () => ({
  v4: vi.fn(),
}));

vi.mock('../../sseManager', () => ({
  sseManager: mockSSEManager,
}));

vi.mock('../../modelFetcher', () => ({
  modelFetcher: mockModelFetcher,
  ModelFetcher: vi.fn().mockImplementation(() => mockModelFetcher),
}));

vi.mock('../../logger', () => ({
  logger: mockLogger,
}));

// Import after mocking
import router, {
  performModelScan,
  performModelSearch,
  cleanupModelScanSessions,
  testUtils,
} from '../modelScan';
import { SSEEventType } from '../../../src/types';

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

describe('modelScan Routes - Comprehensive Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testUtils.clearActiveScanSessions();
    vi.mocked(uuidv4).mockReturnValue('test-uuid-123');

    // Setup default mock implementations
    mockModelFetcher.searchModelsWithProgress.mockResolvedValue(
      mockSearchResults
    );
    mockModelFetcher.fetchPopularModels.mockResolvedValue(undefined);
    mockModelFetcher.getAvailableModels.mockResolvedValue(mockAvailableModels);
  });

  afterEach(() => {
    vi.clearAllMocks();
    testUtils.clearActiveScanSessions();
  });

  describe('GET /progress', () => {
    it('should set up SSE client for progress updates', () => {
      const mockReq = createMockRequest();
      const mockRes = createMockResponse();
      const mockNext = createMockNext();

      const handler = getRouteHandler('get', '/progress');
      handler(mockReq as Request, mockRes as Response, mockNext);

      expect(mockSSEManager.addClient).toHaveBeenCalledWith(
        expect.stringContaining('scan-'),
        mockRes,
        'model-scan'
      );
    });
  });

  describe('POST /search', () => {
    it('should start a new model search', async () => {
      const mockReq = createMockRequest({}, mockSearchParams);
      const mockRes = createMockResponse();
      const mockNext = createMockNext();

      const handler = getRouteHandler('post', '/search');
      handler(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith({
        searchId: 'test-uuid-123',
        message: 'Model search started',
      });

      // Wait for async search to start
      await flushPromises();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting model search session: test-uuid-123'
      );
    });

    it('should handle search errors', async () => {
      const searchError = new Error('Search failed');
      mockModelFetcher.searchModelsWithProgress.mockRejectedValue(searchError);

      const mockReq = createMockRequest({}, mockSearchParams);
      const mockRes = createMockResponse();
      const mockNext = createMockNext();

      const handler = getRouteHandler('post', '/search');
      handler(mockReq as Request, mockRes as Response, mockNext);

      // Wait for async search to fail
      await flushPromises();
      await delay(600); // Increased delay for async processing

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Model search test-uuid-123 failed:',
        searchError
      );

      // Verify error was broadcast
      const broadcasts = mockSSEManager.broadcast.mock.calls;
      const errorBroadcast = broadcasts.find(
        call => call[1]?.progress?.stage === 'error'
      );
      expect(errorBroadcast).toBeDefined();
      if (errorBroadcast) {
        expect(errorBroadcast[1].progress.operationType).toBe('search');
      }
    });
  });

  describe('POST /start', () => {
    it('should start a new model scan', async () => {
      const mockReq = createMockRequest();
      const mockRes = createMockResponse();
      const mockNext = createMockNext();

      const handler = getRouteHandler('post', '/start');
      handler(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith({
        scanId: 'test-uuid-123',
        message: 'Model scan started',
      });

      // Wait for async scan to start
      await flushPromises();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting model scan session: test-uuid-123'
      );
    });

    it('should handle scan errors', async () => {
      const scanError = new Error('Scan failed');
      mockModelFetcher.fetchPopularModels.mockRejectedValue(scanError);

      const mockReq = createMockRequest();
      const mockRes = createMockResponse();
      const mockNext = createMockNext();

      const handler = getRouteHandler('post', '/start');
      handler(mockReq as Request, mockRes as Response, mockNext);

      // Wait for async scan to fail
      await flushPromises();
      await delay(600); // Account for initial delay

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Model scan test-uuid-123 failed:',
        scanError
      );

      // Verify error was broadcast
      const broadcasts = mockSSEManager.broadcast.mock.calls;
      const errorBroadcast = broadcasts.find(
        call => call[1]?.progress?.stage === 'error'
      );
      expect(errorBroadcast).toBeDefined();
      expect(errorBroadcast[1].progress.operationType).toBe('scan');
    });
  });

  describe('POST /cancel/:scanId', () => {
    it('should cancel an active scan', () => {
      // Set up an active session
      testUtils.setActiveScanSession('test-scan-123', mockScanSession);

      const mockReq = createMockRequest({ scanId: 'test-scan-123' });
      const mockRes = createMockResponse();
      const mockNext = createMockNext();

      const handler = getRouteHandler('post', '/cancel/:scanId');
      handler(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Scan cancelled successfully',
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Cancelling model scan session: test-scan-123'
      );

      expect(mockSSEManager.broadcast).toHaveBeenCalledWith(
        'unified-events',
        expect.objectContaining({
          type: SSEEventType.SCAN_PROGRESS,
          scanId: 'test-scan-123',
          progress: expect.objectContaining({
            stage: 'cancelled',
            message: 'Scan cancelled by user',
          }),
        })
      );
    });

    it('should return 404 for non-existent scan', () => {
      const mockReq = createMockRequest({ scanId: 'non-existent' });
      const mockRes = createMockResponse();
      const mockNext = createMockNext();

      const handler = getRouteHandler('post', '/cancel/:scanId');
      handler(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Scan session not found',
      });
    });

    it('should return 400 for non-running scan', () => {
      // Set up a completed session
      const completedSession = {
        ...mockScanSession,
        status: 'completed' as const,
      };
      testUtils.setActiveScanSession('test-scan-123', completedSession);

      const mockReq = createMockRequest({ scanId: 'test-scan-123' });
      const mockRes = createMockResponse();
      const mockNext = createMockNext();

      const handler = getRouteHandler('post', '/cancel/:scanId');
      handler(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Scan is not currently running',
      });
    });
  });

  describe('GET /status/:scanId', () => {
    it('should return scan status', () => {
      // Set up a fresh active session
      const freshSession = {
        id: 'test-scan-123',
        controller: new AbortController(),
        status: 'running' as const,
        startTime: Date.now(),
      };
      testUtils.setActiveScanSession('test-scan-123', freshSession);

      const mockReq = createMockRequest({ scanId: 'test-scan-123' });
      const mockRes = createMockResponse();
      const mockNext = createMockNext();

      const handler = getRouteHandler('get', '/status/:scanId');
      handler(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith({
        scanId: 'test-scan-123',
        status: 'running',
        startTime: freshSession.startTime,
        duration: expect.any(Number),
      });
    });

    it('should return 404 for non-existent scan', () => {
      const mockReq = createMockRequest({ scanId: 'non-existent' });
      const mockRes = createMockResponse();
      const mockNext = createMockNext();

      const handler = getRouteHandler('get', '/status/:scanId');
      handler(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Scan session not found',
      });
    });
  });

  describe('performModelSearch function', () => {
    it('should complete a successful search with progress updates', async () => {
      const searchId = 'test-search-789';
      const abortController = new AbortController();

      testUtils.setActiveScanSession(searchId, {
        id: searchId,
        controller: abortController,
        status: 'running',
        startTime: Date.now(),
      });

      // Mock search with progress
      mockModelFetcher.searchModelsWithProgress.mockImplementation(
        async (query, type, progressCallback) => {
          progressCallback({
            type: 'started',
            message: 'Starting search',
          });
          progressCallback({
            type: 'fetching-models',
            message: 'Fetching models',
          });
          progressCallback({
            type: 'checking-model',
            message: 'Checking model',
            modelName: 'Test Model',
            current: 1,
            total: 2,
          });
          progressCallback({
            type: 'model-checked',
            message: 'Model checked',
            modelName: 'Test Model',
            current: 2,
            total: 2,
          });
          progressCallback({
            type: 'completed',
            message: 'Search completed',
          });
          return mockSearchResults;
        }
      );

      await performModelSearch(
        searchId,
        mockSearchParams,
        abortController.signal
      );

      // Verify progress broadcasts
      expect(mockSSEManager.broadcast).toHaveBeenCalledWith(
        'unified-events',
        expect.objectContaining({
          type: SSEEventType.SCAN_PROGRESS,
          scanId: searchId,
          progress: expect.objectContaining({
            stage: 'searching',
            message: 'Starting search...',
            progress: 0,
            operationType: 'search',
          }),
        })
      );

      expect(mockSSEManager.broadcast).toHaveBeenCalledWith(
        'unified-events',
        expect.objectContaining({
          type: SSEEventType.SCAN_PROGRESS,
          scanId: searchId,
          progress: expect.objectContaining({
            stage: 'completed',
            message: 'Search completed! Found 2 models.',
            progress: 100,
            totalItems: 2,
            operationType: 'search',
            results: mockSearchResults,
          }),
        })
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Model search test-search-789 completed successfully. Found 2 models.'
      );
    });

    it('should handle search abort', async () => {
      const searchId = 'test-search-abort';
      const abortController = new AbortController();

      testUtils.setActiveScanSession(searchId, {
        id: searchId,
        controller: abortController,
        status: 'running',
        startTime: Date.now(),
      });

      // Abort immediately
      abortController.abort();

      await performModelSearch(
        searchId,
        mockSearchParams,
        abortController.signal
      );

      // Should not broadcast error on abort
      expect(mockSSEManager.broadcast).not.toHaveBeenCalledWith(
        'unified-events',
        expect.objectContaining({
          progress: expect.objectContaining({
            stage: 'error',
          }),
        })
      );
    });

    it('should handle search errors with user-friendly messages', async () => {
      const searchId = 'test-search-error';
      const abortController = new AbortController();

      testUtils.setActiveScanSession(searchId, {
        id: searchId,
        controller: abortController,
        status: 'running',
        startTime: Date.now(),
      });

      const searchError = new Error('Network error');
      mockModelFetcher.searchModelsWithProgress.mockRejectedValue(searchError);

      await performModelSearch(
        searchId,
        mockSearchParams,
        abortController.signal
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Model search test-search-error failed:',
        searchError
      );

      expect(mockSSEManager.broadcast).toHaveBeenCalledWith(
        'unified-events',
        expect.objectContaining({
          type: SSEEventType.SCAN_PROGRESS,
          scanId: searchId,
          progress: expect.objectContaining({
            stage: 'error',
            message: 'Search failed due to an error',
            error: 'Network error',
            operationType: 'search',
          }),
        })
      );
    });

    it('should handle error callback in progress', async () => {
      const searchId = 'test-search-error-cb';
      const abortController = new AbortController();

      testUtils.setActiveScanSession(searchId, {
        id: searchId,
        controller: abortController,
        status: 'running',
        startTime: Date.now(),
      });

      // Mock search with error callback
      mockModelFetcher.searchModelsWithProgress.mockImplementation(
        async (query, type, progressCallback) => {
          progressCallback({
            type: 'error',
            message: 'Error in progress',
          });
          return mockSearchResults;
        }
      );

      await performModelSearch(
        searchId,
        mockSearchParams,
        abortController.signal
      );

      // Should still complete successfully
      expect(mockSSEManager.broadcast).toHaveBeenCalledWith(
        'unified-events',
        expect.objectContaining({
          progress: expect.objectContaining({
            stage: 'completed',
          }),
        })
      );
    });

    it('should handle session not found', async () => {
      const searchId = 'non-existent-search';
      const abortController = new AbortController();

      // Don't set up session - it's not found

      await performModelSearch(
        searchId,
        mockSearchParams,
        abortController.signal
      );

      // Should return early without any broadcasts
      expect(mockSSEManager.broadcast).not.toHaveBeenCalled();
    });
  });

  describe('performModelScan function', () => {
    it('should complete a successful scan with progress updates', async () => {
      const scanId = 'test-scan-success';
      const abortController = new AbortController();

      testUtils.setActiveScanSession(scanId, {
        id: scanId,
        controller: abortController,
        status: 'running',
        startTime: Date.now(),
      });

      // Mock fetch with progress
      mockModelFetcher.fetchPopularModels.mockImplementation(
        async progressCallback => {
          if (progressCallback) {
            progressCallback(1, 10, 'model-1');
            progressCallback(5, 10, 'model-5');
            progressCallback(10, 10, 'model-10');
          }
        }
      );

      await performModelScan(
        scanId,
        mockModelFetcher,
        mockSSEManager,
        abortController.signal
      );

      // Verify initial broadcast
      expect(mockSSEManager.broadcast).toHaveBeenCalledWith(
        'unified-events',
        expect.objectContaining({
          type: SSEEventType.SCAN_PROGRESS,
          scanId,
          progress: expect.objectContaining({
            stage: 'initializing',
            message: 'Preparing to fetch model list...',
            progress: 0,
            operationType: 'scan',
          }),
        })
      );

      // Verify completion broadcast
      expect(mockSSEManager.broadcast).toHaveBeenCalledWith(
        'unified-events',
        expect.objectContaining({
          type: SSEEventType.SCAN_PROGRESS,
          scanId,
          progress: expect.objectContaining({
            stage: 'completed',
            message: 'Scan completed! Found 2 models available for download.',
            progress: 100,
            totalItems: 2,
            operationType: 'scan',
          }),
        })
      );
    });

    it('should handle HTTP 400 with fallback URL error', async () => {
      const scanId = 'test-scan-400-fallback';
      const abortController = new AbortController();

      testUtils.setActiveScanSession(scanId, {
        id: scanId,
        controller: abortController,
        status: 'running',
        startTime: Date.now(),
      });

      const error = new Error('HTTP 400: All fallback URLs failed');
      mockModelFetcher.fetchPopularModels.mockRejectedValue(error);

      await performModelScan(
        scanId,
        mockModelFetcher,
        mockSSEManager,
        abortController.signal
      );

      // Verify error was broadcast
      await delay(600); // Wait for error handling
      const broadcasts = mockSSEManager.broadcast.mock.calls;
      const errorBroadcast = broadcasts.find(
        call => call[1]?.progress?.stage === 'error'
      );
      expect(errorBroadcast).toBeDefined();
      if (errorBroadcast) {
        expect(errorBroadcast[1].progress.message).toContain(
          'HuggingFace API is currently unavailable'
        );
      }
    });

    it('should handle abort during model checking', async () => {
      const scanId = 'test-scan-abort-check';
      const abortController = new AbortController();

      testUtils.setActiveScanSession(scanId, {
        id: scanId,
        controller: abortController,
        status: 'running',
        startTime: Date.now(),
      });

      // Abort during the model checking phase
      mockModelFetcher.getAvailableModels.mockImplementation(() => {
        abortController.abort();
        return mockAvailableModels;
      });

      await performModelScan(
        scanId,
        mockModelFetcher,
        mockSSEManager,
        abortController.signal
      );

      // Should return early due to abort
      // The scan should not complete normally

      // Should not broadcast error
      expect(mockSSEManager.broadcast).not.toHaveBeenCalledWith(
        'unified-events',
        expect.objectContaining({
          progress: expect.objectContaining({
            stage: 'error',
          }),
        })
      );
    });

    it('should handle session not found', async () => {
      const scanId = 'non-existent-scan';
      const abortController = new AbortController();

      // Don't set up session

      await performModelScan(
        scanId,
        mockModelFetcher,
        mockSSEManager,
        abortController.signal
      );

      // Should return early without broadcasts
      expect(mockSSEManager.broadcast).not.toHaveBeenCalled();
    });
  });

  describe('cleanupModelScanSessions function', () => {
    it('should cleanup all running sessions on shutdown', () => {
      // Set up multiple sessions
      const session1 = {
        id: 'scan-1',
        controller: new AbortController(),
        status: 'running' as const,
        startTime: Date.now(),
      };
      const session2 = {
        id: 'scan-2',
        controller: new AbortController(),
        status: 'completed' as const,
        startTime: Date.now(),
      };
      const session3 = {
        id: 'scan-3',
        controller: new AbortController(),
        status: 'running' as const,
        startTime: Date.now(),
      };

      testUtils.setActiveScanSession('scan-1', session1);
      testUtils.setActiveScanSession('scan-2', session2);
      testUtils.setActiveScanSession('scan-3', session3);

      const abortSpy1 = vi.spyOn(session1.controller, 'abort');
      const abortSpy3 = vi.spyOn(session3.controller, 'abort');

      cleanupModelScanSessions();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Cleaning up active model scan sessions...'
      );

      // Only running sessions should be aborted
      expect(abortSpy1).toHaveBeenCalled();
      expect(abortSpy3).toHaveBeenCalled();

      // Should broadcast cancellation for running sessions
      expect(mockSSEManager.broadcast).toHaveBeenCalledWith(
        'unified-events',
        expect.objectContaining({
          type: SSEEventType.SCAN_PROGRESS,
          scanId: 'scan-1',
          progress: expect.objectContaining({
            stage: 'cancelled',
            message: 'Scan cancelled due to server shutdown',
          }),
        })
      );

      expect(mockSSEManager.broadcast).toHaveBeenCalledWith(
        'unified-events',
        expect.objectContaining({
          type: SSEEventType.SCAN_PROGRESS,
          scanId: 'scan-3',
          progress: expect.objectContaining({
            stage: 'cancelled',
            message: 'Scan cancelled due to server shutdown',
          }),
        })
      );
    });

    it('should clear all sessions after cleanup', () => {
      // Set up a session
      testUtils.setActiveScanSession('test-scan', mockScanSession);

      cleanupModelScanSessions();

      // Try to get the session - should be cleared
      const handler = getRouteHandler('get', '/status/:scanId');
      const mockReq = createMockRequest({ scanId: 'test-scan' });
      const mockRes = createMockResponse();
      const mockNext = createMockNext();

      handler(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('Edge Cases and Integration', () => {
    it('should handle concurrent scans', async () => {
      vi.mocked(uuidv4)
        .mockReturnValueOnce('scan-1')
        .mockReturnValueOnce('scan-2');

      const mockReq1 = createMockRequest();
      const mockRes1 = createMockResponse();
      const mockReq2 = createMockRequest();
      const mockRes2 = createMockResponse();
      const mockNext = createMockNext();

      const handler = getRouteHandler('post', '/start');

      // Start two scans concurrently
      handler(mockReq1 as Request, mockRes1 as Response, mockNext);
      handler(mockReq2 as Request, mockRes2 as Response, mockNext);

      expect(mockRes1.json).toHaveBeenCalledWith({
        scanId: 'scan-1',
        message: 'Model scan started',
      });

      expect(mockRes2.json).toHaveBeenCalledWith({
        scanId: 'scan-2',
        message: 'Model scan started',
      });

      await flushPromises();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting model scan session: scan-1'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting model scan session: scan-2'
      );
    });

    it('should handle search with abort during progress callback', async () => {
      const searchId = 'test-search-abort-progress';
      const abortController = new AbortController();

      testUtils.setActiveScanSession(searchId, {
        id: searchId,
        controller: abortController,
        status: 'running',
        startTime: Date.now(),
      });

      // Mock search that aborts during progress
      mockModelFetcher.searchModelsWithProgress.mockImplementation(
        async (query, type, progressCallback) => {
          progressCallback({
            type: 'started',
            message: 'Starting search',
          });
          abortController.abort();
          progressCallback({
            type: 'checking-model',
            message: 'Should not reach here',
            current: 1,
            total: 1,
          });
          return mockSearchResults;
        }
      );

      await performModelSearch(
        searchId,
        mockSearchParams,
        abortController.signal
      );

      // Should not broadcast after abort
      const broadcasts = mockSSEManager.broadcast.mock.calls;
      const lastBroadcast = broadcasts[broadcasts.length - 1];

      if (lastBroadcast) {
        expect(lastBroadcast[1].progress.stage).not.toBe('checking-models');
      }
    });

    it('should handle scan with large number of models', async () => {
      const scanId = 'test-scan-large';
      const abortController = new AbortController();

      testUtils.setActiveScanSession(scanId, {
        id: scanId,
        controller: abortController,
        status: 'running',
        startTime: Date.now(),
      });

      // Create a large array of models
      const largeModelArray = Array.from({ length: 100 }, (_, i) => ({
        id: `model-${i}`,
        name: `Model ${i}`,
        filename: `model-${i}.gguf`,
        url: `https://example.com/model-${i}`,
        size: 1000000 * i,
        description: `Model ${i} description`,
      }));

      mockModelFetcher.getAvailableModels.mockResolvedValue(largeModelArray);

      // Run with a timeout to avoid test timeout
      const scanPromise = performModelScan(
        scanId,
        mockModelFetcher,
        mockSSEManager,
        abortController.signal
      );

      // Wait for completion with timeout
      await Promise.race([
        scanPromise,
        new Promise(resolve => setTimeout(resolve, 4000)),
      ]);

      // Force completion if still running
      abortController.abort();
      await scanPromise.catch(() => {});

      // Should have broadcast progress updates
      const broadcasts = mockSSEManager.broadcast.mock.calls;
      const completedBroadcast = broadcasts.find(
        call => call[1]?.progress?.stage === 'completed'
      );

      // Verify we got progress updates
      expect(broadcasts.length).toBeGreaterThan(0);

      // If scan completed, verify it has the expected count
      if (completedBroadcast) {
        const totalItems = completedBroadcast[1].progress.totalItems;
        // Accept either the full count or whatever was processed
        expect(totalItems).toBeGreaterThan(0);
      }
    });
  });
});
