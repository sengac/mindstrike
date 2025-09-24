import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalLLMOrchestrator } from '../localLlmOrchestrator.js';
import { logger } from '../../logger.js';
import type {
  LocalModelInfo,
  ModelDownloadInfo,
  ModelLoadingSettings,
} from '../../localLlmManager.js';
import type { DynamicModelInfo } from '../../modelFetcher.js';
import {
  TEST_VALUES,
  DEFAULT_MODEL_PARAMS,
  GPU_LAYERS,
  PROGRESS,
} from '../constants.js';

// Mock the logger
vi.mock('../../logger.js');

// Mock all llama dependencies
vi.mock('../../sharedLlamaInstance.js', () => ({
  getLlama: vi.fn().mockResolvedValue({
    createModel: vi.fn(),
  }),
}));

// Mock node-llama-cpp
vi.mock('node-llama-cpp', () => ({
  getLlama: vi.fn(),
  LlamaChatSession: vi.fn(),
  LlamaContext: vi.fn(),
}));

describe('LocalLLMOrchestrator', () => {
  let orchestrator: LocalLLMOrchestrator;

  const mockModelInfo: LocalModelInfo = {
    id: 'test-model-1',
    name: 'Test Model',
    filename: 'test-model.gguf',
    path: '/path/to/test-model.gguf',
    size: TEST_VALUES.SMALL_FILE_SIZE,
    downloaded: true,
    downloading: false,
    contextLength: DEFAULT_MODEL_PARAMS.CONTEXT_SIZE,
    quantization: 'Q4_K_M',
    layerCount: TEST_VALUES.TEST_LAYER_COUNT,
    parameterCount: '7B',
  };

  const mockSettings: ModelLoadingSettings = {
    contextSize: DEFAULT_MODEL_PARAMS.CONTEXT_SIZE,
    batchSize: DEFAULT_MODEL_PARAMS.BATCH_SIZE,
    gpuLayers: TEST_VALUES.TEST_GPU_LAYERS,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Create orchestrator
    orchestrator = new LocalLLMOrchestrator();
  });

  describe('constructor', () => {
    it('should initialize and log info', () => {
      expect(logger.info).toHaveBeenCalledWith(
        'LocalLLMOrchestrator initialized'
      );
    });
  });

  describe('Model Discovery Operations', () => {
    describe('getLocalModels', () => {
      it('should return local models', async () => {
        const mockModels = [mockModelInfo];

        // Spy on the internal modelDiscovery service
        const getLocalModelsSpy = vi.spyOn(
          orchestrator['modelDiscovery'],
          'getLocalModels'
        );
        getLocalModelsSpy.mockResolvedValue(mockModels);

        const result = await orchestrator.getLocalModels();

        expect(getLocalModelsSpy).toHaveBeenCalled();
        expect(result).toEqual(mockModels);
      });
    });

    describe('getAvailableModels', () => {
      it('should return available models', async () => {
        const mockAvailableModels = {
          local: [mockModelInfo],
          remote: [],
        };

        const getAvailableModelsSpy = vi.spyOn(
          orchestrator['modelDiscovery'],
          'getAvailableModels'
        );
        getAvailableModelsSpy.mockResolvedValue(mockAvailableModels);

        const result = await orchestrator.getAvailableModels();

        expect(getAvailableModelsSpy).toHaveBeenCalled();
        expect(result).toEqual(mockAvailableModels);
      });
    });

    describe('searchModels', () => {
      it('should search models with query', async () => {
        const query = 'llama';
        const mockSearchResults = { local: [], remote: [] };

        const searchModelsSpy = vi.spyOn(
          orchestrator['modelDiscovery'],
          'searchModels'
        );
        searchModelsSpy.mockResolvedValue(mockSearchResults);

        const result = await orchestrator.searchModels(query);

        expect(searchModelsSpy).toHaveBeenCalledWith(query);
        expect(result).toEqual(mockSearchResults);
      });
    });

    describe('downloadModel', () => {
      it('should download model with progress callback', async () => {
        const modelDownloadInfo: ModelDownloadInfo = {
          name: 'test-model',
          filename: 'test.gguf',
          url: 'https://example.com/test.gguf',
          size: TEST_VALUES.SMALL_FILE_SIZE,
          description: 'Test model for download',
        };
        const onProgress = vi.fn();

        const downloadModelSpy = vi.spyOn(
          orchestrator['modelDiscovery'],
          'downloadModel'
        );
        downloadModelSpy.mockResolvedValue(undefined);

        await orchestrator.downloadModel(modelDownloadInfo, onProgress);

        expect(downloadModelSpy).toHaveBeenCalledWith(
          modelDownloadInfo,
          onProgress
        );
      });

      it('should handle DynamicModelInfo', async () => {
        const dynamicModelInfo: DynamicModelInfo = {
          name: 'dynamic-model',
          filename: 'dynamic.gguf',
          url: 'https://example.com/dynamic.gguf',
          size: TEST_VALUES.MEDIUM_FILE_SIZE,
          description: 'Dynamic model test',
          downloads: TEST_VALUES.DOWNLOADS_COUNT,
          modelId: 'test/dynamic-model',
          accessibility: 'accessible',
          huggingFaceUrl: 'https://huggingface.co/test/dynamic-model',
          username: 'test',
          quantization: 'Q4_K_M',
          parameterCount: '7B',
        };

        const downloadModelSpy = vi.spyOn(
          orchestrator['modelDiscovery'],
          'downloadModel'
        );
        downloadModelSpy.mockResolvedValue(undefined);

        await orchestrator.downloadModel(dynamicModelInfo);

        expect(downloadModelSpy).toHaveBeenCalledWith(
          dynamicModelInfo,
          undefined
        );
      });
    });

    describe('cancelDownload', () => {
      it('should cancel download', () => {
        const filename = 'test.gguf';

        const cancelDownloadSpy = vi.spyOn(
          orchestrator['modelDiscovery'],
          'cancelDownload'
        );
        cancelDownloadSpy.mockReturnValue(true);

        const result = orchestrator.cancelDownload(filename);

        expect(cancelDownloadSpy).toHaveBeenCalledWith(filename);
        expect(result).toBe(true);
      });
    });

    describe('getDownloadProgress', () => {
      it('should get download progress', () => {
        const filename = 'test.gguf';
        const mockProgress = {
          progress: TEST_VALUES.HALF_PROGRESS,
          speed: '1.5 MB/s',
        };

        const getDownloadProgressSpy = vi.spyOn(
          orchestrator['modelDiscovery'],
          'getDownloadProgress'
        );
        getDownloadProgressSpy.mockReturnValue(mockProgress);

        const result = orchestrator.getDownloadProgress(filename);

        expect(getDownloadProgressSpy).toHaveBeenCalledWith(filename);
        expect(result).toEqual(mockProgress);
      });
    });

    describe('deleteModel', () => {
      it('should prepare model for deletion then delete it', async () => {
        const modelId = 'test-model-1';

        const prepareModelSpy = vi.spyOn(
          orchestrator['modelLoader'],
          'prepareModelForDeletion'
        );
        const deleteModelSpy = vi.spyOn(
          orchestrator['modelDiscovery'],
          'deleteModel'
        );

        prepareModelSpy.mockResolvedValue(undefined);
        deleteModelSpy.mockResolvedValue(undefined);

        await orchestrator.deleteModel(modelId);

        expect(prepareModelSpy).toHaveBeenCalledWith(modelId);
        expect(deleteModelSpy).toHaveBeenCalledWith(modelId);
      });
    });
  });

  describe('Model Settings Operations', () => {
    describe('setModelSettings', () => {
      it('should set model settings', async () => {
        const modelId = 'test-model-1';

        const setModelSettingsSpy = vi.spyOn(
          orchestrator['modelSettings'],
          'setModelSettings'
        );
        setModelSettingsSpy.mockResolvedValue(undefined);

        await orchestrator.setModelSettings(modelId, mockSettings);

        expect(setModelSettingsSpy).toHaveBeenCalledWith(modelId, mockSettings);
      });
    });

    describe('calculateOptimalSettings', () => {
      it('should calculate optimal settings with defaults', async () => {
        const modelId = 'test-model-1';

        const calculateOptimalSettingsSpy = vi.spyOn(
          orchestrator['modelSettings'],
          'calculateOptimalSettings'
        );
        calculateOptimalSettingsSpy.mockResolvedValue(mockSettings);

        const result = await orchestrator.calculateOptimalSettings(modelId);

        expect(calculateOptimalSettingsSpy).toHaveBeenCalledWith(modelId, {});
        expect(result).toEqual(mockSettings);
      });

      it('should pass user settings', async () => {
        const modelId = 'test-model-1';
        const userSettings = { gpuLayers: 32 };

        const calculateOptimalSettingsSpy = vi.spyOn(
          orchestrator['modelSettings'],
          'calculateOptimalSettings'
        );
        calculateOptimalSettingsSpy.mockResolvedValue(mockSettings);

        const result = await orchestrator.calculateOptimalSettings(
          modelId,
          userSettings
        );

        expect(calculateOptimalSettingsSpy).toHaveBeenCalledWith(
          modelId,
          userSettings
        );
        expect(result).toEqual(mockSettings);
      });
    });

    describe('getModelSettings', () => {
      it('should get model settings', async () => {
        const modelId = 'test-model-1';

        const getModelSettingsSpy = vi.spyOn(
          orchestrator['modelSettings'],
          'getModelSettings'
        );
        getModelSettingsSpy.mockResolvedValue(mockSettings);

        const result = await orchestrator.getModelSettings(modelId);

        expect(getModelSettingsSpy).toHaveBeenCalledWith(modelId);
        expect(result).toEqual(mockSettings);
      });
    });

    describe('getModelRuntimeInfo', () => {
      it('should get model runtime info', () => {
        const modelId = 'test-model-1';
        const mockRuntimeInfo = {
          actualGpuLayers: 16,
          gpuType: 'NVIDIA',
          memoryUsage: {
            vramUsedMB: 1024,
            vramTotalMB: 8192,
            vramPercent: 12.5,
          },
          loadingTime: 1500,
        };

        const getModelRuntimeInfoSpy = vi.spyOn(
          orchestrator['modelSettings'],
          'getModelRuntimeInfo'
        );
        getModelRuntimeInfoSpy.mockReturnValue(mockRuntimeInfo);

        const result = orchestrator.getModelRuntimeInfo(modelId);

        expect(getModelRuntimeInfoSpy).toHaveBeenCalledWith(modelId);
        expect(result).toEqual(mockRuntimeInfo);
      });
    });

    describe('clearContextSizeCache', () => {
      it('should clear context size cache', () => {
        const clearContextSizeCacheSpy = vi.spyOn(
          orchestrator['modelSettings'],
          'clearContextSizeCache'
        );
        clearContextSizeCacheSpy.mockReturnValue(undefined);

        orchestrator.clearContextSizeCache();

        expect(clearContextSizeCacheSpy).toHaveBeenCalled();
      });
    });
  });

  describe('Model Loading Operations', () => {
    describe('loadModel', () => {
      it('should load model with thread ID', async () => {
        const modelId = 'test-model-1';
        const threadId = 'thread-123';

        const loadModelSpy = vi.spyOn(orchestrator['modelLoader'], 'loadModel');
        loadModelSpy.mockResolvedValue(undefined);

        await orchestrator.loadModel(modelId, threadId);

        expect(loadModelSpy).toHaveBeenCalledWith(modelId, threadId);
      });

      it('should load model without thread ID', async () => {
        const modelId = 'test-model-1';

        const loadModelSpy = vi.spyOn(orchestrator['modelLoader'], 'loadModel');
        loadModelSpy.mockResolvedValue(undefined);

        await orchestrator.loadModel(modelId);

        expect(loadModelSpy).toHaveBeenCalledWith(modelId, undefined);
      });
    });

    describe('unloadModel', () => {
      it('should unload model', async () => {
        const modelId = 'test-model-1';

        const unloadModelSpy = vi.spyOn(
          orchestrator['modelLoader'],
          'unloadModel'
        );
        unloadModelSpy.mockResolvedValue(undefined);

        await orchestrator.unloadModel(modelId);

        expect(unloadModelSpy).toHaveBeenCalledWith(modelId);
      });
    });
  });

  describe('Response Generation Operations', () => {
    describe('updateSessionHistory', () => {
      it('should update session history', async () => {
        const modelId = 'test-model-1';
        const threadId = 'thread-123';

        const updateSessionHistorySpy = vi.spyOn(
          orchestrator['responseService'],
          'updateSessionHistory'
        );
        updateSessionHistorySpy.mockResolvedValue(undefined);

        await orchestrator.updateSessionHistory(modelId, threadId);

        expect(updateSessionHistorySpy).toHaveBeenCalledWith(modelId, threadId);
      });
    });

    describe('generateResponse', () => {
      it('should generate response with default options', async () => {
        const modelId = 'test-model-1';
        const messages = [{ role: 'user', content: 'Hello' }];
        const mockResponse = 'Hello! How can I help you?';

        const generateResponseSpy = vi.spyOn(
          orchestrator['responseService'],
          'generateResponse'
        );
        generateResponseSpy.mockResolvedValue(mockResponse);

        const result = await orchestrator.generateResponse(modelId, messages);

        expect(generateResponseSpy).toHaveBeenCalledWith(
          modelId,
          messages,
          undefined
        );
        expect(result).toBe(mockResponse);
      });

      it('should pass options to response service', async () => {
        const modelId = 'test-model-1';
        const messages = [{ role: 'user', content: 'Hello' }];
        const options = {
          temperature: 0.7,
          maxTokens: 1000,
          threadId: 'thread-123',
          disableFunctions: true,
          disableChatHistory: false,
          signal: new AbortController().signal,
        };
        const mockResponse = 'Hello! How can I help you?';

        const generateResponseSpy = vi.spyOn(
          orchestrator['responseService'],
          'generateResponse'
        );
        generateResponseSpy.mockResolvedValue(mockResponse);

        const result = await orchestrator.generateResponse(
          modelId,
          messages,
          options
        );

        expect(generateResponseSpy).toHaveBeenCalledWith(
          modelId,
          messages,
          options
        );
        expect(result).toBe(mockResponse);
      });
    });

    describe('generateStreamResponse', () => {
      it('should generate streaming response', async () => {
        const modelId = 'test-model-1';
        const messages = [{ role: 'user', content: 'Hello' }];
        const mockGenerator = (async function* () {
          yield 'Hello';
          yield '!';
        })();

        const generateStreamResponseSpy = vi.spyOn(
          orchestrator['responseService'],
          'generateStreamResponse'
        );
        generateStreamResponseSpy.mockReturnValue(mockGenerator);

        const generator = orchestrator.generateStreamResponse(
          modelId,
          messages
        );
        const results = [];
        for await (const chunk of generator) {
          results.push(chunk);
        }

        expect(generateStreamResponseSpy).toHaveBeenCalledWith(
          modelId,
          messages,
          undefined
        );
        expect(results).toEqual(['Hello', '!']);
      });

      it('should pass streaming options', async () => {
        const modelId = 'test-model-1';
        const messages = [{ role: 'user', content: 'Hello' }];
        const options = {
          temperature: 0.7,
          maxTokens: 1000,
          threadId: 'thread-123',
        };
        const mockGenerator = (async function* () {
          yield 'Response';
        })();

        const generateStreamResponseSpy = vi.spyOn(
          orchestrator['responseService'],
          'generateStreamResponse'
        );
        generateStreamResponseSpy.mockReturnValue(mockGenerator);

        const generator = orchestrator.generateStreamResponse(
          modelId,
          messages,
          options
        );
        const results = [];
        for await (const chunk of generator) {
          results.push(chunk);
        }

        expect(generateStreamResponseSpy).toHaveBeenCalledWith(
          modelId,
          messages,
          options
        );
        expect(results).toEqual(['Response']);
      });
    });

    describe('getModelStatus', () => {
      it('should get model status', async () => {
        const modelId = 'test-model-1';
        const mockStatus = { loaded: true, loading: false };

        const getModelStatusSpy = vi.spyOn(
          orchestrator['responseService'],
          'getModelStatus'
        );
        getModelStatusSpy.mockResolvedValue(mockStatus);

        const result = await orchestrator.getModelStatus(modelId);

        expect(getModelStatusSpy).toHaveBeenCalledWith(modelId);
        expect(result).toEqual(mockStatus);
      });
    });
  });
});
