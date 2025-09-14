import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';

export interface MindMap {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export function useMindMaps() {
  const workspaceVersion = useAppStore((state) => state.workspaceVersion);
  const [mindMaps, setMindMaps] = useState<MindMap[]>([]);
  const [activeMindMapId, setActiveMindMapId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const loadMindMaps = useCallback(async (preserveActiveId = false) => {
    try {
      const response = await fetch('/api/mindmaps');
      if (response.ok) {
        const data = await response.json();
        const parsedMindMaps = data.map((graph: any) => ({
          ...graph,
          createdAt: new Date(graph.createdAt),
          updatedAt: new Date(graph.updatedAt)
        })).sort((a: MindMap, b: MindMap) => 
          b.updatedAt.getTime() - a.updatedAt.getTime()
        );
        setMindMaps(parsedMindMaps);
        
        // Set active MindMap - preserve current selection if requested, otherwise pick most recently updated
        if (parsedMindMaps.length > 0) {
          if (preserveActiveId) {
            // Keep current active mindmap if it still exists
            if (activeMindMapId && parsedMindMaps.some(m => m.id === activeMindMapId)) {
              // Current active mindmap still exists, keep it
            } else {
              // Current active mindmap doesn't exist, pick most recently updated
              setActiveMindMapId(parsedMindMaps[0].id);
            }
          } else {
            // Always pick the most recently updated mindmap (first in sorted array)
            setActiveMindMapId(parsedMindMaps[0].id);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load mindmaps from file:', error);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Load mindmaps from mindstrike-mindmaps.json file on mount and when workspace changes
  useEffect(() => {
    loadMindMaps();
  }, [loadMindMaps, workspaceVersion]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Save mindmaps to mindstrike-mindmaps.json file with debouncing
  const saveMindMaps = useCallback(async (graphsToSave: MindMap[], immediate = false) => {
    if (immediate) {
      // Immediate save without debouncing
      try {
        const response = await fetch('/api/mindmaps', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(graphsToSave)
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
      } catch (error) {
        console.error('Failed to save mindmaps to file:', error);
      }
    } else {
      // Clear any existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Debounce the save operation
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          const response = await fetch('/api/mindmaps', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(graphsToSave)
          });
          
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
        } catch (error) {
          console.error('Failed to save mindmaps to file:', error);
        }
      }, 500);
    }
  }, []);

  const createMindMap = useCallback(async (name?: string): Promise<string> => {
    const newMindMap: MindMap = {
      id: Date.now().toString(),
      name: name || `MindMap ${mindMaps.length + 1}`,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const updatedMindMaps = [newMindMap, ...mindMaps];
    setMindMaps(updatedMindMaps);
    
    // Save the mindmaps immediately (no debounce) to ensure the file is written with initial data
    await saveMindMaps(updatedMindMaps, true);
    
    // Only set active mindmap after saving is complete
    setActiveMindMapId(newMindMap.id);
    
    return newMindMap.id;
  }, [mindMaps, saveMindMaps]);

  const deleteMindMap = useCallback(async (graphId: string) => {
    const updatedMindMaps = mindMaps.filter(g => g.id !== graphId);
    setMindMaps(updatedMindMaps);
    
    if (activeMindMapId === graphId) {
      const newActiveId = updatedMindMaps.length > 0 ? updatedMindMaps[0].id : null;
      setActiveMindMapId(newActiveId);
    }
    
    await saveMindMaps(updatedMindMaps);
  }, [mindMaps, activeMindMapId, saveMindMaps]);

  const renameMindMap = useCallback(async (graphId: string, newName: string) => {
    const updatedMindMaps = mindMaps.map(graph =>
      graph.id === graphId
        ? { ...graph, name: newName, updatedAt: new Date() }
        : graph
    ).sort((a: MindMap, b: MindMap) => 
      b.updatedAt.getTime() - a.updatedAt.getTime()
    );
    setMindMaps(updatedMindMaps);
    await saveMindMaps(updatedMindMaps);
  }, [mindMaps, saveMindMaps]);

  const getActiveMindMap = useCallback(() => {
    return mindMaps.find(g => g.id === activeMindMapId) || null;
  }, [mindMaps, activeMindMapId]);

  const selectMindMap = useCallback(async (graphId: string) => {
    setActiveMindMapId(graphId);
  }, []);

  return {
    mindMaps,
    activeMindMapId,
    activeMindMap: getActiveMindMap(),
    isLoaded,
    loadMindMaps,
    createMindMap,
    deleteMindMap,
    renameMindMap,
    selectMindMap
  };
}
