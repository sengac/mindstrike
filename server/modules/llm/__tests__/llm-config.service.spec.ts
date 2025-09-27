import type { Mock } from 'vitest';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { LlmConfigService } from '../services/llm-config.service';

// Mock all external dependencies
vi.mock('../../../llmConfigManager');
vi.mock('../../../llmScanner');
vi.mock('../../../localLlmSingleton');
vi.mock('../../../sseManager');
vi.mock('../../../../src/types');

describe('LlmConfigService', () => {
  let service: LlmConfigService;
  let mockGetModels: Mock;
  let mockGetDefaultModel: Mock;
  let mockSetDefaultModel: Mock;
  let mockRefreshModels: Mock;
  let mockGetCustomServices: Mock;
  let mockAddCustomService: Mock;
  let mockRemoveCustomService: Mock;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup mocks for LLMConfigManager
    mockGetModels = vi.fn();
    mockGetDefaultModel = vi.fn();
    mockSetDefaultModel = vi.fn();
    mockRefreshModels = vi.fn();
    mockGetCustomServices = vi.fn();
    mockAddCustomService = vi.fn();
    mockRemoveCustomService = vi.fn();

    const { LLMConfigManager } = await import('../../../llmConfigManager');
    vi.mocked(LLMConfigManager).mockImplementation(
      () =>
        ({
          getModels: mockGetModels,
          getDefaultModel: mockGetDefaultModel,
          setDefaultModel: mockSetDefaultModel,
          refreshModels: mockRefreshModels,
          getCustomServices: mockGetCustomServices,
          addCustomService: mockAddCustomService,
          removeCustomService: mockRemoveCustomService,
          testService: vi.fn(),
        }) as unknown
    );

    // Setup mock for SSEEventType
    const types = await import('../../../../src/types');
    Object.defineProperty(types, 'SSEEventType', {
      value: {
        MODELS_UPDATED: 'models-updated',
      },
      writable: true,
    });

    service = new LlmConfigService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getModels', () => {
    it('should return models from LLMConfigManager', async () => {
      const mockModels = [
        { id: 'model-1', name: 'Model 1' },
        { id: 'model-2', name: 'Model 2' },
      ];

      mockGetModels.mockResolvedValue(mockModels);

      const result = await service.getModels();

      expect(result).toEqual(mockModels);
      expect(mockGetModels).toHaveBeenCalled();
    });

    it('should throw error when getModels fails', async () => {
      const error = new Error('Failed to get models');
      mockGetModels.mockRejectedValue(error);

      await expect(service.getModels()).rejects.toThrow('Failed to get models');
    });
  });

  describe('getDefaultModel', () => {
    it('should return default model from LLMConfigManager', async () => {
      const mockDefaultModel = { id: 'default-model', name: 'Default Model' };
      mockGetDefaultModel.mockResolvedValue(mockDefaultModel);

      const result = await service.getDefaultModel();

      expect(result).toEqual(mockDefaultModel);
      expect(mockGetDefaultModel).toHaveBeenCalled();
    });

    it('should return null when no default model is set', async () => {
      mockGetDefaultModel.mockResolvedValue(null);

      const result = await service.getDefaultModel();

      expect(result).toBeNull();
    });
  });

  describe('setDefaultModel', () => {
    it('should set default model using LLMConfigManager', async () => {
      const modelId = 'new-default-model';
      mockSetDefaultModel.mockResolvedValue(undefined);

      await service.setDefaultModel(modelId);

      expect(mockSetDefaultModel).toHaveBeenCalledWith(modelId);
    });

    it('should throw error when setting default model fails', async () => {
      const modelId = 'invalid-model';
      const error = new Error('Model not found');
      mockSetDefaultModel.mockRejectedValue(error);

      await expect(service.setDefaultModel(modelId)).rejects.toThrow(
        'Model not found'
      );
    });
  });

  describe('rescanServices', () => {
    it('should rescan services and auto-add new services', async () => {
      // Mock the dynamic imports
      const { LLMScanner } = await import('../../../llmScanner');
      vi.mocked(LLMScanner).mockImplementation(
        () =>
          ({
            rescanServices: vi.fn().mockResolvedValue([
              {
                id: 'ollama',
                name: 'Ollama',
                baseURL: 'http://localhost:11434',
                type: 'ollama',
                available: true,
                models: ['llama2'],
              },
              {
                id: 'vllm',
                name: 'vLLM',
                baseURL: 'http://localhost:8000',
                type: 'vllm',
                available: false,
                models: [],
              },
            ]),
          }) as unknown
      );

      const { getLocalLLMManager } = await import('../../../localLlmSingleton');
      vi.mocked(getLocalLLMManager).mockReturnValue({
        getLocalModels: vi
          .fn()
          .mockResolvedValue([{ id: 'local-model-1', name: 'Local Model 1' }]),
      } as unknown);

      const { sseManager } = await import('../../../sseManager');
      vi.mocked(sseManager).broadcast = vi.fn();

      mockGetCustomServices.mockResolvedValue([]);
      mockAddCustomService.mockResolvedValue({
        id: 'new-service',
        name: 'Ollama',
        baseURL: 'http://localhost:11434',
      });
      mockRefreshModels.mockResolvedValue(undefined);

      const result = await service.rescanServices();

      expect(result.scannedServices).toHaveLength(2);
      expect(result.addedServices).toBeDefined();
      expect(mockRefreshModels).toHaveBeenCalled();
    });

    it('should remove unavailable services', async () => {
      const { LLMScanner } = await import('../../../llmScanner');
      vi.mocked(LLMScanner).mockImplementation(
        () =>
          ({
            rescanServices: vi.fn().mockResolvedValue([]),
          }) as unknown
      );

      const { getLocalLLMManager } = await import('../../../localLlmSingleton');
      vi.mocked(getLocalLLMManager).mockReturnValue({
        getLocalModels: vi.fn().mockResolvedValue([]),
      } as unknown);

      const { sseManager } = await import('../../../sseManager');
      vi.mocked(sseManager).broadcast = vi.fn();

      mockGetCustomServices.mockResolvedValue([
        {
          id: 'old-service',
          name: 'Old Service',
          baseURL: 'http://localhost:9999',
          type: 'ollama',
        },
      ]);
      mockRemoveCustomService.mockResolvedValue(undefined);
      mockRefreshModels.mockResolvedValue(undefined);

      const result = await service.rescanServices();

      expect(result.scannedServices).toHaveLength(0);
      expect(result.removedServices).toBeDefined();
      expect(mockRemoveCustomService).toHaveBeenCalledWith('old-service');
    });

    it('should handle errors gracefully when local LLM manager is not available', async () => {
      const { LLMScanner } = await import('../../../llmScanner');
      vi.mocked(LLMScanner).mockImplementation(
        () =>
          ({
            rescanServices: vi.fn().mockResolvedValue([]),
          }) as unknown
      );

      const { getLocalLLMManager } = await import('../../../localLlmSingleton');
      vi.mocked(getLocalLLMManager).mockImplementation(() => {
        throw new Error('Manager not available');
      });

      const { sseManager } = await import('../../../sseManager');
      vi.mocked(sseManager).broadcast = vi.fn();

      mockGetCustomServices.mockResolvedValue([]);
      mockRefreshModels.mockResolvedValue(undefined);

      const result = await service.rescanServices();

      expect(result.scannedServices).toHaveLength(0);
      // Should continue despite local LLM manager error
      expect(mockRefreshModels).toHaveBeenCalled();
    });
  });

  describe('getCustomServices', () => {
    it('should return custom services from LLMConfigManager', async () => {
      const mockServices = [
        { id: 'service-1', name: 'Service 1' },
        { id: 'service-2', name: 'Service 2' },
      ];

      mockGetCustomServices.mockResolvedValue(mockServices);

      const result = await service.getCustomServices();

      expect(result).toEqual(mockServices);
      expect(mockGetCustomServices).toHaveBeenCalled();
    });
  });

  describe('addCustomService', () => {
    it('should add custom service using LLMConfigManager', async () => {
      const newService = {
        name: 'New Service',
        baseURL: 'http://localhost:3000',
        type: 'openai-compatible' as const,
      };

      const addedService = { id: 'new-id', ...newService };
      mockAddCustomService.mockResolvedValue(addedService);

      const result = await service.addCustomService(newService);

      expect(result).toEqual(addedService);
      expect(mockAddCustomService).toHaveBeenCalledWith(newService);
    });
  });

  describe('removeCustomService', () => {
    it('should remove custom service using LLMConfigManager', async () => {
      const serviceId = 'service-to-remove';
      mockRemoveCustomService.mockResolvedValue(undefined);

      await service.removeCustomService(serviceId);

      expect(mockRemoveCustomService).toHaveBeenCalledWith(serviceId);
    });
  });
});
