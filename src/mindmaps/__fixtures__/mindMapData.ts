import type { Node, Edge } from 'reactflow';
import type { MindMapNodeData, Source } from '../types/mindMap';

// Sample sources for test nodes
export const mockSources: Source[] = [
  {
    id: 'src-1',
    name: 'Research Document',
    directory: '/docs/research',
    type: 'document',
    title: 'AI Research Paper',
    url: 'https://example.com/research.pdf',
    text: 'This document contains research on AI applications.',
  },
  {
    id: 'src-2',
    name: 'Web Reference',
    directory: '/web/refs',
    type: 'url',
    title: 'OpenAI Documentation',
    url: 'https://docs.openai.com',
    text: 'Official OpenAI API documentation.',
  },
  {
    id: 'src-3',
    name: 'Code File',
    directory: '/src/components',
    type: 'file',
    title: 'React Component',
    text: 'Component source code for mind map.',
  },
];

// Sample mind map node data
export const mockNodeData: Record<string, MindMapNodeData> = {
  root: {
    id: 'root-node',
    label: 'Root Topic',
    isRoot: true,
    notes: 'This is the main topic of our mind map',
    sources: [mockSources[0]],
    chatId: 'chat-123',
    level: 0,
    hasChildren: true,
    isCollapsed: false,
    isDragging: false,
    isDropTarget: false,
    dropPosition: null,
    layout: 'LR',
    width: 200,
    colorTheme: null,
  },
  child1: {
    id: 'child-1',
    label: 'First Child',
    isRoot: false,
    parentId: 'root-node',
    notes: 'Notes for first child node',
    sources: [mockSources[1]],
    chatId: 'chat-456',
    level: 1,
    hasChildren: true,
    isCollapsed: false,
    isDragging: false,
    isDropTarget: false,
    dropPosition: null,
    layout: 'LR',
    width: 150,
    colorTheme: 'blue',
  },
  child2: {
    id: 'child-2',
    label: 'Second Child',
    isRoot: false,
    parentId: 'root-node',
    notes: null,
    sources: [],
    chatId: null,
    level: 1,
    hasChildren: false,
    isCollapsed: false,
    isDragging: false,
    isDropTarget: false,
    dropPosition: null,
    layout: 'LR',
    width: 130,
    colorTheme: null,
  },
  grandchild: {
    id: 'grandchild-1',
    label: 'Grandchild Node',
    isRoot: false,
    parentId: 'child-1',
    notes: 'Deeply nested node for testing',
    sources: [mockSources[2]],
    chatId: null,
    level: 2,
    hasChildren: false,
    isCollapsed: false,
    isDragging: false,
    isDropTarget: false,
    dropPosition: null,
    layout: 'LR',
    width: 160,
    colorTheme: null,
  },
};

// Sample nodes for ReactFlow
export const mockNodes: Node<MindMapNodeData>[] = [
  {
    id: 'root-node',
    type: 'mindMapNode',
    position: { x: 0, y: 0 },
    data: mockNodeData.root,
    selected: false,
  },
  {
    id: 'child-1',
    type: 'mindMapNode',
    position: { x: 250, y: -50 },
    data: mockNodeData.child1,
    selected: false,
  },
  {
    id: 'child-2',
    type: 'mindMapNode',
    position: { x: 250, y: 50 },
    data: mockNodeData.child2,
    selected: false,
  },
  {
    id: 'grandchild-1',
    type: 'mindMapNode',
    position: { x: 450, y: -50 },
    data: mockNodeData.grandchild,
    selected: false,
  },
];

// Sample edges for ReactFlow
export const mockEdges: Edge[] = [
  {
    id: 'edge-root-child1',
    source: 'root-node',
    target: 'child-1',
    type: 'smoothstep',
    sourceHandle: 'right-source',
    targetHandle: 'left',
  },
  {
    id: 'edge-root-child2',
    source: 'root-node',
    target: 'child-2',
    type: 'smoothstep',
    sourceHandle: 'right-source',
    targetHandle: 'left',
  },
  {
    id: 'edge-child1-grandchild',
    source: 'child-1',
    target: 'grandchild-1',
    type: 'smoothstep',
    sourceHandle: 'right-source',
    targetHandle: 'left',
  },
];

// Complete mind map data structure
export const mockMindMapData = {
  nodes: mockNodes,
  edges: mockEdges,
  rootNodeId: 'root-node',
  layout: 'LR' as const,
  root: {
    id: 'root-node',
    text: 'Root Topic',
    notes: 'This is the main topic of our mind map',
    chatId: 'chat-123',
    layout: 'graph-left' as const,
    children: [
      {
        id: 'child-1',
        text: 'Child 1',
        notes: null,
        side: 'right' as const,
        children: [
          {
            id: 'grandchild-1',
            text: 'Grandchild 1',
            notes: null,
            children: [],
          },
        ],
      },
      {
        id: 'child-2',
        text: 'Child 2',
        notes: null,
        side: 'left' as const,
        children: [],
      },
    ],
  },
};

// Different layout variations for testing
export const mockMindMapLayouts = {
  LR: {
    ...mockMindMapData,
    layout: 'LR' as const,
  },
  RL: {
    ...mockMindMapData,
    layout: 'RL' as const,
    nodes: mockNodes.map(node => ({
      ...node,
      data: { ...node.data, layout: 'RL' as const },
    })),
  },
  TB: {
    ...mockMindMapData,
    layout: 'TB' as const,
    nodes: mockNodes.map(node => ({
      ...node,
      data: { ...node.data, layout: 'TB' as const },
      position: { x: node.position.y, y: node.position.x },
    })),
  },
  BT: {
    ...mockMindMapData,
    layout: 'BT' as const,
    nodes: mockNodes.map(node => ({
      ...node,
      data: { ...node.data, layout: 'BT' as const },
      position: { x: node.position.y, y: -node.position.x },
    })),
  },
};

// Drag and drop states for testing
export const mockDragStates = {
  draggingNode: {
    ...mockNodeData.child1,
    isDragging: true,
  },
  dropTargetAbove: {
    ...mockNodeData.child2,
    isDropTarget: true,
    dropPosition: 'above' as const,
  },
  dropTargetBelow: {
    ...mockNodeData.child2,
    isDropTarget: true,
    dropPosition: 'below' as const,
  },
  dropTargetOver: {
    ...mockNodeData.child2,
    isDropTarget: true,
    dropPosition: 'over' as const,
  },
};

// Editing states for testing
export const mockEditingStates = {
  editingNode: {
    ...mockNodeData.child1,
    isEditing: true,
  },
  collapsedNode: {
    ...mockNodeData.child1,
    isCollapsed: true,
  },
};
