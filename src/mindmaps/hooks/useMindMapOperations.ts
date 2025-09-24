import { useCallback } from 'react';
import { useMindMapStore } from '../stores/mindMapStore';
import { mindMapRepository } from '../repositories/MindMapRepository';
import {
  createNewMindMap,
  updateMindMapInList,
  removeMindMapFromList,
  sortMindMapsByDate,
} from '../utils/mindMapUtils';
import type { MindMap } from './useMindMaps';

/**
 * Hook that provides all mind map operations.
 * This is the business logic layer - it coordinates between the store and repository.
 * All operations are explicit and return promises where appropriate.
 */
export function useMindMapOperations() {
  const { setMindMaps, setActiveMindMapId, setLoading, setLoaded, setError } =
    useMindMapStore();

  /**
   * Load mind maps from the server.
   * This is an explicit operation - no automatic loading.
   */
  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const data = await mindMapRepository.load();
      const sorted = sortMindMapsByDate(data);
      setMindMaps(sorted);
      setLoaded(true);

      // Auto-select first mind map if none selected
      if (sorted.length > 0 && !useMindMapStore.getState().activeMindMapId) {
        setActiveMindMapId(sorted[0].id);
      }
    } catch (error) {
      setError(error as Error);
      setMindMaps([]);
    } finally {
      setLoading(false);
    }
  }, [setMindMaps, setActiveMindMapId, setLoading, setLoaded, setError]);

  /**
   * Save current mind maps to the server.
   * This is an explicit operation - caller decides when to save.
   */
  const save = useCallback(async (): Promise<void> => {
    const currentMindMaps = useMindMapStore.getState().mindMaps;
    await mindMapRepository.save(currentMindMaps);
  }, []);

  /**
   * Create a new mind map.
   * Updates state immediately, but save is separate.
   */
  const create = useCallback(
    (name?: string): MindMap => {
      const currentMindMaps = useMindMapStore.getState().mindMaps;
      const newMindMap = createNewMindMap(name, currentMindMaps.length);
      const updated = [newMindMap, ...currentMindMaps];

      setMindMaps(updated);
      setActiveMindMapId(newMindMap.id);

      return newMindMap;
    },
    [setMindMaps, setActiveMindMapId]
  );

  /**
   * Update a mind map.
   * Updates state immediately, but save is separate.
   */
  const update = useCallback(
    (id: string, updates: Partial<MindMap>): void => {
      const currentMindMaps = useMindMapStore.getState().mindMaps;
      const updated = updateMindMapInList(currentMindMaps, id, updates);
      setMindMaps(updated);
    },
    [setMindMaps]
  );

  /**
   * Delete a mind map.
   * Updates state immediately, but save is separate.
   */
  const remove = useCallback(
    (id: string): void => {
      const state = useMindMapStore.getState();
      const updated = removeMindMapFromList(state.mindMaps, id);

      setMindMaps(updated);

      // Update selection if we deleted the active mind map
      if (state.activeMindMapId === id) {
        const newActive = updated.length > 0 ? updated[0].id : null;
        setActiveMindMapId(newActive);
      }
    },
    [setMindMaps, setActiveMindMapId]
  );

  /**
   * Select a mind map by ID.
   */
  const select = useCallback(
    (id: string | null): void => {
      setActiveMindMapId(id);
    },
    [setActiveMindMapId]
  );

  /**
   * Create and save a mind map in one operation.
   * Convenience method for common use case.
   */
  const createAndSave = useCallback(
    async (name?: string): Promise<MindMap> => {
      const newMindMap = create(name);
      await save();
      return newMindMap;
    },
    [create, save]
  );

  /**
   * Update and save a mind map in one operation.
   * Convenience method for common use case.
   */
  const updateAndSave = useCallback(
    async (id: string, updates: Partial<MindMap>): Promise<void> => {
      update(id, updates);
      await save();
    },
    [update, save]
  );

  /**
   * Delete and save in one operation.
   * Convenience method for common use case.
   */
  const removeAndSave = useCallback(
    async (id: string): Promise<void> => {
      remove(id);
      await save();
    },
    [remove, save]
  );

  return {
    // Basic operations
    load,
    save,
    create,
    update,
    remove,
    select,

    // Convenience methods
    createAndSave,
    updateAndSave,
    removeAndSave,
  };
}
