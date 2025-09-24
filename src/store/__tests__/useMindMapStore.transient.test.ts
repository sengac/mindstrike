import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useMindMapStore } from '../useMindMapStore';
import { cleanNodes } from '../../mindmaps/utils/transientProperties';

// Mock the SSE event bus
vi.mock('../../utils/sseEventBus', () => ({
  sseEventBus: {
    subscribe: vi.fn(() => () => {}),
    unsubscribe: vi.fn(),
  },
}));

describe('Transient Property Filtering', () => {
  beforeEach(() => {
    const store = useMindMapStore.getState();
    store.reset();
  });

  it('cleanNodes should remove transient properties', () => {
    const nodes = [
      {
        id: 'test',
        type: 'mindMapNode' as const,
        position: { x: 0, y: 0 },
        data: {
          id: 'test',
          label: 'Test Node',
          isRoot: true,
          isEditing: true,
          isDragging: true,
          isDropTarget: true,
          dropPosition: 'above' as const,
        },
        selected: true,
        dragging: true,
      },
    ];

    const cleaned = cleanNodes(nodes);

    // Check that transient properties are removed
    expect(cleaned[0].data.isEditing).toBeUndefined();
    expect(cleaned[0].data.isDragging).toBeUndefined();
    expect(cleaned[0].data.isDropTarget).toBeUndefined();
    expect(cleaned[0].data.dropPosition).toBeUndefined();
    expect(cleaned[0].selected).toBe(false);
    expect(cleaned[0].dragging).toBe(false);

    // Check that non-transient properties are preserved
    expect(cleaned[0].data.label).toBe('Test Node');
    expect(cleaned[0].data.isRoot).toBe(true);
  });

  it('saveToHistory should clean nodes before saving', async () => {
    // Manually set up initial state
    useMindMapStore.setState({
      mindMapId: 'test',
      isInitialized: true,
      rootNodeId: 'root',
      nodes: [
        {
          id: 'root',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'root',
            label: 'Root',
            isRoot: true,
            isEditing: true, // This should NOT be in history
            isDragging: true, // This should NOT be in history
          },
          selected: true, // This should be false in history
        },
      ],
      edges: [],
      layout: 'LR',
    });

    // Save to history
    useMindMapStore.getState().saveToHistory();

    // Check history
    const history = useMindMapStore.getState().history;
    expect(history.length).toBe(1);

    const savedNode = history[0].nodes[0];
    expect(savedNode.data.isEditing).toBeUndefined();
    expect(savedNode.data.isDragging).toBeUndefined();
    expect(savedNode.selected).toBe(false);
    expect(savedNode.data.label).toBe('Root'); // Non-transient data preserved
  });

  it('undo should preserve current transient states', async () => {
    // Set up initial state
    useMindMapStore.setState({
      mindMapId: 'test',
      isInitialized: true,
      rootNodeId: 'root',
      nodes: [
        {
          id: 'root',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'root',
            label: 'Original',
            isRoot: true,
          },
        },
      ],
      edges: [],
      layout: 'LR',
      history: [],
      historyIndex: -1,
    });

    // Save initial state
    useMindMapStore.getState().saveToHistory();

    // Change label
    useMindMapStore.setState({
      nodes: [
        {
          id: 'root',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'root',
            label: 'Changed',
            isRoot: true,
          },
        },
      ],
    });
    useMindMapStore.getState().saveToHistory();

    // Now add transient state (user starts editing)
    useMindMapStore.setState({
      nodes: [
        {
          id: 'root',
          type: 'mindMapNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'root',
            label: 'Changed',
            isRoot: true,
            isEditing: true, // User is currently editing
          },
        },
      ],
    });

    // Undo while editing
    useMindMapStore.getState().undo();

    // Check that label reverted but editing state preserved
    const node = useMindMapStore.getState().nodes[0];
    expect(node.data.label).toBe('Original');
    expect(node.data.isEditing).toBe(true); // Should still be editing!
  });
});
