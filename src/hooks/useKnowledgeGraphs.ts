import { useState, useEffect, useCallback, useRef } from 'react';

export interface KnowledgeGraph {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export function useKnowledgeGraphs(workspaceRestored: boolean = true) {
  const [knowledgeGraphs, setKnowledgeGraphs] = useState<KnowledgeGraph[]>([]);
  const [activeKnowledgeGraphId, setActiveKnowledgeGraphId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const loadKnowledgeGraphs = useCallback(async () => {
    try {
      const response = await fetch('/api/knowledge-graphs');
      if (response.ok) {
        const data = await response.json();
        const parsedKnowledgeGraphs = data.map((graph: any) => ({
          ...graph,
          createdAt: new Date(graph.createdAt),
          updatedAt: new Date(graph.updatedAt)
        }));
        setKnowledgeGraphs(parsedKnowledgeGraphs);
        
        // Set the most recently updated knowledge graph as active
        if (parsedKnowledgeGraphs.length > 0) {
          const mostRecent = parsedKnowledgeGraphs.sort((a: KnowledgeGraph, b: KnowledgeGraph) => 
            b.updatedAt.getTime() - a.updatedAt.getTime()
          )[0];
          setActiveKnowledgeGraphId(mostRecent.id);
        }
      }
    } catch (error) {
      console.error('Failed to load knowledge graphs from file:', error);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Load knowledge graphs from mindstrike-graphs.json file on mount
  useEffect(() => {
    if (workspaceRestored) {
      loadKnowledgeGraphs();
    }
  }, [loadKnowledgeGraphs, workspaceRestored]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Save knowledge graphs to mindstrike-graphs.json file with debouncing
  const saveKnowledgeGraphs = useCallback(async (graphsToSave: KnowledgeGraph[]) => {
    // Clear any existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce the save operation
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch('/api/knowledge-graphs', {
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
        console.error('Failed to save knowledge graphs to file:', error);
      }
    }, 500);
  }, []);

  const createKnowledgeGraph = useCallback(async (name?: string): Promise<string> => {
    const newKnowledgeGraph: KnowledgeGraph = {
      id: Date.now().toString(),
      name: name || `Knowledge Graph ${knowledgeGraphs.length + 1}`,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const updatedKnowledgeGraphs = [newKnowledgeGraph, ...knowledgeGraphs];
    setKnowledgeGraphs(updatedKnowledgeGraphs);
    setActiveKnowledgeGraphId(newKnowledgeGraph.id);
    await saveKnowledgeGraphs(updatedKnowledgeGraphs);
    
    return newKnowledgeGraph.id;
  }, [knowledgeGraphs, saveKnowledgeGraphs]);

  const deleteKnowledgeGraph = useCallback(async (graphId: string) => {
    const updatedKnowledgeGraphs = knowledgeGraphs.filter(g => g.id !== graphId);
    setKnowledgeGraphs(updatedKnowledgeGraphs);
    
    if (activeKnowledgeGraphId === graphId) {
      const newActiveId = updatedKnowledgeGraphs.length > 0 ? updatedKnowledgeGraphs[0].id : null;
      setActiveKnowledgeGraphId(newActiveId);
    }
    
    await saveKnowledgeGraphs(updatedKnowledgeGraphs);
  }, [knowledgeGraphs, activeKnowledgeGraphId, saveKnowledgeGraphs]);

  const renameKnowledgeGraph = useCallback(async (graphId: string, newName: string) => {
    const updatedKnowledgeGraphs = knowledgeGraphs.map(graph =>
      graph.id === graphId
        ? { ...graph, name: newName, updatedAt: new Date() }
        : graph
    );
    setKnowledgeGraphs(updatedKnowledgeGraphs);
    await saveKnowledgeGraphs(updatedKnowledgeGraphs);
  }, [knowledgeGraphs, saveKnowledgeGraphs]);

  const getActiveKnowledgeGraph = useCallback(() => {
    return knowledgeGraphs.find(g => g.id === activeKnowledgeGraphId) || null;
  }, [knowledgeGraphs, activeKnowledgeGraphId]);

  const selectKnowledgeGraph = useCallback(async (graphId: string) => {
    setActiveKnowledgeGraphId(graphId);
  }, []);

  return {
    knowledgeGraphs,
    activeKnowledgeGraphId,
    activeKnowledgeGraph: getActiveKnowledgeGraph(),
    isLoaded,
    loadKnowledgeGraphs,
    createKnowledgeGraph,
    deleteKnowledgeGraph,
    renameKnowledgeGraph,
    selectKnowledgeGraph
  };
}
