import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMindMapLayout } from '../useMindMapLayout';
import type { Node, Edge } from 'reactflow';
import type { MindMapNodeData } from '../../types/mindMap';
import { mockNodes, mockEdges } from '../../__fixtures__/mindMapData';

// Store original createElement
const originalCreateElement = document.createElement.bind(document);

// Create a reusable mock context
const mockCanvasContext = {
  font: '',
  measureText: vi.fn(() => ({ width: 100 })),
};

// Mock document.createElement for canvas width calculation
const mockCanvas = {
  getContext: vi.fn(() => mockCanvasContext),
};

// Mock DOM methods
Object.defineProperty(document, 'createElement', {
  writable: true,
  value: vi.fn((tagName: string) => {
    if (tagName === 'canvas') {
      return mockCanvas;
    }
    return originalCreateElement(tagName);
  }),
});

describe('useMindMapLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getVisibleNodes', () => {
    it('should return all nodes when none are collapsed', () => {
      const { result } = renderHook(() => useMindMapLayout());

      const visibleNodes = result.current.getVisibleNodes(mockNodes, mockEdges);

      expect(visibleNodes).toHaveLength(mockNodes.length);
      expect(visibleNodes).toEqual(mockNodes);
    });

    it('should hide descendants of collapsed nodes', () => {
      const { result } = renderHook(() => useMindMapLayout());

      // Create nodes with child-1 collapsed
      const nodesWithCollapsed = mockNodes.map(node =>
        node.id === 'child-1'
          ? { ...node, data: { ...node.data, isCollapsed: true } }
          : node
      );

      const visibleNodes = result.current.getVisibleNodes(
        nodesWithCollapsed,
        mockEdges
      );

      // Should exclude grandchild-1 since child-1 is collapsed
      expect(visibleNodes).toHaveLength(3); // root, child-1, child-2
      expect(
        visibleNodes.find(node => node.id === 'grandchild-1')
      ).toBeUndefined();
      expect(visibleNodes.find(node => node.id === 'child-1')).toBeDefined(); // Collapsed node itself is visible
    });

    it('should handle multiple collapsed nodes', () => {
      const { result } = renderHook(() => useMindMapLayout());

      // Create nodes with both child nodes collapsed
      const nodesWithCollapsed = mockNodes.map(node =>
        node.id === 'child-1' || node.id === 'child-2'
          ? { ...node, data: { ...node.data, isCollapsed: true } }
          : node
      );

      const visibleNodes = result.current.getVisibleNodes(
        nodesWithCollapsed,
        mockEdges
      );

      // Should only show root and direct children (child-1, child-2)
      expect(visibleNodes).toHaveLength(3);
      expect(
        visibleNodes.find(node => node.id === 'grandchild-1')
      ).toBeUndefined();
    });

    it('should handle empty nodes array', () => {
      const { result } = renderHook(() => useMindMapLayout());

      const visibleNodes = result.current.getVisibleNodes([], []);

      expect(visibleNodes).toEqual([]);
    });
  });

  describe('getVisibleEdges', () => {
    it('should return all edges when no nodes are collapsed', () => {
      const { result } = renderHook(() => useMindMapLayout());

      const visibleEdges = result.current.getVisibleEdges(mockNodes, mockEdges);

      expect(visibleEdges).toEqual(mockEdges);
    });

    it('should hide edges to descendants of collapsed nodes', () => {
      const { result } = renderHook(() => useMindMapLayout());

      // Create nodes with child-1 collapsed
      const nodesWithCollapsed = mockNodes.map(node =>
        node.id === 'child-1'
          ? { ...node, data: { ...node.data, isCollapsed: true } }
          : node
      );

      const visibleEdges = result.current.getVisibleEdges(
        nodesWithCollapsed,
        mockEdges
      );

      // Should exclude edge to grandchild-1
      const edgeToGrandchild = mockEdges.find(
        edge => edge.target === 'grandchild-1'
      );
      expect(edgeToGrandchild).toBeDefined(); // Should exist in original
      expect(
        visibleEdges.find(edge => edge.target === 'grandchild-1')
      ).toBeUndefined(); // Should be hidden
    });

    it('should handle empty edges array', () => {
      const { result } = renderHook(() => useMindMapLayout());

      const visibleEdges = result.current.getVisibleEdges(mockNodes, []);

      expect(visibleEdges).toEqual([]);
    });
  });

  describe('updateNodeLevels', () => {
    it('should assign correct levels using BFS', () => {
      const { result } = renderHook(() => useMindMapLayout());

      const updatedNodes = result.current.updateNodeLevels(
        mockNodes,
        mockEdges,
        'root-node',
        'LR'
      );

      // Check levels
      const rootNode = updatedNodes.find(node => node.id === 'root-node');
      const child1 = updatedNodes.find(node => node.id === 'child-1');
      const child2 = updatedNodes.find(node => node.id === 'child-2');
      const grandchild = updatedNodes.find(node => node.id === 'grandchild-1');

      expect(rootNode?.data.level).toBe(0);
      expect(child1?.data.level).toBe(1);
      expect(child2?.data.level).toBe(1);
      expect(grandchild?.data.level).toBe(2);
    });

    it('should mark root node correctly', () => {
      const { result } = renderHook(() => useMindMapLayout());

      const updatedNodes = result.current.updateNodeLevels(
        mockNodes,
        mockEdges,
        'root-node',
        'LR'
      );

      const rootNode = updatedNodes.find(node => node.id === 'root-node');
      const childNode = updatedNodes.find(node => node.id === 'child-1');

      expect(rootNode?.data.isRoot).toBe(true);
      expect(childNode?.data.isRoot).toBe(false);
    });

    it('should identify nodes with children', () => {
      const { result } = renderHook(() => useMindMapLayout());

      const updatedNodes = result.current.updateNodeLevels(
        mockNodes,
        mockEdges,
        'root-node',
        'LR'
      );

      const rootNode = updatedNodes.find(node => node.id === 'root-node');
      const child1 = updatedNodes.find(node => node.id === 'child-1');
      const child2 = updatedNodes.find(node => node.id === 'child-2');
      const grandchild = updatedNodes.find(node => node.id === 'grandchild-1');

      expect(rootNode?.data.hasChildren).toBe(true);
      expect(child1?.data.hasChildren).toBe(true);
      expect(child2?.data.hasChildren).toBe(false);
      expect(grandchild?.data.hasChildren).toBe(false);
    });

    it('should set layout on all nodes', () => {
      const { result } = renderHook(() => useMindMapLayout());

      const updatedNodes = result.current.updateNodeLevels(
        mockNodes,
        mockEdges,
        'root-node',
        'TB'
      );

      updatedNodes.forEach(node => {
        expect(node.data.layout).toBe('TB');
      });
    });

    it('should handle disconnected nodes', () => {
      const { result } = renderHook(() => useMindMapLayout());

      // Add a disconnected node
      const nodesWithDisconnected = [
        ...mockNodes,
        {
          id: 'disconnected',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'disconnected',
            label: 'Disconnected',
            isRoot: false,
            level: 0,
          } as MindMapNodeData,
        } as Node<MindMapNodeData>,
      ];

      const updatedNodes = result.current.updateNodeLevels(
        nodesWithDisconnected,
        mockEdges,
        'root-node',
        'LR'
      );

      const disconnectedNode = updatedNodes.find(
        node => node.id === 'disconnected'
      );
      expect(disconnectedNode?.data.level).toBe(0); // Should default to 0
    });
  });

  describe('calculateNodeWidth', () => {
    it('should calculate width based on text length', () => {
      const { result } = renderHook(() => useMindMapLayout());

      const width = result.current.calculateNodeWidth('Test Text');

      expect(width).toBeGreaterThan(120); // Minimum width
      expect(width).toBeLessThanOrEqual(800); // Maximum width
    });

    it('should respect minimum width', () => {
      const { result } = renderHook(() => useMindMapLayout());

      // Mock very narrow text
      vi.mocked(mockCanvasContext.measureText).mockReturnValue({
        width: 10,
      } as TextMetrics);

      const width = result.current.calculateNodeWidth('A');

      // Verify mock was called
      expect(mockCanvasContext.measureText).toHaveBeenCalledWith('A');
      expect(width).toBe(120); // Should use minimum width
    });

    it('should respect maximum width', () => {
      const { result } = renderHook(() => useMindMapLayout());

      // Mock very wide text
      vi.mocked(mockCanvasContext.measureText).mockReturnValue({
        width: 1000,
      } as TextMetrics);

      const width = result.current.calculateNodeWidth(
        'Very long text that should be clamped'
      );

      expect(width).toBe(800); // Should use maximum width
    });

    it('should handle missing canvas context', () => {
      const { result } = renderHook(() => useMindMapLayout());

      // Mock canvas without context
      const mockCanvasNoContext = originalCreateElement('canvas');
      Object.defineProperty(mockCanvasNoContext, 'getContext', {
        value: vi.fn(() => null),
        writable: true,
      });
      document.createElement = vi.fn((tagName: string) => {
        if (tagName === 'canvas') {
          return mockCanvasNoContext;
        }
        return originalCreateElement(tagName);
      });

      const width = result.current.calculateNodeWidth('Test');

      expect(width).toBe(120); // Should fallback to default
    });
  });

  describe('arrangeNodes', () => {
    it('should arrange nodes in LR layout', () => {
      const { result } = renderHook(() => useMindMapLayout());

      const arrangedNodes = result.current.arrangeNodes(
        mockNodes,
        mockEdges,
        'root-node',
        'LR'
      );

      // Check that positions are set
      arrangedNodes.forEach(node => {
        expect(node.position.x).toBeDefined();
        expect(node.position.y).toBeDefined();
      });

      // Root should be at base position
      const rootNode = arrangedNodes.find(node => node.id === 'root-node');
      expect(rootNode?.position.x).toBe(600); // ROOT_X

      // Children should be positioned to the right of root
      const child1 = arrangedNodes.find(node => node.id === 'child-1');
      const child2 = arrangedNodes.find(node => node.id === 'child-2');

      expect(child1?.position.x).toBeGreaterThan(rootNode!.position.x);
      expect(child2?.position.x).toBeGreaterThan(rootNode!.position.x);
    });

    it('should arrange nodes in RL layout', () => {
      const { result } = renderHook(() => useMindMapLayout());

      const arrangedNodes = result.current.arrangeNodes(
        mockNodes,
        mockEdges,
        'root-node',
        'RL'
      );

      const rootNode = arrangedNodes.find(node => node.id === 'root-node');
      const child1 = arrangedNodes.find(node => node.id === 'child-1');

      // Children should be positioned to the left of root in RL layout
      expect(child1?.position.x).toBeLessThan(rootNode!.position.x);
    });

    it('should arrange nodes in TB layout', () => {
      const { result } = renderHook(() => useMindMapLayout());

      const arrangedNodes = result.current.arrangeNodes(
        mockNodes,
        mockEdges,
        'root-node',
        'TB'
      );

      const rootNode = arrangedNodes.find(node => node.id === 'root-node');
      const child1 = arrangedNodes.find(node => node.id === 'child-1');

      // Children should be positioned below root in TB layout
      expect(child1?.position.y).toBeGreaterThan(rootNode!.position.y);
    });

    it('should arrange nodes in BT layout', () => {
      const { result } = renderHook(() => useMindMapLayout());

      const arrangedNodes = result.current.arrangeNodes(
        mockNodes,
        mockEdges,
        'root-node',
        'BT'
      );

      const rootNode = arrangedNodes.find(node => node.id === 'root-node');
      const child1 = arrangedNodes.find(node => node.id === 'child-1');

      // Children should be positioned above root in BT layout
      expect(child1?.position.y).toBeLessThan(rootNode!.position.y);
    });

    it('should handle missing root node', () => {
      const { result } = renderHook(() => useMindMapLayout());

      const arrangedNodes = result.current.arrangeNodes(
        mockNodes,
        mockEdges,
        'non-existent-root',
        'LR'
      );

      // Should return original nodes unchanged
      expect(arrangedNodes).toEqual(mockNodes);
    });

    it('should preserve node order in children', () => {
      const { result } = renderHook(() => useMindMapLayout());

      // Create nodes with specific order
      const orderedNodes = [...mockNodes];
      const arrangedNodes = result.current.arrangeNodes(
        orderedNodes,
        mockEdges,
        'root-node',
        'LR'
      );

      // Check that child nodes maintain their relative positions
      const child1 = arrangedNodes.find(node => node.id === 'child-1');
      const child2 = arrangedNodes.find(node => node.id === 'child-2');

      expect(child1?.position).toBeDefined();
      expect(child2?.position).toBeDefined();
    });

    it('should handle collapsed nodes correctly', () => {
      const { result } = renderHook(() => useMindMapLayout());

      // Create nodes with child-1 collapsed
      const nodesWithCollapsed = mockNodes.map(node =>
        node.id === 'child-1'
          ? { ...node, data: { ...node.data, isCollapsed: true } }
          : node
      );

      const arrangedNodes = result.current.arrangeNodes(
        nodesWithCollapsed,
        mockEdges,
        'root-node',
        'LR'
      );

      // All nodes should have positions, but layout should account for visibility
      arrangedNodes.forEach(node => {
        expect(node.position.x).toBeDefined();
        expect(node.position.y).toBeDefined();
      });
    });

    it('should space nodes based on content width', () => {
      const { result } = renderHook(() => useMindMapLayout());

      // Mock different text widths
      let callCount = 0;
      vi.mocked(mockCanvasContext.measureText).mockImplementation(() => {
        callCount++;
        return { width: callCount * 50 }; // Different widths for each call
      });

      const arrangedNodes = result.current.arrangeNodes(
        mockNodes,
        mockEdges,
        'root-node',
        'LR'
      );

      // Check that spacing considers node widths
      const rootNode = arrangedNodes.find(node => node.id === 'root-node');
      const child1 = arrangedNodes.find(node => node.id === 'child-1');
      const grandchild = arrangedNodes.find(node => node.id === 'grandchild-1');

      expect(child1?.position.x).toBeGreaterThan(rootNode!.position.x);
      expect(grandchild?.position.x).toBeGreaterThan(child1!.position.x);
    });

    it('should handle single node', () => {
      const { result } = renderHook(() => useMindMapLayout());

      const singleNode = [mockNodes[0]]; // Just root node
      const arrangedNodes = result.current.arrangeNodes(
        singleNode,
        [],
        'root-node',
        'LR'
      );

      expect(arrangedNodes).toHaveLength(1);
      expect(arrangedNodes[0].position.x).toBe(600);
      expect(arrangedNodes[0].position.y).toBe(460); // ROOT_Y + nodeY (60) for single node
    });

    it('should center tree vertically', () => {
      const { result } = renderHook(() => useMindMapLayout());

      const arrangedNodes = result.current.arrangeNodes(
        mockNodes,
        mockEdges,
        'root-node',
        'LR'
      );

      // All nodes should be positioned relative to center
      const allYPositions = arrangedNodes.map(node => node.position.y);
      const minY = Math.min(...allYPositions);
      const maxY = Math.max(...allYPositions);
      const centerY = (minY + maxY) / 2;

      // Center should be close to ROOT_Y (400)
      expect(Math.abs(centerY - 400)).toBeLessThan(100);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle empty nodes and edges', () => {
      const { result } = renderHook(() => useMindMapLayout());

      const visibleNodes = result.current.getVisibleNodes([], []);
      const visibleEdges = result.current.getVisibleEdges([], []);
      const updatedNodes = result.current.updateNodeLevels(
        [],
        [],
        'root',
        'LR'
      );
      const arrangedNodes = result.current.arrangeNodes([], [], 'root', 'LR');

      expect(visibleNodes).toEqual([]);
      expect(visibleEdges).toEqual([]);
      expect(updatedNodes).toEqual([]);
      expect(arrangedNodes).toEqual([]);
    });

    it('should handle circular references in edges', () => {
      const { result } = renderHook(() => useMindMapLayout());

      // Create circular edges (which shouldn't happen in practice)
      const circularEdges = [
        ...mockEdges,
        {
          id: 'circular-edge',
          source: 'grandchild-1',
          target: 'child-1',
          type: 'default',
        } as Edge,
      ];

      // Should not crash
      expect(() => {
        result.current.updateNodeLevels(
          mockNodes,
          circularEdges,
          'root-node',
          'LR'
        );
      }).not.toThrow();
    });

    it('should handle nodes without corresponding edges', () => {
      const { result } = renderHook(() => useMindMapLayout());

      const orphanNode = {
        id: 'orphan',
        type: 'mindMapNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'orphan',
          label: 'Orphan Node',
          isRoot: false,
          level: 0,
        } as MindMapNodeData,
      } as Node<MindMapNodeData>;

      const nodesWithOrphan = [...mockNodes, orphanNode];
      const arrangedNodes = result.current.arrangeNodes(
        nodesWithOrphan,
        mockEdges,
        'root-node',
        'LR'
      );

      // Should handle orphan node gracefully
      const orphanResult = arrangedNodes.find(node => node.id === 'orphan');
      expect(orphanResult).toBeDefined();
    });

    it('should handle very large trees', () => {
      const { result } = renderHook(() => useMindMapLayout());

      // Create a larger tree
      const largeNodes: Node<MindMapNodeData>[] = [mockNodes[0]]; // Start with root
      const largeEdges: Edge[] = [];

      // Add many children to root
      for (let i = 1; i <= 50; i++) {
        largeNodes.push({
          id: `child-${i}`,
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: `child-${i}`,
            label: `Child ${i}`,
            isRoot: false,
            level: 1,
            parentId: 'root-node',
          } as MindMapNodeData,
        });

        largeEdges.push({
          id: `edge-root-child-${i}`,
          source: 'root-node',
          target: `child-${i}`,
          type: 'default',
        });
      }

      // Should handle large tree without performance issues
      const start = performance.now();
      const arrangedNodes = result.current.arrangeNodes(
        largeNodes,
        largeEdges,
        'root-node',
        'LR'
      );
      const end = performance.now();

      expect(arrangedNodes).toHaveLength(51); // Root + 50 children
      expect(end - start).toBeLessThan(1000); // Should complete in reasonable time
    });
  });
});
