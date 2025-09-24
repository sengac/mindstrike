import { useEffect, useCallback, startTransition } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { logger } from '../../utils/logger';
import { useMindMapState } from './useMindMapState';
import { useDebouncedSave } from './useDebouncedSave';
import { mindMapApi } from '../services/mindMapApi';
import {
  sortMindMapsByDate,
  selectDefaultMindMap,
  createNewMindMap,
} from '../utils/mindMapUtils';

export interface MindMap {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  [key: string]: unknown; // Allow additional properties for ListItem compatibility
}

/**
 * Main hook for managing mind maps
 * Composes state management, API operations, and business logic
 */
export function useMindMaps() {
  const workspaceVersion = useAppStore(state => state.workspaceVersion);
  const {
    mindMaps,
    setMindMaps,
    activeMindMapId,
    setActiveMindMapId,
    activeMindMap,
    isLoaded,
    setIsLoaded,
  } = useMindMapState();

  // Debounced save function
  const save = useDebouncedSave(mindMapApi.save);

  // Pure data loading - no dependencies on state
  const loadMindMapsData = useCallback(async () => {
    try {
      const data = await mindMapApi.fetchAll();
      return sortMindMapsByDate(data);
    } catch (error) {
      logger.error('Failed to load mindmaps:', error);
      return [];
    }
  }, []); // No dependencies!

  // Load and update state
  const loadMindMaps = useCallback(
    async (preserveActiveId = false) => {
      const sorted = await loadMindMapsData();

      startTransition(() => {
        setMindMaps(sorted);

        if (!preserveActiveId || !activeMindMapId) {
          // Select first if not preserving or no current selection
          const newActiveId = sorted.length > 0 ? sorted[0].id : null;
          setActiveMindMapId(newActiveId);
        } else if (preserveActiveId && activeMindMapId) {
          // Check if current selection still exists
          const stillExists = sorted.some(m => m.id === activeMindMapId);
          if (!stillExists) {
            const newActiveId = sorted.length > 0 ? sorted[0].id : null;
            setActiveMindMapId(newActiveId);
          }
        }

        setIsLoaded(true);
      });
    },
    [
      loadMindMapsData,
      setMindMaps,
      setActiveMindMapId,
      setIsLoaded,
      activeMindMapId,
    ]
  );

  // Initial load - separate effect with minimal dependencies
  useEffect(() => {
    if (!isLoaded) {
      loadMindMaps(false).catch(error => {
        logger.error('Failed to load mindmaps on mount:', error);
      });
    }
  }, [workspaceVersion]); // Only depend on workspace, not loadMindMaps

  // CRUD operations
  const createMindMap = useCallback(
    async (name?: string): Promise<string> => {
      const newMindMap = createNewMindMap(name, mindMaps.length);
      const updated = [newMindMap, ...mindMaps];

      setMindMaps(updated);
      setActiveMindMapId(newMindMap.id);

      await save(updated, true); // Save immediately
      return newMindMap.id;
    },
    [mindMaps, setMindMaps, setActiveMindMapId, save]
  );

  const deleteMindMap = useCallback(
    async (id: string) => {
      const updated = mindMaps.filter(m => m.id !== id);

      startTransition(() => {
        setMindMaps(updated);
        if (activeMindMapId === id) {
          const newActiveId = selectDefaultMindMap(updated, null, false);
          setActiveMindMapId(newActiveId);
        }
      });

      await save(updated);
    },
    [mindMaps, activeMindMapId, setMindMaps, setActiveMindMapId, save]
  );

  const renameMindMap = useCallback(
    async (id: string, newName: string) => {
      const updated = mindMaps.map(m =>
        m.id === id ? { ...m, name: newName, updatedAt: new Date() } : m
      );
      const sorted = sortMindMapsByDate(updated);

      setMindMaps(sorted);
      await save(sorted);
    },
    [mindMaps, setMindMaps, save]
  );

  const selectMindMap = useCallback(
    (id: string) => {
      setActiveMindMapId(id);
    },
    [setActiveMindMapId]
  );

  return {
    mindMaps,
    activeMindMapId,
    activeMindMap,
    isLoaded,
    loadMindMaps,
    createMindMap,
    deleteMindMap,
    renameMindMap,
    selectMindMap,
  };
}
