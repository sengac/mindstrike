/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Node, NodeDragHandler } from 'reactflow';
import type { MindMapNodeData } from '../../src/types/mindMap';
import { useMindMapDrag } from '../../src/mindmaps/hooks/useMindMapDrag';

// Mock ReactFlow
vi.mock('reactflow', () => ({
  useReactFlow: () => ({
    screenToFlowPosition: (pos: { x: number; y: number }) => pos,
  }),
}));

// Create a proper mock drag event
function createMockDragEvent(clientX: number, clientY: number): MouseEvent {
  const event = new MouseEvent('drag', {
    clientX,
    clientY,
    bubbles: true,
    cancelable: true,
  });
  return event;
}

// Helper to create test nodes
function createNode(
  id: string,
  parentId?: string,
  position = { x: 0, y: 0 },
  data: Partial<MindMapNodeData> = {}
): Node<MindMapNodeData> {
  return {
    id,
    type: 'mindMapNode',
    position,
    data: {
      label: `Node ${id}`,
      parentId,
      chatId: null,
      notes: null,
      sources: [],
      level: parentId ? 1 : 0,
      isRoot: !parentId,
      hasChildren: false,
      isSelected: false,
      isExpanded: true,
      isCollapsed: false,
      isDragging: false,
      isDropTarget: false,
      dropPosition: null,
      layout: 'TB',
      colorTheme: null,
      ...data,
    },
  };
}

describe('Vertical Layout (TB/BT) Drag and Drop', () => {
  const mockMoveNode = vi.fn();

  beforeEach(() => {
    mockMoveNode.mockClear();
  });

  describe('TB Layout Drop Position Detection', () => {
    it('should detect left drop zone when cursor is in left third of node', () => {
      const nodes = [
        createNode(
          'target',
          undefined,
          { x: 300, y: 200 },
          { width: 120, height: 40 }
        ),
      ];

      const { result } = renderHook(() =>
        useMindMapDrag({
          nodes,
          rootNodeId: 'root',
          layout: 'TB',
          moveNode: mockMoveNode,
        })
      );

      // Left third: x < 300 + (120 * 0.33) = 339.6
      const leftPosition = { x: 320, y: 220 };
      const dropPosition = result.current.getDropPosition(
        leftPosition,
        'target'
      );

      expect(dropPosition).toBe('above'); // 'above' means left for TB/BT
    });

    it('should detect right drop zone when cursor is in right third of node', () => {
      const nodes = [
        createNode(
          'target',
          undefined,
          { x: 300, y: 200 },
          { width: 120, height: 40 }
        ),
      ];

      const { result } = renderHook(() =>
        useMindMapDrag({
          nodes,
          rootNodeId: 'root',
          layout: 'TB',
          moveNode: mockMoveNode,
        })
      );

      // Right third: x > 300 + 120 - (120 * 0.33) = 380.4
      const rightPosition = { x: 400, y: 220 };
      const dropPosition = result.current.getDropPosition(
        rightPosition,
        'target'
      );

      expect(dropPosition).toBe('below'); // 'below' means right for TB/BT
    });

    it('should detect over drop zone when cursor is in middle third of node', () => {
      const nodes = [
        createNode(
          'target',
          undefined,
          { x: 300, y: 200 },
          { width: 120, height: 40 }
        ),
      ];

      const { result } = renderHook(() =>
        useMindMapDrag({
          nodes,
          rootNodeId: 'root',
          layout: 'TB',
          moveNode: mockMoveNode,
        })
      );

      // Middle third: between 339.6 and 380.4
      const middlePosition = { x: 360, y: 220 };
      const dropPosition = result.current.getDropPosition(
        middlePosition,
        'target'
      );

      expect(dropPosition).toBe('over');
    });
  });

  describe('BT Layout Drop Position Detection', () => {
    it('should use same horizontal detection logic as TB', () => {
      const nodes = [
        createNode(
          'target',
          undefined,
          { x: 400, y: 300 },
          { width: 150, height: 50 }
        ),
      ];

      const { result } = renderHook(() =>
        useMindMapDrag({
          nodes,
          rootNodeId: 'root',
          layout: 'BT',
          moveNode: mockMoveNode,
        })
      );

      // Test all three zones for BT layout
      const leftPosition = { x: 420, y: 325 };
      const middlePosition = { x: 475, y: 325 };
      const rightPosition = { x: 530, y: 325 };

      expect(result.current.getDropPosition(leftPosition, 'target')).toBe(
        'above'
      );
      expect(result.current.getDropPosition(middlePosition, 'target')).toBe(
        'over'
      );
      expect(result.current.getDropPosition(rightPosition, 'target')).toBe(
        'below'
      );
    });
  });

  describe('Sibling Positioning in TB/BT Layouts', () => {
    it('should position node to the left of target when drop position is "above"', () => {
      const nodes = [
        createNode('parent'),
        createNode('child1', 'parent', { x: 100, y: 100 }),
        createNode('child2', 'parent', { x: 200, y: 100 }),
        createNode('child3', 'parent', { x: 300, y: 100 }),
        createNode('draggedNode', 'otherParent', { x: 400, y: 200 }),
      ];

      const { result } = renderHook(() =>
        useMindMapDrag({
          nodes,
          rootNodeId: 'root',
          layout: 'TB',
          moveNode: mockMoveNode,
        })
      );

      act(() => {
        // Start dragging
        result.current.onNodeDragStart(createMockDragEvent(0, 0), nodes[4]);
      });

      act(() => {
        // Drag over child2's left zone
        const event = createMockDragEvent(210, 100);
        result.current.onNodeDrag(event, {
          ...nodes[4],
          position: { x: 210, y: 100 },
        });
      });

      act(() => {
        // Drop the node
        result.current.onNodeDragStop(createMockDragEvent(0, 0), nodes[4]);
      });

      // Should insert before child2 (to its left)
      expect(mockMoveNode).toHaveBeenCalledWith(
        'draggedNode',
        'parent',
        expect.any(Number)
      );
    });

    it('should position node to the right of target when drop position is "below"', () => {
      const nodes = [
        createNode('parent'),
        createNode('child1', 'parent', { x: 100, y: 100 }),
        createNode('child2', 'parent', { x: 200, y: 100 }),
        createNode('child3', 'parent', { x: 300, y: 100 }),
        createNode('draggedNode', 'otherParent', { x: 400, y: 200 }),
      ];

      const { result } = renderHook(() =>
        useMindMapDrag({
          nodes,
          rootNodeId: 'root',
          layout: 'TB',
          moveNode: mockMoveNode,
        })
      );

      act(() => {
        // Start dragging
        result.current.onNodeDragStart(createMockDragEvent(0, 0), nodes[4]);
      });

      act(() => {
        // Drag over child2's right zone
        const event = createMockDragEvent(280, 100);
        result.current.onNodeDrag(event, {
          ...nodes[4],
          position: { x: 280, y: 100 },
        });
      });

      act(() => {
        // Drop the node
        result.current.onNodeDragStop(createMockDragEvent(0, 0), nodes[4]);
      });

      // Should insert after child2 (to its right)
      expect(mockMoveNode).toHaveBeenCalledWith(
        'draggedNode',
        'parent',
        expect.any(Number)
      );
    });
  });

  describe('Mixed Layout Scenarios', () => {
    it('should handle switching between LR and TB layouts correctly', () => {
      const nodes = [
        createNode(
          'target',
          undefined,
          { x: 200, y: 200 },
          { width: 100, height: 60 }
        ),
      ];

      // Test LR layout first
      const { result: lrResult } = renderHook(() =>
        useMindMapDrag({
          nodes,
          rootNodeId: 'root',
          layout: 'LR',
          moveNode: mockMoveNode,
        })
      );

      // For LR: vertical position matters
      const topPosition = { x: 250, y: 210 };
      expect(lrResult.current.getDropPosition(topPosition, 'target')).toBe(
        'above'
      );

      // Test TB layout
      const { result: tbResult } = renderHook(() =>
        useMindMapDrag({
          nodes,
          rootNodeId: 'root',
          layout: 'TB',
          moveNode: mockMoveNode,
        })
      );

      // For TB: horizontal position matters
      const leftPosition = { x: 210, y: 230 };
      expect(tbResult.current.getDropPosition(leftPosition, 'target')).toBe(
        'above'
      );
    });
  });

  describe('Sibling Order Preservation', () => {
    it('should handle moving node from before target to after target', () => {
      // Initial order: child1, draggedNode, child2, child3
      const nodes = [
        createNode('parent'),
        createNode('child1', 'parent', { x: 100, y: 100 }, { width: 120 }),
        createNode('draggedNode', 'parent', { x: 250, y: 100 }, { width: 120 }),
        createNode('child2', 'parent', { x: 400, y: 100 }, { width: 120 }),
        createNode('child3', 'parent', { x: 550, y: 100 }, { width: 120 }),
      ];

      const { result } = renderHook(() =>
        useMindMapDrag({
          nodes,
          rootNodeId: 'root',
          layout: 'TB',
          moveNode: mockMoveNode,
        })
      );

      act(() => {
        result.current.onNodeDragStart(createMockDragEvent(0, 0), nodes[2]);
      });

      act(() => {
        // Drag to the right of child2 (should move after child2)
        const event = createMockDragEvent(480, 100);
        result.current.onNodeDrag(event, {
          ...nodes[2],
          position: { x: 480, y: 100 },
        });
      });

      act(() => {
        result.current.onNodeDragStop(createMockDragEvent(0, 0), nodes[2]);
      });

      // After removal, child2 will be at index 2, so insert should be at index 3
      expect(mockMoveNode).toHaveBeenCalledWith('draggedNode', 'parent', 3);
    });

    it('should handle moving node from after target to before target', () => {
      // Initial order: child1, child2, draggedNode, child3
      const nodes = [
        createNode('parent'),
        createNode('child1', 'parent', { x: 100, y: 100 }, { width: 120 }),
        createNode('child2', 'parent', { x: 250, y: 100 }, { width: 120 }),
        createNode('draggedNode', 'parent', { x: 400, y: 100 }, { width: 120 }),
        createNode('child3', 'parent', { x: 550, y: 100 }, { width: 120 }),
      ];

      const { result } = renderHook(() =>
        useMindMapDrag({
          nodes,
          rootNodeId: 'root',
          layout: 'TB',
          moveNode: mockMoveNode,
        })
      );

      act(() => {
        result.current.onNodeDragStart(createMockDragEvent(0, 0), nodes[3]);
      });

      act(() => {
        // Drag to the left of child2 (should move before child2)
        const event = createMockDragEvent(270, 100);
        result.current.onNodeDrag(event, {
          ...nodes[3],
          position: { x: 270, y: 100 },
        });
      });

      act(() => {
        result.current.onNodeDragStop(createMockDragEvent(0, 0), nodes[3]);
      });

      // Should insert at child2's position which is 2
      expect(mockMoveNode).toHaveBeenCalledWith('draggedNode', 'parent', 2);
    });

    it('should handle moving first node to last position', () => {
      const nodes = [
        createNode('parent'),
        createNode('draggedNode', 'parent', { x: 100, y: 100 }, { width: 120 }),
        createNode('child1', 'parent', { x: 250, y: 100 }, { width: 120 }),
        createNode('child2', 'parent', { x: 400, y: 100 }, { width: 120 }),
      ];

      const { result } = renderHook(() =>
        useMindMapDrag({
          nodes,
          rootNodeId: 'root',
          layout: 'TB',
          moveNode: mockMoveNode,
        })
      );

      act(() => {
        result.current.onNodeDragStart(createMockDragEvent(0, 0), nodes[1]);
      });

      act(() => {
        // Drag to the right of child2 (last position)
        // child2 is at x=400 with width=120, so right third is 480-520
        const event = createMockDragEvent(500, 100);
        result.current.onNodeDrag(event, {
          ...nodes[1],
          position: { x: 500, y: 100 },
        });
      });

      act(() => {
        result.current.onNodeDragStop(createMockDragEvent(0, 0), nodes[1]);
      });

      // Should insert after child2, which after removal would be index 3
      expect(mockMoveNode).toHaveBeenCalledWith('draggedNode', 'parent', 3);
    });

    it('should handle moving last node to first position', () => {
      const nodes = [
        createNode('parent'),
        createNode('child1', 'parent', { x: 100, y: 100 }, { width: 120 }),
        createNode('child2', 'parent', { x: 250, y: 100 }, { width: 120 }),
        createNode('draggedNode', 'parent', { x: 400, y: 100 }, { width: 120 }),
      ];

      const { result } = renderHook(() =>
        useMindMapDrag({
          nodes,
          rootNodeId: 'root',
          layout: 'TB',
          moveNode: mockMoveNode,
        })
      );

      act(() => {
        result.current.onNodeDragStart(createMockDragEvent(0, 0), nodes[3]);
      });

      act(() => {
        // Drag to the left of child1 (first position)
        const event = createMockDragEvent(120, 100);
        result.current.onNodeDrag(event, {
          ...nodes[3],
          position: { x: 120, y: 100 },
        });
      });

      act(() => {
        result.current.onNodeDragStop(createMockDragEvent(0, 0), nodes[3]);
      });

      // Should insert at child1's position which is 1
      expect(mockMoveNode).toHaveBeenCalledWith('draggedNode', 'parent', 1);
    });
  });

  describe('Cross-Parent Movement Tests', () => {
    it('should maintain horizontal order of siblings after drag and drop in TB layout', () => {
      const nodes = [
        createNode('parent'),
        createNode('child1', 'parent', { x: 100, y: 100 }, { width: 120 }),
        createNode('child2', 'parent', { x: 250, y: 100 }, { width: 120 }),
        createNode('child3', 'parent', { x: 400, y: 100 }, { width: 120 }),
        createNode(
          'draggedNode',
          'otherParent',
          { x: 500, y: 200 },
          { width: 120 }
        ),
      ];

      const { result } = renderHook(() =>
        useMindMapDrag({
          nodes,
          rootNodeId: 'root',
          layout: 'TB',
          moveNode: mockMoveNode,
        })
      );

      act(() => {
        // Start dragging
        result.current.onNodeDragStart(createMockDragEvent(0, 0), nodes[4]);
      });

      act(() => {
        // Drag to the left third of child2 (above position)
        // child2 is at x=250 with width=120, so left third is 250 to 290
        const event = createMockDragEvent(270, 100);
        result.current.onNodeDrag(event, {
          ...nodes[4],
          position: { x: 270, y: 100 },
        });
      });

      act(() => {
        // Drop the node
        result.current.onNodeDragStop(createMockDragEvent(0, 0), nodes[4]);
      });

      // Verify moveNode was called with correct parent and insert position
      expect(mockMoveNode).toHaveBeenCalledWith(
        'draggedNode',
        'parent',
        expect.any(Number)
      );

      // The insert index should place the node before child2
      const [, , insertIndex] = mockMoveNode.mock.calls[0];
      expect(insertIndex).toBeLessThanOrEqual(
        nodes.findIndex(n => n.id === 'child2')
      );
    });

    it('should position node at end when dropped to the right of last sibling', () => {
      const nodes = [
        createNode('parent'),
        createNode('child1', 'parent', { x: 100, y: 100 }, { width: 120 }),
        createNode('child2', 'parent', { x: 250, y: 100 }, { width: 120 }),
        createNode(
          'draggedNode',
          'otherParent',
          { x: 500, y: 200 },
          { width: 120 }
        ),
      ];

      const { result } = renderHook(() =>
        useMindMapDrag({
          nodes,
          rootNodeId: 'root',
          layout: 'TB',
          moveNode: mockMoveNode,
        })
      );

      act(() => {
        // Start dragging
        result.current.onNodeDragStart(createMockDragEvent(0, 0), nodes[3]);
      });

      act(() => {
        // Drag to the right third of child2 (below position)
        // child2 is at x=250 with width=120, so right third is 330 to 370
        const event = createMockDragEvent(350, 100);
        result.current.onNodeDrag(event, {
          ...nodes[3],
          position: { x: 350, y: 100 },
        });
      });

      act(() => {
        // Drop the node
        result.current.onNodeDragStop(createMockDragEvent(0, 0), nodes[3]);
      });

      // Verify moveNode was called
      expect(mockMoveNode).toHaveBeenCalledWith(
        'draggedNode',
        'parent',
        expect.any(Number)
      );

      // The insert index should place the node after child2
      const [, , insertIndex] = mockMoveNode.mock.calls[0];
      expect(insertIndex).toBeGreaterThanOrEqual(
        nodes.findIndex(n => n.id === 'child2')
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle nodes with custom widths correctly', () => {
      const nodes = [
        createNode(
          'narrow',
          undefined,
          { x: 100, y: 100 },
          { width: 60, height: 40 }
        ),
        createNode(
          'wide',
          undefined,
          { x: 200, y: 100 },
          { width: 200, height: 40 }
        ),
      ];

      const { result } = renderHook(() =>
        useMindMapDrag({
          nodes,
          rootNodeId: 'root',
          layout: 'TB',
          moveNode: mockMoveNode,
        })
      );

      // Narrow node: zones are smaller
      const narrowLeftZone = { x: 110, y: 120 }; // Within first 20px (60 * 0.33)
      expect(result.current.getDropPosition(narrowLeftZone, 'narrow')).toBe(
        'above'
      );

      // Wide node: zones are larger
      const wideLeftZone = { x: 250, y: 120 }; // Within first 66px (200 * 0.33)
      expect(result.current.getDropPosition(wideLeftZone, 'wide')).toBe(
        'above'
      );
    });

    it('should handle root node correctly in TB layout', () => {
      const nodes = [
        createNode(
          'root',
          undefined,
          { x: 300, y: 50 },
          { width: 120, height: 40 }
        ),
      ];

      const { result } = renderHook(() =>
        useMindMapDrag({
          nodes,
          rootNodeId: 'root',
          layout: 'TB',
          moveNode: mockMoveNode,
        })
      );

      // Root node should always return 'over' regardless of position
      const leftPosition = { x: 310, y: 70 };
      const rightPosition = { x: 410, y: 70 };

      expect(result.current.getDropPosition(leftPosition, 'root')).toBe('over');
      expect(result.current.getDropPosition(rightPosition, 'root')).toBe(
        'over'
      );
    });
  });
});
