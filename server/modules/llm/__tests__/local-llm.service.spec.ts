import type { Mock } from 'vitest';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocalLlmService } from '../services/local-llm.service';
import type { SseService } from '../../events/services/sse.service';
import { SSEEventType } from '../../../../src/types';

// Mock the localLlmSingleton module at the top level
vi.mock('../../../../server/localLlmSingleton', () => ({
  getLocalLLMManager: vi.fn(),
}));

describe('LocalLlmService', () => {
  let service: LocalLlmService;
  let mockSseService: Partial<SseService>;
  let mockLlmManager: {
    loadModel: Mock;
    unloadModel: Mock;
    getModelStatus: Mock;
    getModelRuntimeInfo: Mock;
  };

  beforeEach(async () => {
    mockSseService = {
      broadcast: vi.fn(),
    };

    mockLlmManager = {
      loadModel: vi.fn(),
      unloadModel: vi.fn(),
      getModelStatus: vi.fn(),
      getModelRuntimeInfo: vi.fn(),
    };

    // Mock the getLocalLLMManager function
    const { getLocalLLMManager } = await import('../../../localLlmSingleton');
    (getLocalLLMManager as Mock).mockReturnValue(mockLlmManager);

    service = new LocalLlmService(mockSseService as SseService);
  });

  describe('loadModel', () => {
    it('should load model and broadcast update successfully', async () => {
      const modelId = 'test-model-id';

      mockLlmManager.loadModel.mockResolvedValue(undefined);

      const result = await service.loadModel(modelId);

      expect(result).toEqual({ message: 'Model loaded successfully' });
      expect(mockLlmManager.loadModel).toHaveBeenCalledWith(modelId);
      expect(mockSseService.broadcast).toHaveBeenCalledWith('unified-events', {
        type: SSEEventType.MODELS_UPDATED,
        timestamp: expect.any(Number),
      });
    });

    it('should throw error when model loading fails', async () => {
      const modelId = 'invalid-model';
      const error = new Error('Model not found');

      mockLlmManager.loadModel.mockRejectedValue(error);

      await expect(service.loadModel(modelId)).rejects.toThrow(
        'Model not found'
      );
      expect(mockLlmManager.loadModel).toHaveBeenCalledWith(modelId);
      expect(mockSseService.broadcast).not.toHaveBeenCalled();
    });
  });

  describe('unloadModel', () => {
    it('should unload model and broadcast update successfully', async () => {
      const modelId = 'test-model-id';

      mockLlmManager.unloadModel.mockResolvedValue(undefined);

      const result = await service.unloadModel(modelId);

      expect(result).toEqual({ message: 'Model unloaded successfully' });
      expect(mockLlmManager.unloadModel).toHaveBeenCalledWith(modelId);
      expect(mockSseService.broadcast).toHaveBeenCalledWith('unified-events', {
        type: SSEEventType.MODELS_UPDATED,
        timestamp: expect.any(Number),
      });
    });

    it('should throw error when model unloading fails', async () => {
      const modelId = 'test-model-id';
      const error = new Error('Failed to unload model');

      mockLlmManager.unloadModel.mockRejectedValue(error);

      await expect(service.unloadModel(modelId)).rejects.toThrow(
        'Failed to unload model'
      );
      expect(mockLlmManager.unloadModel).toHaveBeenCalledWith(modelId);
      expect(mockSseService.broadcast).not.toHaveBeenCalled();
    });
  });

  describe('getModelStatus', () => {
    it('should return model status with runtime info', async () => {
      const modelId = 'test-model-id';
      const mockStatus = {
        loaded: true,
        info: { id: 'test', name: 'Test Model' },
      };
      const mockRuntimeInfo = { memoryUsage: '512MB', gpuLayers: 10 };

      mockLlmManager.getModelStatus.mockResolvedValue(mockStatus);
      mockLlmManager.getModelRuntimeInfo.mockResolvedValue(mockRuntimeInfo);

      const result = await service.getModelStatus(modelId);

      expect(result).toEqual({
        ...mockStatus,
        runtimeInfo: mockRuntimeInfo,
      });
      expect(mockLlmManager.getModelStatus).toHaveBeenCalledWith(modelId);
      expect(mockLlmManager.getModelRuntimeInfo).toHaveBeenCalledWith(modelId);
    });

    it('should throw error when getting status fails', async () => {
      const modelId = 'invalid-model';
      const error = new Error('Model not found');

      mockLlmManager.getModelStatus.mockRejectedValue(error);

      await expect(service.getModelStatus(modelId)).rejects.toThrow(
        'Model not found'
      );
      expect(mockLlmManager.getModelStatus).toHaveBeenCalledWith(modelId);
    });
  });
});
