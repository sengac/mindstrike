/**
 * Simple integration test for the restored MindMapLayoutManager
 * Tests the core recursive layout algorithm without DOM dependencies
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Node, Edge } from 'reactflow';
import type { MindMapNodeData } from '../../src/types/mindMap';
import { MindMapLayoutManager } from '../../src/utils/mindMapLayout';

describe('MindMapLayoutManager - Core Algorithm', () => {
  let layoutManager: MindMapLayoutManager;

  beforeEach(() => {
    layoutManager = new MindMapLayoutManager();
  });

  it('should handle visible node filtering correctly', () => {
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
        id: 'collapsed',
        type: 'mindMapNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'collapsed',
          label: 'Collapsed Branch',
          isRoot: false,
          level: 1,
          hasChildren: true,
          isCollapsed: true, // This node is collapsed
          isDragging: false,
          isDropTarget: false,
          dropPosition: null,
          layout: 'LR',
          colorTheme: null,
        },
      },
      {
        id: 'hidden',
        type: 'mindMapNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'hidden',
          label: 'Hidden Child',
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
      { id: 'e1', source: 'root', target: 'collapsed' },
      { id: 'e2', source: 'collapsed', target: 'hidden' },
    ];

    const visibleNodes = layoutManager.getVisibleNodes(nodes, edges);
    const visibleEdges = layoutManager.getVisibleEdges(nodes, edges);

    // Hidden child should not be visible because its parent is collapsed
    expect(visibleNodes).toHaveLength(2);
    expect(visibleNodes.find(n => n.id === 'hidden')).toBeUndefined();

    // Edge to hidden child should not be visible
    expect(visibleEdges).toHaveLength(1);
    expect(visibleEdges.find(e => e.target === 'hidden')).toBeUndefined();
  });

  it('should update node levels correctly', () => {
    const nodes: Node<MindMapNodeData>[] = [
      {
        id: 'root',
        type: 'mindMapNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'root',
          label: 'Root',
          isRoot: false, // Will be set to true
          level: 999, // Will be corrected to 0
          hasChildren: false, // Will be corrected
          isCollapsed: false,
          isDragging: false,
          isDropTarget: false,
          dropPosition: null,
          layout: 'LR',
          colorTheme: null,
        },
      },
      {
        id: 'child',
        type: 'mindMapNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'child',
          label: 'Child',
          isRoot: true, // Will be corrected to false
          level: 999, // Will be corrected to 1
          hasChildren: true, // Will be corrected to false
          isCollapsed: false,
          isDragging: false,
          isDropTarget: false,
          dropPosition: null,
          layout: 'LR',
          colorTheme: null,
        },
      },
    ];

    const edges: Edge[] = [{ id: 'e1', source: 'root', target: 'child' }];

    const result = layoutManager.updateNodeLevels(nodes, edges, 'root', 'LR');

    const root = result.find(n => n.id === 'root')!;
    const child = result.find(n => n.id === 'child')!;

    // Check that levels are correctly calculated
    expect(root.data.level).toBe(0);
    expect(child.data.level).toBe(1);

    // Check that isRoot is correctly set
    expect(root.data.isRoot).toBe(true);
    expect(child.data.isRoot).toBe(false);

    // Check that hasChildren is correctly calculated
    expect(root.data.hasChildren).toBe(true);
    expect(child.data.hasChildren).toBe(false);

    // Check that layout is set
    expect(root.data.layout).toBe('LR');
    expect(child.data.layout).toBe('LR');
  });

  it('should handle edge cases gracefully', () => {
    // Test empty arrays
    const emptyNodes = layoutManager.getVisibleNodes([], []);
    const emptyEdges = layoutManager.getVisibleEdges([], []);

    expect(emptyNodes).toHaveLength(0);
    expect(emptyEdges).toHaveLength(0);

    // Test nodes without edges
    const isolatedNodes: Node<MindMapNodeData>[] = [
      {
        id: 'isolated',
        type: 'mindMapNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'isolated',
          label: 'Isolated',
          isRoot: true,
          level: 0,
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

    const resultNodes = layoutManager.updateNodeLevels(
      isolatedNodes,
      [],
      'isolated',
      'TB'
    );
    expect(resultNodes).toHaveLength(1);
    expect(resultNodes[0].data.level).toBe(0);
    expect(resultNodes[0].data.isRoot).toBe(true);
    expect(resultNodes[0].data.hasChildren).toBe(false);
    expect(resultNodes[0].data.layout).toBe('TB');
  });

  it('should correctly identify complex hierarchies', () => {
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
        id: 'branch1',
        type: 'mindMapNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'branch1',
          label: 'Branch 1',
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
        id: 'branch2',
        type: 'mindMapNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'branch2',
          label: 'Branch 2',
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
        id: 'deepleaf',
        type: 'mindMapNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'deepleaf',
          label: 'Deep Leaf',
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
      { id: 'e1', source: 'root', target: 'branch1' },
      { id: 'e2', source: 'root', target: 'branch2' },
      { id: 'e3', source: 'branch1', target: 'leaf1' },
      { id: 'e4', source: 'leaf1', target: 'deepleaf' },
    ];

    const result = layoutManager.updateNodeLevels(nodes, edges, 'root', 'RL');

    // Check all levels are correctly calculated
    expect(result.find(n => n.id === 'root')!.data.level).toBe(0);
    expect(result.find(n => n.id === 'branch1')!.data.level).toBe(1);
    expect(result.find(n => n.id === 'branch2')!.data.level).toBe(1);
    expect(result.find(n => n.id === 'leaf1')!.data.level).toBe(2);
    expect(result.find(n => n.id === 'deepleaf')!.data.level).toBe(3);

    // Check parent-child relationships are identified
    expect(result.find(n => n.id === 'root')!.data.hasChildren).toBe(true);
    expect(result.find(n => n.id === 'branch1')!.data.hasChildren).toBe(true);
    expect(result.find(n => n.id === 'branch2')!.data.hasChildren).toBe(false);
    expect(result.find(n => n.id === 'leaf1')!.data.hasChildren).toBe(true);
    expect(result.find(n => n.id === 'deepleaf')!.data.hasChildren).toBe(false);

    // Check layout is applied to all
    result.forEach(node => {
      expect(node.data.layout).toBe('RL');
    });
  });
});
