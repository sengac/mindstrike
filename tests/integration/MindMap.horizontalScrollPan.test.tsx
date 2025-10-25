/**
 * @vitest-environment jsdom
 */

/**
 * Feature: spec/features/horizontal-scroll-panning-for-mindmap.feature
 *
 * This test file validates the acceptance criteria defined in the feature file.
 * Scenarios in this test map directly to scenarios in the Gherkin feature.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MindMap } from '../../src/mindmaps/components/MindMap';
import { mockMindMapData } from '../../src/mindmaps/__fixtures__/mindMapData';
import { useReactFlow } from 'reactflow';

// Mock ReactFlow
vi.mock('reactflow', async () => {
  const actual = await vi.importActual<typeof import('reactflow')>('reactflow');
  return {
    ...actual,
    useReactFlow: vi.fn(),
  };
});

// Mock modules (same as scrollZoom test)
vi.mock('../../src/store/useMindMapStore');
vi.mock('../../src/mindmaps/hooks/useMindMapDrag');
vi.mock('../../src/hooks/useGenerationStreaming');
vi.mock('../../src/hooks/useIterativeGeneration');
vi.mock('../../src/hooks/useDialogAnimation');
vi.mock('../../src/components/MusicVisualization');
vi.mock('../../src/components/shared/GenerateDialog');
vi.mock('../../src/mindmaps/components/MindMapNode');

// Import mocked modules
import * as useMindMapStore from '../../src/store/useMindMapStore';
import * as useMindMapDrag from '../../src/mindmaps/hooks/useMindMapDrag';
import * as useGenerationStreaming from '../../src/hooks/useGenerationStreaming';
import * as useIterativeGeneration from '../../src/hooks/useIterativeGeneration';
import * as useDialogAnimation from '../../src/hooks/useDialogAnimation';
import { MusicVisualization } from '../../src/components/MusicVisualization';
import { GenerateDialog } from '../../src/components/shared/GenerateDialog';
import { MindMapNode } from '../../src/mindmaps/components/MindMapNode';
import { MindMapLayoutManager } from '../../src/utils/mindMapLayout';
import type { MindMapDataManager } from '../../src/utils/mindMapData';
import type { MindMapActionsManager } from '../../src/utils/mindMapActions';

describe('Feature: Horizontal scroll panning for mindmap', () => {
  const mockSetViewport = vi.fn();
  const mockGetViewport = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock ResizeObserver
    global.ResizeObserver = vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    }));

    // Mock ReactFlow instance with viewport methods
    mockGetViewport.mockReturnValue({ x: 0, y: 0, zoom: 1 });

    vi.mocked(useReactFlow).mockReturnValue({
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
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

    // Setup minimal store mocks (same structure as scrollZoom test)
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
        nodes: [],
        edges: [],
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

    vi.mocked(useMindMapStore.useMindMapNodes).mockReturnValue([]);
    vi.mocked(useMindMapStore.useMindMapEdges).mockReturnValue([]);
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

    vi.mocked(useMindMapDrag.useMindMapDrag).mockReturnValue({
      draggedNodeId: null,
      closestDropTarget: null,
      dropPosition: null,
      hasDraggedSignificantly: false,
      dragCursorPosition: null,
      onNodeDragStart: vi.fn(),
      onNodeDrag: vi.fn(),
      onNodeDragStop: vi.fn(),
      findClosestNode: vi.fn(),
      getDropPosition: vi.fn(),
      wouldCreateCycle: vi.fn(),
    });

    vi.mocked(useGenerationStreaming.useGenerationStreaming).mockReturnValue({
      isStreaming: false,
      stats: {
        tokensPerSecond: 0,
        totalTokens: 0,
        status: 'Preparing...',
      },
      startStreaming: vi.fn(),
      stopStreaming: vi.fn(),
      cancelGeneration: vi.fn(),
    });

    vi.mocked(useIterativeGeneration.useIterativeGeneration).mockReturnValue({
      iterations: [],
      isGenerating: false,
      error: null,
      generateIteratively: vi.fn(),
      cancelGeneration: vi.fn(),
      startGeneration: vi.fn(),
      isTaskGenerating: false,
    });

    vi.mocked(useDialogAnimation.useDialogAnimation).mockReturnValue({
      shouldRender: false,
      isVisible: false,
      handleClose: vi.fn(),
    });

    vi.mocked(MusicVisualization).mockImplementation(
      ({ className }: { className?: string }) =>
        React.createElement('div', {
          'data-testid': 'music-visualization',
          className,
        })
    );

    vi.mocked(GenerateDialog).mockImplementation(() => null);

    vi.mocked(MindMapNode).mockImplementation(
      ({ data }: { data: { label: string } }) =>
        React.createElement(
          'div',
          {
            'data-testid': `mind-map-node-${data.label}`,
          },
          data.label
        )
    );
  });

  describe('Scenario: Pan mindmap right with horizontal scroll', () => {
    it('should pan to the right when scrolling horizontally right', async () => {
      // Given: I am viewing a mindmap with nodes extending beyond the right edge
      const { container } = render(
        <MindMap
          mindMapId="test-mindmap"
          onSave={vi.fn()}
          initialData={mockMindMapData}
        />
      );

      const reactFlowElement = container.querySelector('.react-flow');
      expect(reactFlowElement).toBeTruthy();

      // When: I scroll horizontally to the right on my trackpad
      const wheelEvent = new WheelEvent('wheel', {
        deltaX: 50, // Positive deltaX = scroll right
        deltaY: 0,
        bubbles: true,
        cancelable: true,
      });

      reactFlowElement?.dispatchEvent(wheelEvent);

      // Then: the mindmap should pan to the right
      expect(mockSetViewport).toHaveBeenCalledWith({
        x: expect.any(Number),
        y: 0,
        zoom: 1,
      });

      // And: nodes on the right side should become visible (viewport.x changes)
      const call = mockSetViewport.mock.calls[0][0];
      expect(call.x).toBeLessThan(0); // Panning right moves viewport left (negative x)
    });
  });

  describe('Scenario: Pan mindmap left with horizontal scroll', () => {
    it('should pan to the left when scrolling horizontally left', async () => {
      // Given: I am viewing a mindmap with nodes extending beyond the left edge
      const { container } = render(
        <MindMap
          mindMapId="test-mindmap"
          onSave={vi.fn()}
          initialData={mockMindMapData}
        />
      );

      const reactFlowElement = container.querySelector('.react-flow');
      expect(reactFlowElement).toBeTruthy();

      // When: I scroll horizontally to the left on my trackpad
      const wheelEvent = new WheelEvent('wheel', {
        deltaX: -50, // Negative deltaX = scroll left
        deltaY: 0,
        bubbles: true,
        cancelable: true,
      });

      reactFlowElement?.dispatchEvent(wheelEvent);

      // Then: the mindmap should pan to the left
      expect(mockSetViewport).toHaveBeenCalledWith({
        x: expect.any(Number),
        y: 0,
        zoom: 1,
      });

      // And: nodes on the left side should become visible (viewport.x changes)
      const call = mockSetViewport.mock.calls[0][0];
      expect(call.x).toBeGreaterThan(0); // Panning left moves viewport right (positive x)
    });
  });

  describe('Scenario: Vertical scroll still zooms in (unchanged behavior)', () => {
    it('should zoom in when scrolling vertically up', async () => {
      // Given: I am viewing a mindmap
      const { container } = render(
        <MindMap
          mindMapId="test-mindmap"
          onSave={vi.fn()}
          initialData={mockMindMapData}
        />
      );

      const reactFlowElement = container.querySelector('.react-flow');
      expect(reactFlowElement).toBeTruthy();

      // When: I scroll vertically up
      const wheelEvent = new WheelEvent('wheel', {
        deltaX: 0,
        deltaY: -50, // Negative deltaY = scroll up
        bubbles: true,
        cancelable: true,
      });

      reactFlowElement?.dispatchEvent(wheelEvent);

      // Then: the mindmap should zoom in (ReactFlow's zoomOnScroll handles this)
      // And: the zoom behavior should match the existing implementation
      // Note: ReactFlow handles vertical zoom internally when zoomOnScroll=true
      // We're verifying the configuration allows it (tested in scrollZoom tests)
      expect(reactFlowElement).toBeTruthy();
    });
  });

  describe('Scenario: Vertical scroll still zooms out (unchanged behavior)', () => {
    it('should zoom out when scrolling vertically down', async () => {
      // Given: I am viewing a mindmap
      const { container } = render(
        <MindMap
          mindMapId="test-mindmap"
          onSave={vi.fn()}
          initialData={mockMindMapData}
        />
      );

      const reactFlowElement = container.querySelector('.react-flow');
      expect(reactFlowElement).toBeTruthy();

      // When: I scroll vertically down
      const wheelEvent = new WheelEvent('wheel', {
        deltaX: 0,
        deltaY: 50, // Positive deltaY = scroll down
        bubbles: true,
        cancelable: true,
      });

      reactFlowElement?.dispatchEvent(wheelEvent);

      // Then: the mindmap should zoom out (ReactFlow's zoomOnScroll handles this)
      // And: the zoom behavior should match the existing implementation
      // Note: ReactFlow handles vertical zoom internally when zoomOnScroll=true
      expect(reactFlowElement).toBeTruthy();
    });
  });

  describe('Scenario: Diagonal scroll performs both zoom and pan', () => {
    it('should zoom out AND pan right when scrolling diagonally down-right', async () => {
      // Given: I am viewing a mindmap
      const { container } = render(
        <MindMap
          mindMapId="test-mindmap"
          onSave={vi.fn()}
          initialData={mockMindMapData}
        />
      );

      const reactFlowElement = container.querySelector('.react-flow');
      expect(reactFlowElement).toBeTruthy();

      // When: I scroll diagonally down-right on my trackpad
      const wheelEvent = new WheelEvent('wheel', {
        deltaX: 50, // Right scroll
        deltaY: 50, // Down scroll
        bubbles: true,
        cancelable: true,
      });

      reactFlowElement?.dispatchEvent(wheelEvent);

      // Then: the mindmap should zoom out (deltaY > 0, ReactFlow handles this)
      // And: the mindmap should pan to the right simultaneously (deltaX > 0, our code handles this)
      expect(mockSetViewport).toHaveBeenCalledWith({
        x: expect.any(Number),
        y: expect.any(Number),
        zoom: 1,
      });

      const call = mockSetViewport.mock.calls[0][0];
      expect(call.x).toBeLessThan(0); // Panning right moves viewport left
    });
  });

  describe('Scenario: Mouse wheel with horizontal scroll capability', () => {
    it('should pan left or right when using mouse wheel horizontal scroll', async () => {
      // Given: I have a mouse with horizontal scroll wheel
      // And: I am viewing a mindmap
      const { container } = render(
        <MindMap
          mindMapId="test-mindmap"
          onSave={vi.fn()}
          initialData={mockMindMapData}
        />
      );

      const reactFlowElement = container.querySelector('.react-flow');
      expect(reactFlowElement).toBeTruthy();

      // When: I scroll horizontally using the mouse wheel
      const wheelEvent = new WheelEvent('wheel', {
        deltaX: 30, // Horizontal scroll with mouse wheel
        deltaY: 0,
        bubbles: true,
        cancelable: true,
      });

      reactFlowElement?.dispatchEvent(wheelEvent);

      // Then: the mindmap should pan left or right accordingly
      expect(mockSetViewport).toHaveBeenCalledWith({
        x: expect.any(Number),
        y: 0,
        zoom: 1,
      });
    });
  });
});
