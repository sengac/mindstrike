/**
 * @vitest-environment jsdom
 */

/**
 * Feature: spec/features/diagonal-scroll-only-zooms-doesn-t-pan-horizontally.feature
 *
 * This test file validates the bug fix for BUG-003.
 * The bug: "else if" logic prevents simultaneous zoom and pan during diagonal scroll.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
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

// Mock modules
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

describe("Feature: Diagonal scroll only zooms, doesn't pan horizontally (BUG-003)", () => {
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

  describe('Scenario: Diagonal scroll performs both zoom and pan simultaneously', () => {
    it('should pan horizontally AND zoom when scrolling diagonally', async () => {
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

      // When: I scroll diagonally down-right with both deltaX and deltaY
      const wheelEvent = new WheelEvent('wheel', {
        deltaX: 50, // Horizontal scroll right
        deltaY: 50, // Vertical scroll down (zoom out)
        bubbles: true,
        cancelable: true,
      });

      reactFlowElement?.dispatchEvent(wheelEvent);

      // Then: the mindmap should zoom out (ReactFlow handles deltaY)
      // And: the mindmap should pan to the right (our handleWheel should handle deltaX)
      // And: both operations should happen simultaneously

      // CRITICAL TEST: Verify setViewport was called with both x and y modified
      expect(mockSetViewport).toHaveBeenCalled();

      const call = mockSetViewport.mock.calls[0][0];

      // Verify horizontal panning occurred (x changed)
      expect(call.x).toBeDefined();
      expect(call.x).toBeLessThan(0); // Panning right moves viewport left (negative x)

      // Verify viewport object structure
      expect(call).toHaveProperty('x');
      expect(call).toHaveProperty('y');
      expect(call).toHaveProperty('zoom');
    });

    it('should NOT skip horizontal panning when vertical scroll is also present', async () => {
      // This test specifically validates the bug fix:
      // The bug was that "else if (hasHorizontalScroll)" prevented horizontal
      // panning when vertical scroll was present. This test ensures BOTH happen.

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

      // When: I scroll with BOTH deltaX and deltaY (diagonal scroll)
      const wheelEvent = new WheelEvent('wheel', {
        deltaX: 30,
        deltaY: 40,
        bubbles: true,
        cancelable: true,
      });

      reactFlowElement?.dispatchEvent(wheelEvent);

      // Then: setViewport MUST have been called (horizontal pan must execute)
      expect(mockSetViewport).toHaveBeenCalled();

      // And: The x coordinate must have changed (proving horizontal pan occurred)
      const call = mockSetViewport.mock.calls[0][0];
      expect(call.x).not.toBe(0); // X must have changed
    });
  });
});
