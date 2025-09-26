import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { ModelDiscoveryService } from '../model-discovery.service';
import type { DynamicModelInfo } from '../model-discovery.service';

// Mock file system
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

// Mock getMindstrikeDirectory
vi.mock('../../../../../server/utils/settingsDirectory', () => ({
  getMindstrikeDirectory: () => '/test/.mindstrike',
}));

// Mock ggufVramCalculator
vi.mock('../../../../../server/utils/ggufVramCalculator', () => ({
  loadMetadataFromUrl: vi.fn(),
}));

// Mock vramCalculator
vi.mock('../../../../../src/shared/vramCalculator', () => ({
  calculateAllVRAMEstimates: vi.fn().mockReturnValue([]),
}));

import * as fs from 'fs';

describe('ModelDiscoveryService', () => {
  let service: ModelDiscoveryService;
  let mockConfigService: Partial<ConfigService>;

  const createMockModel = (
    id: string,
    downloads: number
  ): DynamicModelInfo => ({
    modelId: id,
    name: `Model ${id}`,
    url: `http://example.com/${id}`,
    filename: `${id}.gguf`,
    size: 1000000,
    description: `Test model ${id}`,
    downloads,
    accessibility: 'accessible',
    huggingFaceUrl: `http://hf.co/${id}`,
    username: 'user1',
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfigService = {
      get: vi.fn(),
    };

    // Mock fs to not have cache file initially
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

    service = new ModelDiscoveryService(mockConfigService as ConfigService);
  });

  describe('getCachedModels', () => {
    it('should return empty array when no models cached', () => {
      const result = service.getCachedModels();
      expect(result).toEqual([]);
    });

    it('should load models from cache file if exists', () => {
      // Create new service with mocked cache file
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
        JSON.stringify({
          models: [
            createMockModel('model1', 100),
            createMockModel('model2', 200),
          ],
          timestamp: Date.now(),
        })
      );

      const serviceWithCache = new ModelDiscoveryService(
        mockConfigService as ConfigService
      );

      const result = serviceWithCache.getCachedModels();

      expect(result).toHaveLength(2);
      expect(result[0].modelId).toBe('model2'); // Higher downloads first
      expect(result[1].modelId).toBe('model1');
    });
  });

  describe('getModelsById', () => {
    it('should return models from cached data', async () => {
      // Setup service with cached data
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
        JSON.stringify({
          models: [createMockModel('model1', 100)],
          timestamp: Date.now(),
        })
      );

      const serviceWithCache = new ModelDiscoveryService(
        mockConfigService as ConfigService
      );

      const result = await serviceWithCache.getModelsById(['model1']);

      expect(result).toHaveLength(1);
      expect(result[0].modelId).toBe('model1');
    });

    it('should return empty array for non-existent models', async () => {
      const result = await service.getModelsById(['nonexistent']);
      expect(result).toEqual([]);
    });
  });

  describe('checkModelUpdates', () => {
    it('should check for updates based on dates', async () => {
      const modelWithDate: DynamicModelInfo = {
        ...createMockModel('model1', 100),
        updatedAt: '2024-01-15T00:00:00Z',
      };

      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
        JSON.stringify({
          models: [modelWithDate],
          timestamp: Date.now(),
        })
      );

      const serviceWithCache = new ModelDiscoveryService(
        mockConfigService as ConfigService
      );

      const result = await serviceWithCache.checkModelUpdates([
        { modelId: 'model1', downloadedAt: '2024-01-10T00:00:00Z' },
      ]);

      expect(result).toHaveLength(1);
      expect(result[0].modelId).toBe('model1');
      expect(result[0].hasUpdate).toBe(true);
      expect(result[0].latestDate).toBe('2024-01-15T00:00:00Z');
    });

    it('should return no update when model is up to date', async () => {
      const modelWithDate: DynamicModelInfo = {
        ...createMockModel('model1', 100),
        updatedAt: '2024-01-10T00:00:00Z',
      };

      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
        JSON.stringify({
          models: [modelWithDate],
          timestamp: Date.now(),
        })
      );

      const serviceWithCache = new ModelDiscoveryService(
        mockConfigService as ConfigService
      );

      const result = await serviceWithCache.checkModelUpdates([
        { modelId: 'model1', downloadedAt: '2024-01-15T00:00:00Z' },
      ]);

      expect(result).toHaveLength(1);
      expect(result[0].hasUpdate).toBe(false);
    });
  });

  describe('retryVramFetch', () => {
    it('should process models without VRAM data', async () => {
      const modelWithoutVram: DynamicModelInfo = {
        ...createMockModel('model1', 100),
        hasVramData: false,
      };

      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
        JSON.stringify({
          models: [modelWithoutVram],
          timestamp: Date.now(),
        })
      );

      const serviceWithCache = new ModelDiscoveryService(
        mockConfigService as ConfigService
      );

      await serviceWithCache.retryVramFetch();

      // If models need VRAM data, the cache should be saved after processing
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should skip models with existing VRAM data', async () => {
      const modelWithVram: DynamicModelInfo = {
        ...createMockModel('model1', 100),
        hasVramData: true,
      };

      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
        JSON.stringify({
          models: [modelWithVram],
          timestamp: Date.now(),
        })
      );

      const serviceWithCache = new ModelDiscoveryService(
        mockConfigService as ConfigService
      );

      // Track how many models we started with
      const cachedModels = serviceWithCache.getCachedModels();
      const initialModelCount = cachedModels.length;

      await serviceWithCache.retryVramFetch();

      // With VRAM data already present, no processing should occur
      // The model count should remain the same
      const afterRetryModels = serviceWithCache.getCachedModels();
      expect(afterRetryModels.length).toBe(initialModelCount);
      expect(afterRetryModels[0].hasVramData).toBe(true);
    });
  });

  describe('clearCache', () => {
    it('should clear all caches and save empty state', () => {
      // Setup service with cached data
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
        JSON.stringify({
          models: [createMockModel('model1', 100)],
          timestamp: Date.now(),
          searchCache: [['search1', ['model1']]],
        })
      );

      const serviceWithCache = new ModelDiscoveryService(
        mockConfigService as ConfigService
      );

      // Clear the cache
      serviceWithCache.clearCache();

      // Verify empty state
      const result = serviceWithCache.getCachedModels();
      expect(result).toEqual([]);

      // Verify save was called with empty data
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('available-models.json'),
        expect.stringContaining('"models": []')
      );
    });
  });

  describe('setHuggingFaceToken', () => {
    it('should set the HuggingFace token', () => {
      // We can't test private properties directly, but we can verify the method doesn't throw
      expect(() => service.setHuggingFaceToken('test-token')).not.toThrow();
    });

    it('should allow setting token to null', () => {
      expect(() => service.setHuggingFaceToken(null)).not.toThrow();
    });
  });

  describe('setProgressCallback', () => {
    it('should set progress callback', () => {
      const callback = vi.fn();
      expect(() => service.setProgressCallback(callback)).not.toThrow();
    });
  });
});
