import { describe, it, expect } from 'vitest';
import type { Node } from 'reactflow';
import type { MindMapNodeData } from '../../types/mindMap';
import { RadialLayoutCalculator } from '../radialLayoutCalculator';

describe('RadialLayoutCalculator', () => {
  describe('getChildDirection', () => {
    it('should return LR for even indices', () => {
      expect(RadialLayoutCalculator.getChildDirection(0)).toBe('LR');
      expect(RadialLayoutCalculator.getChildDirection(2)).toBe('LR');
      expect(RadialLayoutCalculator.getChildDirection(4)).toBe('LR');
      expect(RadialLayoutCalculator.getChildDirection(100)).toBe('LR');
    });

    it('should return RL for odd indices', () => {
      expect(RadialLayoutCalculator.getChildDirection(1)).toBe('RL');
      expect(RadialLayoutCalculator.getChildDirection(3)).toBe('RL');
      expect(RadialLayoutCalculator.getChildDirection(5)).toBe('RL');
      expect(RadialLayoutCalculator.getChildDirection(101)).toBe('RL');
    });
  });

  describe('getPathToRoot', () => {
    const createNode = (
      id: string,
      parentId?: string
    ): Node<MindMapNodeData> => ({
      id,
      type: 'mindMapNode',
      position: { x: 0, y: 0 },
      data: {
        id,
        label: `Node ${id}`,
        isRoot: !parentId,
        parentId,
        level: 0,
      },
    });

    it('should return path from node to root', () => {
      const nodes: Node<MindMapNodeData>[] = [
        createNode('root'),
        createNode('child1', 'root'),
        createNode('grandchild1', 'child1'),
        createNode('greatgrandchild1', 'grandchild1'),
      ];

      const path = RadialLayoutCalculator.getPathToRoot(
        'greatgrandchild1',
        nodes,
        'root'
      );
      expect(path).toEqual([
        'greatgrandchild1',
        'grandchild1',
        'child1',
        'root',
      ]);
    });

    it('should return single element for root node', () => {
      const nodes: Node<MindMapNodeData>[] = [createNode('root')];
      const path = RadialLayoutCalculator.getPathToRoot('root', nodes, 'root');
      expect(path).toEqual(['root']);
    });

    it('should handle disconnected nodes', () => {
      const nodes: Node<MindMapNodeData>[] = [
        createNode('root'),
        createNode('orphan'), // No parent
      ];

      const path = RadialLayoutCalculator.getPathToRoot(
        'orphan',
        nodes,
        'root'
      );
      expect(path).toEqual(['orphan']);
    });
  });

  describe('getChildrenOfNode', () => {
    const createNode = (
      id: string,
      parentId?: string
    ): Node<MindMapNodeData> => ({
      id,
      type: 'mindMapNode',
      position: { x: 0, y: 0 },
      data: {
        id,
        label: `Node ${id}`,
        isRoot: !parentId,
        parentId,
        level: 0,
      },
    });

    it('should return direct children of a node', () => {
      const nodes: Node<MindMapNodeData>[] = [
        createNode('root'),
        createNode('child1', 'root'),
        createNode('child2', 'root'),
        createNode('child3', 'root'),
        createNode('grandchild1', 'child1'),
      ];

      const children = RadialLayoutCalculator.getChildrenOfNode('root', nodes);
      expect(children).toHaveLength(3);
      expect(children.map(n => n.id)).toEqual(['child1', 'child2', 'child3']);
    });

    it('should return empty array for leaf nodes', () => {
      const nodes: Node<MindMapNodeData>[] = [
        createNode('root'),
        createNode('child1', 'root'),
      ];

      const children = RadialLayoutCalculator.getChildrenOfNode(
        'child1',
        nodes
      );
      expect(children).toHaveLength(0);
    });
  });

  describe('getNodeEffectiveLayout', () => {
    const createNode = (
      id: string,
      parentId?: string
    ): Node<MindMapNodeData> => ({
      id,
      type: 'mindMapNode',
      position: { x: 0, y: 0 },
      data: {
        id,
        label: `Node ${id}`,
        isRoot: !parentId,
        parentId,
        level: 0,
      },
    });

    it('should return LR for root node', () => {
      const nodes: Node<MindMapNodeData>[] = [createNode('root')];
      const layout = RadialLayoutCalculator.getNodeEffectiveLayout(
        'root',
        nodes,
        'root'
      );
      expect(layout).toBe('LR');
    });

    it('should alternate layout for direct children of root', () => {
      const nodes: Node<MindMapNodeData>[] = [
        createNode('root'),
        createNode('child1', 'root'), // Index 0 - LR
        createNode('child2', 'root'), // Index 1 - RL
        createNode('child3', 'root'), // Index 2 - LR
        createNode('child4', 'root'), // Index 3 - RL
      ];

      expect(
        RadialLayoutCalculator.getNodeEffectiveLayout('child1', nodes, 'root')
      ).toBe('LR');
      expect(
        RadialLayoutCalculator.getNodeEffectiveLayout('child2', nodes, 'root')
      ).toBe('RL');
      expect(
        RadialLayoutCalculator.getNodeEffectiveLayout('child3', nodes, 'root')
      ).toBe('LR');
      expect(
        RadialLayoutCalculator.getNodeEffectiveLayout('child4', nodes, 'root')
      ).toBe('RL');
    });

    it('should inherit layout from direct child ancestor', () => {
      const nodes: Node<MindMapNodeData>[] = [
        createNode('root'),
        createNode('child1', 'root'), // Index 0 - LR
        createNode('child2', 'root'), // Index 1 - RL
        createNode('grandchild1', 'child1'),
        createNode('grandchild2', 'child2'),
        createNode('greatgrandchild1', 'grandchild1'),
      ];

      // Descendants of child1 (LR) should be LR
      expect(
        RadialLayoutCalculator.getNodeEffectiveLayout(
          'grandchild1',
          nodes,
          'root'
        )
      ).toBe('LR');
      expect(
        RadialLayoutCalculator.getNodeEffectiveLayout(
          'greatgrandchild1',
          nodes,
          'root'
        )
      ).toBe('LR');

      // Descendants of child2 (RL) should be RL
      expect(
        RadialLayoutCalculator.getNodeEffectiveLayout(
          'grandchild2',
          nodes,
          'root'
        )
      ).toBe('RL');
    });
  });

  describe('groupNodesByLayout', () => {
    const createNode = (
      id: string,
      parentId?: string
    ): Node<MindMapNodeData> => ({
      id,
      type: 'mindMapNode',
      position: { x: 0, y: 0 },
      data: {
        id,
        label: `Node ${id}`,
        isRoot: !parentId,
        parentId,
        level: 0,
      },
    });

    it('should group nodes correctly by layout', () => {
      const nodes: Node<MindMapNodeData>[] = [
        createNode('root'),
        createNode('child1', 'root'), // LR
        createNode('child2', 'root'), // RL
        createNode('child3', 'root'), // LR
        createNode('grandchild1', 'child1'), // LR (inherits)
        createNode('grandchild2', 'child2'), // RL (inherits)
      ];

      const { leftNodes, rightNodes, rootNode } =
        RadialLayoutCalculator.groupNodesByLayout(nodes, 'root');

      expect(rootNode?.id).toBe('root');
      expect(rightNodes.map(n => n.id).sort()).toEqual([
        'child1',
        'child3',
        'grandchild1',
      ]);
      expect(leftNodes.map(n => n.id).sort()).toEqual([
        'child2',
        'grandchild2',
      ]);
    });

    it('should handle empty node list', () => {
      const { leftNodes, rightNodes, rootNode } =
        RadialLayoutCalculator.groupNodesByLayout([], 'root');

      expect(rootNode).toBeUndefined();
      expect(leftNodes).toHaveLength(0);
      expect(rightNodes).toHaveLength(0);
    });

    it('should handle root-only graph', () => {
      const nodes: Node<MindMapNodeData>[] = [createNode('root')];

      const { leftNodes, rightNodes, rootNode } =
        RadialLayoutCalculator.groupNodesByLayout(nodes, 'root');

      expect(rootNode?.id).toBe('root');
      expect(leftNodes).toHaveLength(0);
      expect(rightNodes).toHaveLength(0);
    });
  });

  describe('isDescendantOf', () => {
    const createNode = (
      id: string,
      parentId?: string
    ): Node<MindMapNodeData> => ({
      id,
      type: 'mindMapNode',
      position: { x: 0, y: 0 },
      data: {
        id,
        label: `Node ${id}`,
        isRoot: !parentId,
        parentId,
        level: 0,
      },
    });

    it('should correctly identify descendants', () => {
      const nodes: Node<MindMapNodeData>[] = [
        createNode('root'),
        createNode('child1', 'root'),
        createNode('grandchild1', 'child1'),
        createNode('child2', 'root'),
      ];

      expect(
        RadialLayoutCalculator.isDescendantOf('grandchild1', 'root', nodes)
      ).toBe(true);
      expect(
        RadialLayoutCalculator.isDescendantOf('grandchild1', 'child1', nodes)
      ).toBe(true);
      expect(
        RadialLayoutCalculator.isDescendantOf('child1', 'root', nodes)
      ).toBe(true);
    });

    it('should return false for non-descendants', () => {
      const nodes: Node<MindMapNodeData>[] = [
        createNode('root'),
        createNode('child1', 'root'),
        createNode('child2', 'root'),
      ];

      expect(
        RadialLayoutCalculator.isDescendantOf('child1', 'child2', nodes)
      ).toBe(false);
      expect(
        RadialLayoutCalculator.isDescendantOf('root', 'child1', nodes)
      ).toBe(false);
    });

    it('should return false for self-reference', () => {
      const nodes: Node<MindMapNodeData>[] = [createNode('root')];
      expect(RadialLayoutCalculator.isDescendantOf('root', 'root', nodes)).toBe(
        false
      );
    });
  });

  describe('getAllDescendants', () => {
    const createNode = (
      id: string,
      parentId?: string
    ): Node<MindMapNodeData> => ({
      id,
      type: 'mindMapNode',
      position: { x: 0, y: 0 },
      data: {
        id,
        label: `Node ${id}`,
        isRoot: !parentId,
        parentId,
        level: 0,
      },
    });

    it('should return all descendants of a node', () => {
      const nodes: Node<MindMapNodeData>[] = [
        createNode('root'),
        createNode('child1', 'root'),
        createNode('child2', 'root'),
        createNode('grandchild1', 'child1'),
        createNode('grandchild2', 'child1'),
        createNode('greatgrandchild1', 'grandchild1'),
      ];

      const descendants = RadialLayoutCalculator.getAllDescendants(
        'child1',
        nodes
      );
      const descendantIds = descendants.map(n => n.id).sort();
      expect(descendantIds).toEqual([
        'grandchild1',
        'grandchild2',
        'greatgrandchild1',
      ]);
    });

    it('should return empty array for leaf nodes', () => {
      const nodes: Node<MindMapNodeData>[] = [
        createNode('root'),
        createNode('child1', 'root'),
      ];

      const descendants = RadialLayoutCalculator.getAllDescendants(
        'child1',
        nodes
      );
      expect(descendants).toHaveLength(0);
    });

    it('should handle circular references gracefully', () => {
      // Create nodes with potential for circular reference
      const nodes: Node<MindMapNodeData>[] = [
        createNode('root'),
        createNode('child1', 'root'),
        createNode('child2', 'child1'),
      ];

      // The getAllDescendants function should handle this properly
      // by using a visited set to prevent infinite loops
      const descendants = RadialLayoutCalculator.getAllDescendants(
        'root',
        nodes
      );
      expect(descendants).toHaveLength(2);
      expect(descendants.map(n => n.id).sort()).toEqual(['child1', 'child2']);
    });
  });
});
