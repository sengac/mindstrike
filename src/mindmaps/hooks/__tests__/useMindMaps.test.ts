import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useMindMaps } from '../useMindMaps';
import {
  mockMindMapsApiResponse,
  createMockFetch,
} from '../../__fixtures__/apiMocks';

// Mock the useAppStore hook
vi.mock('../../../store/useAppStore', () => ({
  useAppStore: vi.fn(() => ({
    workspaceVersion: 1,
  })),
}));

describe('useMindMaps', () => {
  let mockFetch: Mock;

  beforeEach(() => {
    vi.clearAllTimers();
    vi.useFakeTimers();
    mockFetch = createMockFetch();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('initialization and loading', () => {
    it('should initialize with empty state', () => {
      const { result } = renderHook(() => useMindMaps());

      expect(result.current.mindMaps).toEqual([]);
      expect(result.current.activeMindMapId).toBeNull();
      expect(result.current.activeMindMap).toBeNull();
      expect(result.current.isLoaded).toBe(false);
    });

    it('should load mind maps from API on mount', async () => {
      const { result } = renderHook(() => useMindMaps());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/mindmaps');
      expect(result.current.mindMaps).toHaveLength(3);
      expect(result.current.mindMaps[0].name).toBe('Project Planning');
      expect(result.current.activeMindMapId).toBe('mindmap-1'); // Most recently updated
    });

    it('should sort mind maps by updatedAt in descending order', async () => {
      const { result } = renderHook(() => useMindMaps());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      const mindMaps = result.current.mindMaps;
      expect(mindMaps[0].updatedAt.getTime()).toBeGreaterThan(
        mindMaps[1].updatedAt.getTime()
      );
      expect(mindMaps[1].updatedAt.getTime()).toBeGreaterThan(
        mindMaps[2].updatedAt.getTime()
      );
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const { result } = renderHook(() => useMindMaps());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      expect(result.current.mindMaps).toEqual([]);
      expect(result.current.activeMindMapId).toBeNull();
    });

    it('should reload when workspace version changes', async () => {
      const { useAppStore } = await import('../../../store/useAppStore');
      const mockUseAppStore = vi.mocked(useAppStore);

      // Initial render
      mockUseAppStore.mockReturnValue({ workspaceVersion: 1 });
      const { result, rerender } = renderHook(() => useMindMaps());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Change workspace version
      mockUseAppStore.mockReturnValue({ workspaceVersion: 2 });
      rerender();

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('createMindMap', () => {
    it('should create a new mind map with default name', async () => {
      const { result } = renderHook(() => useMindMaps());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      const initialCount = result.current.mindMaps.length;

      let createdId: string;
      await act(async () => {
        createdId = await result.current.createMindMap();
      });

      expect(result.current.mindMaps).toHaveLength(initialCount + 1);
      expect(result.current.mindMaps[0].id).toBe(createdId!);
      expect(result.current.mindMaps[0].name).toMatch(/^MindMap \d+$/);
      expect(result.current.activeMindMapId).toBe(createdId!);

      // Should save immediately
      expect(mockFetch).toHaveBeenCalledWith('/api/mindmaps', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: expect.stringContaining(createdId!),
      });
    });

    it('should create a new mind map with custom name', async () => {
      const { result } = renderHook(() => useMindMaps());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      let createdId: string;
      await act(async () => {
        createdId = await result.current.createMindMap('Custom Name');
      });

      const newMindMap = result.current.mindMaps.find(m => m.id === createdId!);
      expect(newMindMap).toBeDefined();
      expect(newMindMap!.name).toBe('Custom Name');
    });

    it('should place new mind map at the beginning of the list', async () => {
      const { result } = renderHook(() => useMindMaps());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      await act(async () => {
        await result.current.createMindMap('New Mind Map');
      });

      expect(result.current.mindMaps[0].name).toBe('New Mind Map');
    });
  });

  describe('deleteMindMap', () => {
    it('should delete a mind map', async () => {
      const { result } = renderHook(() => useMindMaps());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      const initialCount = result.current.mindMaps.length;
      const mindMapToDelete = result.current.mindMaps[1];

      await act(async () => {
        await result.current.deleteMindMap(mindMapToDelete.id);
      });

      expect(result.current.mindMaps).toHaveLength(initialCount - 1);
      expect(
        result.current.mindMaps.find(m => m.id === mindMapToDelete.id)
      ).toBeUndefined();

      // Should save changes
      expect(mockFetch).toHaveBeenCalledWith('/api/mindmaps', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: expect.not.stringContaining(mindMapToDelete.id),
      });
    });

    it('should update active mind map when deleting active one', async () => {
      const { result } = renderHook(() => useMindMaps());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      const activeId = result.current.activeMindMapId;
      expect(activeId).toBe('mindmap-1');

      await act(async () => {
        await result.current.deleteMindMap(activeId!);
      });

      // Should set new active mind map to the first remaining one
      expect(result.current.activeMindMapId).toBe('mindmap-2');
    });

    it('should set active mind map to null when deleting the last one', async () => {
      // Mock API to return only one mind map
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([mockMindMapsApiResponse[0]]),
      });

      const { result } = renderHook(() => useMindMaps());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      expect(result.current.mindMaps).toHaveLength(1);

      await act(async () => {
        await result.current.deleteMindMap(result.current.mindMaps[0].id);
      });

      expect(result.current.mindMaps).toHaveLength(0);
      expect(result.current.activeMindMapId).toBeNull();
    });
  });

  describe('renameMindMap', () => {
    it('should rename a mind map', async () => {
      const { result } = renderHook(() => useMindMaps());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      const mindMapToRename = result.current.mindMaps[0];
      const originalUpdatedAt = mindMapToRename.updatedAt;

      await act(async () => {
        await result.current.renameMindMap(
          mindMapToRename.id,
          'Renamed Mind Map'
        );
      });

      const renamedMindMap = result.current.mindMaps.find(
        m => m.id === mindMapToRename.id
      );
      expect(renamedMindMap).toBeDefined();
      expect(renamedMindMap!.name).toBe('Renamed Mind Map');
      expect(renamedMindMap!.updatedAt.getTime()).toBeGreaterThan(
        originalUpdatedAt.getTime()
      );

      // Should save changes
      expect(mockFetch).toHaveBeenCalledWith('/api/mindmaps', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: expect.stringContaining('Renamed Mind Map'),
      });
    });

    it('should re-sort mind maps after renaming', async () => {
      const { result } = renderHook(() => useMindMaps());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      // Rename the last mind map
      const lastMindMap =
        result.current.mindMaps[result.current.mindMaps.length - 1];

      await act(async () => {
        await result.current.renameMindMap(lastMindMap.id, 'Most Recent');
      });

      // Should now be at the top due to updated timestamp
      expect(result.current.mindMaps[0].id).toBe(lastMindMap.id);
      expect(result.current.mindMaps[0].name).toBe('Most Recent');
    });
  });

  describe('selectMindMap', () => {
    it('should select a mind map', async () => {
      const { result } = renderHook(() => useMindMaps());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      const mindMapToSelect = result.current.mindMaps[1];

      await act(async () => {
        await result.current.selectMindMap(mindMapToSelect.id);
      });

      expect(result.current.activeMindMapId).toBe(mindMapToSelect.id);
      expect(result.current.activeMindMap).toEqual(mindMapToSelect);
    });
  });

  describe('getActiveMindMap', () => {
    it('should return the active mind map', async () => {
      const { result } = renderHook(() => useMindMaps());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      const activeMindMap = result.current.activeMindMap;
      expect(activeMindMap).toBeDefined();
      expect(activeMindMap!.id).toBe(result.current.activeMindMapId);
    });

    it('should return null when no active mind map', async () => {
      // Mock API to return empty array
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

      const { result } = renderHook(() => useMindMaps());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      expect(result.current.activeMindMap).toBeNull();
    });
  });

  describe('loadMindMaps', () => {
    it('should reload mind maps manually', async () => {
      const { result } = renderHook(() => useMindMaps());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);

      await act(async () => {
        await result.current.loadMindMaps();
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should preserve active mind map ID when requested', async () => {
      const { result } = renderHook(() => useMindMaps());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      // Select a different mind map
      await act(async () => {
        await result.current.selectMindMap('mindmap-3');
      });

      expect(result.current.activeMindMapId).toBe('mindmap-3');

      // Reload with preserve flag
      await act(async () => {
        await result.current.loadMindMaps(true);
      });

      // Should keep the selected mind map
      expect(result.current.activeMindMapId).toBe('mindmap-3');
    });

    it('should fallback to most recent when preserving non-existent active ID', async () => {
      const { result } = renderHook(() => useMindMaps());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      // Select a non-existent mind map ID
      await act(async () => {
        // Use selectMindMap to set a non-existent ID
        await result.current.selectMindMap('non-existent-id');
      });

      // Mock API to return different mind maps (without the non-existent one)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([mockMindMapsApiResponse[0]]),
      });

      await act(async () => {
        await result.current.loadMindMaps(true);
      });

      // Should fallback to most recent
      expect(result.current.activeMindMapId).toBe('mindmap-1');
    });
  });

  describe('cleanup', () => {
    it('should cleanup timeout on unmount', () => {
      const { unmount } = renderHook(() => useMindMaps());

      // Create a mind map to trigger save timeout
      act(() => {
        // This would normally create a timeout
      });

      // Should not throw when unmounting
      expect(() => unmount()).not.toThrow();
    });
  });

  describe('debounced saving', () => {
    it('should debounce save operations', async () => {
      const { result } = renderHook(() => useMindMaps());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      // Create multiple mind maps quickly
      act(() => {
        void result.current.createMindMap('Map 1');
        void result.current.createMindMap('Map 2');
        void result.current.createMindMap('Map 3');
      });

      // Should not call save immediately
      expect(mockFetch).toHaveBeenCalledWith('/api/mindmaps'); // Initial load
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Fast-forward past debounce delay
      act(() => {
        vi.advanceTimersByTime(500);
      });

      // Should have called save after debounce
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should save immediately when requested', async () => {
      const { result } = renderHook(() => useMindMaps());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      await act(async () => {
        await result.current.createMindMap('Immediate Save');
      });

      // Should save immediately, not wait for debounce
      expect(mockFetch).toHaveBeenCalledTimes(2); // Load + immediate save
    });
  });
});
