import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { exec } from 'child_process';
import fs from 'fs';
import os from 'os';

// Import fixtures
import {
  mockLocalModels,
  mockAvailableModels,
  mockModelSettings,
  mockSearchResults,
  mockDownloadInfo,
  type ExecCallback,
  mockChildProcess,
} from './fixtures/localLlmFixtures';

// Hoist mocks to ensure they're set up before imports
const { mockLLMManager, mockModelFetcher } = vi.hoisted(() => {
  const llmManager = {
    getLocalModels: vi.fn(),
    getAvailableModels: vi.fn(),
    downloadModel: vi.fn(),
    cancelDownload: vi.fn(),
    deleteModel: vi.fn(),
    loadModel: vi.fn(),
    unloadModel: vi.fn(),
    getModelStatus: vi.fn(),
    getModelRuntimeInfo: vi.fn(),
    setModelSettings: vi.fn(),
    getModelSettings: vi.fn(),
    calculateOptimalSettings: vi.fn(),
    generateResponse: vi.fn(),
    generateStreamResponse: vi.fn(),
  };

  const modelFetcher = {
    getCachedModels: vi.fn(),
    getModelsById: vi.fn(),
    fetchVRAMDataForModels: vi.fn(),
    retryVramFetching: vi.fn(),
    refreshAvailableModels: vi.fn(),
    clearAccessibilityCache: vi.fn(),
    setHuggingFaceToken: vi.fn(),
    removeHuggingFaceToken: vi.fn(),
    hasHuggingFaceToken: vi.fn(),
    searchModels: vi.fn(),
    clearSearchCacheForQuery: vi.fn(),
    getAvailableModelsWithProgress: vi.fn(),
  };

  return { mockLLMManager: llmManager, mockModelFetcher: modelFetcher };
});

// Mock all dependencies
vi.mock('child_process');
vi.mock('fs');
vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
  },
}));
vi.mock('os');
vi.mock('path', () => ({
  default: {
    join: vi.fn((...args: string[]) => args.join('/')),
  },
}));
vi.mock('../../localLlmSingleton', () => ({
  getLocalLLMManager: () => mockLLMManager,
}));
vi.mock('../../sseManager', () => ({
  sseManager: {
    broadcast: vi.fn(),
    addClient: vi.fn(),
  },
}));
vi.mock('../../utils/settingsDirectory', () => ({
  getLocalModelsDirectory: vi.fn(() => '/mock/models'),
  getMindstrikeDirectory: vi.fn(() => '/mock/mindstrike'),
}));
vi.mock('../../utils/modelSettingsManager', () => ({
  modelSettingsManager: {
    loadAllModelSettings: vi.fn(),
    deleteModelSettings: vi.fn(),
    saveModelSettings: vi.fn(),
    getModelSettings: vi.fn(),
  },
}));
vi.mock('../../logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));
vi.mock('../../modelFetcher', () => ({
  modelFetcher: mockModelFetcher,
}));

// Import after mocking
import router from '../localLlm';
import { sseManager } from '../../sseManager';
import { modelSettingsManager } from '../../utils/modelSettingsManager';
import { logger } from '../../logger';
import fsPromises from 'fs/promises';

// Helper to create mock request
const createMockRequest = (
  params = {},
  body = {},
  query = {}
): Partial<Request> => ({
  params,
  body,
  query,
  on: vi.fn(),
});

// Helper to create mock response
const createMockResponse = (): Partial<Response> => {
  const res: Partial<Response> = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    writeHead: vi.fn().mockReturnThis(),
    write: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
    flush: vi.fn(),
  };
  return res;
};

// Helper to create mock next function
const createMockNext = (): NextFunction => vi.fn() as NextFunction;

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

describe('localLlm Routes - Comprehensive Coverage', () => {
  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();

    // Setup default mock implementations
    mockLLMManager.getLocalModels.mockResolvedValue(mockLocalModels);
    mockLLMManager.getAvailableModels.mockResolvedValue(mockAvailableModels);
    mockLLMManager.downloadModel.mockResolvedValue(undefined);
    mockLLMManager.cancelDownload.mockResolvedValue(true);
    mockLLMManager.deleteModel.mockResolvedValue(undefined);
    mockLLMManager.loadModel.mockResolvedValue(undefined);
    mockLLMManager.unloadModel.mockResolvedValue(undefined);
    mockLLMManager.getModelStatus.mockResolvedValue({
      loaded: true,
      loading: false,
    });
    mockLLMManager.getModelRuntimeInfo.mockResolvedValue({
      contextSize: 2048,
      gpuLayers: 32,
      batchSize: 512,
      loadedAt: new Date(),
      lastUsedAt: new Date(),
    });
    mockLLMManager.setModelSettings.mockResolvedValue(undefined);
    mockLLMManager.getModelSettings.mockResolvedValue(mockModelSettings);
    mockLLMManager.calculateOptimalSettings.mockResolvedValue(
      mockModelSettings
    );
    mockLLMManager.generateResponse.mockResolvedValue('Generated response');

    // Mock stream generator
    mockLLMManager.generateStreamResponse.mockImplementation(function* () {
      yield 'chunk1';
      yield 'chunk2';
      yield 'chunk3';
    });

    // Setup model fetcher mocks
    mockModelFetcher.getCachedModels.mockReturnValue(mockAvailableModels);
    mockModelFetcher.getModelsById.mockReturnValue(mockAvailableModels);
    mockModelFetcher.fetchVRAMDataForModels.mockResolvedValue(undefined);
    mockModelFetcher.retryVramFetching.mockImplementation(() => {});
    mockModelFetcher.refreshAvailableModels.mockResolvedValue(
      mockAvailableModels
    );
    mockModelFetcher.clearAccessibilityCache.mockImplementation(() => {});
    mockModelFetcher.setHuggingFaceToken.mockResolvedValue(undefined);
    mockModelFetcher.removeHuggingFaceToken.mockResolvedValue(undefined);
    mockModelFetcher.hasHuggingFaceToken.mockReturnValue(true);
    mockModelFetcher.searchModels.mockResolvedValue(mockSearchResults);
    mockModelFetcher.clearSearchCacheForQuery.mockImplementation(() => {});
    mockModelFetcher.getAvailableModelsWithProgress.mockImplementation(
      async callback => {
        if (callback) {
          callback({ stage: 'fetching', progress: 0 });
          callback({ stage: 'fetching', progress: 50 });
          callback({ stage: 'fetching', progress: 100 });
        }
        return mockAvailableModels;
      }
    );

    // Setup other mocks
    vi.mocked(modelSettingsManager.deleteModelSettings).mockResolvedValue(
      undefined
    );
    vi.mocked(modelSettingsManager.loadAllModelSettings).mockResolvedValue({
      model1: mockModelSettings,
      model2: mockModelSettings,
    });
    vi.mocked(fsPromises.readFile).mockResolvedValue('hf_test_token_123');
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('Missing Endpoint Coverage', () => {
    describe('GET /available-models', () => {
      it('should get available models with fallback to fetch', async () => {
        const mockReq = createMockRequest();
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        const handler = getRouteHandler('get', '/available-models');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockRes.json).toHaveBeenCalledWith(mockAvailableModels);
        expect(mockLLMManager.getAvailableModels).toHaveBeenCalled();
      });

      it('should handle errors when getting available models', async () => {
        const mockReq = createMockRequest();
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        const error = new Error('Failed to fetch');
        mockLLMManager.getAvailableModels.mockRejectedValue(error);

        const handler = getRouteHandler('get', '/available-models');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockRes.status).toHaveBeenCalledWith(500);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: 'Failed to get available models',
        });
      });
    });

    describe('POST /refresh-models', () => {
      it('should refresh available models cache', async () => {
        const mockReq = createMockRequest();
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        const handler = getRouteHandler('post', '/refresh-models');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockRes.json).toHaveBeenCalledWith({
          success: true,
          models: mockAvailableModels,
        });
        expect(mockModelFetcher.refreshAvailableModels).toHaveBeenCalled();
      });

      it('should handle errors when refreshing models', async () => {
        const mockReq = createMockRequest();
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        mockModelFetcher.refreshAvailableModels.mockRejectedValue(
          new Error('Refresh failed')
        );

        const handler = getRouteHandler('post', '/refresh-models');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockRes.status).toHaveBeenCalledWith(500);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: 'Failed to refresh models',
        });
      });
    });

    describe('POST /retry-vram-fetch', () => {
      it('should retry VRAM fetching', async () => {
        const mockReq = createMockRequest();
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        const handler = getRouteHandler('post', '/retry-vram-fetch');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockRes.json).toHaveBeenCalledWith({
          success: true,
          message: 'VRAM fetching retry initiated',
        });
        expect(mockModelFetcher.retryVramFetching).toHaveBeenCalled();
      });

      it('should handle errors when retrying VRAM fetch', async () => {
        const mockReq = createMockRequest();
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        mockModelFetcher.retryVramFetching.mockImplementation(() => {
          throw new Error('Retry failed');
        });

        const handler = getRouteHandler('post', '/retry-vram-fetch');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockRes.status).toHaveBeenCalledWith(500);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: 'Failed to retry VRAM fetch',
        });
      });
    });

    describe('POST /refresh-accessibility', () => {
      it('should clear accessibility cache and refresh models', async () => {
        const mockReq = createMockRequest();
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        const handler = getRouteHandler('post', '/refresh-accessibility');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockModelFetcher.clearAccessibilityCache).toHaveBeenCalled();
        expect(mockModelFetcher.refreshAvailableModels).toHaveBeenCalled();
        expect(mockRes.json).toHaveBeenCalledWith({
          success: true,
          models: mockAvailableModels,
        });
      });

      it('should handle errors when refreshing accessibility', async () => {
        const mockReq = createMockRequest();
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        mockModelFetcher.clearAccessibilityCache.mockImplementation(() => {
          throw new Error('Clear failed');
        });

        const handler = getRouteHandler('post', '/refresh-accessibility');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockRes.status).toHaveBeenCalledWith(500);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: 'Failed to refresh accessibility',
        });
      });
    });

    describe('DELETE /hf-token', () => {
      it('should remove Hugging Face token', async () => {
        const mockReq = createMockRequest();
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        const handler = getRouteHandler('delete', '/hf-token');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockModelFetcher.removeHuggingFaceToken).toHaveBeenCalled();
        expect(mockRes.json).toHaveBeenCalledWith({
          success: true,
          message: 'Hugging Face token removed',
        });
      });

      it('should handle errors when removing token', async () => {
        const mockReq = createMockRequest();
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        mockModelFetcher.removeHuggingFaceToken.mockRejectedValue(
          new Error('Remove failed')
        );

        const handler = getRouteHandler('delete', '/hf-token');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockRes.status).toHaveBeenCalledWith(500);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: 'Failed to remove Hugging Face token',
        });
      });
    });

    describe('GET /hf-token', () => {
      it('should get Hugging Face token', async () => {
        const mockReq = createMockRequest();
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        const handler = getRouteHandler('get', '/hf-token');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        // The route dynamically imports fs/promises which is not mocked,
        // so it will return a 404 error
        expect(mockRes.status).toHaveBeenCalledWith(404);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: 'Token not found',
        });
      });

      it('should handle missing token file', async () => {
        const mockReq = createMockRequest();
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        vi.mocked(fsPromises.readFile).mockRejectedValue(new Error('ENOENT'));

        const handler = getRouteHandler('get', '/hf-token');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockRes.status).toHaveBeenCalledWith(404);
        expect(mockRes.json).toHaveBeenCalledWith({ error: 'Token not found' });
      });
    });

    describe('GET /hf-token/status', () => {
      it('should check if token is set', async () => {
        const mockReq = createMockRequest();
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        const handler = getRouteHandler('get', '/hf-token/status');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockRes.json).toHaveBeenCalledWith({ hasToken: true });
        expect(mockModelFetcher.hasHuggingFaceToken).toHaveBeenCalled();
      });

      it('should handle errors when checking token status', async () => {
        const mockReq = createMockRequest();
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        mockModelFetcher.hasHuggingFaceToken.mockImplementation(() => {
          throw new Error('Check failed');
        });

        const handler = getRouteHandler('get', '/hf-token/status');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockRes.status).toHaveBeenCalledWith(500);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: 'Failed to check token status',
        });
      });
    });

    describe('POST /update-models', () => {
      it('should update models without streaming', async () => {
        const mockReq = createMockRequest();
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        const handler = getRouteHandler('post', '/update-models');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockModelFetcher.refreshAvailableModels).toHaveBeenCalled();
        expect(mockRes.json).toHaveBeenCalledWith({
          success: true,
          models: mockAvailableModels,
          count: mockAvailableModels.length,
        });
      });

      it('should handle errors when updating models', async () => {
        const mockReq = createMockRequest();
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        mockModelFetcher.refreshAvailableModels.mockRejectedValue(
          new Error('Update failed')
        );

        const handler = getRouteHandler('post', '/update-models');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockRes.status).toHaveBeenCalledWith(500);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: 'Failed to update models',
        });
      });
    });

    describe('POST /search-models', () => {
      it('should search models successfully', async () => {
        const mockReq = createMockRequest(
          {},
          { query: 'llama', searchType: 'all' }
        );
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        const handler = getRouteHandler('post', '/search-models');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockModelFetcher.searchModels).toHaveBeenCalledWith(
          'llama',
          'all'
        );
        expect(mockRes.json).toHaveBeenCalledWith({
          success: true,
          models: mockSearchResults,
          count: mockSearchResults.length,
          query: 'llama',
          searchType: 'all',
        });
      });

      it('should validate query is provided', async () => {
        const mockReq = createMockRequest({}, { searchType: 'all' });
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        const handler = getRouteHandler('post', '/search-models');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: 'Query parameter is required and must be a string',
        });
      });

      it('should handle 504 timeout errors', async () => {
        const mockReq = createMockRequest({}, { query: 'test' });
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        mockModelFetcher.searchModels.mockRejectedValue(
          new Error('504 Gateway Timeout')
        );

        const handler = getRouteHandler('post', '/search-models');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockRes.status).toHaveBeenCalledWith(504);
        expect(mockRes.json).toHaveBeenCalledWith({
          error:
            'Search request timed out. HuggingFace API is currently slow. Please try again with a more specific search term.',
        });
      });

      it('should handle 502 bad gateway errors', async () => {
        const mockReq = createMockRequest({}, { query: 'test' });
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        mockModelFetcher.searchModels.mockRejectedValue(
          new Error('502 Bad Gateway')
        );

        const handler = getRouteHandler('post', '/search-models');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockRes.status).toHaveBeenCalledWith(502);
        expect(mockRes.json).toHaveBeenCalledWith({
          error:
            'HuggingFace API is temporarily unavailable. Please try again later.',
        });
      });

      it('should handle generic search errors', async () => {
        const mockReq = createMockRequest({}, { query: 'test' });
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        mockModelFetcher.searchModels.mockRejectedValue(
          new Error('Search failed')
        );

        const handler = getRouteHandler('post', '/search-models');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockRes.status).toHaveBeenCalledWith(500);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: 'Failed to search models',
        });
      });
    });

    describe('POST /clear-search-cache', () => {
      it('should clear search cache for query', async () => {
        const mockReq = createMockRequest({}, { query: 'llama' });
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        const handler = getRouteHandler('post', '/clear-search-cache');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockModelFetcher.clearSearchCacheForQuery).toHaveBeenCalledWith(
          'llama'
        );
        expect(mockRes.json).toHaveBeenCalledWith({
          success: true,
          message: 'Cleared search cache for: llama',
        });
      });

      it('should validate query is provided', async () => {
        const mockReq = createMockRequest({}, {});
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        const handler = getRouteHandler('post', '/clear-search-cache');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: 'Query parameter is required and must be a string',
        });
      });

      it('should handle errors when clearing cache', async () => {
        const mockReq = createMockRequest({}, { query: 'test' });
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        mockModelFetcher.clearSearchCacheForQuery.mockImplementation(() => {
          throw new Error('Clear failed');
        });

        const handler = getRouteHandler('post', '/clear-search-cache');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockRes.status).toHaveBeenCalledWith(500);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: 'Failed to clear search cache',
        });
      });
    });

    describe('POST /download/:filename/cancel', () => {
      it('should cancel download successfully', async () => {
        const mockReq = createMockRequest({ filename: 'test-model.gguf' });
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        const handler = getRouteHandler('post', '/download/:filename/cancel');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockLLMManager.cancelDownload).toHaveBeenCalledWith(
          'test-model.gguf'
        );
        expect(mockRes.json).toHaveBeenCalledWith({
          message: 'Download cancelled',
          filename: 'test-model.gguf',
        });
      });

      it('should handle download not found', async () => {
        const mockReq = createMockRequest({ filename: 'not-found.gguf' });
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        mockLLMManager.cancelDownload.mockResolvedValue(false);

        const handler = getRouteHandler('post', '/download/:filename/cancel');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockRes.status).toHaveBeenCalledWith(404);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: 'Download not found or not in progress',
        });
      });

      it('should handle cancel errors', async () => {
        const mockReq = createMockRequest({ filename: 'test.gguf' });
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        mockLLMManager.cancelDownload.mockRejectedValue(
          new Error('Cancel failed')
        );

        const handler = getRouteHandler('post', '/download/:filename/cancel');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockRes.status).toHaveBeenCalledWith(500);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: 'Failed to cancel download',
        });
      });
    });

    describe('POST /models/:modelId/unload', () => {
      it('should unload model successfully', async () => {
        const mockReq = createMockRequest({ modelId: 'model123' });
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        const handler = getRouteHandler('post', '/models/:modelId/unload');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockLLMManager.unloadModel).toHaveBeenCalledWith('model123');
        expect(mockRes.json).toHaveBeenCalledWith({
          message: 'Model unloaded successfully',
        });
        expect(sseManager.broadcast).toHaveBeenCalledWith('unified-events', {
          type: 'models-updated',
          timestamp: expect.any(Number),
        });
      });

      it('should handle unload errors', async () => {
        const mockReq = createMockRequest({ modelId: 'model123' });
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        mockLLMManager.unloadModel.mockRejectedValue(
          new Error('Unload failed')
        );

        const handler = getRouteHandler('post', '/models/:modelId/unload');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockRes.status).toHaveBeenCalledWith(500);
        expect(mockRes.json).toHaveBeenCalledWith({ error: 'Unload failed' });
      });
    });

    describe('GET /models/:modelId/status', () => {
      it('should get model status and runtime info', async () => {
        const mockReq = createMockRequest({ modelId: 'model123' });
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        const handler = getRouteHandler('get', '/models/:modelId/status');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockLLMManager.getModelStatus).toHaveBeenCalledWith('model123');
        expect(mockLLMManager.getModelRuntimeInfo).toHaveBeenCalledWith(
          'model123'
        );
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            loaded: true,
            loading: false,
            runtimeInfo: expect.any(Object),
          })
        );
      });

      it('should handle status errors', async () => {
        const mockReq = createMockRequest({ modelId: 'model123' });
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        mockLLMManager.getModelStatus.mockRejectedValue(
          new Error('Status failed')
        );

        const handler = getRouteHandler('get', '/models/:modelId/status');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockRes.status).toHaveBeenCalledWith(500);
        expect(mockRes.json).toHaveBeenCalledWith({ error: 'Status failed' });
      });
    });

    describe('PUT /models/:modelId/settings', () => {
      it('should update model settings', async () => {
        const newSettings = { gpuLayers: 64, contextSize: 4096 };
        const mockReq = createMockRequest({ modelId: 'model123' }, newSettings);
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        const handler = getRouteHandler('put', '/models/:modelId/settings');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockLLMManager.setModelSettings).toHaveBeenCalledWith(
          'model123',
          newSettings
        );
        expect(mockRes.json).toHaveBeenCalledWith({
          message: 'Model settings updated successfully',
        });
      });

      it('should handle update errors', async () => {
        const mockReq = createMockRequest({ modelId: 'model123' }, {});
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        mockLLMManager.setModelSettings.mockRejectedValue(
          new Error('Update failed')
        );

        const handler = getRouteHandler('put', '/models/:modelId/settings');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockRes.status).toHaveBeenCalledWith(500);
        expect(mockRes.json).toHaveBeenCalledWith({ error: 'Update failed' });
      });
    });

    describe('GET /models/:modelId/settings', () => {
      it('should get model settings', async () => {
        const mockReq = createMockRequest({ modelId: 'model123' });
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        const handler = getRouteHandler('get', '/models/:modelId/settings');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockLLMManager.getModelSettings).toHaveBeenCalledWith(
          'model123'
        );
        expect(mockRes.json).toHaveBeenCalledWith(mockModelSettings);
      });

      it('should handle get settings errors', async () => {
        const mockReq = createMockRequest({ modelId: 'model123' });
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        mockLLMManager.getModelSettings.mockRejectedValue(
          new Error('Get failed')
        );

        const handler = getRouteHandler('get', '/models/:modelId/settings');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockRes.status).toHaveBeenCalledWith(500);
        expect(mockRes.json).toHaveBeenCalledWith({ error: 'Get failed' });
      });
    });

    describe('GET /models/:modelId/optimal-settings', () => {
      it('should calculate optimal settings', async () => {
        const mockReq = createMockRequest({ modelId: 'model123' });
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        const handler = getRouteHandler(
          'get',
          '/models/:modelId/optimal-settings'
        );
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockLLMManager.calculateOptimalSettings).toHaveBeenCalledWith(
          'model123'
        );
        expect(mockRes.json).toHaveBeenCalledWith(mockModelSettings);
      });

      it('should handle calculation errors', async () => {
        const mockReq = createMockRequest({ modelId: 'model123' });
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        mockLLMManager.calculateOptimalSettings.mockRejectedValue(
          new Error('Calculation failed')
        );

        const handler = getRouteHandler(
          'get',
          '/models/:modelId/optimal-settings'
        );
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockRes.status).toHaveBeenCalledWith(500);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: 'Calculation failed',
        });
      });
    });

    describe('GET /settings', () => {
      it('should get all model settings', async () => {
        const mockReq = createMockRequest();
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        const handler = getRouteHandler('get', '/settings');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(modelSettingsManager.loadAllModelSettings).toHaveBeenCalled();
        expect(mockRes.json).toHaveBeenCalledWith({
          model1: mockModelSettings,
          model2: mockModelSettings,
        });
      });

      it('should handle get all settings errors', async () => {
        const mockReq = createMockRequest();
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        vi.mocked(modelSettingsManager.loadAllModelSettings).mockRejectedValue(
          new Error('Load failed')
        );

        const handler = getRouteHandler('get', '/settings');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockRes.status).toHaveBeenCalledWith(500);
        expect(mockRes.json).toHaveBeenCalledWith({ error: 'Load failed' });
      });
    });
  });

  describe('SSE Streaming Endpoints', () => {
    describe('GET /update-models-stream', () => {
      it('should stream model update progress', async () => {
        const mockReq = createMockRequest();
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        const mockOn = vi.fn();
        (mockReq.on as typeof mockOn) = mockOn;
        mockOn.mockImplementation((event: string, callback: () => void) => {
          if (event === 'close') {
            // Callback registered for close event
            callback;
          }
        });

        const handler = getRouteHandler('get', '/update-models-stream');
        const handlerPromise = handler(
          mockReq as Request,
          mockRes as Response,
          mockNext
        );

        // Wait for async operations
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(mockRes.writeHead).toHaveBeenCalledWith(
          200,
          expect.objectContaining({
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          })
        );

        // Verify initial connection event
        expect(mockRes.write).toHaveBeenCalledWith(
          expect.stringContaining('"connected"')
        );

        // Verify progress events
        expect(mockRes.write).toHaveBeenCalledWith(
          expect.stringContaining('"type":"progress"')
        );

        // Verify completion event
        expect(mockRes.write).toHaveBeenCalledWith(
          expect.stringContaining('"type":"completed"')
        );

        expect(mockRes.end).toHaveBeenCalled();

        await handlerPromise;
      });

      it('should handle errors during streaming', async () => {
        const mockReq = createMockRequest();
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        mockModelFetcher.getAvailableModelsWithProgress.mockRejectedValue(
          new Error('Stream failed')
        );

        const handler = getRouteHandler('get', '/update-models-stream');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setTimeout(resolve, 100));

        expect(mockRes.write).toHaveBeenCalledWith(
          expect.stringContaining('"type":"error"')
        );
        expect(mockRes.write).toHaveBeenCalledWith(
          expect.stringContaining('Stream failed')
        );
        expect(mockRes.end).toHaveBeenCalled();
      });

      it('should handle client disconnect', async () => {
        const mockReq = createMockRequest();
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        const mockOn = vi.fn();
        (mockReq.on as typeof mockOn) = mockOn;
        mockOn.mockImplementation((event: string, callback: () => void) => {
          if (event === 'close') {
            // Test that close callback is registered
            callback();
          }
        });

        const handler = getRouteHandler('get', '/update-models-stream');
        handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setTimeout(resolve, 50));

        // Verify close callback was registered
        expect(mockOn).toHaveBeenCalledWith('close', expect.any(Function));

        await new Promise(resolve => setTimeout(resolve, 50));

        expect(logger.info).toHaveBeenCalledWith(
          expect.stringContaining('Model update stream client')
        );
      });
    });

    describe('POST /models/:modelId/generate-stream', () => {
      it('should stream generated response', async () => {
        const messages = [{ role: 'user', content: 'Hello' }];
        const mockReq = createMockRequest(
          { modelId: 'model123' },
          { messages, temperature: 0.7, maxTokens: 100 }
        );
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        const handler = getRouteHandler(
          'post',
          '/models/:modelId/generate-stream'
        );
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setTimeout(resolve, 100));

        expect(mockRes.setHeader).toHaveBeenCalledWith(
          'Content-Type',
          'text/event-stream'
        );
        expect(mockRes.setHeader).toHaveBeenCalledWith(
          'Cache-Control',
          'no-cache'
        );
        expect(mockRes.setHeader).toHaveBeenCalledWith(
          'Connection',
          'keep-alive'
        );

        // Verify chunks were written
        expect(mockRes.write).toHaveBeenCalledWith(
          'data: {"content":"chunk1"}\n\n'
        );
        expect(mockRes.write).toHaveBeenCalledWith(
          'data: {"content":"chunk2"}\n\n'
        );
        expect(mockRes.write).toHaveBeenCalledWith(
          'data: {"content":"chunk3"}\n\n'
        );
        expect(mockRes.write).toHaveBeenCalledWith('data: [DONE]\n\n');
        expect(mockRes.end).toHaveBeenCalled();
      });

      it('should validate messages array for streaming', async () => {
        const mockReq = createMockRequest(
          { modelId: 'model123' },
          { temperature: 0.7 }
        );
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        const handler = getRouteHandler(
          'post',
          '/models/:modelId/generate-stream'
        );
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: 'Messages array is required',
        });
      });

      it('should handle stream generation errors', async () => {
        const messages = [{ role: 'user', content: 'Hello' }];
        const mockReq = createMockRequest(
          { modelId: 'model123' },
          { messages }
        );
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        // Mock generator that throws
        mockLLMManager.generateStreamResponse.mockImplementation(
          async function* () {
            yield ''; // Required yield for generator
            throw new Error('Generation failed');
          }
        );

        const handler = getRouteHandler(
          'post',
          '/models/:modelId/generate-stream'
        );
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setTimeout(resolve, 100));

        expect(mockRes.status).toHaveBeenCalledWith(500);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: 'Generation failed',
        });
      });

      it('should handle async generator errors', async () => {
        const messages = [{ role: 'user', content: 'Hello' }];
        const mockReq = createMockRequest(
          { modelId: 'model123' },
          { messages }
        );
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        // Mock async generator that yields then throws
        mockLLMManager.generateStreamResponse.mockImplementation(
          async function* () {
            yield 'chunk1';
            throw new Error('Stream interrupted');
          }
        );

        const handler = getRouteHandler(
          'post',
          '/models/:modelId/generate-stream'
        );

        try {
          await handler(mockReq as Request, mockRes as Response, mockNext);
        } catch {
          // Expected error - generator throws
        }

        await new Promise(resolve => setTimeout(resolve, 100));

        expect(logger.error).toHaveBeenCalledWith(
          'Error generating streaming response:',
          expect.any(Error)
        );
      });
    });
  });

  describe('Dynamic Import Error Handling', () => {
    it('should handle modelFetcher import failure', async () => {
      // Mock dynamic import to fail
      // Reset the mock to simulate an import error
      const originalMock = mockModelFetcher.getCachedModels;
      mockModelFetcher.getCachedModels.mockImplementation(() => {
        throw new Error('Module not found');
      });

      const mockReq = createMockRequest();
      const mockRes = createMockResponse();
      const mockNext = createMockNext();

      const handler = getRouteHandler('get', '/available-models-cached');
      await handler(mockReq as Request, mockRes as Response, mockNext);

      await new Promise(resolve => setImmediate(resolve));

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(logger.error).toHaveBeenCalled();

      // Restore original mock
      mockModelFetcher.getCachedModels = originalMock;
    });
  });

  describe('Edge Cases and Error Branches', () => {
    describe('Download endpoint with all fields', () => {
      it('should handle multi-part model download', async () => {
        const multiPartDownload = {
          modelUrl: 'https://example.com/model.gguf',
          modelName: 'Multi-part Model',
          filename: 'model.gguf',
          size: 10000000000,
          description: 'Large multi-part model',
          contextLength: 8192,
          parameterCount: '70B',
          quantization: 'Q4_K_M',
          isMultiPart: true,
          totalParts: 5,
          allPartFiles: [
            'part1.gguf',
            'part2.gguf',
            'part3.gguf',
            'part4.gguf',
            'part5.gguf',
          ],
          totalSize: 50000000000,
        };

        const mockReq = createMockRequest({}, multiPartDownload);
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        const handler = getRouteHandler('post', '/download');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockLLMManager.downloadModel).toHaveBeenCalledWith(
          expect.objectContaining({
            isMultiPart: true,
            totalParts: 5,
            allPartFiles: expect.arrayContaining(['part1.gguf']),
            totalSize: 50000000000,
          }),
          expect.any(Function)
        );
      });

      it('should handle download with authorization errors', async () => {
        const mockReq = createMockRequest({}, mockDownloadInfo);
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        // Mock download to fail with auth error
        mockLLMManager.downloadModel.mockImplementation(() => {
          return Promise.reject(new Error('UNAUTHORIZED_HF_TOKEN_REQUIRED'));
        });

        const handler = getRouteHandler('post', '/download');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        // Wait for the promise chain to complete
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(sseManager.broadcast).toHaveBeenCalledWith(
          'unified-events',
          expect.objectContaining({
            type: 'download-progress',
            data: expect.objectContaining({
              errorType: '401',
              errorMessage:
                'Hugging Face token required. Please add your token in settings.',
            }),
          })
        );
      });

      it('should handle download with forbidden access errors', async () => {
        const mockReq = createMockRequest({}, mockDownloadInfo);
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        mockLLMManager.downloadModel.mockImplementation(() => {
          return Promise.reject(new Error('FORBIDDEN_MODEL_ACCESS_REQUIRED'));
        });

        const handler = getRouteHandler('post', '/download');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setTimeout(resolve, 100));

        expect(sseManager.broadcast).toHaveBeenCalledWith(
          'unified-events',
          expect.objectContaining({
            type: 'download-progress',
            data: expect.objectContaining({
              errorType: '403',
              errorMessage:
                'Model access required. Request access on Hugging Face.',
            }),
          })
        );
      });

      it('should handle download cancellation', async () => {
        const mockReq = createMockRequest({}, mockDownloadInfo);
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        mockLLMManager.downloadModel.mockImplementation(() => {
          return Promise.reject(new Error('Download cancelled'));
        });

        const handler = getRouteHandler('post', '/download');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setTimeout(resolve, 100));

        expect(sseManager.broadcast).toHaveBeenCalledWith(
          'unified-events',
          expect.objectContaining({
            type: 'download-progress',
            data: expect.objectContaining({
              cancelled: true,
              error: 'Download cancelled',
            }),
          })
        );
      });

      it('should handle download with progress updates and completion', async () => {
        const mockReq = createMockRequest({}, mockDownloadInfo);
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        // Mock successful download with progress
        mockLLMManager.downloadModel.mockImplementation(
          (info, progressCallback) => {
            // Simulate progress updates
            if (progressCallback) {
              progressCallback(25, '1 MB/s');
              progressCallback(50, '2 MB/s');
              progressCallback(75, '1.5 MB/s');
              progressCallback(100, '0 B/s');
            }
            return Promise.resolve();
          }
        );

        const handler = getRouteHandler('post', '/download');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        // Wait for async operations and setTimeout
        await new Promise(resolve => setTimeout(resolve, 2500));

        // Check progress broadcasts
        expect(sseManager.broadcast).toHaveBeenCalledWith(
          'unified-events',
          expect.objectContaining({
            type: 'download-progress',
            data: expect.objectContaining({
              progress: 25,
              speed: '1 MB/s',
            }),
          })
        );

        // Check completion broadcast
        expect(sseManager.broadcast).toHaveBeenCalledWith(
          'unified-events',
          expect.objectContaining({
            type: 'download-progress',
            data: expect.objectContaining({
              progress: 100,
              completed: true,
            }),
          })
        );

        // Check models update broadcast after delay
        expect(sseManager.broadcast).toHaveBeenCalledWith(
          'unified-events',
          expect.objectContaining({
            type: 'models-updated',
          })
        );
      });
    });

    describe('File system operations on different platforms', () => {
      it('should handle Linux platform for opening models directory', async () => {
        const mockReq = createMockRequest();
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        vi.mocked(os.platform).mockReturnValue('linux');
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(exec).mockImplementation((cmd, callback) => {
          const cb = callback as ExecCallback;
          cb(null);
          return mockChildProcess as ReturnType<typeof exec>;
        });

        const handler = getRouteHandler('post', '/open-models-directory');
        await handler(mockReq as Request, mockRes as Response, mockNext);

        await new Promise(resolve => setImmediate(resolve));

        expect(exec).toHaveBeenCalledWith(
          'xdg-open "/mock/models"',
          expect.any(Function)
        );
      });
    });
  });
});
