import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMindMapOperations } from '../useMindMapOperations';
import { useMindMapStore } from '../../stores/mindMapStore';
import { mockMindMapsApiResponse } from '../../__fixtures__/apiMocks';

// Mock the repository
vi.mock('../../repositories/MindMapRepository', () => ({
  mindMapRepository: {
    load: vi.fn(),
    save: vi.fn(),
  },
}));

// Import after mocking
import { mindMapRepository } from '../../repositories/MindMapRepository';

describe('useMindMapOperations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store to initial state
    useMindMapStore.getState().reset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('load operation', () => {
    it('should load mind maps without act warnings', async () => {
      // Mock the repository response
      vi.mocked(mindMapRepository.load).mockResolvedValue(
        mockMindMapsApiResponse
      );

      const { result } = renderHook(() => useMindMapOperations());

      // Load is explicit - no automatic loading on mount!
      expect(useMindMapStore.getState().isLoaded).toBe(false);
      expect(useMindMapStore.getState().mindMaps).toEqual([]);

      // Explicitly call load
      await act(async () => {
        await result.current.load();
      });

      // Check state after load
      const state = useMindMapStore.getState();
      expect(state.isLoaded).toBe(true);
      expect(state.mindMaps).toHaveLength(3);
      expect(state.mindMaps[0].name).toBe('Meeting Notes'); // Most recent
      expect(state.activeMindMapId).toBe('mindmap-3'); // Auto-selected
    });

    it('should handle load errors gracefully', async () => {
      // Mock error
      vi.mocked(mindMapRepository.load).mockRejectedValue(
        new Error('Network error')
      );

      const { result } = renderHook(() => useMindMapOperations());

      await act(async () => {
        await result.current.load();
      });

      const state = useMindMapStore.getState();
      expect(state.error).toEqual(new Error('Network error'));
      expect(state.mindMaps).toEqual([]);
      expect(state.isLoaded).toBe(false);
    });
  });

  describe('create operation', () => {
    it('should create a mind map synchronously', () => {
      const { result } = renderHook(() => useMindMapOperations());

      let createdMindMap;

      // Zustand updates still need act
      act(() => {
        createdMindMap = result.current.create('Test Mind Map');
      });

      // Check returned value
      expect(createdMindMap!.name).toBe('Test Mind Map');
      expect(createdMindMap!.id).toBeTruthy();

      // Check state update
      const state = useMindMapStore.getState();
      expect(state.mindMaps).toHaveLength(1);
      expect(state.mindMaps[0]).toEqual(createdMindMap);
      expect(state.activeMindMapId).toBe(createdMindMap!.id);

      // Save was NOT called automatically
      expect(mindMapRepository.save).not.toHaveBeenCalled();
    });

    it('should create with default name', () => {
      const { result } = renderHook(() => useMindMapOperations());

      let mindMap;
      act(() => {
        mindMap = result.current.create();
      });

      expect(mindMap!.name).toMatch(/^MindMap \d+$/);
    });
  });

  describe('save operation', () => {
    it('should save current mind maps explicitly', async () => {
      const { result } = renderHook(() => useMindMapOperations());

      // Create some mind maps
      act(() => {
        result.current.create('Map 1');
        result.current.create('Map 2');
      });

      // Mock save to resolve
      vi.mocked(mindMapRepository.save).mockResolvedValue(undefined);

      // Save is explicit
      await act(async () => {
        await result.current.save();
      });

      // Check save was called with current state
      expect(mindMapRepository.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Map 2' }),
          expect.objectContaining({ name: 'Map 1' }),
        ])
      );
    });
  });

  describe('update operation', () => {
    it('should update a mind map synchronously', () => {
      const { result } = renderHook(() => useMindMapOperations());

      // Create a mind map
      let mindMap;
      act(() => {
        mindMap = result.current.create('Original Name');
      });

      // Update it
      act(() => {
        result.current.update(mindMap!.id, { name: 'Updated Name' });
      });

      // Check state
      const state = useMindMapStore.getState();
      expect(state.mindMaps[0].name).toBe('Updated Name');
      expect(state.mindMaps[0].updatedAt.getTime()).toBeGreaterThanOrEqual(
        mindMap!.updatedAt.getTime()
      );
    });
  });

  describe('remove operation', () => {
    it('should remove a mind map and update selection', () => {
      const { result } = renderHook(() => useMindMapOperations());

      // Create multiple mind maps
      let map2, map3;
      act(() => {
        result.current.create('Map 1');
        map2 = result.current.create('Map 2');
        map3 = result.current.create('Map 3');
      });

      // Select map2
      act(() => {
        result.current.select(map2!.id);
      });
      expect(useMindMapStore.getState().activeMindMapId).toBe(map2!.id);

      // Remove the selected map
      act(() => {
        result.current.remove(map2!.id);
      });

      const state = useMindMapStore.getState();
      expect(state.mindMaps).toHaveLength(2);
      expect(state.mindMaps.find(m => m.id === map2!.id)).toBeUndefined();
      // Should auto-select the first remaining map
      expect(state.activeMindMapId).toBe(map3!.id); // Map 3 is first (most recent)
    });

    it('should clear selection when removing last mind map', () => {
      const { result } = renderHook(() => useMindMapOperations());

      let map;
      act(() => {
        map = result.current.create('Only Map');
        result.current.remove(map!.id);
      });

      const state = useMindMapStore.getState();
      expect(state.mindMaps).toHaveLength(0);
      expect(state.activeMindMapId).toBeNull();
    });
  });

  describe('convenience methods', () => {
    it('should create and save in one operation', async () => {
      const { result } = renderHook(() => useMindMapOperations());

      vi.mocked(mindMapRepository.save).mockResolvedValue(undefined);

      let createdMap;
      await act(async () => {
        createdMap = await result.current.createAndSave('New Map');
      });

      expect(createdMap!.name).toBe('New Map');
      expect(mindMapRepository.save).toHaveBeenCalledOnce();
    });

    it('should update and save in one operation', async () => {
      const { result } = renderHook(() => useMindMapOperations());

      let map;
      act(() => {
        map = result.current.create('Original');
      });
      vi.mocked(mindMapRepository.save).mockResolvedValue(undefined);

      await act(async () => {
        await result.current.updateAndSave(map!.id, { name: 'Updated' });
      });

      expect(useMindMapStore.getState().mindMaps[0].name).toBe('Updated');
      expect(mindMapRepository.save).toHaveBeenCalledOnce();
    });

    it('should remove and save in one operation', async () => {
      const { result } = renderHook(() => useMindMapOperations());

      let map1, map2;
      act(() => {
        map1 = result.current.create('Map 1');
        map2 = result.current.create('Map 2');
      });

      vi.mocked(mindMapRepository.save).mockResolvedValue(undefined);

      await act(async () => {
        await result.current.removeAndSave(map1!.id);
      });

      expect(useMindMapStore.getState().mindMaps).toHaveLength(1);
      expect(mindMapRepository.save).toHaveBeenCalledWith([
        expect.objectContaining({ id: map2!.id }),
      ]);
    });
  });

  describe('NO act warnings', () => {
    it('should handle multiple synchronous operations without act warnings', () => {
      const { result } = renderHook(() => useMindMapOperations());

      // Even synchronous operations need act() because they update React state
      let map1, map2;
      act(() => {
        map1 = result.current.create('Map 1');
        map2 = result.current.create('Map 2');
        result.current.update(map1!.id, { name: 'Updated Map 1' });
        result.current.select(map2!.id);
        result.current.remove(map1!.id);
      });

      // Verify final state
      const state = useMindMapStore.getState();
      expect(state.mindMaps).toHaveLength(1);
      expect(state.mindMaps[0].name).toBe('Map 2');
      expect(state.activeMindMapId).toBe(map2!.id);
    });

    it('should load data in tests without any automatic side effects', async () => {
      const { result } = renderHook(() => useMindMapOperations());

      // Nothing happens on mount - no automatic loading!
      expect(mindMapRepository.load).not.toHaveBeenCalled();
      expect(useMindMapStore.getState().isLoaded).toBe(false);

      // We control when loading happens
      vi.mocked(mindMapRepository.load).mockResolvedValue(
        mockMindMapsApiResponse
      );

      await act(async () => {
        await result.current.load();
      });

      // Now it's loaded
      expect(mindMapRepository.load).toHaveBeenCalledOnce();
      expect(useMindMapStore.getState().isLoaded).toBe(true);
    });
  });
});
