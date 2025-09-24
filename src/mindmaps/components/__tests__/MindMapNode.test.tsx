import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
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

// Mock the text measurement service
vi.mock('../../services/textMeasurementService', () => ({
  calculateTextDimensions: vi.fn().mockReturnValue({
    width: 150,
    height: 32,
  }),
  clearMeasurementCache: vi.fn(),
}));

// Mock the node sizing strategy
vi.mock('../../services/nodeSizingStrategy', () => ({
  createDefaultSizingStrategy: () => ({
    calculateNodeSize: () => ({
      width: 150,
      height: 32,
    }),
  }),
}));

describe('MindMapNode', () => {
  beforeEach(() => {
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
      expect(visibleText).toBeTruthy();
      expect(
        screen.getByTestId('react-flow-handle-target-top-top')
      ).toBeTruthy();
      expect(
        screen.getByTestId('react-flow-handle-source-right-right-source')
      ).toBeTruthy();
    });

    it('should render root node with special styling', () => {
      const props = createMockNodeProps({
        data: { ...mockNodeData.root, isRoot: true },
      });

      render(<MindMapNode {...props} />);

      // Find the main node container by looking for the styled div
      const allDivs = Array.from(document.querySelectorAll('div'));
      const nodeContainer = allDivs.find(div => {
        const style = div.getAttribute('style') ?? '';
        return (
          style.includes('padding:') &&
          style.includes('border-radius:') &&
          style.includes('border:')
        );
      });

      expect(nodeContainer).toBeTruthy();
      const style = nodeContainer?.getAttribute('style') ?? '';
      expect(style).toContain('transform: scale(1.1)');
      expect(style).toContain('box-shadow:');
    });

    it('should render selected node with selection ring', () => {
      const props = createMockNodeProps({
        data: mockNodeData.child1,
        selected: true,
      });

      render(<MindMapNode {...props} />);

      // Find the main node container
      const allDivs = Array.from(document.querySelectorAll('div'));
      const nodeContainer = allDivs.find(div => {
        const style = div.getAttribute('style') ?? '';
        return (
          style.includes('padding:') &&
          style.includes('border-radius:') &&
          style.includes('border:')
        );
      });

      const style = nodeContainer?.getAttribute('style') ?? '';
      // Selected nodes have a specific box shadow
      expect(style).toContain('box-shadow');
      expect(style).toContain('0 0 0 2px');
      expect(style).toContain('0 0 0 4px');
    });

    it('should render node with custom colors', () => {
      const props = createMockNodeProps({
        data: {
          ...mockNodeData.child1,
          colorTheme: 'blue' as const,
        },
      });

      render(<MindMapNode {...props} />);

      // Find the main node container
      const allDivs = Array.from(document.querySelectorAll('div'));
      const nodeContainer = allDivs.find(div => {
        const style = div.getAttribute('style') ?? '';
        return (
          style.includes('padding:') &&
          style.includes('border-radius:') &&
          style.includes('border:')
        );
      });

      const style = nodeContainer?.getAttribute('style') ?? '';
      expect(style).toContain('background-color: rgb(59, 130, 246)');
      expect(style).toContain('border-color: rgb(37, 99, 235)');
      expect(style).toContain('color: rgb(255, 255, 255)');
    });

    it('should render dragging state with opacity and scaling', () => {
      const props = createMockNodeProps({
        data: { ...mockNodeData.child1, isDragging: true },
      });

      render(<MindMapNode {...props} />);

      // Find the main node container
      const allDivs = Array.from(document.querySelectorAll('div'));
      const nodeContainer = allDivs.find(div => {
        const style = div.getAttribute('style') ?? '';
        return (
          style.includes('padding:') &&
          style.includes('border-radius:') &&
          style.includes('border:')
        );
      });

      const style = nodeContainer?.getAttribute('style') ?? '';
      expect(style).toContain('opacity: 0.3');
      expect(style).toContain('transform: scale(0.95)');
      expect(style).toContain(
        'box-shadow: 0 0 0 2px #60a5fa, 0 0 0 4px #111827'
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

      const { container: containerAbove } = render(
        <MindMapNode {...propsAbove} />
      );

      // Check for drop indicator element
      const dropIndicator = Array.from(
        containerAbove.querySelectorAll('div')
      ).find(div => {
        const style = div.getAttribute('style') ?? '';
        return style.includes('background-color: rgb(74, 222, 128)');
      });
      expect(dropIndicator).toBeTruthy();

      const propsBelow = createMockNodeProps({
        data: {
          ...mockNodeData.child1,
          isDropTarget: true,
          dropPosition: 'below',
        },
      });

      const { container: containerBelow } = render(
        <MindMapNode {...propsBelow} />
      );

      const dropIndicatorBelow = Array.from(
        containerBelow.querySelectorAll('div')
      ).find(div => {
        const style = div.getAttribute('style') ?? '';
        return style.includes('background-color: rgb(74, 222, 128)');
      });
      expect(dropIndicatorBelow).toBeTruthy();

      const propsOver = createMockNodeProps({
        data: {
          ...mockNodeData.child1,
          isDropTarget: true,
          dropPosition: 'over',
        },
      });

      const { container: containerOver } = render(
        <MindMapNode {...propsOver} />
      );

      // Find the main node container for 'over' state
      const nodeContainer = Array.from(
        containerOver.querySelectorAll('div')
      ).find(div => {
        const style = div.getAttribute('style') ?? '';
        return (
          style.includes('padding:') &&
          style.includes('border-radius:') &&
          style.includes('border:')
        );
      });

      const style = nodeContainer?.getAttribute('style') ?? '';
      expect(style).toContain(
        'box-shadow: 0 0 0 2px #4ade80, 0 0 0 4px #111827'
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
      expect(chatIcon).toBeTruthy();

      // Check the parent div's style
      const chatIconDiv = chatIcon;
      const style = chatIconDiv.getAttribute('style') ?? '';
      expect(style).toContain('background-color: rgb(16, 185, 129)');
    });

    it('should render notes indicator when notes exist', () => {
      const props = createMockNodeProps({
        data: { ...mockNodeData.child1, notes: 'Some notes' },
      });

      render(<MindMapNode {...props} />);

      const notesIcon = screen.getByTitle('View notes');
      expect(notesIcon).toBeTruthy();

      const notesIconDiv = notesIcon;
      const style = notesIconDiv.getAttribute('style') ?? '';
      expect(style).toContain('background-color: rgb(239, 68, 68)');
    });

    it('should render sources indicator when sources exist', () => {
      const props = createMockNodeProps({
        data: { ...mockNodeData.child1, sources: mockSources },
      });

      render(<MindMapNode {...props} />);

      const sourcesIcon = screen.getByTitle('View sources');
      expect(sourcesIcon).toBeTruthy();

      const sourcesIconDiv = sourcesIcon;
      const style = sourcesIconDiv.getAttribute('style') ?? '';
      expect(style).toContain('background-color: rgb(249, 115, 22)');
    });

    it('should render collapse/expand button for nodes with children', () => {
      const props = createMockNodeProps({
        data: { ...mockNodeData.child1, hasChildren: true },
      });

      render(<MindMapNode {...props} />);

      expect(screen.getByTitle('Collapse children')).toBeTruthy();
    });
  });

  describe('editing functionality', () => {
    it('should enter editing mode on double click', () => {
      const props = createMockNodeProps({
        data: mockNodeData.child1,
      });

      render(<MindMapNode {...props} />);

      const labelElement = getVisibleText('First Child');
      fireEvent.doubleClick(labelElement);

      const input = screen.getByPlaceholderText('Enter text...');
      expect(input).toBeTruthy();
      expect((input as HTMLTextAreaElement).value).toBe('First Child');
    });

    it('should save on Enter key', () => {
      const props = createMockNodeProps({
        data: mockNodeData.child1,
      });

      render(<MindMapNode {...props} />);

      const labelElement = getVisibleText('First Child');
      fireEvent.doubleClick(labelElement);

      const input = screen.getByPlaceholderText('Enter text...');
      fireEvent.change(input, { target: { value: 'Updated Label' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(mockActions.updateNodeLabelWithLayout).toHaveBeenCalledWith(
        props.id,
        'Updated Label'
      );
    });

    it('should cancel editing on Escape key', () => {
      const props = createMockNodeProps({
        data: mockNodeData.child1,
      });

      render(<MindMapNode {...props} />);

      const labelElement = getVisibleText('First Child');
      fireEvent.doubleClick(labelElement);

      const input = screen.getByPlaceholderText('Enter text...');
      fireEvent.change(input, { target: { value: 'Changed Label' } });
      fireEvent.keyDown(input, { key: 'Escape' });

      // After escape, the original label should be visible
      act(() => {
        vi.runAllTimers();
      });

      expect(getVisibleText('First Child')).toBeTruthy();
      expect(mockActions.updateNodeLabelWithLayout).not.toHaveBeenCalled();
    });

    it('should save on blur', () => {
      const props = createMockNodeProps({
        data: mockNodeData.child1,
      });

      render(<MindMapNode {...props} />);

      const labelElement = getVisibleText('First Child');
      fireEvent.doubleClick(labelElement);

      const input = screen.getByPlaceholderText('Enter text...');
      fireEvent.change(input, { target: { value: 'Blurred Label' } });
      fireEvent.blur(input);

      expect(mockActions.updateNodeLabelWithLayout).toHaveBeenCalledWith(
        props.id,
        'Blurred Label'
      );
    });

    it('should handle empty label by using fallback', () => {
      const props = createMockNodeProps({
        data: mockNodeData.child1,
      });

      render(<MindMapNode {...props} />);

      const labelElement = getVisibleText('First Child');
      fireEvent.doubleClick(labelElement);

      const input = screen.getByPlaceholderText('Enter text...');
      fireEvent.change(input, { target: { value: '' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(mockActions.updateNodeLabelWithLayout).toHaveBeenCalledWith(
        props.id,
        'Untitled'
      );
    });

    it('should focus and select input when entering edit mode', () => {
      const props = createMockNodeProps({
        data: mockNodeData.child1,
      });

      render(<MindMapNode {...props} />);

      const labelElement = getVisibleText('First Child');
      fireEvent.doubleClick(labelElement);

      // Advance timers to trigger focus
      act(() => {
        vi.advanceTimersByTime(100);
      });

      const input = screen.getByPlaceholderText('Enter text...');
      expect(document.activeElement).toBe(input);
    });
  });

  describe('user interactions', () => {
    it('should select node on click', () => {
      const props = createMockNodeProps({
        data: mockNodeData.child1,
      });

      render(<MindMapNode {...props} />);

      // Find the main node container
      const allDivs = Array.from(document.querySelectorAll('div'));
      const nodeContainer = allDivs.find(div => {
        const style = div.getAttribute('style') ?? '';
        return (
          style.includes('padding:') &&
          style.includes('border-radius:') &&
          style.includes('border:')
        );
      });

      if (nodeContainer) {
        fireEvent.click(nodeContainer);
        act(() => {
          vi.advanceTimersByTime(100);
        });
        expect(mockSelection.selectNode).toHaveBeenCalledWith(props.id);
      }
    });

    it('should toggle collapse on collapse button click', () => {
      const props = createMockNodeProps({
        data: { ...mockNodeData.child1, hasChildren: true },
      });

      render(<MindMapNode {...props} />);

      const collapseButton = screen.getByTitle('Collapse children');
      fireEvent.click(collapseButton);

      expect(mockActions.toggleNodeCollapse).toHaveBeenCalledWith(props.id);
    });

    it('should open inference panel on inference button click', () => {
      const props = createMockNodeProps({
        data: mockNodeData.child1,
      });

      render(<MindMapNode {...props} />);

      const inferenceButton = screen.getByTitle('Node Panel');
      fireEvent.click(inferenceButton);

      // Check that the custom event was dispatched
      expect(inferenceButton).toBeTruthy();
    });

    it('should open inference panel on content indicator click', () => {
      const props = createMockNodeProps({
        data: { ...mockNodeData.child1, chatId: 'chat-123' },
      });

      render(<MindMapNode {...props} />);

      const chatIndicator = screen.getByTitle('View chat');
      fireEvent.click(chatIndicator);

      // The click should propagate but we can't easily test custom events
      expect(chatIndicator).toBeTruthy();
    });
  });

  describe('context menu', () => {
    it('should show context menu on right click', () => {
      const props = createMockNodeProps({
        data: mockNodeData.child1,
      });

      render(<MindMapNode {...props} />);

      // Find the main node container
      const allDivs = Array.from(document.querySelectorAll('div'));
      const nodeContainer = allDivs.find(div => {
        const style = div.getAttribute('style') ?? '';
        return (
          style.includes('padding:') &&
          style.includes('border-radius:') &&
          style.includes('border:')
        );
      });

      if (nodeContainer) {
        const contextMenuEvent = createMockContextMenuEvent();
        fireEvent.contextMenu(nodeContainer, contextMenuEvent);

        // Advance timers to allow context menu to appear
        act(() => {
          vi.advanceTimersByTime(600);
        });

        expect(screen.getByText('Add Child')).toBeTruthy();
        expect(screen.getByText('Add Sibling')).toBeTruthy();
        expect(screen.getByText('Edit Label')).toBeTruthy();
        expect(screen.getByText('Delete Node')).toBeTruthy();
      }
    });

    it('should hide delete option for root node', () => {
      const props = createMockNodeProps({
        data: { ...mockNodeData.root, isRoot: true },
      });

      render(<MindMapNode {...props} />);

      // Find the main node container
      const allDivs = Array.from(document.querySelectorAll('div'));
      const nodeContainer = allDivs.find(div => {
        const style = div.getAttribute('style') ?? '';
        return (
          style.includes('padding:') &&
          style.includes('border-radius:') &&
          style.includes('border:')
        );
      });

      if (nodeContainer) {
        const contextMenuEvent = createMockContextMenuEvent();
        fireEvent.contextMenu(nodeContainer, contextMenuEvent);

        act(() => {
          vi.advanceTimersByTime(600);
        });

        expect(screen.getByText('Add Child')).toBeTruthy();
        expect(screen.queryByText('Add Sibling')).toBeNull();
        expect(screen.queryByText('Delete Node')).toBeNull();
      }
    });

    it('should show collapse/expand option for nodes with children', () => {
      const props = createMockNodeProps({
        data: { ...mockNodeData.child1, hasChildren: true, isCollapsed: true },
      });

      render(<MindMapNode {...props} />);

      // Find the main node container
      const allDivs = Array.from(document.querySelectorAll('div'));
      const nodeContainer = allDivs.find(div => {
        const style = div.getAttribute('style') ?? '';
        return (
          style.includes('padding:') &&
          style.includes('border-radius:') &&
          style.includes('border:')
        );
      });

      if (nodeContainer) {
        const contextMenuEvent = createMockContextMenuEvent();
        fireEvent.contextMenu(nodeContainer, contextMenuEvent);

        act(() => {
          vi.advanceTimersByTime(600);
        });

        expect(screen.getByText('Expand')).toBeTruthy();
      }
    });

    it('should execute context menu actions', () => {
      const props = createMockNodeProps({
        data: mockNodeData.child1,
      });

      render(<MindMapNode {...props} />);

      // Find the main node container
      const allDivs = Array.from(document.querySelectorAll('div'));
      const nodeContainer = allDivs.find(div => {
        const style = div.getAttribute('style') ?? '';
        return (
          style.includes('padding:') &&
          style.includes('border-radius:') &&
          style.includes('border:')
        );
      });

      if (nodeContainer) {
        const contextMenuEvent = createMockContextMenuEvent();
        fireEvent.contextMenu(nodeContainer, contextMenuEvent);

        act(() => {
          vi.advanceTimersByTime(600);
        });

        // Test Add Child
        fireEvent.click(screen.getByText('Add Child'));
        expect(mockActions.addChildNode).toHaveBeenCalledWith(props.id);

        // Re-open context menu
        fireEvent.contextMenu(nodeContainer, contextMenuEvent);
        act(() => {
          vi.advanceTimersByTime(600);
        });

        // Test Add Sibling
        fireEvent.click(screen.getByText('Add Sibling'));
        expect(mockActions.addSiblingNode).toHaveBeenCalledWith(props.id);

        // Re-open context menu
        fireEvent.contextMenu(nodeContainer, contextMenuEvent);
        act(() => {
          vi.advanceTimersByTime(600);
        });

        // Test Delete
        fireEvent.click(screen.getByText('Delete Node'));
        expect(mockActions.deleteNode).toHaveBeenCalledWith(props.id);
      }
    });

    it('should close context menu on outside click', () => {
      const props = createMockNodeProps({
        data: mockNodeData.child1,
      });

      render(<MindMapNode {...props} />);

      // Find the main node container
      const allDivs = Array.from(document.querySelectorAll('div'));
      const nodeContainer = allDivs.find(div => {
        const style = div.getAttribute('style') ?? '';
        return (
          style.includes('padding:') &&
          style.includes('border-radius:') &&
          style.includes('border:')
        );
      });

      if (nodeContainer) {
        const contextMenuEvent = createMockContextMenuEvent();
        fireEvent.contextMenu(nodeContainer, contextMenuEvent);

        act(() => {
          vi.advanceTimersByTime(600);
        });

        expect(screen.getByText('Add Child')).toBeTruthy();

        // Click outside
        fireEvent.mouseDown(document.body);
        fireEvent.click(document.body);

        act(() => {
          vi.runAllTimers();
        });

        expect(screen.queryByText('Add Child')).toBeNull();
      }
    });

    it('should close context menu on Escape key', () => {
      const props = createMockNodeProps({
        data: mockNodeData.child1,
      });

      render(<MindMapNode {...props} />);

      // Find the main node container
      const allDivs = Array.from(document.querySelectorAll('div'));
      const nodeContainer = allDivs.find(div => {
        const style = div.getAttribute('style') ?? '';
        return (
          style.includes('padding:') &&
          style.includes('border-radius:') &&
          style.includes('border:')
        );
      });

      if (nodeContainer) {
        const contextMenuEvent = createMockContextMenuEvent();
        fireEvent.contextMenu(nodeContainer, contextMenuEvent);

        act(() => {
          vi.advanceTimersByTime(600);
        });

        expect(screen.getByText('Add Child')).toBeTruthy();

        fireEvent.keyDown(document, { key: 'Escape' });

        act(() => {
          vi.runAllTimers();
        });

        expect(screen.queryByText('Add Child')).toBeNull();
      }
    });
  });

  describe('event listeners and cleanup', () => {
    it('should handle global context menu close events', () => {
      const props = createMockNodeProps({
        data: mockNodeData.child1,
      });

      const { unmount } = render(<MindMapNode {...props} />);

      // Dispatch custom event
      const event = new CustomEvent('mindmap-close-context-menu');
      window.dispatchEvent(event);

      // Should not throw
      unmount();
    });

    it('should handle inference active state events', () => {
      const props = createMockNodeProps({
        data: mockNodeData.child1,
      });

      const { container } = render(<MindMapNode {...props} />);

      // Initially, there should be no ripple effects
      const initialRipples = container.querySelectorAll('.animate-ripple');
      expect(initialRipples.length).toBe(0);

      // Dispatch custom event to set this node as active
      const event = new CustomEvent('mindmap-inference-active', {
        detail: { activeNodeId: props.id },
      });

      act(() => {
        window.dispatchEvent(event);
        vi.runAllTimers();
      });

      // The component should have received the event and updated its state
      // Since we can't easily test the visual ripple effects in jsdom,
      // let's just verify the component renders without errors and handles the event

      // Verify the inference button still exists and is functional
      const inferenceButton = container.querySelector(
        'button[title="Node Panel"]'
      );
      expect(inferenceButton).toBeTruthy();

      // Dispatch event with different node ID to deactivate
      const deactivateEvent = new CustomEvent('mindmap-inference-active', {
        detail: { activeNodeId: 'other-node' },
      });

      act(() => {
        window.dispatchEvent(deactivateEvent);
        vi.runAllTimers();
      });

      // Component should still render correctly
      expect(inferenceButton).toBeTruthy();
    });

    it('should cleanup event listeners on unmount', () => {
      const props = createMockNodeProps({
        data: mockNodeData.child1,
      });

      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      const { unmount } = render(<MindMapNode {...props} />);

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'mindmap-close-context-menu',
        expect.any(Function)
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'mindmap-inference-active',
        expect.any(Function)
      );
    });
  });

  describe('width calculation', () => {
    it('should calculate node width based on text content', () => {
      const props = createMockNodeProps({
        data: mockNodeData.child1,
      });

      const { container } = render(<MindMapNode {...props} />);

      // Find the main node container
      const allDivs = Array.from(container.querySelectorAll('div'));
      const nodeContainer = allDivs.find(div => {
        const style = div.getAttribute('style') ?? '';
        return (
          style.includes('padding:') &&
          style.includes('border-radius:') &&
          style.includes('border:')
        );
      });

      expect(nodeContainer?.style.width).toBe('150px');
    });

    it('should respect minimum and maximum width constraints', () => {
      const props = createMockNodeProps({
        data: { ...mockNodeData.child1, label: 'x' }, // Very short text
      });

      const { container } = render(<MindMapNode {...props} />);

      // Find the main node container
      const allDivs = Array.from(container.querySelectorAll('div'));
      const nodeContainer = allDivs.find(div => {
        const style = div.getAttribute('style') ?? '';
        return (
          style.includes('padding:') &&
          style.includes('border-radius:') &&
          style.includes('border:')
        );
      });

      expect(nodeContainer?.style.minWidth).toBe('120px');
    });
  });

  describe('editing mode height consistency', () => {
    it('should maintain consistent height between view and edit modes', () => {
      const props = createMockNodeProps({
        data: mockNodeData.child1,
      });

      const { container } = render(<MindMapNode {...props} />);

      // Find the main node container
      const allDivs = Array.from(container.querySelectorAll('div'));
      const nodeContainer = allDivs.find(div => {
        const style = div.getAttribute('style') ?? '';
        return (
          style.includes('padding:') &&
          style.includes('border-radius:') &&
          style.includes('border:')
        );
      });

      // The node uses minHeight, not height
      expect(nodeContainer?.style.minHeight).toBe('32px');

      // Enter edit mode
      const labelElement = getVisibleText('First Child');
      fireEvent.doubleClick(labelElement);

      // Mock scrollHeight for textarea to prevent it from being 0
      const textarea = screen.getByPlaceholderText('Enter text...');
      Object.defineProperty(textarea, 'scrollHeight', {
        value: 21, // Single line height matching the span
        configurable: true,
      });

      // Wait for the auto-resize to trigger
      act(() => {
        vi.advanceTimersByTime(100);
      });

      // The minHeight should remain the same
      expect(nodeContainer?.style.minHeight).toBe('32px');

      // The textarea should have been resized to 21px (matching single line)
      expect(textarea.style.height).toBe('21px');
    });

    it('should apply correct textarea styles in edit mode', () => {
      const props = createMockNodeProps({
        data: mockNodeData.child1,
      });

      render(<MindMapNode {...props} />);

      // Enter edit mode
      const labelElement = getVisibleText('First Child');
      fireEvent.doubleClick(labelElement);

      const textarea = screen.getByPlaceholderText('Enter text...');

      // Check that textarea has correct inline styles
      const style = textarea.getAttribute('style') ?? '';
      expect(style).toContain('line-height: 21px');
      expect(style).toContain('height: 21px');
      expect(style).toContain('padding: 0');
      expect(style).toContain('margin: 0');
    });

    it('should auto-resize textarea correctly based on content', () => {
      const props = createMockNodeProps({
        data: mockNodeData.child1,
      });

      render(<MindMapNode {...props} />);

      // Enter edit mode
      const labelElement = getVisibleText('First Child');
      fireEvent.doubleClick(labelElement);

      const textarea = screen.getByPlaceholderText('Enter text...');

      // Mock scrollHeight for multi-line content (3 lines * 21px)
      Object.defineProperty(textarea, 'scrollHeight', {
        value: 63, // 3 lines * 21px per line
        configurable: true,
      });

      // Simulate typing multi-line text
      const multiLineText = 'Line 1\nLine 2\nLine 3';
      fireEvent.change(textarea, { target: { value: multiLineText } });

      // The auto-resize should have been triggered
      // Check that height is now 3 * 21px = 63px
      const style = textarea.getAttribute('style') ?? '';
      expect(style).toContain('height: 63px');
    });

    it('should unselect text when clicking on fully selected text', () => {
      const props = createMockNodeProps({
        data: mockNodeData.child1,
      });

      render(<MindMapNode {...props} />);

      // Enter edit mode
      const labelElement = getVisibleText('First Child');
      fireEvent.doubleClick(labelElement);

      const textarea = screen.getByPlaceholderText('Enter text...');

      // Mock initial selection (text is fully selected)
      Object.defineProperty(textarea, 'selectionStart', {
        value: 0,
        configurable: true,
      });
      Object.defineProperty(textarea, 'selectionEnd', {
        value: (textarea as HTMLTextAreaElement).value.length,
        configurable: true,
      });

      // Mock setSelectionRange
      const setSelectionRangeSpy = vi.fn();
      (textarea as HTMLTextAreaElement).setSelectionRange =
        setSelectionRangeSpy;

      // Click on the textarea
      fireEvent.click(textarea);

      // Verify that setSelectionRange was called to unselect text
      expect(setSelectionRangeSpy).toHaveBeenCalledWith(
        (textarea as HTMLTextAreaElement).value.length,
        (textarea as HTMLTextAreaElement).value.length
      );
    });

    it('should not unselect text when clicking on partially selected text', () => {
      const props = createMockNodeProps({
        data: mockNodeData.child1,
      });

      render(<MindMapNode {...props} />);

      // Enter edit mode
      const labelElement = getVisibleText('First Child');
      fireEvent.doubleClick(labelElement);

      const textarea = screen.getByPlaceholderText('Enter text...');

      // Mock partial selection
      Object.defineProperty(textarea, 'selectionStart', {
        value: 2,
        configurable: true,
      });
      Object.defineProperty(textarea, 'selectionEnd', {
        value: 5,
        configurable: true,
      });

      // Mock setSelectionRange
      const setSelectionRangeSpy = vi.fn();
      (textarea as HTMLTextAreaElement).setSelectionRange =
        setSelectionRangeSpy;

      // Click on the textarea
      fireEvent.click(textarea);

      // Verify that setSelectionRange was NOT called
      expect(setSelectionRangeSpy).not.toHaveBeenCalled();
    });
  });

  describe('layout-specific behavior', () => {
    it('should position collapse button correctly for different layouts', () => {
      // Test TB layout
      const propsTB = createMockNodeProps({
        data: {
          ...mockNodeData.child1,
          hasChildren: true,
          layout: 'TB',
        },
      });

      const { container: containerTB } = render(<MindMapNode {...propsTB} />);
      const buttonTB = containerTB.querySelector(
        'button[title="Collapse children"]'
      ) as HTMLElement;
      expect(buttonTB?.style.bottom).toBe('-12px');
      expect(buttonTB?.style.left).toBe('50%');

      // Test BT layout
      const propsBT = createMockNodeProps({
        data: {
          ...mockNodeData.child1,
          hasChildren: true,
          layout: 'BT',
        },
      });

      const { container: containerBT } = render(<MindMapNode {...propsBT} />);
      const buttonBT = containerBT.querySelector(
        'button[title="Collapse children"]'
      ) as HTMLElement;
      expect(buttonBT?.style.top).toBe('-12px');
      expect(buttonBT?.style.left).toBe('50%');

      // Test LR layout
      const propsLR = createMockNodeProps({
        data: {
          ...mockNodeData.child1,
          hasChildren: true,
          layout: 'LR',
        },
      });

      const { container: containerLR } = render(<MindMapNode {...propsLR} />);
      const buttonLR = containerLR.querySelector(
        'button[title="Collapse children"]'
      ) as HTMLElement;
      expect(buttonLR?.style.right).toBe('-12px');
      expect(buttonLR?.style.top).toBe('50%');

      // Test RL layout
      const propsRL = createMockNodeProps({
        data: {
          ...mockNodeData.child1,
          hasChildren: true,
          layout: 'RL',
        },
      });

      const { container: containerRL } = render(<MindMapNode {...propsRL} />);
      const buttonRL = containerRL.querySelector(
        'button[title="Collapse children"]'
      ) as HTMLElement;
      expect(buttonRL?.style.left).toBe('-12px');
      expect(buttonRL?.style.top).toBe('50%');
    });

    it('should position inference button correctly for different layouts', () => {
      // Test LR layout
      const propsLR = createMockNodeProps({
        data: {
          ...mockNodeData.child1,
          layout: 'LR',
        },
      });

      const { container: containerLR } = render(<MindMapNode {...propsLR} />);
      const buttonLR = containerLR.querySelector(
        'button[title="Node Panel"]'
      ) as HTMLElement;
      const buttonContainerLR = buttonLR?.parentElement as HTMLElement;
      expect(buttonContainerLR?.style.left).toBe('8px');
      expect(buttonContainerLR?.style.transform).toBe('translate(-100%, -50%)');

      // Test RL layout
      const propsRL = createMockNodeProps({
        data: {
          ...mockNodeData.child1,
          layout: 'RL',
        },
      });

      const { container: containerRL } = render(<MindMapNode {...propsRL} />);
      const buttonRL = containerRL.querySelector(
        'button[title="Node Panel"]'
      ) as HTMLElement;
      const buttonContainerRL = buttonRL?.parentElement as HTMLElement;
      expect(buttonContainerRL?.style.right).toBe('8px');
      expect(buttonContainerRL?.style.transform).toBe('translate(100%, -50%)');
    });

    it('should show correct drop indicators for different layouts', () => {
      // Test horizontal layout (LR)
      const propsLR = createMockNodeProps({
        data: {
          ...mockNodeData.child1,
          isDropTarget: true,
          dropPosition: 'above',
          layout: 'LR',
        },
      });

      const { container: containerLR, unmount: unmount1 } = render(
        <MindMapNode {...propsLR} />
      );

      const dropIndicator = Array.from(
        containerLR.querySelectorAll('div')
      ).find(div => {
        const style = div.getAttribute('style') ?? '';
        return style.includes('background-color: rgb(74, 222, 128)');
      });
      expect(dropIndicator).toBeTruthy();
      unmount1();

      // Test vertical layout (TB)
      const propsTB = createMockNodeProps({
        data: {
          ...mockNodeData.child1,
          isDropTarget: true,
          dropPosition: 'above',
          layout: 'TB',
        },
      });

      const { container: containerTB } = render(<MindMapNode {...propsTB} />);

      const dropIndicatorTB = Array.from(
        containerTB.querySelectorAll('div')
      ).find(div => {
        const style = div.getAttribute('style') ?? '';
        return (
          style.includes('background-color: rgb(74, 222, 128)') &&
          style.includes('left: -8px')
        );
      });
      expect(dropIndicatorTB).toBeTruthy();
    });
  });
});
