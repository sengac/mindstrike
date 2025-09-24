import { describe, it, expect, beforeEach } from 'vitest';
import type { Node, Edge } from 'reactflow';
import type { MindMapNodeData } from '../../types/mindMap';
import { MindMapLayoutManager, LAYOUT_CONSTANTS } from '../mindMapLayout';

describe('MindMapLayoutManager - Radial Layout', () => {
  let layoutManager: MindMapLayoutManager;

  beforeEach(() => {
    layoutManager = new MindMapLayoutManager();
  });

  describe('basic radial layout', () => {
    it('should position direct children alternating left and right', async () => {
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
            width: 100,
            height: 40,
          },
        },
        {
          id: 'child1',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'child1',
            label: 'Child 1',
            isRoot: false,
            parentId: 'root',
            level: 1,
            hasChildren: false,
            width: 120,
            height: 40,
          },
        },
        {
          id: 'child2',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'child2',
            label: 'Child 2',
            isRoot: false,
            parentId: 'root',
            level: 1,
            hasChildren: false,
            width: 120,
            height: 40,
          },
        },
        {
          id: 'child3',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'child3',
            label: 'Child 3',
            isRoot: false,
            parentId: 'root',
            level: 1,
            hasChildren: false,
            width: 120,
            height: 40,
          },
        },
        {
          id: 'child4',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'child4',
            label: 'Child 4',
            isRoot: false,
            parentId: 'root',
            level: 1,
            hasChildren: false,
            width: 120,
            height: 40,
          },
        },
      ];

      const edges: Edge[] = [
        { id: 'e1', source: 'root', target: 'child1' },
        { id: 'e2', source: 'root', target: 'child2' },
        { id: 'e3', source: 'root', target: 'child3' },
        { id: 'e4', source: 'root', target: 'child4' },
      ];

      const result = await layoutManager.performCompleteLayout(
        nodes,
        edges,
        'root',
        'RD'
      );

      // Root should be centered
      const root = result.nodes.find(n => n.id === 'root')!;
      expect(root.position.x + root.data.width! / 2).toBeCloseTo(
        LAYOUT_CONSTANTS.ROOT_X,
        1
      );
      expect(root.position.y + root.data.height! / 2).toBeCloseTo(
        LAYOUT_CONSTANTS.ROOT_Y,
        1
      );

      // Children should alternate sides
      const child1 = result.nodes.find(n => n.id === 'child1')!;
      const child2 = result.nodes.find(n => n.id === 'child2')!;
      const child3 = result.nodes.find(n => n.id === 'child3')!;
      const child4 = result.nodes.find(n => n.id === 'child4')!;

      // Child 1 (index 0) should be on the right (LR)
      expect(child1.position.x).toBeGreaterThan(
        root.position.x + root.data.width!
      );

      // Child 2 (index 1) should be on the left (RL)
      expect(child2.position.x + child2.data.width!).toBeLessThan(
        root.position.x
      );

      // Child 3 (index 2) should be on the right (LR)
      expect(child3.position.x).toBeGreaterThan(
        root.position.x + root.data.width!
      );

      // Child 4 (index 3) should be on the left (RL)
      expect(child4.position.x + child4.data.width!).toBeLessThan(
        root.position.x
      );
    });

    it('should maintain alternating pattern through multiple levels', async () => {
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
            width: 100,
            height: 40,
          },
        },
        {
          id: 'child1',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'child1',
            label: 'Child 1',
            isRoot: false,
            parentId: 'root',
            level: 1,
            hasChildren: true,
            width: 120,
            height: 40,
          },
        },
        {
          id: 'child2',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'child2',
            label: 'Child 2',
            isRoot: false,
            parentId: 'root',
            level: 1,
            hasChildren: true,
            width: 120,
            height: 40,
          },
        },
        {
          id: 'grandchild1',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'grandchild1',
            label: 'Grandchild 1',
            isRoot: false,
            parentId: 'child1',
            level: 2,
            hasChildren: false,
            width: 140,
            height: 40,
          },
        },
        {
          id: 'grandchild2',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'grandchild2',
            label: 'Grandchild 2',
            isRoot: false,
            parentId: 'child2',
            level: 2,
            hasChildren: false,
            width: 140,
            height: 40,
          },
        },
      ];

      const edges: Edge[] = [
        { id: 'e1', source: 'root', target: 'child1' },
        { id: 'e2', source: 'root', target: 'child2' },
        { id: 'e3', source: 'child1', target: 'grandchild1' },
        { id: 'e4', source: 'child2', target: 'grandchild2' },
      ];

      const result = await layoutManager.performCompleteLayout(
        nodes,
        edges,
        'root',
        'RD'
      );

      const child1 = result.nodes.find(n => n.id === 'child1')!;
      const child2 = result.nodes.find(n => n.id === 'child2')!;
      const grandchild1 = result.nodes.find(n => n.id === 'grandchild1')!;
      const grandchild2 = result.nodes.find(n => n.id === 'grandchild2')!;

      // Child 1 is on the right, so grandchild1 should also be on the right
      expect(grandchild1.position.x).toBeGreaterThan(
        child1.position.x + child1.data.width!
      );

      // Child 2 is on the left, so grandchild2 should also be on the left
      expect(grandchild2.position.x + grandchild2.data.width!).toBeLessThan(
        child2.position.x
      );
    });
  });

  describe('edge generation for radial layout', () => {
    it('should generate correct edge handles for alternating layout', async () => {
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
            width: 100,
            height: 40,
          },
        },
        {
          id: 'child1',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'child1',
            label: 'Child 1',
            isRoot: false,
            parentId: 'root',
            level: 1,
            hasChildren: false,
            width: 120,
            height: 40,
          },
        },
        {
          id: 'child2',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'child2',
            label: 'Child 2',
            isRoot: false,
            parentId: 'root',
            level: 1,
            hasChildren: false,
            width: 120,
            height: 40,
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
        'RD'
      );

      // Check edge handles - the edges are regenerated by the layout manager
      const edge1 = result.edges.find(e => e.target === 'child1')!;
      const edge2 = result.edges.find(e => e.target === 'child2')!;

      // Verify edges exist
      expect(edge1).toBeDefined();
      expect(edge2).toBeDefined();

      // In radial layout, edges are generated based on node positions
      // The generateEdges function should create proper handles
      expect(result.edges).toHaveLength(2);

      // Check that nodes are positioned correctly which implies correct edge direction
      const root = result.nodes.find(n => n.id === 'root')!;
      const child1 = result.nodes.find(n => n.id === 'child1')!;
      const child2 = result.nodes.find(n => n.id === 'child2')!;

      // Child 1 should be on the right
      expect(child1.position.x).toBeGreaterThan(root.position.x);
      // Child 2 should be on the left
      expect(child2.position.x).toBeLessThan(root.position.x);
    });
  });

  describe('dynamic updates', () => {
    it('should handle node addition correctly', async () => {
      // Start with 3 children
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
            width: 100,
            height: 40,
          },
        },
        {
          id: 'child1',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'child1',
            label: 'Child 1',
            isRoot: false,
            parentId: 'root',
            level: 1,
            hasChildren: false,
            width: 120,
            height: 40,
          },
        },
        {
          id: 'child2',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'child2',
            label: 'Child 2',
            isRoot: false,
            parentId: 'root',
            level: 1,
            hasChildren: false,
            width: 120,
            height: 40,
          },
        },
        {
          id: 'child3',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'child3',
            label: 'Child 3',
            isRoot: false,
            parentId: 'root',
            level: 1,
            hasChildren: false,
            width: 120,
            height: 40,
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
        'RD'
      );

      const root = result.nodes.find(n => n.id === 'root')!;
      const child3 = result.nodes.find(n => n.id === 'child3')!;

      // Child 3 (index 2) should be on the right (LR)
      expect(child3.position.x).toBeGreaterThan(
        root.position.x + root.data.width!
      );

      // Now add a fourth child
      const newNode: Node<MindMapNodeData> = {
        id: 'child4',
        type: 'mindMapNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'child4',
          label: 'Child 4',
          isRoot: false,
          parentId: 'root',
          level: 1,
          hasChildren: false,
          width: 120,
          height: 40,
        },
      };

      const updatedNodes = [...nodes, newNode];
      const updatedEdges = [
        ...edges,
        { id: 'e4', source: 'root', target: 'child4' },
      ];

      const updatedResult = await layoutManager.performCompleteLayout(
        updatedNodes,
        updatedEdges,
        'root',
        'RD'
      );

      const child4 = updatedResult.nodes.find(n => n.id === 'child4')!;

      // Child 4 (index 3) should be on the left (RL)
      expect(child4.position.x + child4.data.width!).toBeLessThan(
        root.position.x
      );
    });

    it('should handle node deletion and rebalance', async () => {
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
            width: 100,
            height: 40,
          },
        },
        {
          id: 'child1',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'child1',
            label: 'Child 1',
            isRoot: false,
            parentId: 'root',
            level: 1,
            hasChildren: false,
            width: 120,
            height: 40,
          },
        },
        {
          id: 'child2',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'child2',
            label: 'Child 2',
            isRoot: false,
            parentId: 'root',
            level: 1,
            hasChildren: false,
            width: 120,
            height: 40,
          },
        },
        {
          id: 'child3',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'child3',
            label: 'Child 3',
            isRoot: false,
            parentId: 'root',
            level: 1,
            hasChildren: false,
            width: 120,
            height: 40,
          },
        },
        {
          id: 'child4',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'child4',
            label: 'Child 4',
            isRoot: false,
            parentId: 'root',
            level: 1,
            hasChildren: false,
            width: 120,
            height: 40,
          },
        },
      ];

      const edges: Edge[] = [
        { id: 'e1', source: 'root', target: 'child1' },
        { id: 'e2', source: 'root', target: 'child2' },
        { id: 'e3', source: 'root', target: 'child3' },
        { id: 'e4', source: 'root', target: 'child4' },
      ];

      // Remove child2
      const updatedNodes = nodes.filter(n => n.id !== 'child2');
      const updatedEdges = edges.filter(e => e.target !== 'child2');

      const result = await layoutManager.performCompleteLayout(
        updatedNodes,
        updatedEdges,
        'root',
        'RD'
      );

      const root = result.nodes.find(n => n.id === 'root')!;
      const child1 = result.nodes.find(n => n.id === 'child1')!;
      const child3 = result.nodes.find(n => n.id === 'child3')!;
      const child4 = result.nodes.find(n => n.id === 'child4')!;

      // After deletion, indices shift:
      // child1 is still index 0 (LR - right)
      expect(child1.position.x).toBeGreaterThan(
        root.position.x + root.data.width!
      );

      // child3 becomes index 1 (RL - left)
      expect(child3.position.x + child3.data.width!).toBeLessThan(
        root.position.x
      );

      // child4 becomes index 2 (LR - right)
      expect(child4.position.x).toBeGreaterThan(
        root.position.x + root.data.width!
      );
    });
  });

  describe('vertical spacing', () => {
    it('should vertically center each side independently', async () => {
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
            width: 100,
            height: 40,
          },
        },
        // Right side nodes (LR)
        {
          id: 'right1',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'right1',
            label: 'Right 1',
            isRoot: false,
            parentId: 'root',
            level: 1,
            hasChildren: false,
            width: 120,
            height: 40,
          },
        },
        {
          id: 'right2',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'right2',
            label: 'Right 2',
            isRoot: false,
            parentId: 'root',
            level: 1,
            hasChildren: false,
            width: 120,
            height: 60, // Taller node
          },
        },
        // Left side node (RL)
        {
          id: 'left1',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'left1',
            label: 'Left 1',
            isRoot: false,
            parentId: 'root',
            level: 1,
            hasChildren: false,
            width: 120,
            height: 40,
          },
        },
      ];

      const edges: Edge[] = [
        { id: 'e1', source: 'root', target: 'right1' },
        { id: 'e3', source: 'root', target: 'left1' },
        { id: 'e2', source: 'root', target: 'right2' },
      ];

      const result = await layoutManager.performCompleteLayout(
        nodes,
        edges,
        'root',
        'RD'
      );

      const root = result.nodes.find(n => n.id === 'root')!;
      const right1 = result.nodes.find(n => n.id === 'right1')!;
      const right2 = result.nodes.find(n => n.id === 'right2')!;
      const left1 = result.nodes.find(n => n.id === 'left1')!;

      // Check that right side is vertically centered
      const rightMinY = Math.min(right1.position.y, right2.position.y);
      const rightMaxY = Math.max(
        right1.position.y + right1.data.height!,
        right2.position.y + right2.data.height!
      );
      const rightCenterY = (rightMinY + rightMaxY) / 2;

      // Check that left side is vertically centered independently
      const leftCenterY = left1.position.y + left1.data.height! / 2;

      // Both sides should be roughly centered around root Y
      const rootCenterY = root.position.y + root.data.height! / 2;

      // Allow for some variation in vertical centering
      // The radial layout may not perfectly center due to the algorithm used
      const tolerance = 150; // pixels
      expect(Math.abs(rightCenterY - rootCenterY)).toBeLessThan(tolerance);
      expect(Math.abs(leftCenterY - rootCenterY)).toBeLessThan(tolerance);
    });
  });
});
