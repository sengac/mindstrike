import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMindMapActions } from '../useMindMapActions';
import type { Node } from 'reactflow';
import type { MindMapNodeData } from '../../types/mindMap';
import type { MindMapData } from '../useMindMapData';
import {
  mockNodes,
  mockEdges,
  mockNodeData,
} from '../../__fixtures__/mindMapData';

// Mock functions for dependencies
const createMockDependencies = () => {
  const mockSetNodes = vi.fn();
  const mockSetEdges = vi.fn();
  const mockSetSelectedNodeId = vi.fn();
  const mockSetIsLoading = vi.fn();
  const mockGenerateEdges = vi.fn(() => mockEdges);
  const mockArrangeNodes = vi.fn(nodes => nodes);
  const mockUpdateNodeLevels = vi.fn(nodes => nodes);
  const mockSaveToHistory = vi.fn();
  const mockConvertNodesToTree = vi.fn(
    () =>
      ({
        root: {
          id: 'root-node',
          text: 'Root Topic',
          layout: 'graph-right' as const,
        },
      }) as MindMapData
  );
  const mockOnSave = vi.fn();
  const mockOnLayoutComplete = vi.fn();

  return {
    nodes: mockNodes,
    rootNodeId: 'root-node',
    layout: 'LR' as const,
    setNodes: mockSetNodes,
    setEdges: mockSetEdges,
    setSelectedNodeId: mockSetSelectedNodeId,
    setIsLoading: mockSetIsLoading,
    generateEdges: mockGenerateEdges,
    arrangeNodes: mockArrangeNodes,
    updateNodeLevels: mockUpdateNodeLevels,
    saveToHistory: mockSaveToHistory,
    convertNodesToTree: mockConvertNodesToTree,
    onSave: mockOnSave,
    onLayoutComplete: mockOnLayoutComplete,
  };
};

describe('useMindMapActions', () => {
  let mockDeps: ReturnType<typeof createMockDependencies>;

  beforeEach(() => {
    vi.clearAllTimers();
    vi.useFakeTimers();
    mockDeps = createMockDependencies();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('addChildNode', () => {
    it('should add a child node to existing parent', async () => {
      const { result } = renderHook(() => useMindMapActions(mockDeps));

      expect(result.current).toBeDefined();

      await act(async () => {
        const promise = result.current.addChildNode('root-node');
        await vi.runAllTimersAsync();
        await promise;
      });

      // Should call setNodes with new node added
      expect(mockDeps.setNodes).toHaveBeenCalled();
      const setNodesCall = mockDeps.setNodes.mock.calls[0][0];
      expect(setNodesCall).toHaveLength(mockNodes.length + 1);

      // New node should have correct properties
      const newNode = setNodesCall.find(
        (node: Node<MindMapNodeData>) =>
          node.data.parentId === 'root-node' && node.data.label === 'New Idea'
      );
      expect(newNode).toBeDefined();
      expect(newNode.data.isEditing).toBe(true);
      expect(newNode.data.level).toBe(1);

      // Should select the new node
      expect(mockDeps.setSelectedNodeId).toHaveBeenCalledWith(newNode.id);

      // Should trigger layout and save
      expect(mockDeps.generateEdges).toHaveBeenCalled();
      expect(mockDeps.arrangeNodes).toHaveBeenCalled();
      expect(mockDeps.saveToHistory).toHaveBeenCalled();
    });

    it('should not add child if parent node does not exist', async () => {
      const { result } = renderHook(() => useMindMapActions(mockDeps));

      await act(async () => {
        const promise = result.current.addChildNode('non-existent-node');
        await vi.runAllTimersAsync();
        await promise;
      });

      expect(mockDeps.setNodes).not.toHaveBeenCalled();
      expect(mockDeps.setSelectedNodeId).not.toHaveBeenCalled();
    });

    it('should trigger onLayoutComplete and onSave after adding child', async () => {
      const { result } = renderHook(() => useMindMapActions(mockDeps));

      await act(async () => {
        const promise = result.current.addChildNode('root-node');
        await vi.runAllTimersAsync();
        await promise;
        // Fast-forward through timeouts
        vi.advanceTimersByTime(200);
      });

      expect(mockDeps.onLayoutComplete).toHaveBeenCalled();
      expect(mockDeps.onSave).toHaveBeenCalled();
    });
  });

  describe('addSiblingNode', () => {
    it('should add a sibling node to existing node with parent', async () => {
      const { result } = renderHook(() => useMindMapActions(mockDeps));

      await act(async () => {
        const promise = result.current.addSiblingNode('child-1');
        await vi.runAllTimersAsync();
        await promise;
      });

      // Should call setNodes with new node added
      expect(mockDeps.setNodes).toHaveBeenCalled();
      const setNodesCall = mockDeps.setNodes.mock.calls[0][0];

      // New node should have same parent as sibling
      const newNode = setNodesCall.find(
        (node: Node<MindMapNodeData>) =>
          node.data.parentId === 'root-node' &&
          node.data.label === 'New Idea' &&
          node.id !== 'child-1'
      );
      expect(newNode).toBeDefined();
      expect(newNode.data.level).toBe(1);
      expect(newNode.data.isEditing).toBe(true);

      // Should be inserted after the sibling in the array
      const siblingIndex = mockNodes.findIndex(n => n.id === 'child-1');
      const newNodePosition = setNodesCall.findIndex(
        (node: Node<MindMapNodeData>) => node.id === newNode.id
      );
      expect(newNodePosition).toBe(siblingIndex + 1);
    });

    it('should not add sibling if node has no parent', async () => {
      const { result } = renderHook(() => useMindMapActions(mockDeps));

      await act(async () => {
        const promise = result.current.addSiblingNode('root-node');
        await vi.runAllTimersAsync();
        await promise;
      });

      expect(mockDeps.setNodes).not.toHaveBeenCalled();
      expect(mockDeps.setSelectedNodeId).not.toHaveBeenCalled();
    });

    it('should not add sibling if node does not exist', async () => {
      const { result } = renderHook(() => useMindMapActions(mockDeps));

      await act(async () => {
        const promise = result.current.addSiblingNode('non-existent-node');
        await vi.runAllTimersAsync();
        await promise;
      });

      expect(mockDeps.setNodes).not.toHaveBeenCalled();
    });
  });

  describe('deleteNode', () => {
    it('should delete a node and its descendants', async () => {
      const { result } = renderHook(() => useMindMapActions(mockDeps));

      await act(async () => {
        const promise = result.current.deleteNode('child-1');
        await vi.runAllTimersAsync();
        await promise;
      });

      // Should call setNodes with node and descendants removed
      expect(mockDeps.setNodes).toHaveBeenCalled();
      const setNodesCall = mockDeps.setNodes.mock.calls[0][0];

      // Should remove child-1 and its descendant grandchild-1
      const deletedNode = setNodesCall.find(
        (node: Node<MindMapNodeData>) => node.id === 'child-1'
      );
      const deletedDescendant = setNodesCall.find(
        (node: Node<MindMapNodeData>) => node.id === 'grandchild-1'
      );

      expect(deletedNode).toBeUndefined();
      expect(deletedDescendant).toBeUndefined();

      // Should keep other nodes
      const keptNode = setNodesCall.find(
        (node: Node<MindMapNodeData>) => node.id === 'child-2'
      );
      expect(keptNode).toBeDefined();

      // Should clear selection
      expect(mockDeps.setSelectedNodeId).toHaveBeenCalledWith(null);
    });

    it('should not delete root node', async () => {
      const { result } = renderHook(() => useMindMapActions(mockDeps));

      await act(async () => {
        const promise = result.current.deleteNode('root-node');
        await vi.runAllTimersAsync();
        await promise;
      });

      expect(mockDeps.setNodes).not.toHaveBeenCalled();
      expect(mockDeps.setSelectedNodeId).not.toHaveBeenCalled();
    });

    it('should handle deletion of non-existent node', async () => {
      const { result } = renderHook(() => useMindMapActions(mockDeps));

      await act(async () => {
        const promise = result.current.deleteNode('non-existent-node');
        await vi.runAllTimersAsync();
        await promise;
      });

      expect(mockDeps.setNodes).not.toHaveBeenCalled();
    });

    it('should not delete if it would leave no nodes or no root', async () => {
      // Create mock with only root node
      const singleNodeDeps = {
        ...mockDeps,
        nodes: [mockNodes[0]], // Only root node
      };

      const { result } = renderHook(() => useMindMapActions(singleNodeDeps));

      await act(async () => {
        const promise = result.current.deleteNode('child-1');
        await vi.runAllTimersAsync();
        await promise; // Try to delete non-existent child
      });

      expect(mockDeps.setNodes).not.toHaveBeenCalled();
    });
  });

  describe('updateNodeLabel', () => {
    it('should update node label and clear editing state', () => {
      const { result } = renderHook(() => useMindMapActions(mockDeps));

      act(() => {
        result.current.updateNodeLabel('child-1', 'Updated Label');
      });

      expect(mockDeps.setNodes).toHaveBeenCalled();
      const setNodesCall = mockDeps.setNodes.mock.calls[0][0];

      const updatedNode = setNodesCall.find(
        (node: Node<MindMapNodeData>) => node.id === 'child-1'
      );
      expect(updatedNode.data.label).toBe('Updated Label');
      expect(updatedNode.data.isEditing).toBe(false);
    });

    it('should only update the target node', () => {
      const { result } = renderHook(() => useMindMapActions(mockDeps));

      act(() => {
        result.current.updateNodeLabel('child-1', 'Updated Label');
      });

      const setNodesCall = mockDeps.setNodes.mock.calls[0][0];

      // Other nodes should remain unchanged
      const otherNode = setNodesCall.find(
        (node: Node<MindMapNodeData>) => node.id === 'child-2'
      );
      expect(otherNode.data.label).toBe(mockNodeData.child2.label);
    });
  });

  describe('toggleNodeCollapse', () => {
    it('should toggle collapse state and trigger layout', async () => {
      const { result } = renderHook(() => useMindMapActions(mockDeps));

      await act(async () => {
        const promise = result.current.toggleNodeCollapse('child-1');
        await vi.runAllTimersAsync();
        await promise;
      });

      expect(mockDeps.setNodes).toHaveBeenCalled();
      const setNodesCall = mockDeps.setNodes.mock.calls[0][0];

      const toggledNode = setNodesCall.find(
        (node: Node<MindMapNodeData>) => node.id === 'child-1'
      );
      expect(toggledNode.data.isCollapsed).toBe(
        !mockNodeData.child1.isCollapsed
      );

      // Should trigger layout
      expect(mockDeps.generateEdges).toHaveBeenCalled();
      expect(mockDeps.arrangeNodes).toHaveBeenCalled();
    });
  });

  describe('moveNode', () => {
    it('should move node to new parent', async () => {
      const { result } = renderHook(() => useMindMapActions(mockDeps));

      await act(async () => {
        const promise = result.current.moveNode('grandchild-1', 'child-2');
        await vi.runAllTimersAsync();
        await promise;
      });

      expect(mockDeps.setNodes).toHaveBeenCalled();
      const setNodesCall = mockDeps.setNodes.mock.calls[0][0];

      const movedNode = setNodesCall.find(
        (node: Node<MindMapNodeData>) => node.id === 'grandchild-1'
      );
      expect(movedNode.data.parentId).toBe('child-2');
    });

    it('should not move root node', async () => {
      const { result } = renderHook(() => useMindMapActions(mockDeps));

      await act(async () => {
        const promise = result.current.moveNode('root-node', 'child-1');
        await vi.runAllTimersAsync();
        await promise;
      });

      expect(mockDeps.setNodes).not.toHaveBeenCalled();
    });

    it('should prevent cycles', async () => {
      const { result } = renderHook(() => useMindMapActions(mockDeps));

      // Try to move child-1 to be a child of its own descendant grandchild-1
      await act(async () => {
        const promise = result.current.moveNode('child-1', 'grandchild-1');
        await vi.runAllTimersAsync();
        await promise;
      });

      expect(mockDeps.setNodes).not.toHaveBeenCalled();
    });

    it('should reorder nodes when insert index is specified', async () => {
      const { result } = renderHook(() => useMindMapActions(mockDeps));

      await act(async () => {
        const promise = result.current.moveNode('child-2', 'root-node', 0);
        await vi.runAllTimersAsync();
        await promise;
      });

      expect(mockDeps.setNodes).toHaveBeenCalled();
      const setNodesCall = mockDeps.setNodes.mock.calls[0][0];

      // Node should be at specified index
      expect(setNodesCall[0].id).toBe('child-2');
    });
  });

  describe('changeLayout', () => {
    it('should change layout and trigger complete flow', async () => {
      const { result } = renderHook(() => useMindMapActions(mockDeps));

      await act(async () => {
        const promise = result.current.changeLayout('TB');
        await vi.runAllTimersAsync();
        await promise;
        vi.advanceTimersByTime(200);
      });

      // Should generate edges with new layout
      expect(mockDeps.generateEdges).toHaveBeenCalledWith(mockNodes, 'TB');
      expect(mockDeps.arrangeNodes).toHaveBeenCalledWith(
        mockNodes,
        mockEdges,
        'root-node',
        'TB'
      );
      expect(mockDeps.updateNodeLevels).toHaveBeenCalledWith(
        expect.any(Array),
        mockEdges,
        'root-node',
        'TB'
      );

      // Should save to history with new layout
      expect(mockDeps.saveToHistory).toHaveBeenCalledWith(
        expect.any(Array),
        'root-node',
        'TB'
      );

      // Should trigger callbacks
      expect(mockDeps.onLayoutComplete).toHaveBeenCalled();
      expect(mockDeps.onSave).toHaveBeenCalled();
    });

    it('should convert nodes to tree with new layout', async () => {
      const { result } = renderHook(() => useMindMapActions(mockDeps));

      await act(async () => {
        const promise = result.current.changeLayout('RL');
        await vi.runAllTimersAsync();
        await promise;
        vi.advanceTimersByTime(200);
      });

      expect(mockDeps.convertNodesToTree).toHaveBeenCalledWith(
        expect.any(Array),
        'root-node',
        'RL'
      );
    });
  });

  describe('updateNodeChatId', () => {
    it('should update node chat ID', () => {
      const { result } = renderHook(() => useMindMapActions(mockDeps));

      act(() => {
        result.current.updateNodeChatId('child-1', 'new-chat-id');
      });

      expect(mockDeps.setNodes).toHaveBeenCalled();
      const setNodesCall = mockDeps.setNodes.mock.calls[0][0];

      const updatedNode = setNodesCall.find(
        (node: Node<MindMapNodeData>) => node.id === 'child-1'
      );
      expect(updatedNode.data.chatId).toBe('new-chat-id');
    });

    it('should clear chat ID when set to null', () => {
      const { result } = renderHook(() => useMindMapActions(mockDeps));

      act(() => {
        result.current.updateNodeChatId('child-1', null);
      });

      expect(mockDeps.setNodes).toHaveBeenCalled();
      const setNodesCall = mockDeps.setNodes.mock.calls[0][0];

      const updatedNode = setNodesCall.find(
        (node: Node<MindMapNodeData>) => node.id === 'child-1'
      );
      expect(updatedNode.data.chatId).toBeNull();
    });
  });

  describe('applyLayoutAndSave', () => {
    it('should save after layout operations', async () => {
      const { result } = renderHook(() => useMindMapActions(mockDeps));

      await act(async () => {
        const promise = result.current.addChildNode('root-node');
        // Only advance the 50ms layout timer, not the 100ms save timer
        await vi.advanceTimersByTimeAsync(50);
        await promise;
      });

      expect(mockDeps.onLayoutComplete).toHaveBeenCalled();

      // Save is debounced with 100ms timeout
      expect(mockDeps.onSave).not.toHaveBeenCalled();

      // Now advance to save timeout
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(mockDeps.onSave).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle missing onSave gracefully', async () => {
      const depsWithoutSave = { ...mockDeps, onSave: undefined };
      const { result } = renderHook(() => useMindMapActions(depsWithoutSave));

      await act(async () => {
        const promise = result.current.addChildNode('root-node');
        await vi.runAllTimersAsync();
        await promise;
      });

      // Should not throw error and should still work
      expect(depsWithoutSave.setNodes).toHaveBeenCalled();
      expect(depsWithoutSave.onLayoutComplete).toHaveBeenCalled();
    });

    it('should handle missing onLayoutComplete gracefully', async () => {
      const depsWithoutLayoutComplete = {
        ...mockDeps,
        onLayoutComplete: undefined,
      };
      const { result } = renderHook(() =>
        useMindMapActions(depsWithoutLayoutComplete)
      );

      await act(async () => {
        const promise = result.current.addChildNode('root-node');
        await vi.runAllTimersAsync();
        await promise;
      });

      // Should not throw error and should still work
      expect(depsWithoutLayoutComplete.setNodes).toHaveBeenCalled();
      expect(depsWithoutLayoutComplete.onSave).toHaveBeenCalled();
    });
  });

  describe('timing and async behavior', () => {
    it('should handle layout timing correctly', async () => {
      const { result } = renderHook(() => useMindMapActions(mockDeps));

      const promise = act(async () => {
        const promise = result.current.addChildNode('root-node');
        await vi.runAllTimersAsync();
        await promise;
      });

      // Should wait for React Flow processing
      expect(mockDeps.onLayoutComplete).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(50);
      });

      await promise;

      expect(mockDeps.onLayoutComplete).toHaveBeenCalled();
    });

    it('should debounce save operations', async () => {
      const { result } = renderHook(() => useMindMapActions(mockDeps));

      await act(async () => {
        const promise = result.current.addChildNode('root-node');
        // Wait for the initial layout processing
        await vi.advanceTimersByTimeAsync(50);
        await promise;
      });

      // Save should be debounced
      expect(mockDeps.onSave).not.toHaveBeenCalled();

      await act(async () => {
        // Advance to the save timeout (100ms from when applyLayoutAndSave was called)
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(mockDeps.onSave).toHaveBeenCalled();
    });
  });
});
