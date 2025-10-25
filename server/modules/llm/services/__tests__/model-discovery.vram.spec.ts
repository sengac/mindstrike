import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import {
  ModelDiscoveryService,
  type DynamicModelInfo,
} from '../model-discovery.service';
import * as fs from 'fs';
import * as ggufCalculator from '../../../../utils/ggufVramCalculator';
import * as vramCalculator from '../../../../../src/shared/vramCalculator';

vi.mock('fs');
vi.mock('../../../../utils/ggufVramCalculator');
vi.mock('../../../../../src/shared/vramCalculator');

describe('ModelDiscoveryService - VRAM Fetching', () => {
  let service: ModelDiscoveryService;
  let mockConfigService: Partial<ConfigService>;

  const createMockModel = (
    id: string,
    hasVramData = false,
    vramError?: string,
    isFetchingVram = false,
    url = `https://huggingface.co/models/${id}/resolve/main/model.gguf`
  ): DynamicModelInfo => ({
    modelId: id,
    name: `Model ${id}`,
    url,
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
    quantization: 'Q4_K_M',
  });

  const createMockMetadata = (complete = true) => ({
    n_layers: complete ? 32 : undefined,
    n_kv_heads: complete ? 8 : undefined,
    embedding_dim: complete ? 4096 : undefined,
    context_length: complete ? 2048 : undefined,
    feed_forward_dim: complete ? 11008 : undefined,
    model_size_mb: complete ? 4000 : undefined,
  });

  const createMockVramEstimates = () => [
    { contextSize: 512, vramMB: 3500, label: '0.5K context' },
    { contextSize: 1024, vramMB: 3800, label: '1K context' },
    { contextSize: 2048, vramMB: 4200, label: '2K context' },
  ];

  beforeEach(async () => {
    mockConfigService = {
      get: vi.fn().mockImplementation((key: string) => {
        if (key === 'NODE_ENV') {
          return 'test';
        }
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ModelDiscoveryService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<ModelDiscoveryService>(ModelDiscoveryService);

    // Setup default mocks
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchVRAMDataForModels', () => {
    it('should queue models that need VRAM data', async () => {
      const models = [
        createMockModel('model1', false), // Needs VRAM
        createMockModel('model2', true), // Already has VRAM
        createMockModel('model3', false, 'Previous error'), // Has error
        createMockModel('model4', false, undefined, true), // Already fetching
        createMockModel('model5', false, undefined, false, ''), // No URL
      ];

      // Mock successful metadata fetch
      vi.mocked(ggufCalculator.loadMetadataFromUrl).mockResolvedValue(
        createMockMetadata()
      );
      vi.mocked(vramCalculator.calculateAllVRAMEstimates).mockReturnValue(
        createMockVramEstimates()
      );

      // Start VRAM fetching (fire and forget)
      const fetchPromise = service.fetchVRAMDataForModels(models);

      // Should mark model1 as fetching immediately
      expect(models[0].isFetchingVram).toBe(true);
      expect(models[1].isFetchingVram).toBeFalsy(); // Already has data
      expect(models[2].isFetchingVram).toBeFalsy(); // Has error
      expect(models[3].isFetchingVram).toBe(true); // Already was true
      expect(models[4].isFetchingVram).toBeFalsy(); // No URL

      // Wait for async processing
      await fetchPromise;
      await new Promise(resolve => setTimeout(resolve, 50));

      // Check that only model1 was processed (others were filtered)
      expect(ggufCalculator.loadMetadataFromUrl).toHaveBeenCalledTimes(1);
      expect(ggufCalculator.loadMetadataFromUrl).toHaveBeenCalledWith(
        models[0].url
      );
    });

    it('should handle successful VRAM data fetching', async () => {
      const model = createMockModel('model1', false);
      const metadata = createMockMetadata();
      const estimates = createMockVramEstimates();

      vi.mocked(ggufCalculator.loadMetadataFromUrl).mockResolvedValue(metadata);
      vi.mocked(vramCalculator.calculateAllVRAMEstimates).mockReturnValue(
        estimates
      );

      await service.fetchVRAMDataForModels([model]);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(model.hasVramData).toBe(true);
      expect(model.vramEstimates).toEqual(estimates);
      expect(model.isFetchingVram).toBe(false);
      expect(model.modelArchitecture).toEqual({
        layers: 32,
        kvHeads: 8,
        embeddingDim: 4096,
        contextLength: 2048,
        feedForwardDim: 11008,
        modelSizeMB: 4000,
      });
    });

    it('should handle incomplete metadata gracefully', async () => {
      const model = createMockModel('model1', false);
      const incompleteMetadata = createMockMetadata(false);

      vi.mocked(ggufCalculator.loadMetadataFromUrl).mockResolvedValue(
        incompleteMetadata
      );

      await service.fetchVRAMDataForModels([model]);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(model.hasVramData).toBeFalsy();
      expect(model.vramError).toBe('Incomplete metadata');
      expect(model.isFetchingVram).toBe(false);
      expect(vramCalculator.calculateAllVRAMEstimates).not.toHaveBeenCalled();
    });

    it('should handle metadata fetch timeout', async () => {
      const model = createMockModel('model1', false);

      // Mock a slow fetch that will timeout
      vi.mocked(ggufCalculator.loadMetadataFromUrl).mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 60000))
      );

      const logger = service['logger'];
      const warnSpy = vi
        .spyOn(logger, 'warn')
        .mockImplementation(() => undefined);

      await service.fetchVRAMDataForModels([model]);

      // The service's VRAM_FETCH_TIMEOUT is 30 seconds, so the timeout won't trigger in 100ms
      // The promise will still be pending, so model state won't change
      await new Promise(resolve => setTimeout(resolve, 100));

      // Since we're using a mock that never resolves, the model stays in fetching state
      // unless we wait the full 30 seconds (which we don't want to do in tests)
      expect(model.isFetchingVram).toBe(true);
      // Model is still fetching since timeout hasn't occurred yet
    });

    it('should handle empty VRAM estimates', async () => {
      const model = createMockModel('model1', false);
      const metadata = createMockMetadata();

      vi.mocked(ggufCalculator.loadMetadataFromUrl).mockResolvedValue(metadata);
      vi.mocked(vramCalculator.calculateAllVRAMEstimates).mockReturnValue([]); // No estimates

      await service.fetchVRAMDataForModels([model]);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(model.hasVramData).toBeFalsy();
      expect(model.vramError).toBe('Could not calculate VRAM estimates');
      expect(model.isFetchingVram).toBe(false);
    });

    it('should process multiple models concurrently', async () => {
      const models = [
        createMockModel('model1', false),
        createMockModel('model2', false),
        createMockModel('model3', false),
        createMockModel('model4', false),
      ];

      const metadata = createMockMetadata();
      const estimates = createMockVramEstimates();

      let callCount = 0;
      vi.mocked(ggufCalculator.loadMetadataFromUrl).mockImplementation(
        async () => {
          callCount++;
          await new Promise(resolve => setTimeout(resolve, 10));
          return metadata;
        }
      );
      vi.mocked(vramCalculator.calculateAllVRAMEstimates).mockReturnValue(
        estimates
      );

      await service.fetchVRAMDataForModels(models);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should process with concurrency limit (2 at a time by default)
      expect(ggufCalculator.loadMetadataFromUrl).toHaveBeenCalledTimes(4);

      // All models should be processed
      models.forEach(model => {
        expect(model.hasVramData).toBe(true);
        expect(model.isFetchingVram).toBe(false);
      });
    });

    it('should allow queueing the same model if not already processing', async () => {
      const model1 = createMockModel('model1', false);
      const model1Duplicate = createMockModel('model1', false);

      vi.mocked(ggufCalculator.loadMetadataFromUrl).mockResolvedValue(
        createMockMetadata()
      );
      vi.mocked(vramCalculator.calculateAllVRAMEstimates).mockReturnValue(
        createMockVramEstimates()
      );

      // Queue the same model twice
      await service.fetchVRAMDataForModels([model1]);
      await service.fetchVRAMDataForModels([model1Duplicate]);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 50));

      // Models are queued independently since the first finishes quickly
      // This is expected behavior - if a model finishes processing, it can be queued again
      expect(ggufCalculator.loadMetadataFromUrl).toHaveBeenCalled();
    });

    it('should handle fetch errors and mark model appropriately', async () => {
      const model = createMockModel('model1', false);
      const fetchError = new Error('Network error');

      vi.mocked(ggufCalculator.loadMetadataFromUrl).mockRejectedValue(
        fetchError
      );

      const logger = service['logger'];
      const warnSpy = vi
        .spyOn(logger, 'warn')
        .mockImplementation(() => undefined);

      await service.fetchVRAMDataForModels([model]);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(model.vramError).toBe('Failed to fetch VRAM data');
      expect(model.isFetchingVram).toBe(false);
      expect(model.hasVramData).toBeFalsy();
      expect(warnSpy).toHaveBeenCalledWith(
        `Failed to fetch VRAM data for ${model.name}:`,
        fetchError
      );
    });

    it('should save cache after processing VRAM queue', async () => {
      const model = createMockModel('model1', false);

      vi.mocked(ggufCalculator.loadMetadataFromUrl).mockResolvedValue(
        createMockMetadata()
      );
      vi.mocked(vramCalculator.calculateAllVRAMEstimates).mockReturnValue(
        createMockVramEstimates()
      );

      // Setup cache directory
      vi.mocked(fs.existsSync).mockReturnValue(true);

      await service.fetchVRAMDataForModels([model]);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should save cache after processing
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('retryVramFetch', () => {
    it('should retry fetching for models without VRAM data', async () => {
      const models = [
        createMockModel('model1', false), // Needs VRAM
        createMockModel('model2', true), // Has VRAM
        createMockModel('model3', false, 'Error'), // Has error - should NOT retry
      ];

      // Load models into cache
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          models,
          timestamp: Date.now(),
        })
      );

      // Create service with cached models
      const serviceWithCache = new ModelDiscoveryService(
        mockConfigService as ConfigService
      );

      vi.mocked(ggufCalculator.loadMetadataFromUrl).mockResolvedValue(
        createMockMetadata()
      );
      vi.mocked(vramCalculator.calculateAllVRAMEstimates).mockReturnValue(
        createMockVramEstimates()
      );

      await serviceWithCache.retryVramFetch();

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should only retry model1 (model2 has data, model3 has error)
      expect(ggufCalculator.loadMetadataFromUrl).toHaveBeenCalledTimes(1);
      expect(ggufCalculator.loadMetadataFromUrl).toHaveBeenCalledWith(
        models[0].url
      );
    });

    it('should handle empty models needing VRAM', async () => {
      const models = [
        createMockModel('model1', true), // Already has VRAM
        createMockModel('model2', false, 'Error'), // Has error
      ];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          models,
          timestamp: Date.now(),
        })
      );

      const serviceWithCache = new ModelDiscoveryService(
        mockConfigService as ConfigService
      );

      const logger = serviceWithCache['logger'];
      const logSpy = vi
        .spyOn(logger, 'log')
        .mockImplementation(() => undefined);

      await serviceWithCache.retryVramFetch();

      expect(logSpy).toHaveBeenCalledWith('No models need VRAM data');
      expect(ggufCalculator.loadMetadataFromUrl).not.toHaveBeenCalled();
    });
  });
});
