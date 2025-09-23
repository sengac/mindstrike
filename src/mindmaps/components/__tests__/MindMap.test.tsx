import React from 'react';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MindMap, type MindMapControls } from '../MindMap';
import {
  mockNodes,
  mockEdges,
  mockMindMapData,
} from '../../__fixtures__/mindMapData';
import {
  resetReactFlowMocks,
  mockUseReactFlow,
  mockUseNodesInitialized,
  MockReactFlow,
  MockBackground,
  MockControls,
  MockMiniMap,
  MockHandle,
  MockPosition,
} from '../../__fixtures__/reactFlowMocks';
import { resetApiMocks } from '../../__fixtures__/apiMocks';

// Mock all dependencies
vi.mock('reactflow', () => ({
  __esModule: true,
  default: MockReactFlow,
  Background: MockBackground,
  Controls: MockControls,
  MiniMap: MockMiniMap,
  Handle: MockHandle,
  Position: MockPosition,
  ConnectionMode: { Loose: 'loose' },
  useReactFlow: mockUseReactFlow,
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="react-flow-provider">{children}</div>
  ),
  useNodesInitialized: mockUseNodesInitialized,
}));

// Mock store hooks
const mockStoreState = {
  initializeMindMap: vi.fn(),
  isInitialized: true,
  isInitializing: false,
  layoutManager: {
    getVisibleNodes: vi.fn(nodes => nodes),
    getVisibleEdges: vi.fn(edges => edges),
    updateNodeLevels: vi.fn(nodes => nodes),
    arrangeNodes: vi.fn(nodes => nodes),
    calculateNodeWidth: vi.fn(() => 120),
  },
  rootNodeId: 'root-node',
};

const mockActions = {
  addChildNode: vi.fn(),
  addSiblingNode: vi.fn(),
  deleteNode: vi.fn(),
  updateNodeLabel: vi.fn(),
  updateNodeLabelWithLayout: vi.fn(),
  toggleNodeCollapse: vi.fn(),
  moveNode: vi.fn(),
  updateNodeChatId: vi.fn(),
  updateNodeNotes: vi.fn(),
  updateNodeSources: vi.fn(),
  setNodeColors: vi.fn(),
  clearNodeColors: vi.fn(),
  changeLayout: vi.fn(),
  resetLayout: vi.fn(),
};

const mockSelection = {
  selectedNodeId: 'child-1',
  selectNode: vi.fn(),
};

const mockHistory = {
  canUndo: true,
  canRedo: false,
  undo: vi.fn(),
  redo: vi.fn(),
};

const mockGeneration = {
  isGenerating: false,
  generationError: null,
  generationSummary: null,
  setGenerating: vi.fn(),
  setGenerationError: vi.fn(),
  setGenerationSummary: vi.fn(),
  startIterativeGeneration: vi.fn(),
  cancelIterativeGeneration: vi.fn(),
};

vi.mock('../../../store/useMindMapStore', () => ({
  useMindMapStore: vi.fn(selector => selector(mockStoreState)),
  useMindMapNodes: () => mockNodes,
  useMindMapEdges: () => mockEdges,
  useMindMapLayout: () => 'LR',
  useMindMapSelection: () => mockSelection,
  useMindMapHistory: () => mockHistory,
  useMindMapGeneration: () => mockGeneration,
  useMindMapActions: () => mockActions,
}));

// Mock drag hook
const mockDragState = {
  draggedNodeId: null,
  closestDropTarget: null,
  dropPosition: null,
  hasDraggedSignificantly: false,
  dragCursorPosition: null,
  onNodeDragStart: vi.fn(),
  onNodeDrag: vi.fn(),
  onNodeDragStop: vi.fn(),
};

vi.mock('../../hooks/useMindMapDrag', () => ({
  useMindMapDrag: () => mockDragState,
}));

// Mock generation hooks
const mockGenerationStreaming = {
  isStreaming: false,
  cancelGeneration: vi.fn(),
};

const mockIterativeGeneration = {
  isGenerating: false,
  startGeneration: vi.fn(),
  cancelGeneration: vi.fn(),
};

vi.mock('../../../hooks/useGenerationStreaming', () => ({
  useGenerationStreaming: () => mockGenerationStreaming,
}));

vi.mock('../../../hooks/useIterativeGeneration', () => ({
  useIterativeGeneration: () => mockIterativeGeneration,
}));

// Mock dialog animation hook
const mockDialogAnimation = {
  shouldRender: false,
  isVisible: false,
  handleClose: vi.fn(),
};

vi.mock('../../../hooks/useDialogAnimation', () => ({
  useDialogAnimation: () => mockDialogAnimation,
}));

// Mock other components
vi.mock('../../../components/MusicVisualization', () => ({
  MusicVisualization: ({ className }: { className: string }) => (
    <div data-testid="music-visualization" className={className} />
  ),
}));

interface MockGenerateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  input?: string;
  onInputChange?: (value: string) => void;
  onGenerate?: () => void;
}

vi.mock('../../../components/shared/GenerateDialog', () => ({
  GenerateDialog: ({
    isOpen,
    onClose,
    input,
    onInputChange,
    onGenerate,
  }: MockGenerateDialogProps) =>
    isOpen ? (
      <div data-testid="generate-dialog">
        <input
          data-testid="generate-input"
          value={input}
          onChange={e => onInputChange?.(e.target.value)}
        />
        <button data-testid="generate-button" onClick={onGenerate}>
          Generate
        </button>
        <button data-testid="close-button" onClick={onClose}>
          Close
        </button>
      </div>
    ) : null,
}));

interface MockMindMapNodeProps {
  id: string;
  data: { label: string };
  selected?: boolean;
}

vi.mock('../MindMapNode', () => ({
  MindMapNode: ({ id, data, selected }: MockMindMapNodeProps) => (
    <div data-testid={`mind-map-node-${id}`} data-selected={selected}>
      {data.label}
    </div>
  ),
}));

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

describe('MindMap', () => {
  let user: ReturnType<typeof userEvent.setup>;
  let mockOnSave: Mock;
  let mockOnControlsReady: Mock;

  beforeEach(() => {
    user = userEvent.setup();
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockOnSave = vi.fn().mockResolvedValue(undefined);
    mockOnControlsReady = vi.fn();

    resetReactFlowMocks();
    resetApiMocks();

    // Reset mock states
    Object.assign(mockStoreState, {
      isInitialized: true,
      isInitializing: false,
      rootNodeId: 'root-node',
    });

    Object.assign(mockSelection, {
      selectedNodeId: 'child-1',
    });

    Object.assign(mockGeneration, {
      isGenerating: false,
      generationError: null,
      generationSummary: null,
    });

    Object.assign(mockDragState, {
      draggedNodeId: null,
      closestDropTarget: null,
      dropPosition: null,
      hasDraggedSignificantly: false,
      dragCursorPosition: null,
    });

    mockUseNodesInitialized.mockReturnValue(true);

    // Mock DOM methods
    Element.prototype.getBoundingClientRect = vi.fn(() => ({
      left: 100,
      top: 100,
      width: 200,
      height: 50,
      right: 300,
      bottom: 150,
      x: 100,
      y: 100,
      toJSON: vi.fn(),
    }));

    document.querySelector = vi.fn(() => null);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('rendering', () => {
    it('should render the mind map with ReactFlow', () => {
      render(<MindMap mindMapId="test-mindmap" onSave={mockOnSave} />);

      expect(screen.getByTestId('react-flow-provider')).toBeInTheDocument();
      expect(screen.getByTestId('react-flow')).toBeInTheDocument();
      expect(screen.getByTestId('music-visualization')).toBeInTheDocument();
    });

    it('should render mind map nodes', () => {
      render(<MindMap mindMapId="test-mindmap" onSave={mockOnSave} />);

      expect(screen.getByTestId('mind-map-node-root-node')).toBeInTheDocument();
      expect(screen.getByTestId('mind-map-node-child-1')).toBeInTheDocument();
      expect(screen.getByTestId('mind-map-node-child-2')).toBeInTheDocument();
    });

    it('should render floating action buttons when node is selected', () => {
      render(<MindMap mindMapId="test-mindmap" onSave={mockOnSave} />);

      expect(screen.getByTitle('Add child node')).toBeInTheDocument();
      expect(screen.getByTitle('Generate')).toBeInTheDocument();
      expect(screen.getByTitle('Delete node')).toBeInTheDocument();
    });

    it('should not render floating buttons when no node is selected', () => {
      mockSelection.selectedNodeId = '';

      render(<MindMap mindMapId="test-mindmap" onSave={mockOnSave} />);

      expect(screen.queryByTitle('Add child node')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Generate')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Delete node')).not.toBeInTheDocument();
    });
  });

  describe('initialization', () => {
    it('should initialize mind map on mount', () => {
      render(
        <MindMap
          mindMapId="test-mindmap"
          onSave={mockOnSave}
          initialData={mockMindMapData}
        />
      );

      expect(mockStoreState.initializeMindMap).toHaveBeenCalledWith(
        'test-mindmap',
        mockMindMapData,
        mockOnSave
      );
    });

    it('should provide controls to parent component', () => {
      render(
        <MindMap
          mindMapId="test-mindmap"
          onSave={mockOnSave}
          onControlsReady={mockOnControlsReady}
        />
      );

      expect(mockOnControlsReady).toHaveBeenCalledWith(
        expect.objectContaining({
          undo: expect.any(Function),
          redo: expect.any(Function),
          resetLayout: expect.any(Function),
          changeLayout: expect.any(Function),
          canUndo: true,
          canRedo: false,
          currentLayout: 'LR',
          selectedNodeId: 'child-1',
          setNodeColors: expect.any(Function),
          clearNodeColors: expect.any(Function),
        })
      );
    });
  });

  describe('external node updates', () => {
    it('should handle external node updates', () => {
      const externalUpdates = {
        nodeId: 'child-1',
        chatId: 'new-chat-id',
        notes: 'Updated notes',
        sources: [],
        timestamp: Date.now(),
      };

      render(
        <MindMap
          mindMapId="test-mindmap"
          onSave={mockOnSave}
          externalNodeUpdates={externalUpdates}
        />
      );

      expect(mockActions.updateNodeChatId).toHaveBeenCalledWith(
        'child-1',
        'new-chat-id'
      );
      expect(mockActions.updateNodeNotes).toHaveBeenCalledWith(
        'child-1',
        'Updated notes'
      );
      expect(mockActions.updateNodeSources).toHaveBeenCalledWith('child-1', []);
    });

    it('should not handle external updates when not initialized', () => {
      mockStoreState.isInitialized = false;

      const externalUpdates = {
        nodeId: 'child-1',
        chatId: 'new-chat-id',
        timestamp: Date.now(),
      };

      render(
        <MindMap
          mindMapId="test-mindmap"
          onSave={mockOnSave}
          externalNodeUpdates={externalUpdates}
        />
      );

      expect(mockActions.updateNodeChatId).not.toHaveBeenCalled();
    });
  });

  describe('user interactions', () => {
    it('should handle node click', async () => {
      render(<MindMap mindMapId="test-mindmap" onSave={mockOnSave} />);

      // Get the mock ReactFlow component and its props
      const mockReactFlowCalls = vi.mocked(MockReactFlow).mock.calls;
      const reactFlowProps =
        mockReactFlowCalls[mockReactFlowCalls.length - 1][0];
      const onNodeClick = reactFlowProps.onNodeClick;

      const mockEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
      const mockNode = { id: 'test-node', data: { label: 'Test' } };

      act(() => {
        onNodeClick(mockEvent, mockNode);
      });

      expect(mockSelection.selectNode).toHaveBeenCalledWith('test-node');
    });

    it('should handle pane click to deselect', async () => {
      render(<MindMap mindMapId="test-mindmap" onSave={mockOnSave} />);

      // Get the mock ReactFlow component and its props
      const mockReactFlowCalls = vi.mocked(MockReactFlow).mock.calls;
      const reactFlowProps =
        mockReactFlowCalls[mockReactFlowCalls.length - 1][0];
      const onPaneClick = reactFlowProps.onPaneClick;

      act(() => {
        onPaneClick();
      });

      expect(mockSelection.selectNode).toHaveBeenCalledWith(null);
    });

    it('should handle floating action button clicks', async () => {
      render(<MindMap mindMapId="test-mindmap" onSave={mockOnSave} />);

      // Test add child button
      const addChildButton = screen.getByTitle('Add child node');
      await user.click(addChildButton);
      expect(mockActions.addChildNode).toHaveBeenCalledWith('child-1');

      // Test delete button
      const deleteButton = screen.getByTitle('Delete node');
      await user.click(deleteButton);
      expect(mockActions.deleteNode).toHaveBeenCalledWith('child-1');
    });

    it('should open generate dialog on generate button click', async () => {
      mockDialogAnimation.shouldRender = true;
      mockDialogAnimation.isVisible = true;

      const { rerender } = render(
        <MindMap mindMapId="test-mindmap" onSave={mockOnSave} />
      );

      const generateButton = screen.getByTitle('Generate');
      await user.click(generateButton);

      // Re-render to show dialog
      rerender(<MindMap mindMapId="test-mindmap" onSave={mockOnSave} />);

      expect(screen.getByTestId('generate-dialog')).toBeInTheDocument();
    });
  });

  describe('keyboard shortcuts', () => {
    it('should handle Tab key to add child', async () => {
      render(<MindMap mindMapId="test-mindmap" onSave={mockOnSave} />);

      await user.keyboard('{Tab}');

      expect(mockActions.addChildNode).toHaveBeenCalledWith('child-1');
    });

    it('should handle Enter key to add sibling', async () => {
      render(<MindMap mindMapId="test-mindmap" onSave={mockOnSave} />);

      await user.keyboard('{Enter}');

      expect(mockActions.addSiblingNode).toHaveBeenCalledWith('child-1');
    });

    it('should handle Delete key to delete node', async () => {
      render(<MindMap mindMapId="test-mindmap" onSave={mockOnSave} />);

      await user.keyboard('{Delete}');

      expect(mockActions.deleteNode).toHaveBeenCalledWith('child-1');
    });

    it('should handle Ctrl+Z for undo', async () => {
      render(<MindMap mindMapId="test-mindmap" onSave={mockOnSave} />);

      await user.keyboard('{Control>}z{/Control}');

      expect(mockHistory.undo).toHaveBeenCalled();
    });

    it('should handle Ctrl+Y for redo', async () => {
      render(<MindMap mindMapId="test-mindmap" onSave={mockOnSave} />);

      await user.keyboard('{Control>}y{/Control}');

      expect(mockHistory.redo).toHaveBeenCalled();
    });

    it('should not handle keys when typing in input', async () => {
      render(
        <div>
          <input data-testid="test-input" />
          <MindMap mindMapId="test-mindmap" onSave={mockOnSave} />
        </div>
      );

      const input = screen.getByTestId('test-input');
      await user.click(input);
      await user.keyboard('{Tab}');

      expect(mockActions.addChildNode).not.toHaveBeenCalled();
    });

    it('should handle custom key bindings', async () => {
      const customKeyBindings = {
        'Shift+A': 'addChild',
        'Shift+D': 'deleteNode',
      };

      render(
        <MindMap
          mindMapId="test-mindmap"
          onSave={mockOnSave}
          keyBindings={customKeyBindings}
        />
      );

      await user.keyboard('{Shift>}A{/Shift}');
      expect(mockActions.addChildNode).toHaveBeenCalledWith('child-1');

      await user.keyboard('{Shift>}D{/Shift}');
      expect(mockActions.deleteNode).toHaveBeenCalledWith('child-1');
    });
  });

  describe('drag and drop', () => {
    it('should render drag preview when dragging', () => {
      Object.assign(mockDragState, {
        draggedNodeId: 'child-1',
        hasDraggedSignificantly: true,
        dragCursorPosition: { x: 100, y: 200 },
      });

      render(<MindMap mindMapId="test-mindmap" onSave={mockOnSave} />);

      const dragPreview = document.querySelector(
        '.fixed.pointer-events-none.z-50'
      );
      expect(dragPreview).toBeInTheDocument();
    });

    it('should render drop indicators when dragging over target', () => {
      Object.assign(mockDragState, {
        draggedNodeId: 'child-1',
        closestDropTarget: 'child-2',
        dropPosition: 'over',
      });

      document.querySelector = vi.fn(selector => {
        if (selector === '[data-id="child-2"]') {
          return {
            getBoundingClientRect: () => ({
              left: 100,
              top: 100,
              width: 200,
              height: 50,
              right: 300,
              bottom: 150,
            }),
          };
        }
        return null;
      });

      render(<MindMap mindMapId="test-mindmap" onSave={mockOnSave} />);

      const dropIndicator = document.querySelector(
        '.border-dashed.border-blue-400'
      );
      expect(dropIndicator).toBeInTheDocument();
    });
  });

  describe('generation', () => {
    it('should handle generation when dialog is open', async () => {
      mockDialogAnimation.shouldRender = true;
      mockDialogAnimation.isVisible = true;

      render(<MindMap mindMapId="test-mindmap" onSave={mockOnSave} />);

      const input = screen.getByTestId('generate-input');
      const generateButton = screen.getByTestId('generate-button');

      await user.type(input, 'Test generation prompt');
      await user.click(generateButton);

      expect(mockIterativeGeneration.startGeneration).toHaveBeenCalledWith(
        'test-mindmap',
        'Test generation prompt',
        'child-1'
      );
    });

    it('should handle generation cancellation', async () => {
      mockGeneration.isGenerating = true;

      render(<MindMap mindMapId="test-mindmap" onSave={mockOnSave} />);

      // Simulate cancellation (this would typically come through the dialog)
      act(() => {
        mockGeneration.setGenerationError('Generation cancelled by user');
      });

      expect(mockGeneration.setGenerationError).toHaveBeenCalledWith(
        'Generation cancelled by user'
      );
    });
  });

  describe('layout management', () => {
    it('should filter visible nodes based on collapse state', () => {
      render(<MindMap mindMapId="test-mindmap" onSave={mockOnSave} />);

      expect(mockStoreState.layoutManager.getVisibleNodes).toHaveBeenCalledWith(
        mockNodes,
        mockEdges
      );
      expect(mockStoreState.layoutManager.getVisibleEdges).toHaveBeenCalledWith(
        mockNodes,
        mockEdges
      );
    });

    it('should handle layout manager not available', () => {
      // Temporarily set layoutManager to null for testing
      const tempState = mockStoreState as {
        layoutManager: typeof mockStoreState.layoutManager | null;
      };
      tempState.layoutManager = null;

      render(<MindMap mindMapId="test-mindmap" onSave={mockOnSave} />);

      // Should render all nodes when no layout manager
      expect(screen.getByTestId('mind-map-node-root-node')).toBeInTheDocument();
    });
  });

  describe('event listeners', () => {
    it('should handle global click to deselect nodes', async () => {
      render(<MindMap mindMapId="test-mindmap" onSave={mockOnSave} />);

      // Click outside the container
      act(() => {
        fireEvent.click(document.body);
      });

      expect(mockSelection.selectNode).toHaveBeenCalledWith(null);
    });

    it('should not deselect when clicking on dialogs', async () => {
      render(
        <div>
          <div role="dialog">Dialog content</div>
          <MindMap mindMapId="test-mindmap" onSave={mockOnSave} />
        </div>
      );

      const dialog = screen.getByRole('dialog');
      act(() => {
        fireEvent.click(dialog);
      });

      expect(mockSelection.selectNode).not.toHaveBeenCalledWith(null);
    });

    it('should handle custom window events', async () => {
      render(<MindMap mindMapId="test-mindmap" onSave={mockOnSave} />);

      // Test node select event
      act(() => {
        window.dispatchEvent(
          new CustomEvent('mindmap-node-select', {
            detail: { nodeId: 'test-node' },
          })
        );
      });

      expect(mockSelection.selectNode).toHaveBeenCalledWith('test-node');

      // Test toggle collapse event
      act(() => {
        window.dispatchEvent(
          new CustomEvent('mindmap-toggle-collapse', {
            detail: { nodeId: 'test-node' },
          })
        );
      });

      expect(mockActions.toggleNodeCollapse).toHaveBeenCalledWith('test-node');
    });
  });

  describe('resize handling', () => {
    it('should handle container resize', () => {
      render(<MindMap mindMapId="test-mindmap" onSave={mockOnSave} />);

      // Simulate resize
      // Access the mock directly from the global ResizeObserver
      const resizeObserverMock = global.ResizeObserver as ReturnType<
        typeof vi.fn
      >;
      const callback = resizeObserverMock.mock.calls[0][0];

      act(() => {
        callback([
          {
            contentRect: {
              width: 800,
              height: 600,
            },
          },
        ]);
      });

      act(() => {
        vi.advanceTimersByTime(200);
      });

      // Should call fitView through ReactFlow instance
      expect(mockUseReactFlow().fitView).toHaveBeenCalled();
    });
  });

  describe('controls integration', () => {
    it('should provide working controls to parent', () => {
      let controls: MindMapControls | null = null;

      render(
        <MindMap
          mindMapId="test-mindmap"
          onSave={mockOnSave}
          onControlsReady={c => {
            controls = c;
          }}
        />
      );

      expect(controls).not.toBeNull();

      // Test controls functionality
      act(() => {
        controls!.undo();
      });
      expect(mockHistory.undo).toHaveBeenCalled();

      act(() => {
        controls!.redo();
      });
      expect(mockHistory.redo).toHaveBeenCalled();

      act(() => {
        controls!.changeLayout('TB');
      });
      expect(mockActions.changeLayout).toHaveBeenCalledWith('TB');

      act(() => {
        controls!.setNodeColors('test-node', {
          backgroundClass: 'bg-red-500',
          foregroundClass: 'text-white',
        });
      });
      expect(mockActions.setNodeColors).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle missing mindMapId gracefully', () => {
      render(<MindMap mindMapId="" onSave={mockOnSave} />);

      expect(mockStoreState.initializeMindMap).not.toHaveBeenCalled();
    });

    it('should handle missing selected node for actions', async () => {
      Object.assign(mockSelection, { selectedNodeId: null });

      render(<MindMap mindMapId="test-mindmap" onSave={mockOnSave} />);

      await user.keyboard('{Tab}');
      expect(mockActions.addChildNode).not.toHaveBeenCalled();

      await user.keyboard('{Enter}');
      expect(mockActions.addSiblingNode).not.toHaveBeenCalled();

      await user.keyboard('{Delete}');
      expect(mockActions.deleteNode).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should cleanup event listeners on unmount', () => {
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
      vi.spyOn(window, 'addEventListener');
      vi.spyOn(window, 'removeEventListener');

      const { unmount } = render(
        <MindMap mindMapId="test-mindmap" onSave={mockOnSave} />
      );

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'click',
        expect.any(Function)
      );
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'keydown',
        expect.any(Function)
      );

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'click',
        expect.any(Function)
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'keydown',
        expect.any(Function)
      );
    });

    it('should cleanup resize observer on unmount', () => {
      const { unmount } = render(
        <MindMap mindMapId="test-mindmap" onSave={mockOnSave} />
      );

      const resizeObserverMock = global.ResizeObserver as ReturnType<
        typeof vi.fn
      >;
      const resizeObserver = resizeObserverMock.mock.instances[0];

      unmount();

      expect(resizeObserver.disconnect).toHaveBeenCalled();
    });
  });
});
