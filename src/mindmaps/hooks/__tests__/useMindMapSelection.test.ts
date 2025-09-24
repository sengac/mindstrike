import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMindMapSelection } from '../useMindMapSelection';
import type { MindMap } from '../useMindMaps';

describe('useMindMapSelection', () => {
  const createMockMindMap = (id: string, name: string): MindMap => ({
    id,
    name,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  it('should select first available mind map', () => {
    const mindMaps = [
      createMockMindMap('1', 'Map 1'),
      createMockMindMap('2', 'Map 2'),
    ];
    const setActiveMindMapId = vi.fn();

    const { result } = renderHook(() =>
      useMindMapSelection({
        mindMaps,
        activeMindMapId: null,
        setActiveMindMapId,
      })
    );

    act(() => {
      const selectedId = result.current.selectFirstAvailable();
      expect(selectedId).toBe('1');
    });

    expect(setActiveMindMapId).toHaveBeenCalledWith('1');
  });

  it('should return null when no mind maps available', () => {
    const setActiveMindMapId = vi.fn();

    const { result } = renderHook(() =>
      useMindMapSelection({
        mindMaps: [],
        activeMindMapId: null,
        setActiveMindMapId,
      })
    );

    act(() => {
      const selectedId = result.current.selectFirstAvailable();
      expect(selectedId).toBeNull();
    });

    expect(setActiveMindMapId).toHaveBeenCalledWith(null);
  });

  describe('validateSelection', () => {
    it('should clear selection when no mind maps', () => {
      const setActiveMindMapId = vi.fn();

      const { result } = renderHook(() =>
        useMindMapSelection({
          mindMaps: [],
          activeMindMapId: '1',
          setActiveMindMapId,
        })
      );

      act(() => {
        const validId = result.current.validateSelection();
        expect(validId).toBeNull();
      });

      expect(setActiveMindMapId).toHaveBeenCalledWith(null);
    });

    it('should use preferred ID when valid', () => {
      const mindMaps = [
        createMockMindMap('1', 'Map 1'),
        createMockMindMap('2', 'Map 2'),
      ];
      const setActiveMindMapId = vi.fn();

      const { result } = renderHook(() =>
        useMindMapSelection({
          mindMaps,
          activeMindMapId: '1',
          setActiveMindMapId,
        })
      );

      act(() => {
        const validId = result.current.validateSelection('2');
        expect(validId).toBe('2');
      });

      expect(setActiveMindMapId).toHaveBeenCalledWith('2');
    });

    it('should keep current selection when valid', () => {
      const mindMaps = [
        createMockMindMap('1', 'Map 1'),
        createMockMindMap('2', 'Map 2'),
      ];
      const setActiveMindMapId = vi.fn();

      const { result } = renderHook(() =>
        useMindMapSelection({
          mindMaps,
          activeMindMapId: '2',
          setActiveMindMapId,
        })
      );

      act(() => {
        const validId = result.current.validateSelection();
        expect(validId).toBe('2');
      });

      // Should not call setter if selection is already valid
      expect(setActiveMindMapId).not.toHaveBeenCalled();
    });

    it('should fallback to first when current selection invalid', () => {
      const mindMaps = [
        createMockMindMap('1', 'Map 1'),
        createMockMindMap('2', 'Map 2'),
      ];
      const setActiveMindMapId = vi.fn();

      const { result } = renderHook(() =>
        useMindMapSelection({
          mindMaps,
          activeMindMapId: 'invalid',
          setActiveMindMapId,
        })
      );

      act(() => {
        const validId = result.current.validateSelection();
        expect(validId).toBe('1');
      });

      expect(setActiveMindMapId).toHaveBeenCalledWith('1');
    });

    it('should ignore invalid preferred ID', () => {
      const mindMaps = [
        createMockMindMap('1', 'Map 1'),
        createMockMindMap('2', 'Map 2'),
      ];
      const setActiveMindMapId = vi.fn();

      const { result } = renderHook(() =>
        useMindMapSelection({
          mindMaps,
          activeMindMapId: '1',
          setActiveMindMapId,
        })
      );

      act(() => {
        const validId = result.current.validateSelection('invalid');
        expect(validId).toBe('1');
      });

      // Should not change selection
      expect(setActiveMindMapId).not.toHaveBeenCalled();
    });
  });

  describe('selectMindMap', () => {
    it('should select valid mind map', () => {
      const mindMaps = [
        createMockMindMap('1', 'Map 1'),
        createMockMindMap('2', 'Map 2'),
      ];
      const setActiveMindMapId = vi.fn();

      const { result } = renderHook(() =>
        useMindMapSelection({
          mindMaps,
          activeMindMapId: '1',
          setActiveMindMapId,
        })
      );

      act(() => {
        const success = result.current.selectMindMap('2');
        expect(success).toBe(true);
      });

      expect(setActiveMindMapId).toHaveBeenCalledWith('2');
    });

    it('should reject invalid mind map ID', () => {
      const mindMaps = [createMockMindMap('1', 'Map 1')];
      const setActiveMindMapId = vi.fn();

      const { result } = renderHook(() =>
        useMindMapSelection({
          mindMaps,
          activeMindMapId: '1',
          setActiveMindMapId,
        })
      );

      act(() => {
        const success = result.current.selectMindMap('invalid');
        expect(success).toBe(false);
      });

      expect(setActiveMindMapId).not.toHaveBeenCalled();
    });
  });

  describe('handleActiveDeleted', () => {
    it('should select first available after deletion', () => {
      const mindMaps = [
        createMockMindMap('1', 'Map 1'),
        createMockMindMap('2', 'Map 2'),
      ];
      const setActiveMindMapId = vi.fn();

      const { result } = renderHook(() =>
        useMindMapSelection({
          mindMaps,
          activeMindMapId: '1',
          setActiveMindMapId,
        })
      );

      act(() => {
        const newId = result.current.handleActiveDeleted();
        expect(newId).toBe('1');
      });

      expect(setActiveMindMapId).toHaveBeenCalledWith('1');
    });
  });

  it('should handle state updates correctly', () => {
    const initialMindMaps = [createMockMindMap('1', 'Map 1')];
    const setActiveMindMapId = vi.fn();

    const { result, rerender } = renderHook(
      ({ mindMaps, activeMindMapId }) =>
        useMindMapSelection({
          mindMaps,
          activeMindMapId,
          setActiveMindMapId,
        }),
      {
        initialProps: {
          mindMaps: initialMindMaps,
          activeMindMapId: '1',
        },
      }
    );

    // Add a new mind map
    const updatedMindMaps = [
      ...initialMindMaps,
      createMockMindMap('2', 'Map 2'),
    ];

    rerender({
      mindMaps: updatedMindMaps,
      activeMindMapId: '1',
    });

    act(() => {
      const success = result.current.selectMindMap('2');
      expect(success).toBe(true);
    });

    expect(setActiveMindMapId).toHaveBeenCalledWith('2');
  });
});
