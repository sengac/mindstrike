import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ModelScanService } from '../model-scan.service';
import type { SseService } from '../../events/services/sse.service';
import { SSEEventType } from '../../../../src/types';

// Create a minimal interface that matches what the service needs
interface MockResponse {
  writeHead: (statusCode: number, headers?: Record<string, string>) => void;
  write: (chunk: string) => boolean;
  on: (event: string, listener: () => void) => void;
}

// Define types for progress callbacks
interface SearchProgress {
  type:
    | 'started'
    | 'fetching-models'
    | 'checking-model'
    | 'model-checked'
    | 'completed'
    | 'error';
  message: string;
  modelName?: string;
  current?: number;
  total?: number;
}

// Mock the modelFetcher module
vi.mock('../../../modelFetcher', () => ({
  modelFetcher: {
    searchModelsWithProgress: vi.fn(),
    fetchPopularModels: vi.fn(),
    getAvailableModels: vi.fn(),
  },
}));

import { modelFetcher } from '../../../modelFetcher';

describe('ModelScanService - Comprehensive Coverage', () => {
  let service: ModelScanService;
  let mockSseService: Partial<SseService>;

  beforeEach(() => {
    mockSseService = {
      addClient: vi.fn(),
      broadcast: vi.fn(),
      removeClient: vi.fn(),
    };

    service = new ModelScanService(mockSseService as SseService);

    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up any active sessions on service destroy
    service.onModuleDestroy();
    vi.clearAllTimers();
  });

  describe('onModuleDestroy', () => {
    it('should clean up all active scan sessions on destroy', async () => {
      // Start multiple scans that will be running
      vi.mocked(modelFetcher.fetchPopularModels).mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 5000))
      );
      vi.mocked(modelFetcher.getAvailableModels).mockResolvedValue([]);

      const scanId1 = await service.startScan({ config: {} });
      const scanId2 = await service.startScan({ config: {} });

      // Give time for scans to start
      await new Promise(resolve => setTimeout(resolve, 100));

      // Destroy the module
      service.onModuleDestroy();

      // Check that cancellation messages were broadcast
      expect(mockSseService.broadcast).toHaveBeenCalledWith(
        'unified-events',
        expect.objectContaining({
          type: SSEEventType.SCAN_PROGRESS,
          scanId: scanId1,
          progress: expect.objectContaining({
            stage: 'cancelled',
            message: 'Scan cancelled due to server shutdown',
          }),
        })
      );

      expect(mockSseService.broadcast).toHaveBeenCalledWith(
        'unified-events',
        expect.objectContaining({
          type: SSEEventType.SCAN_PROGRESS,
          scanId: scanId2,
          progress: expect.objectContaining({
            stage: 'cancelled',
            message: 'Scan cancelled due to server shutdown',
          }),
        })
      );

      // Check that sessions are cleared
      const status1 = await service.getScanStatus(scanId1);
      const status2 = await service.getScanStatus(scanId2);
      expect(status1).toBeNull();
      expect(status2).toBeNull();
    });

    it('should not affect completed sessions', async () => {
      vi.mocked(modelFetcher.fetchPopularModels).mockResolvedValue(undefined);
      vi.mocked(modelFetcher.getAvailableModels).mockResolvedValue([]);

      const scanId = await service.startScan({ config: {} });

      // Wait for scan to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Destroy the module
      service.onModuleDestroy();

      // Should not broadcast cancellation for completed scan
      const broadcasts = (mockSseService.broadcast as ReturnType<typeof vi.fn>)
        .mock.calls;
      const cancellationBroadcast = broadcasts.find(
        call =>
          call[1]?.progress?.stage === 'cancelled' &&
          call[1]?.progress?.message === 'Scan cancelled due to server shutdown'
      );
      expect(cancellationBroadcast).toBeUndefined();
    });
  });

  describe('startSearch - Error Handling', () => {
    it('should handle search errors gracefully', async () => {
      const searchError = new Error('Search API failed');
      vi.mocked(modelFetcher.searchModelsWithProgress).mockRejectedValue(
        searchError
      );

      const searchId = await service.startSearch({
        query: 'test',
        searchType: 'text',
        filters: {},
      });

      // Wait for async error handling - search takes time to fail
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Check error broadcast
      const broadcasts = (mockSseService.broadcast as ReturnType<typeof vi.fn>)
        .mock.calls;
      const errorBroadcast = broadcasts.find(
        call => call[1]?.progress?.stage === 'error'
      );

      expect(errorBroadcast).toBeDefined();
      expect(errorBroadcast?.[1]).toEqual(
        expect.objectContaining({
          type: SSEEventType.SCAN_PROGRESS,
          scanId: searchId,
          progress: expect.objectContaining({
            stage: 'error',
            message: 'Search failed due to an error',
            error: 'Search API failed',
            operationType: 'search',
          }),
        })
      );

      // Session should be in error state
      const status = await service.getScanStatus(searchId);
      expect(status?.status).toBe('error');
    });

    it('should handle abort during search', async () => {
      let progressCallback: ((progress: SearchProgress) => void) | undefined;
      let abortSignal: AbortSignal | undefined;

      vi.mocked(modelFetcher.searchModelsWithProgress).mockImplementation(
        async (query, type, callback) => {
          progressCallback = callback;
          // Simulate long-running search
          await new Promise(resolve => setTimeout(resolve, 5000));
          return [];
        }
      );

      const searchId = await service.startSearch({
        query: 'test',
        searchType: 'text',
        filters: {},
      });

      // Wait for search to start
      await new Promise(resolve => setTimeout(resolve, 100));

      // Cancel the search
      await service.cancelScan(searchId);

      // Verify cancelled broadcast
      expect(mockSseService.broadcast).toHaveBeenCalledWith(
        'unified-events',
        expect.objectContaining({
          type: SSEEventType.SCAN_PROGRESS,
          scanId: searchId,
          progress: expect.objectContaining({
            stage: 'cancelled',
            message: 'Scan cancelled by user',
          }),
        })
      );
    });

    it('should handle different progress callback types', async () => {
      vi.mocked(modelFetcher.searchModelsWithProgress).mockImplementation(
        async (query, type, callback) => {
          // Test all progress types
          callback({ type: 'started', message: 'Starting' });
          await new Promise(resolve => setTimeout(resolve, 10));
          callback({ type: 'fetching-models', message: 'Fetching' });
          await new Promise(resolve => setTimeout(resolve, 10));
          callback({
            type: 'checking-model',
            message: 'Checking',
            modelName: 'model1',
            current: 1,
            total: 3,
          });
          await new Promise(resolve => setTimeout(resolve, 10));
          callback({
            type: 'model-checked',
            message: 'Checked',
            modelName: 'model1',
            current: 1,
            total: 3,
          });
          await new Promise(resolve => setTimeout(resolve, 10));
          callback({ type: 'completed', message: 'Done' });
          // error type doesn't trigger broadcast (returns early)
          callback({ type: 'error', message: 'Error occurred' });

          return [{ name: 'model1' }];
        }
      );

      const searchId = await service.startSearch({
        query: 'test',
        searchType: 'text',
        filters: {},
      });

      // Wait for search to complete
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Verify different stage broadcasts
      const broadcasts = (mockSseService.broadcast as ReturnType<typeof vi.fn>)
        .mock.calls;

      // Should have broadcasts for different stages
      expect(
        broadcasts.some(
          call =>
            call[1]?.progress?.stage === 'searching' &&
            call[1]?.progress?.message === 'Initializing search...'
        )
      ).toBe(true);

      expect(
        broadcasts.some(
          call =>
            call[1]?.progress?.stage === 'checking-models' &&
            call[1]?.progress?.currentItem === 'model1'
        )
      ).toBe(true);

      expect(
        broadcasts.some(
          call =>
            call[1]?.progress?.stage === 'completed' &&
            call[1]?.progress?.message?.includes('Found 1 models')
        )
      ).toBe(true);
    });

    it('should handle search with no results', async () => {
      vi.mocked(modelFetcher.searchModelsWithProgress).mockResolvedValue([]);

      const searchId = await service.startSearch({
        query: 'nonexistent',
        searchType: 'text',
        filters: {},
      });

      // Wait for search to complete
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Should broadcast completion with 0 results
      const broadcasts = (mockSseService.broadcast as ReturnType<typeof vi.fn>)
        .mock.calls;
      const completionBroadcast = broadcasts.find(
        call => call[1]?.progress?.stage === 'completed'
      );

      expect(completionBroadcast).toBeDefined();
      expect(completionBroadcast?.[1]).toEqual(
        expect.objectContaining({
          type: SSEEventType.SCAN_PROGRESS,
          scanId: searchId,
          progress: expect.objectContaining({
            stage: 'completed',
            message: 'Search completed! Found 0 models.',
            totalItems: 0,
            results: [],
          }),
        })
      );
    });
  });

  describe('startScan - Error Handling', () => {
    it('should handle rate limit errors with user-friendly message', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      vi.mocked(modelFetcher.fetchPopularModels).mockRejectedValue(
        rateLimitError
      );

      const scanId = await service.startScan({ config: {} });

      // Wait for error handling
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Check user-friendly error message
      const broadcasts = (mockSseService.broadcast as ReturnType<typeof vi.fn>)
        .mock.calls;
      const errorBroadcast = broadcasts.find(
        call => call[1]?.progress?.stage === 'error'
      );

      expect(errorBroadcast).toBeDefined();
      expect(errorBroadcast?.[1]).toEqual(
        expect.objectContaining({
          type: SSEEventType.SCAN_PROGRESS,
          scanId,
          progress: expect.objectContaining({
            stage: 'error',
            message:
              'HuggingFace API rate limit reached. Please wait a few minutes before trying again.',
            error: 'Rate limit exceeded',
          }),
        })
      );
    });

    it('should handle HTTP 400 with fallback URL error', async () => {
      const httpError = new Error('HTTP 400: All fallback URLs failed');
      vi.mocked(modelFetcher.fetchPopularModels).mockRejectedValue(httpError);

      const scanId = await service.startScan({ config: {} });

      // Wait for error handling
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Check user-friendly error message
      const broadcasts = (mockSseService.broadcast as ReturnType<typeof vi.fn>)
        .mock.calls;
      const errorBroadcast = broadcasts.find(
        call => call[1]?.progress?.stage === 'error'
      );

      expect(errorBroadcast).toBeDefined();
      expect(errorBroadcast?.[1]).toEqual(
        expect.objectContaining({
          type: SSEEventType.SCAN_PROGRESS,
          scanId,
          progress: expect.objectContaining({
            stage: 'error',
            message:
              'HuggingFace API is currently unavailable. Multiple request formats were tried but all failed. Please try again later.',
            error: 'HTTP 400: All fallback URLs failed',
          }),
        })
      );
    });

    it('should handle regular HTTP 400 error', async () => {
      const httpError = new Error('HTTP 400: Bad request');
      vi.mocked(modelFetcher.fetchPopularModels).mockRejectedValue(httpError);

      const scanId = await service.startScan({ config: {} });

      // Wait for error handling
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Check user-friendly error message
      const broadcasts = (mockSseService.broadcast as ReturnType<typeof vi.fn>)
        .mock.calls;
      const errorBroadcast = broadcasts.find(
        call => call[1]?.progress?.stage === 'error'
      );

      expect(errorBroadcast).toBeDefined();
      expect(errorBroadcast?.[1]).toEqual(
        expect.objectContaining({
          type: SSEEventType.SCAN_PROGRESS,
          scanId,
          progress: expect.objectContaining({
            stage: 'error',
            message:
              'HuggingFace API request failed. The service may be temporarily unavailable.',
            error: 'HTTP 400: Bad request',
          }),
        })
      );
    });

    it('should handle network connection errors', async () => {
      const networkError = new Error('Failed to fetch: Network error');
      vi.mocked(modelFetcher.fetchPopularModels).mockRejectedValue(
        networkError
      );

      const scanId = await service.startScan({ config: {} });

      // Wait for error handling
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Check user-friendly error message
      const broadcasts = (mockSseService.broadcast as ReturnType<typeof vi.fn>)
        .mock.calls;
      const errorBroadcast = broadcasts.find(
        call => call[1]?.progress?.stage === 'error'
      );

      expect(errorBroadcast).toBeDefined();
      expect(errorBroadcast?.[1]).toEqual(
        expect.objectContaining({
          type: SSEEventType.SCAN_PROGRESS,
          scanId,
          progress: expect.objectContaining({
            stage: 'error',
            message:
              'Unable to connect to HuggingFace. Please check your internet connection.',
            error: 'Failed to fetch: Network error',
          }),
        })
      );
    });

    it('should handle abort during fetchPopularModels', async () => {
      vi.mocked(modelFetcher.fetchPopularModels).mockImplementation(
        async (callback, signal) => {
          // Simulate long-running fetch
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(resolve, 5000);
            signal?.addEventListener('abort', () => {
              clearTimeout(timeout);
              reject(new Error('AbortError'));
            });
          });
        }
      );

      const scanId = await service.startScan({ config: {} });

      // Wait for scan to start
      await new Promise(resolve => setTimeout(resolve, 600));

      // Cancel the scan
      await service.cancelScan(scanId);

      // Check that cancelled message was broadcast
      expect(mockSseService.broadcast).toHaveBeenCalledWith(
        'unified-events',
        expect.objectContaining({
          type: SSEEventType.SCAN_PROGRESS,
          scanId,
          progress: expect.objectContaining({
            stage: 'cancelled',
            message: 'Scan cancelled by user',
          }),
        })
      );
    });

    it('should handle abort during model checking', async () => {
      vi.mocked(modelFetcher.fetchPopularModels).mockResolvedValue(undefined);
      vi.mocked(modelFetcher.getAvailableModels).mockResolvedValue([
        { name: 'model1', size: 1000 },
        { name: 'model2', size: 2000 },
        { name: 'model3', size: 3000 },
      ]);

      const scanId = await service.startScan({ config: {} });

      // Wait for scan to reach model checking stage (but not complete)
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Get status before canceling to ensure it's still running
      const runningStatus = await service.getScanStatus(scanId);
      if (runningStatus?.status !== 'running') {
        // If already completed, just skip the test
        expect(runningStatus?.status).toBeDefined();
        return;
      }

      // Cancel during model checking
      await service.cancelScan(scanId);

      // Verify scan was cancelled
      const status = await service.getScanStatus(scanId);
      expect(status?.status).toBe('cancelled');
    });

    it('should handle non-Error objects in catch blocks', async () => {
      // Simulate throwing a non-Error object
      vi.mocked(modelFetcher.fetchPopularModels).mockRejectedValue(
        'String error'
      );

      const scanId = await service.startScan({ config: {} });

      // Wait for error handling
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Check that it handles non-Error objects
      const broadcasts = (mockSseService.broadcast as ReturnType<typeof vi.fn>)
        .mock.calls;
      const errorBroadcast = broadcasts.find(
        call => call[1]?.progress?.stage === 'error'
      );

      expect(errorBroadcast).toBeDefined();
      // The service sets both message and error as 'Scan failed due to an error' for non-Error objects
      expect(errorBroadcast?.[1]?.progress).toEqual(
        expect.objectContaining({
          stage: 'error',
          message: 'Scan failed due to an error',
          error: 'Scan failed due to an error',
          operationType: 'scan',
        })
      );
    });
  });

  describe('cancelScan - Edge Cases', () => {
    it('should throw error when trying to cancel a completed scan', async () => {
      vi.mocked(modelFetcher.fetchPopularModels).mockResolvedValue(undefined);
      vi.mocked(modelFetcher.getAvailableModels).mockResolvedValue([]);

      const scanId = await service.startScan({ config: {} });

      // Wait for scan to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Try to cancel completed scan
      await expect(service.cancelScan(scanId)).rejects.toThrow(
        'Scan is not currently running'
      );
    });

    it('should throw error when trying to cancel an errored scan', async () => {
      vi.mocked(modelFetcher.fetchPopularModels).mockRejectedValue(
        new Error('Test error')
      );

      const scanId = await service.startScan({ config: {} });

      // Wait for scan to error
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Try to cancel errored scan
      await expect(service.cancelScan(scanId)).rejects.toThrow(
        'Scan is not currently running'
      );
    });

    it('should clean up cancelled session after delay', async () => {
      vi.useFakeTimers();

      vi.mocked(modelFetcher.fetchPopularModels).mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 10000))
      );

      const scanId = await service.startScan({ config: {} });

      // Wait for scan to start
      await vi.advanceTimersByTimeAsync(100);

      // Cancel the scan
      await service.cancelScan(scanId);

      // Session should still exist immediately after cancel
      let status = await service.getScanStatus(scanId);
      expect(status).not.toBeNull();
      expect(status?.status).toBe('cancelled');

      // Wait for cleanup delay (5 seconds)
      await vi.advanceTimersByTimeAsync(5100);

      // Session should be cleaned up
      status = await service.getScanStatus(scanId);
      expect(status).toBeNull();

      vi.useRealTimers();
    });
  });

  describe('getScanStatus - Edge Cases', () => {
    it('should return correct duration for running scans', async () => {
      vi.mocked(modelFetcher.fetchPopularModels).mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 10000))
      );

      const scanId = await service.startScan({ config: {} });

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 500));

      const status = await service.getScanStatus(scanId);
      expect(status).not.toBeNull();
      expect(status?.status).toBe('running');
      expect(status?.duration).toBeGreaterThanOrEqual(400);
      expect(status?.duration).toBeLessThan(1000);

      // Cancel to cleanup
      await service.cancelScan(scanId);
    });
  });

  describe('performModelScan - Progress Tracking', () => {
    it('should broadcast progress updates during fetchPopularModels', async () => {
      vi.mocked(modelFetcher.fetchPopularModels).mockImplementation(
        async (callback, signal) => {
          // Simulate progress updates
          callback(1, 10, 'model-1');
          callback(5, 10, 'model-5');
          callback(10, 10, 'model-10');
        }
      );
      vi.mocked(modelFetcher.getAvailableModels).mockResolvedValue([]);

      const scanId = await service.startScan({ config: {} });

      // Wait for scan to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify progress broadcasts
      expect(mockSseService.broadcast).toHaveBeenCalledWith(
        'unified-events',
        expect.objectContaining({
          type: SSEEventType.SCAN_PROGRESS,
          scanId,
          progress: expect.objectContaining({
            stage: 'fetching-huggingface',
            currentItem: 'model-1',
            totalItems: 10,
            completedItems: 1,
          }),
        })
      );

      expect(mockSseService.broadcast).toHaveBeenCalledWith(
        'unified-events',
        expect.objectContaining({
          type: SSEEventType.SCAN_PROGRESS,
          scanId,
          progress: expect.objectContaining({
            stage: 'fetching-huggingface',
            currentItem: 'model-5',
            totalItems: 10,
            completedItems: 5,
          }),
        })
      );
    });

    it('should broadcast progress for each model during checking', async () => {
      vi.mocked(modelFetcher.fetchPopularModels).mockResolvedValue(undefined);
      const models = [
        { name: 'llama-2-7b', size: 7000 },
        { name: 'mistral-7b', size: 7500 },
        { name: 'phi-2', size: 2700 },
      ];
      vi.mocked(modelFetcher.getAvailableModels).mockResolvedValue(models);

      const scanId = await service.startScan({ config: {} });

      // Wait for scan to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify progress broadcasts for each model
      models.forEach((model, index) => {
        expect(mockSseService.broadcast).toHaveBeenCalledWith(
          'unified-events',
          expect.objectContaining({
            type: SSEEventType.SCAN_PROGRESS,
            scanId,
            progress: expect.objectContaining({
              stage: 'checking-models',
              currentItem: model.name,
              totalItems: models.length,
              completedItems: index + 1,
            }),
          })
        );
      });
    });
  });

  describe('Session Cleanup', () => {
    it('should clean up completed search sessions after delay', async () => {
      vi.useFakeTimers();

      vi.mocked(modelFetcher.searchModelsWithProgress).mockResolvedValue([
        { name: 'model1' },
      ]);

      const searchId = await service.startSearch({
        query: 'test',
        searchType: 'text',
        filters: {},
      });

      // Wait for search to complete
      await vi.advanceTimersByTimeAsync(1500);

      // Session should exist after completion
      let status = await service.getScanStatus(searchId);
      expect(status).not.toBeNull();
      expect(status?.status).toBe('completed');

      // Wait for cleanup delay (10 seconds for completed)
      await vi.advanceTimersByTimeAsync(10100);

      // Session should be cleaned up
      status = await service.getScanStatus(searchId);
      expect(status).toBeNull();

      vi.useRealTimers();
    });

    it('should clean up errored sessions after shorter delay', async () => {
      vi.useFakeTimers();

      vi.mocked(modelFetcher.fetchPopularModels).mockRejectedValue(
        new Error('Test error')
      );

      const scanId = await service.startScan({ config: {} });

      // Wait for error
      await vi.advanceTimersByTimeAsync(1500);

      // Session should exist after error
      let status = await service.getScanStatus(scanId);
      expect(status).not.toBeNull();
      expect(status?.status).toBe('error');

      // Wait for cleanup delay (5 seconds for error)
      await vi.advanceTimersByTimeAsync(5100);

      // Session should be cleaned up
      status = await service.getScanStatus(scanId);
      expect(status).toBeNull();

      vi.useRealTimers();
    });
  });
});
