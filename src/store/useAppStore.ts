import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface LLMConfig {
  baseURL: string;
  model: string;
  apiKey?: string;
}

export interface SelectedModel {
  serviceId: string;
  model: string;
  serviceName: string;
  displayName: string;
  baseURL: string;
  apiKey?: string;
  contextLength?: number;
  type: 'ollama' | 'vllm' | 'openai-compatible' | 'openai';
}

interface AppState {
  // UI State
  fontSize: number;
  sidebarOpen: boolean;
  activePanel: 'chat' | 'files' | 'agents' | 'settings';
  
  // Workspace State
  workspaceRoot?: string;
  currentDirectory: string;
  files: string[];
  isLoading: boolean;
  
  // LLM Configuration
  llmConfig: LLMConfig;
  selectedModel?: SelectedModel;
  
  // Personality/Role Configuration
  defaultCustomRole?: string; // fallback custom role for new threads
  
  // Actions
  setFontSize: (fontSize: number) => void;
  setSidebarOpen: (open: boolean) => void;
  setActivePanel: (panel: 'chat' | 'files' | 'agents' | 'settings') => void;
  setWorkspaceRoot: (root?: string) => void;
  setCurrentDirectory: (dir: string) => void;
  setFiles: (files: string[]) => void;
  setIsLoading: (loading: boolean) => void;
  setLlmConfig: (config: Partial<LLMConfig>) => void;
  setSelectedModel: (model?: SelectedModel) => void;
  increaseFontSize: () => void;
  decreaseFontSize: () => void;
  
  // Role/Personality Actions
  setDefaultCustomRole: (role?: string) => void;
}

const defaultLlmConfig: LLMConfig = {
  baseURL: 'http://localhost:11434',
  model: '',
  apiKey: undefined,
};

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
      llmConfig: defaultLlmConfig,
      selectedModel: undefined,
      defaultCustomRole: undefined,
      
      // Actions
      setFontSize: (fontSize: number) => set({ fontSize }),
      setSidebarOpen: (sidebarOpen: boolean) => set({ sidebarOpen }),
      setActivePanel: (activePanel: 'chat' | 'files' | 'agents' | 'settings') => set({ activePanel }),
      setWorkspaceRoot: (workspaceRoot?: string) => set({ workspaceRoot }),
      setCurrentDirectory: (currentDirectory: string) => set({ currentDirectory }),
      setFiles: (files: string[]) => set({ files }),
      setIsLoading: (isLoading: boolean) => set({ isLoading }),
      setLlmConfig: (config: Partial<LLMConfig>) => {
        const currentConfig = get().llmConfig;
        set({ llmConfig: { ...currentConfig, ...config } });
      },
      setSelectedModel: (selectedModel?: SelectedModel) => set({ selectedModel }),
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
    }),
    {
      name: 'mindstrike-preferences',
      partialize: (state) => ({
        fontSize: state.fontSize,
        workspaceRoot: state.workspaceRoot,
        llmConfig: state.llmConfig,
        selectedModel: state.selectedModel,
        defaultCustomRole: state.defaultCustomRole,
      }),
    }
  )
);
