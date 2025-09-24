import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mindMapApi } from '../mindMapApi';
import type { MindMap } from '../../hooks/useMindMaps';

// Mock the parseMindMapDates utility
vi.mock('../../utils/mindMapUtils', () => ({
  parseMindMapDates: vi.fn((data: unknown[]) =>
    data.map(item => {
      const record = item as Record<string, unknown>;
      return {
        ...record,
        createdAt: new Date(record.createdAt as string),
        updatedAt: new Date(record.updatedAt as string),
      };
    })
  ),
}));

describe('mindMapApi', () => {
  const mockMindMaps = [
    {
      id: '1',
      name: 'Map 1',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: '2',
      name: 'Map 2',
      createdAt: '2024-01-02T00:00:00.000Z',
      updatedAt: '2024-01-02T00:00:00.000Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('fetchAll', () => {
    it('should fetch and parse mind maps', async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMindMaps,
      } as Response);

      const result = await mindMapApi.fetchAll();

      expect(mockFetch).toHaveBeenCalledWith('/api/mindmaps');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('1');
      expect(result[0].createdAt).toBeInstanceOf(Date);
      expect(result[0].updatedAt).toBeInstanceOf(Date);
    });

    it('should handle fetch errors', async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

      await expect(mindMapApi.fetchAll()).rejects.toThrow(
        'Failed to fetch mindmaps: 500'
      );
    });

    it('should handle network errors', async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(mindMapApi.fetchAll()).rejects.toThrow('Network error');
    });

    it('should return empty array for empty response', async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response);

      const result = await mindMapApi.fetchAll();

      expect(result).toEqual([]);
    });
  });

  describe('save', () => {
    it('should save mind maps', async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
      } as Response);

      const mindMaps: MindMap[] = [
        {
          id: '1',
          name: 'Map 1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      await mindMapApi.save(mindMaps);

      expect(mockFetch).toHaveBeenCalledWith('/api/mindmaps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mindMaps),
      });
    });

    it('should handle save errors', async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

      await expect(mindMapApi.save([])).rejects.toThrow(
        'Failed to save mindmaps: 500'
      );
    });

    it('should save empty array', async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
      } as Response);

      await mindMapApi.save([]);

      expect(mockFetch).toHaveBeenCalledWith('/api/mindmaps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '[]',
      });
    });
  });

  describe('create', () => {
    it('should create a new mind map', async () => {
      const mockFetch = vi.mocked(global.fetch);

      // Mock fetchAll
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMindMaps,
      } as Response);

      // Mock save
      mockFetch.mockResolvedValueOnce({
        ok: true,
      } as Response);

      const newMindMap: MindMap = {
        id: '3',
        name: 'New Map',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await mindMapApi.create(newMindMap);

      expect(result).toEqual(newMindMap);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Check the save call contains the new mindmap first
      const saveCall = mockFetch.mock.calls[1];
      const savedData = JSON.parse(saveCall[1]?.body as string) as Array<{
        id: string;
      }>;
      expect(savedData[0].id).toBe('3');
      expect(savedData).toHaveLength(3);
    });
  });

  describe('update', () => {
    it('should update a mind map', async () => {
      const mockFetch = vi.mocked(global.fetch);

      // Mock fetchAll
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMindMaps,
      } as Response);

      // Mock save
      mockFetch.mockResolvedValueOnce({
        ok: true,
      } as Response);

      await mindMapApi.update('1', { name: 'Updated Map' });

      const saveCall = mockFetch.mock.calls[1];
      const savedData = JSON.parse(saveCall[1]?.body as string) as Array<{
        id: string;
        name: string;
        updatedAt: string;
      }>;
      const updatedMap = savedData.find(m => m.id === '1');

      expect(updatedMap?.name).toBe('Updated Map');
      expect(new Date(updatedMap?.updatedAt ?? 0).getTime()).toBeGreaterThan(
        new Date(mockMindMaps[0].updatedAt).getTime()
      );
    });

    it('should handle updating non-existent mind map', async () => {
      const mockFetch = vi.mocked(global.fetch);

      // Mock fetchAll
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMindMaps,
      } as Response);

      // Mock save
      mockFetch.mockResolvedValueOnce({
        ok: true,
      } as Response);

      await mindMapApi.update('non-existent', { name: 'Updated' });

      const saveCall = mockFetch.mock.calls[1];
      const savedData = JSON.parse(saveCall[1]?.body as string) as Array<{
        id: string;
      }>;

      // Should not change the data
      expect(savedData).toHaveLength(2);
      expect(savedData.every(m => m.id !== 'non-existent')).toBe(true);
    });
  });

  describe('delete', () => {
    it('should delete a mind map', async () => {
      const mockFetch = vi.mocked(global.fetch);

      // Mock fetchAll
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMindMaps,
      } as Response);

      // Mock save
      mockFetch.mockResolvedValueOnce({
        ok: true,
      } as Response);

      await mindMapApi.delete('1');

      const saveCall = mockFetch.mock.calls[1];
      const savedData = JSON.parse(saveCall[1]?.body as string) as Array<{
        id: string;
      }>;

      expect(savedData).toHaveLength(1);
      expect(savedData[0].id).toBe('2');
    });

    it('should handle deleting non-existent mind map', async () => {
      const mockFetch = vi.mocked(global.fetch);

      // Mock fetchAll
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMindMaps,
      } as Response);

      // Mock save
      mockFetch.mockResolvedValueOnce({
        ok: true,
      } as Response);

      await mindMapApi.delete('non-existent');

      const saveCall = mockFetch.mock.calls[1];
      const savedData = JSON.parse(saveCall[1]?.body as string) as unknown;

      // Should not change the data
      expect(savedData).toHaveLength(2);
    });
  });
});
