import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Simplified - only store the last used model ID
export interface LastUsedModel {
  modelId: string;
  timestamp: Date;
}

interface AppState {
  // UI State
  fontSize: number;
  sidebarOpen: boolean;
  activePanel: 'chat' | 'files' | 'agents' | 'workflows' | 'mind-maps' | 'settings';
  
  // Workspace State
  workspaceRoot?: string;
  currentDirectory: string;
  files: string[];
  isLoading: boolean;
  
  // LLM Configuration - simplified to only store last used model
  lastUsedModel?: LastUsedModel;
  
  // Personality/Role Configuration
  defaultCustomRole?: string; // fallback custom role for new threads
  
  // MindMap Preferences
  mindMapKeyBindings?: Record<string, string>;
  
  // Actions
  setFontSize: (fontSize: number) => void;
  setSidebarOpen: (open: boolean) => void;
  setActivePanel: (panel: 'chat' | 'files' | 'agents' | 'workflows' | 'mind-maps' | 'settings') => void;
  setWorkspaceRoot: (root?: string) => void;
  setCurrentDirectory: (dir: string) => void;
  setFiles: (files: string[]) => void;
  setIsLoading: (loading: boolean) => void;
  setLastUsedModel: (modelId: string) => void;
  increaseFontSize: () => void;
  decreaseFontSize: () => void;
  
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
      currentDirectory: '.',
      files: [],
      isLoading: false,
      lastUsedModel: undefined,
      defaultCustomRole: undefined,
      mindMapKeyBindings: undefined,
      
      // Actions
      setFontSize: (fontSize: number) => set({ fontSize }),
      setSidebarOpen: (sidebarOpen: boolean) => set({ sidebarOpen }),
      setActivePanel: (activePanel: 'chat' | 'files' | 'agents' | 'workflows' | 'mind-maps' | 'settings') => set({ activePanel }),
      setWorkspaceRoot: (workspaceRoot?: string) => set({ workspaceRoot }),
      setCurrentDirectory: (currentDirectory: string) => set({ currentDirectory }),
      setFiles: (files: string[]) => set({ files }),
      setIsLoading: (isLoading: boolean) => set({ isLoading }),
      setLastUsedModel: (modelId: string) => set({ 
        lastUsedModel: { 
          modelId, 
          timestamp: new Date() 
        } 
      }),
      increaseFontSize: () => {
        const currentSize = get().fontSize;
        set({ fontSize: Math.min(currentSize + 2, 24) });
      },
      decreaseFontSize: () => {
        const currentSize = get().fontSize;
        set({ fontSize: Math.max(currentSize - 2, 10) });
      },
      
      // Role/Personality Actions
      setDefaultCustomRole: (defaultCustomRole?: string) => set({ defaultCustomRole }),
      
      // MindMap Actions
      setMindMapKeyBindings: (mindMapKeyBindings: Record<string, string>) => set({ mindMapKeyBindings }),
    }),
    {
      name: 'mindstrike-preferences',
      partialize: (state) => ({
        fontSize: state.fontSize,
        workspaceRoot: state.workspaceRoot,
        lastUsedModel: state.lastUsedModel,
        defaultCustomRole: state.defaultCustomRole,
        mindMapKeyBindings: state.mindMapKeyBindings,
      }),
    }
  )
);
