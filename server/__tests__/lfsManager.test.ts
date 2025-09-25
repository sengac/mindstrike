import { describe, it, expect, vi, beforeEach } from 'vitest';
import { lfsManager } from '../lfsManager';

// Mock dependencies
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(),
    promises: {
      writeFile: vi.fn(() => Promise.resolve()),
    },
  },
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(),
  promises: {
    writeFile: vi.fn(() => Promise.resolve()),
  },
}));

let uuidCounter = 0;
vi.mock('uuid', () => ({
  v4: vi.fn(() => `test-uuid-${++uuidCounter}`),
}));

vi.mock('../documentIngestionService', () => ({
  DocumentIngestionService: {
    detectContentType: vi.fn(() => 'text/plain'),
  },
  documentIngestionService: {
    processDocument: vi.fn(() =>
      Promise.resolve({
        id: 'test-id',
        content: 'test',
        summary: {
          id: 'summary-id',
          originalId: 'test-id',
          summary: 'Test summary',
          keyPoints: ['point1'],
          contentType: 'text/plain',
          originalSize: 1000,
          generatedAt: new Date(),
          model: 'test-model',
        },
        chunks: [],
        metadata: {
          originalSize: 1000,
          processedAt: new Date(),
          chunkCount: 1,
        },
      })
    ),
  },
}));

describe('LFSManager', () => {
  beforeEach(async () => {
    await lfsManager.clearAll();
    vi.clearAllMocks();
    uuidCounter = 0;
  });

  describe('basic functionality', () => {
    it('should return original content if under threshold', async () => {
      const smallContent = 'small text';
      const result = await lfsManager.storeContent(smallContent);
      expect(result).toBe(smallContent);
    });

    it('should store large content and return LFS reference', async () => {
      const largeContent = 'x'.repeat(2000);
      const result = await lfsManager.storeContent(largeContent);
      expect(result).toMatch(/^\[LFS:[\w-]+\]$/);
    });

    it('should retrieve stored content by LFS reference', async () => {
      const largeContent = 'x'.repeat(2000);
      const ref = await lfsManager.storeContent(largeContent);
      const retrieved = lfsManager.retrieveContent(ref);
      expect(retrieved).toBe(largeContent);
    });

    it('should return null for non-existent LFS reference', () => {
      const result = lfsManager.retrieveContent('[LFS:non-existent]');
      expect(result).toBeNull();
    });

    it('should return content as-is for non-LFS references', () => {
      const content = 'regular content';
      const result = lfsManager.retrieveContent(content);
      expect(result).toBe(content);
    });

    it('should clear all entries', async () => {
      const largeContent = 'x'.repeat(2000);
      await lfsManager.storeContent(largeContent);

      const statsBefore = lfsManager.getStats();
      expect(statsBefore.totalEntries).toBeGreaterThan(0);

      await lfsManager.clearAll();

      const statsAfter = lfsManager.getStats();
      expect(statsAfter.totalEntries).toBe(0);
    });

    it('should remove entry by ID', async () => {
      const largeContent = 'x'.repeat(2000);
      const ref = await lfsManager.storeContent(largeContent);
      const id = ref.match(/\[LFS:([\w-]+)\]/)?.[1];

      if (id) {
        await lfsManager.removeEntry(id);
        const retrieved = lfsManager.retrieveContent(ref);
        expect(retrieved).toBeNull();
      }
    });

    it('should correctly identify LFS references', () => {
      expect(lfsManager.isLFSReference('[LFS:test-id]')).toBe(true);
      expect(lfsManager.isLFSReference('normal content')).toBe(false);
      expect(lfsManager.isLFSReference('[LFS:]')).toBe(false);
      expect(lfsManager.isLFSReference('')).toBe(false);
    });

    it('should calculate statistics correctly', async () => {
      const content1 = 'x'.repeat(2000);
      const content2 = 'y'.repeat(3000);

      await lfsManager.storeContent(content1);
      await lfsManager.storeContent(content2);

      const stats = lfsManager.getStats();
      expect(stats.totalEntries).toBe(2);
      expect(stats.totalSize).toBe(5000);
      expect(stats.totalCompressedSize).toBeGreaterThan(0);
    });

    it('should handle unicode content correctly', async () => {
      const unicodeContent = '世界 🚀 ñáéíóú'.repeat(200);
      const ref = await lfsManager.storeContent(unicodeContent);

      if (ref.startsWith('[LFS:')) {
        const retrieved = lfsManager.retrieveContent(ref);
        expect(retrieved).toBe(unicodeContent);
      }
    });
  });
});
