import { useState, useMemo } from 'react';
import type { MindMap } from './useMindMaps';

/**
 * Hook for managing mind map state
 * Separates state management from business logic
 */
export function useMindMapState() {
  const [mindMaps, setMindMaps] = useState<MindMap[]>([]);
  const [activeMindMapId, setActiveMindMapId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Derive active mind map from state
  const activeMindMap = useMemo(
    () => mindMaps.find(m => m.id === activeMindMapId) ?? null,
    [mindMaps, activeMindMapId]
  );

  return {
    // State
    mindMaps,
    activeMindMapId,
    activeMindMap,
    isLoaded,

    // State setters
    setMindMaps,
    setActiveMindMapId,
    setIsLoaded,
  };
}
