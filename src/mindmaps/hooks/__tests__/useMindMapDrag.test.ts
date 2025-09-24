import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMindMapDrag } from '../useMindMapDrag';
import type { Node } from 'reactflow';
import type { MindMapNodeData } from '../../types/mindMap';
import { NODE_SIZING } from '../../constants/nodeSizing';

// Mock useReactFlow hook
vi.mock('reactflow', async () => {
  const actual = await vi.importActual('reactflow');
  return {
    ...actual,
    useReactFlow: () => ({
      screenToFlowPosition: vi.fn(pos => pos), // Simple pass-through for testing
    }),
  };
});

describe('useMindMapDrag - Drop Position Detection', () => {
  const mockMoveNode = vi.fn();

  const createNode = (
    id: string,
    x: number,
    y: number,
    width: number = NODE_SIZING.DEFAULT_NODE_WIDTH,
    height: number = NODE_SIZING.DEFAULT_NODE_HEIGHT,
    parentId?: string
  ): Node<MindMapNodeData> => ({
    id,
    type: 'mindMapNode',
    position: { x, y },
    data: {
      id,
      label: `Node ${id}`,
      isRoot: id === 'root',
      level: id === 'root' ? 0 : 1,
      hasChildren: false,
      isCollapsed: false,
      isDragging: false,
      isDropTarget: false,
      dropPosition: null,
      layout: 'LR',
      colorTheme: null,
      width,
      height,
      parentId,
    },
  });

  describe('Height-aware drop zones', () => {
    it('should use proportional zones based on node height', () => {
      const smallNode = createNode('small', 200, 100, 150, 30);
      const largeNode = createNode('large', 200, 200, 150, 120);
      const nodes = [createNode('root', 0, 0), smallNode, largeNode];

      const { result } = renderHook(() =>
        useMindMapDrag({
          nodes,
          rootNodeId: 'root',
          layout: 'LR',
          moveNode: mockMoveNode,
        })
      );

      // Small node (30px height): zones should be ~10px each
      // Zones are based on NODE_SIZING.ZONE_PERCENTAGE (33%)
      // Top third: above, Middle third: over, Bottom third: below
      expect(result.current.getDropPosition({ x: 200, y: 105 }, 'small')).toBe(
        'above'
      ); // 5px from top
      expect(result.current.getDropPosition({ x: 200, y: 115 }, 'small')).toBe(
        'over'
      ); // 15px from top
      expect(result.current.getDropPosition({ x: 200, y: 125 }, 'small')).toBe(
        'below'
      ); // 25px from top

      // Large node (120px height): zones should be ~40px each
      // Zones are based on NODE_SIZING.ZONE_PERCENTAGE (33%)
      // Top third: above, Middle third: over, Bottom third: below
      expect(result.current.getDropPosition({ x: 200, y: 220 }, 'large')).toBe(
        'above'
      ); // 20px from top
      expect(result.current.getDropPosition({ x: 200, y: 260 }, 'large')).toBe(
        'over'
      ); // 60px from top
      expect(result.current.getDropPosition({ x: 200, y: 300 }, 'large')).toBe(
        'below'
      ); // 100px from top
    });

    it('should handle very tall nodes correctly', () => {
      const tallNode = createNode('tall', 100, 100, 200, 300); // 300px tall
      const nodes = [createNode('root', 0, 0), tallNode];

      const { result } = renderHook(() =>
        useMindMapDrag({
          nodes,
          rootNodeId: 'root',
          layout: 'LR',
          moveNode: mockMoveNode,
        })
      );

      // With 300px height and NODE_SIZING.ZONE_PERCENTAGE zones:
      // Each zone is 33% of the height
      expect(result.current.getDropPosition({ x: 100, y: 150 }, 'tall')).toBe(
        'above'
      ); // 50px from top
      expect(result.current.getDropPosition({ x: 100, y: 250 }, 'tall')).toBe(
        'over'
      ); // 150px from top
      expect(result.current.getDropPosition({ x: 100, y: 350 }, 'tall')).toBe(
        'below'
      ); // 250px from top
    });

    it('should handle width-based zones for vertical layouts', () => {
      const wideNode = createNode('wide', 100, 100, 300, 50); // 300px wide
      const nodes = [createNode('root', 0, 0), wideNode];

      const { result } = renderHook(() =>
        useMindMapDrag({
          nodes,
          rootNodeId: 'root',
          layout: 'TB', // Top-to-bottom layout
          moveNode: mockMoveNode,
        })
      );

      // With 300px width and NODE_SIZING.ZONE_PERCENTAGE zones in TB layout:
      // Each zone is 33% of the width
      expect(result.current.getDropPosition({ x: 150, y: 100 }, 'wide')).toBe(
        'above'
      ); // 50px from left
      expect(result.current.getDropPosition({ x: 250, y: 100 }, 'wide')).toBe(
        'over'
      ); // 150px from left
      expect(result.current.getDropPosition({ x: 350, y: 100 }, 'wide')).toBe(
        'below'
      ); // 250px from left
    });

    it('should use default dimensions when not specified', () => {
      const nodeWithoutDimensions = {
        id: 'test',
        type: 'mindMapNode' as const,
        position: { x: 100, y: 100 },
        data: {
          id: 'test',
          label: 'Test',
          isRoot: false,
          level: 1,
          hasChildren: false,
          isCollapsed: false,
          isDragging: false,
          isDropTarget: false,
          dropPosition: null,
          layout: 'LR' as const,
          colorTheme: null,
          // No width or height specified
        },
      };

      const nodes = [createNode('root', 0, 0), nodeWithoutDimensions];

      const { result } = renderHook(() =>
        useMindMapDrag({
          nodes,
          rootNodeId: 'root',
          layout: 'LR',
          moveNode: mockMoveNode,
        })
      );

      // Should use default height of 40px
      // Zones are based on NODE_SIZING.ZONE_PERCENTAGE (33%)
      expect(result.current.getDropPosition({ x: 100, y: 110 }, 'test')).toBe(
        'above'
      ); // 10px from top
      expect(result.current.getDropPosition({ x: 100, y: 120 }, 'test')).toBe(
        'over'
      ); // 20px from top
      expect(result.current.getDropPosition({ x: 100, y: 135 }, 'test')).toBe(
        'below'
      ); // 35px from top
    });
  });

  describe('Root node behavior', () => {
    it('should always return "over" for root node', () => {
      const nodes = [createNode('root', 0, 0, 200, 100)];

      const { result } = renderHook(() =>
        useMindMapDrag({
          nodes,
          rootNodeId: 'root',
          layout: 'LR',
          moveNode: mockMoveNode,
        })
      );

      // No matter where we drag relative to root, it should always be "over"
      expect(result.current.getDropPosition({ x: 0, y: -50 }, 'root')).toBe(
        'over'
      );
      expect(result.current.getDropPosition({ x: 0, y: 50 }, 'root')).toBe(
        'over'
      );
      expect(result.current.getDropPosition({ x: 0, y: 150 }, 'root')).toBe(
        'over'
      );
    });
  });

  describe('Cursor position for drop detection', () => {
    it('should use cursor position instead of node position for drop detection', () => {
      const targetNode = createNode('target', 200, 200, 150, 60);
      const draggedNode = createNode('dragged', 100, 100, 120, 40);
      const nodes = [createNode('root', 0, 0), targetNode, draggedNode];

      const { result } = renderHook(() =>
        useMindMapDrag({
          nodes,
          rootNodeId: 'root',
          layout: 'LR',
          moveNode: mockMoveNode,
        })
      );

      // The dragged node is at (100, 100)
      // But the cursor is at different positions relative to the target node

      // Cursor at top of target node
      const cursorPosTop = { x: 200, y: 205 }; // 5px into target
      expect(result.current.getDropPosition(cursorPosTop, 'target')).toBe(
        'above'
      );

      // Cursor at middle of target node
      const cursorPosMiddle = { x: 200, y: 230 }; // 30px into target (middle)
      expect(result.current.getDropPosition(cursorPosMiddle, 'target')).toBe(
        'over'
      );

      // Cursor at bottom of target node
      const cursorPosBottom = { x: 200, y: 255 }; // 55px into target
      expect(result.current.getDropPosition(cursorPosBottom, 'target')).toBe(
        'below'
      );
    });
  });
});
