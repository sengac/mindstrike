import { useCallback } from 'react';
import { useMindMapGeneration } from '../store/useMindMapStore';
import { useDebugStore } from '../store/useDebugStore';

export function useIterativeGeneration() {
  const { isGenerating, startIterativeGeneration, setGenerating } =
    useMindMapGeneration();

  const { setGenerating: setDebugGenerating } = useDebugStore();

  const startGeneration = useCallback(
    async (mindMapId: string, prompt: string, selectedNodeId: string) => {
      if (isGenerating) {
        return;
      }

      // Set debug state
      setDebugGenerating(true);

      try {
        // All business logic is now in the store
        await startIterativeGeneration(mindMapId, prompt, selectedNodeId);
      } finally {
        setDebugGenerating(false);
      }
    },
    [isGenerating, startIterativeGeneration, setDebugGenerating]
  );

  const cancelGeneration = useCallback(async () => {
    setGenerating(false);
    setDebugGenerating(false);
  }, [setGenerating, setDebugGenerating]);

  return {
    isGenerating,
    startGeneration,
    cancelGeneration,
  };
}
