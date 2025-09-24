import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useMindMaps } from '../useMindMaps';
import { mindMapApi } from '../../services/mindMapApi';
import type { MindMap } from '../useMindMaps';

// Mock dependencies
vi.mock('../../../store/useAppStore', () => ({
  useAppStore: vi.fn(() => 1),
}));

vi.mock('../../services/mindMapApi');

vi.mock('../../../utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('useMindMaps', () => {
  const mockMindMaps: MindMap[] = [
    {
      id: '1',
      name: 'MindMap 1',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-02'),
    },
    {
      id: '2',
      name: 'MindMap 2',
      createdAt: new Date('2024-01-03'),
      updatedAt: new Date('2024-01-04'),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(mindMapApi.fetchAll).mockResolvedValue(mockMindMaps);
    vi.mocked(mindMapApi.save).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should load mind maps on mount', async () => {
      const { result } = renderHook(() => useMindMaps());

      expect(result.current.isLoaded).toBe(false);
      expect(result.current.mindMaps).toEqual([]);

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      expect(mindMapApi.fetchAll).toHaveBeenCalledTimes(1);
      // Mind maps are sorted by date, most recent first
      expect(result.current.mindMaps).toEqual([
        mockMindMaps[1],
        mockMindMaps[0],
      ]);
    });

    it('should set most recent mind map as active', async () => {
      const { result } = renderHook(() => useMindMaps());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      // Should select the most recent (by updatedAt)
      expect(result.current.activeMindMapId).toBe('2');
      expect(result.current.activeMindMap).toEqual(mockMindMaps[1]);
    });

    it('should handle empty mind maps list', async () => {
      vi.mocked(mindMapApi.fetchAll).mockResolvedValue([]);

      const { result } = renderHook(() => useMindMaps());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      expect(result.current.mindMaps).toEqual([]);
      expect(result.current.activeMindMapId).toBe(null);
      expect(result.current.activeMindMap).toBe(null);
    });

    it('should handle fetch errors gracefully', async () => {
      const error = new Error('Network error');
      vi.mocked(mindMapApi.fetchAll).mockRejectedValue(error);

      const { result } = renderHook(() => useMindMaps());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      expect(result.current.mindMaps).toEqual([]);
      expect(result.current.activeMindMapId).toBe(null);
    });
  });

  describe('createMindMap', () => {
    it('should create a new mind map with default name', async () => {
      const { result } = renderHook(() => useMindMaps());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      let newId: string = '';
      await act(async () => {
        newId = await result.current.createMindMap();
      });

      expect(result.current.mindMaps).toHaveLength(3);
      expect(result.current.mindMaps[0].name).toMatch(/^MindMap/);
      expect(result.current.activeMindMapId).toBe(newId);
      expect(newId).toBeTruthy();

      // Verify save was called
      expect(mindMapApi.save).toHaveBeenCalled();
    });

    it('should create a new mind map with custom name', async () => {
      const { result } = renderHook(() => useMindMaps());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      const customName = 'Custom MindMap';

      let newId: string = '';
      await act(async () => {
        newId = await result.current.createMindMap(customName);
      });

      const newMindMap = result.current.mindMaps.find(m => m.id === newId);
      expect(newMindMap?.name).toBe(customName);
      expect(result.current.activeMindMapId).toBe(newId);
    });
  });

  describe('deleteMindMap', () => {
    it('should delete a mind map and update active selection', async () => {
      const { result } = renderHook(() => useMindMaps());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      // Initially selected is '2' (most recent)
      expect(result.current.activeMindMapId).toBe('2');

      await act(async () => {
        await result.current.deleteMindMap('2');
      });

      expect(result.current.mindMaps).toHaveLength(1);
      expect(result.current.mindMaps[0].id).toBe('1');
      expect(result.current.activeMindMapId).toBe('1'); // Falls back to remaining
    });

    it('should handle deleting non-active mind map', async () => {
      const { result } = renderHook(() => useMindMaps());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      // Select first mind map
      act(() => {
        result.current.selectMindMap('1');
      });

      await act(async () => {
        await result.current.deleteMindMap('2');
      });

      expect(result.current.activeMindMapId).toBe('1'); // Should remain unchanged
    });
  });

  describe('renameMindMap', () => {
    it('should rename a mind map and update timestamp', async () => {
      const { result } = renderHook(() => useMindMaps());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      const newName = 'Renamed MindMap';
      const beforeUpdate = new Date();

      await act(async () => {
        await result.current.renameMindMap('1', newName);
      });

      const renamedMindMap = result.current.mindMaps.find(m => m.id === '1');
      expect(renamedMindMap?.name).toBe(newName);
      expect(renamedMindMap?.updatedAt.getTime()).toBeGreaterThanOrEqual(
        beforeUpdate.getTime()
      );
    });
  });

  describe('selectMindMap', () => {
    it('should update active mind map selection', async () => {
      const { result } = renderHook(() => useMindMaps());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      expect(result.current.activeMindMapId).toBe('2');

      act(() => {
        result.current.selectMindMap('1');
      });

      expect(result.current.activeMindMapId).toBe('1');
      expect(result.current.activeMindMap).toEqual(mockMindMaps[0]);
    });
  });

  describe('loadMindMaps', () => {
    it('should reload mind maps and preserve selection', async () => {
      const { result } = renderHook(() => useMindMaps());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      // Select first mind map
      act(() => {
        result.current.selectMindMap('1');
      });

      // Clear mock calls
      vi.clearAllMocks();

      await act(async () => {
        await result.current.loadMindMaps(true);
      });

      expect(mindMapApi.fetchAll).toHaveBeenCalledTimes(1);
      expect(result.current.activeMindMapId).toBe('1'); // Selection preserved
    });

    it('should handle removed active mind map during reload', async () => {
      const { result } = renderHook(() => useMindMaps());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      // Select second mind map
      act(() => {
        result.current.selectMindMap('2');
      });

      // Mock API to return only first mind map
      vi.mocked(mindMapApi.fetchAll).mockResolvedValue([mockMindMaps[0]]);

      await act(async () => {
        await result.current.loadMindMaps(true);
      });

      expect(result.current.activeMindMapId).toBe('1'); // Falls back to first
    });
  });
});
