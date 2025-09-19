import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Simplified - only store the last used model ID
export interface LastUsedModel {
  modelId: string;
  timestamp: Date;
}

// Model loading settings for persistence
export interface ModelLoadingSettings {
  gpuLayers?: number; // -1 for auto, 0 for CPU only, positive number for specific layers
  contextSize?: number;
  batchSize?: number;
  threads?: number;
}

interface AppState {
  // UI State
  fontSize: number;
  sidebarOpen: boolean;
  activePanel: 'chat' | 'files' | 'agents' | 'mind-maps' | 'settings';

  // Workspace State
  workspaceRoot?: string;
  musicRoot?: string;
  currentDirectory: string;
  files: string[];
  isLoading: boolean;
  workspaceVersion: number; // Increment to trigger data reloads

  // LLM Configuration - simplified to only store last used model
  lastUsedModel?: LastUsedModel;

  // Model Settings Storage - key: modelId, value: settings
  modelSettings: Record<string, ModelLoadingSettings>;

  // Personality/Role Configuration
  defaultCustomRole?: string; // fallback custom role for new threads

  // MindMap Preferences
  mindMapKeyBindings?: Record<string, string>;

  // Actions
  setFontSize: (fontSize: number) => void;
  setSidebarOpen: (open: boolean) => void;
  setActivePanel: (
    panel: 'chat' | 'files' | 'agents' | 'mind-maps' | 'settings'
  ) => void;
  setWorkspaceRoot: (root?: string) => void;
  setMusicRoot: (root?: string) => void;
  setCurrentDirectory: (dir: string) => void;
  setFiles: (files: string[]) => void;
  setIsLoading: (loading: boolean) => void;
  triggerWorkspaceReload: () => void;
  setLastUsedModel: (modelId: string) => void;
  increaseFontSize: () => void;
  decreaseFontSize: () => void;

  // Model Settings Actions
  setModelSettings: (modelId: string, settings: ModelLoadingSettings) => void;
  getModelSettings: (modelId: string) => ModelLoadingSettings | undefined;
  removeModelSettings: (modelId: string) => void;
  cleanupModelSettings: (existingModelIds: string[]) => void;

  // Role/Personality Actions
  setDefaultCustomRole: (role?: string) => void;

  // MindMap Actions
  setMindMapKeyBindings: (keyBindings: Record<string, string>) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      fontSize: 14,
      sidebarOpen: true,
      activePanel: 'chat',
      workspaceRoot: undefined,
      musicRoot: undefined,
      currentDirectory: '.',
      files: [],
      isLoading: false,
      workspaceVersion: 0,
      lastUsedModel: undefined,
      modelSettings: {},
      defaultCustomRole: undefined,
      mindMapKeyBindings: undefined,

      // Actions
      setFontSize: (fontSize: number) => set({ fontSize }),
      setSidebarOpen: (sidebarOpen: boolean) => set({ sidebarOpen }),
      setActivePanel: (
        activePanel: 'chat' | 'files' | 'agents' | 'mind-maps' | 'settings'
      ) => set({ activePanel }),
      setWorkspaceRoot: (workspaceRoot?: string) =>
        set(state => ({
          workspaceRoot,
          workspaceVersion: state.workspaceVersion + 1,
        })),
      setMusicRoot: (musicRoot?: string) => set({ musicRoot }),
      setCurrentDirectory: (currentDirectory: string) =>
        set({ currentDirectory }),
      setFiles: (files: string[]) => set({ files }),
      setIsLoading: (isLoading: boolean) => set({ isLoading }),
      triggerWorkspaceReload: () =>
        set(state => ({ workspaceVersion: state.workspaceVersion + 1 })),
      setLastUsedModel: (modelId: string) =>
        set({
          lastUsedModel: {
            modelId,
            timestamp: new Date(),
          },
        }),
      increaseFontSize: () => {
        const currentSize = get().fontSize;
        set({ fontSize: Math.min(currentSize + 2, 24) });
      },
      decreaseFontSize: () => {
        const currentSize = get().fontSize;
        set({ fontSize: Math.max(currentSize - 2, 10) });
      },

      // Model Settings Actions
      setModelSettings: (modelId: string, settings: ModelLoadingSettings) =>
        set(state => ({
          modelSettings: {
            ...state.modelSettings,
            [modelId]: settings,
          },
        })),
      getModelSettings: (modelId: string) => get().modelSettings[modelId],
      removeModelSettings: (modelId: string) =>
        set(state => {
          const { [modelId]: removed, ...rest } = state.modelSettings;
          return { modelSettings: rest };
        }),
      cleanupModelSettings: (existingModelIds: string[]) =>
        set(state => {
          const cleaned = Object.entries(state.modelSettings)
            .filter(([modelId]) => existingModelIds.includes(modelId))
            .reduce(
              (acc, [modelId, settings]) => {
                acc[modelId] = settings;
                return acc;
              },
              {} as Record<string, ModelLoadingSettings>
            );
          return { modelSettings: cleaned };
        }),

      // Role/Personality Actions
      setDefaultCustomRole: (defaultCustomRole?: string) =>
        set({ defaultCustomRole }),

      // MindMap Actions
      setMindMapKeyBindings: (mindMapKeyBindings: Record<string, string>) =>
        set({ mindMapKeyBindings }),
    }),
    {
      name: 'mindstrike-preferences',
      partialize: state => ({
        fontSize: state.fontSize,
        workspaceRoot: state.workspaceRoot,
        lastUsedModel: state.lastUsedModel,
        modelSettings: state.modelSettings,
        defaultCustomRole: state.defaultCustomRole,
        mindMapKeyBindings: state.mindMapKeyBindings,
      }),
    }
  )
);
