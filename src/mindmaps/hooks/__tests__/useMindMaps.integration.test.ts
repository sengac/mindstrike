import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useMindMaps } from '../useMindMaps';
import type { MindMap } from '../useMindMaps';

// For integration tests, we only mock the fetch API and external dependencies
// to simulate server responses while testing real hook behavior
vi.mock('../../../utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock the store with a simple implementation that returns a workspace version
vi.mock('../../../store/useAppStore', () => ({
  useAppStore: vi.fn(() => 1),
}));

describe('useMindMaps Integration Tests', () => {
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

  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Use real timers for most operations to allow useEffect to run
    // We'll use fake timers only when we need to control specific timing
    vi.useRealTimers();

    // Mock fetch globally
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Default successful response - Return a fresh copy of mock data each time
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => JSON.parse(JSON.stringify(mockMindMaps)), // Deep copy to avoid mutation
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('full workflow', () => {
    it('should handle complete CRUD workflow', async () => {
      const { result } = renderHook(() => useMindMaps());

      // Wait for initial load
      await waitFor(
        () => {
          expect(result.current.isLoaded).toBe(true);
        },
        { timeout: 5000 }
      );

      expect(result.current.mindMaps).toHaveLength(2);
      expect(result.current.activeMindMapId).toBe('2'); // Most recent

      // Create a new mind map
      let newId: string;
      await act(async () => {
        newId = await result.current.createMindMap('New MindMap');
      });

      expect(result.current.mindMaps).toHaveLength(3);
      expect(result.current.mindMaps[0].name).toBe('New MindMap');
      expect(result.current.activeMindMapId).toBe(newId!);

      // Verify save was called immediately (for create, immediate=true)
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/mindmaps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('New MindMap'),
        });
      });

      // Clear previous mock calls to track rename operation
      mockFetch.mockClear();

      // Rename the mind map
      await act(async () => {
        await result.current.renameMindMap(newId!, 'Renamed MindMap');
      });

      expect(result.current.mindMaps.find(m => m.id === newId!)?.name).toBe(
        'Renamed MindMap'
      );

      // For rename operations, we need to wait for the debounced save
      // Since we're using real timers now, we wait for the debounce delay
      await waitFor(
        () => {
          expect(mockFetch).toHaveBeenCalledWith('/api/mindmaps', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: expect.stringContaining('Renamed MindMap'),
          });
        },
        { timeout: 1000 }
      ); // Wait up to 1 second for debounced save (500ms delay)

      // Clear previous mock calls to track delete operation
      mockFetch.mockClear();

      // Delete the mind map
      await act(async () => {
        await result.current.deleteMindMap(newId!);
      });

      expect(result.current.mindMaps).toHaveLength(2);
      expect(result.current.activeMindMapId).toBe('2'); // Falls back to most recent

      // Wait for debounced save after deletion
      await waitFor(
        () => {
          expect(mockFetch).toHaveBeenCalledWith('/api/mindmaps', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: expect.not.stringContaining(newId!),
          });
        },
        { timeout: 1000 }
      );
    });
  });

  describe('error handling', () => {
    it('should handle network errors gracefully', async () => {
      // Start with successful load
      const { result } = renderHook(() => useMindMaps());

      await waitFor(
        () => {
          expect(result.current.isLoaded).toBe(true);
        },
        { timeout: 5000 }
      );

      // Clear the initial fetch call
      mockFetch.mockClear();

      // Mock network error for next save operation (the POST request)
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      // Try to create a mind map - this should update state but save operation will fail
      await act(async () => {
        try {
          await result.current.createMindMap('Will fail to save');
        } catch (error) {
          // Expected error - save operation should fail
          console.debug('Expected save error:', error);
        }
      });

      // State should still update optimistically even if save fails
      expect(result.current.mindMaps).toHaveLength(3);
      expect(result.current.mindMaps[0].name).toBe('Will fail to save');

      // The error might be caught and logged, or it might bubble up
      // depending on the implementation. In either case, the state should be updated.
    });

    it('should handle server errors gracefully', async () => {
      // Mock server error on initial load
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const { result } = renderHook(() => useMindMaps());

      await waitFor(
        () => {
          expect(result.current.isLoaded).toBe(true);
        },
        { timeout: 5000 }
      );

      // Should handle error and still initialize with empty state
      expect(result.current.mindMaps).toEqual([]);
      expect(result.current.activeMindMapId).toBe(null);
    });
  });

  describe('concurrent operations', () => {
    it('should handle rapid creation operations correctly', async () => {
      const { result } = renderHook(() => useMindMaps());

      await waitFor(
        () => {
          expect(result.current.isLoaded).toBe(true);
        },
        { timeout: 5000 }
      );

      // Verify initial state
      const initialCount = result.current.mindMaps.length;

      // Create multiple mind maps rapidly
      await act(async () => {
        await result.current.createMindMap('Rapid 1');
      });

      await act(async () => {
        await result.current.createMindMap('Rapid 2');
      });

      await act(async () => {
        await result.current.createMindMap('Rapid 3');
      });

      // Verify all mind maps were created
      expect(result.current.mindMaps).toHaveLength(initialCount + 3);

      // Verify they are in the correct order (newest first)
      expect(result.current.mindMaps[0].name).toBe('Rapid 3');
      expect(result.current.mindMaps[1].name).toBe('Rapid 2');
      expect(result.current.mindMaps[2].name).toBe('Rapid 1');

      // Verify the active mind map is the most recently created
      expect(result.current.activeMindMapId).toBe(
        result.current.mindMaps[0].id
      );
    });

    it('should handle rename operations correctly', async () => {
      const { result } = renderHook(() => useMindMaps());

      await waitFor(
        () => {
          expect(result.current.isLoaded).toBe(true);
        },
        { timeout: 5000 }
      );

      // Create a mind map to rename
      let testId: string;

      await act(async () => {
        testId = await result.current.createMindMap('Original Name');
      });

      // Verify it was created
      expect(result.current.mindMaps.find(m => m.id === testId!)?.name).toBe(
        'Original Name'
      );

      // Rename it
      await act(async () => {
        await result.current.renameMindMap(testId!, 'Updated Name');
      });

      // Verify the rename happened immediately (state update is synchronous)
      expect(result.current.mindMaps.find(m => m.id === testId!)?.name).toBe(
        'Updated Name'
      );

      // Wait for debounced save to complete
      await waitFor(
        () => {
          const saveCalls = mockFetch.mock.calls.filter(
            call =>
              call[0] === '/api/mindmaps' &&
              call[1]?.method === 'POST' &&
              call[1]?.body?.includes('Updated Name')
          );
          expect(saveCalls.length).toBeGreaterThanOrEqual(1);
        },
        { timeout: 1000 }
      );
    });
  });

  describe('state consistency', () => {
    it('should maintain consistency between mindMaps and activeMindMap', async () => {
      const { result } = renderHook(() => useMindMaps());

      await waitFor(
        () => {
          expect(result.current.isLoaded).toBe(true);
        },
        { timeout: 5000 }
      );

      // activeMindMap should always match the selected ID
      expect(result.current.activeMindMap).toEqual(
        result.current.mindMaps.find(
          m => m.id === result.current.activeMindMapId
        )
      );

      // Select different mind map
      act(() => {
        result.current.selectMindMap('1');
      });

      expect(result.current.activeMindMap).toEqual(
        result.current.mindMaps.find(m => m.id === '1')
      );

      // Delete active mind map
      await act(async () => {
        await result.current.deleteMindMap('1');
      });

      // Should update both lists and selection
      expect(result.current.mindMaps).toHaveLength(1);
      expect(result.current.activeMindMapId).toBe('2');
      expect(result.current.activeMindMap).toEqual(
        result.current.mindMaps.find(m => m.id === '2')
      );

      // Wait for the debounced save to complete
      await waitFor(
        () => {
          const saveCalls = mockFetch.mock.calls.filter(
            call => call[0] === '/api/mindmaps' && call[1]?.method === 'POST'
          );
          expect(saveCalls.length).toBeGreaterThanOrEqual(1);
        },
        { timeout: 1000 }
      );
    });

    it('should handle empty state correctly', async () => {
      // Mock empty response for initial load
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const { result } = renderHook(() => useMindMaps());

      await waitFor(
        () => {
          expect(result.current.isLoaded).toBe(true);
        },
        { timeout: 5000 }
      );

      expect(result.current.mindMaps).toEqual([]);
      expect(result.current.activeMindMapId).toBe(null);
      expect(result.current.activeMindMap).toBe(null);

      // Create first mind map
      await act(async () => {
        await result.current.createMindMap('First Map');
      });

      expect(result.current.mindMaps).toHaveLength(1);
      expect(result.current.activeMindMapId).toBeTruthy();
      expect(result.current.activeMindMap?.name).toBe('First Map');

      // Wait for the save to complete
      await waitFor(() => {
        const saveCalls = mockFetch.mock.calls.filter(
          call => call[0] === '/api/mindmaps' && call[1]?.method === 'POST'
        );
        expect(saveCalls.length).toBe(1);
      });
    });
  });
});
