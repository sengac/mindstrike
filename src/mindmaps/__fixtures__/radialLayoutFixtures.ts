import type { MindMapData } from '../../utils/mindMapData';
import type { Node, Edge } from 'reactflow';
import type { MindMapNodeData } from '../types/mindMap';

/**
 * Basic radial mindmap with 4 direct children
 */
export const basicRadialMindMap: MindMapData = {
  root: {
    id: 'root',
    text: 'Central Idea',
    layout: 'graph-radial',
    children: [
      { id: 'child1', text: 'First Child (Right)' },
      { id: 'child2', text: 'Second Child (Left)' },
      { id: 'child3', text: 'Third Child (Right)' },
      { id: 'child4', text: 'Fourth Child (Left)' },
    ],
  },
};

/**
 * Multi-level radial mindmap with grandchildren
 */
export const multiLevelRadialMindMap: MindMapData = {
  root: {
    id: 'root',
    text: 'Central Idea',
    layout: 'graph-radial',
    children: [
      {
        id: 'child1',
        text: 'First Child (Right)',
        children: [
          { id: 'gc1', text: 'Grandchild 1-1' },
          { id: 'gc2', text: 'Grandchild 1-2' },
        ],
      },
      {
        id: 'child2',
        text: 'Second Child (Left)',
        children: [
          { id: 'gc3', text: 'Grandchild 2-1' },
          {
            id: 'gc4',
            text: 'Grandchild 2-2',
            children: [{ id: 'ggc1', text: 'Great-grandchild' }],
          },
        ],
      },
      { id: 'child3', text: 'Third Child (Right)' },
      {
        id: 'child4',
        text: 'Fourth Child (Left)',
        children: [{ id: 'gc5', text: 'Grandchild 4-1' }],
      },
    ],
  },
};

/**
 * Unbalanced radial mindmap with more nodes on one side
 */
export const unbalancedRadialMindMap: MindMapData = {
  root: {
    id: 'root',
    text: 'Central Topic',
    layout: 'graph-radial',
    children: [
      {
        id: 'right1',
        text: 'Major Branch (Right)',
        children: [
          { id: 'r1c1', text: 'Sub-topic 1' },
          { id: 'r1c2', text: 'Sub-topic 2' },
          { id: 'r1c3', text: 'Sub-topic 3' },
          { id: 'r1c4', text: 'Sub-topic 4' },
          { id: 'r1c5', text: 'Sub-topic 5' },
        ],
      },
      {
        id: 'left1',
        text: 'Minor Branch (Left)',
        children: [{ id: 'l1c1', text: 'Single sub-topic' }],
      },
    ],
  },
};

/**
 * Helper to create nodes for radial layout testing
 */
export function createRadialTestNodes(): {
  nodes: Node<MindMapNodeData>[];
  edges: Edge[];
} {
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
        label: 'Child 1 (Right)',
        isRoot: false,
        parentId: 'root',
        level: 1,
        hasChildren: false,
        width: 150,
        height: 40,
      },
    },
    {
      id: 'child2',
      type: 'mindMapNode',
      position: { x: 0, y: 0 },
      data: {
        id: 'child2',
        label: 'Child 2 (Left)',
        isRoot: false,
        parentId: 'root',
        level: 1,
        hasChildren: false,
        width: 140,
        height: 40,
      },
    },
    {
      id: 'child3',
      type: 'mindMapNode',
      position: { x: 0, y: 0 },
      data: {
        id: 'child3',
        label: 'Child 3 (Right)',
        isRoot: false,
        parentId: 'root',
        level: 1,
        hasChildren: false,
        width: 150,
        height: 40,
      },
    },
  ];

  const edges: Edge[] = [
    {
      id: 'edge-root-child1',
      source: 'root',
      target: 'child1',
      sourceHandle: 'right-source',
      targetHandle: 'left',
      type: 'default',
    },
    {
      id: 'edge-root-child2',
      source: 'root',
      target: 'child2',
      sourceHandle: 'left-source',
      targetHandle: 'right',
      type: 'default',
    },
    {
      id: 'edge-root-child3',
      source: 'root',
      target: 'child3',
      sourceHandle: 'right-source',
      targetHandle: 'left',
      type: 'default',
    },
  ];

  return { nodes, edges };
}

/**
 * Helper to create a complex radial test scenario
 */
export function createComplexRadialTestNodes(): {
  nodes: Node<MindMapNodeData>[];
  edges: Edge[];
} {
  const nodes: Node<MindMapNodeData>[] = [
    {
      id: 'root',
      type: 'mindMapNode',
      position: { x: 0, y: 0 },
      data: {
        id: 'root',
        label: 'Central Topic',
        isRoot: true,
        level: 0,
        hasChildren: true,
        width: 120,
        height: 40,
      },
    },
  ];

  const edges: Edge[] = [];

  // Create 6 direct children
  for (let i = 0; i < 6; i++) {
    const childId = `child${i + 1}`;
    const isRight = i % 2 === 0; // Even indices go right, odd go left

    nodes.push({
      id: childId,
      type: 'mindMapNode',
      position: { x: 0, y: 0 },
      data: {
        id: childId,
        label: `Child ${i + 1} (${isRight ? 'Right' : 'Left'})`,
        isRoot: false,
        parentId: 'root',
        level: 1,
        hasChildren: i < 3, // First 3 children have grandchildren
        width: 140,
        height: 40,
      },
    });

    edges.push({
      id: `edge-root-${childId}`,
      source: 'root',
      target: childId,
      sourceHandle: isRight ? 'right-source' : 'left-source',
      targetHandle: isRight ? 'left' : 'right',
      type: 'default',
    });

    // Add grandchildren for first 3 children
    if (i < 3) {
      for (let j = 0; j < 2; j++) {
        const grandchildId = `gc${i + 1}-${j + 1}`;

        nodes.push({
          id: grandchildId,
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: grandchildId,
            label: `Grandchild ${i + 1}-${j + 1}`,
            isRoot: false,
            parentId: childId,
            level: 2,
            hasChildren: false,
            width: 160,
            height: 40,
          },
        });

        edges.push({
          id: `edge-${childId}-${grandchildId}`,
          source: childId,
          target: grandchildId,
          sourceHandle: isRight ? 'right-source' : 'left-source',
          targetHandle: isRight ? 'left' : 'right',
          type: 'default',
        });
      }
    }
  }

  return { nodes, edges };
}

/**
 * Radial mindmap with collapsed nodes
 */
export const collapsedRadialMindMap: MindMapData = {
  root: {
    id: 'root',
    text: 'Main Topic',
    layout: 'graph-radial',
    children: [
      {
        id: 'expanded1',
        text: 'Expanded Branch (Right)',
        children: [
          { id: 'e1c1', text: 'Visible Child 1' },
          { id: 'e1c2', text: 'Visible Child 2' },
        ],
      },
      {
        id: 'collapsed1',
        text: 'Collapsed Branch (Left)',
        isCollapsed: true,
        children: [
          { id: 'c1c1', text: 'Hidden Child 1' },
          { id: 'c1c2', text: 'Hidden Child 2' },
          { id: 'c1c3', text: 'Hidden Child 3' },
        ],
      },
      {
        id: 'expanded2',
        text: 'Another Expanded (Right)',
        children: [{ id: 'e2c1', text: 'Visible Child' }],
      },
    ],
  },
};

/**
 * Radial mindmap with notes and sources
 */
export const annotatedRadialMindMap: MindMapData = {
  root: {
    id: 'root',
    text: 'Research Topic',
    layout: 'graph-radial',
    notes: 'Main research question and overview',
    sources: [
      {
        id: 's1',
        name: 'main-paper.pdf',
        directory: '/research',
        type: 'file',
      },
    ],
    children: [
      {
        id: 'finding1',
        text: 'Key Finding 1 (Right)',
        notes: 'This finding is supported by multiple studies',
        sources: [
          {
            id: 's2',
            name: 'study1.pdf',
            directory: '/research/papers',
            type: 'file',
          },
          {
            id: 's3',
            name: 'study2.pdf',
            directory: '/research/papers',
            type: 'file',
          },
        ],
      },
      {
        id: 'finding2',
        text: 'Key Finding 2 (Left)',
        notes: 'Contradictory evidence exists',
        chatId: 'chat-123',
      },
    ],
  },
};

/**
 * Helper to verify radial layout positioning
 */
export function verifyRadialLayout(
  nodes: Node<MindMapNodeData>[],
  rootId: string
): {
  leftNodes: string[];
  rightNodes: string[];
  errors: string[];
} {
  const root = nodes.find(n => n.id === rootId);
  if (!root) {
    return { leftNodes: [], rightNodes: [], errors: ['Root node not found'] };
  }

  const leftNodes: string[] = [];
  const rightNodes: string[] = [];
  const errors: string[] = [];

  // Group direct children by their position relative to root
  const directChildren = nodes.filter(n => n.data.parentId === rootId);

  directChildren.forEach((child, index) => {
    const expectedSide = index % 2 === 0 ? 'right' : 'left';
    const rootCenterX = root.position.x + (root.data.width || 100) / 2;
    const childCenterX = child.position.x + (child.data.width || 120) / 2;

    if (expectedSide === 'right') {
      if (childCenterX > rootCenterX) {
        rightNodes.push(child.id);
      } else {
        errors.push(
          `Child ${child.id} (index ${index}) should be on right but is on left`
        );
      }
    } else {
      if (childCenterX < rootCenterX) {
        leftNodes.push(child.id);
      } else {
        errors.push(
          `Child ${child.id} (index ${index}) should be on left but is on right`
        );
      }
    }
  });

  return { leftNodes, rightNodes, errors };
}
