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
vi.mock('os');
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
  getLocalModelsDirectory: vi.fn(),
  getMindstrikeDirectory: vi.fn(),
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
import { getLocalModelsDirectory } from '../../utils/settingsDirectory';
import { modelSettingsManager } from '../../utils/modelSettingsManager';
import { logger } from '../../logger';

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

describe('localLlm Routes', () => {
  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();

    // Setup mock implementations
    mockLLMManager.getLocalModels.mockResolvedValue(mockLocalModels);
    mockLLMManager.getAvailableModels.mockResolvedValue(mockAvailableModels);
    mockLLMManager.downloadModel.mockResolvedValue(undefined);
    mockLLMManager.cancelDownload.mockResolvedValue(true);
    mockLLMManager.deleteModel.mockResolvedValue(undefined);
    mockLLMManager.loadModel.mockResolvedValue(undefined);
    mockLLMManager.unloadModel.mockResolvedValue(undefined);
    mockLLMManager.getModelStatus.mockResolvedValue({ loaded: true });
    mockLLMManager.getModelRuntimeInfo.mockResolvedValue({});
    mockLLMManager.setModelSettings.mockResolvedValue(undefined);
    mockLLMManager.getModelSettings.mockResolvedValue(mockModelSettings);
    mockLLMManager.calculateOptimalSettings.mockResolvedValue(
      mockModelSettings
    );
    mockLLMManager.generateResponse.mockResolvedValue('Generated response');
    mockLLMManager.generateStreamResponse.mockImplementation(function* () {
      yield 'chunk1';
      yield 'chunk2';
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
    mockModelFetcher.hasHuggingFaceToken.mockReturnValue(false);
    mockModelFetcher.searchModels.mockResolvedValue(mockSearchResults);
    mockModelFetcher.clearSearchCacheForQuery.mockImplementation(() => {});
    mockModelFetcher.getAvailableModelsWithProgress.mockResolvedValue(
      mockAvailableModels
    );

    // Setup other mocks
    vi.mocked(getLocalModelsDirectory).mockReturnValue('/mock/models');
    vi.mocked(modelSettingsManager.deleteModelSettings).mockResolvedValue(
      undefined
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('GET /models', () => {
    it('should return local models successfully', async () => {
      const mockReq = createMockRequest();
      const mockRes = createMockResponse();
      const mockNext = createMockNext();

      const handler = getRouteHandler('get', '/models');
      await handler(mockReq as Request, mockRes as Response, mockNext);

      // Wait for async operation
      await new Promise(resolve => setImmediate(resolve));

      expect(mockRes.json).toHaveBeenCalledWith(mockLocalModels);
      expect(mockLLMManager.getLocalModels).toHaveBeenCalledTimes(1);
    });

    it('should handle errors when getting local models', async () => {
      const mockReq = createMockRequest();
      const mockRes = createMockResponse();
      const mockNext = createMockNext();

      const error = new Error('Failed to fetch models');
      mockLLMManager.getLocalModels.mockRejectedValue(error);

      const handler = getRouteHandler('get', '/models');
      await handler(mockReq as Request, mockRes as Response, mockNext);

      // Wait for async operation
      await new Promise(resolve => setImmediate(resolve));

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to get local models',
      });
      expect(logger.error).toHaveBeenCalledWith(
        'Error getting local models:',
        error
      );
    });
  });

  describe('GET /available-models-cached', () => {
    it('should return cached models without fetching', async () => {
      const mockReq = createMockRequest();
      const mockRes = createMockResponse();
      const mockNext = createMockNext();

      const handler = getRouteHandler('get', '/available-models-cached');
      await handler(mockReq as Request, mockRes as Response, mockNext);

      // Wait for async operation
      await new Promise(resolve => setImmediate(resolve));

      expect(mockRes.json).toHaveBeenCalledWith(mockAvailableModels);
      expect(mockModelFetcher.getCachedModels).toHaveBeenCalledTimes(1);
    });

    it('should handle errors when getting cached models', async () => {
      const mockReq = createMockRequest();
      const mockRes = createMockResponse();
      const mockNext = createMockNext();

      mockModelFetcher.getCachedModels.mockImplementation(() => {
        throw new Error('Cache error');
      });

      const handler = getRouteHandler('get', '/available-models-cached');
      await handler(mockReq as Request, mockRes as Response, mockNext);

      // Wait for async operation
      await new Promise(resolve => setImmediate(resolve));

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to get cached models',
      });
    });
  });

  describe('POST /check-model-updates', () => {
    it('should update model data and trigger VRAM fetching for visible models', async () => {
      const modelIds = ['model1', 'model2'];
      const visibleModelIds = ['model1'];

      const mockReq = createMockRequest({}, { modelIds, visibleModelIds });
      const mockRes = createMockResponse();
      const mockNext = createMockNext();

      mockModelFetcher.getModelsById.mockReturnValueOnce([
        {
          ...mockAvailableModels[0],
          hasVramData: false,
          vramError: false,
          isFetchingVram: false,
          url: 'http://example.com',
        },
      ]);
      mockModelFetcher.getModelsById.mockReturnValueOnce(mockAvailableModels);
      mockModelFetcher.fetchVRAMDataForModels.mockResolvedValue(undefined);

      const handler = getRouteHandler('post', '/check-model-updates');
      await handler(mockReq as Request, mockRes as Response, mockNext);

      // Wait for async operation
      await new Promise(resolve => setImmediate(resolve));

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        models: mockAvailableModels,
      });
      expect(mockModelFetcher.fetchVRAMDataForModels).toHaveBeenCalled();
    });

    it('should validate modelIds is an array', async () => {
      const mockReq = createMockRequest({}, { modelIds: 'not-an-array' });
      const mockRes = createMockResponse();
      const mockNext = createMockNext();

      const handler = getRouteHandler('post', '/check-model-updates');
      await handler(mockReq as Request, mockRes as Response, mockNext);

      // Wait for async operation
      await new Promise(resolve => setImmediate(resolve));

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'modelIds must be an array',
      });
    });
  });

  describe('POST /open-models-directory', () => {
    it('should open models directory on macOS', async () => {
      const mockReq = createMockRequest();
      const mockRes = createMockResponse();
      const mockNext = createMockNext();

      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(exec).mockImplementation((cmd, callback) => {
        const cb = callback as ExecCallback;
        cb(null);
        return mockChildProcess as ReturnType<typeof exec>;
      });

      const handler = getRouteHandler('post', '/open-models-directory');
      await handler(mockReq as Request, mockRes as Response, mockNext);

      // Wait for async operation and exec callback
      await new Promise(resolve => setImmediate(resolve));

      expect(exec).toHaveBeenCalledWith(
        'open "/mock/models"',
        expect.any(Function)
      );
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        directory: '/mock/models',
      });
    });

    it('should open models directory on Windows', async () => {
      const mockReq = createMockRequest();
      const mockRes = createMockResponse();
      const mockNext = createMockNext();

      vi.mocked(os.platform).mockReturnValue('win32');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(exec).mockImplementation((cmd, callback) => {
        const cb = callback as ExecCallback;
        cb(null);
        return mockChildProcess as ReturnType<typeof exec>;
      });

      const handler = getRouteHandler('post', '/open-models-directory');
      await handler(mockReq as Request, mockRes as Response, mockNext);

      // Wait for async operation and exec callback
      await new Promise(resolve => setImmediate(resolve));

      expect(exec).toHaveBeenCalledWith(
        'explorer "/mock/models"',
        expect.any(Function)
      );
    });

    it('should create directory if it does not exist', async () => {
      const mockReq = createMockRequest();
      const mockRes = createMockResponse();
      const mockNext = createMockNext();

      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
      vi.mocked(exec).mockImplementation((cmd, callback) => {
        const cb = callback as ExecCallback;
        cb(null);
        return mockChildProcess as ReturnType<typeof exec>;
      });

      const handler = getRouteHandler('post', '/open-models-directory');
      await handler(mockReq as Request, mockRes as Response, mockNext);

      // Wait for async operation and exec callback
      await new Promise(resolve => setImmediate(resolve));

      expect(fs.mkdirSync).toHaveBeenCalledWith('/mock/models', {
        recursive: true,
      });
    });

    it('should handle exec errors', async () => {
      const mockReq = createMockRequest();
      const mockRes = createMockResponse();
      const mockNext = createMockNext();

      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(exec).mockImplementation((cmd, callback) => {
        const cb = callback as ExecCallback;
        cb(new Error('Command failed'));
        return mockChildProcess as ReturnType<typeof exec>;
      });

      const handler = getRouteHandler('post', '/open-models-directory');
      await handler(mockReq as Request, mockRes as Response, mockNext);

      // Wait for async operation and exec callback
      await new Promise(resolve => setImmediate(resolve));

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to open models directory',
      });
    });
  });

  describe('POST /hf-token', () => {
    it('should set Hugging Face token', async () => {
      const mockReq = createMockRequest({}, { token: 'hf_test_token' });
      const mockRes = createMockResponse();
      const mockNext = createMockNext();

      mockModelFetcher.setHuggingFaceToken.mockResolvedValue(undefined);

      const handler = getRouteHandler('post', '/hf-token');
      await handler(mockReq as Request, mockRes as Response, mockNext);

      // Wait for async operation
      await new Promise(resolve => setImmediate(resolve));

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Hugging Face token saved. Rechecking gated models...',
      });
      expect(mockModelFetcher.setHuggingFaceToken).toHaveBeenCalledWith(
        'hf_test_token'
      );
    });

    it('should validate token is provided', async () => {
      const mockReq = createMockRequest({}, {});
      const mockRes = createMockResponse();
      const mockNext = createMockNext();

      const handler = getRouteHandler('post', '/hf-token');
      await handler(mockReq as Request, mockRes as Response, mockNext);

      // Wait for async operation
      await new Promise(resolve => setImmediate(resolve));

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Token is required' });
    });
  });

  describe('POST /download', () => {
    it('should start model download', async () => {
      const mockReq = createMockRequest({}, mockDownloadInfo);
      const mockRes = createMockResponse();
      const mockNext = createMockNext();

      mockLLMManager.downloadModel.mockResolvedValue(undefined);

      const handler = getRouteHandler('post', '/download');
      await handler(mockReq as Request, mockRes as Response, mockNext);

      // Wait for async operation
      await new Promise(resolve => setImmediate(resolve));

      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Download started',
        filename: mockDownloadInfo.filename,
      });
      expect(mockLLMManager.downloadModel).toHaveBeenCalled();
    });

    it('should validate modelUrl and filename are provided', async () => {
      const mockReq = createMockRequest({}, { modelName: 'test' });
      const mockRes = createMockResponse();
      const mockNext = createMockNext();

      const handler = getRouteHandler('post', '/download');
      await handler(mockReq as Request, mockRes as Response, mockNext);

      // Wait for async operation
      await new Promise(resolve => setImmediate(resolve));

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Model URL and filename are required',
      });
    });
  });

  describe('DELETE /models/:modelId', () => {
    it('should delete model successfully', async () => {
      const mockReq = createMockRequest({ modelId: 'model123' });
      const mockRes = createMockResponse();
      const mockNext = createMockNext();

      mockLLMManager.deleteModel.mockResolvedValue(undefined);
      vi.mocked(modelSettingsManager.deleteModelSettings).mockResolvedValue(
        undefined
      );

      const handler = getRouteHandler('delete', '/models/:modelId');
      await handler(mockReq as Request, mockRes as Response, mockNext);

      // Wait for async operation
      await new Promise(resolve => setImmediate(resolve));

      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Model deleted successfully',
      });
      expect(mockLLMManager.deleteModel).toHaveBeenCalledWith('model123');
      expect(modelSettingsManager.deleteModelSettings).toHaveBeenCalledWith(
        'model123'
      );
    });
  });

  describe('POST /models/:modelId/load', () => {
    it('should load model successfully', async () => {
      const mockReq = createMockRequest({ modelId: 'model123' });
      const mockRes = createMockResponse();
      const mockNext = createMockNext();

      mockLLMManager.loadModel.mockResolvedValue(undefined);

      const handler = getRouteHandler('post', '/models/:modelId/load');
      await handler(mockReq as Request, mockRes as Response, mockNext);

      // Wait for async operation
      await new Promise(resolve => setImmediate(resolve));

      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Model loaded successfully',
      });
      expect(mockLLMManager.loadModel).toHaveBeenCalledWith('model123');
      expect(sseManager.broadcast).toHaveBeenCalledWith('unified-events', {
        type: 'models-updated',
        timestamp: expect.any(Number),
      });
    });
  });

  describe('POST /models/:modelId/generate', () => {
    it('should generate response', async () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];

      const mockReq = createMockRequest(
        { modelId: 'model123' },
        { messages, temperature: 0.7, maxTokens: 100 }
      );
      const mockRes = createMockResponse();
      const mockNext = createMockNext();

      mockLLMManager.generateResponse.mockResolvedValue('Generated response');

      const handler = getRouteHandler('post', '/models/:modelId/generate');
      await handler(mockReq as Request, mockRes as Response, mockNext);

      // Wait for async operation
      await new Promise(resolve => setImmediate(resolve));

      expect(mockRes.json).toHaveBeenCalledWith({
        response: 'Generated response',
      });
      expect(mockLLMManager.generateResponse).toHaveBeenCalledWith(
        'model123',
        messages,
        { temperature: 0.7, maxTokens: 100 }
      );
    });

    it('should validate messages array', async () => {
      const mockReq = createMockRequest(
        { modelId: 'model123' },
        { temperature: 0.7 }
      );
      const mockRes = createMockResponse();
      const mockNext = createMockNext();

      const handler = getRouteHandler('post', '/models/:modelId/generate');
      await handler(mockReq as Request, mockRes as Response, mockNext);

      // Wait for async operation
      await new Promise(resolve => setImmediate(resolve));

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Messages array is required',
      });
    });
  });

  describe('Integration Tests', () => {
    describe('Model Download Workflow', () => {
      it('should handle complete download workflow', async () => {
        const mockReq = createMockRequest({}, mockDownloadInfo);
        const mockRes = createMockResponse();
        const mockNext = createMockNext();

        // Mock download with progress callbacks
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

        // Wait for async operation
        await new Promise(resolve => setImmediate(resolve));

        expect(mockRes.json).toHaveBeenCalledWith({
          message: 'Download started',
          filename: mockDownloadInfo.filename,
        });

        // Check SSE broadcasts were called for progress
        expect(sseManager.broadcast).toHaveBeenCalledWith(
          'unified-events',
          expect.objectContaining({
            type: 'download-progress',
            data: expect.objectContaining({
              filename: mockDownloadInfo.filename,
              progress: expect.any(Number),
            }),
          })
        );
      });
    });

    describe('Model Management Workflow', () => {
      it('should handle load, generate, and unload workflow', async () => {
        // Load model
        let mockReq = createMockRequest({ modelId: 'model123' });
        let mockRes = createMockResponse();
        let mockNext = createMockNext();

        mockLLMManager.loadModel.mockResolvedValue(undefined);

        let handler = getRouteHandler('post', '/models/:modelId/load');
        await handler(mockReq as Request, mockRes as Response, mockNext);
        await new Promise(resolve => setImmediate(resolve));

        expect(mockRes.json).toHaveBeenCalledWith({
          message: 'Model loaded successfully',
        });

        // Generate response
        mockReq = createMockRequest(
          { modelId: 'model123' },
          { messages: [{ role: 'user', content: 'Test' }], temperature: 0.5 }
        );
        mockRes = createMockResponse();
        mockNext = createMockNext();

        mockLLMManager.generateResponse.mockResolvedValue('Test response');

        handler = getRouteHandler('post', '/models/:modelId/generate');
        await handler(mockReq as Request, mockRes as Response, mockNext);
        await new Promise(resolve => setImmediate(resolve));

        expect(mockRes.json).toHaveBeenCalledWith({
          response: 'Test response',
        });

        // Unload model
        mockReq = createMockRequest({ modelId: 'model123' });
        mockRes = createMockResponse();
        mockNext = createMockNext();

        mockLLMManager.unloadModel.mockResolvedValue(undefined);

        handler = getRouteHandler('post', '/models/:modelId/unload');
        await handler(mockReq as Request, mockRes as Response, mockNext);
        await new Promise(resolve => setImmediate(resolve));

        expect(mockRes.json).toHaveBeenCalledWith({
          message: 'Model unloaded successfully',
        });
      });
    });
  });
});
