/**
 * Integration test for MindMapLayoutManager
 * Tests the recursive space allocation layout algorithm
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Node, Edge } from 'reactflow';
import type { MindMapNodeData } from '../../src/types/mindMap';
import {
  MindMapLayoutManager,
  LAYOUT_CONSTANTS,
} from '../../src/utils/mindMapLayout.js';
import {
  TEST_CONSTANTS,
  DEFAULT_POSITION,
  LAYOUT_CALC,
} from '../../src/mindmaps/constants/magicNumbers';

// Create a simplified test version that bypasses the sizing strategy
class TestMindMapLayoutManager extends MindMapLayoutManager {
  // Override calculateNodeDimensions to return predictable test values
  calculateNodeDimensions(
    text: string,
    nodeData?: MindMapNodeData
  ): { width: number; height: number } {
    // If node already has width/height, use those values instead of calculating
    if (nodeData?.width && nodeData?.height) {
      return {
        width: nodeData.width,
        height: nodeData.height,
      };
    }

    const baseWidth = Math.max(
      text.length * TEST_CONSTANTS.CHAR_WIDTH_APPROX +
        TEST_CONSTANTS.DEFAULT_TEST_NODE_HEIGHT,
      100
    );
    const baseHeight = text.includes('\n')
      ? 60
      : TEST_CONSTANTS.DEFAULT_TEST_NODE_HEIGHT;

    return {
      width: baseWidth,
      height: baseHeight,
    };
  }
}

describe('MindMapLayoutManager - Recursive Space Allocation Algorithm', () => {
  let layoutManager: TestMindMapLayoutManager;

  beforeEach(() => {
    layoutManager = new TestMindMapLayoutManager();
  });

  describe('TB/BT (Top-Bottom/Bottom-Top) recursive layout', () => {
    it('should apply recursive horizontal spacing in TB layout', async () => {
      const nodes: Node<MindMapNodeData>[] = [
        {
          id: 'root',
          type: 'mindMapNode',
          position: { x: DEFAULT_POSITION.X, y: DEFAULT_POSITION.Y },
          data: {
            id: 'root',
            label: 'Root',
            isRoot: true,
            level: LAYOUT_CALC.ROOT_LEVEL,
            hasChildren: true,
            width: 100,
            height: TEST_CONSTANTS.DEFAULT_TEST_NODE_HEIGHT,
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'TB',
          },
        },
        {
          id: 'child1',
          type: 'mindMapNode',
          position: { x: DEFAULT_POSITION.X, y: DEFAULT_POSITION.Y },
          data: {
            id: 'child1',
            label: 'Narrow',
            isRoot: false,
            level: LAYOUT_CALC.FIRST_CHILD_LEVEL,
            hasChildren: false,
            width: 80,
            height: TEST_CONSTANTS.DEFAULT_TEST_NODE_HEIGHT,
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'TB',
          },
        },
        {
          id: 'child2',
          type: 'mindMapNode',
          position: { x: DEFAULT_POSITION.X, y: DEFAULT_POSITION.Y },
          data: {
            id: 'child2',
            label: 'Wide Child Node',
            isRoot: false,
            level: LAYOUT_CALC.FIRST_CHILD_LEVEL,
            hasChildren: false,
            width: 200,
            height: TEST_CONSTANTS.DEFAULT_TEST_NODE_HEIGHT,
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'TB',
          },
        },
        {
          id: 'child3',
          type: 'mindMapNode',
          position: { x: DEFAULT_POSITION.X, y: DEFAULT_POSITION.Y },
          data: {
            id: 'child3',
            label: 'Medium',
            isRoot: false,
            level: LAYOUT_CALC.FIRST_CHILD_LEVEL,
            hasChildren: false,
            width: 120,
            height: TEST_CONSTANTS.DEFAULT_TEST_NODE_HEIGHT,
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'TB',
          },
        },
      ];

      const edges: Edge[] = [
        { id: 'e1', source: 'root', target: 'child1' },
        { id: 'e2', source: 'root', target: 'child2' },
        { id: 'e3', source: 'root', target: 'child3' },
      ];

      const result = await layoutManager.performCompleteLayout(
        nodes,
        edges,
        'root',
        'TB'
      );

      const rootNode = result.nodes.find(n => n.id === 'root')!;
      const child1 = result.nodes.find(n => n.id === 'child1')!;
      const child2 = result.nodes.find(n => n.id === 'child2')!;
      const child3 = result.nodes.find(n => n.id === 'child3')!;

      // The tree should be centered horizontally
      // Calculate expected positions based on recursive layout
      const allNodes = [rootNode, child1, child2, child3];

      // Find tree bounds
      let minX = Math.min(...allNodes.map(n => n.position.x));
      let maxX = Math.max(
        ...allNodes.map(n => n.position.x + (n.data.width || 120))
      );
      const treeWidth = maxX - minX;
      const treeCenter = minX + treeWidth / 2;

      // Tree should be centered around 600
      expect(treeCenter).toBeCloseTo(LAYOUT_CONSTANTS.ROOT_X, 50);

      // Children should be positioned with recursive spacing
      // They should be laid out horizontally with proper gaps
      const childrenX = [child1, child2, child3]
        .map(n => n.position.x)
        .sort((a, b) => a - b);

      // Check gaps between children
      expect(childrenX[1] - (childrenX[0] + 80)).toBeCloseTo(
        LAYOUT_CONSTANTS.HORIZONTAL_SIBLING_GAP,
        10
      ); // Gap between child1 and child2
      expect(childrenX[2] - (childrenX[1] + 200)).toBeCloseTo(
        LAYOUT_CONSTANTS.HORIZONTAL_SIBLING_GAP,
        10
      ); // Gap between child2 and child3

      // Verify vertical positioning - children should be below root
      expect(child1.position.y).toBeGreaterThan(rootNode.position.y);
      expect(child2.position.y).toBeGreaterThan(rootNode.position.y);
      expect(child3.position.y).toBeGreaterThan(rootNode.position.y);

      // All children at same level should have same Y position
      expect(child1.position.y).toBe(child2.position.y);
      expect(child2.position.y).toBe(child3.position.y);
    });

    it('should maintain center position when node width changes in TB layout', async () => {
      const createNode = (
        id: string,
        label: string,
        width: number,
        level: number
      ): Node<MindMapNodeData> => ({
        id,
        type: 'mindMapNode',
        position: { x: 0, y: 0 },
        data: {
          id,
          label,
          isRoot: id === 'root',
          level,
          hasChildren: level === LAYOUT_CALC.ROOT_LEVEL,
          width,
          height: 40,
          isCollapsed: false,
          isDragging: false,
          isDropTarget: false,
          dropPosition: null,
          layout: 'TB',
          colorTheme: null,
        },
      });

      // Initial layout with narrow nodes
      const nodesNarrow = [
        createNode('root', 'Root', 100, 0),
        createNode('child1', 'A', 60, 1),
        createNode('child2', 'B', 60, 1),
      ];

      const edges: Edge[] = [
        { id: 'e1', source: 'root', target: 'child1' },
        { id: 'e2', source: 'root', target: 'child2' },
      ];

      const resultNarrow = await layoutManager.performCompleteLayout(
        nodesNarrow,
        edges,
        'root',
        'TB'
      );

      // Layout with expanded nodes
      const nodesWide = [
        createNode('root', 'Root Node with Longer Text', 250, 0),
        createNode('child1', 'Child A with much more text', 200, 1),
        createNode('child2', 'Child B also expanded', 180, 1),
      ];

      const resultWide = await layoutManager.performCompleteLayout(
        nodesWide,
        edges,
        'root',
        'TB'
      );

      const rootNarrow = resultNarrow.nodes.find(n => n.id === 'root')!;
      const rootWide = resultWide.nodes.find(n => n.id === 'root')!;

      // Trees should maintain center position
      const getTreeCenter = (nodes: Node<MindMapNodeData>[]) => {
        let minX = Math.min(...nodes.map(n => n.position.x));
        let maxX = Math.max(
          ...nodes.map(n => n.position.x + (n.data.width || 120))
        );
        return minX + (maxX - minX) / 2;
      };

      const centerNarrow = getTreeCenter(resultNarrow.nodes);
      const centerWide = getTreeCenter(resultWide.nodes);

      // Both trees should be centered at the same position
      expect(centerWide).toBeCloseTo(centerNarrow, 50);

      // Verify children maintain proper spacing
      const child1Wide = resultWide.nodes.find(n => n.id === 'child1')!;
      const child2Wide = resultWide.nodes.find(n => n.id === 'child2')!;

      // Gap between children should be consistent
      const gap =
        child2Wide.position.x -
        (child1Wide.position.x + child1Wide.data.width!);
      expect(gap).toBeCloseTo(LAYOUT_CONSTANTS.HORIZONTAL_SIBLING_GAP, 10);
    });

    it('should properly calculate subtree widths for nested structures in TB layout', async () => {
      // Test case specifically for the overlapping issue with nested nodes
      const nodes: Node<MindMapNodeData>[] = [
        {
          id: 'root',
          type: 'mindMapNode',
          position: { x: DEFAULT_POSITION.X, y: DEFAULT_POSITION.Y },
          data: {
            id: 'root',
            label: 'Root',
            isRoot: true,
            level: LAYOUT_CALC.ROOT_LEVEL,
            hasChildren: true,
            width: 150,
            height: TEST_CONSTANTS.DEFAULT_TEST_NODE_HEIGHT,
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'TB',
          },
        },
        {
          id: 'child1',
          type: 'mindMapNode',
          position: { x: DEFAULT_POSITION.X, y: DEFAULT_POSITION.Y },
          data: {
            id: 'child1',
            label: 'Child 1',
            isRoot: false,
            level: LAYOUT_CALC.FIRST_CHILD_LEVEL,
            hasChildren: true,
            width: 100,
            height: TEST_CONSTANTS.DEFAULT_TEST_NODE_HEIGHT,
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'TB',
          },
        },
        {
          id: 'child2',
          type: 'mindMapNode',
          position: { x: DEFAULT_POSITION.X, y: DEFAULT_POSITION.Y },
          data: {
            id: 'child2',
            label: 'Child 2',
            isRoot: false,
            level: LAYOUT_CALC.FIRST_CHILD_LEVEL,
            hasChildren: true,
            width: 100,
            height: TEST_CONSTANTS.DEFAULT_TEST_NODE_HEIGHT,
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'TB',
          },
        },
        {
          id: 'grandchild1',
          type: 'mindMapNode',
          position: { x: DEFAULT_POSITION.X, y: DEFAULT_POSITION.Y },
          data: {
            id: 'grandchild1',
            label: 'GC1',
            isRoot: false,
            level: 2,
            hasChildren: false,
            width: 80,
            height: TEST_CONSTANTS.DEFAULT_TEST_NODE_HEIGHT,
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'TB',
          },
        },
        {
          id: 'grandchild2',
          type: 'mindMapNode',
          position: { x: DEFAULT_POSITION.X, y: DEFAULT_POSITION.Y },
          data: {
            id: 'grandchild2',
            label: 'GC2',
            isRoot: false,
            level: 2,
            hasChildren: false,
            width: 80,
            height: TEST_CONSTANTS.DEFAULT_TEST_NODE_HEIGHT,
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'TB',
          },
        },
        {
          id: 'grandchild3',
          type: 'mindMapNode',
          position: { x: DEFAULT_POSITION.X, y: DEFAULT_POSITION.Y },
          data: {
            id: 'grandchild3',
            label: 'GC3 with longer text',
            isRoot: false,
            level: 2,
            hasChildren: false,
            width: 200,
            height: TEST_CONSTANTS.DEFAULT_TEST_NODE_HEIGHT,
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'TB',
          },
        },
      ];

      const edges: Edge[] = [
        { id: 'e1', source: 'root', target: 'child1' },
        { id: 'e2', source: 'root', target: 'child2' },
        { id: 'e3', source: 'child1', target: 'grandchild1' },
        { id: 'e4', source: 'child1', target: 'grandchild2' },
        { id: 'e5', source: 'child2', target: 'grandchild3' },
      ];

      const result = await layoutManager.performCompleteLayout(
        nodes,
        edges,
        'root',
        'TB'
      );

      const child1 = result.nodes.find(n => n.id === 'child1')!;
      const child2 = result.nodes.find(n => n.id === 'child2')!;
      const gc1 = result.nodes.find(n => n.id === 'grandchild1')!;
      const gc2 = result.nodes.find(n => n.id === 'grandchild2')!;
      const gc3 = result.nodes.find(n => n.id === 'grandchild3')!;

      // Child1's subtree needs space for both grandchildren
      // Expected subtree width: gc1(80) + gap(80) + gc2(80) = 240
      const expectedChild1SubtreeWidth =
        80 + LAYOUT_CONSTANTS.HORIZONTAL_SIBLING_GAP + 80;

      // Child2 should be positioned far enough to avoid overlap with child1's subtree
      const child1SubtreeRight = Math.max(
        child1.position.x + child1.data.width!,
        gc2.position.x + gc2.data.width!
      );

      // Child2's leftmost point (could be the node itself or its children)
      const child2SubtreeLeft = Math.min(child2.position.x, gc3.position.x);

      // There should be proper spacing between the subtrees
      expect(child2SubtreeLeft).toBeGreaterThanOrEqual(child1SubtreeRight);

      // Verify grandchildren of child1 don't overlap
      expect(gc2.position.x).toBeGreaterThanOrEqual(
        gc1.position.x + gc1.data.width!
      );

      // Verify child2's grandchild is properly positioned under child2
      const child2Center = child2.position.x + child2.data.width! / 2;
      const gc3Center = gc3.position.x + gc3.data.width! / 2;

      // GC3 should be roughly centered under child2
      expect(Math.abs(gc3Center - child2Center)).toBeLessThan(50);
    });

    it('should handle BT layout with proper vertical direction', async () => {
      const nodes: Node<MindMapNodeData>[] = [
        {
          id: 'root',
          type: 'mindMapNode',
          position: { x: DEFAULT_POSITION.X, y: DEFAULT_POSITION.Y },
          data: {
            id: 'root',
            label: 'Root',
            isRoot: true,
            level: LAYOUT_CALC.ROOT_LEVEL,
            hasChildren: true,
            width: 100,
            height: TEST_CONSTANTS.DEFAULT_TEST_NODE_HEIGHT,
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'BT',
            colorTheme: null,
          },
        },
        {
          id: 'child1',
          type: 'mindMapNode',
          position: { x: DEFAULT_POSITION.X, y: DEFAULT_POSITION.Y },
          data: {
            id: 'child1',
            label: 'Child 1',
            isRoot: false,
            level: LAYOUT_CALC.FIRST_CHILD_LEVEL,
            hasChildren: false,
            width: 120,
            height: TEST_CONSTANTS.DEFAULT_TEST_NODE_HEIGHT,
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'BT',
            colorTheme: null,
          },
        },
        {
          id: 'child2',
          type: 'mindMapNode',
          position: { x: DEFAULT_POSITION.X, y: DEFAULT_POSITION.Y },
          data: {
            id: 'child2',
            label: 'Child 2',
            isRoot: false,
            level: LAYOUT_CALC.FIRST_CHILD_LEVEL,
            hasChildren: false,
            width: 120,
            height: TEST_CONSTANTS.DEFAULT_TEST_NODE_HEIGHT,
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'BT',
            colorTheme: null,
          },
        },
      ];

      const edges: Edge[] = [
        { id: 'e1', source: 'root', target: 'child1' },
        { id: 'e2', source: 'root', target: 'child2' },
      ];

      const result = await layoutManager.performCompleteLayout(
        nodes,
        edges,
        'root',
        'BT'
      );

      const rootNode = result.nodes.find(n => n.id === 'root')!;
      const child1 = result.nodes.find(n => n.id === 'child1')!;
      const child2 = result.nodes.find(n => n.id === 'child2')!;

      // In BT layout, children should be above root
      expect(child1.position.y).toBeLessThan(rootNode.position.y);
      expect(child2.position.y).toBeLessThan(rootNode.position.y);

      // Both children should be at the same level
      expect(child1.position.y).toBe(child2.position.y);

      // Verify horizontal layout using recursive algorithm
      const allNodes = [rootNode, child1, child2];

      // Find tree bounds
      let minX = Math.min(...allNodes.map(n => n.position.x));
      let maxX = Math.max(
        ...allNodes.map(n => n.position.x + (n.data.width || 120))
      );
      const treeWidth = maxX - minX;
      const treeCenter = minX + treeWidth / 2;

      // Tree should be centered
      expect(treeCenter).toBeCloseTo(LAYOUT_CONSTANTS.ROOT_X, 50);

      // Children should have proper gap
      const gap = child2.position.x - (child1.position.x + child1.data.width!);
      expect(gap).toBeCloseTo(LAYOUT_CONSTANTS.HORIZONTAL_SIBLING_GAP, 10);
    });

    it('should handle complex hierarchy with recursive spacing in TB layout', async () => {
      const nodes: Node<MindMapNodeData>[] = [
        {
          id: 'root',
          type: 'mindMapNode',
          position: { x: DEFAULT_POSITION.X, y: DEFAULT_POSITION.Y },
          data: {
            id: 'root',
            label: 'Root',
            isRoot: true,
            level: LAYOUT_CALC.ROOT_LEVEL,
            hasChildren: true,
            width: 100,
            height: TEST_CONSTANTS.DEFAULT_TEST_NODE_HEIGHT,
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'TB',
            colorTheme: null,
          },
        },
        {
          id: 'a',
          type: 'mindMapNode',
          position: { x: DEFAULT_POSITION.X, y: DEFAULT_POSITION.Y },
          data: {
            id: 'a',
            label: 'Branch A',
            isRoot: false,
            level: LAYOUT_CALC.FIRST_CHILD_LEVEL,
            hasChildren: true,
            width: 100,
            height: TEST_CONSTANTS.DEFAULT_TEST_NODE_HEIGHT,
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'TB',
            colorTheme: null,
          },
        },
        {
          id: 'b',
          type: 'mindMapNode',
          position: { x: DEFAULT_POSITION.X, y: DEFAULT_POSITION.Y },
          data: {
            id: 'b',
            label: 'Branch B',
            isRoot: false,
            level: LAYOUT_CALC.FIRST_CHILD_LEVEL,
            hasChildren: true,
            width: 100,
            height: TEST_CONSTANTS.DEFAULT_TEST_NODE_HEIGHT,
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'TB',
            colorTheme: null,
          },
        },
        {
          id: 'a1',
          type: 'mindMapNode',
          position: { x: DEFAULT_POSITION.X, y: DEFAULT_POSITION.Y },
          data: {
            id: 'a1',
            label: 'Leaf A1',
            isRoot: false,
            level: 2,
            hasChildren: false,
            width: 80,
            height: TEST_CONSTANTS.DEFAULT_TEST_NODE_HEIGHT,
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'TB',
            colorTheme: null,
          },
        },
        {
          id: 'a2',
          type: 'mindMapNode',
          position: { x: DEFAULT_POSITION.X, y: DEFAULT_POSITION.Y },
          data: {
            id: 'a2',
            label: 'Leaf A2',
            isRoot: false,
            level: 2,
            hasChildren: false,
            width: 80,
            height: TEST_CONSTANTS.DEFAULT_TEST_NODE_HEIGHT,
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'TB',
            colorTheme: null,
          },
        },
        {
          id: 'b1',
          type: 'mindMapNode',
          position: { x: DEFAULT_POSITION.X, y: DEFAULT_POSITION.Y },
          data: {
            id: 'b1',
            label: 'Leaf B1',
            isRoot: false,
            level: 2,
            hasChildren: false,
            width: 80,
            height: TEST_CONSTANTS.DEFAULT_TEST_NODE_HEIGHT,
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'TB',
            colorTheme: null,
          },
        },
      ];

      const edges: Edge[] = [
        { id: 'e1', source: 'root', target: 'a' },
        { id: 'e2', source: 'root', target: 'b' },
        { id: 'e3', source: 'a', target: 'a1' },
        { id: 'e4', source: 'a', target: 'a2' },
        { id: 'e5', source: 'b', target: 'b1' },
      ];

      const result = await layoutManager.performCompleteLayout(
        nodes,
        edges,
        'root',
        'TB'
      );

      // Find all nodes
      const root = result.nodes.find(n => n.id === 'root')!;
      const a = result.nodes.find(n => n.id === 'a')!;
      const b = result.nodes.find(n => n.id === 'b')!;
      const a1 = result.nodes.find(n => n.id === 'a1')!;
      const a2 = result.nodes.find(n => n.id === 'a2')!;
      const b1 = result.nodes.find(n => n.id === 'b1')!;

      // Verify hierarchical vertical positioning
      // Level 1 should be below root
      expect(a.position.y).toBeGreaterThan(root.position.y);
      expect(b.position.y).toBeGreaterThan(root.position.y);
      expect(a.position.y).toBe(b.position.y); // Same level

      // Level 2 should be below level 1
      expect(a1.position.y).toBeGreaterThan(a.position.y);
      expect(a2.position.y).toBeGreaterThan(a.position.y);
      expect(b1.position.y).toBeGreaterThan(b.position.y);

      // All level 2 nodes should be at same Y
      expect(a1.position.y).toBe(a2.position.y);
      expect(a2.position.y).toBe(b1.position.y);

      // Verify recursive horizontal spacing
      // Branch A should be centered over its children
      const aCenterX = a.position.x + a.data.width! / 2;
      const a1CenterX = a1.position.x + a1.data.width! / 2;
      const a2CenterX = a2.position.x + a2.data.width! / 2;
      const aChildrenCenterX = (a1CenterX + a2CenterX) / 2;

      expect(aCenterX).toBeCloseTo(aChildrenCenterX, 10);

      // Branch B should be centered over its single child
      const bCenterX = b.position.x + b.data.width! / 2;
      const b1CenterX = b1.position.x + b1.data.width! / 2;

      expect(bCenterX).toBeCloseTo(b1CenterX, 10);

      // Gap between branches should be reasonable
      const branchGap = b.position.x - (a.position.x + a.data.width!);
      expect(branchGap).toBeGreaterThan(50); // Some reasonable minimum gap
    });

    it('should handle tall nodes with proper vertical spacing in TB layout', async () => {
      const nodes: Node<MindMapNodeData>[] = [
        {
          id: 'root',
          type: 'mindMapNode',
          position: { x: DEFAULT_POSITION.X, y: DEFAULT_POSITION.Y },
          data: {
            id: 'root',
            label: 'Root Node',
            isRoot: true,
            level: LAYOUT_CALC.ROOT_LEVEL,
            hasChildren: true,
            width: 120,
            height: TEST_CONSTANTS.DEFAULT_TEST_NODE_HEIGHT,
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'TB',
            colorTheme: null,
          },
        },
        {
          id: 'tallNode',
          type: 'mindMapNode',
          position: { x: DEFAULT_POSITION.X, y: DEFAULT_POSITION.Y },
          data: {
            id: 'tallNode',
            label:
              'This is a very tall node\nwith multiple lines\nof text content\nthat spans\nmany lines\nto test\nvertical\nspacing\nproperties\nproperly',
            isRoot: false,
            level: LAYOUT_CALC.FIRST_CHILD_LEVEL,
            hasChildren: true,
            width: 200,
            height: 240, // 10 lines * ~24px per line
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'TB',
            colorTheme: null,
          },
        },
        {
          id: 'child1',
          type: 'mindMapNode',
          position: { x: DEFAULT_POSITION.X, y: DEFAULT_POSITION.Y },
          data: {
            id: 'child1',
            label: 'Child 1',
            isRoot: false,
            level: 2,
            hasChildren: false,
            width: 100,
            height: TEST_CONSTANTS.DEFAULT_TEST_NODE_HEIGHT,
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'TB',
            colorTheme: null,
          },
        },
        {
          id: 'child2',
          type: 'mindMapNode',
          position: { x: DEFAULT_POSITION.X, y: DEFAULT_POSITION.Y },
          data: {
            id: 'child2',
            label: 'Child 2',
            isRoot: false,
            level: 2,
            hasChildren: false,
            width: 100,
            height: TEST_CONSTANTS.DEFAULT_TEST_NODE_HEIGHT,
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'TB',
            colorTheme: null,
          },
        },
      ];

      const edges: Edge[] = [
        { id: 'e1', source: 'root', target: 'tallNode' },
        { id: 'e2', source: 'tallNode', target: 'child1' },
        { id: 'e3', source: 'tallNode', target: 'child2' },
      ];

      const result = await layoutManager.performCompleteLayout(
        nodes,
        edges,
        'root',
        'TB'
      );

      const root = result.nodes.find(n => n.id === 'root')!;
      const tallNode = result.nodes.find(n => n.id === 'tallNode')!;
      const child1 = result.nodes.find(n => n.id === 'child1')!;
      const child2 = result.nodes.find(n => n.id === 'child2')!;

      // Verify no overlaps
      // The tall node should be positioned below root with proper gap
      const rootBottom = root.position.y + root.data.height!;
      const tallNodeTop = tallNode.position.y;
      expect(tallNodeTop - rootBottom).toBeGreaterThanOrEqual(60); // Gap between levels

      // Children should be positioned below the tall node with proper gap
      const tallNodeBottom = tallNode.position.y + tallNode.data.height!;
      const child1Top = child1.position.y;
      const child2Top = child2.position.y;

      expect(child1Top - tallNodeBottom).toBeGreaterThanOrEqual(60);
      expect(child2Top - tallNodeBottom).toBeGreaterThanOrEqual(60);

      // Children should be at the same vertical level
      expect(child1.position.y).toBe(child2.position.y);
    });

    it('should handle tall nodes with proper vertical spacing in BT layout', async () => {
      const nodes: Node<MindMapNodeData>[] = [
        {
          id: 'root',
          type: 'mindMapNode',
          position: { x: DEFAULT_POSITION.X, y: DEFAULT_POSITION.Y },
          data: {
            id: 'root',
            label: 'Root Node',
            isRoot: true,
            level: LAYOUT_CALC.ROOT_LEVEL,
            hasChildren: true,
            width: 120,
            height: TEST_CONSTANTS.DEFAULT_TEST_NODE_HEIGHT,
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'BT',
            colorTheme: null,
          },
        },
        {
          id: 'tallNode',
          type: 'mindMapNode',
          position: { x: DEFAULT_POSITION.X, y: DEFAULT_POSITION.Y },
          data: {
            id: 'tallNode',
            label:
              'This is a very tall node\nwith multiple lines\nof text content\nthat spans\nmany lines\nto test\nvertical\nspacing\nproperties\nproperly',
            isRoot: false,
            level: LAYOUT_CALC.FIRST_CHILD_LEVEL,
            hasChildren: true,
            width: 200,
            height: 240, // 10 lines * ~24px per line
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'BT',
            colorTheme: null,
          },
        },
        {
          id: 'child1',
          type: 'mindMapNode',
          position: { x: DEFAULT_POSITION.X, y: DEFAULT_POSITION.Y },
          data: {
            id: 'child1',
            label: 'Child 1',
            isRoot: false,
            level: 2,
            hasChildren: false,
            width: 100,
            height: TEST_CONSTANTS.DEFAULT_TEST_NODE_HEIGHT,
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'BT',
            colorTheme: null,
          },
        },
      ];

      const edges: Edge[] = [
        { id: 'e1', source: 'root', target: 'tallNode' },
        { id: 'e2', source: 'tallNode', target: 'child1' },
      ];

      const result = await layoutManager.performCompleteLayout(
        nodes,
        edges,
        'root',
        'BT'
      );

      const root = result.nodes.find(n => n.id === 'root')!;
      const tallNode = result.nodes.find(n => n.id === 'tallNode')!;
      const child1 = result.nodes.find(n => n.id === 'child1')!;

      // Debug positions
      console.log('BT Layout positions:');
      console.log('Root:', root.position.y);
      console.log('TallNode:', tallNode.position.y);
      console.log('Child1:', child1.position.y);

      // In BT layout, children should be above parents
      expect(child1.position.y).toBeLessThan(tallNode.position.y);
      expect(tallNode.position.y).toBeLessThan(root.position.y);

      // Verify no overlaps
      // The tall node should be positioned above root with proper gap
      const tallNodeBottom = tallNode.position.y + tallNode.data.height!;
      const rootTop = root.position.y;
      expect(rootTop - tallNodeBottom).toBeGreaterThanOrEqual(60);

      // Child should be positioned above the tall node with proper gap
      const child1Bottom = child1.position.y + child1.data.height!;
      const tallNodeTop = tallNode.position.y;
      expect(tallNodeTop - child1Bottom).toBeGreaterThanOrEqual(60);
    });
  });

  it('should layout a simple parent-child tree with space allocation', async () => {
    const nodes: Node<MindMapNodeData>[] = [
      {
        id: 'root',
        type: 'mindMapNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'root',
          label: 'Root Node',
          isRoot: true,
          level: 0,
          hasChildren: true,
          isCollapsed: false,
          isDragging: false,
          isDropTarget: false,
          dropPosition: null,
          layout: 'LR',
          colorTheme: null,
        },
      },
      {
        id: 'child1',
        type: 'mindMapNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'child1',
          label: 'Child Node 1',
          isRoot: false,
          level: 1,
          hasChildren: false,
          isCollapsed: false,
          isDragging: false,
          isDropTarget: false,
          dropPosition: null,
          layout: 'LR',
          colorTheme: null,
        },
      },
      {
        id: 'child2',
        type: 'mindMapNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'child2',
          label: 'Child Node 2',
          isRoot: false,
          level: 1,
          hasChildren: false,
          isCollapsed: false,
          isDragging: false,
          isDropTarget: false,
          dropPosition: null,
          layout: 'LR',
          colorTheme: null,
        },
      },
    ];

    const edges: Edge[] = [
      { id: 'e1', source: 'root', target: 'child1' },
      { id: 'e2', source: 'root', target: 'child2' },
    ];

    const result = await layoutManager.arrangeNodes(nodes, edges, 'root', 'LR');

    // Check that all nodes are positioned
    expect(result).toHaveLength(3);

    const root = result.find(n => n.id === 'root')!;
    const child1 = result.find(n => n.id === 'child1')!;
    const child2 = result.find(n => n.id === 'child2')!;

    // Root should be positioned around the center area (600, 400 is the base)
    expect(root.position.x).toBeCloseTo(600, 0);
    expect(root.position.y).toBeGreaterThan(300);
    expect(root.position.y).toBeLessThan(500);

    // Children should be to the right of root (LR layout) with proper spacing
    expect(child1.position.x).toBeGreaterThan(root.position.x + 200);
    expect(child2.position.x).toBeGreaterThan(root.position.x + 200);
    expect(child1.position.x).toBeCloseTo(child2.position.x, 10); // Same depth level

    // Children should have different Y positions (space allocated proportionally)
    const yDifference = Math.abs(child1.position.y - child2.position.y);
    expect(yDifference).toBeGreaterThan(80); // At least minimum node spacing

    // All nodes should have dimensions calculated
    expect(root.data.width).toBeGreaterThan(0);
    expect(root.data.height).toBeGreaterThan(0);
    expect(child1.data.width).toBeGreaterThan(0);
    expect(child1.data.height).toBeGreaterThan(0);
  });

  it('should allocate space proportionally based on subtree size', async () => {
    const nodes: Node<MindMapNodeData>[] = [
      {
        id: 'root',
        type: 'mindMapNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'root',
          label: 'Root',
          isRoot: true,
          level: 0,
          hasChildren: true,
          isCollapsed: false,
          isDragging: false,
          isDropTarget: false,
          dropPosition: null,
          layout: 'LR',
          colorTheme: null,
        },
      },
      {
        id: 'parent1',
        type: 'mindMapNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'parent1',
          label: 'Parent 1',
          isRoot: false,
          level: 1,
          hasChildren: true,
          isCollapsed: false,
          isDragging: false,
          isDropTarget: false,
          dropPosition: null,
          layout: 'LR',
          colorTheme: null,
        },
      },
      {
        id: 'parent2',
        type: 'mindMapNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'parent2',
          label: 'Parent 2',
          isRoot: false,
          level: 1,
          hasChildren: true,
          isCollapsed: false,
          isDragging: false,
          isDropTarget: false,
          dropPosition: null,
          layout: 'LR',
          colorTheme: null,
        },
      },
      {
        id: 'leaf1',
        type: 'mindMapNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'leaf1',
          label: 'Leaf 1',
          isRoot: false,
          level: 2,
          hasChildren: false,
          isCollapsed: false,
          isDragging: false,
          isDropTarget: false,
          dropPosition: null,
          layout: 'LR',
          colorTheme: null,
        },
      },
      {
        id: 'leaf2',
        type: 'mindMapNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'leaf2',
          label: 'Leaf 2',
          isRoot: false,
          level: 2,
          hasChildren: false,
          isCollapsed: false,
          isDragging: false,
          isDropTarget: false,
          dropPosition: null,
          layout: 'LR',
          colorTheme: null,
        },
      },
      {
        id: 'leaf3',
        type: 'mindMapNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'leaf3',
          label: 'Leaf 3',
          isRoot: false,
          level: 2,
          hasChildren: false,
          isCollapsed: false,
          isDragging: false,
          isDropTarget: false,
          dropPosition: null,
          layout: 'LR',
          colorTheme: null,
        },
      },
      {
        id: 'leaf4',
        type: 'mindMapNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'leaf4',
          label: 'Leaf 4',
          isRoot: false,
          level: 2,
          hasChildren: false,
          isCollapsed: false,
          isDragging: false,
          isDropTarget: false,
          dropPosition: null,
          layout: 'LR',
          colorTheme: null,
        },
      },
    ];

    const edges: Edge[] = [
      { id: 'e1', source: 'root', target: 'parent1' },
      { id: 'e2', source: 'root', target: 'parent2' },
      { id: 'e3', source: 'parent1', target: 'leaf1' },
      { id: 'e4', source: 'parent2', target: 'leaf2' },
      { id: 'e5', source: 'parent2', target: 'leaf3' },
      { id: 'e6', source: 'parent2', target: 'leaf4' },
    ];

    const result = await layoutManager.arrangeNodes(nodes, edges, 'root', 'LR');

    const parent1 = result.find(n => n.id === 'parent1')!;
    const parent2 = result.find(n => n.id === 'parent2')!;
    const leaf2 = result.find(n => n.id === 'leaf2')!;
    const leaf3 = result.find(n => n.id === 'leaf3')!;
    const leaf4 = result.find(n => n.id === 'leaf4')!;

    // Parent2 has more children (3 vs 1), so should get more vertical space
    // The leaves under parent2 should have more spacing between them
    const parent2LeafSpacing1 = Math.abs(leaf2.position.y - leaf3.position.y);
    const parent2LeafSpacing2 = Math.abs(leaf3.position.y - leaf4.position.y);

    // All leaf spacing should be reasonably consistent due to proportional allocation
    expect(parent2LeafSpacing1).toBeGreaterThan(50);
    expect(parent2LeafSpacing2).toBeGreaterThan(50);

    // Parent2 should be roughly centered among its children
    const parent2Children = [leaf2, leaf3, leaf4];
    const minY = Math.min(...parent2Children.map(n => n.position.y));
    const maxY = Math.max(
      ...parent2Children.map(n => n.position.y + (n.data.height || 40))
    );
    const childrenCenter = (minY + maxY) / 2;
    const parent2Center = parent2.position.y + (parent2.data.height || 40) / 2;

    expect(Math.abs(parent2Center - childrenCenter)).toBeLessThan(40);
  });

  it('should handle nodes with different heights in space allocation', async () => {
    const nodes: Node<MindMapNodeData>[] = [
      {
        id: 'root',
        type: 'mindMapNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'root',
          label: 'Root',
          isRoot: true,
          level: 0,
          hasChildren: true,
          isCollapsed: false,
          isDragging: false,
          isDropTarget: false,
          dropPosition: null,
          layout: 'LR',
          colorTheme: null,
        },
      },
      {
        id: 'tall',
        type: 'mindMapNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'tall',
          label:
            'This is a very\ntall node with\nmultiple lines\nof text content',
          isRoot: false,
          level: 1,
          hasChildren: false,
          isCollapsed: false,
          isDragging: false,
          isDropTarget: false,
          dropPosition: null,
          layout: 'LR',
          colorTheme: null,
        },
      },
      {
        id: 'short',
        type: 'mindMapNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'short',
          label: 'Short',
          isRoot: false,
          level: 1,
          hasChildren: false,
          isCollapsed: false,
          isDragging: false,
          isDropTarget: false,
          dropPosition: null,
          layout: 'LR',
          colorTheme: null,
        },
      },
    ];

    const edges: Edge[] = [
      { id: 'e1', source: 'root', target: 'tall' },
      { id: 'e2', source: 'root', target: 'short' },
    ];

    const result = await layoutManager.arrangeNodes(nodes, edges, 'root', 'LR');

    const tallNode = result.find(n => n.id === 'tall')!;
    const shortNode = result.find(n => n.id === 'short')!;

    // Tall node should get more height due to its content
    expect(tallNode.data.height!).toBeGreaterThan(shortNode.data.height!);

    // Nodes should not overlap despite different heights
    const tallBottom = tallNode.position.y + (tallNode.data.height || 40);
    const shortTop = shortNode.position.y;
    const shortBottom = shortNode.position.y + (shortNode.data.height || 40);
    const tallTop = tallNode.position.y;

    // Either tall is above short or short is above tall, with no overlap
    const noOverlap = tallBottom <= shortTop || shortBottom <= tallTop;
    expect(noOverlap).toBe(true);

    // Minimum spacing should be maintained
    const verticalSpacing = Math.min(
      Math.abs(tallBottom - shortTop),
      Math.abs(shortBottom - tallTop)
    );
    expect(verticalSpacing).toBeGreaterThan(20);
  });

  it('should prevent overlaps with large text nodes', async () => {
    const nodes: Node<MindMapNodeData>[] = [
      {
        id: 'root',
        type: 'mindMapNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'root',
          label: 'Root',
          isRoot: true,
          level: 0,
          hasChildren: true,
          isCollapsed: false,
          isDragging: false,
          isDropTarget: false,
          dropPosition: null,
          layout: 'LR',
          colorTheme: null,
        },
      },
      {
        id: 'large1',
        type: 'mindMapNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'large1',
          label:
            'This is an extremely long node label that would cause overlapping issues in the old algorithm implementation',
          isRoot: false,
          level: 1,
          hasChildren: false,
          isCollapsed: false,
          isDragging: false,
          isDropTarget: false,
          dropPosition: null,
          layout: 'LR',
          colorTheme: null,
        },
      },
      {
        id: 'large2',
        type: 'mindMapNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'large2',
          label:
            'Another very long node label\nwith multiple lines\nthat should not overlap\nwith adjacent nodes',
          isRoot: false,
          level: 1,
          hasChildren: false,
          isCollapsed: false,
          isDragging: false,
          isDropTarget: false,
          dropPosition: null,
          layout: 'LR',
          colorTheme: null,
        },
      },
      {
        id: 'large3',
        type: 'mindMapNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'large3',
          label:
            'Yet another substantially large node with extensive text content that previously caused positioning problems',
          isRoot: false,
          level: 1,
          hasChildren: false,
          isCollapsed: false,
          isDragging: false,
          isDropTarget: false,
          dropPosition: null,
          layout: 'LR',
          colorTheme: null,
        },
      },
    ];

    const edges: Edge[] = [
      { id: 'e1', source: 'root', target: 'large1' },
      { id: 'e2', source: 'root', target: 'large2' },
      { id: 'e3', source: 'root', target: 'large3' },
    ];

    const result = await layoutManager.arrangeNodes(nodes, edges, 'root', 'LR');

    const large1 = result.find(n => n.id === 'large1')!;
    const large2 = result.find(n => n.id === 'large2')!;
    const large3 = result.find(n => n.id === 'large3')!;

    // Calculate bounding boxes
    const nodes_with_bounds = [large1, large2, large3].map(node => ({
      ...node,
      top: node.position.y,
      bottom: node.position.y + (node.data.height || 40),
      left: node.position.x,
      right: node.position.x + (node.data.width || 100),
    }));

    // Check for overlaps between each pair
    for (let i = 0; i < nodes_with_bounds.length; i++) {
      for (let j = i + 1; j < nodes_with_bounds.length; j++) {
        const node1 = nodes_with_bounds[i];
        const node2 = nodes_with_bounds[j];

        // Check for vertical overlap (since they're at same depth horizontally)
        const verticalOverlap = !(
          node1.bottom <= node2.top || node2.bottom <= node1.top
        );

        // They should not overlap vertically
        expect(verticalOverlap).toBe(false);

        // Minimum spacing should be maintained
        const verticalSpacing = Math.min(
          Math.abs(node1.bottom - node2.top),
          Math.abs(node2.bottom - node1.top)
        );
        expect(verticalSpacing).toBeGreaterThan(20);
      }
    }

    // Ensure all nodes have reasonable calculated dimensions
    expect(large1.data.width!).toBeGreaterThan(400); // Long text should be wide
    expect(large2.data.height!).toBeGreaterThan(40); // Multi-line should be tall
    expect(large3.data.width!).toBeGreaterThan(400); // Long text should be wide
  });

  it('should position descendants correctly in allocated subtree space', async () => {
    const nodes: Node<MindMapNodeData>[] = [
      {
        id: 'root',
        type: 'mindMapNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'root',
          label: 'Root',
          isRoot: true,
          level: 0,
          hasChildren: true,
          isCollapsed: false,
          isDragging: false,
          isDropTarget: false,
          dropPosition: null,
          layout: 'LR',
          colorTheme: null,
        },
      },
      {
        id: 'branch',
        type: 'mindMapNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'branch',
          label: 'Branch',
          isRoot: false,
          level: 1,
          hasChildren: true,
          isCollapsed: false,
          isDragging: false,
          isDropTarget: false,
          dropPosition: null,
          layout: 'LR',
          colorTheme: null,
        },
      },
      {
        id: 'subbranch1',
        type: 'mindMapNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'subbranch1',
          label: 'Subbranch 1',
          isRoot: false,
          level: 2,
          hasChildren: true,
          isCollapsed: false,
          isDragging: false,
          isDropTarget: false,
          dropPosition: null,
          layout: 'LR',
          colorTheme: null,
        },
      },
      {
        id: 'subbranch2',
        type: 'mindMapNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'subbranch2',
          label: 'Subbranch 2',
          isRoot: false,
          level: 2,
          hasChildren: false,
          isCollapsed: false,
          isDragging: false,
          isDropTarget: false,
          dropPosition: null,
          layout: 'LR',
          colorTheme: null,
        },
      },
      {
        id: 'leaf1',
        type: 'mindMapNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'leaf1',
          label: 'Deep Leaf 1',
          isRoot: false,
          level: 3,
          hasChildren: false,
          isCollapsed: false,
          isDragging: false,
          isDropTarget: false,
          dropPosition: null,
          layout: 'LR',
          colorTheme: null,
        },
      },
      {
        id: 'leaf2',
        type: 'mindMapNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'leaf2',
          label: 'Deep Leaf 2',
          isRoot: false,
          level: 3,
          hasChildren: false,
          isCollapsed: false,
          isDragging: false,
          isDropTarget: false,
          dropPosition: null,
          layout: 'LR',
          colorTheme: null,
        },
      },
    ];

    const edges: Edge[] = [
      { id: 'e1', source: 'root', target: 'branch' },
      { id: 'e2', source: 'branch', target: 'subbranch1' },
      { id: 'e3', source: 'branch', target: 'subbranch2' },
      { id: 'e4', source: 'subbranch1', target: 'leaf1' },
      { id: 'e5', source: 'subbranch1', target: 'leaf2' },
    ];

    const result = await layoutManager.arrangeNodes(nodes, edges, 'root', 'LR');

    const root = result.find(n => n.id === 'root')!;
    const branch = result.find(n => n.id === 'branch')!;
    const subbranch1 = result.find(n => n.id === 'subbranch1')!;
    const subbranch2 = result.find(n => n.id === 'subbranch2')!;
    const leaf1 = result.find(n => n.id === 'leaf1')!;
    const leaf2 = result.find(n => n.id === 'leaf2')!;

    // Verify proper depth progression (X positioning)
    expect(root.position.x).toBeLessThan(branch.position.x);
    expect(branch.position.x).toBeLessThan(subbranch1.position.x);
    expect(branch.position.x).toBeLessThan(subbranch2.position.x);
    expect(subbranch1.position.x).toBeLessThan(leaf1.position.x);
    expect(subbranch1.position.x).toBeLessThan(leaf2.position.x);

    // Verify subbranches are at same depth
    expect(
      Math.abs(subbranch1.position.x - subbranch2.position.x)
    ).toBeLessThan(10);

    // Verify leaves are at same depth
    expect(Math.abs(leaf1.position.x - leaf2.position.x)).toBeLessThan(10);

    // Verify branch is centered relative to its descendants
    const branchDescendants = [subbranch1, subbranch2, leaf1, leaf2];
    const minDescendantY = Math.min(
      ...branchDescendants.map(n => n.position.y)
    );
    const maxDescendantY = Math.max(
      ...branchDescendants.map(n => n.position.y + (n.data.height || 40))
    );
    const descendantsCenter = (minDescendantY + maxDescendantY) / 2;
    const branchCenter = branch.position.y + (branch.data.height || 40) / 2;

    expect(Math.abs(branchCenter - descendantsCenter)).toBeLessThan(50);

    // Verify subbranch1 is centered relative to its children
    const subbranch1Children = [leaf1, leaf2];
    const minChildY = Math.min(...subbranch1Children.map(n => n.position.y));
    const maxChildY = Math.max(
      ...subbranch1Children.map(n => n.position.y + (n.data.height || 40))
    );
    const childrenCenter = (minChildY + maxChildY) / 2;
    const subbranch1Center =
      subbranch1.position.y + (subbranch1.data.height || 40) / 2;

    expect(Math.abs(subbranch1Center - childrenCenter)).toBeLessThan(30);
  });
});
