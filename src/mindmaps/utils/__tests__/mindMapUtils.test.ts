import { describe, it, expect } from 'vitest';
import {
  sortMindMapsByDate,
  parseMindMapDates,
  selectDefaultMindMap,
  createNewMindMap,
  updateMindMapInList,
  removeMindMapFromList,
} from '../mindMapUtils';
import type { MindMap } from '../../hooks/useMindMaps';

describe('mindMapUtils', () => {
  const createMockMindMap = (
    id: string,
    name: string,
    updatedAt: Date
  ): MindMap => ({
    id,
    name,
    createdAt: new Date('2024-01-01'),
    updatedAt,
  });

  describe('sortMindMapsByDate', () => {
    it('should sort mind maps by updatedAt in descending order', () => {
      const mindMaps: MindMap[] = [
        createMockMindMap('1', 'Map 1', new Date('2024-01-01')),
        createMockMindMap('2', 'Map 2', new Date('2024-01-03')),
        createMockMindMap('3', 'Map 3', new Date('2024-01-02')),
      ];

      const sorted = sortMindMapsByDate(mindMaps);

      expect(sorted[0].id).toBe('2'); // Most recent
      expect(sorted[1].id).toBe('3');
      expect(sorted[2].id).toBe('1'); // Oldest
    });

    it('should not mutate the original array', () => {
      const mindMaps: MindMap[] = [
        createMockMindMap('1', 'Map 1', new Date('2024-01-01')),
        createMockMindMap('2', 'Map 2', new Date('2024-01-02')),
      ];

      const sorted = sortMindMapsByDate(mindMaps);

      expect(sorted).not.toBe(mindMaps);
      expect(mindMaps[0].id).toBe('1'); // Original order unchanged
    });

    it('should handle empty array', () => {
      expect(sortMindMapsByDate([])).toEqual([]);
    });

    it('should handle single item array', () => {
      const mindMaps = [createMockMindMap('1', 'Map 1', new Date())];
      expect(sortMindMapsByDate(mindMaps)).toEqual(mindMaps);
    });
  });

  describe('parseMindMapDates', () => {
    it('should parse date strings into Date objects', () => {
      const data = [
        {
          id: '1',
          name: 'Map 1',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
        },
      ];

      const parsed = parseMindMapDates(data);

      expect(parsed[0].createdAt).toBeInstanceOf(Date);
      expect(parsed[0].updatedAt).toBeInstanceOf(Date);
      expect(parsed[0].createdAt.toISOString()).toBe(
        '2024-01-01T00:00:00.000Z'
      );
      expect(parsed[0].updatedAt.toISOString()).toBe(
        '2024-01-02T00:00:00.000Z'
      );
    });

    it('should preserve other properties', () => {
      const data = [
        {
          id: '1',
          name: 'Map 1',
          description: 'Test description',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
          customProp: 'custom',
        },
      ];

      const parsed = parseMindMapDates(data);

      expect(parsed[0].id).toBe('1');
      expect(parsed[0].name).toBe('Map 1');
      expect(parsed[0].description).toBe('Test description');
      expect((parsed[0] as Record<string, unknown>).customProp).toBe('custom');
    });

    it('should handle empty array', () => {
      expect(parseMindMapDates([])).toEqual([]);
    });

    it('should handle invalid date strings', () => {
      const data = [
        {
          id: '1',
          name: 'Map 1',
          createdAt: 'invalid-date',
          updatedAt: 'invalid-date',
        },
      ];

      const parsed = parseMindMapDates(data);

      expect(parsed[0].createdAt).toBeInstanceOf(Date);
      expect(parsed[0].updatedAt).toBeInstanceOf(Date);
      expect(parsed[0].createdAt.toString()).toBe('Invalid Date');
      expect(parsed[0].updatedAt.toString()).toBe('Invalid Date');
    });
  });

  describe('selectDefaultMindMap', () => {
    const mindMaps: MindMap[] = [
      createMockMindMap('1', 'Map 1', new Date()),
      createMockMindMap('2', 'Map 2', new Date()),
      createMockMindMap('3', 'Map 3', new Date()),
    ];

    it('should return null for empty array', () => {
      expect(selectDefaultMindMap([], null, false)).toBeNull();
      expect(selectDefaultMindMap([], '1', true)).toBeNull();
    });

    it('should return first mindmap when not preserving', () => {
      expect(selectDefaultMindMap(mindMaps, null, false)).toBe('1');
      expect(selectDefaultMindMap(mindMaps, '2', false)).toBe('1');
    });

    it('should preserve selection when mindmap exists', () => {
      expect(selectDefaultMindMap(mindMaps, '2', true)).toBe('2');
      expect(selectDefaultMindMap(mindMaps, '3', true)).toBe('3');
    });

    it('should fallback to first when preserving non-existent ID', () => {
      expect(selectDefaultMindMap(mindMaps, 'non-existent', true)).toBe('1');
    });

    it('should handle null currentId when preserving', () => {
      expect(selectDefaultMindMap(mindMaps, null, true)).toBe('1');
    });
  });

  describe('createNewMindMap', () => {
    it('should create mindmap with custom name', () => {
      const mindMap = createNewMindMap('Custom Name', 5);

      expect(mindMap.name).toBe('Custom Name');
      expect(mindMap.id).toMatch(/^\d+-\d+$/); // Now includes counter
      expect(mindMap.createdAt).toBeInstanceOf(Date);
      expect(mindMap.updatedAt).toBeInstanceOf(Date);
      expect(mindMap.createdAt.getTime()).toBe(mindMap.updatedAt.getTime());
    });

    it('should create mindmap with default name', () => {
      const mindMap = createNewMindMap(undefined, 5);

      expect(mindMap.name).toBe('MindMap 6');
    });

    it('should use current timestamp for ID', () => {
      const before = Date.now();
      const mindMap = createNewMindMap('Test', 0);
      const after = Date.now();

      // Extract timestamp from the ID format "timestamp-counter"
      const timestamp = parseInt(mindMap.id.split('-')[0]);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('updateMindMapInList', () => {
    it('should update specified mindmap and sort', () => {
      const originalDate = new Date('2024-01-01');
      const mindMaps: MindMap[] = [
        createMockMindMap('1', 'Map 1', originalDate),
        createMockMindMap('2', 'Map 2', new Date('2024-01-02')),
      ];

      const updated = updateMindMapInList(mindMaps, '1', {
        name: 'Updated Map',
      });

      expect(updated[0].id).toBe('1'); // Should be first due to updated timestamp
      expect(updated[0].name).toBe('Updated Map');
      expect(updated[0].updatedAt.getTime()).toBeGreaterThan(
        originalDate.getTime()
      );
      expect(updated[1].id).toBe('2');
    });

    it('should not mutate original array', () => {
      const mindMaps: MindMap[] = [createMockMindMap('1', 'Map 1', new Date())];

      const updated = updateMindMapInList(mindMaps, '1', { name: 'Updated' });

      expect(mindMaps[0].name).toBe('Map 1');
      expect(updated[0].name).toBe('Updated');
    });

    it('should handle non-existent ID', () => {
      const mindMaps: MindMap[] = [createMockMindMap('1', 'Map 1', new Date())];

      const updated = updateMindMapInList(mindMaps, 'non-existent', {
        name: 'Updated',
      });

      expect(updated).toEqual(mindMaps);
    });

    it('should merge partial updates', () => {
      const mindMaps: MindMap[] = [
        {
          id: '1',
          name: 'Map 1',
          description: 'Original description',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ];

      const updated = updateMindMapInList(mindMaps, '1', {
        description: 'New description',
      });

      expect(updated[0].name).toBe('Map 1'); // Preserved
      expect(updated[0].description).toBe('New description'); // Updated
    });
  });

  describe('removeMindMapFromList', () => {
    it('should remove specified mindmap', () => {
      const mindMaps: MindMap[] = [
        createMockMindMap('1', 'Map 1', new Date()),
        createMockMindMap('2', 'Map 2', new Date()),
        createMockMindMap('3', 'Map 3', new Date()),
      ];

      const updated = removeMindMapFromList(mindMaps, '2');

      expect(updated).toHaveLength(2);
      expect(updated.find(m => m.id === '2')).toBeUndefined();
      expect(updated[0].id).toBe('1');
      expect(updated[1].id).toBe('3');
    });

    it('should not mutate original array', () => {
      const mindMaps: MindMap[] = [
        createMockMindMap('1', 'Map 1', new Date()),
        createMockMindMap('2', 'Map 2', new Date()),
      ];

      const updated = removeMindMapFromList(mindMaps, '1');

      expect(mindMaps).toHaveLength(2);
      expect(updated).toHaveLength(1);
    });

    it('should handle non-existent ID', () => {
      const mindMaps: MindMap[] = [createMockMindMap('1', 'Map 1', new Date())];

      const updated = removeMindMapFromList(mindMaps, 'non-existent');

      expect(updated).toEqual(mindMaps);
    });

    it('should handle empty array', () => {
      expect(removeMindMapFromList([], '1')).toEqual([]);
    });
  });
});
