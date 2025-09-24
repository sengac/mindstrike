/**
 * Unit test for GGUF VRAM Calculator with mocked HuggingFace models
 * Tests VRAM calculation logic without making actual network calls
 */

import { describe, it, expect } from 'vitest';
import {
  calculateVRAMEstimate,
  type GGUFMetadata,
  type CacheType,
} from '../ggufVramCalculator.js';

describe('GGUF VRAM Calculator - Mocked HuggingFace Models', () => {
  // Mock metadata for different model architectures
  const mockModelMetadata: Record<string, GGUFMetadata> = {
    'llama-8b': {
      n_layers: 32,
      n_kv_heads: 8,
      embedding_dim: 4096,
      context_length: 8192,
      feed_forward_dim: 14336,
      model_size_mb: 4920,
      loaded: true,
      model_name: 'Meta-Llama-3-8B-Instruct',
    },
    'mistral-7b': {
      n_layers: 32,
      n_kv_heads: 8,
      embedding_dim: 4096,
      context_length: 32768,
      feed_forward_dim: 14336,
      model_size_mb: 5130,
      loaded: true,
      model_name: 'Mistral-7B-Instruct-v0.2',
    },
    'qwen-7b': {
      n_layers: 32,
      n_kv_heads: 4,
      embedding_dim: 4096,
      context_length: 32768,
      feed_forward_dim: 11008,
      model_size_mb: 4400,
      loaded: true,
      model_name: 'Qwen2-7B-Instruct',
    },
    'phi-3-mini': {
      n_layers: 32,
      n_kv_heads: 32,
      embedding_dim: 3072,
      context_length: 4096,
      feed_forward_dim: 8192,
      model_size_mb: 4060,
      loaded: true,
      model_name: 'Phi-3-mini-4k-instruct',
    },
    'llama-70b': {
      n_layers: 80,
      n_kv_heads: 8,
      embedding_dim: 8192,
      context_length: 8192,
      feed_forward_dim: 28672,
      model_size_mb: 38900,
      loaded: true,
      model_name: 'Llama-2-70B-chat',
    },
  };

  it('should calculate VRAM for various model architectures', () => {
    const testConfigs: Array<{
      gpuLayers: number;
      ctxSize: number;
      cacheType: CacheType;
      label: string;
    }> = [
      {
        gpuLayers: 999,
        ctxSize: 2048,
        cacheType: 'fp16',
        label: 'Full GPU, 2K context, FP16',
      },
      {
        gpuLayers: 999,
        ctxSize: 4096,
        cacheType: 'fp16',
        label: 'Full GPU, 4K context, FP16',
      },
      {
        gpuLayers: 999,
        ctxSize: 8192,
        cacheType: 'fp16',
        label: 'Full GPU, 8K context, FP16',
      },
      {
        gpuLayers: 999,
        ctxSize: 8192,
        cacheType: 'q8_0',
        label: 'Full GPU, 8K context, Q8',
      },
      {
        gpuLayers: 999,
        ctxSize: 8192,
        cacheType: 'q4_0',
        label: 'Full GPU, 8K context, Q4',
      },
    ];

    const results: Array<{
      model: string;
      config: string;
      expected: number;
      conservative: number;
    }> = [];

    // Test each model architecture
    for (const [, metadata] of Object.entries(mockModelMetadata)) {
      for (const config of testConfigs) {
        const estimate = calculateVRAMEstimate(
          metadata,
          config.gpuLayers,
          config.ctxSize,
          config.cacheType
        );

        results.push({
          model: metadata.model_name!,
          config: config.label,
          expected: estimate.expected,
          conservative: estimate.conservative,
        });

        // Verify estimates are reasonable
        expect(estimate.expected).toBeGreaterThan(0);
        expect(estimate.conservative).toBeGreaterThan(estimate.expected);
        expect(estimate.expected).toBeLessThan(200000); // Less than 200GB

        // Conservative should be about 577MB more than expected
        expect(estimate.conservative - estimate.expected).toBeCloseTo(577, 0);
      }
    }

    // Verify we tested all models
    expect(results.length).toBe(
      Object.keys(mockModelMetadata).length * testConfigs.length
    );
  });

  it('should show increasing VRAM with larger context sizes', () => {
    const metadata = mockModelMetadata['llama-8b'];
    const contextSizes = [512, 1024, 2048, 4096, 8192, 16384];
    const estimates = contextSizes.map(ctxSize =>
      calculateVRAMEstimate(metadata, 999, ctxSize, 'fp16')
    );

    // Verify VRAM increases with context size
    for (let i = 1; i < estimates.length; i++) {
      expect(estimates[i].expected).toBeGreaterThan(estimates[i - 1].expected);
    }
  });

  it('should show different VRAM for different cache types', () => {
    const metadata = mockModelMetadata['mistral-7b'];
    const cacheTypes: CacheType[] = ['fp16', 'q8_0', 'q4_0'];
    const estimates = cacheTypes.map(cacheType =>
      calculateVRAMEstimate(metadata, 999, 8192, cacheType)
    );

    // FP16 should use more VRAM than Q8, which should use more than Q4
    expect(estimates[0].expected).toBeGreaterThan(estimates[1].expected);
    expect(estimates[1].expected).toBeGreaterThan(estimates[2].expected);
  });

  it('should handle partial GPU offloading', () => {
    const metadata = mockModelMetadata['llama-70b'];
    const gpuLayerCounts = [0, 20, 40, 60, 80];
    const estimates = gpuLayerCounts.map(gpuLayers =>
      calculateVRAMEstimate(metadata, gpuLayers, 4096, 'fp16')
    );

    // Verify VRAM increases with more GPU layers
    for (let i = 1; i < estimates.length; i++) {
      expect(estimates[i].expected).toBeGreaterThan(estimates[i - 1].expected);
    }

    // CPU-only (0 layers) should still require some VRAM for context
    expect(estimates[0].expected).toBeGreaterThan(0);
  });

  it('should calculate reasonable VRAM for small models', () => {
    const metadata = mockModelMetadata['phi-3-mini'];
    const estimate = calculateVRAMEstimate(metadata, 999, 4096, 'fp16');

    // Phi-3 mini should require less VRAM than larger models
    expect(estimate.expected).toBeGreaterThan(2000); // At least 2GB
    expect(estimate.expected).toBeLessThan(10000); // Less than 10GB for a 3.8B model
  });

  it('should calculate reasonable VRAM for large models', () => {
    const metadata = mockModelMetadata['llama-70b'];
    const estimate = calculateVRAMEstimate(metadata, 999, 8192, 'fp16');

    // 70B model should require significant VRAM
    expect(estimate.expected).toBeGreaterThan(30000); // At least 30GB
    expect(estimate.expected).toBeLessThan(100000); // Less than 100GB
  });

  it('should produce consistent results for the same inputs', () => {
    const metadata = mockModelMetadata['qwen-7b'];
    const config = {
      gpuLayers: 999,
      ctxSize: 4096,
      cacheType: 'fp16' as CacheType,
    };

    // Calculate multiple times
    const estimates = Array.from({ length: 5 }, () =>
      calculateVRAMEstimate(
        metadata,
        config.gpuLayers,
        config.ctxSize,
        config.cacheType
      )
    );

    // All estimates should be identical
    for (let i = 1; i < estimates.length; i++) {
      expect(estimates[i].expected).toBe(estimates[0].expected);
      expect(estimates[i].conservative).toBe(estimates[0].conservative);
    }
  });
});
