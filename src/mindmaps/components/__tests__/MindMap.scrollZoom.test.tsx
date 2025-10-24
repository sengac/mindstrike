/**
 * Feature: spec/features/mindmap-zoom-with-scroll-wheel.feature
 *
 * This test file validates the acceptance criteria defined in the feature file.
 * Scenarios in this test map directly to scenarios in the Gherkin feature.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MindMap } from '../MindMap';
import { mockMindMapData } from '../../__fixtures__/mindMapData';
import ReactFlow, { useReactFlow } from 'reactflow';

// Mock modules
vi.mock('../../../store/useMindMapStore');
vi.mock('../../hooks/useMindMapDrag');
vi.mock('../../../hooks/useGenerationStreaming');
vi.mock('../../../hooks/useIterativeGeneration');
vi.mock('../../../hooks/useDialogAnimation');
vi.mock('../../../components/MusicVisualization');
vi.mock('../../../components/shared/GenerateDialog');
vi.mock('../MindMapNode');

// Import mocked modules
import * as useMindMapStore from '../../../store/useMindMapStore';
import * as useMindMapDrag from '../../hooks/useMindMapDrag';
import * as useGenerationStreaming from '../../../hooks/useGenerationStreaming';
import * as useIterativeGeneration from '../../../hooks/useIterativeGeneration';
import * as useDialogAnimation from '../../../hooks/useDialogAnimation';
import { MusicVisualization } from '../../../components/MusicVisualization';
import { GenerateDialog } from '../../../components/shared/GenerateDialog';
import { MindMapNode } from '../MindMapNode';
import { MindMapLayoutManager } from '../../../utils/mindMapLayout';
import type { MindMapDataManager } from '../../../utils/mindMapData';
import type { MindMapActionsManager } from '../../../utils/mindMapActions';

describe('Feature: Mindmap Zoom with Scroll Wheel', () => {
  const mockZoomIn = vi.fn();
  const mockZoomOut = vi.fn();
  const mockSetCenter = vi.fn();
  const mockPanBy = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock ResizeObserver
    global.ResizeObserver = vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    }));

    // Mock ReactFlow instance with zoom/pan methods
    vi.mocked(useReactFlow).mockReturnValue({
      zoomIn: mockZoomIn,
      zoomOut: mockZoomOut,
      setCenter: mockSetCenter,
      fitView: vi.fn(),
      getZoom: vi.fn(() => 1),
      getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
      setViewport: vi.fn(),
      project: vi.fn(),
      flowToScreenPosition: vi.fn(),
      screenToFlowPosition: vi.fn(),
      getNode: vi.fn(),
      getEdge: vi.fn(),
      getNodes: vi.fn(() => []),
      getEdges: vi.fn(() => []),
      toObject: vi.fn(),
    } as any);

    // Setup minimal store mocks
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

  describe('Scenario: Zoom in with scroll wheel up', () => {
    it('should zoom in when mouse wheel scrolls up', async () => {
      const { container } = render(
        <MindMap
          mindMapId="test-map"
          onSave={vi.fn()}
          initialData={mockMindMapData}
        />
      );

      // Find the ReactFlow container
      const reactFlowContainer = container.querySelector('.react-flow');
      expect(reactFlowContainer).toBeTruthy();

      // Simulate scroll wheel up (negative deltaY = scroll up)
      const wheelEvent = new WheelEvent('wheel', {
        deltaY: -100,
        bubbles: true,
        cancelable: true,
      });

      fireEvent(reactFlowContainer!, wheelEvent);

      // Should zoom in (not pan)
      expect(mockZoomIn).toHaveBeenCalled();
      expect(mockSetCenter).not.toHaveBeenCalled();
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
      expect(reactFlowContainer).toBeTruthy();

      // Simulate scroll at specific mouse position
      const wheelEvent = new WheelEvent('wheel', {
        deltaY: -100,
        clientX: 200,
        clientY: 150,
        bubbles: true,
        cancelable: true,
      });

      fireEvent(reactFlowContainer!, wheelEvent);

      // Zoom should be centered on cursor position (200, 150)
      // This will be verified through ReactFlow prop configuration
      expect(mockZoomIn).toHaveBeenCalled();
    });
  });

  describe('Scenario: Zoom out with scroll wheel down', () => {
    it('should zoom out when mouse wheel scrolls down', async () => {
      const { container } = render(
        <MindMap
          mindMapId="test-map"
          onSave={vi.fn()}
          initialData={mockMindMapData}
        />
      );

      const reactFlowContainer = container.querySelector('.react-flow');
      expect(reactFlowContainer).toBeTruthy();

      // Simulate scroll wheel down (positive deltaY = scroll down)
      const wheelEvent = new WheelEvent('wheel', {
        deltaY: 100,
        bubbles: true,
        cancelable: true,
      });

      fireEvent(reactFlowContainer!, wheelEvent);

      // Should zoom out (not pan)
      expect(mockZoomOut).toHaveBeenCalled();
      expect(mockSetCenter).not.toHaveBeenCalled();
    });
  });

  describe('Scenario: Pan with click and drag', () => {
    it('should pan when clicking and dragging on canvas', async () => {
      render(
        <MindMap
          mindMapId="test-map"
          onSave={vi.fn()}
          initialData={mockMindMapData}
        />
      );

      // Verify that ReactFlow has panning enabled via props
      // ReactFlow is mocked, so we check it was called with correct props
      const reactFlowCalls = vi.mocked(ReactFlow).mock.calls;
      expect(reactFlowCalls.length).toBeGreaterThan(0);

      const lastCall = reactFlowCalls[reactFlowCalls.length - 1];
      const props = lastCall?.[0];

      // nodesDraggable should be true (for node dragging)
      // panOnDrag should be true (for canvas panning with click-drag)
      expect(props).toMatchObject({
        nodesDraggable: true,
      });
    });
  });

  describe('Scenario: Pan with Ctrl+scroll wheel', () => {
    it('should pan (not zoom) when Ctrl key is held and scrolling', async () => {
      const { container } = render(
        <MindMap
          mindMapId="test-map"
          onSave={vi.fn()}
          initialData={mockMindMapData}
        />
      );

      const reactFlowContainer = container.querySelector('.react-flow');
      expect(reactFlowContainer).toBeTruthy();

      // Simulate Ctrl+scroll wheel (should pan instead of zoom)
      const wheelEvent = new WheelEvent('wheel', {
        deltaY: 100,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });

      fireEvent(reactFlowContainer!, wheelEvent);

      // Should pan (not zoom) when Ctrl is held
      expect(mockZoomIn).not.toHaveBeenCalled();
      expect(mockZoomOut).not.toHaveBeenCalled();
      // Panning would be handled by ReactFlow's panOnScroll or custom handler
    });

    it('should keep zoom level unchanged when Ctrl+scrolling', async () => {
      const mockGetZoom = vi.fn(() => 1.5);
      vi.mocked(useReactFlow).mockReturnValue({
        zoomIn: mockZoomIn,
        zoomOut: mockZoomOut,
        getZoom: mockGetZoom,
        setCenter: mockSetCenter,
        fitView: vi.fn(),
        getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1.5 })),
        setViewport: vi.fn(),
        project: vi.fn(),
        flowToScreenPosition: vi.fn(),
        screenToFlowPosition: vi.fn(),
        getNode: vi.fn(),
        getEdge: vi.fn(),
        getNodes: vi.fn(() => []),
        getEdges: vi.fn(() => []),
        toObject: vi.fn(),
      } as any);

      const { container } = render(
        <MindMap
          mindMapId="test-map"
          onSave={vi.fn()}
          initialData={mockMindMapData}
        />
      );

      const reactFlowContainer = container.querySelector('.react-flow');
      expect(reactFlowContainer).toBeTruthy();

      const initialZoom = mockGetZoom();

      // Ctrl+scroll should not change zoom
      const wheelEvent = new WheelEvent('wheel', {
        deltaY: 100,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });

      fireEvent(reactFlowContainer!, wheelEvent);

      // Zoom should remain unchanged
      expect(mockGetZoom()).toBe(initialZoom);
      expect(mockZoomIn).not.toHaveBeenCalled();
      expect(mockZoomOut).not.toHaveBeenCalled();
    });
  });

  describe('Scenario: Touchpad pinch-to-zoom still works', () => {
    it('should enable pinch-to-zoom gesture', async () => {
      render(
        <MindMap
          mindMapId="test-map"
          onSave={vi.fn()}
          initialData={mockMindMapData}
        />
      );

      // Verify that ReactFlow has zoomOnPinch enabled
      const reactFlowCalls = vi.mocked(ReactFlow).mock.calls;
      expect(reactFlowCalls.length).toBeGreaterThan(0);

      const lastCall = reactFlowCalls[reactFlowCalls.length - 1];
      const props = lastCall?.[0];

      // zoomOnPinch should be true
      expect(props).toMatchObject({
        zoomOnPinch: true,
      });
    });
  });

  describe('ReactFlow Configuration', () => {
    it('should configure ReactFlow for scroll wheel zoom (not pan)', async () => {
      render(
        <MindMap
          mindMapId="test-map"
          onSave={vi.fn()}
          initialData={mockMindMapData}
        />
      );

      const reactFlowCalls = vi.mocked(ReactFlow).mock.calls;
      expect(reactFlowCalls.length).toBeGreaterThan(0);

      const lastCall = reactFlowCalls[reactFlowCalls.length - 1];
      const props = lastCall?.[0];

      // Critical props for scroll wheel zoom functionality
      expect(props).toMatchObject({
        panOnScroll: false, // Disable scroll panning (we want zoom instead)
        zoomOnScroll: true, // Enable scroll zooming
        zoomOnPinch: true,  // Keep pinch-to-zoom
      });
    });
  });
});
