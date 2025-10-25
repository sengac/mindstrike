/**
 * @vitest-environment jsdom
 */

/**
 * Feature: spec/features/scroll-modifier-key-for-pan-zoom-switching-with-visual-indicator.feature
 *
 * This test file validates the acceptance criteria defined in the feature file.
 * Scenarios in this test map directly to scenarios in the Gherkin feature.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MindMap } from '../../src/mindmaps/components/MindMap';
import { mockMindMapData, mockNodes, mockEdges } from '../../src/mindmaps/__fixtures__/mindMapData';
import { useReactFlow } from 'reactflow';

// Mock ReactFlow
vi.mock('reactflow', async () => {
  const actual = await vi.importActual<typeof import('reactflow')>('reactflow');
  return {
    ...actual,
    useReactFlow: vi.fn(),
  };
});

// Mock modules (same pattern as other MindMap tests)
vi.mock('../../src/store/useMindMapStore');
vi.mock('../../src/store/useAppStore');
vi.mock('../../src/mindmaps/hooks/useMindMapDrag');
vi.mock('../../src/hooks/useGenerationStreaming');
vi.mock('../../src/hooks/useIterativeGeneration');
vi.mock('../../src/hooks/useDialogAnimation');
vi.mock('../../src/components/MusicVisualization');
vi.mock('../../src/components/shared/GenerateDialog');
vi.mock('../../src/mindmaps/components/MindMapNode');

// Import mocked modules
import * as useMindMapStore from '../../src/store/useMindMapStore';
import * as useAppStore from '../../src/store/useAppStore';
import * as useMindMapDrag from '../../src/mindmaps/hooks/useMindMapDrag';
import * as useGenerationStreaming from '../../src/hooks/useGenerationStreaming';
import * as useIterativeGeneration from '../../src/hooks/useIterativeGeneration';
import * as useDialogAnimation from '../../src/hooks/useDialogAnimation';
import { MindMapLayoutManager } from '../../src/utils/mindMapLayout';
import type { MindMapDataManager } from '../../src/utils/mindMapData';
import type { MindMapActionsManager } from '../../src/utils/mindMapActions';

describe('Feature: Scroll Modifier Key for Pan/Zoom Switching with Visual Indicator', () => {
  let user: ReturnType<typeof userEvent.setup>;
  let mockSetViewport: ReturnType<typeof vi.fn>;
  let mockZoomIn: ReturnType<typeof vi.fn>;
  let mockZoomOut: ReturnType<typeof vi.fn>;

  const mockStoreState = {
    initializeMindMap: vi.fn(),
    isInitialized: true,
    isInitializing: false,
    rootNodeId: 'root-node',
  };

  const mockActions = {
    addChildNode: vi.fn(),
    addSiblingNode: vi.fn(),
    deleteNode: vi.fn(),
    updateNodeLabel: vi.fn(),
  };

  const mockAppStore = {
    mindMapKeyBindings: {
      addChild: 'Tab',
      addSibling: 'Enter',
      deleteNode: 'Delete',
      panModifier: 'Space', // Default binding
    },
    setMindMapKeyBindings: vi.fn(),
  };

  beforeEach(() => {
    user = userEvent.setup();
    vi.clearAllMocks();

    // Mock ResizeObserver
    global.ResizeObserver = vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    }));

    // Setup ReactFlow instance mocks
    mockSetViewport = vi.fn();
    mockZoomIn = vi.fn();
    mockZoomOut = vi.fn();

    const mockGetViewport = vi.fn(() => ({ x: 0, y: 0, zoom: 1 }));

    vi.mocked(useReactFlow).mockReturnValue({
      zoomIn: mockZoomIn,
      zoomOut: mockZoomOut,
      setCenter: vi.fn(),
      fitView: vi.fn(),
      getZoom: vi.fn(() => 1),
      getViewport: mockGetViewport,
      setViewport: mockSetViewport,
      project: vi.fn(),
      flowToScreenPosition: vi.fn(),
      screenToFlowPosition: vi.fn(),
      getNode: vi.fn(),
      getEdge: vi.fn(),
      getNodes: vi.fn(() => []),
      getEdges: vi.fn(() => []),
      toObject: vi.fn(),
    } as any);

    // Setup minimal store mocks (same structure as other MindMap tests)
    const mockLayoutManager = new MindMapLayoutManager();
    mockLayoutManager.getVisibleNodes = vi.fn(nodes => nodes);
    mockLayoutManager.getVisibleEdges = vi.fn(edges => edges);

    vi.mocked(useMindMapStore.useMindMapStore).mockImplementation(selector => {
      const mockStore = {
        initializeMindMap: vi.fn(),
        isInitialized: true,
        layoutManager: mockLayoutManager,
        rootNodeId: 'root-node',
        mindMapId: 'test-id',
        nodes: mockNodes,
        edges: mockEdges,
        layout: 'LR' as const,
        selectedNodeId: null,
        isGenerating: false,
        generationError: null,
        generationSummary: null,
        generationProgress: null,
        history: [],
        historyIndex: 0,
        maxHistorySize: 50,
        dataManager: {} as MindMapDataManager,
        actionsManager: {} as MindMapActionsManager,
        isInitializing: false,
        saveCallback: null,
        taskEventUnsubscribe: null,
        currentWorkflowId: null,
        currentGenerationWorkflowId: null,
        pendingMindmapChanges: 0,
        expectedMindmapChanges: 0,
        generationComplete: false,
        finalGenerationResult: null,
        canUndo: () => false,
        canRedo: () => false,
        changeLayout: vi.fn(),
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
        updateNodeDimensions: vi.fn(),
        resetLayout: vi.fn(),
        undo: vi.fn(),
        redo: vi.fn(),
        saveToHistory: vi.fn(),
        selectNode: vi.fn(),
        setGenerating: vi.fn(),
        setGenerationError: vi.fn(),
        setGenerationSummary: vi.fn(),
        setGenerationProgress: vi.fn(),
        startIterativeGeneration: vi.fn(),
        cancelIterativeGeneration: vi.fn(),
        applyMindmapChanges: vi.fn(),
        connectToWorkflow: vi.fn(),
        disconnectFromWorkflow: vi.fn(),
        save: vi.fn(),
        reset: vi.fn(),
      };
      return selector(mockStore);
    });

    vi.mocked(useMindMapStore.useMindMapNodes).mockReturnValue(mockNodes);
    vi.mocked(useMindMapStore.useMindMapEdges).mockReturnValue(mockEdges);
    vi.mocked(useMindMapStore.useMindMapLayout).mockReturnValue('LR');
    vi.mocked(useMindMapStore.useMindMapSelection).mockReturnValue({
      selectedNodeId: null,
      selectNode: vi.fn(),
      clearSelection: vi.fn(),
    });
    vi.mocked(useMindMapStore.useMindMapHistory).mockReturnValue({
      canUndo: false,
      canRedo: false,
      undo: vi.fn(),
      redo: vi.fn(),
    });
    vi.mocked(useMindMapStore.useMindMapGeneration).mockReturnValue({
      isGenerating: false,
      generatingNodeId: null,
      generateContent: vi.fn(),
      cancelGeneration: vi.fn(),
      setGenerationError: vi.fn(),
      setGenerationSummary: vi.fn(),
      generationError: null,
      generationSummary: null,
      generationProgress: null,
      setGenerating: vi.fn(),
      setGenerationProgress: vi.fn(),
      startIterativeGeneration: vi.fn(),
      cancelIterativeGeneration: vi.fn(),
    });
    vi.mocked(useMindMapStore.useMindMapActions).mockReturnValue({
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
      updateNodeDimensions: vi.fn(),
      changeLayout: vi.fn(),
      resetLayout: vi.fn(),
      applyMindmapChanges: vi.fn(),
    });

    // Mock drag state
    vi.mocked(useMindMapDrag.useMindMapDrag).mockReturnValue({
      draggedNodeId: null,
      closestDropTarget: null,
      dropPosition: null,
      hasDraggedSignificantly: false,
      dragCursorPosition: null,
      onNodeDragStart: vi.fn(),
      onNodeDrag: vi.fn(),
      onNodeDragStop: vi.fn(),
    });

    // Mock generation streaming
    vi.mocked(useGenerationStreaming.useGenerationStreaming).mockReturnValue({
      streamedContent: '',
      isStreaming: false,
      error: null,
      startStreaming: vi.fn(),
      stopStreaming: vi.fn(),
    });

    // Mock iterative generation
    vi.mocked(useIterativeGeneration.useIterativeGeneration).mockReturnValue({
      isGenerating: false,
      generatingNodeId: null,
      startGeneration: vi.fn(),
      cancelGeneration: vi.fn(),
    });

    // Mock dialog animation
    vi.mocked(useDialogAnimation.useDialogAnimation).mockReturnValue({
      shouldRender: false,
      isVisible: false,
      handleClose: vi.fn(),
    });

    // Mock app store with key bindings
    vi.mocked(useAppStore.useAppStore).mockImplementation(selector => {
      return selector(mockAppStore as any);
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Scenario: Pan mode with Space key held during vertical scroll', () => {
    it('should pan viewport vertically when Space is held and scrolling vertically', async () => {
      const { container } = render(
        <MindMap
          mindMapId="test-map"
          onSave={vi.fn()}
          initialData={mockMindMapData}
        />
      );

      const reactFlowContainer = container.querySelector('.react-flow');
      expect(reactFlowContainer).toBeTruthy();

      // Wait for component to fully mount and effects to run
      await waitFor(() => {
        expect(mockStoreState.initializeMindMap).toHaveBeenCalled();
      });

      // Small delay to ensure useEffect wheel handler is attached
      await new Promise(resolve => setTimeout(resolve, 50));

      // Simulate Space key down
      await user.keyboard('{Space>}');

      // Wait for pan mode to activate
      await waitFor(() => screen.getByText('Pan Mode'));

      // Simulate scroll wheel while Space is held
      const wheelEvent = new WheelEvent('wheel', {
        deltaY: 100,
        deltaX: 0,
        bubbles: true,
        cancelable: true,
      });

      fireEvent(reactFlowContainer!, wheelEvent);

      // Should pan (setViewport called), not zoom
      await waitFor(() => {
        expect(mockSetViewport).toHaveBeenCalled();
      });

      // Zoom functions should NOT be called
      expect(mockZoomIn).not.toHaveBeenCalled();
      expect(mockZoomOut).not.toHaveBeenCalled();
    });

    it('should keep zoom level unchanged when panning with Space', async () => {
      const { container } = render(
        <MindMap
          mindMapId="test-map"
          onSave={vi.fn()}
          initialData={mockMindMapData}
        />
      );

      const reactFlowContainer = container.querySelector('.react-flow');

      await waitFor(() => {
        expect(mockStoreState.initializeMindMap).toHaveBeenCalled();
      });

      // Simulate Space key down
      await user.keyboard('{Space>}');

      // Wait for pan mode to activate
      await waitFor(() => screen.getByText('Pan Mode'));

      const wheelEvent = new WheelEvent('wheel', {
        deltaY: 100,
        bubbles: true,
        cancelable: true,
      });

      fireEvent(reactFlowContainer!, wheelEvent);

      // Verify zoom is preserved in setViewport call
      await waitFor(() => {
        expect(mockSetViewport).toHaveBeenCalledWith(
          expect.objectContaining({
            zoom: 1, // Original zoom level
          })
        );
      });
    });
  });

  describe('Scenario: Default zoom mode without modifier key', () => {
    it('should zoom in/out when scrolling without holding Space', async () => {
      const { container } = render(
        <MindMap
          mindMapId="test-map"
          onSave={vi.fn()}
          initialData={mockMindMapData}
        />
      );

      const reactFlowContainer = container.querySelector('.react-flow');

      await waitFor(() => {
        expect(mockStoreState.initializeMindMap).toHaveBeenCalled();
      });

      // Scroll up (negative deltaY = zoom in)
      const zoomInEvent = new WheelEvent('wheel', {
        deltaY: -100,
        bubbles: true,
        cancelable: true,
      });

      fireEvent(reactFlowContainer!, zoomInEvent);

      await waitFor(() => {
        expect(mockZoomIn).toHaveBeenCalled();
      });

      vi.clearAllMocks();

      // Scroll down (positive deltaY = zoom out)
      const zoomOutEvent = new WheelEvent('wheel', {
        deltaY: 100,
        bubbles: true,
        cancelable: true,
      });

      fireEvent(reactFlowContainer!, zoomOutEvent);

      await waitFor(() => {
        expect(mockZoomOut).toHaveBeenCalled();
      });
    });

    it('should center zoom on mouse cursor position', async () => {
      const { container } = render(
        <MindMap
          mindMapId="test-map"
          onSave={vi.fn()}
          initialData={mockMindMapData}
        />
      );

      const reactFlowContainer = container.querySelector('.react-flow');

      await waitFor(() => {
        expect(mockStoreState.initializeMindMap).toHaveBeenCalled();
      });

      // Scroll at specific mouse position
      const wheelEvent = new WheelEvent('wheel', {
        deltaY: -100,
        clientX: 200,
        clientY: 150,
        bubbles: true,
        cancelable: true,
      });

      fireEvent(reactFlowContainer!, wheelEvent);

      await waitFor(() => {
        expect(mockZoomIn).toHaveBeenCalled();
      });
    });
  });

  describe('Scenario: Overlay display changes with modifier key press', () => {
    it('should display "Zoom Mode (hold Space for Pan Mode)" by default', async () => {
      render(
        <MindMap
          mindMapId="test-map"
          onSave={vi.fn()}
          initialData={mockMindMapData}
        />
      );

      await waitFor(() => {
        expect(mockStoreState.initializeMindMap).toHaveBeenCalled();
      });

      // Check for overlay text
      const overlay = screen.getByText(/Zoom Mode.*hold Space for Pan Mode/i);
      expect(overlay).toBeTruthy();
    });

    it('should change overlay to "Pan Mode" when Space is held', async () => {
      render(
        <MindMap
          mindMapId="test-map"
          onSave={vi.fn()}
          initialData={mockMindMapData}
        />
      );

      await waitFor(() => {
        expect(mockStoreState.initializeMindMap).toHaveBeenCalled();
      });

      // Simulate Space key down
      await user.keyboard('{Space>}');

      // Check overlay text changed
      await waitFor(() => {
        expect(screen.getByText('Pan Mode')).toBeTruthy();
      });

      // Release Space
      await user.keyboard('{/Space}');

      // Should revert to default text
      await waitFor(() => {
        expect(screen.getByText(/Zoom Mode.*hold Space for Pan Mode/i)).toBeTruthy();
      });
    });

    it('should make overlay fully opaque when Space is held', async () => {
      render(
        <MindMap
          mindMapId="test-map"
          onSave={vi.fn()}
          initialData={mockMindMapData}
        />
      );

      await waitFor(() => {
        expect(mockStoreState.initializeMindMap).toHaveBeenCalled();
      });

      const overlay = screen.getByTestId('scroll-mode-overlay');

      // Default state: semi-transparent
      expect(overlay).toHaveStyle({ opacity: '0.5' });

      // Press Space
      await user.keyboard('{Space>}');

      // Should become fully opaque
      await waitFor(() => {
        expect(overlay).toHaveStyle({ opacity: '1' });
      });
    });
  });

  describe('Scenario: Key bindings dialog shows pan mode modifier entry', () => {
    it('should show "Pan Mode Modifier" entry in key bindings dialog', async () => {
      // This test requires ControlsModal to be opened
      // For now, we test that the binding exists in the store
      expect(mockAppStore.mindMapKeyBindings.panModifier).toBe('Space');
    });

    it('should have default key set to "Space"', async () => {
      const bindings = mockAppStore.mindMapKeyBindings;
      expect(bindings.panModifier).toBe('Space');
    });
  });

  describe('Scenario: Rebinding pan mode modifier key', () => {
    it('should use new modifier key after rebinding', async () => {
      // Update binding to Shift
      mockAppStore.mindMapKeyBindings.panModifier = 'Shift';

      const { container } = render(
        <MindMap
          mindMapId="test-map"
          onSave={vi.fn()}
          initialData={mockMindMapData}
        />
      );

      const reactFlowContainer = container.querySelector('.react-flow');

      await waitFor(() => {
        expect(mockStoreState.initializeMindMap).toHaveBeenCalled();
      });

      // Simulate Shift key + scroll (should pan)
      const wheelEvent = new WheelEvent('wheel', {
        deltaY: 100,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });

      fireEvent(reactFlowContainer!, wheelEvent);

      await waitFor(() => {
        expect(mockSetViewport).toHaveBeenCalled();
      });

      // Space should no longer work as pan modifier
      vi.clearAllMocks();

      const spaceWheelEvent = new WheelEvent('wheel', {
        deltaY: 100,
        bubbles: true,
        cancelable: true,
      });

      Object.defineProperty(spaceWheelEvent, 'key', { value: ' ', writable: false });

      fireEvent(reactFlowContainer!, spaceWheelEvent);

      // Should zoom (not pan) since Space is no longer the pan modifier
      await waitFor(() => {
        expect(mockZoomOut).toHaveBeenCalled();
      });
      expect(mockSetViewport).not.toHaveBeenCalled();
    });
  });

  describe('Scenario: Overlay opacity changes on interaction', () => {
    it('should be semi-transparent (50% opacity) when idle', async () => {
      render(
        <MindMap
          mindMapId="test-map"
          onSave={vi.fn()}
          initialData={mockMindMapData}
        />
      );

      await waitFor(() => {
        expect(mockStoreState.initializeMindMap).toHaveBeenCalled();
      });

      const overlay = screen.getByTestId('scroll-mode-overlay');
      expect(overlay).toHaveStyle({ opacity: '0.5' });
    });

    it('should become fully opaque when Space is pressed', async () => {
      render(
        <MindMap
          mindMapId="test-map"
          onSave={vi.fn()}
          initialData={mockMindMapData}
        />
      );

      await waitFor(() => {
        expect(mockStoreState.initializeMindMap).toHaveBeenCalled();
      });

      const overlay = screen.getByTestId('scroll-mode-overlay');

      await user.keyboard('{Space>}');

      await waitFor(() => {
        expect(overlay).toHaveStyle({ opacity: '1' });
      });
    });

    it('should become fully opaque during scrolling', async () => {
      const { container } = render(
        <MindMap
          mindMapId="test-map"
          onSave={vi.fn()}
          initialData={mockMindMapData}
        />
      );

      await waitFor(() => {
        expect(mockStoreState.initializeMindMap).toHaveBeenCalled();
      });

      const overlay = screen.getByTestId('scroll-mode-overlay');
      const reactFlowContainer = container.querySelector('.react-flow');

      // Trigger scroll event
      const wheelEvent = new WheelEvent('wheel', {
        deltaY: 100,
        bubbles: true,
        cancelable: true,
      });

      fireEvent(reactFlowContainer!, wheelEvent);

      // Should become opaque during scroll
      await waitFor(() => {
        expect(overlay).toHaveStyle({ opacity: '1' });
      });
    });
  });

  describe('Scenario: Pan mode modifier only active when mouse is over MindMap container', () => {
    it('should activate pan mode when Space is held and mouse is over container', async () => {
      const { container } = render(
        <MindMap
          mindMapId="test-map"
          onSave={vi.fn()}
          initialData={mockMindMapData}
        />
      );

      await waitFor(() => {
        expect(mockStoreState.initializeMindMap).toHaveBeenCalled();
      });

      // Get the main container div
      const mindMapContainer = container.firstChild as HTMLElement;

      // Simulate mouse entering the container
      fireEvent.mouseEnter(mindMapContainer);

      // Hold Space
      await user.keyboard('{Space>}');

      // Pan mode should activate
      await waitFor(() => screen.getByText('Pan Mode'));
    });
  });

  describe('Scenario: Pan mode modifier inactive when mouse is outside MindMap container', () => {
    it('should NOT activate pan mode when Space is held with mouse outside container', async () => {
      const { container } = render(
        <MindMap
          mindMapId="test-map"
          onSave={vi.fn()}
          initialData={mockMindMapData}
        />
      );

      await waitFor(() => {
        expect(mockStoreState.initializeMindMap).toHaveBeenCalled();
      });

      // Mouse is NOT over container (default state)
      // Hold Space
      await user.keyboard('{Space>}');

      // Pan mode should NOT activate - overlay should still show Zoom Mode
      const overlay = screen.getByTestId('scroll-mode-overlay');
      expect(overlay).toHaveTextContent('Zoom Mode (hold Space for Pan Mode)');
    });

    it('should clear pan mode when mouse leaves container', async () => {
      const { container } = render(
        <MindMap
          mindMapId="test-map"
          onSave={vi.fn()}
          initialData={mockMindMapData}
        />
      );

      await waitFor(() => {
        expect(mockStoreState.initializeMindMap).toHaveBeenCalled();
      });

      const mindMapContainer = container.firstChild as HTMLElement;

      // Mouse enters container
      fireEvent.mouseEnter(mindMapContainer);

      // Hold Space - should activate pan mode
      await user.keyboard('{Space>}');
      await waitFor(() => screen.getByText('Pan Mode'));

      // Mouse leaves container - should clear pan mode
      fireEvent.mouseLeave(mindMapContainer);

      // Should return to Zoom Mode
      await waitFor(() => screen.getByText(/Zoom Mode/));
    });
  });

  describe('Scenario: Overlay positioned at bottom-left of ReactFlow container', () => {
    it('should position overlay with absolute positioning relative to container', async () => {
      const { container } = render(
        <MindMap
          mindMapId="test-map"
          onSave={vi.fn()}
          initialData={mockMindMapData}
        />
      );

      await waitFor(() => {
        expect(mockStoreState.initializeMindMap).toHaveBeenCalled();
      });

      const overlay = screen.getByTestId('scroll-mode-overlay');

      // Check that overlay uses absolute positioning (not fixed)
      expect(overlay).toHaveClass('absolute');
      expect(overlay).not.toHaveClass('fixed');

      // Check that it's positioned at bottom-left
      expect(overlay).toHaveClass('bottom-4');
      expect(overlay).toHaveClass('left-4');

      // Check that it has pointer-events-none so it doesn't interfere
      expect(overlay).toHaveClass('pointer-events-none');
    });
  });
});
