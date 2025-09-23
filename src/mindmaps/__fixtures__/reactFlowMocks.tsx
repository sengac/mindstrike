import React from 'react';
import { vi } from 'vitest';

// Mock ReactFlow hooks
export const mockUseReactFlow = vi.fn(() => ({
  getNodes: vi.fn(() => []),
  getEdges: vi.fn(() => []),
  setNodes: vi.fn(),
  setEdges: vi.fn(),
  addNodes: vi.fn(),
  addEdges: vi.fn(),
  deleteElements: vi.fn(),
  fitView: vi.fn(),
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  zoomTo: vi.fn(),
  getZoom: vi.fn(() => 1),
  setViewport: vi.fn(),
  getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
  screenToFlowPosition: vi.fn((position: { x: number; y: number }) => position),
  flowToScreenPosition: vi.fn((position: { x: number; y: number }) => position),
  project: vi.fn((position: { x: number; y: number }) => position),
}));

export const mockUseNodesState = vi.fn(() => [
  [], // nodes
  vi.fn(), // setNodes
  vi.fn(), // onNodesChange
]);

export const mockUseEdgesState = vi.fn(() => [
  [], // edges
  vi.fn(), // setEdges
  vi.fn(), // onEdgesChange
]);

export const mockUseNodesInitialized = vi.fn(() => true);

// Mock ReactFlow components
export const MockReactFlow = vi.fn(({ children, ...props }) => (
  <div data-testid="react-flow" {...props}>
    {children}
  </div>
));

export const MockBackground = vi.fn(props => (
  <div data-testid="react-flow-background" {...props} />
));

export const MockControls = vi.fn(props => (
  <div data-testid="react-flow-controls" {...props} />
));

export const MockMiniMap = vi.fn(props => (
  <div data-testid="react-flow-minimap" {...props} />
));

export const MockHandle = vi.fn(
  ({
    type,
    position,
    id,
    style,
    ...props
  }: {
    type: string;
    position: string;
    id: string;
    style?: React.CSSProperties;
    [key: string]: unknown;
  }) => (
    <div
      data-testid={`react-flow-handle-${type}-${position}-${id}`}
      style={style}
      {...props}
    />
  )
);

// Mock ReactFlow utilities
export const MockPosition = {
  Left: 'left',
  Right: 'right',
  Top: 'top',
  Bottom: 'bottom',
};

export const mockGetLayoutedElements = vi.fn(
  (nodes: unknown[], edges: unknown[]) => ({
    nodes,
    edges,
  })
);

// Mock drag and drop handlers
export const mockOnDragOver = vi.fn((event: React.DragEvent) => {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
});

export const mockOnDrop = vi.fn((event: React.DragEvent) => {
  event.preventDefault();
});

export const mockOnNodeDrag = vi.fn();
export const mockOnNodeDragStart = vi.fn();
export const mockOnNodeDragStop = vi.fn();

export const mockOnNodesChange = vi.fn();
export const mockOnEdgesChange = vi.fn();
export const mockOnConnect = vi.fn();

// Mock node change types
export const mockNodeChanges = {
  position: {
    id: 'node-1',
    type: 'position',
    position: { x: 100, y: 100 },
  },
  select: {
    id: 'node-1',
    type: 'select',
    selected: true,
  },
  remove: {
    id: 'node-1',
    type: 'remove',
  },
};

// Helper to create node props for testing
export const createMockNodeProps = (overrides = {}) => ({
  id: 'test-node',
  type: 'mindMapNode',
  data: {
    id: 'test-node',
    label: 'Test Node',
    isRoot: false,
    level: 1,
    hasChildren: false,
    isCollapsed: false,
    isDragging: false,
    isDropTarget: false,
    dropPosition: null,
    layout: 'LR' as const,
    width: 150,
    customColors: null,
  },
  position: { x: 0, y: 0 },
  selected: false,
  dragging: false,
  xPos: 0,
  yPos: 0,
  zIndex: 1,
  isConnectable: true,
  ...overrides,
});

// Mock event objects for testing
export const createMockMouseEvent = (overrides = {}) => ({
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
  button: 0,
  detail: 1,
  clientX: 100,
  clientY: 100,
  currentTarget: {
    getBoundingClientRect: vi.fn(() => ({
      left: 0,
      top: 0,
      width: 100,
      height: 50,
    })),
  },
  ...overrides,
});

export const createMockPointerEvent = (overrides = {}) => ({
  ...createMockMouseEvent(),
  pointerType: 'mouse',
  pressure: 0.5,
  ...overrides,
});

export const createMockKeyboardEvent = (key: string, overrides = {}) => ({
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
  key,
  code: `Key${key.toUpperCase()}`,
  ...overrides,
});

// Mock context menu event
export const createMockContextMenuEvent = (overrides = {}) => ({
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
  clientX: 150,
  clientY: 200,
  button: 2,
  ...overrides,
});

// Reset function for ReactFlow mocks
export const resetReactFlowMocks = () => {
  vi.clearAllMocks();

  mockUseReactFlow.mockReturnValue({
    getNodes: vi.fn(() => []),
    getEdges: vi.fn(() => []),
    setNodes: vi.fn(),
    setEdges: vi.fn(),
    addNodes: vi.fn(),
    addEdges: vi.fn(),
    deleteElements: vi.fn(),
    fitView: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    zoomTo: vi.fn(),
    getZoom: vi.fn(() => 1),
    setViewport: vi.fn(),
    getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
    screenToFlowPosition: vi.fn(
      (position: { x: number; y: number }) => position
    ),
    flowToScreenPosition: vi.fn(
      (position: { x: number; y: number }) => position
    ),
    project: vi.fn((position: { x: number; y: number }) => position),
  });

  mockUseNodesState.mockReturnValue([[], vi.fn(), vi.fn()]);

  mockUseEdgesState.mockReturnValue([[], vi.fn(), vi.fn()]);
};
