import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { useMindMapStore } from '../useMindMapStore';
import { createTestMindMapData } from './testHelpers';

// Mock the SSE event bus
vi.mock('../../utils/sseEventBus', () => ({
  sseEventBus: {
    subscribe: vi.fn(() => () => {}),
    unsubscribe: vi.fn(),
  },
}));

describe('Text Edit Undo/Redo Bug Fix', () => {
  beforeEach(() => {
    const store = useMindMapStore.getState();
    store.reset();
  });

  it('should NOT reopen editor when undoing text changes', async () => {
    // Initialize mindmap
    await act(async () => {
      await useMindMapStore.getState().initializeMindMap(
        'test-map',
        createTestMindMapData(
          [
            {
              id: 'root',
              label: 'Root',
              isRoot: true,
              level: 0,
              children: ['child1'],
            },
            {
              id: 'child1',
              label: 'Original Text',
              parentId: 'root',
              level: 1,
              children: [],
            },
          ],
          'LR'
        ),
        async () => {}
      );
    });

    // Wait for initialization to complete
    await waitFor(() => {
      const state = useMindMapStore.getState();
      expect(state.isInitialized).toBe(true);
      expect(state.nodes.length).toBeGreaterThan(0);
    });

    // Simulate editing process:
    // 1. User starts editing (isEditing = true)
    act(() => {
      const state = useMindMapStore.getState();
      const nodes = state.nodes.map(node =>
        node.id === 'child1'
          ? { ...node, data: { ...node.data, isEditing: true } }
          : node
      );
      useMindMapStore.setState({ nodes });
    });

    // 2. User changes text and finishes editing (isEditing = false)
    await act(async () => {
      await useMindMapStore
        .getState()
        .updateNodeLabelWithLayout('child1', 'New Text');
    });

    // Manually set isEditing to false (simulating UI behavior)
    act(() => {
      const nodes = useMindMapStore
        .getState()
        .nodes.map(node =>
          node.id === 'child1'
            ? { ...node, data: { ...node.data, isEditing: false } }
            : node
        );
      useMindMapStore.setState({ nodes });
    });

    // Verify the edit completed
    let node = useMindMapStore.getState().nodes.find(n => n.id === 'child1');
    expect(node?.data.label).toBe('New Text');
    expect(node?.data.isEditing).toBe(false);

    // 3. User performs undo
    act(() => {
      useMindMapStore.getState().undo();
    });

    // Verify: text should revert BUT editor should NOT reopen
    node = useMindMapStore.getState().nodes.find(n => n.id === 'child1');
    expect(node?.data.label).toBe('Original Text');
    expect(node?.data.isEditing).toBe(false); // This is the critical assertion
  });

  it('should preserve current editing state during undo/redo', async () => {
    await act(async () => {
      await useMindMapStore.getState().initializeMindMap(
        'test-map',
        createTestMindMapData(
          [
            {
              id: 'root',
              label: 'Root',
              isRoot: true,
              level: 0,
              children: ['n1', 'n2'],
            },
            {
              id: 'n1',
              label: 'Node 1',
              parentId: 'root',
              level: 1,
              children: [],
            },
            {
              id: 'n2',
              label: 'Node 2',
              parentId: 'root',
              level: 1,
              children: [],
            },
          ],
          'LR'
        ),
        async () => {}
      );
    });

    await waitFor(() => {
      const state = useMindMapStore.getState();
      expect(state.isInitialized).toBe(true);
      expect(state.nodes.length).toBe(3);
    });

    // Edit node 1
    await act(async () => {
      await useMindMapStore
        .getState()
        .updateNodeLabelWithLayout('n1', 'Edited Node 1');
    });

    // Start editing node 2 (but don't finish)
    act(() => {
      const nodes = useMindMapStore
        .getState()
        .nodes.map(node =>
          node.id === 'n2'
            ? { ...node, data: { ...node.data, isEditing: true } }
            : node
        );
      useMindMapStore.setState({ nodes });
    });

    // Verify n2 is in editing state
    let n2 = useMindMapStore.getState().nodes.find(n => n.id === 'n2');
    expect(n2?.data.isEditing).toBe(true);

    // Undo the change to n1
    act(() => {
      useMindMapStore.getState().undo();
    });

    // Verify n1 reverted but n2 is STILL in editing state
    const n1 = useMindMapStore.getState().nodes.find(n => n.id === 'n1');
    n2 = useMindMapStore.getState().nodes.find(n => n.id === 'n2');

    expect(n1?.data.label).toBe('Node 1');
    expect(n2?.data.isEditing).toBe(true); // Should preserve current editing state
  });

  it('should handle drag state correctly during undo/redo', async () => {
    await act(async () => {
      await useMindMapStore.getState().initializeMindMap(
        'test-map',
        createTestMindMapData(
          [
            {
              id: 'root',
              label: 'Root',
              isRoot: true,
              level: 0,
              children: ['n1'],
            },
            {
              id: 'n1',
              label: 'Node',
              parentId: 'root',
              level: 1,
              children: [],
            },
          ],
          'LR'
        ),
        async () => {}
      );
    });

    await waitFor(() => {
      const state = useMindMapStore.getState();
      expect(state.isInitialized).toBe(true);
    });

    // Make a change
    await act(async () => {
      await useMindMapStore
        .getState()
        .updateNodeLabelWithLayout('n1', 'Changed');
    });

    // Start dragging
    act(() => {
      const nodes = useMindMapStore
        .getState()
        .nodes.map(node =>
          node.id === 'n1'
            ? { ...node, data: { ...node.data, isDragging: true } }
            : node
        );
      useMindMapStore.setState({ nodes });
    });

    // Undo while dragging
    act(() => {
      useMindMapStore.getState().undo();
    });

    // Verify text reverted but drag state preserved
    const node = useMindMapStore.getState().nodes.find(n => n.id === 'n1');
    expect(node?.data.label).toBe('Node');
    expect(node?.data.isDragging).toBe(true);
  });

  it('should not save any transient properties in history', async () => {
    await act(async () => {
      await useMindMapStore.getState().initializeMindMap(
        'test-map',
        createTestMindMapData(
          [
            {
              id: 'root',
              label: 'Root',
              isRoot: true,
              level: 0,
              children: ['n1'],
            },
            {
              id: 'n1',
              label: 'Node',
              parentId: 'root',
              level: 1,
              children: [],
            },
          ],
          'LR'
        ),
        async () => {}
      );
    });

    await waitFor(() => {
      const state = useMindMapStore.getState();
      expect(state.isInitialized).toBe(true);
    });

    // Set multiple transient states
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
              selected: true,
              dragging: true,
            }
          : node
      );
      useMindMapStore.setState({ nodes });
    });

    // Save to history
    act(() => {
      useMindMapStore.getState().saveToHistory();
    });

    // Check history entry
    const history = useMindMapStore.getState().history;
    const lastEntry = history[history.length - 1];
    const historyNode = lastEntry.nodes.find(n => n.id === 'n1');

    // All transient properties should be cleaned
    expect(historyNode?.data.isEditing).toBeUndefined();
    expect(historyNode?.data.isDragging).toBeUndefined();
    expect(historyNode?.data.isDropTarget).toBeUndefined();
    expect(historyNode?.data.dropPosition).toBeUndefined();
    expect(historyNode?.selected).toBe(false);
    expect(historyNode?.dragging).toBe(false);
  });
});
