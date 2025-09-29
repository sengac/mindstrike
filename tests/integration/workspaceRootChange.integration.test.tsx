import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { SSEEventType } from '../../src/types';

// Mock monaco-editor before importing App
vi.mock('monaco-editor', () => ({
  editor: {
    create: vi.fn(),
    defineTheme: vi.fn(),
    setTheme: vi.fn(),
  },
}));

// Create mock functions outside to access them in tests
const mockLoadThreads = vi.fn().mockResolvedValue(undefined);
const mockLoadMindMaps = vi.fn().mockResolvedValue(undefined);
let sseSubscribers: Map<
  string,
  Array<(event: { type: string; data: unknown }) => void>
> = new Map();

// Mock SSE event bus
vi.mock('../../src/utils/sseEventBus', () => ({
  sseEventBus: {
    initialize: vi.fn(),
    subscribe: vi.fn(
      (
        type: string,
        callback: (event: { type: string; data: unknown }) => void
      ) => {
        if (!sseSubscribers.has(type)) {
          sseSubscribers.set(type, []);
        }
        sseSubscribers.get(type)!.push(callback);
        return () => {
          const callbacks = sseSubscribers.get(type) || [];
          const index = callbacks.indexOf(callback);
          if (index > -1) {
            callbacks.splice(index, 1);
          }
        };
      }
    ),
  },
}));

// Mock workspace initializer
vi.mock('../../src/utils/workspaceInitializer', () => ({
  initializeWorkspace: vi.fn().mockResolvedValue(undefined),
}));

// Mock stores
vi.mock('../../src/store/useSystemInformationStore', () => ({
  useSystemInformationStore: {
    getState: () => ({
      initialize: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

vi.mock('../../src/store/useMCPLogsStore', () => ({
  useMCPLogsStore: {
    getState: () => ({
      fetchLogs: vi.fn(),
    }),
  },
}));

vi.mock('../../src/store/useAppStore', () => ({
  useAppStore: Object.assign(
    () => ({
      sidebarOpen: true,
      setSidebarOpen: vi.fn(),
      activeView: 'workspace',
      setActiveView: vi.fn(),
      fontScheme: 'default',
      defaultCustomPrompt: '',
      showLocalModelDialog: false,
      setShowLocalModelDialog: vi.fn(),
      workspaceRoot: '/test/workspace',
      musicRoot: null,
      setWorkspaceRoot: vi.fn(),
      setMusicRoot: vi.fn(),
      loadWorkspaceRoots: vi.fn().mockResolvedValue(undefined),
    }),
    {
      getState: () => ({
        loadWorkspaceRoots: vi.fn().mockResolvedValue(undefined),
        setWorkspaceRoot: vi.fn(),
        setMusicRoot: vi.fn(),
      }),
    }
  ),
}));

vi.mock('../../src/store/useThreadsStore', () => ({
  useThreadsStore: () => ({
    toggleAgentMode: vi.fn(),
  }),
}));

// Mock logger
vi.mock('../../src/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock components
vi.mock('../../src/components/Sidebar', () => ({
  Sidebar: () => null,
}));

vi.mock('../../src/chat/components/ChatView', () => ({
  ChatView: () => null,
}));

vi.mock('../../src/mindmaps/components/MindMapsView', () => ({
  MindMapsView: () => null,
}));

vi.mock('../../src/workspace/components/WorkspaceView', () => ({
  WorkspaceView: vi.fn(props => {
    return React.createElement(
      'div',
      { 'data-testid': 'workspace-view' },
      React.createElement(
        'button',
        {
          'data-testid': 'set-root-button',
          onClick: () => props.onDirectoryChange?.(),
        },
        'Set Workspace Root'
      )
    );
  }),
}));

vi.mock('../../src/components/AgentsView', () => ({
  AgentsView: () => null,
}));

vi.mock('../../src/settings/components/SettingsView', () => ({
  SettingsView: () => null,
}));

vi.mock('../../src/components/LocalModelLoadDialog', () => ({
  LocalModelLoadDialog: () => null,
}));

vi.mock('../../src/components/ApplicationLogsView', () => ({
  ApplicationLogsView: () => null,
}));

vi.mock('../../src/settings/components/PromptsModal', () => ({
  PromptsModal: () => null,
}));

vi.mock('../../src/components/shared/ConnectionMonitorDialog', () => ({
  ConnectionMonitorDialog: () => null,
}));

vi.mock('react-hot-toast', () => ({
  Toaster: () => null,
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../src/utils/stormToastEffect', () => ({
  initStormToastEffect: () => vi.fn(),
}));

// Mock hooks
vi.mock('../../src/chat/hooks/useThreads', () => ({
  useThreads: () => ({
    threads: [],
    activeThreadId: null,
    isLoaded: true,
    loadThreads: mockLoadThreads,
    createThread: vi.fn(),
    deleteThread: vi.fn(),
    renameThread: vi.fn(),
    updateThreadPrompt: vi.fn(),
    selectThread: vi.fn(),
  }),
}));

vi.mock('../../src/mindmaps/hooks/useMindMaps', () => ({
  useMindMaps: () => ({
    mindMaps: [],
    activeMindMapId: null,
    activeMindMap: null,
    loadMindMaps: mockLoadMindMaps,
    createMindMap: vi.fn(),
    deleteMindMap: vi.fn(),
    renameMindMap: vi.fn(),
    selectMindMap: vi.fn(),
  }),
}));

vi.mock('../../src/hooks/useConnectionMonitor', () => ({
  useConnectionMonitor: () => ({
    isConnected: true,
    lastError: null,
  }),
}));

// Import App after all mocks
import App from '../../src/App';
import { logger } from '../../src/utils/logger';

describe('Workspace Root Change Integration', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    vi.clearAllMocks();
    user = userEvent.setup();
    sseSubscribers = new Map();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should reload both threads and mindmaps when workspace root changes via button click', async () => {
    const { unmount } = render(<App />);

    // Wait for workspace view to be rendered
    await waitFor(() => {
      const workspaceView = screen.getByTestId('workspace-view');
      expect(workspaceView).toBeDefined();
    });

    // Clear any initial calls during setup
    mockLoadThreads.mockClear();
    mockLoadMindMaps.mockClear();

    // Click the "Set Workspace Root" button
    const setRootButton = screen.getByTestId('set-root-button');
    await user.click(setRootButton);

    // Verify both functions were called
    await waitFor(() => {
      expect(mockLoadThreads).toHaveBeenCalledTimes(1);
      expect(mockLoadMindMaps).toHaveBeenCalledTimes(1);
    });

    // Verify error handling
    expect(logger.error).not.toHaveBeenCalled();

    unmount();
  });

  it('should reload both threads and mindmaps when workspace root changes via SSE event', async () => {
    const { unmount } = render(<App />);

    // Wait for SSE subscription to be set up
    await waitFor(() => {
      expect(sseSubscribers.has(SSEEventType.WORKSPACE_ROOT_CHANGED)).toBe(
        true
      );
    });

    // Clear any initial calls
    mockLoadThreads.mockClear();
    mockLoadMindMaps.mockClear();

    // Trigger SSE event for workspace root change
    const callbacks =
      sseSubscribers.get(SSEEventType.WORKSPACE_ROOT_CHANGED) || [];
    callbacks.forEach(cb =>
      cb({
        type: SSEEventType.WORKSPACE_ROOT_CHANGED,
        data: { workspaceRoot: '/new/workspace/root' },
      })
    );

    // Verify both loadThreads and loadMindMaps were called
    await waitFor(() => {
      expect(mockLoadThreads).toHaveBeenCalledTimes(1);
      expect(mockLoadMindMaps).toHaveBeenCalledTimes(1);
    });

    unmount();
  });

  it('should update UI with new data after workspace root change', async () => {
    // Test that the workspace root change propagates through the app
    const { unmount } = render(<App />);

    await waitFor(() => {
      const workspaceView = screen.getByTestId('workspace-view');
      expect(workspaceView).toBeDefined();
    });

    // Clear initial calls
    mockLoadThreads.mockClear();
    mockLoadMindMaps.mockClear();

    // Simulate data being loaded
    mockLoadThreads.mockResolvedValueOnce(undefined);
    mockLoadMindMaps.mockResolvedValueOnce(undefined);

    const button = screen.getByTestId('set-root-button');
    await user.click(button);

    // Verify the functions completed successfully
    await waitFor(() => {
      expect(mockLoadThreads).toHaveBeenCalledTimes(1);
      expect(mockLoadMindMaps).toHaveBeenCalledTimes(1);
    });

    unmount();
  });

  it('should handle errors gracefully when loading fails after workspace change', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { unmount } = render(<App />);

    await waitFor(() => {
      const workspaceView = screen.getByTestId('workspace-view');
      expect(workspaceView).toBeDefined();
    });

    // Set up mocks to reject
    mockLoadThreads.mockRejectedValueOnce(new Error('Failed to load threads'));
    mockLoadMindMaps.mockRejectedValueOnce(
      new Error('Failed to load mindmaps')
    );

    // Click the button
    const button = screen.getByTestId('set-root-button');
    await user.click(button);

    // Wait for error handling
    await waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to load threads:',
        expect.any(Error)
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to load mindmaps:',
        expect.any(Error)
      );
    });

    consoleErrorSpy.mockRestore();
    unmount();
  });
});
