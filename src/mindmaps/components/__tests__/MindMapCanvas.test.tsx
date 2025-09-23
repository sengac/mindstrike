import React from 'react';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MindMapCanvas } from '../MindMapCanvas';
import { createMockFetch, resetApiMocks } from '../../__fixtures__/apiMocks';
import { mockMindMapData } from '../../__fixtures__/mindMapData';
import type { MindMapControls } from '../MindMap';

// Mock the store hooks
const mockStoreState = {
  isInitialized: true,
  mindMapId: 'test-mindmap',
};

const mockAppStore = {
  mindMapKeyBindings: {
    Tab: 'addChild',
    Enter: 'addSibling',
    Delete: 'deleteNode',
  },
  setMindMapKeyBindings: vi.fn(),
};

const mockSelection = {
  selectedNodeId: 'child-1',
};

const mockActions = {
  setNodeColors: vi.fn(),
  clearNodeColors: vi.fn(),
};

vi.mock('../../../store/useMindMapStore', () => ({
  useMindMapStore: vi.fn(selector => selector(mockStoreState)),
  useMindMapSelection: () => mockSelection,
  useMindMapActions: () => mockActions,
}));

vi.mock('../../../store/useAppStore', () => ({
  useAppStore: vi.fn(selector => selector(mockAppStore)),
}));

// Mock the MindMap component
const mockMindMapControls = {
  undo: vi.fn(),
  redo: vi.fn(),
  resetLayout: vi.fn(),
  changeLayout: vi.fn(),
  canUndo: true,
  canRedo: false,
  fitView: vi.fn(),
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  clearNodeColors: vi.fn(),
  currentLayout: 'LR' as const,
  selectedNodeId: null as string | null,
  setNodeColors: vi.fn(),
} as MindMapControls;

vi.mock('../MindMap', () => ({
  MindMap: ({
    onControlsReady,
    onSave,
    mindMapId,
  }: {
    onControlsReady?: (controls: MindMapControls) => void;
    onSave?: (data?: typeof mockMindMapData) => void;
    mindMapId?: string;
  }) => {
    React.useEffect(() => {
      if (onControlsReady) {
        onControlsReady(mockMindMapControls);
      }
    }, [onControlsReady]);

    return (
      <div data-testid="mind-map" data-mindmap-id={mindMapId}>
        <button onClick={() => onSave?.(mockMindMapData)}>Save</button>
      </div>
    );
  },
}));

// Mock other components
vi.mock('../../../components/ControlsModal', () => ({
  ControlsModal: ({
    isOpen,
    onClose,
    onKeyBindingsChange,
    initialKeyBindings,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onKeyBindingsChange?: (bindings: Record<string, string>) => void;
    initialKeyBindings?: Record<string, string>;
  }) => {
    if (!isOpen) {
      return null;
    }

    // Simulate real user interaction with key binding changes
    const handleDeleteBindingChange = () => {
      // When user changes delete binding, it should expand to both Delete and Backspace
      const updatedBindings: Record<string, string> = {};
      Object.entries(initialKeyBindings ?? {}).forEach(([key, action]) => {
        if (action === 'deleteNode' && key === 'Delete') {
          // User selected Delete/Backspace option
          updatedBindings['Delete'] = 'deleteNode';
          updatedBindings['Backspace'] = 'deleteNode';
        } else if (key !== 'Backspace') {
          updatedBindings[key] = action;
        }
      });
      onKeyBindingsChange?.(updatedBindings);
    };

    const handleAddChildBindingChange = () => {
      // Simulate changing the addChild binding
      onKeyBindingsChange?.({
        'Shift+A': 'addChild',
        // Keep other bindings
        Enter: initialKeyBindings?.Enter ?? '',
        Delete: initialKeyBindings?.Delete ?? '',
      });
    };

    return (
      <div data-testid="controls-modal">
        <button data-testid="close-modal" onClick={onClose}>
          Close
        </button>
        <button
          data-testid="change-bindings"
          onClick={handleAddChildBindingChange}
        >
          Change Add Child Binding
        </button>
        <button
          data-testid="change-delete-binding"
          onClick={handleDeleteBindingChange}
        >
          Change Delete Binding
        </button>
        <div data-testid="initial-bindings">
          {JSON.stringify(initialKeyBindings)}
        </div>
      </div>
    );
  },
}));

vi.mock('../../../components/ColorPalette', () => ({
  ColorPalette: ({
    selectedNodeId,
    onColorChange,
    onColorClear,
  }: {
    selectedNodeId?: string;
    onColorChange?: (color: {
      backgroundClass: string;
      foregroundClass: string;
    }) => void;
    onColorClear?: () => void;
  }) => (
    <div data-testid="color-palette" data-selected-node={selectedNodeId}>
      <button
        data-testid="set-color"
        onClick={() =>
          onColorChange?.({
            backgroundClass: 'bg-red-500',
            foregroundClass: 'text-white',
          })
        }
      >
        Set Color
      </button>
      <button data-testid="clear-color" onClick={() => onColorClear?.()}>
        Clear Color
      </button>
    </div>
  ),
}));

// Mock logger
vi.mock('../../../utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

describe('MindMapCanvas', () => {
  let user: ReturnType<typeof userEvent.setup>;
  let mockFetch: Mock;
  let mockLoadMindMaps: Mock;

  const mockActiveMindMap = {
    id: 'test-mindmap',
    name: 'Test Mind Map',
    description: 'A test mind map for testing',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
  };

  beforeEach(() => {
    user = userEvent.setup();
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockFetch = createMockFetch();
    global.fetch = mockFetch;

    mockLoadMindMaps = vi.fn().mockResolvedValue(undefined);

    resetApiMocks();

    // Set up successful API responses
    mockFetch.mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/mindmap') && (!options || options.method !== 'POST')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockMindMapData),
        });
      }

      if (url.includes('/mindmap') && options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });
      }

      return Promise.resolve({
        ok: false,
        status: 404,
      });
    });

    // Reset store states
    Object.assign(mockStoreState, {
      isInitialized: true,
      mindMapId: 'test-mindmap',
    });

    Object.assign(mockSelection, {
      selectedNodeId: 'child-1',
    });

    Object.assign(mockAppStore, {
      mindMapKeyBindings: {
        Tab: 'addChild',
        Enter: 'addSibling',
        Delete: 'deleteNode',
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('rendering', () => {
    it('should render empty state when no active mind map', () => {
      render(
        <MindMapCanvas activeMindMap={null} loadMindMaps={mockLoadMindMaps} />
      );

      expect(
        screen.getByText('Select a MindMap to get started')
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          'Choose from the list on the left or create a new MindMap'
        )
      ).toBeInTheDocument();
    });

    it('should render loading state initially when mind map is provided', () => {
      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('should render mind map after data loads', async () => {
      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('mind-map')).toBeInTheDocument();
      });

      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });

    it('should render description when provided', async () => {
      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByText('A test mind map for testing')
        ).toBeInTheDocument();
      });
    });

    it('should render React Flow attribution', async () => {
      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Built with')).toBeInTheDocument();
        expect(screen.getByText('React Flow')).toBeInTheDocument();
      });
    });
  });

  describe('data loading', () => {
    it('should load mind map data on mount', async () => {
      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/mindmaps/test-mindmap/mindmap'
        );
      });
    });

    it('should handle 404 response gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('mind-map')).toBeInTheDocument();
      });

      // Should still render mind map with no initial data
      expect(screen.getByTestId('mind-map')).toHaveAttribute(
        'data-mindmap-id',
        'test-mindmap'
      );
    });

    it('should handle fetch errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('mind-map')).toBeInTheDocument();
      });
    });

    it('should reload data when active mind map changes', async () => {
      const { rerender } = render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/mindmaps/test-mindmap/mindmap'
        );
      });

      const newMindMap = {
        ...mockActiveMindMap,
        id: 'new-mindmap',
        name: 'New Mind Map',
      };

      rerender(
        <MindMapCanvas
          activeMindMap={newMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/mindmaps/new-mindmap/mindmap'
        );
      });
    });

    it('should prevent duplicate loading requests', async () => {
      const { rerender } = render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      // Render again with same mind map immediately
      rerender(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('saving', () => {
    it('should save mind map data', async () => {
      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('mind-map')).toBeInTheDocument();
      });

      const saveButton = screen.getByText('Save');
      await user.click(saveButton);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/mindmaps/test-mindmap/mindmap',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(mockMindMapData),
        })
      );

      expect(mockLoadMindMaps).toHaveBeenCalledWith(true);
    });

    it('should handle save errors gracefully', async () => {
      const { logger } = await import('../../../utils/logger');

      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/mindmap') && options?.method === 'POST') {
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            text: () => Promise.resolve('Server error'),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockMindMapData),
        });
      });

      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('mind-map')).toBeInTheDocument();
      });

      const saveButton = screen.getByText('Save');
      await user.click(saveButton);

      await waitFor(() => {
        expect(logger.error).toHaveBeenCalledWith(
          'Failed to save mindmap:',
          expect.any(Object)
        );
      });
    });

    it('should not save when no active mind map', async () => {
      render(
        <MindMapCanvas activeMindMap={null} loadMindMaps={mockLoadMindMaps} />
      );

      // Should not have any save mechanism without active mind map
      expect(screen.queryByText('Save')).not.toBeInTheDocument();
    });
  });

  describe('controls', () => {
    beforeEach(async () => {
      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('mind-map')).toBeInTheDocument();
      });
    });

    it('should render controls when mind map is initialized', () => {
      expect(screen.getByTitle('Undo (Ctrl+Z)')).toBeInTheDocument();
      expect(screen.getByTitle('Redo (Ctrl+Shift+Z)')).toBeInTheDocument();
      expect(screen.getByTitle('Reset Layout')).toBeInTheDocument();
      expect(
        screen.getByTitle('Controls & Keyboard Shortcuts')
      ).toBeInTheDocument();
    });

    it('should handle undo action', async () => {
      const undoButton = screen.getByTitle('Undo (Ctrl+Z)');
      await user.click(undoButton);

      expect(mockMindMapControls.undo).toHaveBeenCalled();
    });

    it('should handle redo action', async () => {
      const redoButton = screen.getByTitle('Redo (Ctrl+Shift+Z)');
      await user.click(redoButton);

      expect(mockMindMapControls.redo).toHaveBeenCalled();
    });

    it('should handle reset layout action', async () => {
      const resetButton = screen.getByTitle('Reset Layout');
      await user.click(resetButton);

      expect(mockMindMapControls.resetLayout).toHaveBeenCalled();
    });

    it('should disable undo/redo buttons when not available', () => {
      mockMindMapControls.canUndo = false;
      mockMindMapControls.canRedo = false;

      const { rerender } = render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      // Re-render to update control states
      rerender(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      expect(screen.getByTitle('Undo (Ctrl+Z)')).toBeDisabled();
      expect(screen.getByTitle('Redo (Ctrl+Shift+Z)')).toBeDisabled();
    });

    it('should not render controls when not initialized', () => {
      mockStoreState.isInitialized = false;

      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      expect(screen.queryByTitle('Undo (Ctrl+Z)')).not.toBeInTheDocument();
    });

    it('should not render controls for different mind map', () => {
      mockStoreState.mindMapId = 'different-mindmap';

      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      expect(screen.queryByTitle('Undo (Ctrl+Z)')).not.toBeInTheDocument();
    });
  });

  describe('layout controls', () => {
    beforeEach(async () => {
      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('mind-map')).toBeInTheDocument();
      });
    });

    it('should render layout direction buttons', () => {
      expect(screen.getByTitle('Left to Right')).toBeInTheDocument();
      expect(screen.getByTitle('Right to Left')).toBeInTheDocument();
      expect(screen.getByTitle('Top to Bottom')).toBeInTheDocument();
      expect(screen.getByTitle('Bottom to Top')).toBeInTheDocument();
    });

    it('should highlight current layout', () => {
      const lrButton = screen.getByTitle('Left to Right');
      expect(lrButton).toHaveClass('bg-blue-600', 'border-blue-500');
    });

    it('should handle layout changes', async () => {
      const tbButton = screen.getByTitle('Top to Bottom');
      await user.click(tbButton);

      expect(mockMindMapControls.changeLayout).toHaveBeenCalledWith('TB');
    });

    it('should handle all layout directions', async () => {
      const layouts = [
        { title: 'Right to Left', value: 'RL' },
        { title: 'Top to Bottom', value: 'TB' },
        { title: 'Bottom to Top', value: 'BT' },
      ];

      for (const layout of layouts) {
        const button = screen.getByTitle(layout.title);
        await user.click(button);
        expect(mockMindMapControls.changeLayout).toHaveBeenCalledWith(
          layout.value
        );
      }
    });
  });

  describe('color palette', () => {
    beforeEach(async () => {
      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('mind-map')).toBeInTheDocument();
      });
    });

    it('should render color palette when node is selected', () => {
      expect(screen.getByTestId('color-palette')).toBeInTheDocument();
      expect(screen.getByTestId('color-palette')).toHaveAttribute(
        'data-selected-node',
        'child-1'
      );
    });

    it('should not render color palette when no node is selected', () => {
      mockSelection.selectedNodeId = '';

      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      expect(screen.queryByTestId('color-palette')).not.toBeInTheDocument();
    });

    it('should handle color changes', async () => {
      const setColorButton = screen.getByTestId('set-color');
      await user.click(setColorButton);

      expect(mockActions.setNodeColors).toHaveBeenCalledWith('child-1', {
        backgroundClass: 'bg-red-500',
        foregroundClass: 'text-white',
      });
    });

    it('should handle color clearing', async () => {
      const clearColorButton = screen.getByTestId('clear-color');
      await user.click(clearColorButton);

      expect(mockActions.clearNodeColors).toHaveBeenCalledWith('child-1');
    });
  });

  describe('controls modal', () => {
    beforeEach(async () => {
      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('mind-map')).toBeInTheDocument();
      });
    });

    it('should open controls modal', async () => {
      const settingsButton = screen.getByTitle('Controls & Keyboard Shortcuts');
      await user.click(settingsButton);

      expect(screen.getByTestId('controls-modal')).toBeInTheDocument();
    });

    it('should close controls modal', async () => {
      const settingsButton = screen.getByTitle('Controls & Keyboard Shortcuts');
      await user.click(settingsButton);

      expect(screen.getByTestId('controls-modal')).toBeInTheDocument();

      const closeButton = screen.getByTestId('close-modal');
      await user.click(closeButton);

      expect(screen.queryByTestId('controls-modal')).not.toBeInTheDocument();
    });

    it('should pass initial key bindings to modal', async () => {
      const settingsButton = screen.getByTitle('Controls & Keyboard Shortcuts');
      await user.click(settingsButton);

      const initialBindings = screen.getByTestId('initial-bindings');
      const bindingsText = initialBindings.textContent;
      const bindings = JSON.parse(bindingsText ?? '{}');

      expect(bindings).toEqual({
        Tab: 'addChild',
        Enter: 'addSibling',
        Delete: 'deleteNode',
      });
    });

    it('should handle key bindings changes', async () => {
      const settingsButton = screen.getByTitle('Controls & Keyboard Shortcuts');
      await user.click(settingsButton);

      const changeBindingsButton = screen.getByTestId('change-bindings');
      await user.click(changeBindingsButton);

      expect(mockAppStore.setMindMapKeyBindings).toHaveBeenCalledWith({
        Delete: 'addChild',
        Backspace: 'addChild',
      });
    });

    it('should expand Delete/Backspace bindings', async () => {
      const settingsButton = screen.getByTitle('Controls & Keyboard Shortcuts');
      await user.click(settingsButton);

      // Click the button that simulates changing delete binding to Delete/Backspace
      const changeDeleteButton = screen.getByTestId('change-delete-binding');
      await user.click(changeDeleteButton);

      expect(mockAppStore.setMindMapKeyBindings).toHaveBeenCalledWith({
        Delete: 'deleteNode',
        Backspace: 'deleteNode',
      });
    });
  });

  describe('external node updates', () => {
    it('should pass external node updates to MindMap component', async () => {
      const pendingUpdate = {
        nodeId: 'test-node',
        chatId: 'new-chat-id',
        notes: 'Updated notes',
        sources: [],
        timestamp: Date.now(),
      };

      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
          pendingNodeUpdate={pendingUpdate}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('mind-map')).toBeInTheDocument();
      });

      // The MindMap component should receive the external updates
      const mindMapElement = screen.getByTestId('mind-map');
      expect(mindMapElement).toBeInTheDocument();
    });
  });

  describe('error handling', () => {
    it('should handle missing controls gracefully', async () => {
      // Override the mock to not call onControlsReady
      vi.unmock('../MindMap');
      vi.mock('../MindMap', () => ({
        MindMap: vi.fn(({ mindMapId }: { mindMapId: string }) => {
          // Don't call onControlsReady for this test - simulating missing controls
          return (
            <div data-testid="mind-map" data-mindmap-id={mindMapId}>
              No controls
            </div>
          );
        }),
      }));

      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('mind-map')).toBeInTheDocument();
      });

      // Should render controls but they should be disabled/non-functional
      const undoButton = screen.getByTitle('Undo (Ctrl+Z)');
      await user.click(undoButton);

      // Should not crash when controls are missing
      expect(screen.getByTestId('mind-map')).toBeInTheDocument();
    });

    it('should handle save failures gracefully', async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/mindmap') && options?.method === 'POST') {
          return Promise.reject(new Error('Save failed'));
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockMindMapData),
        });
      });

      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('mind-map')).toBeInTheDocument();
      });

      const saveButton = screen.getByText('Save');
      await user.click(saveButton);

      // Should handle error gracefully without crashing
      expect(screen.getByTestId('mind-map')).toBeInTheDocument();
    });
  });

  describe('cleanup', () => {
    it('should not crash when unmounting during loading', async () => {
      const { unmount } = render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      // Unmount before loading completes
      expect(() => unmount()).not.toThrow();
    });

    it('should handle component updates correctly', async () => {
      const { rerender } = render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('mind-map')).toBeInTheDocument();
      });

      // Update with new props
      const updatedMindMap = {
        ...mockActiveMindMap,
        description: 'Updated description',
      };

      rerender(
        <MindMapCanvas
          activeMindMap={updatedMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      expect(screen.getByText('Updated description')).toBeInTheDocument();
    });
  });
});
