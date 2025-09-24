import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { MindMap } from '../hooks/useMindMaps';

export interface MindMapStore {
  // State
  mindMaps: MindMap[];
  activeMindMapId: string | null;
  isLoading: boolean;
  isLoaded: boolean;
  error: Error | null;

  // Actions - all synchronous
  setMindMaps: (mindMaps: MindMap[]) => void;
  setActiveMindMapId: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  setLoaded: (loaded: boolean) => void;
  setError: (error: Error | null) => void;

  // Computed getters
  getActiveMindMap: () => MindMap | null;
  reset: () => void;
}

const initialState = {
  mindMaps: [],
  activeMindMapId: null,
  isLoading: false,
  isLoaded: false,
  error: null,
};

/**
 * Simplified mind map store with only synchronous operations.
 * All async operations are handled in the operations layer.
 */
export const useMindMapStore = create<MindMapStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      // Synchronous setters
      setMindMaps: mindMaps => set({ mindMaps }, false, 'setMindMaps'),

      setActiveMindMapId: activeMindMapId =>
        set({ activeMindMapId }, false, 'setActiveMindMapId'),

      setLoading: isLoading => set({ isLoading }, false, 'setLoading'),

      setLoaded: isLoaded => set({ isLoaded }, false, 'setLoaded'),

      setError: error => set({ error }, false, 'setError'),

      // Computed getter
      getActiveMindMap: () => {
        const { mindMaps, activeMindMapId } = get();
        return mindMaps.find(m => m.id === activeMindMapId) || null;
      },

      // Reset to initial state
      reset: () => set(initialState, false, 'reset'),
    }),
    { name: 'mind-map-store' }
  )
);
