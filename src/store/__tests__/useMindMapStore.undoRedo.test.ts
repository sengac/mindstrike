import { describe, it, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { useMindMapStore } from '../useMindMapStore';

describe('useMindMapStore - Undo/Redo with Text Editing', () => {
  beforeEach(() => {
    // Reset store before each test
    const store = useMindMapStore.getState();
    store.reset();
  });

  it('should not save isEditing flag in history', async () => {
    // Manually set up initial state
    useMindMapStore.setState({
      mindMapId: 'test-map',
      isInitialized: true,
      rootNodeId: 'root',
      nodes: [
        {
          id: 'root',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'root',
            label: 'Root Node',
            isRoot: true,
            level: 0,
          },
        },
        {
          id: 'child1',
          type: 'mindMapNode',
          position: { x: 100, y: 0 },
          data: {
            id: 'child1',
            label: 'Child 1',
            isRoot: false,
            parentId: 'root',
            level: 1,
          },
        },
      ],
      edges: [],
      layout: 'LR',
      history: [],
      historyIndex: -1,
    });

    // Set node to editing state
    act(() => {
      const nodes = useMindMapStore
        .getState()
        .nodes.map(node =>
          node.id === 'child1'
            ? { ...node, data: { ...node.data, isEditing: true } }
            : node
        );
      useMindMapStore.setState({ nodes });
    });

    // Verify node is in editing state
    let node = useMindMapStore.getState().nodes.find(n => n.id === 'child1');
    expect(node?.data.isEditing).toBe(true);

    // Save to history while node is editing
    act(() => {
      useMindMapStore.getState().saveToHistory();
    });

    // Check history - it should not contain isEditing: true
    const history = useMindMapStore.getState().history;
    const lastHistoryEntry = history[history.length - 1];
    const historyNode = lastHistoryEntry.nodes.find(n => n.id === 'child1');
    expect(historyNode?.data.isEditing).toBeUndefined();

    // Update the label and finish editing
    act(() => {
      const nodes = useMindMapStore.getState().nodes.map(node =>
        node.id === 'child1'
          ? {
              ...node,
              data: {
                ...node.data,
                label: 'Updated Child 1',
                isEditing: false,
              },
            }
          : node
      );
      useMindMapStore.setState({ nodes });
      useMindMapStore.getState().saveToHistory();
    });

    // Verify label was updated and editing is false
    node = useMindMapStore.getState().nodes.find(n => n.id === 'child1');
    expect(node?.data.label).toBe('Updated Child 1');
    expect(node?.data.isEditing).toBe(false);

    // Undo
    act(() => {
      useMindMapStore.getState().undo();
    });

    // Verify text reverted but isEditing is still false
    node = useMindMapStore.getState().nodes.find(n => n.id === 'child1');
    expect(node?.data.label).toBe('Child 1');
    expect(node?.data.isEditing).toBe(false);
  });

  it('should handle multiple text edits and maintain correct history', async () => {
    // Manually set up initial state
    useMindMapStore.setState({
      mindMapId: 'test-map',
      isInitialized: true,
      rootNodeId: 'root',
      nodes: [
        {
          id: 'root',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: { id: 'root', label: 'Root', isRoot: true, level: 0 },
        },
        {
          id: 'n1',
          type: 'mindMapNode',
          position: { x: 100, y: 0 },
          data: {
            id: 'n1',
            label: 'Node 1',
            isRoot: false,
            parentId: 'root',
            level: 1,
          },
        },
        {
          id: 'n2',
          type: 'mindMapNode',
          position: { x: 100, y: 100 },
          data: {
            id: 'n2',
            label: 'Node 2',
            isRoot: false,
            parentId: 'root',
            level: 1,
          },
        },
      ],
      edges: [],
      layout: 'LR',
      history: [],
      historyIndex: -1,
    });

    // Save initial state to history
    act(() => {
      useMindMapStore.getState().saveToHistory();
    });

    // Edit Node 1
    act(() => {
      const nodes = useMindMapStore
        .getState()
        .nodes.map(node =>
          node.id === 'n1'
            ? { ...node, data: { ...node.data, label: 'First Edit' } }
            : node
        );
      useMindMapStore.setState({ nodes });
      useMindMapStore.getState().saveToHistory();
    });

    expect(
      useMindMapStore.getState().nodes.find(n => n.id === 'n1')?.data.label
    ).toBe('First Edit');

    // Edit Node 2
    act(() => {
      const nodes = useMindMapStore
        .getState()
        .nodes.map(node =>
          node.id === 'n2'
            ? { ...node, data: { ...node.data, label: 'Second Edit' } }
            : node
        );
      useMindMapStore.setState({ nodes });
      useMindMapStore.getState().saveToHistory();
    });

    expect(
      useMindMapStore.getState().nodes.find(n => n.id === 'n2')?.data.label
    ).toBe('Second Edit');

    // Edit Node 1 again
    act(() => {
      const nodes = useMindMapStore
        .getState()
        .nodes.map(node =>
          node.id === 'n1'
            ? { ...node, data: { ...node.data, label: 'Third Edit' } }
            : node
        );
      useMindMapStore.setState({ nodes });
      useMindMapStore.getState().saveToHistory();
    });

    expect(
      useMindMapStore.getState().nodes.find(n => n.id === 'n1')?.data.label
    ).toBe('Third Edit');

    // Verify history length
    expect(useMindMapStore.getState().history.length).toBe(4); // Initial + 3 edits

    // Undo all edits
    act(() => {
      useMindMapStore.getState().undo(); // Undo third edit
    });
    expect(
      useMindMapStore.getState().nodes.find(n => n.id === 'n1')?.data.label
    ).toBe('First Edit');

    act(() => {
      useMindMapStore.getState().undo(); // Undo second edit
    });
    expect(
      useMindMapStore.getState().nodes.find(n => n.id === 'n2')?.data.label
    ).toBe('Node 2');

    act(() => {
      useMindMapStore.getState().undo(); // Undo first edit
    });
    expect(
      useMindMapStore.getState().nodes.find(n => n.id === 'n1')?.data.label
    ).toBe('Node 1');

    // Verify no nodes are in editing state after undo
    useMindMapStore.getState().nodes.forEach(node => {
      expect(node.data.isEditing).toBeFalsy();
    });
  });

  it('should clear future history when making changes after undo', async () => {
    // Manually set up initial state
    useMindMapStore.setState({
      mindMapId: 'test-map',
      isInitialized: true,
      rootNodeId: 'root',
      nodes: [
        {
          id: 'root',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: { id: 'root', label: 'Root', isRoot: true, level: 0 },
        },
        {
          id: 'n1',
          type: 'mindMapNode',
          position: { x: 100, y: 0 },
          data: {
            id: 'n1',
            label: 'Original',
            isRoot: false,
            parentId: 'root',
            level: 1,
          },
        },
      ],
      edges: [],
      layout: 'LR',
      history: [],
      historyIndex: -1,
    });

    // Save initial state
    act(() => {
      useMindMapStore.getState().saveToHistory();
    });

    // Make some edits
    act(() => {
      const nodes = useMindMapStore
        .getState()
        .nodes.map(node =>
          node.id === 'n1'
            ? { ...node, data: { ...node.data, label: 'Edit 1' } }
            : node
        );
      useMindMapStore.setState({ nodes });
      useMindMapStore.getState().saveToHistory();
    });

    act(() => {
      const nodes = useMindMapStore
        .getState()
        .nodes.map(node =>
          node.id === 'n1'
            ? { ...node, data: { ...node.data, label: 'Edit 2' } }
            : node
        );
      useMindMapStore.setState({ nodes });
      useMindMapStore.getState().saveToHistory();
    });

    act(() => {
      const nodes = useMindMapStore
        .getState()
        .nodes.map(node =>
          node.id === 'n1'
            ? { ...node, data: { ...node.data, label: 'Edit 3' } }
            : node
        );
      useMindMapStore.setState({ nodes });
      useMindMapStore.getState().saveToHistory();
    });

    expect(useMindMapStore.getState().history.length).toBe(4); // Initial + 3 edits

    // Undo twice
    act(() => {
      useMindMapStore.getState().undo();
      useMindMapStore.getState().undo();
    });

    expect(
      useMindMapStore.getState().nodes.find(n => n.id === 'n1')?.data.label
    ).toBe('Edit 1');
    expect(useMindMapStore.getState().historyIndex).toBe(1);

    // Make a new edit (should clear future history)
    act(() => {
      const nodes = useMindMapStore
        .getState()
        .nodes.map(node =>
          node.id === 'n1'
            ? { ...node, data: { ...node.data, label: 'New Branch' } }
            : node
        );
      useMindMapStore.setState({ nodes });
      useMindMapStore.getState().saveToHistory();
    });

    // History should be truncated
    const state = useMindMapStore.getState();
    expect(state.history.length).toBe(3); // Initial + Edit 1 + New Branch
    expect(state.historyIndex).toBe(2);
    expect(state.canRedo()).toBe(false);
  });

  it('should handle redo correctly after undo', async () => {
    // Manually set up initial state
    useMindMapStore.setState({
      mindMapId: 'test-map',
      isInitialized: true,
      rootNodeId: 'root',
      nodes: [
        {
          id: 'root',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: { id: 'root', label: 'Root', isRoot: true, level: 0 },
        },
        {
          id: 'n1',
          type: 'mindMapNode',
          position: { x: 100, y: 0 },
          data: {
            id: 'n1',
            label: 'Original',
            isRoot: false,
            parentId: 'root',
            level: 1,
          },
        },
      ],
      edges: [],
      layout: 'LR',
      history: [],
      historyIndex: -1,
    });

    // Save initial state
    act(() => {
      useMindMapStore.getState().saveToHistory();
    });

    // Edit the node
    act(() => {
      const nodes = useMindMapStore
        .getState()
        .nodes.map(node =>
          node.id === 'n1'
            ? { ...node, data: { ...node.data, label: 'Modified' } }
            : node
        );
      useMindMapStore.setState({ nodes });
      useMindMapStore.getState().saveToHistory();
    });

    expect(
      useMindMapStore.getState().nodes.find(n => n.id === 'n1')?.data.label
    ).toBe('Modified');

    // Undo
    act(() => {
      useMindMapStore.getState().undo();
    });

    expect(
      useMindMapStore.getState().nodes.find(n => n.id === 'n1')?.data.label
    ).toBe('Original');
    expect(useMindMapStore.getState().canRedo()).toBe(true);

    // Redo
    act(() => {
      useMindMapStore.getState().redo();
    });

    expect(
      useMindMapStore.getState().nodes.find(n => n.id === 'n1')?.data.label
    ).toBe('Modified');
    expect(useMindMapStore.getState().canRedo()).toBe(false);

    // Verify node is not in editing state after redo
    const node = useMindMapStore.getState().nodes.find(n => n.id === 'n1');
    expect(node?.data.isEditing).toBeFalsy();
  });

  it('should not save temporary UI states in history', async () => {
    // Manually set up initial state
    useMindMapStore.setState({
      mindMapId: 'test-map',
      isInitialized: true,
      rootNodeId: 'root',
      nodes: [
        {
          id: 'root',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: { id: 'root', label: 'Root', isRoot: true, level: 0 },
        },
        {
          id: 'n1',
          type: 'mindMapNode',
          position: { x: 100, y: 0 },
          data: {
            id: 'n1',
            label: 'Node',
            isRoot: false,
            parentId: 'root',
            level: 1,
          },
        },
      ],
      edges: [],
      layout: 'LR',
      history: [],
      historyIndex: -1,
    });

    // Set various UI states that shouldn't be in history
    act(() => {
      const nodes = useMindMapStore.getState().nodes.map(node =>
        node.id === 'n1'
          ? {
              ...node,
              data: {
                ...node.data,
                isEditing: true,
                isDragging: true,
                isDropTarget: true,
                dropPosition: 'above' as const,
              },
            }
          : node
      );
      useMindMapStore.setState({ nodes });
    });

    // Save to history
    act(() => {
      useMindMapStore.getState().saveToHistory();
    });

    // Check that UI states are not saved in history
    const lastHistory =
      useMindMapStore.getState().history[
        useMindMapStore.getState().history.length - 1
      ];
    const historyNode = lastHistory.nodes.find(n => n.id === 'n1');

    expect(historyNode?.data.isEditing).toBeUndefined();
    expect(historyNode?.data.isDragging).toBeUndefined();
    expect(historyNode?.data.isDropTarget).toBeUndefined();
    expect(historyNode?.data.dropPosition).toBeUndefined();
  });

  it('should preserve node selection state correctly during undo/redo', async () => {
    // Manually set up initial state
    useMindMapStore.setState({
      mindMapId: 'test-map',
      isInitialized: true,
      rootNodeId: 'root',
      nodes: [
        {
          id: 'root',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: { id: 'root', label: 'Root', isRoot: true, level: 0 },
        },
        {
          id: 'n1',
          type: 'mindMapNode',
          position: { x: 100, y: 0 },
          data: {
            id: 'n1',
            label: 'Node 1',
            isRoot: false,
            parentId: 'root',
            level: 1,
          },
        },
        {
          id: 'n2',
          type: 'mindMapNode',
          position: { x: 100, y: 100 },
          data: {
            id: 'n2',
            label: 'Node 2',
            isRoot: false,
            parentId: 'root',
            level: 1,
          },
        },
      ],
      edges: [],
      layout: 'LR',
      history: [],
      historyIndex: -1,
      selectedNodeId: null,
    });

    // Save initial state
    act(() => {
      useMindMapStore.getState().saveToHistory();
    });

    // Select node 1 and edit
    act(() => {
      useMindMapStore.setState({ selectedNodeId: 'n1' });
      const nodes = useMindMapStore
        .getState()
        .nodes.map(node =>
          node.id === 'n1'
            ? { ...node, data: { ...node.data, label: 'Edited 1' } }
            : node
        );
      useMindMapStore.setState({ nodes });
      useMindMapStore.getState().saveToHistory();
    });

    expect(useMindMapStore.getState().selectedNodeId).toBe('n1');

    // Select node 2 and edit
    act(() => {
      useMindMapStore.setState({ selectedNodeId: 'n2' });
      const nodes = useMindMapStore
        .getState()
        .nodes.map(node =>
          node.id === 'n2'
            ? { ...node, data: { ...node.data, label: 'Edited 2' } }
            : node
        );
      useMindMapStore.setState({ nodes });
      useMindMapStore.getState().saveToHistory();
    });

    expect(useMindMapStore.getState().selectedNodeId).toBe('n2');

    // Undo - should restore previous selection
    act(() => {
      useMindMapStore.getState().undo();
    });

    expect(
      useMindMapStore.getState().nodes.find(n => n.id === 'n2')?.data.label
    ).toBe('Node 2');
    expect(useMindMapStore.getState().selectedNodeId).toBe('n1'); // Should restore previous selection

    // Undo again
    act(() => {
      useMindMapStore.getState().undo();
    });

    expect(
      useMindMapStore.getState().nodes.find(n => n.id === 'n1')?.data.label
    ).toBe('Node 1');
    expect(useMindMapStore.getState().selectedNodeId).toBeNull(); // Initial state had no selection
  });
});
