import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ModelFileManager } from '../modelFileManager';
import { readGgufFileInfo } from 'node-llama-cpp';

// Type definitions for test mocks
interface MockStats {
  size: number;
  isFile(): boolean;
  isDirectory(): boolean;
  isBlockDevice(): boolean;
  isCharacterDevice(): boolean;
  isSymbolicLink(): boolean;
  isFIFO(): boolean;
  isSocket(): boolean;
  dev: number;
  ino: number;
  mode: number;
  nlink: number;
  uid: number;
  gid: number;
  rdev: number;
  blksize: number;
  blocks: number;
  atimeMs: number;
  mtimeMs: number;
  ctimeMs: number;
  birthtimeMs: number;
  atime: Date;
  mtime: Date;
  ctime: Date;
  birthtime: Date;
}

interface MockGgufMetadata {
  metadata?: {
    llama?: {
      block_count?: number;
      context_length?: number;
    };
  };
}

// Mock dependencies
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
  unlinkSync: vi.fn(),
}));
vi.mock('path', () => ({
  join: vi.fn((...args: string[]) => args.join('/')),
  basename: vi.fn((p: string) => p.split('/').pop() || ''),
}));
vi.mock('node-llama-cpp', () => ({
  readGgufFileInfo: vi.fn(),
}));
vi.mock('../../utils/settingsDirectory', () => ({
  getLocalModelsDirectory: vi.fn(() => '/mock/models/dir'),
}));
vi.mock('../../modelFetcher', () => ({
  modelFetcher: {
    getAvailableModels: vi.fn(() => Promise.resolve([])),
  },
}));

describe('ModelFileManager', () => {
  let manager: ModelFileManager;

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock fs.existsSync to return true by default
    vi.mocked(fs.existsSync).mockReturnValue(true);
    // Mock fs.mkdirSync
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);

    manager = new ModelFileManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create models directory if it does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      new ModelFileManager();

      expect(fs.mkdirSync).toHaveBeenCalledWith('/mock/models/dir', {
        recursive: true,
      });
    });

    it('should not create models directory if it already exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      new ModelFileManager();

      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('getLocalModels', () => {
    it('should return empty array if models directory does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const models = await manager.getLocalModels();

      expect(models).toEqual([]);
    });

    it('should scan and return GGUF files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      // Mock readdirSync to return string array as expected by the implementation
      const mockFiles: string[] = [
        'model1.gguf',
        'model2.gguf',
        'not-a-model.txt',
        'readme.md',
      ];
      vi.mocked(fs.readdirSync).mockReturnValue(mockFiles as never);

      vi.mocked(path.join).mockImplementation((...args) => args.join('/'));
      const mockStats: MockStats = {
        size: 1000000000, // 1GB
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
      };
      vi.mocked(fs.statSync).mockReturnValue(mockStats as import('fs').Stats);

      const mockGgufMetadata: MockGgufMetadata = {
        metadata: {
          llama: {
            block_count: 32,
            context_length: 4096,
          },
        },
      };
      vi.mocked(readGgufFileInfo).mockResolvedValue(
        mockGgufMetadata as Awaited<ReturnType<typeof readGgufFileInfo>>
      );

      const models = await manager.getLocalModels();

      expect(models).toHaveLength(2);
      expect(models[0].filename).toBe('model1.gguf');
      expect(models[1].filename).toBe('model2.gguf');
      expect(models[0].layerCount).toBe(32);
      expect(models[0].trainedContextLength).toBe(4096);
      expect(models[0].maxContextLength).toBe(4096);
    });

    it('should use context size resolver if provided', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const mockFiles: string[] = ['model.gguf'];
      vi.mocked(fs.readdirSync).mockReturnValue(mockFiles as never);
      vi.mocked(path.join).mockImplementation((...args) => args.join('/'));
      const mockModelStats: MockStats = {
        size: 1000000000,
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
      };
      vi.mocked(fs.statSync).mockReturnValue(
        mockModelStats as import('fs').Stats
      );

      const mockGgufMetadata: MockGgufMetadata = {
        metadata: {
          llama: {
            block_count: 32,
            context_length: 4096,
          },
        },
      };
      vi.mocked(readGgufFileInfo).mockResolvedValue(
        mockGgufMetadata as Awaited<ReturnType<typeof readGgufFileInfo>>
      );

      const resolver = vi.fn().mockResolvedValue(2048);

      const models = await manager.getLocalModels(resolver);

      // Context resolver is no longer used for max context
      expect(resolver).not.toHaveBeenCalled();
      // Both trained and max context come from GGUF metadata
      expect(models[0].trainedContextLength).toBe(4096);
      expect(models[0].maxContextLength).toBe(4096);
    });

    it('should handle GGUF metadata extraction failure gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const mockFiles: string[] = ['model.gguf'];
      vi.mocked(fs.readdirSync).mockReturnValue(mockFiles as never);
      vi.mocked(path.join).mockImplementation((...args) => args.join('/'));
      const mockFailureStats: MockStats = {
        size: 1000000000,
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
      };
      vi.mocked(fs.statSync).mockReturnValue(
        mockFailureStats as import('fs').Stats
      );
      vi.mocked(readGgufFileInfo).mockRejectedValue(
        new Error('Failed to read')
      );

      const models = await manager.getLocalModels();

      expect(models).toHaveLength(1);
      expect(models[0].layerCount).toBeUndefined();
      expect(models[0].maxContextLength).toBeUndefined();
    });
  });

  describe('parseModelFilename', () => {
    it('should extract parameter count from filename', () => {
      const metadata = manager.parseModelFilename(
        'llama-3-8B-instruct-Q4_K_M.gguf'
      );
      expect(metadata.parameterCount).toBe('8B');
    });

    it('should extract quantization from filename', () => {
      const testCases = [
        { filename: 'model-Q4_K_M.gguf', expected: 'Q4_K_M' },
        { filename: 'model-IQ3_XXS.gguf', expected: 'IQ3_XXS' },
        { filename: 'model-Q8.gguf', expected: 'Q8' },
        { filename: 'model-f16.gguf', expected: 'F16' },
        { filename: 'model-fp32.gguf', expected: 'FP32' },
      ];

      for (const { filename, expected } of testCases) {
        const metadata = manager.parseModelFilename(filename);
        expect(metadata.quantization).toBe(expected);
      }
    });

    it('should extract context length from filename', () => {
      const metadata = manager.parseModelFilename('model-8k-context.gguf');
      expect(metadata.contextLength).toBe(8000); // 8k = 8000 tokens, not 8192
    });

    it('should default to F16 quantization for GGUF files without explicit quantization', () => {
      const metadata = manager.parseModelFilename('model.gguf');
      expect(metadata.quantization).toBe('F16');
    });
  });

  describe('deleteModelFile', () => {
    it('should delete model file if it exists', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.unlinkSync).mockImplementation(() => undefined);

      await manager.deleteModelFile('/path/to/model.gguf');

      expect(fs.unlinkSync).toHaveBeenCalledWith('/path/to/model.gguf');
    });

    it('should not throw if model file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await expect(
        manager.deleteModelFile('/path/to/model.gguf')
      ).resolves.not.toThrow();

      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });
  });

  describe('getModelPath', () => {
    it('should return full path for model filename', () => {
      vi.mocked(path.join).mockImplementation((...args) => args.join('/'));

      const fullPath = manager.getModelPath('model.gguf');

      expect(fullPath).toBe('/mock/models/dir/model.gguf');
    });
  });

  describe('modelExists', () => {
    it('should return true if model file exists', () => {
      vi.mocked(path.join).mockImplementation((...args) => args.join('/'));
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const exists = manager.modelExists('model.gguf');

      expect(exists).toBe(true);
      expect(fs.existsSync).toHaveBeenCalledWith('/mock/models/dir/model.gguf');
    });

    it('should return false if model file does not exist', () => {
      vi.mocked(path.join).mockImplementation((...args) => args.join('/'));
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const exists = manager.modelExists('model.gguf');

      expect(exists).toBe(false);
    });
  });
});
