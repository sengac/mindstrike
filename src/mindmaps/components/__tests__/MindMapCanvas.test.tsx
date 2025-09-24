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
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MindMapCanvas } from '../MindMapCanvas';
import { createMockFetch, resetApiMocks } from '../../__fixtures__/apiMocks';
import { mockMindMapData } from '../../__fixtures__/mindMapData';
import type { MindMapControls } from '../MindMap';
import { MindMap } from '../MindMap';

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
  canRedo: true,
  fitView: vi.fn(),
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  clearNodeColors: vi.fn(),
  currentLayout: 'LR' as const,
  selectedNodeId: null as string | null,
  setNodeColors: vi.fn(),
} as MindMapControls;

vi.mock('../MindMap', () => ({
  MindMap: vi.fn(
    (props: {
      onControlsReady?: (controls: MindMapControls) => void;
      onSave?: (data?: typeof mockMindMapData) => void;
      mindMapId?: string;
    }) => {
      // Call onControlsReady immediately
      React.useEffect(() => {
        if (props.onControlsReady) {
          props.onControlsReady(mockMindMapControls);
        }
      }, [props.onControlsReady]);

      return (
        <div data-testid="mind-map" data-mindmap-id={props.mindMapId}>
          <button onClick={() => props.onSave?.(mockMindMapData)}>Save</button>
        </div>
      );
    }
  ),
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
      // The component expects actionId => key format
      onKeyBindingsChange?.({
        deleteNode: 'Delete/Backspace',
        addChild: 'Tab',
        addSibling: 'Enter',
      });
    };

    const handleAddChildBindingChange = () => {
      // Simulate changing the addChild binding
      onKeyBindingsChange?.({
        'Shift+A': 'addChild',
        Enter: 'addSibling',
        Delete: 'deleteNode',
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

// Helper to wait for MindMap component to appear
const waitForMindMap = async () => {
  await waitFor(
    () => {
      expect(screen.getByTestId('mind-map')).toBeTruthy();
    },
    { timeout: 3000 }
  );
};

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
    user = userEvent.setup({ delay: null });
    vi.clearAllMocks();
    // Don't use fake timers for these tests as they interfere with async operations
    // vi.useFakeTimers();

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
        } as Response);
      }

      if (url.includes('/mindmap') && options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        } as Response);
      }

      return Promise.resolve({
        ok: false,
        status: 404,
      } as Response);
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
    // vi.useRealTimers(); // Not needed since we're not using fake timers
    vi.restoreAllMocks();
  });

  describe('rendering', () => {
    it('should render loading indicator while data is loading', async () => {
      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      // Initially should show loading
      expect(screen.getByText('Loading...')).toBeTruthy();

      // Wait for all updates to complete to avoid act warnings
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });
    });

    it('should render empty state when no active mind map', () => {
      render(
        <MindMapCanvas activeMindMap={null} loadMindMaps={mockLoadMindMaps} />
      );

      expect(screen.getByText('Select a MindMap to get started')).toBeTruthy();
      expect(
        screen.getByText(
          'Choose from the list on the left or create a new MindMap'
        )
      ).toBeTruthy();
    });

    it('should render loading state initially when mind map is provided', async () => {
      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      expect(screen.getByText('Loading...')).toBeTruthy();

      // Wait for loading to complete
      await waitFor(() => {
        expect(screen.queryByText('Loading...')).toBeFalsy();
      });
    });

    it('should render mind map after data loads', async () => {
      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      // Wait for fetch to be called
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/mindmaps/test-mindmap/mindmap'
        );
      });

      // Then wait for MindMap to appear
      await waitForMindMap();

      // Verify the mind map is rendered with correct ID
      const mindMap = screen.getByTestId('mind-map');
      expect(mindMap.getAttribute('data-mindmap-id')).toBe('test-mindmap');
    });

    it('should render description when provided', async () => {
      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('A test mind map for testing')).toBeTruthy();
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
        expect(screen.getByText('Built with')).toBeTruthy();
        expect(screen.getByText('React Flow')).toBeTruthy();
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

      await waitForMindMap();

      // Should still render mind map with no initial data
      expect(
        screen.getByTestId('mind-map').getAttribute('data-mindmap-id')
      ).toBe('test-mindmap');
    });

    it('should handle fetch errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      // Wait for the error to be handled
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      // Component should show loading state when fetch fails
      expect(screen.getByText('Loading...')).toBeTruthy();
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

      await waitForMindMap();

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

      await waitForMindMap();

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
      expect(screen.queryByText('Save')).toBeFalsy();
    });
  });

  describe('controls', () => {
    it('should render controls when mind map is initialized', async () => {
      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitForMindMap();
      expect(screen.getByTitle('Undo (Ctrl+Z)')).toBeTruthy();
      expect(screen.getByTitle('Redo (Ctrl+Shift+Z)')).toBeTruthy();
      expect(screen.getByTitle('Reset Layout')).toBeTruthy();
      expect(screen.getByTitle('Controls & Keyboard Shortcuts')).toBeTruthy();
    });

    it('should handle undo action', async () => {
      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitForMindMap();
      const undoButton = screen.getByTitle('Undo (Ctrl+Z)');
      await user.click(undoButton);

      expect(mockMindMapControls.undo).toHaveBeenCalled();
    });

    it('should handle redo action', async () => {
      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitForMindMap();
      const redoButton = screen.getByTitle('Redo (Ctrl+Shift+Z)');
      await user.click(redoButton);

      expect(mockMindMapControls.redo).toHaveBeenCalled();
    });

    it('should handle reset layout action', async () => {
      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitForMindMap();
      const resetButton = screen.getByTitle('Reset Layout');
      await user.click(resetButton);

      expect(mockMindMapControls.resetLayout).toHaveBeenCalled();
    });

    it('should disable undo/redo buttons when not available', async () => {
      mockMindMapControls.canUndo = false;
      mockMindMapControls.canRedo = false;

      const { rerender } = render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitForMindMap();

      // Re-render to update control states
      rerender(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByTitle('Undo (Ctrl+Z)').getAttribute('disabled')
        ).toBe('');
        expect(
          screen.getByTitle('Redo (Ctrl+Shift+Z)').getAttribute('disabled')
        ).toBe('');
      });
    });

    it('should not render controls when not initialized', async () => {
      mockStoreState.isInitialized = false;

      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitForMindMap();

      expect(screen.queryByTitle('Undo (Ctrl+Z)')).toBeFalsy();
    });

    it('should not render controls for different mind map', async () => {
      mockStoreState.mindMapId = 'different-mindmap';

      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitForMindMap();

      expect(screen.queryByTitle('Undo (Ctrl+Z)')).toBeFalsy();
    });
  });

  describe('layout controls', () => {
    it('should render layout direction buttons', async () => {
      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitForMindMap();
      expect(screen.getByTitle('Left to Right')).toBeTruthy();
      expect(screen.getByTitle('Right to Left')).toBeTruthy();
      expect(screen.getByTitle('Top to Bottom')).toBeTruthy();
      expect(screen.getByTitle('Bottom to Top')).toBeTruthy();
    });

    it('should highlight current layout', async () => {
      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitForMindMap();
      const lrButton = screen.getByTitle('Left to Right');
      const classes = lrButton.getAttribute('class') || '';
      expect(classes).toContain('bg-blue-600');
      expect(classes).toContain('border-blue-500');
    });

    it('should handle layout changes', async () => {
      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitForMindMap();
      const tbButton = screen.getByTitle('Top to Bottom');
      await user.click(tbButton);

      expect(mockMindMapControls.changeLayout).toHaveBeenCalledWith('TB');
    });

    it('should handle all layout directions', async () => {
      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitForMindMap();

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
    it('should render color palette when node is selected', async () => {
      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitForMindMap();
      expect(screen.getByTestId('color-palette')).toBeTruthy();
      expect(
        screen.getByTestId('color-palette').getAttribute('data-selected-node')
      ).toBe('child-1');
    });

    it('should not render color palette when no node is selected', async () => {
      mockSelection.selectedNodeId = '';

      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitForMindMap();

      expect(screen.queryByTestId('color-palette')).toBeFalsy();
    });

    it('should handle color changes', async () => {
      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitForMindMap();
      const setColorButton = screen.getByTestId('set-color');
      await user.click(setColorButton);

      expect(mockActions.setNodeColors).toHaveBeenCalledWith('child-1', {
        backgroundClass: 'bg-red-500',
        foregroundClass: 'text-white',
      });
    });

    it('should handle color clearing', async () => {
      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitForMindMap();
      const clearColorButton = screen.getByTestId('clear-color');
      await user.click(clearColorButton);

      expect(mockActions.clearNodeColors).toHaveBeenCalledWith('child-1');
    });
  });

  describe('controls modal', () => {
    it('should open controls modal', async () => {
      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitForMindMap();
      const settingsButton = screen.getByTitle('Controls & Keyboard Shortcuts');
      await user.click(settingsButton);

      expect(screen.getByTestId('controls-modal')).toBeTruthy();
    });

    it('should close controls modal', async () => {
      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitForMindMap();
      const settingsButton = screen.getByTitle('Controls & Keyboard Shortcuts');
      await user.click(settingsButton);

      expect(screen.getByTestId('controls-modal')).toBeTruthy();

      const closeButton = screen.getByTestId('close-modal');
      await user.click(closeButton);

      expect(screen.queryByTestId('controls-modal')).toBeFalsy();
    });

    it('should pass initial key bindings to modal', async () => {
      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitForMindMap();
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
      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitForMindMap();
      const settingsButton = screen.getByTitle('Controls & Keyboard Shortcuts');
      await user.click(settingsButton);

      const changeBindingsButton = screen.getByTestId('change-bindings');
      await user.click(changeBindingsButton);

      expect(mockAppStore.setMindMapKeyBindings).toHaveBeenCalledWith({
        addChild: 'Shift+A',
        addSibling: 'Enter',
        deleteNode: 'Delete',
      });
    });

    it('should expand Delete/Backspace bindings', async () => {
      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitForMindMap();
      const settingsButton = screen.getByTitle('Controls & Keyboard Shortcuts');
      await user.click(settingsButton);

      // Click the button that simulates changing delete binding to Delete/Backspace
      const changeDeleteButton = screen.getByTestId('change-delete-binding');
      await user.click(changeDeleteButton);

      expect(mockAppStore.setMindMapKeyBindings).toHaveBeenCalledWith({
        Tab: 'addChild',
        Enter: 'addSibling',
        Delete: 'deleteNode',
        Backspace: 'deleteNode',
      });
    });
  });

  describe('error handling', () => {
    it('should handle missing controls gracefully', async () => {
      // Override the MindMap mock temporarily for this test
      vi.mocked(MindMap).mockImplementation(
        ({ mindMapId }: { mindMapId: string }) => {
          // Don't call onControlsReady for this test - simulating missing controls
          return (
            <div data-testid="mind-map" data-mindmap-id={mindMapId}>
              No controls
            </div>
          );
        }
      );

      render(
        <MindMapCanvas
          activeMindMap={mockActiveMindMap}
          loadMindMaps={mockLoadMindMaps}
        />
      );

      await waitForMindMap();

      // Should render controls but they should be disabled/non-functional
      const undoButton = screen.getByTitle('Undo (Ctrl+Z)');
      await user.click(undoButton);

      // Should not crash when controls are missing
      expect(screen.getByTestId('mind-map')).toBeTruthy();

      // Restore the original mock
      vi.mocked(MindMap).mockImplementation(
        vi.fn(props => {
          // Call onControlsReady immediately
          React.useEffect(() => {
            if (props.onControlsReady) {
              props.onControlsReady(mockMindMapControls);
            }
          }, [props.onControlsReady]);

          return (
            <div data-testid="mind-map" data-mindmap-id={props.mindMapId}>
              <button onClick={() => props.onSave(mockMindMapData)}>
                Save
              </button>
            </div>
          );
        })
      );
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

      await waitForMindMap();

      const saveButton = screen.getByText('Save');
      await user.click(saveButton);

      // Should handle error gracefully without crashing
      expect(screen.getByTestId('mind-map')).toBeTruthy();
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

      await waitForMindMap();

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

      expect(screen.getByText('Updated description')).toBeTruthy();
    });
  });
});
