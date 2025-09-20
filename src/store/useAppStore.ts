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
  fontScheme: 'system' | 'inter' | 'serif' | 'monospace' | 'academic';
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

  // Prompts Configuration
  defaultCustomPrompt?: string; // fallback custom prompt for new threads

  // MindMap Preferences
  mindMapKeyBindings?: Record<string, string>;

  // Actions
  setFontSize: (fontSize: number) => void;
  setFontScheme: (
    fontScheme: 'system' | 'inter' | 'serif' | 'monospace' | 'academic'
  ) => void;
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

  // Prompts Actions
  setDefaultCustomPrompt: (prompt?: string) => void;

  // MindMap Actions
  setMindMapKeyBindings: (keyBindings: Record<string, string>) => void;

  // Server-side root loading
  loadWorkspaceRoots: () => Promise<void>;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      fontSize: 14,
      fontScheme: 'system',
      sidebarOpen: true,
      activePanel: 'chat',
      workspaceRoot: undefined,
      musicRoot: undefined,
      currentDirectory: '.',
      files: [],
      isLoading: false,
      workspaceVersion: 0,
      lastUsedModel: undefined,

      defaultCustomPrompt: undefined,
      mindMapKeyBindings: undefined,

      // Actions
      setFontSize: (fontSize: number) => set({ fontSize }),
      setFontScheme: (
        fontScheme: 'system' | 'inter' | 'serif' | 'monospace' | 'academic'
      ) => set({ fontScheme }),
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

      // Prompts Actions
      setDefaultCustomPrompt: (defaultCustomPrompt?: string) =>
        set({ defaultCustomPrompt }),

      // MindMap Actions
      setMindMapKeyBindings: (mindMapKeyBindings: Record<string, string>) =>
        set({ mindMapKeyBindings }),

      // Server-side root loading
      loadWorkspaceRoots: async () => {
        try {
          const [workspaceResponse, musicResponse] = await Promise.all([
            fetch('/api/workspace/root'),
            fetch('/api/music/root'),
          ]);

          if (workspaceResponse.ok) {
            const { workspaceRoot } = await workspaceResponse.json();
            set({ workspaceRoot });
          }

          if (musicResponse.ok) {
            const { musicRoot } = await musicResponse.json();
            set({ musicRoot });
          }
        } catch (error) {
          console.error('Failed to load workspace roots:', error);
        }
      },
    }),
    {
      name: 'mindstrike-preferences',
      partialize: state => ({
        fontSize: state.fontSize,
        fontScheme: state.fontScheme,
        lastUsedModel: state.lastUsedModel,
        defaultCustomPrompt: state.defaultCustomPrompt,
        mindMapKeyBindings: state.mindMapKeyBindings,
      }),
    }
  )
);
