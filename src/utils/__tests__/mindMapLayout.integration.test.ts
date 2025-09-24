import { describe, it, expect, beforeEach } from 'vitest';
import type { Node, Edge } from 'reactflow';
import type { MindMapNodeData } from '../../types/mindMap';
import { MindMapLayoutManager, LAYOUT_CONSTANTS } from '../mindMapLayout';

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
      expect(gap).toBeLessThan(130); // Should be close together (accounting for border)
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

      // Node with icons should have the same width (icons are positioned absolutely)
      expect(iconsResult.data.width).toEqual(baseResult.data.width!);
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

  describe('TB/BT (Top-Bottom/Bottom-Top) center-anchored layout', () => {
    it('should center nodes horizontally in TB layout', async () => {
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
          position: { x: 0, y: 0 },
          data: {
            id: 'child1',
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
          },
        },
        {
          id: 'child2',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'child2',
            label: 'Wide Child Node',
            isRoot: false,
            level: 1,
            hasChildren: false,
            width: 200,
            height: 40,
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
          position: { x: 0, y: 0 },
          data: {
            id: 'child3',
            label: 'Medium',
            isRoot: false,
            level: 1,
            hasChildren: false,
            width: 120,
            height: 40,
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
      const allNodes = [rootNode, child1, child2, child3];

      // Find tree bounds
      const minX = Math.min(...allNodes.map(n => n.position.x));
      const maxX = Math.max(
        ...allNodes.map(n => n.position.x + (n.data.width || 120))
      );
      const treeWidth = maxX - minX;
      const treeCenter = minX + treeWidth / 2;

      // Tree should be centered around 600
      expect(Math.round(treeCenter)).toBe(LAYOUT_CONSTANTS.ROOT_X);

      // Children should be positioned with recursive spacing
      // Sort children by x position to check gaps
      const sortedChildren = [child1, child2, child3].sort(
        (a, b) => a.position.x - b.position.x
      );

      // Check gaps between children
      const gap1 =
        sortedChildren[1].position.x -
        (sortedChildren[0].position.x + sortedChildren[0].data.width!);
      const gap2 =
        sortedChildren[2].position.x -
        (sortedChildren[1].position.x + sortedChildren[1].data.width!);

      expect(gap1).toBeCloseTo(80, 10); // Gap between first and second child
      expect(gap2).toBeCloseTo(80, 10); // Gap between second and third child

      // Verify vertical positioning - should account for node height + gap
      const expectedChildY =
        rootNode.position.y +
        rootNode.data.height! +
        LAYOUT_CONSTANTS.VERTICAL_LEVEL_GAP;
      expect(child1.position.y).toBe(expectedChildY);
      expect(child2.position.y).toBe(expectedChildY);
      expect(child3.position.y).toBe(expectedChildY);
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
          hasChildren: level === 0,
          width,
          height: 40,
          isCollapsed: false,
          isDragging: false,
          isDropTarget: false,
          dropPosition: null,
          layout: 'TB',
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

      // Trees should maintain center position
      const getTreeCenter = (nodes: Node<MindMapNodeData>[]) => {
        const minX = Math.min(...nodes.map(n => n.position.x));
        const maxX = Math.max(
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
      expect(gap).toBeCloseTo(80, 10);
    });

    it('should handle BT layout with proper vertical direction', async () => {
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
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'BT',
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
            level: 1,
            hasChildren: false,
            width: 120,
            height: 40,
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'BT',
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
            level: 1,
            hasChildren: false,
            width: 120,
            height: 40,
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'BT',
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
      // Dynamic spacing: root height + gap
      const expectedChildY =
        rootNode.position.y -
        rootNode.data.height! -
        LAYOUT_CONSTANTS.VERTICAL_LEVEL_GAP;
      expect(child1.position.y).toBe(expectedChildY);
      expect(child2.position.y).toBe(expectedChildY);

      // Verify horizontal layout using recursive algorithm
      const allNodes = [rootNode, child1, child2];

      // Find tree bounds
      const minX = Math.min(...allNodes.map(n => n.position.x));
      const maxX = Math.max(
        ...allNodes.map(n => n.position.x + (n.data.width || 120))
      );
      const treeWidth = maxX - minX;
      const treeCenter = minX + treeWidth / 2;

      // Tree should be centered
      expect(treeCenter).toBeCloseTo(LAYOUT_CONSTANTS.ROOT_X, 50);

      // Children should have proper gap
      const gap = child2.position.x - (child1.position.x + child1.data.width!);
      expect(gap).toBeCloseTo(80, 10);
    });

    it('should handle multi-level hierarchy with center anchoring', async () => {
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
          position: { x: 0, y: 0 },
          data: {
            id: 'child1',
            label: 'Child 1',
            isRoot: false,
            level: 1,
            hasChildren: true,
            width: 120,
            height: 40,
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
          position: { x: 0, y: 0 },
          data: {
            id: 'child2',
            label: 'Child 2',
            isRoot: false,
            level: 1,
            hasChildren: false,
            width: 120,
            height: 40,
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
          position: { x: 0, y: 0 },
          data: {
            id: 'grandchild1',
            label: 'Grandchild',
            isRoot: false,
            level: 2,
            hasChildren: false,
            width: 150,
            height: 40,
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
      ];

      const result = await layoutManager.performCompleteLayout(
        nodes,
        edges,
        'root',
        'TB'
      );

      const grandchild = result.nodes.find(n => n.id === 'grandchild1')!;

      // Grandchild should be positioned under its parent
      const child1 = result.nodes.find(n => n.id === 'child1')!;
      const grandchildCenter =
        grandchild.position.x + grandchild.data.width! / 2;
      const child1Center = child1.position.x + child1.data.width! / 2;

      // Grandchild should be centered under its parent (child1)
      expect(grandchildCenter).toBeCloseTo(child1Center, 10);
    });
  });

  describe('RL (Right-to-Left) layout', () => {
    it('should position nodes with right edge as anchor point', async () => {
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
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'RL',
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
            level: 1,
            hasChildren: false,
            width: 120,
            height: 40,
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'RL',
          },
        },
      ];

      const edges: Edge[] = [
        {
          id: 'edge-root-child1',
          source: 'root',
          target: 'child1',
          sourceHandle: 'left-source',
          targetHandle: 'right',
        },
      ];

      const result = await layoutManager.performCompleteLayout(
        nodes,
        edges,
        'root',
        'RL'
      );

      const rootNode = result.nodes.find(n => n.id === 'root')!;
      const childNode = result.nodes.find(n => n.id === 'child1')!;

      // Root node should have its right edge at ROOT_X (600)
      expect(rootNode.position.x + rootNode.data.width!).toBe(
        LAYOUT_CONSTANTS.ROOT_X
      );

      // Child node should be positioned to the left of root
      expect(childNode.position.x).toBeLessThan(rootNode.position.x);

      // Child's right edge should align with proper spacing from root's left edge
      const childRightEdge = childNode.position.x + childNode.data.width!;
      expect(childRightEdge).toBeLessThan(rootNode.position.x);
    });

    it('should maintain right edge position when node width changes', async () => {
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
          hasChildren: level === 0,
          width,
          height: 40,
          isCollapsed: false,
          isDragging: false,
          isDropTarget: false,
          dropPosition: null,
          layout: 'RL',
        },
      });

      // Initial layout with short text
      const nodesShort = [
        createNode('root', 'Root', 80, 0),
        createNode('child', 'Child', 100, 1),
      ];

      const edges: Edge[] = [
        {
          id: 'edge',
          source: 'root',
          target: 'child',
          sourceHandle: 'left-source',
          targetHandle: 'right',
        },
      ];

      const resultShort = await layoutManager.performCompleteLayout(
        nodesShort,
        edges,
        'root',
        'RL'
      );

      // Layout with expanded text (wider nodes)
      const nodesWide = [
        createNode('root', 'Root with much longer text', 200, 0),
        createNode('child', 'Child node with expanded content', 250, 1),
      ];

      const resultWide = await layoutManager.performCompleteLayout(
        nodesWide,
        edges,
        'root',
        'RL'
      );

      const rootShort = resultShort.nodes.find(n => n.id === 'root')!;
      const rootWide = resultWide.nodes.find(n => n.id === 'root')!;
      const childWide = resultWide.nodes.find(n => n.id === 'child')!;

      // Right edges should remain at the same position
      const rootRightEdgeShort = rootShort.position.x + rootShort.data.width!;
      const rootRightEdgeWide = rootWide.position.x + rootWide.data.width!;
      expect(rootRightEdgeWide).toBe(rootRightEdgeShort);

      // Child nodes should maintain relative positioning from parent's left edge
      const parentChildGapWide =
        rootWide.position.x - (childWide.position.x + childWide.data.width!);

      // The gap changes because the spacing calculation is based on parent width
      // In RL mode, this is expected behavior as children position depends on parent width
      // So we just verify the gap is reasonable (positive and not too large)
      expect(parentChildGapWide).toBeGreaterThan(0);
      expect(parentChildGapWide).toBeLessThan(200);
    });

    it('should handle multi-level hierarchy in RL mode', async () => {
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
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'RL',
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
            level: 1,
            hasChildren: true,
            width: 120,
            height: 40,
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'RL',
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
            level: 2,
            hasChildren: false,
            width: 150,
            height: 40,
            isCollapsed: false,
            isDragging: false,
            isDropTarget: false,
            dropPosition: null,
            layout: 'RL',
          },
        },
      ];

      const edges: Edge[] = [
        {
          id: 'edge1',
          source: 'root',
          target: 'child1',
          sourceHandle: 'left-source',
          targetHandle: 'right',
        },
        {
          id: 'edge2',
          source: 'child1',
          target: 'grandchild1',
          sourceHandle: 'left-source',
          targetHandle: 'right',
        },
      ];

      const result = await layoutManager.performCompleteLayout(
        nodes,
        edges,
        'root',
        'RL'
      );

      const rootNode = result.nodes.find(n => n.id === 'root')!;
      const childNode = result.nodes.find(n => n.id === 'child1')!;
      const grandchildNode = result.nodes.find(n => n.id === 'grandchild1')!;

      // Verify hierarchy: grandchild < child < root (x positions)
      expect(grandchildNode.position.x).toBeLessThan(childNode.position.x);
      expect(childNode.position.x).toBeLessThan(rootNode.position.x);

      // Verify right-edge anchoring
      expect(rootNode.position.x + rootNode.data.width!).toBe(
        LAYOUT_CONSTANTS.ROOT_X
      );
    });
  });
});
