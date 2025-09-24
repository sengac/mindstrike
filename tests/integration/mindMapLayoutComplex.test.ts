import { describe, it, expect } from 'vitest';
import type { Node, Edge } from 'reactflow';
import type { MindMapNodeData } from '../../src/types/mindMap';
import {
  MindMapLayoutManager,
  LAYOUT_CONSTANTS,
} from '../../src/utils/mindMapLayout';
import {
  TEST_CONSTANTS,
  DEFAULT_POSITION,
  LAYOUT_CALC,
  ARRAY_NAVIGATION,
} from '../../src/mindmaps/constants/magicNumbers';

// Create a test version that bypasses the sizing strategy
class TestMindMapLayoutManager extends MindMapLayoutManager {
  // Override calculateNodeDimensions to use the width/height from node data
  calculateNodeDimensions(
    text: string,
    nodeData?: MindMapNodeData
  ): { width: number; height: number } {
    // Use the width/height values from node data if available
    if (nodeData?.width && nodeData?.height) {
      return {
        width: nodeData.width,
        height: nodeData.height,
      };
    }

    // Fallback to default values
    return {
      width: LAYOUT_CONSTANTS.DEFAULT_NODE_WIDTH,
      height: LAYOUT_CONSTANTS.DEFAULT_NODE_HEIGHT,
    };
  }
}

describe('Mind Map Layout - Complex Nested Structures', () => {
  const layoutManager = new TestMindMapLayoutManager();

  // Helper to create a node
  function createNode(
    id: string,
    label: string,
    parentId?: string,
    width: number = TEST_CONSTANTS.DEFAULT_TEST_NODE_WIDTH
  ): Node<MindMapNodeData> {
    return {
      id,
      type: 'mindMapNode',
      position: { x: DEFAULT_POSITION.X, y: DEFAULT_POSITION.Y },
      data: {
        label,
        parentId,
        level: LAYOUT_CALC.ROOT_LEVEL,
        isRoot: !parentId,
        hasChildren: false,
        isSelected: false,
        isExpanded: true,
        isCollapsed: false,
        isDragging: false,
        isDropTarget: false,
        dropPosition: null,
        layout: 'TB',
        width,
        height: TEST_CONSTANTS.DEFAULT_TEST_NODE_HEIGHT,
        chatId: null,
        notes: null,
        sources: [],
        colorTheme: null,
      },
    };
  }

  // Helper to create edges from nodes
  function createEdgesFromNodes(nodes: Node<MindMapNodeData>[]): Edge[] {
    return nodes
      .filter(node => node.data.parentId)
      .map(node => ({
        id: `${node.data.parentId}-${node.id}`,
        source: node.data.parentId!,
        target: node.id,
        type: 'smoothstep',
      }));
  }

  describe('TB Layout - No Overlapping', () => {
    it('should not overlap nodes in complex nested structure', async () => {
      // Create a structure similar to the screenshot
      const nodes = [
        createNode('root', 'My first mindmap', undefined, 150),

        // First level children
        createNode('first1', 'The first thing is', 'root', 130),
        createNode('first2', 'The first thing is', 'root', 130),
        createNode('second', 'The second things is', 'root', 150),
        createNode('third', 'The third thing is', 'root', 140),

        // Second level under first1
        createNode('hiluh', 'hiluh', 'first1', 60),

        // Second level under first2
        createNode('purple', 'or what this really means to', 'first2', 200),
        createNode(
          'because',
          "because I already don't know what the second thing is",
          'first2',
          300
        ),

        // Second level under third
        createNode(
          'firstThird',
          "And I don't really know what the first thing is either",
          'third',
          350
        ),

        // Third level under hiluh
        createNode('testing', 'testing', 'hiluh', 80),
        createNode('one', 'one', 'hiluh', 50),
        createNode('fytfyt', 'fytfyt', 'hiluh', 70),

        // Third level under because
        createNode('andSo', 'and so is this', 'because', 100),

        // Fourth level under one
        createNode('two', 'two', 'one', 50),
        createNode('three', 'three', 'one', 60),
        createNode('four', 'four', 'one', 50),
      ];

      const edges = createEdgesFromNodes(nodes);

      // Perform layout
      const result = await layoutManager.performCompleteLayout(
        nodes,
        edges,
        'root',
        'TB'
      );

      // Check that no nodes overlap
      const positionedNodes = result.nodes;

      // Group nodes by depth level
      const nodesByDepth = new Map<number, typeof positionedNodes>();
      positionedNodes.forEach(node => {
        const depth = node.data.level || LAYOUT_CALC.ROOT_LEVEL;
        if (!nodesByDepth.has(depth)) {
          nodesByDepth.set(depth, []);
        }
        nodesByDepth.get(depth)!.push(node);
      });

      // Check each depth level for horizontal overlaps
      nodesByDepth.forEach((nodesAtDepth, depth) => {
        // Sort nodes by x position
        const sortedNodes = [...nodesAtDepth].sort(
          (a, b) => a.position.x - b.position.x
        );

        // Check that each node doesn't overlap with the next
        for (let i = 0; i < sortedNodes.length - 1; i++) {
          const currentNode = sortedNodes[i];
          const nextNode = sortedNodes[i + 1];

          const currentRight =
            currentNode.position.x +
            (currentNode.data.width || LAYOUT_CONSTANTS.DEFAULT_NODE_WIDTH);
          const nextLeft = nextNode.position.x;

          // There should be at least some spacing between nodes
          expect(nextLeft).toBeGreaterThanOrEqual(currentRight);

          // Log if nodes are too close (useful for debugging)
          const spacing = nextLeft - currentRight;
          if (spacing < LAYOUT_CONSTANTS.HORIZONTAL_SIBLING_GAP / 2) {
            console.log(`Warning: Nodes at depth ${depth} are very close:`, {
              current: currentNode.id,
              next: nextNode.id,
              spacing,
              expected: LAYOUT_CONSTANTS.HORIZONTAL_SIBLING_GAP,
            });
          }
        }
      });
    });

    it('should properly calculate subtree widths', async () => {
      // Simple test case with known widths
      const nodes = [
        createNode('root', 'Root', undefined, 100),
        createNode('child1', 'Child 1', 'root', 100),
        createNode('child2', 'Child 2', 'root', 100),
        createNode('grandchild1', 'GC1', 'child1', 80),
        createNode('grandchild2', 'GC2', 'child1', 80),
        createNode('grandchild3', 'GC3', 'child2', 120),
      ];

      const edges = createEdgesFromNodes(nodes);

      const result = await layoutManager.performCompleteLayout(
        nodes,
        edges,
        'root',
        'TB'
      );

      const positionedNodes = result.nodes;

      // Find the positioned nodes
      const child1 = positionedNodes.find(n => n.id === 'child1')!;
      const child2 = positionedNodes.find(n => n.id === 'child2')!;
      const gc1 = positionedNodes.find(n => n.id === 'grandchild1')!;
      const gc2 = positionedNodes.find(n => n.id === 'grandchild2')!;

      // Child1's subtree should have enough space for both grandchildren
      // Expected: gc1 (80) + spacing (80) + gc2 (80) = 240
      const child1SubtreeWidth =
        80 + LAYOUT_CONSTANTS.HORIZONTAL_SIBLING_GAP + 80;

      // Check that child2 is positioned far enough from child1
      const child1Right = child1.position.x + 100; // child1's own width
      const expectedChild2Left =
        child1.position.x -
        (child1SubtreeWidth - 100) / 2 +
        child1SubtreeWidth +
        LAYOUT_CONSTANTS.HORIZONTAL_SIBLING_GAP;

      // Allow some tolerance for centering adjustments
      expect(child2.position.x).toBeGreaterThanOrEqual(
        expectedChild2Left - TEST_CONSTANTS.POSITION_TOLERANCE_STRICT
      );

      // Verify grandchildren don't overlap
      const gc1Right = gc1.position.x + 80;
      expect(gc2.position.x).toBeGreaterThanOrEqual(gc1Right);
    });

    it('should handle deeply nested structures without overlap', async () => {
      // Create a deeply nested structure
      const nodes = [
        createNode('root', 'Root', undefined, 100),
        createNode('a', 'A', 'root', 100),
        createNode('b', 'B', 'root', 100),
        createNode('a1', 'A1', 'a', 80),
        createNode('a2', 'A2', 'a', 80),
        createNode('a1_1', 'A1.1', 'a1', 60),
        createNode('a1_2', 'A1.2', 'a1', 60),
        createNode('a2_1', 'A2.1', 'a2', 70),
        createNode('a1_1_1', 'A1.1.1', 'a1_1', 50),
        createNode('a1_1_2', 'A1.1.2', 'a1_1', 50),
      ];

      const edges = createEdgesFromNodes(nodes);

      const result = await layoutManager.performCompleteLayout(
        nodes,
        edges,
        'root',
        'TB'
      );

      // Verify no overlaps at any level
      const nodesByParent = new Map<string | undefined, typeof result.nodes>();
      result.nodes.forEach(node => {
        const parentId = node.data.parentId;
        if (!nodesByParent.has(parentId)) {
          nodesByParent.set(parentId, []);
        }
        nodesByParent.get(parentId)!.push(node);
      });

      // Check each parent's children for overlaps
      nodesByParent.forEach((children, parentId) => {
        const sortedChildren = [...children].sort(
          (a, b) => a.position.x - b.position.x
        );

        for (
          let i = ARRAY_NAVIGATION.FIRST_INDEX;
          i < sortedChildren.length - ARRAY_NAVIGATION.INCREMENT;
          i++
        ) {
          const current = sortedChildren[i];
          const next = sortedChildren[i + 1];

          const currentRight =
            current.position.x +
            (current.data.width || LAYOUT_CONSTANTS.DEFAULT_NODE_WIDTH);
          const nextLeft = next.position.x;

          expect(nextLeft).toBeGreaterThanOrEqual(currentRight);
        }
      });
    });
  });
});
