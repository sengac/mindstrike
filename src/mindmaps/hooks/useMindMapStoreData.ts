import { useMindMapStore } from '../stores/mindMapStore';

/**
 * Hook for accessing mind map data only.
 * This is a read-only view of the store state.
 */
export function useMindMapStoreData() {
  const {
    mindMaps,
    activeMindMapId,
    isLoading,
    isLoaded,
    error,
    getActiveMindMap,
  } = useMindMapStore();

  return {
    mindMaps,
    activeMindMapId,
    activeMindMap: getActiveMindMap(),
    isLoading,
    isLoaded,
    error,
  };
}
