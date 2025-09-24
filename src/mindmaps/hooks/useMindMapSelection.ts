import { useCallback } from 'react';
import type { MindMap } from './useMindMaps';

interface SelectionOptions {
  mindMaps: MindMap[];
  activeMindMapId: string | null;
  setActiveMindMapId: (id: string | null) => void;
}

/**
 * Hook that manages mind map selection logic
 * Handles selection validation and fallback selection
 */
export function useMindMapSelection({
  mindMaps,
  activeMindMapId,
  setActiveMindMapId,
}: SelectionOptions) {
  // Select the first available mind map
  const selectFirstAvailable = useCallback(() => {
    const firstId = mindMaps.length > 0 ? mindMaps[0].id : null;
    setActiveMindMapId(firstId);
    return firstId;
  }, [mindMaps, setActiveMindMapId]);

  // Validate and update selection
  const validateSelection = useCallback(
    (preferredId?: string | null): string | null => {
      // If no mind maps, clear selection
      if (mindMaps.length === 0) {
        setActiveMindMapId(null);
        return null;
      }

      // If preferred ID is provided and exists, use it
      if (preferredId && mindMaps.some(m => m.id === preferredId)) {
        setActiveMindMapId(preferredId);
        return preferredId;
      }

      // If current selection is valid, keep it
      if (activeMindMapId && mindMaps.some(m => m.id === activeMindMapId)) {
        return activeMindMapId;
      }

      // Otherwise, select first available
      return selectFirstAvailable();
    },
    [mindMaps, activeMindMapId, setActiveMindMapId, selectFirstAvailable]
  );

  // Select a specific mind map
  const selectMindMap = useCallback(
    (id: string) => {
      if (mindMaps.some(m => m.id === id)) {
        setActiveMindMapId(id);
        return true;
      }
      return false;
    },
    [mindMaps, setActiveMindMapId]
  );

  // Handle deletion of active mind map
  const handleActiveDeleted = useCallback(() => {
    return selectFirstAvailable();
  }, [selectFirstAvailable]);

  return {
    selectFirstAvailable,
    validateSelection,
    selectMindMap,
    handleActiveDeleted,
  };
}
