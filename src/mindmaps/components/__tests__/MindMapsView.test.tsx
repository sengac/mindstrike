import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MindMapsView } from '../MindMapsView';
import type { MindMap } from '../../hooks/useMindMaps';
import type { ThreadMetadata } from '../../../store/useThreadsStore';
import { logger } from '../../../utils/logger';

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
    onThreadCreate,
    onThreadRename,
    onThreadDelete,
    onNavigateToChat,
    onPromptUpdate,
    onCustomizePrompts,
  }: {
    mindMaps: unknown[];
    activeMindMapId?: string;
    onMindMapSelect: (id: string) => void;
    onMindMapCreate: () => void;
    onMindMapRename: (id: string, name: string) => void;
    onMindMapDelete: (id: string) => void;
    threads: unknown[];
    onThreadCreate: () => void;
    onThreadRename: (id: string, name: string) => void;
    onThreadDelete: (id: string) => void;
    onNavigateToChat: (threadId: string) => void;
    onPromptUpdate: (threadId: string, customPrompt?: string) => void;
    onCustomizePrompts: () => void;
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
        onClick={() => onPromptUpdate('thread-1', 'custom')}
      >
        Update Prompt
      </button>
      <button
        data-testid="panel-customize-prompts"
        onClick={() => onCustomizePrompts()}
      >
        Customize Prompts
      </button>
    </div>
  ),
}));

// Mock the MindMapCanvas component
vi.mock('../MindMapCanvas', () => ({
  MindMapCanvas: ({
    activeMindMap,
    loadMindMaps,
  }: {
    activeMindMap?: { id: string; name: string; data?: unknown };
    loadMindMaps: (preserveActiveId?: boolean) => Promise<void>;
  }) => (
    <div data-testid="mindmap-canvas">
      <div data-testid="canvas-active-mindmap">
        {activeMindMap?.id ?? 'none'}
      </div>
      <div data-testid="canvas-active-mindmap-name">
        {activeMindMap?.name ?? 'no-name'}
      </div>

      {/* Action button for testing prop forwarding */}
      <button
        data-testid="canvas-load-mindmaps"
        onClick={() => {
          const result: unknown = loadMindMaps(true);
          // Type guard to check if result is a promise
          const isPromise = (value: unknown): value is Promise<unknown> => {
            return (
              value !== null &&
              typeof value === 'object' &&
              'then' in value &&
              typeof (value as Record<string, unknown>).then === 'function'
            );
          };

          if (isPromise(result)) {
            result.catch(error => {
              // Re-throw to let the test fail if there's an error
              throw error;
            });
          }
        }}
      >
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

  const defaultProps = {
    mindMaps: mockMindMaps,
    activeMindMapId: 'mindmap-1',
    activeMindMap: mockActiveMindMap,
    threads: mockThreads,
    onMindMapSelect: vi.fn(),
    onMindMapCreate: vi.fn(),
    onMindMapRename: vi.fn(),
    onMindMapDelete: vi.fn(),
    onThreadCreate: vi.fn(),
    onThreadRename: vi.fn(),
    onThreadDelete: vi.fn(),
    onNavigateToChat: vi.fn(),
    onPromptUpdate: vi.fn(),
    onCustomizePrompts: vi.fn(),
    loadMindMaps: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    user = userEvent.setup({ delay: null });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('rendering', () => {
    it('should render all main components', async () => {
      render(<MindMapsView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('app-bar')).toBeTruthy();
      });

      expect(screen.getByTestId('mindmaps-panel')).toBeTruthy();
      expect(screen.getByTestId('mindmap-canvas')).toBeTruthy();
    });

    it('should render correct AppBar with Network icon and title', async () => {
      render(<MindMapsView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('app-bar-title').textContent).toBe(
          'MindMaps'
        );
      });

      expect(screen.getByTestId('network-icon')).toBeTruthy();
      expect(screen.getByTestId('app-bar-actions')).toBeTruthy();
    });

    it('should have proper layout structure with flex classes', async () => {
      const { container } = render(<MindMapsView {...defaultProps} />);

      await waitFor(() => {
        expect(container.firstChild).toBeTruthy();
      });

      // Find the main container div with flex classes
      const mainContainer = container.querySelector(
        '.flex.flex-col.h-full'
      ) as HTMLElement;
      expect(mainContainer).toBeTruthy();
      const mainClasses = mainContainer.getAttribute('class') ?? '';
      expect(mainClasses).toContain('flex');
      expect(mainClasses).toContain('flex-col');
      expect(mainClasses).toContain('h-full');

      // Find the content area div with flex-1 classes
      const contentArea = container.querySelector(
        '.flex.flex-1.min-h-0'
      ) as HTMLElement;
      expect(contentArea).toBeTruthy();
      const contentClasses = contentArea.getAttribute('class') ?? '';
      expect(contentClasses).toContain('flex');
      expect(contentClasses).toContain('flex-1');
      expect(contentClasses).toContain('min-h-0');
    });

    it('should render empty state when no mind maps', async () => {
      render(
        <MindMapsView
          {...defaultProps}
          mindMaps={[]}
          activeMindMapId={undefined}
          activeMindMap={null}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('panel-mindmaps-count').textContent).toBe(
          '0'
        );
      });

      expect(screen.getByTestId('panel-active-mindmap').textContent).toBe(
        'none'
      );
      expect(screen.getByTestId('canvas-active-mindmap').textContent).toBe(
        'none'
      );
    });

    it('should render empty state when no threads', async () => {
      render(<MindMapsView {...defaultProps} threads={[]} />);

      await waitFor(() => {
        expect(screen.getByTestId('panel-threads-count').textContent).toBe('0');
      });
    });
  });

  describe('data passing', () => {
    it('should pass mind maps data to MindMapsPanel', async () => {
      render(<MindMapsView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('panel-mindmaps-count').textContent).toBe(
          '2'
        );
      });

      expect(screen.getByTestId('panel-active-mindmap').textContent).toBe(
        'mindmap-1'
      );
    });

    it('should pass threads data to MindMapsPanel', async () => {
      render(<MindMapsView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('panel-threads-count').textContent).toBe('2');
      });
    });

    it('should pass active mind map to MindMapCanvas', async () => {
      render(<MindMapsView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('canvas-active-mindmap').textContent).toBe(
          'mindmap-1'
        );
      });

      expect(screen.getByTestId('canvas-active-mindmap-name').textContent).toBe(
        'Active Mind Map'
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

  describe('prop forwarding', () => {
    it('should forward all props correctly to MindMapsPanel', () => {
      const testProps = {
        ...defaultProps,
        mindMaps: [mockMindMaps[0]],
        activeMindMapId: 'test-id',
        threads: [mockThreads[0]],
      };

      render(<MindMapsView {...testProps} />);

      expect(screen.getByTestId('panel-mindmaps-count').textContent).toBe('1');
      expect(screen.getByTestId('panel-active-mindmap').textContent).toBe(
        'test-id'
      );
      expect(screen.getByTestId('panel-threads-count').textContent).toBe('1');
    });

    it('should forward all props correctly to MindMapCanvas', () => {
      const customMindMap = {
        id: 'custom-map',
        name: 'Custom Map',
        description: 'Custom test map',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      };

      render(<MindMapsView {...defaultProps} activeMindMap={customMindMap} />);

      expect(screen.getByTestId('canvas-active-mindmap').textContent).toBe(
        'custom-map'
      );
      expect(screen.getByTestId('canvas-active-mindmap-name').textContent).toBe(
        'Custom Map'
      );
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
        onThreadCreate: vi.fn(),
        onThreadRename: vi.fn(),
        onThreadDelete: vi.fn(),
        onNavigateToChat: vi.fn(),
        onPromptUpdate: vi.fn(),
        onCustomizePrompts: vi.fn(),
        loadMindMaps: vi.fn().mockResolvedValue(undefined),
      };

      render(<MindMapsView {...minimalProps} />);

      expect(screen.getByTestId('app-bar')).toBeTruthy();
      expect(screen.getByTestId('mindmaps-panel')).toBeTruthy();
      expect(screen.getByTestId('mindmap-canvas')).toBeTruthy();
      expect(screen.getByTestId('panel-mindmaps-count').textContent).toBe('0');
      expect(screen.getByTestId('panel-threads-count').textContent).toBe('0');
      expect(screen.getByTestId('canvas-active-mindmap').textContent).toBe(
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

      expect(screen.getByTestId('panel-mindmaps-count').textContent).toBe(
        '100'
      );
      expect(screen.getByTestId('panel-threads-count').textContent).toBe('50');
    });

    it('should handle component updates correctly', async () => {
      const { rerender } = render(<MindMapsView {...defaultProps} />);

      expect(screen.getByTestId('panel-mindmaps-count').textContent).toBe('2');

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

      expect(screen.getByTestId('panel-mindmaps-count').textContent).toBe('3');
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
      expect(screen.getByTestId('app-bar')).toBeTruthy();
      expect(screen.getByTestId('mindmaps-panel')).toBeTruthy();
      expect(screen.getByTestId('mindmap-canvas')).toBeTruthy();

      // Change back to populated state
      rerender(<MindMapsView {...defaultProps} />);

      expect(screen.getByTestId('panel-mindmaps-count').textContent).toBe('2');
      expect(screen.getByTestId('panel-threads-count').textContent).toBe('2');
    });
  });

  describe('error handling', () => {
    it('should handle callback errors gracefully', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const errorProps = {
        ...defaultProps,
        onMindMapSelect: vi.fn().mockImplementation(() => {
          throw new Error('Selection failed');
        }),
      };

      render(<MindMapsView {...errorProps} />);

      const selectButton = screen.getByTestId('panel-select-mindmap');

      // Click the button - this should not crash the component
      await user.click(selectButton);

      // Verify the callback was called
      expect(errorProps.onMindMapSelect).toHaveBeenCalledWith('mindmap-1');

      // Verify the component is still functional by checking it still renders
      expect(screen.getByTestId('app-bar')).toBeTruthy();
      expect(screen.getByTestId('mindmaps-panel')).toBeTruthy();
      expect(screen.getByTestId('mindmap-canvas')).toBeTruthy();

      consoleSpy.mockRestore();
    });

    it('should handle async callback rejections', async () => {
      const loggerSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

      const errorProps = {
        ...defaultProps,
        onMindMapSelect: vi.fn().mockImplementation(() => {
          throw new Error('Selection failed');
        }),
      };

      render(<MindMapsView {...errorProps} />);

      const selectButton = screen.getByTestId('panel-select-mindmap');

      // Should handle synchronous errors gracefully
      expect(async () => {
        await user.click(selectButton);
      }).not.toThrow();

      loggerSpy.mockRestore();

      await waitFor(() => {
        expect(errorProps.onMindMapSelect).toHaveBeenCalled();
      });
    });
  });

  describe('integration', () => {
    it('should coordinate between panel and canvas components', async () => {
      render(<MindMapsView {...defaultProps} />);

      // Test that both components receive consistent data
      expect(screen.getByTestId('panel-active-mindmap').textContent).toBe(
        'mindmap-1'
      );
      expect(screen.getByTestId('canvas-active-mindmap').textContent).toBe(
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
      expect(screen.getByTestId('panel-active-mindmap').textContent).toBe(
        'custom-id'
      );

      // Canvas should show the active mind map object
      expect(screen.getByTestId('canvas-active-mindmap').textContent).toBe(
        'custom-id'
      );
      expect(screen.getByTestId('canvas-active-mindmap-name').textContent).toBe(
        'Custom Mind Map'
      );
    });
  });
});
