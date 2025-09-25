/**
 * Tests for modelScan route error handling
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  vi,
  afterEach,
  type Mock,
} from 'vitest';
import { performModelScan, testUtils } from '../routes/modelScan';
import { ModelFetcher } from '../modelFetcher';
import { logger } from '../logger';
import type { SSEManager } from '../sseManager';

// Mock dependencies
vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../modelFetcher');

// Mock SSE broadcasting
const mockBroadcast = vi.fn();
const mockSSEManager: Pick<SSEManager, 'broadcast'> = {
  broadcast: mockBroadcast,
};

describe('ModelScan Error Handling', () => {
  let mockFetchPopularModels: Mock;
  let mockGetAvailableModels: Mock;
  let mockSetProgressCallback: Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    // Clear any existing scan sessions
    testUtils.clearActiveScanSessions();

    // Setup mock methods
    mockFetchPopularModels = vi.fn();
    mockGetAvailableModels = vi.fn().mockResolvedValue([]);
    mockSetProgressCallback = vi.fn();

    // Create a partial mock that satisfies the minimal interface needed
    const MockModelFetcherClass = vi.fn().mockImplementation(() => ({
      fetchPopularModels: mockFetchPopularModels,
      getAvailableModels: mockGetAvailableModels,
      setProgressCallback: mockSetProgressCallback,
      // Add other required methods as stubs if needed
      getCachedModels: vi.fn().mockReturnValue([]),
      fetchVRAMDataForModels: vi.fn(),
      searchHuggingFace: vi.fn(),
    }));

    vi.mocked(ModelFetcher).mockImplementation(MockModelFetcherClass);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('performModelScan error handling', () => {
    it('should handle rate limit errors with user-friendly message', async () => {
      const scanId = 'test-scan-123';
      const abortController = new AbortController();

      // Set up the active scan session
      testUtils.setActiveScanSession(scanId, {
        id: scanId,
        controller: abortController,
        status: 'running',
        startTime: Date.now(),
      });

      // Simulate rate limit error
      const rateLimitError = new Error(
        'Rate limit exceeded. Please wait a few minutes before trying again.'
      );
      mockFetchPopularModels.mockRejectedValue(rateLimitError);

      // Create a promise to track the scan completion
      const modelFetcher = new ModelFetcher();
      const scanPromise = performModelScan(
        scanId,
        modelFetcher,
        mockSSEManager as SSEManager,
        abortController.signal
      );

      await scanPromise;

      // Check that error was logged
      expect(logger.error).toHaveBeenCalledWith(
        `Model scan ${scanId} failed:`,
        rateLimitError
      );

      // Check that user-friendly message was broadcast as the last call
      expect(mockBroadcast).toHaveBeenLastCalledWith(
        'unified-events',
        expect.objectContaining({
          type: 'scan-progress',
          scanId,
          progress: expect.objectContaining({
            stage: 'error',
            message:
              'HuggingFace API rate limit reached. Please wait a few minutes before trying again.',
            error: rateLimitError.message,
            operationType: 'scan',
          }),
          timestamp: expect.any(Number),
        })
      );
    });

    it('should handle network errors with user-friendly message', async () => {
      const scanId = 'test-scan-456';
      const abortController = new AbortController();

      // Set up the active scan session
      testUtils.setActiveScanSession(scanId, {
        id: scanId,
        controller: abortController,
        status: 'running',
        startTime: Date.now(),
      });

      // Simulate network error
      const networkError = new Error('Failed to fetch');
      mockFetchPopularModels.mockRejectedValue(networkError);

      const modelFetcher = new ModelFetcher();
      await performModelScan(
        scanId,
        modelFetcher,
        mockSSEManager as SSEManager,
        abortController.signal
      );

      // Check that user-friendly message was broadcast as the last call
      expect(mockBroadcast).toHaveBeenLastCalledWith(
        'unified-events',
        expect.objectContaining({
          type: 'scan-progress',
          scanId,
          progress: expect.objectContaining({
            stage: 'error',
            message:
              'Unable to connect to HuggingFace. Please check your internet connection.',
            error: networkError.message,
            operationType: 'scan',
          }),
          timestamp: expect.any(Number),
        })
      );
    });

    it('should handle abort errors gracefully', async () => {
      const scanId = 'test-scan-789';
      const abortController = new AbortController();

      // Set up the active scan session
      testUtils.setActiveScanSession(scanId, {
        id: scanId,
        controller: abortController,
        status: 'running',
        startTime: Date.now(),
      });

      // Simulate abort error
      const abortError = new Error('AbortError');
      abortError.name = 'AbortError';
      mockFetchPopularModels.mockRejectedValue(abortError);

      const modelFetcher = new ModelFetcher();
      await performModelScan(
        scanId,
        modelFetcher,
        mockSSEManager as SSEManager,
        abortController.signal
      );

      // Check that user-friendly message was broadcast as the last call
      expect(mockBroadcast).toHaveBeenLastCalledWith(
        'unified-events',
        expect.objectContaining({
          type: 'scan-progress',
          scanId,
          progress: expect.objectContaining({
            stage: 'error',
            message: 'Scan was cancelled by user.',
            error: 'AbortError',
            operationType: 'scan',
          }),
          timestamp: expect.any(Number),
        })
      );
    });

    it('should handle generic errors with original message', async () => {
      const scanId = 'test-scan-999';
      const abortController = new AbortController();

      // Set up the active scan session
      testUtils.setActiveScanSession(scanId, {
        id: scanId,
        controller: abortController,
        status: 'running',
        startTime: Date.now(),
      });

      // Simulate generic error
      const genericError = new Error('Something went wrong');
      mockFetchPopularModels.mockRejectedValue(genericError);

      const modelFetcher = new ModelFetcher();
      await performModelScan(
        scanId,
        modelFetcher,
        mockSSEManager as SSEManager,
        abortController.signal
      );

      // Check that original error message was used as the last call
      expect(mockBroadcast).toHaveBeenLastCalledWith(
        'unified-events',
        expect.objectContaining({
          type: 'scan-progress',
          scanId,
          progress: expect.objectContaining({
            stage: 'error',
            message: 'Something went wrong',
            error: genericError.message,
            operationType: 'scan',
          }),
          timestamp: expect.any(Number),
        })
      );
    });

    it('should handle non-Error objects', async () => {
      const scanId = 'test-scan-111';
      const abortController = new AbortController();

      // Set up the active scan session
      testUtils.setActiveScanSession(scanId, {
        id: scanId,
        controller: abortController,
        status: 'running',
        startTime: Date.now(),
      });

      // Simulate non-Error thrown
      mockFetchPopularModels.mockRejectedValue('String error');

      const modelFetcher = new ModelFetcher();
      await performModelScan(
        scanId,
        modelFetcher,
        mockSSEManager as SSEManager,
        abortController.signal
      );

      // Check that fallback message was used as the last call
      expect(mockBroadcast).toHaveBeenLastCalledWith(
        'unified-events',
        expect.objectContaining({
          type: 'scan-progress',
          scanId,
          progress: expect.objectContaining({
            stage: 'error',
            message: 'Scan failed due to an error',
            error: 'Scan failed due to an error',
            operationType: 'scan',
          }),
          timestamp: expect.any(Number),
        })
      );
    });

    it('should handle HTTP 400 errors with user-friendly message', async () => {
      const scanId = 'test-scan-400';
      const abortController = new AbortController();

      // Set up the active scan session
      testUtils.setActiveScanSession(scanId, {
        id: scanId,
        controller: abortController,
        status: 'running',
        startTime: Date.now(),
      });

      // Simulate HTTP 400 error
      const badRequestError = new Error(
        'HTTP 400: Bad Request. Please try again later.'
      );
      mockFetchPopularModels.mockRejectedValue(badRequestError);

      const modelFetcher = new ModelFetcher();
      await performModelScan(
        scanId,
        modelFetcher,
        mockSSEManager as SSEManager,
        abortController.signal
      );

      // Check that user-friendly message was broadcast as the last call
      expect(mockBroadcast).toHaveBeenLastCalledWith(
        'unified-events',
        expect.objectContaining({
          type: 'scan-progress',
          scanId,
          progress: expect.objectContaining({
            stage: 'error',
            message:
              'HuggingFace API request failed. The service may be temporarily unavailable.',
            error: badRequestError.message,
            operationType: 'scan',
          }),
          timestamp: expect.any(Number),
        })
      );
    });

    it('should not broadcast error if signal was aborted', async () => {
      const scanId = 'test-scan-222';
      const abortController = new AbortController();

      // Set up the active scan session
      testUtils.setActiveScanSession(scanId, {
        id: scanId,
        controller: abortController,
        status: 'running',
        startTime: Date.now(),
      });

      // Simulate error and then abort during the error handling
      const error = new Error('Some error');
      mockFetchPopularModels.mockImplementation(async () => {
        // Abort during the fetch operation
        abortController.abort();
        throw error;
      });

      const modelFetcher = new ModelFetcher();
      await performModelScan(
        scanId,
        modelFetcher,
        mockSSEManager as SSEManager,
        abortController.signal
      );

      // Should log but not broadcast error
      expect(logger.info).toHaveBeenCalledWith(
        `Model scan ${scanId} was cancelled`
      );

      // Should not broadcast error message
      expect(mockBroadcast).not.toHaveBeenCalledWith(
        'unified-events',
        expect.objectContaining({
          type: 'scan-progress',
          progress: expect.objectContaining({
            stage: 'error',
          }),
        })
      );
    });

    it('should broadcast progress updates during successful scan', async () => {
      const scanId = 'test-scan-333';
      const abortController = new AbortController();

      // Set up the active scan session
      testUtils.setActiveScanSession(scanId, {
        id: scanId,
        controller: abortController,
        status: 'running',
        startTime: Date.now(),
      });

      // Mock successful scan
      mockFetchPopularModels.mockImplementation(async (callback?: Function) => {
        if (callback) {
          callback(1, 10, 'model-1');
          callback(5, 10, 'model-5');
          callback(10, 10, 'model-10');
        }
      });

      mockGetAvailableModels.mockResolvedValue([
        { name: 'model-1', id: 'test/model-1' },
        { name: 'model-2', id: 'test/model-2' },
      ]);

      const modelFetcher = new ModelFetcher();
      await performModelScan(
        scanId,
        modelFetcher,
        mockSSEManager as SSEManager,
        abortController.signal
      );

      // Check that broadcast was called multiple times (at least initial and completion)
      expect(mockBroadcast.mock.calls.length).toBeGreaterThan(1);

      // Check that the first call was initializing
      expect(mockBroadcast.mock.calls[0]).toEqual([
        'unified-events',
        expect.objectContaining({
          type: 'scan-progress',
          scanId,
          progress: expect.objectContaining({
            stage: 'initializing',
            message: 'Preparing to fetch model list...',
            progress: 0,
            operationType: 'scan',
          }),
          timestamp: expect.any(Number),
        }),
      ]);

      // Check that the last call was completion
      expect(mockBroadcast).toHaveBeenLastCalledWith(
        'unified-events',
        expect.objectContaining({
          type: 'scan-progress',
          scanId,
          progress: expect.objectContaining({
            stage: 'completed',
            message: expect.stringContaining('Scan completed'),
            progress: 100,
            operationType: 'scan',
          }),
          timestamp: expect.any(Number),
        })
      );
    });
  });
});
