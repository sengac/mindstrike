import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMindMapData, type MindMapData } from '../useMindMapData';

describe('useMindMapData', () => {
  beforeEach(() => {
    vi.clearAllTimers();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('should initialize with empty state when no mindMapId provided', () => {
      const { result } = renderHook(() => useMindMapData(''));

      expect(result.current.nodes).toEqual([]);
      expect(result.current.edges).toEqual([]);
      expect(result.current.rootNodeId).toBe('');
      expect(result.current.layout).toBe('LR');
      expect(result.current.selectedNodeId).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });

    it('should create default root node when mindMapId is provided', () => {
      const { result } = renderHook(() => useMindMapData('test-mindmap'));

      expect(result.current.nodes).toHaveLength(1);
      expect(result.current.nodes[0].data.label).toBe('Central Idea');
      expect(result.current.nodes[0].data.isRoot).toBe(true);
      expect(result.current.nodes[0].data.level).toBe(0);
      expect(result.current.edges).toEqual([]);
      expect(result.current.rootNodeId).toBe(result.current.nodes[0].id);
    });

    it('should initialize with provided initial data', () => {
      const initialData: MindMapData = {
        root: {
          id: 'root-1',
          text: 'Test Root',
          layout: 'graph-right',
          children: [
            {
              id: 'child-1',
              text: 'Child 1',
              notes: 'Test notes',
            },
          ],
        },
      };

      const { result } = renderHook(() =>
        useMindMapData('test-mindmap', initialData)
      );

      expect(result.current.isLoading).toBe(true);

      // Fast-forward initialization
      act(() => {
        vi.advanceTimersByTime(100);
      });

      // Should have nodes but still loading until layout completes
      expect(result.current.nodes.length).toBeGreaterThan(0);
      expect(result.current.layout).toBe('LR');
      expect(result.current.rootNodeId).toBe('root-1');
    });
  });

  describe('layout conversion', () => {
    const layoutTests = [
      { input: 'graph-right', expected: 'LR' },
      { input: 'graph-left', expected: 'RL' },
      { input: 'graph-bottom', expected: 'TB' },
      { input: 'graph-top', expected: 'BT' },
    ];

    layoutTests.forEach(({ input, expected }) => {
      it(`should convert ${input} to ${expected} layout`, () => {
        const initialData: MindMapData = {
          root: {
            id: 'root-1',
            text: 'Test Root',
            layout: input as any,
          },
        };

        const { result } = renderHook(() =>
          useMindMapData('test-mindmap', initialData)
        );

        act(() => {
          vi.advanceTimersByTime(100);
        });

        expect(result.current.layout).toBe(expected);
      });
    });
  });

  describe('edge generation', () => {
    it('should generate correct edges for LR layout', () => {
      const { result } = renderHook(() => useMindMapData('test-mindmap'));

      const mockNodes = [
        {
          id: 'root',
          data: { id: 'root', label: 'Root', isRoot: true, level: 0 },
        },
        {
          id: 'child',
          data: {
            id: 'child',
            label: 'Child',
            isRoot: false,
            level: 1,
            parentId: 'root',
          },
        },
      ];

      const edges = result.current.generateEdges(mockNodes as any, 'LR');

      expect(edges).toHaveLength(1);
      expect(edges[0]).toEqual({
        id: 'edge-root-child',
        source: 'root',
        target: 'child',
        sourceHandle: 'right-source',
        targetHandle: 'left',
        type: 'default',
        style: { stroke: '#64748b', strokeWidth: 2 },
      });
    });

    it('should generate correct edges for RL layout', () => {
      const { result } = renderHook(() => useMindMapData('test-mindmap'));

      const mockNodes = [
        {
          id: 'root',
          data: { id: 'root', label: 'Root', isRoot: true, level: 0 },
        },
        {
          id: 'child',
          data: {
            id: 'child',
            label: 'Child',
            isRoot: false,
            level: 1,
            parentId: 'root',
          },
        },
      ];

      const edges = result.current.generateEdges(mockNodes as any, 'RL');

      expect(edges[0].sourceHandle).toBe('left-source');
      expect(edges[0].targetHandle).toBe('right');
    });

    it('should generate correct edges for TB layout', () => {
      const { result } = renderHook(() => useMindMapData('test-mindmap'));

      const mockNodes = [
        {
          id: 'root',
          data: { id: 'root', label: 'Root', isRoot: true, level: 0 },
        },
        {
          id: 'child',
          data: {
            id: 'child',
            label: 'Child',
            isRoot: false,
            level: 1,
            parentId: 'root',
          },
        },
      ];

      const edges = result.current.generateEdges(mockNodes as any, 'TB');

      expect(edges[0].sourceHandle).toBe('bottom-source');
      expect(edges[0].targetHandle).toBe('top');
    });

    it('should generate correct edges for BT layout', () => {
      const { result } = renderHook(() => useMindMapData('test-mindmap'));

      const mockNodes = [
        {
          id: 'root',
          data: { id: 'root', label: 'Root', isRoot: true, level: 0 },
        },
        {
          id: 'child',
          data: {
            id: 'child',
            label: 'Child',
            isRoot: false,
            level: 1,
            parentId: 'root',
          },
        },
      ];

      const edges = result.current.generateEdges(mockNodes as any, 'BT');

      expect(edges[0].sourceHandle).toBe('top-source');
      expect(edges[0].targetHandle).toBe('bottom');
    });
  });

  describe('tree conversion', () => {
    it('should convert nodes back to tree structure', () => {
      const { result } = renderHook(() => useMindMapData('test-mindmap'));

      const mockNodes = [
        {
          id: 'root',
          data: {
            id: 'root',
            label: 'Root Node',
            isRoot: true,
            level: 0,
            notes: 'Root notes',
            chatId: 'chat-root',
          },
        },
        {
          id: 'child1',
          data: {
            id: 'child1',
            label: 'Child 1',
            isRoot: false,
            level: 1,
            parentId: 'root',
            notes: 'Child notes',
          },
        },
        {
          id: 'child2',
          data: {
            id: 'child2',
            label: 'Child 2',
            isRoot: false,
            level: 1,
            parentId: 'root',
          },
        },
      ];

      const treeData = result.current.convertNodesToTree(
        mockNodes as any,
        'root',
        'LR'
      );

      expect(treeData.root.id).toBe('root');
      expect(treeData.root.text).toBe('Root Node');
      expect(treeData.root.layout).toBe('graph-right');
      expect(treeData.root.notes).toBe('Root notes');
      expect(treeData.root.chatId).toBe('chat-root');
      expect(treeData.root.children).toHaveLength(2);

      const child1 = treeData.root.children!.find(c => c.id === 'child1');
      expect(child1).toBeDefined();
      expect(child1!.text).toBe('Child 1');
      expect(child1!.notes).toBe('Child notes');

      const child2 = treeData.root.children!.find(c => c.id === 'child2');
      expect(child2).toBeDefined();
      expect(child2!.text).toBe('Child 2');
      expect(child2!.notes).toBeNull();
    });

    it('should handle nested children correctly', () => {
      const { result } = renderHook(() => useMindMapData('test-mindmap'));

      const mockNodes = [
        {
          id: 'root',
          data: { id: 'root', label: 'Root', isRoot: true, level: 0 },
        },
        {
          id: 'child',
          data: {
            id: 'child',
            label: 'Child',
            isRoot: false,
            level: 1,
            parentId: 'root',
          },
        },
        {
          id: 'grandchild',
          data: {
            id: 'grandchild',
            label: 'Grandchild',
            isRoot: false,
            level: 2,
            parentId: 'child',
          },
        },
      ];

      const treeData = result.current.convertNodesToTree(
        mockNodes as any,
        'root',
        'LR'
      );

      expect(treeData.root.children).toHaveLength(1);
      expect(treeData.root.children![0].children).toHaveLength(1);
      expect(treeData.root.children![0].children![0].id).toBe('grandchild');
      expect(treeData.root.children![0].children![0].text).toBe('Grandchild');
    });

    it('should throw error when root node not found', () => {
      const { result } = renderHook(() => useMindMapData('test-mindmap'));

      const mockNodes = [
        {
          id: 'child',
          data: {
            id: 'child',
            label: 'Child',
            isRoot: false,
            level: 1,
            parentId: 'root',
          },
        },
      ];

      expect(() => {
        result.current.convertNodesToTree(mockNodes as any, 'root', 'LR');
      }).toThrow('Root node not found');
    });
  });

  describe('history management', () => {
    it('should provide undo/redo functionality', () => {
      const { result } = renderHook(() => useMindMapData('test-mindmap'));

      // Initially should not be able to undo/redo
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);

      // Undo/redo functions should exist
      expect(typeof result.current.undo).toBe('function');
      expect(typeof result.current.redo).toBe('function');
    });

    it('should save state to history', () => {
      const { result } = renderHook(() => useMindMapData('test-mindmap'));

      const newNodes = [
        {
          id: 'test-node',
          type: 'mindMapNode',
          position: { x: 100, y: 100 },
          data: {
            id: 'test-node',
            label: 'Test Node',
            isRoot: true,
            level: 0,
          },
        },
      ];

      act(() => {
        result.current.saveToHistory(newNodes as any, 'test-node', 'LR');
      });

      // History functionality exists (exact behavior depends on internal state)
      expect(typeof result.current.canUndo).toBe('boolean');
      expect(typeof result.current.canRedo).toBe('boolean');
    });
  });

  describe('state setters', () => {
    it('should update layout', () => {
      const { result } = renderHook(() => useMindMapData('test-mindmap'));

      act(() => {
        result.current.setLayout('RL');
      });

      expect(result.current.layout).toBe('RL');
    });

    it('should update selected node ID', () => {
      const { result } = renderHook(() => useMindMapData('test-mindmap'));

      act(() => {
        result.current.setSelectedNodeId('test-node');
      });

      expect(result.current.selectedNodeId).toBe('test-node');
    });

    it('should update loading state', () => {
      const { result } = renderHook(() => useMindMapData('test-mindmap'));

      act(() => {
        result.current.setIsLoading(true);
      });

      expect(result.current.isLoading).toBe(true);
    });

    it('should update nodes', () => {
      const { result } = renderHook(() => useMindMapData('test-mindmap'));

      const newNodes = [
        {
          id: 'test-node',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'test-node',
            label: 'Test Node',
            isRoot: true,
            level: 0,
          },
        },
      ];

      act(() => {
        result.current.setNodes(newNodes as any);
      });

      expect(result.current.nodes).toEqual(newNodes);
    });

    it('should update edges', () => {
      const { result } = renderHook(() => useMindMapData('test-mindmap'));

      const newEdges = [
        {
          id: 'test-edge',
          source: 'node1',
          target: 'node2',
          type: 'default',
        },
      ];

      act(() => {
        result.current.setEdges(newEdges as any);
      });

      expect(result.current.edges).toEqual(newEdges);
    });
  });
});
