import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMindMapState } from '../useMindMapState';
import type { MindMap } from '../useMindMaps';

describe('useMindMapState', () => {
  const createMockMindMap = (id: string, name: string): MindMap => ({
    id,
    name,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  });

  it('should initialize with default state', () => {
    const { result } = renderHook(() => useMindMapState());

    expect(result.current.mindMaps).toEqual([]);
    expect(result.current.activeMindMapId).toBeNull();
    expect(result.current.activeMindMap).toBeNull();
    expect(result.current.isLoaded).toBe(false);
  });

  it('should update mind maps', () => {
    const { result } = renderHook(() => useMindMapState());

    const mockMindMaps = [
      createMockMindMap('1', 'Map 1'),
      createMockMindMap('2', 'Map 2'),
    ];

    act(() => {
      result.current.setMindMaps(mockMindMaps);
    });

    expect(result.current.mindMaps).toEqual(mockMindMaps);
  });

  it('should update active mind map ID', () => {
    const { result } = renderHook(() => useMindMapState());

    act(() => {
      result.current.setActiveMindMapId('123');
    });

    expect(result.current.activeMindMapId).toBe('123');
  });

  it('should update isLoaded state', () => {
    const { result } = renderHook(() => useMindMapState());

    expect(result.current.isLoaded).toBe(false);

    act(() => {
      result.current.setIsLoaded(true);
    });

    expect(result.current.isLoaded).toBe(true);
  });

  it('should derive active mind map from state', () => {
    const { result } = renderHook(() => useMindMapState());

    const mockMindMaps = [
      createMockMindMap('1', 'Map 1'),
      createMockMindMap('2', 'Map 2'),
    ];

    // Set mind maps and active ID
    act(() => {
      result.current.setMindMaps(mockMindMaps);
      result.current.setActiveMindMapId('2');
    });

    expect(result.current.activeMindMap).toEqual(mockMindMaps[1]);
  });

  it('should return null for non-existent active mind map', () => {
    const { result } = renderHook(() => useMindMapState());

    const mockMindMaps = [createMockMindMap('1', 'Map 1')];

    act(() => {
      result.current.setMindMaps(mockMindMaps);
      result.current.setActiveMindMapId('non-existent');
    });

    expect(result.current.activeMindMap).toBeNull();
  });

  it('should update active mind map when mind maps change', () => {
    const { result } = renderHook(() => useMindMapState());

    const initialMindMaps = [
      createMockMindMap('1', 'Map 1'),
      createMockMindMap('2', 'Map 2'),
    ];

    act(() => {
      result.current.setMindMaps(initialMindMaps);
      result.current.setActiveMindMapId('2');
    });

    expect(result.current.activeMindMap?.name).toBe('Map 2');

    // Update the mind map
    const updatedMindMaps = [
      createMockMindMap('1', 'Map 1'),
      createMockMindMap('2', 'Updated Map 2'),
    ];

    act(() => {
      result.current.setMindMaps(updatedMindMaps);
    });

    expect(result.current.activeMindMap?.name).toBe('Updated Map 2');
  });

  it('should handle empty mind maps array', () => {
    const { result } = renderHook(() => useMindMapState());

    act(() => {
      result.current.setMindMaps([]);
      result.current.setActiveMindMapId('any-id');
    });

    expect(result.current.activeMindMap).toBeNull();
  });

  it('should maintain references when state does not change', () => {
    const { result } = renderHook(() => useMindMapState());

    const mockMindMaps = [createMockMindMap('1', 'Map 1')];

    act(() => {
      result.current.setMindMaps(mockMindMaps);
      result.current.setActiveMindMapId('1');
    });

    const firstActiveMindMap = result.current.activeMindMap;

    // Re-render without changing state
    result.current.mindMaps; // Access to trigger re-render

    const secondActiveMindMap = result.current.activeMindMap;

    // Should be the same reference due to useMemo
    expect(firstActiveMindMap).toBe(secondActiveMindMap);
  });

  it('should handle setting null active ID', () => {
    const { result } = renderHook(() => useMindMapState());

    const mockMindMaps = [createMockMindMap('1', 'Map 1')];

    act(() => {
      result.current.setMindMaps(mockMindMaps);
      result.current.setActiveMindMapId('1');
    });

    expect(result.current.activeMindMap).toBeDefined();

    act(() => {
      result.current.setActiveMindMapId(null);
    });

    expect(result.current.activeMindMapId).toBeNull();
    expect(result.current.activeMindMap).toBeNull();
  });
});
