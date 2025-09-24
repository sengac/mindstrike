import React, { createContext, useContext, useEffect } from 'react';
import { useMindMapOperations } from '../hooks/useMindMapOperations';
import { useMindMapStoreData } from '../hooks/useMindMapStoreData';
import { useAppStore } from '../../store/useAppStore';

interface MindMapContextValue {
  // Data
  mindMaps: ReturnType<typeof useMindMapStoreData>['mindMaps'];
  activeMindMapId: ReturnType<typeof useMindMapStoreData>['activeMindMapId'];
  activeMindMap: ReturnType<typeof useMindMapStoreData>['activeMindMap'];
  isLoading: ReturnType<typeof useMindMapStoreData>['isLoading'];
  isLoaded: ReturnType<typeof useMindMapStoreData>['isLoaded'];
  error: ReturnType<typeof useMindMapStoreData>['error'];

  // Operations
  load: ReturnType<typeof useMindMapOperations>['load'];
  create: ReturnType<typeof useMindMapOperations>['create'];
  update: ReturnType<typeof useMindMapOperations>['update'];
  remove: ReturnType<typeof useMindMapOperations>['remove'];
  select: ReturnType<typeof useMindMapOperations>['select'];
  save: ReturnType<typeof useMindMapOperations>['save'];

  // Convenience operations
  createAndSave: ReturnType<typeof useMindMapOperations>['createAndSave'];
  updateAndSave: ReturnType<typeof useMindMapOperations>['updateAndSave'];
  removeAndSave: ReturnType<typeof useMindMapOperations>['removeAndSave'];

  // Legacy compatibility methods (to ease migration)
  loadMindMaps: (preserveActiveId?: boolean) => Promise<void>;
  createMindMap: (name?: string) => string;
  deleteMindMap: (id: string) => Promise<void>;
  renameMindMap: (id: string, newName: string) => Promise<void>;
  selectMindMap: (id: string) => void;
}

const MindMapContext = createContext<MindMapContextValue | null>(null);

export function useMindMapData() {
  const context = useContext(MindMapContext);
  if (!context) {
    throw new Error('useMindMapData must be used within MindMapDataProvider');
  }
  return context;
}

interface MindMapDataProviderProps {
  children: React.ReactNode;
  autoLoad?: boolean;
}

export function MindMapDataProvider({
  children,
  autoLoad = true,
}: MindMapDataProviderProps) {
  const data = useMindMapStoreData();
  const operations = useMindMapOperations();
  const { workspaceVersion } = useAppStore();

  // Auto-load on mount if enabled
  useEffect(() => {
    if (autoLoad && !data.isLoaded) {
      operations.load();
    }
  }, [autoLoad, data.isLoaded, operations]);

  // Reload when workspace changes
  useEffect(() => {
    if (data.isLoaded && workspaceVersion) {
      operations.load();
    }
  }, [workspaceVersion]);

  // Create legacy compatibility methods
  const loadMindMaps = async (preserveActiveId = false) => {
    await operations.load();
    if (!preserveActiveId && data.mindMaps.length > 0) {
      // Select the first (most recent) mind map
      operations.select(data.mindMaps[0].id);
    }
  };

  const createMindMap = (name?: string): string => {
    const mindMap = operations.create(name);
    // Save immediately for legacy compatibility
    operations.save();
    return mindMap.id;
  };

  const deleteMindMap = async (id: string) => {
    await operations.removeAndSave(id);
  };

  const renameMindMap = async (id: string, newName: string) => {
    await operations.updateAndSave(id, { name: newName });
  };

  const selectMindMap = (id: string) => {
    operations.select(id);
  };

  const value: MindMapContextValue = {
    // Data
    ...data,

    // Operations
    ...operations,

    // Legacy compatibility
    loadMindMaps,
    createMindMap,
    deleteMindMap,
    renameMindMap,
    selectMindMap,
  };

  return (
    <MindMapContext.Provider value={value}>{children}</MindMapContext.Provider>
  );
}
