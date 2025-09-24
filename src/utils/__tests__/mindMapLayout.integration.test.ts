import { describe, it, expect, beforeEach } from 'vitest';
import type { Node, Edge } from 'reactflow';
import type { MindMapNodeData } from '../../types/mindMap';
import { MindMapLayoutManager } from '../mindMapLayout';

describe('MindMapLayoutManager Integration Tests', () => {
  let layoutManager: MindMapLayoutManager;

  beforeEach(() => {
    layoutManager = new MindMapLayoutManager();
  });

  describe('performCompleteLayout', () => {
    it('should handle real-world scenario with wrapped text nodes', async () => {
      // This recreates the user's reported issue
      const nodes: Node<MindMapNodeData>[] = [
        {
          id: 'root',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'root',
            label: 'yet another',
            isRoot: true,
            level: 0,
            hasChildren: true,
            width: 150,
            height: 45,
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'LR',
            colorTheme: 'blue',
          },
        },
        {
          id: 'one',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'one',
            label: 'one',
            isRoot: false,
            level: 1,
            hasChildren: false,
            width: 120,
            height: 40,
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'LR',
            colorTheme: 'purple',
          },
        },
        {
          id: 'two',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'two',
            label: 'two',
            isRoot: false,
            level: 1,
            hasChildren: true,
            width: 120,
            height: 40,
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'LR',
            colorTheme: 'green',
          },
        },
        {
          id: 'three',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'three',
            label: 'three',
            isRoot: false,
            level: 1,
            hasChildren: false,
            width: 120,
            height: 40,
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'LR',
            colorTheme: null,
          },
        },
        {
          id: 'long-text',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'long-text',
            label:
              'and if the text is really long, does it work out fine?asdfa fasjdfhaksdhf aksjhf akjsehfaksjfheasefaf does aklsdfjasdflk asdfjlas jfelakjsfelkajseflkajseflkajsefalskjfealksj eraiksjeraisejf',
            isRoot: false,
            level: 2,
            hasChildren: false,
            width: 300, // Max width, will have significant height
            height: 180, // Tall due to wrapped text
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'LR',
            colorTheme: null,
          },
        },
        {
          id: 'five',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'five',
            label: 'five',
            isRoot: false,
            level: 3,
            hasChildren: false,
            width: 120,
            height: 40,
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'LR',
            colorTheme: null,
          },
        },
        {
          id: 'six',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'six',
            label: 'six',
            isRoot: false,
            level: 2,
            hasChildren: false,
            width: 120,
            height: 40,
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
        { id: 'e1', source: 'root', target: 'one' },
        { id: 'e2', source: 'root', target: 'two' },
        { id: 'e3', source: 'root', target: 'three' },
        { id: 'e4', source: 'two', target: 'long-text' },
        { id: 'e5', source: 'long-text', target: 'five' },
        { id: 'e6', source: 'two', target: 'six' },
      ];

      const result = await layoutManager.performCompleteLayout(
        nodes,
        edges,
        'root',
        'LR'
      );

      // Verify all nodes are positioned
      expect(result.nodes).toHaveLength(7);
      result.nodes.forEach(node => {
        expect(node.position).toBeDefined();
        expect(typeof node.position.x).toBe('number');
        expect(typeof node.position.y).toBe('number');
      });

      // Check critical overlaps
      const longText = result.nodes.find(n => n.id === 'long-text')!;
      const six = result.nodes.find(n => n.id === 'six')!;

      // Long text node should not overlap with six
      // Use the actual height from the result, not the hard-coded test data
      const longTextBottom =
        longText.position.y + (longText.data.height || 180);
      const sixTop = six.position.y;

      expect(sixTop).toBeGreaterThan(longTextBottom);
      expect(sixTop - longTextBottom).toBeGreaterThan(15); // Should have reasonable gap
    });

    it('should update node dimensions during layout', async () => {
      const nodes: Node<MindMapNodeData>[] = [
        {
          id: 'root',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'root',
            label: 'Root with some text',
            isRoot: true,
            level: 0,
            hasChildren: true,
            // No width/height set - should be calculated
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
            label: 'Child node with even more text that might wrap',
            isRoot: false,
            level: 1,
            hasChildren: false,
            // No width/height set - should be calculated
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

      const result = await layoutManager.performCompleteLayout(
        nodes,
        edges,
        'root',
        'LR'
      );

      // Verify dimensions were calculated
      const root = result.nodes.find(n => n.id === 'root')!;
      const child = result.nodes.find(n => n.id === 'child')!;

      expect(root.data.width).toBeDefined();
      expect(root.data.width).toBeGreaterThan(100);
      expect(root.data.height).toBeDefined();
      expect(root.data.height).toBeGreaterThan(30);

      expect(child.data.width).toBeDefined();
      expect(child.data.height).toBeDefined();
    });

    it('should handle collapsed nodes correctly', async () => {
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
            width: 120,
            height: 40,
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
            width: 150,
            height: 40,
            isCollapsed: true, // This node is collapsed
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'LR',
            colorTheme: null,
          },
        },
        {
          id: 'hidden1',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'hidden1',
            label: 'Hidden Child 1',
            isRoot: false,
            level: 2,
            hasChildren: false,
            width: 120,
            height: 40,
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'LR',
            colorTheme: null,
          },
        },
        {
          id: 'hidden2',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'hidden2',
            label: 'Hidden Child 2',
            isRoot: false,
            level: 2,
            hasChildren: false,
            width: 120,
            height: 40,
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'LR',
            colorTheme: null,
          },
        },
        {
          id: 'visible',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'visible',
            label: 'Visible Sibling',
            isRoot: false,
            level: 1,
            hasChildren: false,
            width: 140,
            height: 40,
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
        { id: 'e2', source: 'collapsed', target: 'hidden1' },
        { id: 'e3', source: 'collapsed', target: 'hidden2' },
        { id: 'e4', source: 'root', target: 'visible' },
      ];

      const result = await layoutManager.performCompleteLayout(
        nodes,
        edges,
        'root',
        'LR'
      );

      // Hidden nodes should not affect visible layout
      const collapsed = result.nodes.find(n => n.id === 'collapsed')!;
      const visible = result.nodes.find(n => n.id === 'visible')!;

      // Collapsed and visible should be laid out normally
      expect(collapsed.position).toBeDefined();
      expect(visible.position).toBeDefined();

      // Hidden nodes might have positions but shouldn't affect visible nodes
      // The gap between collapsed and visible should be normal, not accounting for hidden nodes
      const gap = Math.abs(visible.position.y - collapsed.position.y);
      expect(gap).toBeLessThan(100); // Should be close together
    });

    it('should handle different layout directions', async () => {
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
            width: 120,
            height: 40,
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
          position: { x: 0, y: 0 },
          data: {
            id: 'child1',
            label: 'Wide child with lots of horizontal text',
            isRoot: false,
            level: 1,
            hasChildren: false,
            width: 250,
            height: 40,
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
          position: { x: 0, y: 0 },
          data: {
            id: 'child2',
            label: 'Narrow',
            isRoot: false,
            level: 1,
            hasChildren: false,
            width: 80,
            height: 40,
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
        { id: 'e1', source: 'root', target: 'child1' },
        { id: 'e2', source: 'root', target: 'child2' },
      ];

      // Test TB layout
      const tbResult = await layoutManager.performCompleteLayout(
        nodes,
        edges,
        'root',
        'TB'
      );

      const tbRoot = tbResult.nodes.find(n => n.id === 'root')!;
      const tbChild1 = tbResult.nodes.find(n => n.id === 'child1')!;
      const tbChild2 = tbResult.nodes.find(n => n.id === 'child2')!;

      // Children should be below root
      expect(tbChild1.position.y).toBeGreaterThan(tbRoot.position.y);
      expect(tbChild2.position.y).toBeGreaterThan(tbRoot.position.y);

      // Children should be horizontally spaced properly
      const horizontalGap = Math.abs(tbChild2.position.x - tbChild1.position.x);
      expect(horizontalGap).toBeGreaterThan(150); // Reasonable spacing for siblings

      // Test BT layout
      const btResult = await layoutManager.performCompleteLayout(
        nodes,
        edges,
        'root',
        'BT'
      );

      const btRoot = btResult.nodes.find(n => n.id === 'root')!;
      const btChild1 = btResult.nodes.find(n => n.id === 'child1')!;

      // Children should be above root in BT
      expect(btChild1.position.y).toBeLessThan(btRoot.position.y);
    });
  });

  describe('dimension calculation', () => {
    it('should calculate dimensions for nodes without them', async () => {
      const nodes: Node<MindMapNodeData>[] = [
        {
          id: 'test',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'test',
            label: 'This is a test node with some text',
            isRoot: true,
            level: 0,
            hasChildren: false,
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'LR',
            colorTheme: null,
            // No width/height
          },
        },
      ];

      const result = await layoutManager.calculateAllNodeDimensions(nodes);

      expect(result[0].data.width).toBeDefined();
      expect(result[0].data.height).toBeDefined();
      expect(result[0].data.width).toBeGreaterThan(50);
      expect(result[0].data.height).toBeGreaterThan(20);
    });

    it('should account for icons in dimension calculation', async () => {
      const baseNode: Node<MindMapNodeData> = {
        id: 'base',
        type: 'mindMapNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'base',
          label: 'Same text',
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
      };

      const nodeWithIcons: Node<MindMapNodeData> = {
        ...baseNode,
        id: 'with-icons',
        data: {
          ...baseNode.data,
          id: 'with-icons',
          chatId: 'chat-123',
          notes: 'Some notes',
          sources: [{ id: 's1', name: 'Source', directory: '/', type: 'file' }],
        },
      };

      const [baseResult] = await layoutManager.calculateAllNodeDimensions([
        baseNode,
      ]);
      const [iconsResult] = await layoutManager.calculateAllNodeDimensions([
        nodeWithIcons,
      ]);

      // Node with icons should be wider
      expect(iconsResult.data.width).toBeGreaterThan(baseResult.data.width!);
    });
  });

  describe('error handling', () => {
    it('should handle nodes with missing data gracefully', async () => {
      const nodes: Node<MindMapNodeData>[] = [
        {
          id: 'incomplete',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'incomplete',
            label: '',
            isRoot: true,
            // Missing most required fields
          } as MindMapNodeData,
        },
      ];

      const edges: Edge[] = [];

      // Should not throw
      const result = await layoutManager.performCompleteLayout(
        nodes,
        edges,
        'incomplete',
        'LR'
      );

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].position).toBeDefined();
    });
  });
});
