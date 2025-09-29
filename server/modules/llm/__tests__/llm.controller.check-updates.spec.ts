import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, Logger } from '@nestjs/common';
import { LlmController } from '../llm.controller';
import { LlmService } from '../services/llm.service';
import { ModelDiscoveryService } from '../services/model-discovery.service';
import { ModelDownloadService } from '../services/model-download.service';
import { LocalLlmService } from '../services/local-llm.service';
import type { DynamicModelInfo } from '../services/model-discovery.service';

describe('LlmController - Check Model Updates', () => {
  let controller: LlmController;
  let discoveryService: ModelDiscoveryService;
  let logger: Logger;

  const createMockModel = (
    id: string,
    hasVramData = false,
    vramError?: string,
    isFetchingVram = false
  ): DynamicModelInfo => ({
    modelId: id,
    name: `Model ${id}`,
    url: `https://huggingface.co/models/${id}`,
    filename: `${id}.gguf`,
    size: 1000000,
    description: `Test model ${id}`,
    downloads: 100,
    accessibility: 'accessible',
    huggingFaceUrl: `https://huggingface.co/models/${id}`,
    username: 'test-user',
    hasVramData,
    vramError,
    isFetchingVram,
  });

  beforeEach(async () => {
    // Create mock services
    const mockDiscoveryService = {
      getModelsById: vi.fn(),
      fetchVRAMDataForModels: vi.fn(),
      getCachedModels: vi.fn(),
      checkModelUpdates: vi.fn(),
      retryVramFetch: vi.fn(),
    };

    const mockLlmService = {
      getLocalModels: vi.fn(),
      getAvailableModels: vi.fn(),
    };

    const mockDownloadService = {
      downloadModel: vi.fn(),
      cancelDownload: vi.fn(),
    };

    const mockLocalLlmService = {
      getLocalModels: vi.fn(),
      getAvailableModels: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LlmController],
      providers: [
        {
          provide: LlmService,
          useValue: mockLlmService,
        },
        {
          provide: ModelDiscoveryService,
          useValue: mockDiscoveryService,
        },
        {
          provide: ModelDownloadService,
          useValue: mockDownloadService,
        },
        {
          provide: LocalLlmService,
          useValue: mockLocalLlmService,
        },
      ],
    }).compile();

    controller = module.get<LlmController>(LlmController);
    discoveryService = module.get<ModelDiscoveryService>(ModelDiscoveryService);

    // The controller has private properties injected via constructor
    // We need to ensure they're properly set
    controller['discoveryService'] = discoveryService;

    logger = controller['logger'];
    vi.spyOn(logger, 'log').mockImplementation(() => undefined);
    vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('checkModelUpdates', () => {
    it('should throw BadRequestException if modelIds is not an array', async () => {
      // Test invalid input by creating a body that runtime validation should catch
      // In a real request, this could happen if client sends malformed JSON
      const invalidBody: { modelIds: string[]; visibleModelIds?: string[] } = {
        modelIds: JSON.parse('"not-an-array"'), // Simulates malformed JSON parsing
      };

      await expect(controller.checkModelUpdates(invalidBody)).rejects.toThrow(
        BadRequestException
      );
    });

    it('should return models without triggering VRAM fetch when no visibleModelIds provided', async () => {
      const mockModels = [
        createMockModel('model1', true),
        createMockModel('model2', false),
      ];

      vi.mocked(discoveryService.getModelsById).mockResolvedValue(mockModels);

      const result = await controller.checkModelUpdates({
        modelIds: ['model1', 'model2'],
      });

      expect(discoveryService.getModelsById).toHaveBeenCalledWith([
        'model1',
        'model2',
      ]);
      expect(discoveryService.fetchVRAMDataForModels).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        models: mockModels,
      });
    });

    it('should trigger VRAM fetch for visible models that need it', async () => {
      const visibleModels = [
        createMockModel('model1', true), // Already has VRAM data
        createMockModel('model2', false), // Needs VRAM data
        createMockModel('model3', false, 'Previous error'), // Has error
        createMockModel('model4', false, undefined, true), // Already fetching
        createMockModel('model5', false), // Needs VRAM data
      ];

      const allModels = [
        ...visibleModels,
        createMockModel('model6', false), // Not visible
      ];

      vi.mocked(discoveryService.getModelsById)
        .mockResolvedValueOnce(visibleModels) // For visible models
        .mockResolvedValueOnce(allModels); // For all models

      vi.mocked(discoveryService.fetchVRAMDataForModels).mockResolvedValue(
        undefined
      );

      const result = await controller.checkModelUpdates({
        modelIds: ['model1', 'model2', 'model3', 'model4', 'model5', 'model6'],
        visibleModelIds: ['model1', 'model2', 'model3', 'model4', 'model5'],
      });

      // Should fetch visible models first
      expect(discoveryService.getModelsById).toHaveBeenNthCalledWith(1, [
        'model1',
        'model2',
        'model3',
        'model4',
        'model5',
      ]);

      // Should only queue models that need VRAM (model2 and model5)
      expect(discoveryService.fetchVRAMDataForModels).toHaveBeenCalledWith([
        visibleModels[1], // model2
        visibleModels[4], // model5
      ]);

      // Should return all requested models
      expect(discoveryService.getModelsById).toHaveBeenNthCalledWith(2, [
        'model1',
        'model2',
        'model3',
        'model4',
        'model5',
        'model6',
      ]);

      expect(result).toEqual({
        success: true,
        models: allModels,
      });

      expect(logger.log).toHaveBeenCalledWith(
        'Queueing VRAM fetch for 2 visible models'
      );
    });

    it('should not trigger VRAM fetch when no visible models need it', async () => {
      const visibleModels = [
        createMockModel('model1', true), // Already has VRAM data
        createMockModel('model2', false, 'Error'), // Has error
        createMockModel('model3', false, undefined, true), // Already fetching
      ];

      vi.mocked(discoveryService.getModelsById)
        .mockResolvedValueOnce(visibleModels)
        .mockResolvedValueOnce(visibleModels);

      const result = await controller.checkModelUpdates({
        modelIds: ['model1', 'model2', 'model3'],
        visibleModelIds: ['model1', 'model2', 'model3'],
      });

      expect(discoveryService.fetchVRAMDataForModels).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        models: visibleModels,
      });
    });

    it('should handle empty visibleModelIds array', async () => {
      const mockModels = [createMockModel('model1', false)];

      vi.mocked(discoveryService.getModelsById).mockResolvedValue(mockModels);

      const result = await controller.checkModelUpdates({
        modelIds: ['model1'],
        visibleModelIds: [],
      });

      expect(discoveryService.fetchVRAMDataForModels).not.toHaveBeenCalled();
      expect(discoveryService.getModelsById).toHaveBeenCalledTimes(1);
      expect(discoveryService.getModelsById).toHaveBeenCalledWith(['model1']);
      expect(result).toEqual({
        success: true,
        models: mockModels,
      });
    });

    it('should handle VRAM fetch errors gracefully', async () => {
      const visibleModels = [
        createMockModel('model1', false), // Needs VRAM data
      ];

      vi.mocked(discoveryService.getModelsById)
        .mockResolvedValueOnce(visibleModels)
        .mockResolvedValueOnce(visibleModels);

      const fetchError = new Error('VRAM fetch failed');
      vi.mocked(discoveryService.fetchVRAMDataForModels).mockRejectedValue(
        fetchError
      );

      const result = await controller.checkModelUpdates({
        modelIds: ['model1'],
        visibleModelIds: ['model1'],
      });

      // Should still return models even if VRAM fetch fails (fire-and-forget)
      expect(result).toEqual({
        success: true,
        models: visibleModels,
      });

      // Wait for the async error handler
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(logger.error).toHaveBeenCalledWith(
        'Error queuing VRAM fetch:',
        fetchError
      );
    });

    it('should filter models without URLs from VRAM fetching', async () => {
      const visibleModels = [
        { ...createMockModel('model1', false), url: '' }, // No URL
        createMockModel('model2', false), // Has URL
        { ...createMockModel('model3', false), url: undefined }, // No URL
      ];

      vi.mocked(discoveryService.getModelsById)
        .mockResolvedValueOnce(visibleModels)
        .mockResolvedValueOnce(visibleModels);

      vi.mocked(discoveryService.fetchVRAMDataForModels).mockResolvedValue(
        undefined
      );

      await controller.checkModelUpdates({
        modelIds: ['model1', 'model2', 'model3'],
        visibleModelIds: ['model1', 'model2', 'model3'],
      });

      // Should only queue model2 which has a URL
      expect(discoveryService.fetchVRAMDataForModels).toHaveBeenCalledWith([
        visibleModels[1],
      ]);
    });

    it('should handle large numbers of models efficiently', async () => {
      const visibleModelIds = Array.from(
        { length: 100 },
        (_, i) => `model${i}`
      );
      const allModelIds = Array.from({ length: 200 }, (_, i) => `model${i}`);

      const visibleModels = visibleModelIds.map(
        (id, i) => createMockModel(id, i % 3 === 0) // Every 3rd model has VRAM data
      );

      const allModels = allModelIds.map((id, i) =>
        createMockModel(id, i % 3 === 0)
      );

      vi.mocked(discoveryService.getModelsById)
        .mockResolvedValueOnce(visibleModels)
        .mockResolvedValueOnce(allModels);

      vi.mocked(discoveryService.fetchVRAMDataForModels).mockResolvedValue(
        undefined
      );

      const result = await controller.checkModelUpdates({
        modelIds: allModelIds,
        visibleModelIds: visibleModelIds,
      });

      // Should queue ~67 models that need VRAM
      const expectedModelsNeedingVram = visibleModels.filter(
        m => !m.hasVramData && !m.vramError && !m.isFetchingVram && m.url
      );
      expect(discoveryService.fetchVRAMDataForModels).toHaveBeenCalledWith(
        expectedModelsNeedingVram
      );

      expect(result.success).toBe(true);
      expect(result.models).toHaveLength(200);
    });

    it('should properly pass through different model states', async () => {
      const models = [
        {
          ...createMockModel('model1', true),
          vramEstimates: [{ config: '4K', vram: 4000 }],
          modelArchitecture: {
            layers: 32,
            kvHeads: 8,
            embeddingDim: 4096,
          },
        },
        {
          ...createMockModel('model2', false, 'Timeout'),
        },
        {
          ...createMockModel('model3', false, undefined, true),
        },
      ];

      vi.mocked(discoveryService.getModelsById).mockResolvedValue(models);

      const result = await controller.checkModelUpdates({
        modelIds: ['model1', 'model2', 'model3'],
      });

      expect(result.models).toEqual(models);
      expect(result.models[0].vramEstimates).toBeDefined();
      expect(result.models[0].modelArchitecture).toBeDefined();
      expect(result.models[1].vramError).toBe('Timeout');
      expect(result.models[2].isFetchingVram).toBe(true);
    });
  });
});
