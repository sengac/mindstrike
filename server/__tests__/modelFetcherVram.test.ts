/**
 * Tests for modelFetcher VRAM integration
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ModelFetcher } from '../modelFetcher';
import * as ggufVramCalculator from '../utils/ggufVramCalculator';

// Mock the VRAM calculator module
vi.mock('../utils/ggufVramCalculator', () => ({
  loadMetadataFromUrl: vi.fn(),
  calculateVRAMEstimate: vi.fn(),
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

// Mock getMindstrikeDirectory
vi.mock('../utils/settingsDirectory', () => ({
  getMindstrikeDirectory: vi.fn(() => '/tmp/mindstrike'),
}));

describe('ModelFetcher VRAM Integration', () => {
  let modelFetcher: ModelFetcher;

  beforeEach(() => {
    vi.clearAllMocks();
    // Create a new instance but don't initialize from file cache
    modelFetcher = new ModelFetcher();
    // Clear the internal cache
    modelFetcher.clearCache();
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
        context_length: 32768,
        feed_forward_dim: 11008,
        model_size_mb: 4000,
      };

      vi.mocked(ggufVramCalculator.loadMetadataFromUrl).mockResolvedValue(
        mockMetadata
      );
      vi.mocked(ggufVramCalculator.calculateVRAMEstimate).mockImplementation(
        (metadata, gpuLayers, contextSize) => ({
          expected: 4000 + contextSize * 0.5, // Simple mock calculation
          conservative: 4500 + contextSize * 0.5,
        })
      );

      // Mock HuggingFace API responses
      global.fetch = vi
        .fn()
        // First call: Get list of models
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              id: 'test/model',
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
            id: 'test/model',
            downloads: 20000,
            tags: ['text-generation', 'gguf'],
            gated: false,
            siblings: [{ rfilename: 'model-Q4_K_M.gguf', size: 4000000000 }],
          }),
        } as Response)
        // Third call: Check accessibility (HEAD request)
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers(),
        } as Response);

      await modelFetcher.fetchPopularModels();
      const models = modelFetcher.getCachedModels();

      expect(models).toHaveLength(1);
      const model = models[0];

      // Check that VRAM data is included
      expect(model.hasVramData).toBe(true);
      expect(model.vramEstimates).toBeDefined();
      expect(model.vramEstimates).toHaveLength(4); // 4 standard configs
      expect(model.modelArchitecture).toBeDefined();
      expect(model.modelArchitecture?.layers).toBe(32);
      expect(model.modelArchitecture?.kvHeads).toBe(8);

      // Check VRAM estimates
      const estimate2K = model.vramEstimates?.find(
        e => e.config.label === '2K context'
      );
      expect(estimate2K).toBeDefined();
      expect(estimate2K?.expected).toBeGreaterThan(0);
      expect(estimate2K?.conservative).toBeGreaterThan(
        estimate2K?.expected ?? 0
      );
    });

    it('should handle VRAM fetch errors gracefully', async () => {
      // Mock metadata fetch failure
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
      const models = modelFetcher.getCachedModels();

      expect(models).toHaveLength(1);
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

    it('should skip VRAM calculation for inaccessible models', async () => {
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
      const models = modelFetcher.getCachedModels();

      expect(models).toHaveLength(1);
      const model = models[0];

      // Check that VRAM data is not included for gated models
      expect(model.hasVramData).toBe(false);
      expect(model.vramEstimates).toBeUndefined();
      expect(model.accessibility).toBe('gated');

      // Ensure VRAM calculator was not called
      expect(ggufVramCalculator.loadMetadataFromUrl).not.toHaveBeenCalled();
    });

    it('should calculate correct VRAM configurations', async () => {
      // Mock metadata response
      const mockMetadata = {
        n_layers: 48,
        n_kv_heads: 16,
        embedding_dim: 5120,
        context_length: 32768,
        feed_forward_dim: 13824,
        model_size_mb: 8000,
      };

      vi.mocked(ggufVramCalculator.loadMetadataFromUrl).mockResolvedValue(
        mockMetadata
      );

      // Mock realistic VRAM calculations
      vi.mocked(ggufVramCalculator.calculateVRAMEstimate).mockImplementation(
        (metadata, gpuLayers, contextSize, cacheType) => {
          const baseVram = 8000;
          const contextMultiplier = cacheType === 'fp16' ? 1.0 : 0.5;
          const vram = baseVram + contextSize * contextMultiplier * 0.1;
          return {
            expected: Math.round(vram),
            conservative: Math.round(vram * 1.1),
          };
        }
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
      const models = modelFetcher.getCachedModels();

      expect(models).toHaveLength(1);
      const model = models[0];

      // Verify all 4 configurations are calculated
      expect(model.vramEstimates).toHaveLength(4);

      const configs = model.vramEstimates?.map(e => e.config.label) ?? [];
      expect(configs).toContain('2K context');
      expect(configs).toContain('4K context');
      expect(configs).toContain('8K context');
      expect(configs).toContain('16K context');

      // Verify calculations were called with correct parameters
      expect(ggufVramCalculator.calculateVRAMEstimate).toHaveBeenCalledTimes(4);
      expect(ggufVramCalculator.calculateVRAMEstimate).toHaveBeenCalledWith(
        mockMetadata,
        999,
        2048,
        'fp16'
      );
      expect(ggufVramCalculator.calculateVRAMEstimate).toHaveBeenCalledWith(
        mockMetadata,
        999,
        8192,
        'fp16'
      );
    });
  });

  describe('Model search with VRAM', () => {
    it('should include VRAM data in search results', async () => {
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
      vi.mocked(ggufVramCalculator.calculateVRAMEstimate).mockReturnValue({
        expected: 5000,
        conservative: 5500,
      });

      // Mock search API response
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            id: 'searched/model',
            downloads: 1500,
            tags: ['text-generation', 'gguf'],
            siblings: [{ rfilename: 'model-Q4_K_M.gguf', size: 4000000000 }],
          },
        ],
      } as Response);

      // Mock model details API
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              id: 'searched/model',
              downloads: 1500,
              tags: ['text-generation', 'gguf'],
              siblings: [{ rfilename: 'model-Q4_K_M.gguf', size: 4000000000 }],
            },
          ],
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'searched/model',
            downloads: 1500,
            tags: ['text-generation', 'gguf'],
            gated: false,
            siblings: [{ rfilename: 'model-Q4_K_M.gguf', size: 4000000000 }],
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers(),
        } as Response);

      const results = await modelFetcher.searchModels('test');

      expect(results).toHaveLength(1);
      expect(results[0].hasVramData).toBe(true);
      expect(results[0].vramEstimates).toBeDefined();
      expect(results[0].modelArchitecture).toBeDefined();
    });
  });
});
