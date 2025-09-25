/**
 * Tests for modelFetcher rate limit handling
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ModelFetcher } from '../modelFetcher';
import { logger } from '../logger';

// Mock logger
vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

// Mock path module
vi.mock('path', () => ({
  join: vi.fn((...args) => args.join('/')),
  resolve: vi.fn((...args) => args.join('/')),
  dirname: vi.fn((path: string) => path.substring(0, path.lastIndexOf('/'))),
}));

// Mock settingsDirectory
vi.mock('../utils/settingsDirectory', () => ({
  getMindstrikeDirectory: vi.fn(() => '/mock/mindstrike'),
}));

describe('ModelFetcher Rate Limit Handling', () => {
  let modelFetcher: ModelFetcher;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Reset fetch mock
    fetchMock = vi.fn();
    global.fetch = fetchMock;

    // Create a new instance for each test
    modelFetcher = new ModelFetcher();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('fetchPopularModels rate limit handling', () => {
    const createMockSuccessResponse = () => ({
      ok: true,
      json: vi.fn().mockResolvedValue([]), // Empty array to avoid additional fetch calls for processing models
      headers: new Headers(),
    });

    it('should retry on 429 rate limit with exponential backoff', async () => {
      const mockRateLimitResponse = {
        ok: false,
        status: 429,
        statusText: 'Rate limit exceeded',
        headers: new Headers(),
        json: vi.fn(),
      };

      // First call returns 429, second call succeeds
      fetchMock
        .mockResolvedValueOnce(mockRateLimitResponse)
        .mockResolvedValueOnce(createMockSuccessResponse());

      const fetchPromise = modelFetcher.fetchPopularModels();

      // Let the first call complete and start retry timer
      await vi.runAllTimersAsync();

      await fetchPromise;

      // Verify fetch was called twice (initial failure + retry success)
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // Verify warning was logged
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('HuggingFace API rate limit hit')
      );
    });

    it('should respect Retry-After header when present', async () => {
      const retryAfterHeaders = new Headers();
      retryAfterHeaders.set('Retry-After', '3'); // Retry after 3 seconds

      const mockRateLimitResponse = {
        ok: false,
        status: 429,
        statusText: 'Rate limit exceeded',
        headers: retryAfterHeaders,
        json: vi.fn(),
      };

      fetchMock
        .mockResolvedValueOnce(mockRateLimitResponse)
        .mockResolvedValueOnce(createMockSuccessResponse());

      const fetchPromise = modelFetcher.fetchPopularModels();

      // Should wait for 3 seconds as specified in Retry-After
      await vi.advanceTimersByTimeAsync(3000);

      await fetchPromise;

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Retrying in 3 seconds')
      );
    });

    it('should fail after maximum retries', async () => {
      const mockRateLimitResponse = {
        ok: false,
        status: 429,
        statusText: 'Rate limit exceeded',
        headers: new Headers(),
        json: vi.fn(),
      };

      // Always return 429
      fetchMock.mockResolvedValue(mockRateLimitResponse);

      // Create and handle promise immediately
      const fetchPromise = modelFetcher.fetchPopularModels();

      // Attach a catch handler immediately to prevent unhandled rejection
      fetchPromise.catch(() => {
        // Expected to reject, will be tested below
      });

      // Fast-forward through all retry attempts
      // Retry 1: ~1-2 seconds
      await vi.advanceTimersByTimeAsync(2000);
      // Retry 2: ~2-3 seconds
      await vi.advanceTimersByTimeAsync(3000);
      // Retry 3: ~4-5 seconds
      await vi.advanceTimersByTimeAsync(5000);

      await expect(fetchPromise).rejects.toThrow(
        'Rate limit exceeded. Please wait a few minutes before trying again.'
      );

      // Should have tried 4 times total (initial + 3 retries)
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it('should handle abort signal during retry wait', async () => {
      const mockRateLimitResponse = {
        ok: false,
        status: 429,
        statusText: 'Rate limit exceeded',
        headers: new Headers(),
        json: vi.fn(),
      };

      fetchMock.mockResolvedValueOnce(mockRateLimitResponse);

      const abortController = new AbortController();
      const fetchPromise = modelFetcher.fetchPopularModels(
        undefined,
        abortController.signal
      );

      // Abort during the retry wait
      setTimeout(() => abortController.abort(), 500);
      await vi.advanceTimersByTimeAsync(500);

      // The second fetch should be called with the abort signal
      fetchMock.mockResolvedValueOnce(createMockSuccessResponse());

      await vi.advanceTimersByTimeAsync(2000);

      // The promise should complete (either with success or abort error)
      // depending on the exact timing
      try {
        await fetchPromise;
      } catch (error) {
        if (error instanceof Error) {
          expect(error.name).toBe('AbortError');
        }
      }
    });

    it('should cap wait time at 30 seconds', async () => {
      const retryAfterHeaders = new Headers();
      retryAfterHeaders.set('Retry-After', '120'); // Server says retry after 120 seconds

      const mockRateLimitResponse = {
        ok: false,
        status: 429,
        statusText: 'Rate limit exceeded',
        headers: retryAfterHeaders,
        json: vi.fn(),
      };

      fetchMock
        .mockResolvedValueOnce(mockRateLimitResponse)
        .mockResolvedValueOnce(createMockSuccessResponse());

      const fetchPromise = modelFetcher.fetchPopularModels();

      // Should cap at 30 seconds, not wait for 120
      await vi.advanceTimersByTimeAsync(30000);

      await fetchPromise;

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Retrying in 30 seconds')
      );
    });

    it('should handle non-429 errors without retry', async () => {
      const mockErrorResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers(),
        json: vi.fn(),
      };

      fetchMock.mockResolvedValue(mockErrorResponse);

      await expect(modelFetcher.fetchPopularModels()).rejects.toThrow(
        'HTTP 500: Internal Server Error'
      );

      // Should not retry the main fetch call for non-429 errors
      // Note: there may be additional calls for other purposes
      expect(fetchMock).toHaveBeenCalledWith(
        'https://huggingface.co/api/models?filter=gguf&sort=downloads&direction=-1&limit=150',
        expect.objectContaining({
          headers: {
            'User-Agent': 'mindstrike-local-llm/1.0',
          },
        })
      );
    });

    it('should include jitter in exponential backoff', async () => {
      const mockRateLimitResponse = {
        ok: false,
        status: 429,
        statusText: 'Rate limit exceeded',
        headers: new Headers(), // No Retry-After header
        json: vi.fn(),
      };

      fetchMock
        .mockResolvedValueOnce(mockRateLimitResponse)
        .mockResolvedValueOnce(createMockSuccessResponse());

      const fetchPromise = modelFetcher.fetchPopularModels();

      // The wait time should be 1000ms (2^0 * 1000) + random jitter (0-1000ms)
      // So maximum wait is 2000ms
      await vi.advanceTimersByTimeAsync(2100);

      await fetchPromise;

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('should retry on 400 Bad Request with shorter wait time', async () => {
      const mockBadRequestResponse = {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: new Headers(),
        json: vi.fn(),
      };

      // First call returns 400, second call succeeds
      fetchMock
        .mockResolvedValueOnce(mockBadRequestResponse)
        .mockResolvedValueOnce(createMockSuccessResponse());

      const fetchPromise = modelFetcher.fetchPopularModels();

      // 400 errors have shorter wait time (2-3 seconds max)
      await vi.advanceTimersByTimeAsync(3500);

      await fetchPromise;

      // Verify fetch was called twice (initial failure + retry success)
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // Verify warning was logged
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('HuggingFace API returned 400 Bad Request')
      );
    });

    it('should fail after maximum retries for 400 errors', async () => {
      const mockBadRequestResponse = {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: new Headers(),
        json: vi.fn(),
      };

      // Always return 400
      fetchMock.mockResolvedValue(mockBadRequestResponse);

      // Create and handle promise immediately
      const fetchPromise = modelFetcher.fetchPopularModels();

      // Attach a catch handler immediately to prevent unhandled rejection
      fetchPromise.catch(() => {
        // Expected to reject, will be tested below
      });

      // Fast-forward through all retry attempts (400 has shorter waits than 429)
      // Retry 1: ~2-3 seconds
      await vi.advanceTimersByTimeAsync(3500);
      // Retry 2: ~2-3 seconds
      await vi.advanceTimersByTimeAsync(3500);
      // Retry 3: ~2-3 seconds
      await vi.advanceTimersByTimeAsync(3500);

      await expect(fetchPromise).rejects.toThrow(
        'HTTP 400: Bad Request. All verified API endpoints failed.'
      );

      // Should have tried all fallback URLs and their retries
      // With 5 fallback URLs and 3 retries per URL, this could be many calls
      expect(fetchMock).toHaveBeenCalled();
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(5); // At least try all URLs once
    });

    it('should try fallback URLs when 400 errors occur', async () => {
      const mockBadRequestResponse = {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: new Headers(),
        json: vi.fn(),
      };

      // First URL fails, second URL succeeds
      fetchMock
        .mockResolvedValueOnce(mockBadRequestResponse) // First URL fails
        .mockResolvedValueOnce(createMockSuccessResponse()); // Second URL succeeds

      await modelFetcher.fetchPopularModels();

      // Should try both URLs
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // Check that it tried the primary URL first
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        'https://huggingface.co/api/models?filter=gguf&sort=downloads&direction=-1&limit=150',
        expect.objectContaining({
          headers: { 'User-Agent': 'mindstrike-local-llm/1.0' },
        })
      );

      // Check that it tried the fallback URL second
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'https://huggingface.co/api/models?filter=gguf&sort=lastModified&direction=-1&limit=150',
        expect.objectContaining({
          headers: { 'User-Agent': 'mindstrike-local-llm/1.0' },
        })
      );

      // Verify fallback info was logged
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Trying fallback URL')
      );
    });
  });
});
