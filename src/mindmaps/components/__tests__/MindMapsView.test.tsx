import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MindMapsView } from '../MindMapsView';
import type { MindMap } from '../../hooks/useMindMaps';
import type { ThreadMetadata } from '../../../store/useThreadsStore';
import { mockSources } from '../../__fixtures__/mindMapData';

// Mock the AppBar component
vi.mock('../../../components/AppBar', () => ({
  AppBar: ({
    icon: Icon,
    title,
    actions,
  }: {
    icon?: React.ComponentType;
    title?: string;
    actions?: React.ReactNode;
  }) => (
    <div data-testid="app-bar">
      <div data-testid="app-bar-icon">
        {Icon && <Icon data-testid="network-icon" />}
      </div>
      <div data-testid="app-bar-title">{title}</div>
      <div data-testid="app-bar-actions">{actions}</div>
    </div>
  ),
}));

// Mock the MindMapsPanel component
vi.mock('../MindMapsPanel', () => ({
  MindMapsPanel: ({
    mindMaps,
    activeMindMapId,
    onMindMapSelect,
    onMindMapCreate,
    onMindMapRename,
    onMindMapDelete,
    threads,
    onThreadAssociate,
    onThreadUnassign,
    onThreadCreate,
    onThreadRename,
    onThreadDelete,
    onNavigateToChat,
    onPromptUpdate,
    onCustomizePrompts,
    onNodeNotesUpdate,
    onNodeSourcesUpdate,
  }: {
    mindMaps: unknown[];
    activeMindMapId?: string;
    onMindMapSelect: (id: string) => void;
    onMindMapCreate: () => void;
    onMindMapRename: (id: string, name: string) => void;
    onMindMapDelete: (id: string) => void;
    threads: unknown[];
    onThreadAssociate: (
      threadId: string,
      mindMapId: string,
      nodeId: string
    ) => void;
    onThreadUnassign: (threadId: string) => void;
    onThreadCreate: () => void;
    onThreadRename: (id: string, name: string) => void;
    onThreadDelete: (id: string) => void;
    onNavigateToChat: (threadId: string) => void;
    onPromptUpdate: (prompt: string) => void;
    onCustomizePrompts: () => void;
    onNodeNotesUpdate: (notes: string) => void;
    onNodeSourcesUpdate: (sources: unknown[]) => void;
  }) => (
    <div data-testid="mindmaps-panel">
      <div data-testid="panel-mindmaps-count">{mindMaps.length}</div>
      <div data-testid="panel-active-mindmap">{activeMindMapId ?? 'none'}</div>
      <div data-testid="panel-threads-count">{threads.length}</div>

      {/* Action buttons for testing prop forwarding */}
      <button
        data-testid="panel-select-mindmap"
        onClick={() => onMindMapSelect('mindmap-1')}
      >
        Select MindMap
      </button>
      <button
        data-testid="panel-create-mindmap"
        onClick={() => onMindMapCreate()}
      >
        Create MindMap
      </button>
      <button
        data-testid="panel-rename-mindmap"
        onClick={() => onMindMapRename('mindmap-1', 'New Name')}
      >
        Rename MindMap
      </button>
      <button
        data-testid="panel-delete-mindmap"
        onClick={() => onMindMapDelete('mindmap-1')}
      >
        Delete MindMap
      </button>
      <button
        data-testid="panel-associate-thread"
        onClick={() => onThreadAssociate('thread-1', 'mindmap-1', 'node-1')}
      >
        Associate Thread
      </button>
      <button
        data-testid="panel-unassign-thread"
        onClick={() => onThreadUnassign('node-1')}
      >
        Unassign Thread
      </button>
      <button
        data-testid="panel-create-thread"
        onClick={() => onThreadCreate()}
      >
        Create Thread
      </button>
      <button
        data-testid="panel-rename-thread"
        onClick={() => onThreadRename('thread-1', 'New Thread')}
      >
        Rename Thread
      </button>
      <button
        data-testid="panel-delete-thread"
        onClick={() => onThreadDelete('thread-1')}
      >
        Delete Thread
      </button>
      <button
        data-testid="panel-navigate-chat"
        onClick={() => onNavigateToChat('thread-1')}
      >
        Navigate to Chat
      </button>
      <button
        data-testid="panel-update-prompt"
        onClick={() => onPromptUpdate('custom')}
      >
        Update Prompt
      </button>
      <button
        data-testid="panel-customize-prompts"
        onClick={() => onCustomizePrompts()}
      >
        Customize Prompts
      </button>
      <button
        data-testid="panel-update-notes"
        onClick={() => onNodeNotesUpdate('updated notes')}
      >
        Update Notes
      </button>
      <button
        data-testid="panel-update-sources"
        onClick={() => onNodeSourcesUpdate(mockSources)}
      >
        Update Sources
      </button>
    </div>
  ),
}));

// Mock the MindMapCanvas component
vi.mock('../MindMapCanvas', () => ({
  MindMapCanvas: ({
    activeMindMap,
    loadMindMaps,
    pendingNodeUpdate,
  }: {
    activeMindMap?: { id: string; name: string; data?: unknown };
    loadMindMaps: () => void;
    pendingNodeUpdate?: { nodeId: string; chatId?: string };
  }) => (
    <div data-testid="mindmap-canvas">
      <div data-testid="canvas-active-mindmap">
        {activeMindMap?.id ?? 'none'}
      </div>
      <div data-testid="canvas-active-mindmap-name">
        {activeMindMap?.name ?? 'no-name'}
      </div>
      <div data-testid="canvas-pending-update">
        {pendingNodeUpdate ? JSON.stringify(pendingNodeUpdate) : 'no-update'}
      </div>

      {/* Action button for testing prop forwarding */}
      <button data-testid="canvas-load-mindmaps" onClick={() => loadMindMaps()}>
        Load MindMaps
      </button>
    </div>
  ),
}));

describe('MindMapsView', () => {
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

  const mockActiveMindMap: MindMap = {
    id: 'mindmap-1',
    name: 'Active Mind Map',
    description: 'Currently active mind map',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
  };

  const mockPendingUpdate = {
    nodeId: 'node-123',
    chatId: 'chat-456',
    notes: 'Updated notes',
    sources: mockSources,
    timestamp: Date.now(),
  };

  const defaultProps = {
    mindMaps: mockMindMaps,
    activeMindMapId: 'mindmap-1',
    activeMindMap: mockActiveMindMap,
    threads: mockThreads,
    onMindMapSelect: vi.fn(),
    onMindMapCreate: vi.fn(),
    onMindMapRename: vi.fn(),
    onMindMapDelete: vi.fn(),
    onThreadAssociate: vi.fn(),
    onThreadUnassign: vi.fn(),
    onThreadCreate: vi.fn(),
    onThreadRename: vi.fn(),
    onThreadDelete: vi.fn(),
    onNavigateToChat: vi.fn(),
    onPromptUpdate: vi.fn(),
    onCustomizePrompts: vi.fn(),
    onNodeNotesUpdate: vi.fn().mockResolvedValue(undefined),
    onNodeSourcesUpdate: vi.fn().mockResolvedValue(undefined),
    loadMindMaps: vi.fn().mockResolvedValue(undefined),
    pendingNodeUpdate: mockPendingUpdate,
  };

  beforeEach(() => {
    user = userEvent.setup();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('rendering', () => {
    it('should render all main components', () => {
      render(<MindMapsView {...defaultProps} />);

      expect(screen.getByTestId('app-bar')).toBeInTheDocument();
      expect(screen.getByTestId('mindmaps-panel')).toBeInTheDocument();
      expect(screen.getByTestId('mindmap-canvas')).toBeInTheDocument();
    });

    it('should render correct AppBar with Network icon and title', () => {
      render(<MindMapsView {...defaultProps} />);

      expect(screen.getByTestId('app-bar-title')).toHaveTextContent('MindMaps');
      expect(screen.getByTestId('network-icon')).toBeInTheDocument();
      expect(screen.getByTestId('app-bar-actions')).toBeInTheDocument();
    });

    it('should have proper layout structure with flex classes', () => {
      const { container } = render(<MindMapsView {...defaultProps} />);

      const mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer).toHaveClass('flex', 'flex-col', 'h-full');

      const contentArea = mainContainer.querySelector(
        'div:nth-child(2)'
      ) as HTMLElement;
      expect(contentArea).toHaveClass('flex', 'flex-1', 'min-h-0');
    });

    it('should render empty state when no mind maps', () => {
      render(
        <MindMapsView
          {...defaultProps}
          mindMaps={[]}
          activeMindMapId={undefined}
          activeMindMap={null}
        />
      );

      expect(screen.getByTestId('panel-mindmaps-count')).toHaveTextContent('0');
      expect(screen.getByTestId('panel-active-mindmap')).toHaveTextContent(
        'none'
      );
      expect(screen.getByTestId('canvas-active-mindmap')).toHaveTextContent(
        'none'
      );
    });

    it('should render empty state when no threads', () => {
      render(<MindMapsView {...defaultProps} threads={[]} />);

      expect(screen.getByTestId('panel-threads-count')).toHaveTextContent('0');
    });
  });

  describe('data passing', () => {
    it('should pass mind maps data to MindMapsPanel', () => {
      render(<MindMapsView {...defaultProps} />);

      expect(screen.getByTestId('panel-mindmaps-count')).toHaveTextContent('2');
      expect(screen.getByTestId('panel-active-mindmap')).toHaveTextContent(
        'mindmap-1'
      );
    });

    it('should pass threads data to MindMapsPanel', () => {
      render(<MindMapsView {...defaultProps} />);

      expect(screen.getByTestId('panel-threads-count')).toHaveTextContent('2');
    });

    it('should pass active mind map to MindMapCanvas', () => {
      render(<MindMapsView {...defaultProps} />);

      expect(screen.getByTestId('canvas-active-mindmap')).toHaveTextContent(
        'mindmap-1'
      );
      expect(
        screen.getByTestId('canvas-active-mindmap-name')
      ).toHaveTextContent('Active Mind Map');
    });

    it('should pass pending node update to MindMapCanvas', () => {
      render(<MindMapsView {...defaultProps} />);

      const pendingUpdateElement = screen.getByTestId('canvas-pending-update');
      const updateData = JSON.parse(pendingUpdateElement.textContent ?? '{}');

      expect(updateData.nodeId).toBe('node-123');
      expect(updateData.chatId).toBe('chat-456');
      expect(updateData.notes).toBe('Updated notes');
    });

    it('should handle missing pending update gracefully', () => {
      render(<MindMapsView {...defaultProps} pendingNodeUpdate={undefined} />);

      expect(screen.getByTestId('canvas-pending-update')).toHaveTextContent(
        'no-update'
      );
    });
  });

  describe('mind map operations', () => {
    it('should handle mind map selection', async () => {
      render(<MindMapsView {...defaultProps} />);

      const selectButton = screen.getByTestId('panel-select-mindmap');
      await user.click(selectButton);

      expect(defaultProps.onMindMapSelect).toHaveBeenCalledWith('mindmap-1');
    });

    it('should handle mind map creation', async () => {
      render(<MindMapsView {...defaultProps} />);

      const createButton = screen.getByTestId('panel-create-mindmap');
      await user.click(createButton);

      expect(defaultProps.onMindMapCreate).toHaveBeenCalled();
    });

    it('should handle mind map renaming', async () => {
      render(<MindMapsView {...defaultProps} />);

      const renameButton = screen.getByTestId('panel-rename-mindmap');
      await user.click(renameButton);

      expect(defaultProps.onMindMapRename).toHaveBeenCalledWith(
        'mindmap-1',
        'New Name'
      );
    });

    it('should handle mind map deletion', async () => {
      render(<MindMapsView {...defaultProps} />);

      const deleteButton = screen.getByTestId('panel-delete-mindmap');
      await user.click(deleteButton);

      expect(defaultProps.onMindMapDelete).toHaveBeenCalledWith('mindmap-1');
    });

    it('should handle mind map loading', async () => {
      render(<MindMapsView {...defaultProps} />);

      const loadButton = screen.getByTestId('canvas-load-mindmaps');
      await user.click(loadButton);

      expect(defaultProps.loadMindMaps).toHaveBeenCalledWith(true);
    });
  });

  describe('thread operations', () => {
    it('should handle thread association', async () => {
      render(<MindMapsView {...defaultProps} />);

      const associateButton = screen.getByTestId('panel-associate-thread');
      await user.click(associateButton);

      expect(defaultProps.onThreadAssociate).toHaveBeenCalledWith(
        'node-1',
        'thread-1'
      );
    });

    it('should handle thread unassignment', async () => {
      render(<MindMapsView {...defaultProps} />);

      const unassignButton = screen.getByTestId('panel-unassign-thread');
      await user.click(unassignButton);

      expect(defaultProps.onThreadUnassign).toHaveBeenCalledWith('node-1');
    });

    it('should handle thread creation', async () => {
      render(<MindMapsView {...defaultProps} />);

      const createButton = screen.getByTestId('panel-create-thread');
      await user.click(createButton);

      expect(defaultProps.onThreadCreate).toHaveBeenCalled();
    });

    it('should handle thread renaming', async () => {
      render(<MindMapsView {...defaultProps} />);

      const renameButton = screen.getByTestId('panel-rename-thread');
      await user.click(renameButton);

      expect(defaultProps.onThreadRename).toHaveBeenCalledWith(
        'thread-1',
        'New Thread'
      );
    });

    it('should handle thread deletion', async () => {
      render(<MindMapsView {...defaultProps} />);

      const deleteButton = screen.getByTestId('panel-delete-thread');
      await user.click(deleteButton);

      expect(defaultProps.onThreadDelete).toHaveBeenCalledWith('thread-1');
    });

    it('should handle navigation to chat', async () => {
      render(<MindMapsView {...defaultProps} />);

      const navigateButton = screen.getByTestId('panel-navigate-chat');
      await user.click(navigateButton);

      expect(defaultProps.onNavigateToChat).toHaveBeenCalledWith('thread-1');
    });

    it('should handle prompt updates', async () => {
      render(<MindMapsView {...defaultProps} />);

      const updateButton = screen.getByTestId('panel-update-prompt');
      await user.click(updateButton);

      expect(defaultProps.onPromptUpdate).toHaveBeenCalledWith(
        'thread-1',
        'custom'
      );
    });

    it('should handle prompt customization', async () => {
      render(<MindMapsView {...defaultProps} />);

      const customizeButton = screen.getByTestId('panel-customize-prompts');
      await user.click(customizeButton);

      expect(defaultProps.onCustomizePrompts).toHaveBeenCalled();
    });
  });

  describe('node content operations', () => {
    it('should handle node notes updates', async () => {
      render(<MindMapsView {...defaultProps} />);

      const updateButton = screen.getByTestId('panel-update-notes');
      await user.click(updateButton);

      await waitFor(() => {
        expect(defaultProps.onNodeNotesUpdate).toHaveBeenCalledWith(
          'node-1',
          'updated notes'
        );
      });
    });

    it('should handle node sources updates', async () => {
      render(<MindMapsView {...defaultProps} />);

      const updateButton = screen.getByTestId('panel-update-sources');
      await user.click(updateButton);

      await waitFor(() => {
        expect(defaultProps.onNodeSourcesUpdate).toHaveBeenCalledWith(
          'node-1',
          mockSources
        );
      });
    });

    it('should handle async operations in node updates', async () => {
      const mockAsyncNotesUpdate = vi
        .fn()
        .mockImplementation(async (nodeId, notes) => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return { success: true, nodeId, notes };
        });

      render(
        <MindMapsView
          {...defaultProps}
          onNodeNotesUpdate={mockAsyncNotesUpdate}
        />
      );

      const updateButton = screen.getByTestId('panel-update-notes');
      await user.click(updateButton);

      await waitFor(() => {
        expect(mockAsyncNotesUpdate).toHaveBeenCalledWith(
          'node-1',
          'updated notes'
        );
      });
    });
  });

  describe('prop forwarding', () => {
    it('should forward all props correctly to MindMapsPanel', () => {
      const testProps = {
        ...defaultProps,
        mindMaps: [mockMindMaps[0]],
        activeMindMapId: 'test-id',
        threads: [mockThreads[0]],
      };

      render(<MindMapsView {...testProps} />);

      expect(screen.getByTestId('panel-mindmaps-count')).toHaveTextContent('1');
      expect(screen.getByTestId('panel-active-mindmap')).toHaveTextContent(
        'test-id'
      );
      expect(screen.getByTestId('panel-threads-count')).toHaveTextContent('1');
    });

    it('should forward all props correctly to MindMapCanvas', () => {
      const customMindMap = {
        id: 'custom-map',
        name: 'Custom Map',
        description: 'Custom test map',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      };

      const customUpdate = {
        nodeId: 'custom-node',
        chatId: 'custom-chat',
        notes: 'Custom notes',
        sources: [],
        timestamp: 12345,
      };

      render(
        <MindMapsView
          {...defaultProps}
          activeMindMap={customMindMap}
          pendingNodeUpdate={customUpdate}
        />
      );

      expect(screen.getByTestId('canvas-active-mindmap')).toHaveTextContent(
        'custom-map'
      );
      expect(
        screen.getByTestId('canvas-active-mindmap-name')
      ).toHaveTextContent('Custom Map');

      const pendingUpdateElement = screen.getByTestId('canvas-pending-update');
      const updateData = JSON.parse(pendingUpdateElement.textContent ?? '{}');
      expect(updateData.nodeId).toBe('custom-node');
      expect(updateData.timestamp).toBe(12345);
    });
  });

  describe('edge cases', () => {
    it('should handle null/undefined props gracefully', () => {
      const minimalProps = {
        mindMaps: [],
        activeMindMapId: undefined,
        activeMindMap: null,
        threads: [],
        onMindMapSelect: vi.fn(),
        onMindMapCreate: vi.fn(),
        onMindMapRename: vi.fn(),
        onMindMapDelete: vi.fn(),
        onThreadAssociate: vi.fn(),
        onThreadUnassign: vi.fn(),
        onThreadCreate: vi.fn(),
        onThreadRename: vi.fn(),
        onThreadDelete: vi.fn(),
        onNavigateToChat: vi.fn(),
        onPromptUpdate: vi.fn(),
        onCustomizePrompts: vi.fn(),
        onNodeNotesUpdate: vi.fn().mockResolvedValue(undefined),
        onNodeSourcesUpdate: vi.fn().mockResolvedValue(undefined),
        loadMindMaps: vi.fn().mockResolvedValue(undefined),
        pendingNodeUpdate: undefined,
      };

      render(<MindMapsView {...minimalProps} />);

      expect(screen.getByTestId('app-bar')).toBeInTheDocument();
      expect(screen.getByTestId('mindmaps-panel')).toBeInTheDocument();
      expect(screen.getByTestId('mindmap-canvas')).toBeInTheDocument();
      expect(screen.getByTestId('panel-mindmaps-count')).toHaveTextContent('0');
      expect(screen.getByTestId('panel-threads-count')).toHaveTextContent('0');
      expect(screen.getByTestId('canvas-active-mindmap')).toHaveTextContent(
        'none'
      );
    });

    it('should handle large datasets', () => {
      const largeMindMaps = Array.from({ length: 100 }, (_, i) => ({
        id: `mindmap-${i}`,
        name: `Mind Map ${i}`,
        description: `Description ${i}`,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      }));

      const largeThreads = Array.from({ length: 50 }, (_, i) => ({
        id: `thread-${i}`,
        name: `Thread ${i}`,
        model: 'gpt-4',
        modelPreset: 'balanced' as const,
        customPrompt: undefined,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
        messageCount: i,
        firstMessage: `First ${i}`,
        lastMessage: `Last ${i}`,
        hasActiveGeneration: false,
      }));

      render(
        <MindMapsView
          {...defaultProps}
          mindMaps={largeMindMaps}
          threads={largeThreads}
        />
      );

      expect(screen.getByTestId('panel-mindmaps-count')).toHaveTextContent(
        '100'
      );
      expect(screen.getByTestId('panel-threads-count')).toHaveTextContent('50');
    });

    it('should handle component updates correctly', async () => {
      const { rerender } = render(<MindMapsView {...defaultProps} />);

      expect(screen.getByTestId('panel-mindmaps-count')).toHaveTextContent('2');

      const updatedMindMaps = [
        ...mockMindMaps,
        {
          id: 'mindmap-3',
          name: 'Third Mind Map',
          description: 'Third test mind map',
          createdAt: new Date('2024-01-05'),
          updatedAt: new Date('2024-01-06'),
        },
      ];

      rerender(<MindMapsView {...defaultProps} mindMaps={updatedMindMaps} />);

      expect(screen.getByTestId('panel-mindmaps-count')).toHaveTextContent('3');
    });

    it('should maintain component structure during data changes', () => {
      const { rerender } = render(<MindMapsView {...defaultProps} />);

      // Change to empty state
      rerender(
        <MindMapsView
          {...defaultProps}
          mindMaps={[]}
          activeMindMapId={undefined}
          activeMindMap={null}
          threads={[]}
        />
      );

      // Core components should still be present
      expect(screen.getByTestId('app-bar')).toBeInTheDocument();
      expect(screen.getByTestId('mindmaps-panel')).toBeInTheDocument();
      expect(screen.getByTestId('mindmap-canvas')).toBeInTheDocument();

      // Change back to populated state
      rerender(<MindMapsView {...defaultProps} />);

      expect(screen.getByTestId('panel-mindmaps-count')).toHaveTextContent('2');
      expect(screen.getByTestId('panel-threads-count')).toHaveTextContent('2');
    });
  });

  describe('error handling', () => {
    it('should handle callback errors gracefully', async () => {
      const errorProps = {
        ...defaultProps,
        onMindMapSelect: vi.fn().mockImplementation(() => {
          throw new Error('Selection failed');
        }),
      };

      render(<MindMapsView {...errorProps} />);

      const selectButton = screen.getByTestId('panel-select-mindmap');

      // Should not crash the component when callback throws
      expect(() => user.click(selectButton)).not.toThrow();
    });

    it('should handle async callback rejections', async () => {
      const errorProps = {
        ...defaultProps,
        onNodeNotesUpdate: vi
          .fn()
          .mockRejectedValue(new Error('Update failed')),
      };

      render(<MindMapsView {...errorProps} />);

      const updateButton = screen.getByTestId('panel-update-notes');

      // Should handle promise rejection gracefully
      expect(async () => {
        await user.click(updateButton);
      }).not.toThrow();

      await waitFor(() => {
        expect(errorProps.onNodeNotesUpdate).toHaveBeenCalled();
      });
    });
  });

  describe('integration', () => {
    it('should coordinate between panel and canvas components', async () => {
      render(<MindMapsView {...defaultProps} />);

      // Test that both components receive consistent data
      expect(screen.getByTestId('panel-active-mindmap')).toHaveTextContent(
        'mindmap-1'
      );
      expect(screen.getByTestId('canvas-active-mindmap')).toHaveTextContent(
        'mindmap-1'
      );

      // Test that canvas can trigger mind map loading
      const loadButton = screen.getByTestId('canvas-load-mindmaps');
      await user.click(loadButton);

      expect(defaultProps.loadMindMaps).toHaveBeenCalledWith(true);
    });

    it('should maintain proper data flow between components', () => {
      const customProps = {
        ...defaultProps,
        activeMindMapId: 'custom-id',
        activeMindMap: {
          id: 'custom-id',
          name: 'Custom Mind Map',
          description: 'Custom description',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-02'),
        },
      };

      render(<MindMapsView {...customProps} />);

      // Panel should show the active ID
      expect(screen.getByTestId('panel-active-mindmap')).toHaveTextContent(
        'custom-id'
      );

      // Canvas should show the active mind map object
      expect(screen.getByTestId('canvas-active-mindmap')).toHaveTextContent(
        'custom-id'
      );
      expect(
        screen.getByTestId('canvas-active-mindmap-name')
      ).toHaveTextContent('Custom Mind Map');
    });
  });
});
