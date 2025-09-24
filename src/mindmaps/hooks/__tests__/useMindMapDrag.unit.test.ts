import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useReactFlow } from 'reactflow';
import type { Node, NodeDragHandler, XYPosition } from 'reactflow';
import { useMindMapDrag } from '../useMindMapDrag';
import type { MindMapNodeData } from '../../types/mindMap';
import { NODE_SIZING } from '../../constants/nodeSizing';

// Mock ReactFlow
vi.mock('reactflow', () => ({
  useReactFlow: vi.fn(),
}));

// Create typed mock
const mockUseReactFlow = vi.mocked(useReactFlow);

// Type for NodeDragHandler event parameter
type DragEvent = Parameters<NodeDragHandler>[0];

describe('useMindMapDrag', () => {
  const mockMoveNode = vi.fn();
  const mockScreenToFlowPosition =
    vi.fn<(position: XYPosition) => XYPosition>();

  // Create a minimal mock that satisfies the type requirements
  const createMockReactFlowInstance = () => ({
    screenToFlowPosition: mockScreenToFlowPosition,
    getNodes: vi.fn(),
    setNodes: vi.fn(),
    addNodes: vi.fn(),
    getNode: vi.fn(),
    getEdges: vi.fn(),
    setEdges: vi.fn(),
    addEdges: vi.fn(),
    getEdge: vi.fn(),
    toObject: vi.fn(),
    deleteElements: vi.fn(),
    getIntersectingNodes: vi.fn(),
    isNodeIntersecting: vi.fn(),
    viewportInitialized: false,
    // Add viewport helper functions
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    zoomTo: vi.fn(),
    getZoom: vi.fn(),
    setViewport: vi.fn(),
    getViewport: vi.fn(),
    fitView: vi.fn(),
    setCenter: vi.fn(),
    fitBounds: vi.fn(),
    project: vi.fn(),
    flowToScreenPosition: vi.fn(),
  });

  const createNode = (
    id: string,
    parentId?: string,
    position = { x: 0, y: 0 },
    data: Partial<MindMapNodeData> = {}
  ): Node<MindMapNodeData> => ({
    id,
    position,
    data: {
      id,
      label: `Node ${id}`,
      isRoot: id === 'root',
      parentId,
      ...data,
    } as MindMapNodeData,
    type: 'mindMapNode',
  });

  // Create a proper drag event
  const createDragEvent = (
    props: { clientX?: number; clientY?: number } = {}
  ): DragEvent => {
    return {
      clientX: props.clientX,
      clientY: props.clientY,
    } as DragEvent;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseReactFlow.mockReturnValue(
      createMockReactFlowInstance() as ReturnType<typeof useReactFlow>
    );
    mockScreenToFlowPosition.mockImplementation(({ x, y }) => ({ x, y }));
  });

  describe('findClosestNode', () => {
    it('should find the closest node excluding the dragged node', () => {
      const nodes = [
        createNode('1', undefined, { x: 0, y: 0 }),
        createNode('2', undefined, { x: 100, y: 0 }),
        createNode('3', undefined, { x: 50, y: 50 }),
      ];

      const { result } = renderHook(() =>
        useMindMapDrag({
          nodes,
          rootNodeId: 'root',
          layout: 'LR',
          moveNode: mockMoveNode,
        })
      );

      const closest = result.current.findClosestNode({ x: 40, y: 40 }, '1');
      expect(closest).toBe('3'); // Node 3 is closest to (40, 40)
    });

    it('should return null when no other nodes exist', () => {
      const nodes = [createNode('1')];

      const { result } = renderHook(() =>
        useMindMapDrag({
          nodes,
          rootNodeId: 'root',
          layout: 'LR',
          moveNode: mockMoveNode,
        })
      );

      const closest = result.current.findClosestNode({ x: 0, y: 0 }, '1');
      expect(closest).toBeNull();
    });

    it('should handle empty node list', () => {
      const { result } = renderHook(() =>
        useMindMapDrag({
          nodes: [],
          rootNodeId: 'root',
          layout: 'LR',
          moveNode: mockMoveNode,
        })
      );

      const closest = result.current.findClosestNode({ x: 0, y: 0 }, '1');
      expect(closest).toBeNull();
    });
  });

  describe('getDropPosition', () => {
    it('should return "over" for root node regardless of position', () => {
      const nodes = [createNode('root')];

      const { result } = renderHook(() =>
        useMindMapDrag({
          nodes,
          rootNodeId: 'root',
          layout: 'LR',
          moveNode: mockMoveNode,
        })
      );

      const position = result.current.getDropPosition({ x: 0, y: 0 }, 'root');
      expect(position).toBe('over');
    });

    describe('horizontal layouts (LR/RL)', () => {
      it('should detect "above" position in top third', () => {
        const nodes = [
          createNode('1', undefined, { x: 100, y: 100 }, { height: 60 }),
        ];

        const { result } = renderHook(() =>
          useMindMapDrag({
            nodes,
            rootNodeId: 'root',
            layout: 'LR',
            moveNode: mockMoveNode,
          })
        );

        // Top third: 100 + (60 * 0.33) = 119.8
        const position = result.current.getDropPosition(
          { x: 100, y: 115 },
          '1'
        );
        expect(position).toBe('above');
      });

      it('should detect "below" position in bottom third', () => {
        const nodes = [
          createNode('1', undefined, { x: 100, y: 100 }, { height: 60 }),
        ];

        const { result } = renderHook(() =>
          useMindMapDrag({
            nodes,
            rootNodeId: 'root',
            layout: 'LR',
            moveNode: mockMoveNode,
          })
        );

        // Bottom third: 100 + 60 - (60 * 0.33) = 140.2
        const position = result.current.getDropPosition(
          { x: 100, y: 145 },
          '1'
        );
        expect(position).toBe('below');
      });

      it('should detect "over" position in middle third', () => {
        const nodes = [
          createNode('1', undefined, { x: 100, y: 100 }, { height: 60 }),
        ];

        const { result } = renderHook(() =>
          useMindMapDrag({
            nodes,
            rootNodeId: 'root',
            layout: 'LR',
            moveNode: mockMoveNode,
          })
        );

        // Middle third
        const position = result.current.getDropPosition(
          { x: 100, y: 130 },
          '1'
        );
        expect(position).toBe('over');
      });

      it('should use default height when not specified', () => {
        const nodes = [createNode('1', undefined, { x: 100, y: 100 })];

        const { result } = renderHook(() =>
          useMindMapDrag({
            nodes,
            rootNodeId: 'root',
            layout: 'LR',
            moveNode: mockMoveNode,
          })
        );

        // With default height of 40: top third = 100 + (40 * 0.33) = 113.2
        const position = result.current.getDropPosition(
          { x: 100, y: 110 },
          '1'
        );
        expect(position).toBe('above');
      });
    });

    describe('vertical layouts (TB/BT)', () => {
      it('should use horizontal position for drop zones', () => {
        const nodes = [
          createNode('1', undefined, { x: 100, y: 100 }, { width: 90 }),
        ];

        const { result } = renderHook(() =>
          useMindMapDrag({
            nodes,
            rootNodeId: 'root',
            layout: 'TB',
            moveNode: mockMoveNode,
          })
        );

        // Left third: 100 + (90 * 0.33) = 129.7
        const positionAbove = result.current.getDropPosition(
          { x: 120, y: 100 },
          '1'
        );
        expect(positionAbove).toBe('above');

        // Right third: 100 + 90 - (90 * 0.33) = 160.3
        const positionBelow = result.current.getDropPosition(
          { x: 170, y: 100 },
          '1'
        );
        expect(positionBelow).toBe('below');

        // Middle third
        const positionOver = result.current.getDropPosition(
          { x: 145, y: 100 },
          '1'
        );
        expect(positionOver).toBe('over');
      });
    });
  });

  describe('wouldCreateCycle', () => {
    it('should detect direct parent-child cycle', () => {
      // Create a valid hierarchy first, then test if moving would create cycle
      const nodes = [createNode('parent'), createNode('child', 'parent')];

      const { result } = renderHook(() =>
        useMindMapDrag({
          nodes,
          rootNodeId: 'root',
          layout: 'LR',
          moveNode: mockMoveNode,
        })
      );

      // Moving parent under its own child would create a cycle
      const wouldCycle = result.current.wouldCreateCycle('parent', 'child');
      expect(wouldCycle).toBe(true);
    });

    it('should detect nested descendant cycles', () => {
      const nodes = [
        createNode('grandparent'),
        createNode('parent', 'grandparent'),
        createNode('child', 'parent'),
        createNode('grandchild', 'child'),
      ];

      const { result } = renderHook(() =>
        useMindMapDrag({
          nodes,
          rootNodeId: 'root',
          layout: 'LR',
          moveNode: mockMoveNode,
        })
      );

      // Moving grandparent under its grandchild would create a cycle
      const wouldCycle = result.current.wouldCreateCycle(
        'grandparent',
        'grandchild'
      );
      expect(wouldCycle).toBe(true);
    });

    it('should return false for valid moves', () => {
      const nodes = [
        createNode('node1'),
        createNode('node2'),
        createNode('node3', 'node1'),
      ];

      const { result } = renderHook(() =>
        useMindMapDrag({
          nodes,
          rootNodeId: 'root',
          layout: 'LR',
          moveNode: mockMoveNode,
        })
      );

      // Moving node3 to node2 is valid (no cycle)
      const wouldCycle = result.current.wouldCreateCycle('node3', 'node2');
      expect(wouldCycle).toBe(false);
    });
  });

  describe('drag event handlers', () => {
    describe('onNodeDragStart', () => {
      it('should initialize drag state correctly', () => {
        const nodes = [createNode('node1', undefined, { x: 50, y: 50 })];

        const { result } = renderHook(() =>
          useMindMapDrag({
            nodes,
            rootNodeId: 'root',
            layout: 'LR',
            moveNode: mockMoveNode,
          })
        );

        act(() => {
          result.current.onNodeDragStart(createDragEvent(), nodes[0], nodes);
        });

        expect(result.current.draggedNodeId).toBe('node1');
        expect(result.current.hasDraggedSignificantly).toBe(false);
      });

      it('should ignore root node drags', () => {
        const nodes = [createNode('root')];

        const { result } = renderHook(() =>
          useMindMapDrag({
            nodes,
            rootNodeId: 'root',
            layout: 'LR',
            moveNode: mockMoveNode,
          })
        );

        act(() => {
          result.current.onNodeDragStart(createDragEvent(), nodes[0], nodes);
        });

        expect(result.current.draggedNodeId).toBeNull();
      });
    });

    describe('onNodeDrag', () => {
      it('should track cursor position', () => {
        const nodes = [createNode('node1', undefined, { x: 0, y: 0 })];

        const { result } = renderHook(() =>
          useMindMapDrag({
            nodes,
            rootNodeId: 'root',
            layout: 'LR',
            moveNode: mockMoveNode,
          })
        );

        // Start drag
        act(() => {
          result.current.onNodeDragStart(createDragEvent(), nodes[0], nodes);
        });

        // Drag with mouse event
        const mockEvent = createDragEvent({ clientX: 100, clientY: 200 });
        act(() => {
          result.current.onNodeDrag(
            mockEvent,
            { ...nodes[0], position: { x: 10, y: 10 } },
            nodes
          );
        });

        expect(result.current.dragCursorPosition).toEqual({ x: 100, y: 200 });
        expect(mockScreenToFlowPosition).toHaveBeenCalledWith({
          x: 100,
          y: 200,
        });
      });

      it('should detect significant drag after threshold', () => {
        const nodes = [createNode('node1', undefined, { x: 0, y: 0 })];

        const { result } = renderHook(() =>
          useMindMapDrag({
            nodes,
            rootNodeId: 'root',
            layout: 'LR',
            moveNode: mockMoveNode,
          })
        );

        // Start drag
        act(() => {
          result.current.onNodeDragStart(createDragEvent(), nodes[0], nodes);
        });

        // Small drag (less than threshold)
        act(() => {
          result.current.onNodeDrag(
            createDragEvent(),
            { ...nodes[0], position: { x: 5, y: 5 } },
            nodes
          );
        });
        expect(result.current.hasDraggedSignificantly).toBe(false);

        // Large drag (more than threshold)
        act(() => {
          result.current.onNodeDrag(
            createDragEvent(),
            {
              ...nodes[0],
              position: { x: NODE_SIZING.MIN_DRAG_DISTANCE + 5, y: 0 },
            },
            nodes
          );
        });
        expect(result.current.hasDraggedSignificantly).toBe(true);
      });

      it('should update drop target and position', () => {
        const nodes = [
          createNode('node1', undefined, { x: 0, y: 0 }),
          createNode('node2', undefined, { x: 100, y: 100 }),
        ];

        const { result } = renderHook(() =>
          useMindMapDrag({
            nodes,
            rootNodeId: 'root',
            layout: 'LR',
            moveNode: mockMoveNode,
          })
        );

        // Start drag on node1
        act(() => {
          result.current.onNodeDragStart(createDragEvent(), nodes[0], nodes);
        });

        // Drag near node2
        const mockEvent = createDragEvent({ clientX: 95, clientY: 95 });
        mockScreenToFlowPosition.mockReturnValue({ x: 95, y: 95 });

        act(() => {
          result.current.onNodeDrag(
            mockEvent,
            { ...nodes[0], position: { x: 90, y: 90 } },
            nodes
          );
        });

        expect(result.current.closestDropTarget).toBe('node2');
        expect(result.current.dropPosition).toBe('above'); // Near top of node2
      });

      it('should clear drop target when cycle would be created', () => {
        const nodes = [
          createNode('parent'),
          createNode('child', 'parent'),
          createNode('grandchild', 'child'),
        ];

        const { result } = renderHook(() =>
          useMindMapDrag({
            nodes,
            rootNodeId: 'root',
            layout: 'LR',
            moveNode: mockMoveNode,
          })
        );

        // Start drag on parent
        act(() => {
          result.current.onNodeDragStart(createDragEvent(), nodes[0], nodes);
        });

        // Drag near grandchild (would create cycle)
        act(() => {
          result.current.onNodeDrag(
            createDragEvent(),
            { ...nodes[0], position: { x: 50, y: 50 } },
            nodes
          );
        });

        expect(result.current.closestDropTarget).toBeNull();
        expect(result.current.dropPosition).toBeNull();
      });

      it('should throttle updates', () => {
        const nodes = [
          createNode('node1', undefined, { x: 0, y: 0 }),
          createNode('node2', undefined, { x: 100, y: 100 }),
        ];

        const { result } = renderHook(() =>
          useMindMapDrag({
            nodes,
            rootNodeId: 'root',
            layout: 'LR',
            moveNode: mockMoveNode,
          })
        );

        // Start drag
        act(() => {
          result.current.onNodeDragStart(createDragEvent(), nodes[0], nodes);
        });

        // First drag - should update
        act(() => {
          result.current.onNodeDrag(
            createDragEvent(),
            { ...nodes[0], position: { x: 50, y: 50 } },
            nodes
          );
        });

        const firstTarget = result.current.closestDropTarget;

        // Immediate second drag - should be throttled
        act(() => {
          result.current.onNodeDrag(
            createDragEvent(),
            { ...nodes[0], position: { x: 51, y: 51 } },
            nodes
          );
        });

        expect(result.current.closestDropTarget).toBe(firstTarget); // No change due to throttling
      });
    });

    describe('onNodeDragStop', () => {
      it('should handle successful drop', () => {
        const nodes = [
          createNode('node1', undefined, { x: 0, y: 0 }),
          createNode('node2', undefined, { x: 100, y: 100 }),
        ];

        const { result } = renderHook(() =>
          useMindMapDrag({
            nodes,
            rootNodeId: 'root',
            layout: 'LR',
            moveNode: mockMoveNode,
          })
        );

        // Setup drag state
        act(() => {
          result.current.onNodeDragStart(createDragEvent(), nodes[0], nodes);
        });

        // Drag significantly near node2
        act(() => {
          result.current.onNodeDrag(
            createDragEvent({ clientX: 95, clientY: 110 }),
            { ...nodes[0], position: { x: 90, y: 105 } },
            nodes
          );
        });

        // Stop drag
        act(() => {
          result.current.onNodeDragStop(createDragEvent(), nodes[0], nodes);
        });

        expect(mockMoveNode).toHaveBeenCalled();
        expect(result.current.draggedNodeId).toBeNull();
        expect(result.current.closestDropTarget).toBeNull();
        expect(result.current.dropPosition).toBeNull();
      });

      it('should use cursor position for final drop', () => {
        const nodes = [
          createNode('node1', undefined, { x: 0, y: 0 }),
          createNode('node2', undefined, { x: 100, y: 100 }),
        ];

        const { result } = renderHook(() =>
          useMindMapDrag({
            nodes,
            rootNodeId: 'root',
            layout: 'LR',
            moveNode: mockMoveNode,
          })
        );

        // Setup drag with cursor tracking
        act(() => {
          result.current.onNodeDragStart(createDragEvent(), nodes[0], nodes);
        });

        const cursorFlowPos = { x: 95, y: 95 };
        mockScreenToFlowPosition.mockReturnValue(cursorFlowPos);

        act(() => {
          result.current.onNodeDrag(
            createDragEvent({ clientX: 95, clientY: 95 }),
            { ...nodes[0], position: { x: 50, y: 50 } },
            nodes
          );
        });

        // Stop drag - should use last cursor position, not node position
        act(() => {
          result.current.onNodeDragStop(
            createDragEvent(),
            { ...nodes[0], position: { x: 200, y: 200 } },
            nodes
          );
        });

        // Verify moveNode was called (indicating successful drop)
        expect(mockMoveNode).toHaveBeenCalled();
      });

      it('should not call moveNode for cancelled drags', () => {
        const nodes = [createNode('node1')];

        const { result } = renderHook(() =>
          useMindMapDrag({
            nodes,
            rootNodeId: 'root',
            layout: 'LR',
            moveNode: mockMoveNode,
          })
        );

        // Start and stop drag without significant movement
        act(() => {
          result.current.onNodeDragStart(createDragEvent(), nodes[0], nodes);
        });

        act(() => {
          result.current.onNodeDragStop(createDragEvent(), nodes[0], nodes);
        });

        expect(mockMoveNode).not.toHaveBeenCalled();
      });

      it('should clear all drag state', () => {
        const nodes = [createNode('node1')];

        const { result } = renderHook(() =>
          useMindMapDrag({
            nodes,
            rootNodeId: 'root',
            layout: 'LR',
            moveNode: mockMoveNode,
          })
        );

        // Setup drag state
        act(() => {
          result.current.onNodeDragStart(createDragEvent(), nodes[0], nodes);
        });

        act(() => {
          result.current.onNodeDrag(
            createDragEvent({ clientX: 100, clientY: 100 }),
            { ...nodes[0], position: { x: 50, y: 50 } },
            nodes
          );
        });

        // Stop drag
        act(() => {
          result.current.onNodeDragStop(createDragEvent(), nodes[0], nodes);
        });

        // All state should be cleared
        expect(result.current.draggedNodeId).toBeNull();
        expect(result.current.closestDropTarget).toBeNull();
        expect(result.current.dropPosition).toBeNull();
        expect(result.current.hasDraggedSignificantly).toBe(false);
        expect(result.current.dragCursorPosition).toBeNull();
      });
    });
  });

  describe('handleSiblingPositioning', () => {
    it('should position node above target sibling', () => {
      const nodes = [
        createNode('parent', undefined, { x: 0, y: 0 }),
        createNode('sibling1', 'parent', { x: 100, y: 50 }),
        createNode('sibling2', 'parent', { x: 100, y: 100 }),
        createNode('sibling3', 'parent', { x: 100, y: 150 }),
        createNode('draggedNode', undefined, { x: 0, y: 0 }),
      ];

      const { result } = renderHook(() =>
        useMindMapDrag({
          nodes,
          rootNodeId: 'root',
          layout: 'LR',
          moveNode: mockMoveNode,
        })
      );

      // Start drag
      act(() => {
        result.current.onNodeDragStart(createDragEvent(), nodes[4], nodes);
      });

      // Drag to position above sibling2 (near top of sibling2)
      mockScreenToFlowPosition.mockReturnValue({ x: 100, y: 95 });
      act(() => {
        result.current.onNodeDrag(
          createDragEvent({ clientX: 100, clientY: 95 }),
          { ...nodes[4], position: { x: 100, y: 95 } },
          nodes
        );
      });

      expect(result.current.closestDropTarget).toBe('sibling2');
      expect(result.current.dropPosition).toBe('above');

      // Complete drag
      act(() => {
        result.current.onNodeDragStop(createDragEvent(), nodes[4], nodes);
      });

      // Should be called with parent and insert index
      expect(mockMoveNode).toHaveBeenCalled();
    });

    it('should position node below target sibling', () => {
      // Create nodes with more spacing to avoid ambiguity
      const nodes = [
        createNode('parent', undefined, { x: 0, y: 0 }),
        createNode('sibling1', 'parent', { x: 100, y: 50 }),
        createNode('sibling2', 'parent', { x: 100, y: 150 }), // More spacing
        createNode('draggedNode', undefined, { x: 0, y: 0 }),
      ];

      const { result } = renderHook(() =>
        useMindMapDrag({
          nodes,
          rootNodeId: 'root',
          layout: 'LR',
          moveNode: mockMoveNode,
        })
      );

      // Start drag
      act(() => {
        result.current.onNodeDragStart(createDragEvent(), nodes[3], nodes);
      });

      // Drag to below sibling1 position
      // sibling1 is at y=50 with height=40, so bottom is at y=90
      // For "below" position, we need to be in the bottom third (76.8 to 90)
      // Use y=85 which is clearly in the bottom third of sibling1
      mockScreenToFlowPosition.mockReturnValue({ x: 100, y: 85 });
      act(() => {
        result.current.onNodeDrag(
          createDragEvent({ clientX: 100, clientY: 85 }),
          { ...nodes[3], position: { x: 100, y: 85 } },
          nodes
        );
      });

      expect(result.current.closestDropTarget).toBe('sibling1');
      expect(result.current.dropPosition).toBe('below');

      // Complete drag
      act(() => {
        result.current.onNodeDragStop(createDragEvent(), nodes[3], nodes);
      });

      expect(mockMoveNode).toHaveBeenCalled();
    });
  });
});
