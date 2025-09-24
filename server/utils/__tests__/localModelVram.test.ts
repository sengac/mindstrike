/**
 * Test that local model VRAM calculation works
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import { ModelFileManager } from '../../llm/modelFileManager';
import { loadMetadataFromFile } from '../ggufVramCalculator';
import { modelFetcher } from '../../modelFetcher';

// Mock modules
vi.mock('fs');
vi.mock('fs/promises');
vi.mock('../settingsDirectory', () => ({
  getLocalModelsDirectory: () => '/test/models',
}));
vi.mock('../../modelFetcher', () => ({
  modelFetcher: {
    getAvailableModels: vi.fn(),
  },
}));
vi.mock('node-llama-cpp', () => ({
  readGgufFileInfo: vi.fn().mockResolvedValue({
    metadata: {
      llama: {
        block_count: 32,
        context_length: 8192,
      },
    },
  }),
}));

// Mock loadMetadataFromFile
vi.mock('../ggufVramCalculator', async () => {
  const actual = await vi.importActual('../ggufVramCalculator');
  return {
    ...actual,
    loadMetadataFromFile: vi.fn().mockResolvedValue({
      n_layers: 32,
      n_kv_heads: 8,
      embedding_dim: 4096,
      context_length: 32768,
      feed_forward_dim: 11008,
      model_size_mb: 4000,
      loaded: true,
    }),
  };
});

describe('Local Model VRAM Calculation', () => {
  let fileManager: ModelFileManager;

  beforeEach(() => {
    vi.clearAllMocks();
    // Setup modelFetcher mock
    vi.mocked(modelFetcher.getAvailableModels).mockResolvedValue([]);
    fileManager = new ModelFileManager();
  });

  it('should calculate VRAM for local GGUF files', async () => {
    // Mock file system
    const mockFiles = ['model-7b-q4.gguf'];
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(mockFiles);
    vi.mocked(fs.statSync).mockReturnValue({
      size: 4000000000, // 4GB
      isFile: () => true,
      isDirectory: () => false,
      isBlockDevice: () => false,
      isCharacterDevice: () => false,
      isSymbolicLink: () => false,
      isFIFO: () => false,
      isSocket: () => false,
      dev: 0,
      ino: 0,
      mode: 0,
      nlink: 0,
      uid: 0,
      gid: 0,
      rdev: 0,
      blksize: 0,
      blocks: 0,
      atimeMs: 0,
      mtimeMs: 0,
      ctimeMs: 0,
      birthtimeMs: 0,
      atime: new Date(),
      mtime: new Date(),
      ctime: new Date(),
      birthtime: new Date(),
    } as fs.Stats);

    // Get local models
    const models = await fileManager.getLocalModels();

    // Verify VRAM data is included
    expect(models).toHaveLength(1);
    const model = models[0];

    // Check VRAM fields exist
    expect(model.hasVramData).toBe(true);
    expect(model.vramEstimates).toBeDefined();
    expect(model.vramEstimates).toHaveLength(4); // 4 context size configs
    expect(model.modelArchitecture).toBeDefined();

    // Check VRAM estimates structure
    const firstEstimate = model.vramEstimates![0];
    expect(firstEstimate).toHaveProperty('expected');
    expect(firstEstimate).toHaveProperty('conservative');
    expect(firstEstimate).toHaveProperty('config');
    expect(firstEstimate.config.label).toBe('2K context');
    expect(firstEstimate.config.contextSize).toBe(2048);
    expect(firstEstimate.config.cacheType).toBe('fp16');
    expect(firstEstimate.config.gpuLayers).toBe(999);

    // Check model architecture
    expect(model.modelArchitecture!.layers).toBe(32);
    expect(model.modelArchitecture!.kvHeads).toBe(8);
    expect(model.modelArchitecture!.embeddingDim).toBe(4096);

    // Verify different context sizes have different estimates
    const estimates = model.vramEstimates!;
    expect(estimates[0].expected).toBeLessThan(estimates[1].expected);
    expect(estimates[1].expected).toBeLessThan(estimates[2].expected);
    expect(estimates[2].expected).toBeLessThan(estimates[3].expected);
  });

  it('should handle VRAM calculation errors gracefully', async () => {
    // Mock file system
    const mockFiles = ['model-7b-q4.gguf'];
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(mockFiles);
    vi.mocked(fs.statSync).mockReturnValue({
      size: 4000000000,
      isFile: () => true,
      isDirectory: () => false,
      isBlockDevice: () => false,
      isCharacterDevice: () => false,
      isSymbolicLink: () => false,
      isFIFO: () => false,
      isSocket: () => false,
      dev: 0,
      ino: 0,
      mode: 0,
      nlink: 0,
      uid: 0,
      gid: 0,
      rdev: 0,
      blksize: 0,
      blocks: 0,
      atimeMs: 0,
      mtimeMs: 0,
      ctimeMs: 0,
      birthtimeMs: 0,
      atime: new Date(),
      mtime: new Date(),
      ctime: new Date(),
      birthtime: new Date(),
    } as fs.Stats);

    // Make loadMetadataFromFile throw an error
    vi.mocked(loadMetadataFromFile).mockRejectedValue(
      new Error('Failed to parse GGUF')
    );

    // Get local models
    const models = await fileManager.getLocalModels();

    // Model should still be returned but without VRAM data
    expect(models).toHaveLength(1);
    const model = models[0];

    expect(model.hasVramData).toBe(false);
    expect(model.vramEstimates).toBeUndefined();
    expect(model.modelArchitecture).toBeUndefined();
    expect(model.vramError).toBe('Failed to parse GGUF');
  });
});
