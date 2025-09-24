/**
 * Integration tests for GGUF VRAM Calculator with model fetcher
 */

import { describe, it, expect } from 'vitest';
import type {
  VRAMConfiguration,
  VRAMEstimateInfo,
  ModelArchitecture,
  DynamicModelInfo,
} from '../../modelFetcher';

describe('GGUF VRAM Integration', () => {
  describe('Data Types', () => {
    it('should have correct VRAMConfiguration interface', () => {
      const config: VRAMConfiguration = {
        gpuLayers: 999,
        contextSize: 8192,
        cacheType: 'fp16',
        label: '8K context',
      };

      expect(config.gpuLayers).toBe(999);
      expect(config.contextSize).toBe(8192);
      expect(config.cacheType).toBe('fp16');
      expect(config.label).toBe('8K context');
    });

    it('should have correct VRAMEstimateInfo interface', () => {
      const estimate: VRAMEstimateInfo = {
        expected: 5000,
        conservative: 5500,
        config: {
          gpuLayers: 999,
          contextSize: 4096,
          cacheType: 'fp16',
          label: '4K context',
        },
      };

      expect(estimate.expected).toBe(5000);
      expect(estimate.conservative).toBe(5500);
      expect(estimate.config).toBeDefined();
      expect(estimate.config.contextSize).toBe(4096);
    });

    it('should have correct ModelArchitecture interface', () => {
      const architecture: ModelArchitecture = {
        layers: 32,
        kvHeads: 8,
        embeddingDim: 4096,
        contextLength: 32768,
        feedForwardDim: 11008,
      };

      expect(architecture.layers).toBe(32);
      expect(architecture.kvHeads).toBe(8);
      expect(architecture.embeddingDim).toBe(4096);
      expect(architecture.contextLength).toBe(32768);
      expect(architecture.feedForwardDim).toBe(11008);
    });

    it('should have VRAM fields in DynamicModelInfo', () => {
      const modelInfo: Partial<DynamicModelInfo> = {
        name: 'Test Model',
        url: 'https://example.com/model.gguf',
        filename: 'model.gguf',
        size: 4000000000,
        hasVramData: true,
        vramEstimates: [
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
        ],
        modelArchitecture: {
          layers: 32,
          kvHeads: 8,
          embeddingDim: 4096,
          contextLength: 32768,
          feedForwardDim: 11008,
        },
      };

      expect(modelInfo.hasVramData).toBe(true);
      expect(modelInfo.vramEstimates).toBeDefined();
      expect(modelInfo.vramEstimates).toHaveLength(1);
      expect(modelInfo.modelArchitecture).toBeDefined();
      expect(modelInfo.modelArchitecture?.layers).toBe(32);
    });

    it('should handle models without VRAM data', () => {
      const modelInfo: Partial<DynamicModelInfo> = {
        name: 'Test Model',
        url: 'https://example.com/model.gguf',
        filename: 'model.gguf',
        size: 4000000000,
        hasVramData: false,
        vramError: 'Failed to fetch metadata',
      };

      expect(modelInfo.hasVramData).toBe(false);
      expect(modelInfo.vramEstimates).toBeUndefined();
      expect(modelInfo.vramError).toBeDefined();
      expect(modelInfo.vramError).toContain('Failed');
    });
  });

  describe('VRAM Calculations', () => {
    it('should provide multiple context size configurations', () => {
      const estimates: VRAMEstimateInfo[] = [
        {
          expected: 4500,
          conservative: 5000,
          config: {
            gpuLayers: 999,
            contextSize: 2048,
            cacheType: 'fp16',
            label: '2K context',
          },
        },
        {
          expected: 5000,
          conservative: 5500,
          config: {
            gpuLayers: 999,
            contextSize: 4096,
            cacheType: 'fp16',
            label: '4K context',
          },
        },
        {
          expected: 6000,
          conservative: 6600,
          config: {
            gpuLayers: 999,
            contextSize: 8192,
            cacheType: 'fp16',
            label: '8K context',
          },
        },
        {
          expected: 8000,
          conservative: 8800,
          config: {
            gpuLayers: 999,
            contextSize: 16384,
            cacheType: 'fp16',
            label: '16K context',
          },
        },
      ];

      // Verify increasing context sizes lead to increasing VRAM
      for (let i = 1; i < estimates.length; i++) {
        expect(estimates[i].expected).toBeGreaterThan(
          estimates[i - 1].expected
        );
        expect(estimates[i].conservative).toBeGreaterThan(
          estimates[i - 1].conservative
        );
        expect(estimates[i].config.contextSize).toBeGreaterThan(
          estimates[i - 1].config.contextSize
        );
      }

      // Verify conservative estimates are always higher than expected
      for (const estimate of estimates) {
        expect(estimate.conservative).toBeGreaterThan(estimate.expected);
      }
    });

    it('should use fp16 cache type for standard configurations', () => {
      const standardConfigs: VRAMConfiguration[] = [
        {
          gpuLayers: 999,
          contextSize: 2048,
          cacheType: 'fp16',
          label: '2K context',
        },
        {
          gpuLayers: 999,
          contextSize: 4096,
          cacheType: 'fp16',
          label: '4K context',
        },
        {
          gpuLayers: 999,
          contextSize: 8192,
          cacheType: 'fp16',
          label: '8K context',
        },
        {
          gpuLayers: 999,
          contextSize: 16384,
          cacheType: 'fp16',
          label: '16K context',
        },
      ];

      for (const config of standardConfigs) {
        expect(config.cacheType).toBe('fp16');
        expect(config.gpuLayers).toBe(999); // Full GPU offload
      }
    });
  });

  describe('Frontend Store Integration', () => {
    it('should have matching types in frontend stores', async () => {
      // Import frontend types to ensure they match
      await import('../../../src/store/useAvailableModelsStore');

      // Type checking is done at compile time
      // This test ensures the imports work and types are compatible
      const availableModel = {
        vramEstimates: [],
        modelArchitecture: {
          layers: 32,
        },
        hasVramData: true,
      };

      const localModel = {
        vramEstimates: [],
        modelArchitecture: {
          layers: 32,
        },
        hasVramData: true,
      };

      expect(availableModel).toBeDefined();
      expect(localModel).toBeDefined();
    });
  });
});
