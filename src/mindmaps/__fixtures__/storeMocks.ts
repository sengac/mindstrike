import { vi } from 'vitest';
import type { Mock } from 'vitest';
import type { Node, Edge } from 'reactflow';
import type { MindMapNodeData } from '../types/mindMap';
import { mockNodes, mockEdges } from './mindMapData';

// Mock Zustand store state
export interface MockMindMapStoreState {
  // Core state
  mindMapId: string | null;
  nodes: Node<MindMapNodeData>[];
  edges: Edge[];
  rootNodeId: string;
  layout: 'LR' | 'RL' | 'TB' | 'BT';

  // UI state
  selectedNodeId: string | null;
  isGenerating: boolean;
  generationError: string | null;
  generationSummary: string | null;

  // History
  history: Array<{
    nodes: Node<MindMapNodeData>[];
    edges: Edge[];
    rootNodeId: string;
    layout: 'LR' | 'RL' | 'TB' | 'BT';
    selectedNodeId: string | null;
  }>;
  historyIndex: number;

  // Initialization
  isInitialized: boolean;
  isInitializing: boolean;
}

// Mock actions
export interface MockMindMapStoreActions {
  initializeMindMap: Mock;
  addChildNode: Mock;
  addSiblingNode: Mock;
  deleteNode: Mock;
  updateNodeLabel: Mock;
  updateNodeLabelWithLayout: Mock;
  toggleNodeCollapse: Mock;
  moveNode: Mock;
  updateNodeChatId: Mock;
  updateNodeNotes: Mock;
  updateNodeSources: Mock;
  setNodeColors: Mock;
  clearNodeColors: Mock;
  changeLayout: Mock;
  resetLayout: Mock;
  undo: Mock;
  redo: Mock;
  canUndo: Mock;
  canRedo: Mock;
  saveToHistory: Mock;
  selectNode: Mock;
  setGenerating: Mock;
  setGenerationError: Mock;
  setGenerationSummary: Mock;
  startIterativeGeneration: Mock;
  cancelIterativeGeneration: Mock;
  save: Mock;
  reset: Mock;
}

// Default mock state
export const mockMindMapStoreState: MockMindMapStoreState = {
  mindMapId: 'test-mindmap-123',
  nodes: mockNodes,
  edges: mockEdges,
  rootNodeId: 'root-node',
  layout: 'LR',
  selectedNodeId: null,
  isGenerating: false,
  generationError: null,
  generationSummary: null,
  history: [],
  historyIndex: 0,
  isInitialized: true,
  isInitializing: false,
};

// Create mock actions with default implementations
export const createMockMindMapStoreActions = (): MockMindMapStoreActions => ({
  initializeMindMap: vi.fn().mockResolvedValue(undefined),
  addChildNode: vi.fn().mockResolvedValue(undefined),
  addSiblingNode: vi.fn().mockResolvedValue(undefined),
  deleteNode: vi.fn().mockResolvedValue(undefined),
  updateNodeLabel: vi.fn(),
  updateNodeLabelWithLayout: vi.fn().mockResolvedValue(undefined),
  toggleNodeCollapse: vi.fn().mockResolvedValue(undefined),
  moveNode: vi.fn().mockResolvedValue(undefined),
  updateNodeChatId: vi.fn(),
  updateNodeNotes: vi.fn(),
  updateNodeSources: vi.fn(),
  setNodeColors: vi.fn(),
  clearNodeColors: vi.fn(),
  changeLayout: vi.fn().mockResolvedValue(undefined),
  resetLayout: vi.fn().mockResolvedValue(undefined),
  undo: vi.fn(),
  redo: vi.fn(),
  canUndo: vi.fn().mockReturnValue(false),
  canRedo: vi.fn().mockReturnValue(false),
  saveToHistory: vi.fn(),
  selectNode: vi.fn(),
  setGenerating: vi.fn(),
  setGenerationError: vi.fn(),
  setGenerationSummary: vi.fn(),
  startIterativeGeneration: vi.fn().mockResolvedValue(undefined),
  cancelIterativeGeneration: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined),
  reset: vi.fn(),
});

// Combined mock store
export type MockMindMapStore = MockMindMapStoreState & MockMindMapStoreActions;

export const createMockMindMapStore = (
  overrides: Partial<MockMindMapStoreState> = {}
): MockMindMapStore => ({
  ...mockMindMapStoreState,
  ...overrides,
  ...createMockMindMapStoreActions(),
});

// Mock for useMindMapStore hook
export const mockUseMindMapStore = vi.fn();

// Mock individual selector hooks
export const mockUseMindMapNodes = vi.fn(() => mockNodes);
export const mockUseMindMapEdges = vi.fn(() => mockEdges);
export const mockUseMindMapLayout = vi.fn(() => 'LR');

export const mockUseMindMapSelection = vi.fn(() => ({
  selectedNodeId: null as string | null,
  selectNode: vi.fn(),
}));

export const mockUseMindMapHistory = vi.fn(() => ({
  canUndo: false,
  canRedo: false,
  undo: vi.fn(),
  redo: vi.fn(),
}));

export const mockUseMindMapGeneration = vi.fn(() => ({
  isGenerating: false,
  generationError: null,
  generationSummary: null,
  generationProgress: null,
  setGenerating: vi.fn(),
  setGenerationError: vi.fn(),
  setGenerationSummary: vi.fn(),
  setGenerationProgress: vi.fn(),
  startIterativeGeneration: vi.fn(),
  cancelIterativeGeneration: vi.fn(),
}));

export const mockUseMindMapActions = vi.fn(() =>
  createMockMindMapStoreActions()
);

// Mock for useAppStore
export const mockUseAppStore = vi.fn(() => ({
  workspaceVersion: 1,
}));

// Mock for useMindMaps hook
export const mockUseMindMaps = vi.fn(() => ({
  mindMaps: [
    {
      id: 'test-mindmap-123',
      name: 'Test Mind Map',
      description: 'A test mind map',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-02'),
    },
  ],
  activeMindMapId: 'test-mindmap-123',
  activeMindMap: {
    id: 'test-mindmap-123',
    name: 'Test Mind Map',
    description: 'A test mind map',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
  },
  isLoaded: true,
  loadMindMaps: vi.fn(),
  createMindMap: vi.fn().mockResolvedValue('new-mindmap-id'),
  deleteMindMap: vi.fn(),
  renameMindMap: vi.fn(),
  selectMindMap: vi.fn(),
}));

// Helper function to reset all mocks
export const resetAllMocks = () => {
  vi.clearAllMocks();
  mockUseMindMapStore.mockReturnValue(createMockMindMapStore());
  mockUseMindMapNodes.mockReturnValue(mockNodes);
  mockUseMindMapEdges.mockReturnValue(mockEdges);
  mockUseMindMapLayout.mockReturnValue('LR');
  mockUseMindMapSelection.mockReturnValue({
    selectedNodeId: null,
    selectNode: vi.fn(),
  });
  mockUseMindMapHistory.mockReturnValue({
    canUndo: false,
    canRedo: false,
    undo: vi.fn(),
    redo: vi.fn(),
  });
  mockUseMindMapGeneration.mockReturnValue({
    isGenerating: false,
    generationError: null,
    generationSummary: null,
    generationProgress: null,
    setGenerating: vi.fn(),
    setGenerationError: vi.fn(),
    setGenerationSummary: vi.fn(),
    setGenerationProgress: vi.fn(),
    startIterativeGeneration: vi.fn(),
    cancelIterativeGeneration: vi.fn(),
  });
  mockUseMindMapActions.mockReturnValue(createMockMindMapStoreActions());
  mockUseAppStore.mockReturnValue({
    workspaceVersion: 1,
  });
};

// Helper to create mock store with specific state
export const createMockStoreWithState = (
  nodes: Node<MindMapNodeData>[],
  selectedNodeId: string | null = null,
  isGenerating = false
) => {
  const mockStore = createMockMindMapStore({
    nodes,
    selectedNodeId,
    isGenerating,
  });
  mockUseMindMapStore.mockReturnValue(mockStore);
  mockUseMindMapNodes.mockReturnValue(nodes);
  mockUseMindMapSelection.mockReturnValue({
    selectedNodeId,
    selectNode: mockStore.selectNode,
  });
  mockUseMindMapGeneration.mockReturnValue({
    isGenerating,
    generationError: null,
    generationSummary: null,
    generationProgress: null,
    setGenerating: mockStore.setGenerating,
    setGenerationError: mockStore.setGenerationError,
    setGenerationSummary: mockStore.setGenerationSummary,
    setGenerationProgress: vi.fn(),
    startIterativeGeneration: mockStore.startIterativeGeneration,
    cancelIterativeGeneration: mockStore.cancelIterativeGeneration,
  });
  return mockStore;
};
