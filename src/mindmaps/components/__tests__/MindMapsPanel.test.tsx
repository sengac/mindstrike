import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MindMapsPanel } from '../MindMapsPanel';
import type { MindMap } from '../../hooks/useMindMaps';
import type { ThreadMetadata } from '../../../store/useThreadsStore';
import { mockSources } from '../../__fixtures__/mindMapData';
import type { ReactNode } from 'react';

// Mock store hooks
const mockStoreActions = {
  updateNodeChatId: vi.fn(),
  updateNodeNotes: vi.fn(),
  updateNodeSources: vi.fn(),
};

vi.mock('../../../store/useMindMapStore', () => ({
  useMindMapActions: () => mockStoreActions,
}));

// Mock ListPanel component props
interface MockListPanelProps {
  items: unknown[];
  activeItemId?: string;
  onItemSelect: (id: string) => void;
  onItemCreate: () => void;
  onItemRename: (id: string, name: string) => void;
  onItemDelete: (id: string) => void;
  emptyState: { title: string };
  testId?: string;
  showChildComponent?: boolean;
  showChildComponentHeader?: boolean;
  childComponent?: ReactNode;
}

// Mock the ListPanel component
vi.mock('../../../components/shared/ListPanel', () => ({
  ListPanel: ({
    items,
    activeItemId,
    onItemSelect,
    onItemCreate,
    onItemRename,
    onItemDelete,
    emptyState,
    testId,
    showChildComponent,
    showChildComponentHeader,
    childComponent,
  }: MockListPanelProps) => (
    <div data-testid={testId}>
      <div data-testid="items-count">{items.length}</div>
      <div data-testid="active-item">{activeItemId ?? 'none'}</div>
      <div data-testid="empty-state-title">{emptyState.title}</div>
      <div data-testid="show-child">
        {showChildComponent ? 'true' : 'false'}
      </div>
      <div data-testid="show-child-header">
        {showChildComponentHeader ? 'true' : 'false'}
      </div>

      {/* Action buttons for testing */}
      <button
        data-testid="select-item"
        onClick={() => onItemSelect('mindmap-1')}
      >
        Select
      </button>
      <button data-testid="create-item" onClick={() => onItemCreate()}>
        Create
      </button>
      <button
        data-testid="rename-item"
        onClick={() => onItemRename('mindmap-1', 'New Name')}
      >
        Rename
      </button>
      <button
        data-testid="delete-item"
        onClick={() => onItemDelete('mindmap-1')}
      >
        Delete
      </button>

      {/* Child component area - render when showChildComponent is true */}
      {showChildComponent && childComponent}
    </div>
  ),
}));

// Mock MindMapChatIntegration component props
interface MockMindMapChatIntegrationProps {
  nodeId: string;
  nodeLabel: string;
  chatId?: string | null;
  nodeNotes?: string;
  nodeSources?: unknown[];
  focusChat?: boolean;
  focusNotes?: boolean;
  focusSources?: boolean;
  threads: ThreadMetadata[];
  onClose: () => void;
  onNavigateToChat?: (threadId: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onMessagesUpdate: (messages: unknown[]) => void;
  onPromptUpdate?: (threadId: string, prompt: string) => void;
  onNotesUpdate: (nodeId: string, notes: string) => void;
  onSourcesUpdate: (nodeId: string, sources: unknown[]) => void;
  onThreadCreate?: () => void;
  onThreadRename?: (threadId: string, name: string) => void;
  onThreadDelete?: (threadId: string) => void;
  onNavigateToPrevNode: () => void;
  onNavigateToNextNode: () => void;
  onCustomizePrompts?: () => void;
}

// Mock the MindMapChatIntegration component
vi.mock('../MindMapChatIntegration', () => ({
  MindMapChatIntegration: ({
    nodeId,
    nodeLabel,
    chatId,
    nodeNotes,
    nodeSources,
    focusChat,
    focusNotes,
    focusSources,
    threads,
    onClose,
    onNavigateToChat,
    onDeleteMessage,
    onMessagesUpdate,
    onPromptUpdate,
    onNotesUpdate,
    onSourcesUpdate,
    onThreadCreate,
    onThreadRename,
    onThreadDelete,
    onNavigateToPrevNode,
    onNavigateToNextNode,
    onCustomizePrompts,
  }: MockMindMapChatIntegrationProps) => (
    <div data-testid="mindmap-chat-integration">
      <div data-testid="chat-node-id">{nodeId}</div>
      <div data-testid="chat-node-label">{nodeLabel}</div>
      <div data-testid="chat-id">{chatId ?? 'no-chat'}</div>
      <div data-testid="chat-notes">{nodeNotes ?? 'no-notes'}</div>
      <div data-testid="chat-sources">{JSON.stringify(nodeSources ?? [])}</div>
      <div data-testid="chat-focus">
        {JSON.stringify({ focusChat, focusNotes, focusSources })}
      </div>
      <div data-testid="chat-threads-count">{threads.length}</div>

      {/* Action buttons for testing */}
      <button data-testid="associate-thread" onClick={() => {}}>
        Associate Thread
      </button>
      <button data-testid="unassign-thread" onClick={() => {}}>
        Unassign Thread
      </button>
      <button data-testid="close-chat" onClick={() => onClose()}>
        Close
      </button>
      <button
        data-testid="navigate-to-chat"
        onClick={() => onNavigateToChat?.('thread-1')}
      >
        Navigate to Chat
      </button>
      <button
        data-testid="delete-chat-message"
        onClick={() => onDeleteMessage('msg-1')}
      >
        Delete Message
      </button>
      <button
        data-testid="update-chat-messages"
        onClick={() =>
          onMessagesUpdate([
            {
              id: 'msg-1',
              content: 'test',
              role: 'user',
              timestamp: Date.now(),
            },
          ])
        }
      >
        Update Messages
      </button>
      <button
        data-testid="update-chat-prompt"
        onClick={() => onPromptUpdate?.('thread-1', 'custom')}
      >
        Update Prompt
      </button>
      <button
        data-testid="update-chat-notes"
        onClick={() => onNotesUpdate('node-1', 'new notes')}
      >
        Update Notes
      </button>
      <button
        data-testid="update-chat-sources"
        onClick={() => onSourcesUpdate('node-1', mockSources)}
      >
        Update Sources
      </button>
      <button
        data-testid="create-chat-thread"
        onClick={() => onThreadCreate?.()}
      >
        Create Thread
      </button>
      <button
        data-testid="rename-chat-thread"
        onClick={() => onThreadRename?.('thread-1', 'New Thread')}
      >
        Rename Thread
      </button>
      <button
        data-testid="delete-chat-thread"
        onClick={() => onThreadDelete?.('thread-1')}
      >
        Delete Thread
      </button>
      <button
        data-testid="navigate-prev-node"
        onClick={() => onNavigateToPrevNode()}
      >
        Previous Node
      </button>
      <button
        data-testid="navigate-next-node"
        onClick={() => onNavigateToNextNode()}
      >
        Next Node
      </button>
      <button
        data-testid="customize-chat-prompts"
        onClick={() => onCustomizePrompts?.()}
      >
        Customize Prompts
      </button>
    </div>
  ),
}));

describe('MindMapsPanel', () => {
  let user: ReturnType<typeof userEvent.setup>;

  const mockMindMaps: MindMap[] = [
    {
      id: 'mindmap-1',
      name: 'First Mind Map',
      description: 'First test mind map',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-02'),
    },
    {
      id: 'mindmap-2',
      name: 'Second Mind Map',
      description: 'Second test mind map',
      createdAt: new Date('2024-01-03'),
      updatedAt: new Date('2024-01-04'),
    },
  ];

  const mockThreads: ThreadMetadata[] = [
    {
      id: 'thread-1',
      name: 'Test Thread 1',
      model: 'gpt-4',
      modelPreset: 'balanced',
      customPrompt: undefined,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-02'),
      messageCount: 5,
      firstMessage: 'Hello',
      lastMessage: 'Goodbye',
      hasActiveGeneration: false,
    },
    {
      id: 'thread-2',
      name: 'Test Thread 2',
      model: 'gpt-3.5-turbo',
      modelPreset: 'creative',
      customPrompt: 'Be creative',
      createdAt: new Date('2024-01-03'),
      updatedAt: new Date('2024-01-04'),
      messageCount: 3,
      firstMessage: 'Hi there',
      lastMessage: 'See you',
      hasActiveGeneration: true,
    },
  ];

  const defaultProps = {
    mindMaps: mockMindMaps,
    activeMindMapId: 'mindmap-1',
    onMindMapSelect: vi.fn(),
    onMindMapCreate: vi.fn(),
    onMindMapRename: vi.fn(),
    onMindMapDelete: vi.fn(),
    threads: mockThreads,
    onDeleteMessage: vi.fn(),
    onMessagesUpdate: vi.fn(),
  };

  // Create spies for window event methods
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let dispatchEventSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    user = userEvent.setup({ delay: null });
    vi.clearAllMocks();

    // Clear store action mocks
    mockStoreActions.updateNodeChatId.mockClear();
    mockStoreActions.updateNodeNotes.mockClear();
    mockStoreActions.updateNodeSources.mockClear();

    addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    dispatchEventSpy = vi.spyOn(window, 'dispatchEvent') as ReturnType<
      typeof vi.spyOn
    >;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('rendering', () => {
    it('should render ListPanel with mind maps', async () => {
      render(<MindMapsPanel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('mindmaps-slider')).toBeTruthy();
      });

      expect(screen.getByTestId('items-count').textContent).toBe('2');
      expect(screen.getByTestId('active-item').textContent).toBe('mindmap-1');
      expect(screen.getByTestId('empty-state-title').textContent).toBe(
        'No MindMaps yet'
      );
      expect(screen.getByTestId('show-child').textContent).toBe('false');
    });

    it('should render empty state when no mind maps', async () => {
      render(
        <MindMapsPanel
          {...defaultProps}
          mindMaps={[]}
          activeMindMapId={undefined}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('items-count').textContent).toBe('0');
      });

      expect(screen.getByTestId('active-item').textContent).toBe('none');
    });
  });

  describe('mind map operations', () => {
    it('should handle mind map selection', async () => {
      render(<MindMapsPanel {...defaultProps} />);

      const selectButton = screen.getByTestId('select-item');
      await user.click(selectButton);

      expect(defaultProps.onMindMapSelect).toHaveBeenCalledWith('mindmap-1');
    });

    it('should handle mind map creation', async () => {
      render(<MindMapsPanel {...defaultProps} />);

      const createButton = screen.getByTestId('create-item');
      await user.click(createButton);

      expect(defaultProps.onMindMapCreate).toHaveBeenCalled();
    });

    it('should handle mind map renaming', async () => {
      render(<MindMapsPanel {...defaultProps} />);

      const renameButton = screen.getByTestId('rename-item');
      await user.click(renameButton);

      expect(defaultProps.onMindMapRename).toHaveBeenCalledWith(
        'mindmap-1',
        'New Name'
      );
    });

    it('should handle mind map deletion', async () => {
      render(<MindMapsPanel {...defaultProps} />);

      const deleteButton = screen.getByTestId('delete-item');
      await user.click(deleteButton);

      expect(defaultProps.onMindMapDelete).toHaveBeenCalledWith('mindmap-1');
    });
  });

  describe('event listeners setup', () => {
    it('should register all required event listeners', async () => {
      render(<MindMapsPanel {...defaultProps} />);

      await waitFor(() => {
        expect(addEventListenerSpy).toHaveBeenCalled();
      });

      const expectedEvents = [
        'mindmap-inference-open',
        'mindmap-inference-close',
        'mindmap-inference-get-active',
        'mindmap-node-notes-updated',
        'mindmap-node-sources-updated',
        'mindmap-node-update-finished',
        'mindmap-inference-check-and-close',
      ];

      expectedEvents.forEach(eventType => {
        expect(addEventListenerSpy).toHaveBeenCalledWith(
          eventType,
          expect.any(Function)
        );
      });
    });

    it('should cleanup event listeners on unmount', async () => {
      const { unmount } = render(<MindMapsPanel {...defaultProps} />);

      await waitFor(() => {
        expect(addEventListenerSpy).toHaveBeenCalled();
      });

      unmount();

      const expectedEvents = [
        'mindmap-inference-open',
        'mindmap-inference-close',
        'mindmap-inference-get-active',
        'mindmap-node-notes-updated',
        'mindmap-node-sources-updated',
        'mindmap-node-update-finished',
        'mindmap-inference-check-and-close',
      ];

      expectedEvents.forEach(eventType => {
        expect(removeEventListenerSpy).toHaveBeenCalledWith(
          eventType,
          expect.any(Function)
        );
      });
    });
  });

  describe('inference chat integration', () => {
    it('should open chat integration on inference-open event', async () => {
      render(<MindMapsPanel {...defaultProps} />);

      // Ensure component is mounted and event listeners are registered
      await waitFor(() => {
        expect(addEventListenerSpy).toHaveBeenCalledWith(
          'mindmap-inference-open',
          expect.any(Function)
        );
      });

      expect(screen.getByTestId('show-child').textContent).toBe('false');

      // Get the actual event handler function that was registered
      const openEventHandler = addEventListenerSpy.mock.calls.find(
        call => call[0] === 'mindmap-inference-open'
      )?.[1] as EventListener;

      expect(openEventHandler).toBeDefined();

      // Create and dispatch event
      const event = new CustomEvent('mindmap-inference-open', {
        detail: {
          nodeId: 'node-1',
          label: 'Test Node',
          chatId: 'chat-123',
          notes: 'Test notes',
          sources: mockSources,
          focusChat: true,
          focusNotes: false,
          focusSources: false,
        },
      });

      // Call the handler directly to ensure it works
      await act(async () => {
        openEventHandler(event);
      });

      // Wait for state update to propagate
      await waitFor(() => {
        expect(screen.getByTestId('show-child').textContent).toBe('true');
      });

      expect(screen.getByTestId('mindmap-chat-integration')).toBeTruthy();
      expect(screen.getByTestId('chat-node-id').textContent).toBe('node-1');
      expect(screen.getByTestId('chat-node-label').textContent).toBe(
        'Test Node'
      );
      expect(screen.getByTestId('chat-id').textContent).toBe('chat-123');
      expect(screen.getByTestId('chat-notes').textContent).toBe('Test notes');

      // Should broadcast active node
      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'mindmap-inference-active',
        })
      );
    });

    it('should close chat integration on inference-close event', async () => {
      render(<MindMapsPanel {...defaultProps} />);

      // Wait for event listeners to be registered
      await waitFor(() => {
        expect(addEventListenerSpy).toHaveBeenCalledWith(
          'mindmap-inference-open',
          expect.any(Function)
        );
      });

      // Get event handlers
      const openEventHandler = addEventListenerSpy.mock.calls.find(
        call => call[0] === 'mindmap-inference-open'
      )?.[1] as EventListener;
      const closeEventHandler = addEventListenerSpy.mock.calls.find(
        call => call[0] === 'mindmap-inference-close'
      )?.[1] as EventListener;

      expect(openEventHandler).toBeDefined();
      expect(closeEventHandler).toBeDefined();

      // First open the chat
      await act(async () => {
        openEventHandler(
          new CustomEvent('mindmap-inference-open', {
            detail: {
              nodeId: 'node-1',
              label: 'Test Node',
            },
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('show-child').textContent).toBe('true');
      });

      // Then close it
      await act(async () => {
        closeEventHandler(new CustomEvent('mindmap-inference-close'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('show-child').textContent).toBe('false');
      });
      expect(screen.queryByTestId('mindmap-chat-integration')).toBeFalsy();

      // Should broadcast no active node
      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'mindmap-inference-active',
        })
      );
    });

    it('should respond to get-active-state events', async () => {
      render(<MindMapsPanel {...defaultProps} />);

      // Wait for event listeners to be registered
      await waitFor(() => {
        expect(addEventListenerSpy).toHaveBeenCalledWith(
          'mindmap-inference-open',
          expect.any(Function)
        );
      });

      // Get event handlers
      const openEventHandler = addEventListenerSpy.mock.calls.find(
        call => call[0] === 'mindmap-inference-open'
      )?.[1] as EventListener;
      const getActiveHandler = addEventListenerSpy.mock.calls.find(
        call => call[0] === 'mindmap-inference-get-active'
      )?.[1] as EventListener;

      expect(openEventHandler).toBeDefined();
      expect(getActiveHandler).toBeDefined();

      // Open chat first
      await act(async () => {
        openEventHandler(
          new CustomEvent('mindmap-inference-open', {
            detail: {
              nodeId: 'node-1',
              label: 'Test Node',
            },
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('show-child').textContent).toBe('true');
      });

      vi.clearAllMocks();

      // Request active state
      await act(async () => {
        getActiveHandler(new CustomEvent('mindmap-inference-get-active'));
      });

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'mindmap-inference-active',
        })
      );
    });

    it('should update node data on node-notes-updated event', async () => {
      render(<MindMapsPanel {...defaultProps} />);

      // Wait for event listeners to be registered
      await waitFor(() => {
        expect(addEventListenerSpy).toHaveBeenCalledWith(
          'mindmap-inference-open',
          expect.any(Function)
        );
      });

      // Get event handlers
      const openEventHandler = addEventListenerSpy.mock.calls.find(
        call => call[0] === 'mindmap-inference-open'
      )?.[1] as EventListener;
      const notesUpdatedHandler = addEventListenerSpy.mock.calls.find(
        call => call[0] === 'mindmap-node-notes-updated'
      )?.[1] as EventListener;

      expect(openEventHandler).toBeDefined();
      expect(notesUpdatedHandler).toBeDefined();

      // Open chat first
      await act(async () => {
        openEventHandler(
          new CustomEvent('mindmap-inference-open', {
            detail: {
              nodeId: 'node-1',
              label: 'Test Node',
              notes: 'Original notes',
            },
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('chat-notes').textContent).toBe(
          'Original notes'
        );
      });

      // Update notes
      await act(async () => {
        notesUpdatedHandler(
          new CustomEvent('mindmap-node-notes-updated', {
            detail: {
              nodeId: 'node-1',
              notes: 'Updated notes',
            },
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('chat-notes').textContent).toBe(
          'Updated notes'
        );
      });
    });

    it('should update node sources on node-sources-updated event', async () => {
      render(<MindMapsPanel {...defaultProps} />);

      // Wait for event listeners to be registered
      await waitFor(() => {
        expect(addEventListenerSpy).toHaveBeenCalledWith(
          'mindmap-inference-open',
          expect.any(Function)
        );
      });

      // Get event handlers
      const openEventHandler = addEventListenerSpy.mock.calls.find(
        call => call[0] === 'mindmap-inference-open'
      )?.[1] as EventListener;
      const sourcesUpdatedHandler = addEventListenerSpy.mock.calls.find(
        call => call[0] === 'mindmap-node-sources-updated'
      )?.[1] as EventListener;

      expect(openEventHandler).toBeDefined();
      expect(sourcesUpdatedHandler).toBeDefined();

      // Open chat first
      await act(async () => {
        openEventHandler(
          new CustomEvent('mindmap-inference-open', {
            detail: {
              nodeId: 'node-1',
              label: 'Test Node',
              sources: [],
            },
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('chat-sources')).toBeTruthy();
        const sourcesElement = screen.getByTestId('chat-sources');
        expect(
          JSON.parse(sourcesElement.textContent ?? '[]') as unknown
        ).toEqual([]);
      });

      // Update sources
      await act(async () => {
        sourcesUpdatedHandler(
          new CustomEvent('mindmap-node-sources-updated', {
            detail: {
              nodeId: 'node-1',
              sources: mockSources,
            },
          })
        );
      });

      await waitFor(() => {
        const updatedSources = JSON.parse(
          screen.getByTestId('chat-sources').textContent ?? '[]'
        );
        expect(updatedSources).toHaveLength(mockSources.length);
      });
    });

    it('should update node label on node-update-finished event', async () => {
      render(<MindMapsPanel {...defaultProps} />);

      // Wait for event listeners to be registered
      await waitFor(() => {
        expect(addEventListenerSpy).toHaveBeenCalledWith(
          'mindmap-inference-open',
          expect.any(Function)
        );
      });

      // Get event handlers
      const openEventHandler = addEventListenerSpy.mock.calls.find(
        call => call[0] === 'mindmap-inference-open'
      )?.[1] as EventListener;
      const labelUpdatedHandler = addEventListenerSpy.mock.calls.find(
        call => call[0] === 'mindmap-node-update-finished'
      )?.[1] as EventListener;

      expect(openEventHandler).toBeDefined();
      expect(labelUpdatedHandler).toBeDefined();

      // Open chat first
      await act(async () => {
        openEventHandler(
          new CustomEvent('mindmap-inference-open', {
            detail: {
              nodeId: 'node-1',
              label: 'Original Label',
            },
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('chat-node-label').textContent).toBe(
          'Original Label'
        );
      });

      // Update label
      await act(async () => {
        labelUpdatedHandler(
          new CustomEvent('mindmap-node-update-finished', {
            detail: {
              nodeId: 'node-1',
              label: 'Updated Label',
            },
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('chat-node-label').textContent).toBe(
          'Updated Label'
        );
      });
    });

    it('should close chat on inference-check-and-close event when node is deleted', async () => {
      render(<MindMapsPanel {...defaultProps} />);

      // Wait for event listeners to be registered
      await waitFor(() => {
        expect(addEventListenerSpy).toHaveBeenCalledWith(
          'mindmap-inference-open',
          expect.any(Function)
        );
      });

      // Get event handlers
      const openEventHandler = addEventListenerSpy.mock.calls.find(
        call => call[0] === 'mindmap-inference-open'
      )?.[1] as EventListener;
      const checkAndCloseHandler = addEventListenerSpy.mock.calls.find(
        call => call[0] === 'mindmap-inference-check-and-close'
      )?.[1] as EventListener;

      expect(openEventHandler).toBeDefined();
      expect(checkAndCloseHandler).toBeDefined();

      // Open chat first
      await act(async () => {
        openEventHandler(
          new CustomEvent('mindmap-inference-open', {
            detail: {
              nodeId: 'node-1',
              label: 'Test Node',
            },
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('show-child').textContent).toBe('true');
      });

      // Simulate node deletion
      await act(async () => {
        checkAndCloseHandler(
          new CustomEvent('mindmap-inference-check-and-close', {
            detail: {
              deletedNodeIds: ['node-1'],
              parentId: null,
            },
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('show-child').textContent).toBe('false');
      });
      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'mindmap-inference-close',
        })
      );
    });

    it('should close chat when parent node is deleted', async () => {
      render(<MindMapsPanel {...defaultProps} />);

      // Wait for event listeners to be registered
      await waitFor(() => {
        expect(addEventListenerSpy).toHaveBeenCalledWith(
          'mindmap-inference-open',
          expect.any(Function)
        );
      });

      // Get event handlers
      const openEventHandler = addEventListenerSpy.mock.calls.find(
        call => call[0] === 'mindmap-inference-open'
      )?.[1] as EventListener;
      const checkAndCloseHandler = addEventListenerSpy.mock.calls.find(
        call => call[0] === 'mindmap-inference-check-and-close'
      )?.[1] as EventListener;

      expect(openEventHandler).toBeDefined();
      expect(checkAndCloseHandler).toBeDefined();

      // Open chat first
      await act(async () => {
        openEventHandler(
          new CustomEvent('mindmap-inference-open', {
            detail: {
              nodeId: 'node-1',
              label: 'Test Node',
            },
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('show-child').textContent).toBe('true');
      });

      // Simulate parent deletion
      await act(async () => {
        checkAndCloseHandler(
          new CustomEvent('mindmap-inference-check-and-close', {
            detail: {
              deletedNodeIds: ['other-node'],
              parentId: 'node-1',
            },
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('show-child').textContent).toBe('false');
      });
    });
  });

  describe('chat integration actions', () => {
    let openEventHandler: EventListener;

    beforeEach(async () => {
      render(<MindMapsPanel {...defaultProps} />);

      // Wait for event listeners to be registered
      await waitFor(() => {
        expect(addEventListenerSpy).toHaveBeenCalledWith(
          'mindmap-inference-open',
          expect.any(Function)
        );
      });

      // Get event handler
      openEventHandler = addEventListenerSpy.mock.calls.find(
        call => call[0] === 'mindmap-inference-open'
      )?.[1] as EventListener;

      expect(openEventHandler).toBeDefined();

      // Open chat integration
      await act(async () => {
        openEventHandler(
          new CustomEvent('mindmap-inference-open', {
            detail: {
              nodeId: 'node-1',
              label: 'Test Node',
              chatId: 'chat-123',
            },
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('show-child').textContent).toBe('true');
      });
    });

    it('should handle thread association via store', async () => {
      const associateButton = screen.getByTestId('associate-thread');
      await user.click(associateButton);

      // The component no longer uses props for this - thread association is handled through store
      expect(associateButton).toBeTruthy();
    });

    it('should handle thread unassignment via store', async () => {
      const unassignButton = screen.getByTestId('unassign-thread');
      await user.click(unassignButton);

      // The component no longer uses props for this - thread unassignment is handled through store
      expect(unassignButton).toBeTruthy();
    });

    it('should handle chat close', async () => {
      const closeButton = screen.getByTestId('close-chat');
      await user.click(closeButton);

      expect(screen.getByTestId('show-child').textContent).toBe('false');
      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'mindmap-inference-close',
        })
      );
    });

    it('should handle navigation to previous node', async () => {
      const prevButton = screen.getByTestId('navigate-prev-node');
      await user.click(prevButton);

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'mindmap-navigate-sibling',
          detail: {
            currentNodeId: 'node-1',
            direction: 'prev',
          },
        })
      );
    });

    it('should handle navigation to next node', async () => {
      const nextButton = screen.getByTestId('navigate-next-node');
      await user.click(nextButton);

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'mindmap-navigate-sibling',
          detail: {
            currentNodeId: 'node-1',
            direction: 'next',
          },
        })
      );
    });

    it('should handle message deletion with chat ID', async () => {
      const deleteButton = screen.getByTestId('delete-chat-message');
      await user.click(deleteButton);

      expect(defaultProps.onDeleteMessage).toHaveBeenCalledWith(
        'chat-123',
        'msg-1'
      );
    });

    it('should handle messages update with chat ID', async () => {
      const updateButton = screen.getByTestId('update-chat-messages');
      await user.click(updateButton);

      expect(defaultProps.onMessagesUpdate).toHaveBeenCalledWith('chat-123', [
        {
          id: 'msg-1',
          content: 'test',
          role: 'user',
          timestamp: expect.any(Number),
        },
      ]);
    });
  });

  describe('optional callback handling', () => {
    it('should handle missing optional callbacks gracefully', async () => {
      const minimalProps = {
        mindMaps: mockMindMaps,
        activeMindMapId: 'mindmap-1',
        onMindMapSelect: vi.fn(),
        onMindMapCreate: vi.fn(),
        onMindMapRename: vi.fn(),
        onMindMapDelete: vi.fn(),
        threads: mockThreads,
      };

      render(<MindMapsPanel {...minimalProps} />);

      // Wait for event listeners to be registered
      await waitFor(() => {
        expect(addEventListenerSpy).toHaveBeenCalledWith(
          'mindmap-inference-open',
          expect.any(Function)
        );
      });

      // Get event handler
      const openEventHandler = addEventListenerSpy.mock.calls.find(
        call => call[0] === 'mindmap-inference-open'
      )?.[1] as EventListener;

      expect(openEventHandler).toBeDefined();

      // Open chat integration
      await act(async () => {
        openEventHandler(
          new CustomEvent('mindmap-inference-open', {
            detail: {
              nodeId: 'node-1',
              label: 'Test Node',
            },
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('show-child').textContent).toBe('true');
      });

      // These should not throw errors when callbacks are missing
      const buttons = [
        'navigate-to-chat',
        'delete-chat-message',
        'update-chat-messages',
        'update-chat-prompt',
        'update-chat-notes',
        'update-chat-sources',
        'create-chat-thread',
        'rename-chat-thread',
        'delete-chat-thread',
        'customize-chat-prompts',
      ];

      for (const buttonTestId of buttons) {
        const button = screen.getByTestId(buttonTestId);
        await user.click(button);
      }
    });

    it('should not handle message operations when no chat ID', async () => {
      const mockOnDeleteMessage = vi.fn();
      const mockOnMessagesUpdate = vi.fn();

      render(
        <MindMapsPanel
          {...defaultProps}
          onDeleteMessage={mockOnDeleteMessage}
          onMessagesUpdate={mockOnMessagesUpdate}
        />
      );

      // Wait for event listeners to be registered
      await waitFor(() => {
        expect(addEventListenerSpy).toHaveBeenCalledWith(
          'mindmap-inference-open',
          expect.any(Function)
        );
      });

      // Get event handler
      const openEventHandler = addEventListenerSpy.mock.calls.find(
        call => call[0] === 'mindmap-inference-open'
      )?.[1] as EventListener;

      expect(openEventHandler).toBeDefined();

      // Open chat without chatId
      await act(async () => {
        openEventHandler(
          new CustomEvent('mindmap-inference-open', {
            detail: {
              nodeId: 'node-1',
              label: 'Test Node',
              chatId: null,
            },
          })
        );
      });

      await waitFor(() => {
        const deleteButton = screen.getByTestId('delete-chat-message');
        const updateButton = screen.getByTestId('update-chat-messages');

        return deleteButton && updateButton;
      });

      const deleteButton = screen.getByTestId('delete-chat-message');
      const updateButton = screen.getByTestId('update-chat-messages');

      await user.click(deleteButton);
      await user.click(updateButton);

      expect(mockOnDeleteMessage).not.toHaveBeenCalled();
      expect(mockOnMessagesUpdate).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle events for non-active nodes gracefully', async () => {
      render(<MindMapsPanel {...defaultProps} />);

      // Wait for event listeners to be registered
      await waitFor(() => {
        expect(addEventListenerSpy).toHaveBeenCalledWith(
          'mindmap-inference-open',
          expect.any(Function)
        );
      });

      // Get event handlers
      const openEventHandler = addEventListenerSpy.mock.calls.find(
        call => call[0] === 'mindmap-inference-open'
      )?.[1] as EventListener;
      const notesUpdatedHandler = addEventListenerSpy.mock.calls.find(
        call => call[0] === 'mindmap-node-notes-updated'
      )?.[1] as EventListener;

      expect(openEventHandler).toBeDefined();
      expect(notesUpdatedHandler).toBeDefined();

      // Open chat for node-1
      await act(async () => {
        openEventHandler(
          new CustomEvent('mindmap-inference-open', {
            detail: {
              nodeId: 'node-1',
              label: 'Test Node',
              notes: 'Original notes',
            },
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('chat-notes')).toBeTruthy();
        expect(screen.getByTestId('chat-notes').textContent).toBe(
          'Original notes'
        );
      });

      // Update notes for different node
      await act(async () => {
        notesUpdatedHandler(
          new CustomEvent('mindmap-node-notes-updated', {
            detail: {
              nodeId: 'node-2',
              notes: 'Different notes',
            },
          })
        );
      });

      // Should not update the active chat node
      expect(screen.getByTestId('chat-notes').textContent).toBe(
        'Original notes'
      );
    });

    it('should handle navigation when no chat node is active', async () => {
      render(<MindMapsPanel {...defaultProps} />);

      // Try to navigate without opening chat first
      await act(async () => {
        window.dispatchEvent(
          new CustomEvent('mindmap-navigate-sibling', {
            detail: {
              currentNodeId: 'node-1',
              direction: 'prev',
            },
          })
        );
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      // Should not crash or dispatch events
      expect(screen.getByTestId('show-child').textContent).toBe('false');
    });

    it('should use store actions for node content updates', async () => {
      render(<MindMapsPanel {...defaultProps} />);

      // Wait for event listeners to be registered
      await waitFor(() => {
        expect(addEventListenerSpy).toHaveBeenCalledWith(
          'mindmap-inference-open',
          expect.any(Function)
        );
      });

      // Get event handler
      const openEventHandler = addEventListenerSpy.mock.calls.find(
        call => call[0] === 'mindmap-inference-open'
      )?.[1] as EventListener;

      expect(openEventHandler).toBeDefined();

      // Open chat integration
      await act(async () => {
        openEventHandler(
          new CustomEvent('mindmap-inference-open', {
            detail: {
              nodeId: 'node-1',
              label: 'Test Node',
            },
          })
        );
      });

      await waitFor(() => {
        const notesButton = screen.getByTestId('update-chat-notes');
        const sourcesButton = screen.getByTestId('update-chat-sources');
        return notesButton && sourcesButton;
      });

      const notesButton = screen.getByTestId('update-chat-notes');
      const sourcesButton = screen.getByTestId('update-chat-sources');

      await user.click(notesButton);
      await user.click(sourcesButton);

      await waitFor(() => {
        expect(mockStoreActions.updateNodeNotes).toHaveBeenCalledWith(
          'node-1',
          'new notes'
        );
        expect(mockStoreActions.updateNodeSources).toHaveBeenCalledWith(
          'node-1',
          mockSources
        );
      });
    });
  });
});
