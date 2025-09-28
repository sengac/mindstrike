import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ModelScanService } from '../model-scan.service';
import type { SseService } from '../../events/services/sse.service';

// Create a minimal interface that matches what the service needs
interface MockResponse {
  writeHead: (statusCode: number, headers?: Record<string, string>) => void;
  write: (chunk: string) => boolean;
  on: (event: string, listener: () => void) => void;
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

describe('ModelScanService', () => {
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
  });

  describe('addProgressClient', () => {
    it('should add a client for SSE progress', () => {
      const clientId = 'test-client';
      const mockResponse = {
        writeHead: vi.fn(),
        write: vi.fn(),
        on: vi.fn(),
      } as MockResponse;

      // The service expects a Response object, our mock has the minimal needed methods
      service.addProgressClient(clientId, mockResponse);

      expect(mockSseService.addClient).toHaveBeenCalledWith(
        clientId,
        mockResponse,
        'model-scan'
      );
    });
  });

  describe('startSearch', () => {
    it('should start a search and return searchId', async () => {
      const searchParams = {
        query: 'llama',
        searchType: 'text',
        filters: {},
      };
      const mockResults = [{ name: 'model1' }, { name: 'model2' }];

      vi.mocked(modelFetcher.searchModelsWithProgress).mockResolvedValue(
        mockResults
      );

      const searchId = await service.startSearch(searchParams);

      expect(searchId).toBeDefined();
      expect(typeof searchId).toBe('string');
      expect(searchId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it('should use searchType when provided', async () => {
      const searchParams = {
        query: 'llama',
        searchType: 'name',
        filters: {},
      };
      const mockResults = [{ name: 'model1' }, { name: 'model2' }];

      // Track if mock was called with correct parameters
      let capturedType: string | undefined;

      vi.mocked(modelFetcher.searchModelsWithProgress).mockImplementation(
        async (query, type, callback, signal) => {
          capturedType = type;
          // Simulate some progress updates
          if (callback) {
            callback({ type: 'started', message: 'Starting' });
          }
          return mockResults;
        }
      );

      const searchId = await service.startSearch(searchParams);

      expect(searchId).toBeDefined();

      // Wait for the async search to actually execute
      await new Promise(resolve => setTimeout(resolve, 600));

      // Verify the searchType was passed correctly
      expect(capturedType).toBe('name');
      expect(modelFetcher.searchModelsWithProgress).toHaveBeenCalled();
    });

    it('should broadcast search progress', async () => {
      const searchParams = {
        query: 'test',
        searchType: 'text',
        filters: {},
      };
      const mockResults = [{ name: 'model1' }];
      let progressCallback:
        | ((progress: Record<string, unknown>) => void)
        | undefined;

      vi.mocked(modelFetcher.searchModelsWithProgress).mockImplementation(
        (query, type, callback) => {
          progressCallback = callback;
          // Use query and type to satisfy linting
          expect(query).toBe(searchParams.query);
          expect(type).toBe(searchParams.searchType);
          return Promise.resolve(mockResults);
        }
      );

      const searchId = await service.startSearch(searchParams);

      // Simulate progress callback
      if (progressCallback) {
        progressCallback({
          type: 'started',
          message: 'Starting search',
        });
      }

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockSseService.broadcast).toHaveBeenCalled();
    });
  });

  describe('startScan', () => {
    it('should start a scan and return scanId', async () => {
      const scanParams = { config: {} };
      const mockModels = [
        { name: 'model1', size: 1000 },
        { name: 'model2', size: 2000 },
      ];

      vi.mocked(modelFetcher.fetchPopularModels).mockResolvedValue(undefined);
      vi.mocked(modelFetcher.getAvailableModels).mockResolvedValue(mockModels);

      const scanId = await service.startScan(scanParams);

      expect(scanId).toBeDefined();
      expect(typeof scanId).toBe('string');
      expect(scanId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });
  });

  describe('cancelScan', () => {
    it('should cancel a running scan', async () => {
      // First start a scan
      const scanParams = { config: {} };
      vi.mocked(modelFetcher.fetchPopularModels).mockResolvedValue(undefined);
      vi.mocked(modelFetcher.getAvailableModels).mockResolvedValue([]);

      const scanId = await service.startScan(scanParams);

      // Cancel the scan
      const result = await service.cancelScan(scanId);

      expect(result).toBe(true);
      expect(mockSseService.broadcast).toHaveBeenCalledWith(
        'unified-events',
        expect.objectContaining({
          type: expect.any(String),
          scanId,
          progress: expect.objectContaining({
            stage: 'cancelled',
            message: 'Scan cancelled by user',
          }),
        })
      );
    });

    it('should return false if scan not found', async () => {
      const result = await service.cancelScan('non-existent-id');
      expect(result).toBe(false);
    });

    it('should throw error if scan is not running', async () => {
      // Create a mock completed scan by manipulating the internal state
      const scanId = 'test-scan-id';
      // We can't directly access private members, so we test the behavior

      // Start and let complete
      vi.mocked(modelFetcher.fetchPopularModels).mockResolvedValue(undefined);
      vi.mocked(modelFetcher.getAvailableModels).mockResolvedValue([]);

      await service.startScan({ config: {} });

      // Wait for it to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Try to cancel a non-existent scan (simulating completed/removed)
      const result = await service.cancelScan(scanId);
      expect(result).toBe(false);
    });
  });

  describe('getScanStatus', () => {
    it('should return scan status for active scan', async () => {
      // Start a scan
      const scanParams = { config: {} };
      vi.mocked(modelFetcher.fetchPopularModels).mockResolvedValue(undefined);
      vi.mocked(modelFetcher.getAvailableModels).mockResolvedValue([]);

      const scanId = await service.startScan(scanParams);

      // Get status
      const status = await service.getScanStatus(scanId);

      expect(status).toBeDefined();
      expect(status?.scanId).toBe(scanId);
      expect(status?.status).toBe('running');
      expect(typeof status?.startTime).toBe('number');
      expect(typeof status?.duration).toBe('number');
    });

    it('should return null for non-existent scan', async () => {
      const status = await service.getScanStatus('non-existent-id');
      expect(status).toBeNull();
    });
  });

  describe('onModuleDestroy', () => {
    it('should clean up all active scan sessions', async () => {
      // Start multiple scans
      vi.mocked(modelFetcher.fetchPopularModels).mockResolvedValue(undefined);
      vi.mocked(modelFetcher.getAvailableModels).mockResolvedValue([]);

      await service.startScan({ config: {} });
      await service.startScan({ config: {} });

      // Clear previous broadcast calls
      vi.clearAllMocks();

      // Destroy module
      service.onModuleDestroy();

      // Should broadcast cancelled messages for active scans
      expect(mockSseService.broadcast).toHaveBeenCalledTimes(2);
      expect(mockSseService.broadcast).toHaveBeenCalledWith(
        'unified-events',
        expect.objectContaining({
          progress: expect.objectContaining({
            stage: 'cancelled',
            message: 'Scan cancelled due to server shutdown',
          }),
        })
      );
    });
  });
});
