/**
 * Tests for modelFetcher VRAM integration
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ModelFetcher } from '../modelFetcher';
import * as ggufVramCalculator from '../utils/ggufVramCalculator';
import * as sharedVramCalculator from '../../src/shared/vramCalculator';

// Mock the VRAM calculator modules
vi.mock('../utils/ggufVramCalculator', () => ({
  loadMetadataFromUrl: vi.fn(),
}));

vi.mock('../../src/shared/vramCalculator', () => ({
  calculateAllVRAMEstimates: vi.fn(),
}));

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
  dirname: vi.fn(path => path.substring(0, path.lastIndexOf('/'))),
}));

// Mock settingsDirectory
vi.mock('../utils/settingsDirectory', () => ({
  getMindstrikeDirectory: vi.fn(() => '/mock/mindstrike'),
}));

describe('ModelFetcher VRAM Integration', () => {
  let modelFetcher: ModelFetcher;

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();

    // Reset fetch mock
    global.fetch = vi.fn();

    // Create a new instance for each test
    modelFetcher = new ModelFetcher();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchVRAMData', () => {
    it('should fetch and calculate VRAM estimates for accessible models', async () => {
      // Mock metadata response
      const mockMetadata = {
        n_layers: 32,
        n_kv_heads: 8,
        embedding_dim: 4096,
        context_length: 16384,
        feed_forward_dim: 11008,
        model_size_mb: 4000,
      };

      vi.mocked(ggufVramCalculator.loadMetadataFromUrl).mockResolvedValue(
        mockMetadata
      );

      // Mock the shared VRAM calculator to return estimates
      vi.mocked(sharedVramCalculator.calculateAllVRAMEstimates).mockReturnValue(
        [
          {
            expected: 4200,
            conservative: 4620,
            config: {
              gpuLayers: 999,
              contextSize: 4096,
              cacheType: 'fp16',
              label: '4K context',
            },
          },
          {
            expected: 4400,
            conservative: 4840,
            config: {
              gpuLayers: 999,
              contextSize: 8192,
              cacheType: 'fp16',
              label: '8K context',
            },
          },
          {
            expected: 4600,
            conservative: 5060,
            config: {
              gpuLayers: 999,
              contextSize: 12288,
              cacheType: 'fp16',
              label: '12K context',
            },
          },
          {
            expected: 4800,
            conservative: 5280,
            config: {
              gpuLayers: 999,
              contextSize: 16384,
              cacheType: 'fp16',
              label: '16K context',
            },
          },
        ]
      );

      // Mock HuggingFace API responses
      global.fetch = vi
        .fn()
        // First call: Get trending models
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              id: 'test/model-accessible',
              downloads: 20000, // Above the 10k threshold
              tags: ['text-generation', 'gguf'],
              siblings: [{ rfilename: 'model-Q4_K_M.gguf', size: 4000000000 }],
            },
          ],
        } as Response)
        // Second call: Get model details
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'test/model-accessible',
            downloads: 20000,
            tags: ['text-generation', 'gguf'],
            gated: false,
            siblings: [{ rfilename: 'model-Q4_K_M.gguf', size: 4000000000 }],
          }),
        } as Response)
        // Third call: Check accessibility
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers(),
        } as Response);

      await modelFetcher.fetchPopularModels();
      let models = modelFetcher.getCachedModels();

      expect(models).toHaveLength(1);

      // Manually trigger VRAM data fetching for the model
      await modelFetcher.fetchVRAMDataForModels(models);

      // Wait a bit for the async queue processing to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get the updated models after VRAM data is fetched
      models = modelFetcher.getCachedModels();
      const model = models[0];

      // Check that VRAM data was successfully added
      expect(model.hasVramData).toBe(true);
      expect(model.vramEstimates).toBeDefined();
      expect(model.vramEstimates).toHaveLength(4);
      expect(model.modelArchitecture).toBeDefined();
      expect(model.modelArchitecture?.contextLength).toBe(16384);
    });

    it('should handle VRAM fetch errors gracefully', async () => {
      // Mock loadMetadataFromUrl to throw an error
      vi.mocked(ggufVramCalculator.loadMetadataFromUrl).mockRejectedValue(
        new Error('Failed to fetch metadata')
      );

      // Mock HuggingFace API responses
      global.fetch = vi
        .fn()
        // First call: Get list of models
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              id: 'test/model-error',
              downloads: 15000, // Above the 10k threshold
              tags: ['text-generation', 'gguf'],
              siblings: [{ rfilename: 'model-Q4_K_M.gguf', size: 4000000000 }],
            },
          ],
        } as Response)
        // Second call: Get model details
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'test/model-error',
            downloads: 15000,
            tags: ['text-generation', 'gguf'],
            gated: false,
            siblings: [{ rfilename: 'model-Q4_K_M.gguf', size: 4000000000 }],
          }),
        } as Response)
        // Third call: Check accessibility
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers(),
        } as Response);

      await modelFetcher.fetchPopularModels();
      let models = modelFetcher.getCachedModels();

      expect(models).toHaveLength(1);

      // Manually trigger VRAM data fetching for the model
      await modelFetcher.fetchVRAMDataForModels(models);

      // Wait a bit for the async queue processing to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get the updated models after VRAM data is fetched
      models = modelFetcher.getCachedModels();
      const model = models[0];

      // Check that loadMetadataFromUrl was called (should have tried to fetch VRAM data)
      expect(ggufVramCalculator.loadMetadataFromUrl).toHaveBeenCalled();

      // Check that VRAM data is not included when fetch fails
      // Note: vramError is not set because fetchVRAMData catches errors internally and returns null
      expect(model.hasVramData).toBe(false);
      expect(model.vramEstimates).toBeUndefined();
      expect(model.modelArchitecture).toBeUndefined();
      // vramError will be undefined since fetchVRAMData returns null on error, not throwing
    });

    it('should attempt VRAM calculation for all models including gated ones', async () => {
      // Mock HuggingFace API responses for gated model
      global.fetch = vi
        .fn()
        // First call: Get list of models
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              id: 'test/gated-model',
              downloads: 25000, // Above the 10k threshold
              tags: ['text-generation', 'gguf'],
              siblings: [{ rfilename: 'model-Q4_K_M.gguf', size: 4000000000 }],
            },
          ],
        } as Response)
        // Second call: Get model details - gated model
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'test/gated-model',
            downloads: 25000,
            tags: ['text-generation', 'gguf'],
            gated: true, // Gated model
            siblings: [{ rfilename: 'model-Q4_K_M.gguf', size: 4000000000 }],
          }),
        } as Response);

      await modelFetcher.fetchPopularModels();
      let models = modelFetcher.getCachedModels();

      expect(models).toHaveLength(1);

      // Manually trigger VRAM data fetching for the model
      await modelFetcher.fetchVRAMDataForModels(models);

      // Wait a bit for the async queue processing to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get the updated models after VRAM data is fetched
      models = modelFetcher.getCachedModels();
      const model = models[0];

      // Check that model is marked as gated
      expect(model.accessibility).toBe('gated');

      // With the new behavior, we now attempt to fetch VRAM data for all models
      // including gated ones, since many models incorrectly report as gated
      // but still provide accessible metadata
      expect(ggufVramCalculator.loadMetadataFromUrl).toHaveBeenCalled();
    });

    it('should calculate correct VRAM configurations', async () => {
      // Mock metadata response with 8192 context length for predictable test
      const mockMetadata = {
        n_layers: 48,
        n_kv_heads: 16,
        embedding_dim: 5120,
        context_length: 8192, // 8K context will generate 2K, 4K, 6K, 8K configurations
        feed_forward_dim: 13824,
        model_size_mb: 8000,
      };

      vi.mocked(ggufVramCalculator.loadMetadataFromUrl).mockResolvedValue(
        mockMetadata
      );

      // Mock VRAM calculations using the new shared calculator
      vi.mocked(sharedVramCalculator.calculateAllVRAMEstimates).mockReturnValue(
        [
          {
            expected: 8200,
            conservative: 9020,
            config: {
              gpuLayers: 999,
              contextSize: 2048,
              cacheType: 'fp16',
              label: '2K context',
            },
          },
          {
            expected: 8400,
            conservative: 9240,
            config: {
              gpuLayers: 999,
              contextSize: 4096,
              cacheType: 'fp16',
              label: '4K context',
            },
          },
          {
            expected: 8600,
            conservative: 9460,
            config: {
              gpuLayers: 999,
              contextSize: 6144,
              cacheType: 'fp16',
              label: '6K context',
            },
          },
          {
            expected: 8800,
            conservative: 9680,
            config: {
              gpuLayers: 999,
              contextSize: 8192,
              cacheType: 'fp16',
              label: '8K context',
            },
          },
        ]
      );

      // Mock HuggingFace API responses
      global.fetch = vi
        .fn()
        // First call: Get list of models
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              id: 'test/large-model',
              downloads: 50000, // Above the 10k threshold
              tags: ['text-generation', 'gguf'],
              siblings: [{ rfilename: 'model-Q5_K_M.gguf', size: 8000000000 }],
            },
          ],
        } as Response)
        // Second call: Get model details
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'test/large-model',
            downloads: 50000,
            tags: ['text-generation', 'gguf'],
            gated: false,
            siblings: [{ rfilename: 'model-Q5_K_M.gguf', size: 8000000000 }],
          }),
        } as Response)
        // Third call: Check accessibility
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers(),
        } as Response);

      await modelFetcher.fetchPopularModels();
      let models = modelFetcher.getCachedModels();

      expect(models).toHaveLength(1);

      // Manually trigger VRAM data fetching for the model
      await modelFetcher.fetchVRAMDataForModels(models);

      // Wait a bit for the async queue processing to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get the updated models after VRAM data is fetched
      models = modelFetcher.getCachedModels();
      const model = models[0];

      // Verify all 4 configurations are calculated
      expect(model.vramEstimates).toHaveLength(4);

      const configs = model.vramEstimates?.map(e => e.config.label) ?? [];
      // With 8192 context, we get quarters: 2K, 4K, 6K, 8K
      expect(configs).toContain('2K context');
      expect(configs).toContain('4K context');
      expect(configs).toContain('6K context');
      expect(configs).toContain('8K context');

      // Verify the shared calculator was called with correct architecture
      expect(
        sharedVramCalculator.calculateAllVRAMEstimates
      ).toHaveBeenCalledWith({
        layers: 48,
        kvHeads: 16,
        embeddingDim: 5120,
        contextLength: 8192,
        feedForwardDim: 13824,
        modelSizeMB: 8000,
      });
    });
  });

  describe('Model search with VRAM', () => {
    it('should be able to fetch VRAM data for search results', async () => {
      const mockMetadata = {
        n_layers: 32,
        n_kv_heads: 8,
        embedding_dim: 4096,
        context_length: 32768,
        feed_forward_dim: 11008,
        model_size_mb: 4000,
      };

      vi.mocked(ggufVramCalculator.loadMetadataFromUrl).mockResolvedValue(
        mockMetadata
      );
      vi.mocked(sharedVramCalculator.calculateAllVRAMEstimates).mockReturnValue(
        [
          {
            expected: 5000,
            conservative: 5500,
            config: {
              gpuLayers: 999,
              contextSize: 8192,
              cacheType: 'fp16',
              label: '8K context',
            },
          },
        ]
      );

      // Mock search API response
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              id: 'test/search-model',
              downloads: 8000, // Below typical threshold but included in search results
              tags: ['text-generation', 'gguf'],
              siblings: [{ rfilename: 'model-Q4_K_M.gguf', size: 4000000000 }],
            },
          ],
        } as Response)
        // Get model details
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'test/search-model',
            downloads: 8000,
            tags: ['text-generation', 'gguf'],
            gated: false,
            siblings: [{ rfilename: 'model-Q4_K_M.gguf', size: 4000000000 }],
          }),
        } as Response)
        // Check accessibility
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers(),
        } as Response);

      // Search for a specific model
      await modelFetcher.searchModels('search-model');
      let models = modelFetcher.getCachedModels();

      expect(models).toHaveLength(1);

      // Trigger VRAM fetch for search results
      await modelFetcher.fetchVRAMDataForModels(models);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check that VRAM fetch was attempted
      expect(ggufVramCalculator.loadMetadataFromUrl).toHaveBeenCalled();
    });
  });
});
