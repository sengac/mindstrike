import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MindMapNode } from '../MindMapNode';
import {
  createMockNodeProps,
  createMockContextMenuEvent,
} from '../../__fixtures__/reactFlowMocks';
import { mockNodeData, mockSources } from '../../__fixtures__/mindMapData';

// Helper to get visible text elements (not measurement spans)
const getVisibleText = (text: string) => {
  const elements = screen.getAllByText(text);
  const visibleElement = elements.find(
    el => !el.classList.contains('pointer-events-none')
  );
  if (!visibleElement) {
    throw new Error(`No visible element found with text: ${text}`);
  }
  return visibleElement;
};

// Mock the store hooks
const mockActions = {
  addChildNode: vi.fn(),
  addSiblingNode: vi.fn(),
  deleteNode: vi.fn(),
  updateNodeLabelWithLayout: vi.fn(),
  toggleNodeCollapse: vi.fn(),
};

const mockSelection = {
  selectNode: vi.fn(),
};

vi.mock('../../../store/useMindMapStore', () => ({
  useMindMapActions: () => mockActions,
  useMindMapSelection: () => mockSelection,
}));

describe('MindMapNode', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Mock document.querySelector for context menu handling
    vi.spyOn(document, 'querySelector').mockReturnValue(null);

    // Mock getBoundingClientRect
    Element.prototype.getBoundingClientRect = vi.fn(() => ({
      left: 100,
      top: 100,
      width: 200,
      height: 50,
      right: 300,
      bottom: 150,
      x: 100,
      y: 100,
      toJSON: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('rendering', () => {
    it('should render basic node with label', () => {
      const props = createMockNodeProps({
        data: mockNodeData.root,
      });

      render(<MindMapNode {...props} />);

      // Find the visible text element (not the measurement span)
      const visibleText = screen
        .getAllByText('Root Topic')
        .find(el => !el.classList.contains('pointer-events-none'));
      expect(visibleText).toBeInTheDocument();
      expect(
        screen.getByTestId('react-flow-handle-target-top-top')
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('react-flow-handle-source-right-right-source')
      ).toBeInTheDocument();
    });

    it('should render root node with special styling', () => {
      const props = createMockNodeProps({
        data: { ...mockNodeData.root, isRoot: true },
      });

      render(<MindMapNode {...props} />);

      const nodeElement = getVisibleText('Root Topic').closest('div');
      expect(nodeElement).toHaveClass('shadow-lg', 'scale-110');
    });

    it('should render selected node with selection ring', () => {
      const props = createMockNodeProps({
        data: mockNodeData.child1,
        selected: true,
      });

      render(<MindMapNode {...props} />);

      const nodeElement = getVisibleText('First Child').closest('div');
      expect(nodeElement).toHaveClass('ring-2', 'ring-yellow-400');
    });

    it('should render node with custom colors', () => {
      const props = createMockNodeProps({
        data: {
          ...mockNodeData.child1,
          customColors: {
            backgroundClass: 'bg-blue-500',
            foregroundClass: 'text-white',
          },
        },
      });

      render(<MindMapNode {...props} />);

      const nodeElement = getVisibleText('First Child').closest('div');
      expect(nodeElement).toHaveClass('bg-blue-500');
    });

    it('should render dragging state with opacity and scaling', () => {
      const props = createMockNodeProps({
        data: { ...mockNodeData.child1, isDragging: true },
      });

      render(<MindMapNode {...props} />);

      const nodeElement = getVisibleText('First Child').closest('div');
      expect(nodeElement).toHaveClass(
        'opacity-30',
        'scale-95',
        'ring-2',
        'ring-blue-400'
      );
    });

    it('should render drop target indicators', () => {
      const propsAbove = createMockNodeProps({
        data: {
          ...mockNodeData.child1,
          isDropTarget: true,
          dropPosition: 'above',
        },
      });

      const { rerender } = render(<MindMapNode {...propsAbove} />);
      expect(document.querySelector('.bg-green-400')).toBeInTheDocument();

      const propsBelow = createMockNodeProps({
        data: {
          ...mockNodeData.child1,
          isDropTarget: true,
          dropPosition: 'below',
        },
      });

      rerender(<MindMapNode {...propsBelow} />);
      expect(document.querySelector('.bg-green-400')).toBeInTheDocument();

      const propsOver = createMockNodeProps({
        data: {
          ...mockNodeData.child1,
          isDropTarget: true,
          dropPosition: 'over',
        },
      });

      rerender(<MindMapNode {...propsOver} />);
      const nodeElement = getVisibleText('First Child').closest('div');
      expect(nodeElement).toHaveClass(
        'ring-2',
        'ring-green-400',
        'animate-pulse'
      );
    });
  });

  describe('node content indicators', () => {
    it('should render chat indicator when chatId exists', () => {
      const props = createMockNodeProps({
        data: { ...mockNodeData.child1, chatId: 'chat-123' },
      });

      render(<MindMapNode {...props} />);

      const chatIcon = screen.getByTitle('View chat');
      expect(chatIcon).toBeInTheDocument();
      expect(chatIcon.closest('div')).toHaveClass('bg-green-500');
    });

    it('should render notes indicator when notes exist', () => {
      const props = createMockNodeProps({
        data: { ...mockNodeData.child1, notes: 'Test notes' },
      });

      render(<MindMapNode {...props} />);

      const notesIcon = screen.getByTitle('View notes');
      expect(notesIcon).toBeInTheDocument();
      expect(notesIcon.closest('div')).toHaveClass('bg-red-500');
    });

    it('should render sources indicator when sources exist', () => {
      const props = createMockNodeProps({
        data: { ...mockNodeData.child1, sources: mockSources },
      });

      render(<MindMapNode {...props} />);

      const sourcesIcon = screen.getByTitle('View sources');
      expect(sourcesIcon).toBeInTheDocument();
      expect(sourcesIcon.closest('div')).toHaveClass('bg-orange-500');
    });

    it('should render collapse/expand button for nodes with children', () => {
      const props = createMockNodeProps({
        data: { ...mockNodeData.child1, hasChildren: true, isCollapsed: false },
      });

      render(<MindMapNode {...props} />);

      const collapseButton = screen.getByTitle('Collapse children');
      expect(collapseButton).toBeInTheDocument();

      const propsCollapsed = createMockNodeProps({
        data: { ...mockNodeData.child1, hasChildren: true, isCollapsed: true },
      });

      const { rerender } = render(<MindMapNode {...propsCollapsed} />);
      rerender(<MindMapNode {...propsCollapsed} />);

      const expandButton = screen.getByTitle('Expand children');
      expect(expandButton).toBeInTheDocument();
    });
  });

  describe('editing functionality', () => {
    it('should enter editing mode on double click', async () => {
      const props = createMockNodeProps({
        data: mockNodeData.child1,
      });

      render(<MindMapNode {...props} />);

      const nodeText = getVisibleText('First Child');
      await user.dblClick(nodeText);

      expect(screen.getByDisplayValue('First Child')).toBeInTheDocument();
    });

    it('should save on Enter key', async () => {
      const props = createMockNodeProps({
        data: { ...mockNodeData.child1, isEditing: true },
      });

      render(<MindMapNode {...props} />);

      const input = screen.getByDisplayValue('First Child');
      await user.clear(input);
      await user.type(input, 'Updated Label');
      await user.keyboard('{Enter}');

      expect(mockActions.updateNodeLabelWithLayout).toHaveBeenCalledWith(
        'child-1',
        'Updated Label'
      );
    });

    it('should cancel editing on Escape key', async () => {
      const props = createMockNodeProps({
        data: { ...mockNodeData.child1, isEditing: true },
      });

      const { rerender } = render(<MindMapNode {...props} />);

      const input = screen.getByDisplayValue('First Child');
      await user.clear(input);
      await user.type(input, 'Changed Text');
      await user.keyboard('{Escape}');

      // Should revert to original text
      const updatedProps = createMockNodeProps({
        data: { ...mockNodeData.child1, isEditing: false },
      });
      rerender(<MindMapNode {...updatedProps} />);

      expect(getVisibleText('First Child')).toBeInTheDocument();
      expect(mockActions.updateNodeLabelWithLayout).not.toHaveBeenCalled();
    });

    it('should save on blur', async () => {
      const props = createMockNodeProps({
        data: { ...mockNodeData.child1, isEditing: true },
      });

      render(<MindMapNode {...props} />);

      const input = screen.getByDisplayValue('First Child');
      await user.clear(input);
      await user.type(input, 'Blurred Label');

      act(() => {
        fireEvent.blur(input);
      });

      expect(mockActions.updateNodeLabelWithLayout).toHaveBeenCalledWith(
        'child-1',
        'Blurred Label'
      );
    });

    it('should handle empty label by using fallback', async () => {
      const props = createMockNodeProps({
        data: { ...mockNodeData.child1, isEditing: true },
      });

      render(<MindMapNode {...props} />);

      const input = screen.getByDisplayValue('First Child');
      await user.clear(input);
      await user.keyboard('{Enter}');

      expect(mockActions.updateNodeLabelWithLayout).toHaveBeenCalledWith(
        'child-1',
        'Untitled'
      );
    });

    it('should focus and select input when entering edit mode', async () => {
      const props = createMockNodeProps({
        data: { ...mockNodeData.child1, isEditing: false },
      });

      const { rerender } = render(<MindMapNode {...props} />);

      // Simulate entering edit mode
      const editingProps = createMockNodeProps({
        data: { ...mockNodeData.child1, isEditing: true },
      });

      rerender(<MindMapNode {...editingProps} />);

      // Fast-forward the setTimeout for focus
      act(() => {
        vi.advanceTimersByTime(100);
      });

      const input = screen.getByDisplayValue('First Child');
      expect(input).toHaveFocus();
    });
  });

  describe('user interactions', () => {
    it('should select node on click', async () => {
      const props = createMockNodeProps({
        data: mockNodeData.child1,
      });

      render(<MindMapNode {...props} />);

      const nodeElement = screen.getByText('First Child').closest('div')!;

      act(() => {
        fireEvent.click(nodeElement);
      });

      // Fast-forward the setTimeout for click handling
      act(() => {
        vi.advanceTimersByTime(100);
      });

      expect(mockSelection.selectNode).toHaveBeenCalledWith('child-1');
    });

    it('should toggle collapse on collapse button click', async () => {
      const props = createMockNodeProps({
        data: { ...mockNodeData.child1, hasChildren: true, isCollapsed: false },
      });

      render(<MindMapNode {...props} />);

      const collapseButton = screen.getByTitle('Collapse children');
      await user.click(collapseButton);

      expect(mockActions.toggleNodeCollapse).toHaveBeenCalledWith('child-1');
    });

    it('should open inference panel on inference button click', async () => {
      const mockDispatchEvent = vi.fn();
      window.dispatchEvent = mockDispatchEvent;

      const props = createMockNodeProps({
        data: mockNodeData.child1,
      });

      render(<MindMapNode {...props} />);

      const inferenceButton = screen.getByTitle('Node Panel');
      await user.click(inferenceButton);

      expect(mockDispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'mindmap-inference-open',
          detail: expect.objectContaining({
            nodeId: 'child-1',
            label: 'First Child',
          }),
        })
      );
    });

    it('should open inference panel on content indicator click', async () => {
      const mockDispatchEvent = vi.fn();
      window.dispatchEvent = mockDispatchEvent;

      const props = createMockNodeProps({
        data: { ...mockNodeData.child1, chatId: 'chat-123' },
      });

      render(<MindMapNode {...props} />);

      const chatIcon = screen.getByTitle('View chat');
      await user.click(chatIcon);

      expect(mockDispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'mindmap-inference-open',
          detail: expect.objectContaining({
            nodeId: 'child-1',
            focusChat: true,
          }),
        })
      );
    });
  });

  describe('context menu', () => {
    it('should show context menu on right click', async () => {
      const props = createMockNodeProps({
        data: mockNodeData.child1,
      });

      render(<MindMapNode {...props} />);

      const nodeElement = screen.getByText('First Child').closest('div')!;

      act(() => {
        fireEvent.contextMenu(nodeElement, createMockContextMenuEvent());
      });

      // Wait for context menu to appear
      await waitFor(() => {
        expect(screen.getByText('Add Child')).toBeInTheDocument();
      });

      expect(screen.getByText('Add Sibling')).toBeInTheDocument();
      expect(screen.getByText('Edit Label')).toBeInTheDocument();
      expect(screen.getByText('Node Panel')).toBeInTheDocument();
    });

    it('should hide delete option for root node', async () => {
      const props = createMockNodeProps({
        data: { ...mockNodeData.root, isRoot: true },
      });

      render(<MindMapNode {...props} />);

      const nodeElement = getVisibleText('Root Topic').closest('div')!;

      act(() => {
        fireEvent.contextMenu(nodeElement, createMockContextMenuEvent());
      });

      await waitFor(() => {
        expect(screen.getByText('Add Child')).toBeInTheDocument();
      });

      expect(screen.queryByText('Add Sibling')).not.toBeInTheDocument();
      expect(screen.queryByText('Delete Node')).not.toBeInTheDocument();
    });

    it('should show collapse/expand option for nodes with children', async () => {
      const props = createMockNodeProps({
        data: { ...mockNodeData.child1, hasChildren: true, isCollapsed: false },
      });

      render(<MindMapNode {...props} />);

      const nodeElement = screen.getByText('First Child').closest('div')!;

      act(() => {
        fireEvent.contextMenu(nodeElement, createMockContextMenuEvent());
      });

      await waitFor(() => {
        expect(screen.getByText('Collapse')).toBeInTheDocument();
      });
    });

    it('should execute context menu actions', async () => {
      const props = createMockNodeProps({
        data: mockNodeData.child1,
      });

      render(<MindMapNode {...props} />);

      const nodeElement = screen.getByText('First Child').closest('div')!;

      act(() => {
        fireEvent.contextMenu(nodeElement, createMockContextMenuEvent());
      });

      await waitFor(() => {
        expect(screen.getByText('Add Child')).toBeInTheDocument();
      });

      // Test add child
      await user.click(screen.getByText('Add Child'));
      expect(mockActions.addChildNode).toHaveBeenCalledWith('child-1');

      // Show menu again for next test
      act(() => {
        fireEvent.contextMenu(nodeElement, createMockContextMenuEvent());
      });

      await waitFor(() => {
        expect(screen.getByText('Add Sibling')).toBeInTheDocument();
      });

      // Test add sibling
      await user.click(screen.getByText('Add Sibling'));
      expect(mockActions.addSiblingNode).toHaveBeenCalledWith('child-1');

      // Show menu again for delete test
      act(() => {
        fireEvent.contextMenu(nodeElement, createMockContextMenuEvent());
      });

      await waitFor(() => {
        expect(screen.getByText('Delete Node')).toBeInTheDocument();
      });

      // Test delete
      await user.click(screen.getByText('Delete Node'));
      expect(mockActions.deleteNode).toHaveBeenCalledWith('child-1');
    });

    it('should close context menu on outside click', async () => {
      const props = createMockNodeProps({
        data: mockNodeData.child1,
      });

      render(<MindMapNode {...props} />);

      const nodeElement = screen.getByText('First Child').closest('div')!;

      act(() => {
        fireEvent.contextMenu(nodeElement, createMockContextMenuEvent());
      });

      await waitFor(() => {
        expect(screen.getByText('Add Child')).toBeInTheDocument();
      });

      // Fast-forward past the timeout delay for outside click handlers
      act(() => {
        vi.advanceTimersByTime(500);
      });

      // Click outside
      act(() => {
        fireEvent.mouseDown(document.body);
      });

      await waitFor(() => {
        expect(screen.queryByText('Add Child')).not.toBeInTheDocument();
      });
    });

    it('should close context menu on Escape key', async () => {
      const props = createMockNodeProps({
        data: mockNodeData.child1,
      });

      render(<MindMapNode {...props} />);

      const nodeElement = screen.getByText('First Child').closest('div')!;

      act(() => {
        fireEvent.contextMenu(nodeElement, createMockContextMenuEvent());
      });

      await waitFor(() => {
        expect(screen.getByText('Add Child')).toBeInTheDocument();
      });

      // Fast-forward past the timeout delay
      act(() => {
        vi.advanceTimersByTime(500);
      });

      act(() => {
        fireEvent.keyDown(document, { key: 'Escape' });
      });

      await waitFor(() => {
        expect(screen.queryByText('Add Child')).not.toBeInTheDocument();
      });
    });
  });

  describe('event listeners and cleanup', () => {
    it('should handle global context menu close events', async () => {
      const props = createMockNodeProps({
        data: mockNodeData.child1,
      });

      render(<MindMapNode {...props} />);

      const nodeElement = screen.getByText('First Child').closest('div')!;

      act(() => {
        fireEvent.contextMenu(nodeElement, createMockContextMenuEvent());
      });

      await waitFor(() => {
        expect(screen.getByText('Add Child')).toBeInTheDocument();
      });

      // Dispatch global close event
      act(() => {
        window.dispatchEvent(new CustomEvent('mindmap-close-context-menu'));
      });

      await waitFor(() => {
        expect(screen.queryByText('Add Child')).not.toBeInTheDocument();
      });
    });

    it('should handle inference active state events', async () => {
      const props = createMockNodeProps({
        data: mockNodeData.child1,
      });

      const { rerender } = render(<MindMapNode {...props} />);

      // Should check current active state on mount
      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'mindmap-inference-get-active',
        })
      );

      // Simulate inference active event
      act(() => {
        window.dispatchEvent(
          new CustomEvent('mindmap-inference-active', {
            detail: { activeNodeId: 'child-1' },
          })
        );
      });

      // Should show ripple effects for active inference
      rerender(<MindMapNode {...props} />);
      expect(document.querySelector('.animate-ripple')).toBeInTheDocument();
    });

    it('should cleanup event listeners on unmount', () => {
      const props = createMockNodeProps({
        data: mockNodeData.child1,
      });

      const { unmount } = render(<MindMapNode {...props} />);

      // Should not throw when unmounting
      expect(() => unmount()).not.toThrow();
    });
  });

  describe('width calculation', () => {
    it('should calculate node width based on text content', () => {
      const props = createMockNodeProps({
        data: { ...mockNodeData.child1, width: 180 },
      });

      render(<MindMapNode {...props} />);

      const nodeElement = screen.getByText('First Child').closest('div')!;
      expect(nodeElement).toHaveStyle({ width: '180px' });
    });

    it('should respect minimum and maximum width constraints', () => {
      const propsShort = createMockNodeProps({
        data: { ...mockNodeData.child1, width: 100 },
      });

      const { rerender } = render(<MindMapNode {...propsShort} />);

      let nodeElement = screen.getByText('First Child').closest('div')!;
      expect(nodeElement).toHaveStyle({ minWidth: '120px' });

      const propsLong = createMockNodeProps({
        data: { ...mockNodeData.child1, width: 900 },
      });

      rerender(<MindMapNode {...propsLong} />);

      nodeElement = screen.getByText('First Child').closest('div')!;
      expect(nodeElement).toHaveStyle({ maxWidth: '800px' });
    });
  });

  describe('layout-specific behavior', () => {
    it('should position collapse button correctly for different layouts', () => {
      const layoutProps = [
        { layout: 'TB', expectedClass: '-bottom-3' },
        { layout: 'BT', expectedClass: '-top-3' },
        { layout: 'LR', expectedClass: '-right-3' },
        { layout: 'RL', expectedClass: '-right-3' },
      ];

      layoutProps.forEach(({ layout, expectedClass }) => {
        const props = createMockNodeProps({
          data: {
            ...mockNodeData.child1,
            hasChildren: true,
            layout: layout as 'LR' | 'RL' | 'TB' | 'BT',
          },
        });

        const { unmount } = render(<MindMapNode {...props} />);

        const collapseButton = screen.getByTitle('Collapse children');
        expect(collapseButton).toHaveClass(expectedClass);

        unmount();
      });
    });

    it('should show correct drop indicators for different layouts', () => {
      const layoutTests = [
        { layout: 'LR', position: 'above', indicator: '-top-2' },
        { layout: 'TB', position: 'above', indicator: '-left-2' },
      ];

      layoutTests.forEach(({ layout, position, indicator }) => {
        const props = createMockNodeProps({
          data: {
            ...mockNodeData.child1,
            isDropTarget: true,
            dropPosition: position as 'above' | 'below' | 'over',
            layout: layout as 'LR' | 'RL' | 'TB' | 'BT',
          },
        });

        const { unmount } = render(<MindMapNode {...props} />);

        const dropIndicator = document.querySelector(
          `.${indicator.replace('-', '')}`
        );
        expect(dropIndicator).toBeInTheDocument();

        unmount();
      });
    });
  });
});
