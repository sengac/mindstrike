import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Mock all the external dependencies first
vi.mock('monaco-editor', () => ({
  editor: {
    create: vi.fn(),
    defineTheme: vi.fn(),
    setTheme: vi.fn(),
  },
}));

vi.mock('../../src/utils/sseEventBus', () => ({
  sseEventBus: {
    initialize: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
  },
}));

vi.mock('../../src/utils/workspaceInitializer', () => ({
  initializeWorkspace: vi.fn().mockResolvedValue(undefined),
}));

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

vi.mock('../../src/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../src/components/Sidebar', () => ({
  Sidebar: () => null,
}));

vi.mock('../../src/chat/components/ChatView', () => ({
  ChatView: () => null,
}));

vi.mock('../../src/mindmaps/components/MindMapsView', () => ({
  MindMapsView: () => null,
}));

vi.mock('../../src/components/AgentsView', () => ({
  AgentsView: () => null,
}));

vi.mock('../../src/settings/components/SettingsView', () => ({
  SettingsView: () => null,
}));

vi.mock('../../src/settings/components/PromptsModal', () => ({
  PromptsModal: () => null,
}));

vi.mock('../../src/components/LocalModelLoadDialog', () => ({
  LocalModelLoadDialog: () => null,
}));

vi.mock('../../src/components/ApplicationLogsView', () => ({
  ApplicationLogsView: () => null,
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

// Create mocks for hooks
const mockLoadThreads = vi.fn().mockResolvedValue(undefined);
const mockLoadMindMaps = vi.fn().mockResolvedValue(undefined);
const mockOnDirectoryChange = vi.fn();

vi.mock('../../src/workspace/components/WorkspaceView', () => ({
  WorkspaceView: vi.fn(props => {
    // Call the callback immediately for testing
    mockOnDirectoryChange.mockImplementation(props.onDirectoryChange);
    return React.createElement(
      'div',
      { 'data-testid': 'workspace-view' },
      React.createElement(
        'button',
        {
          'data-testid': 'set-workspace-root',
          onClick: () => props.onDirectoryChange?.(),
        },
        'Set Workspace Root'
      )
    );
  }),
}));

vi.mock('../../src/chat/hooks/useThreads', () => ({
  useThreads: () => ({
    threads: [],
    activeThreadId: null,
    activeThread: null,
    isLoaded: true,
    isLoading: false,
    error: null,
    loadThreads: mockLoadThreads,
    createThread: vi.fn(),
    deleteThread: vi.fn(),
    renameThread: vi.fn(),
    updateThreadPrompt: vi.fn(),
    selectThread: vi.fn(),
    clearThread: vi.fn(),
  }),
}));

vi.mock('../../src/mindmaps/hooks/useMindMaps', () => ({
  useMindMaps: () => ({
    mindMaps: [],
    activeMindMapId: null,
    activeMindMap: null,
    isLoaded: true,
    loadMindMaps: mockLoadMindMaps,
    createMindMap: vi.fn(),
    deleteMindMap: vi.fn(),
    renameMindMap: vi.fn(),
    selectMindMap: vi.fn(),
  }),
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

vi.mock('../../src/hooks/useConnectionMonitor', () => ({
  useConnectionMonitor: () => ({
    isConnected: true,
    lastError: null,
  }),
}));

vi.mock('../../src/store/useThreadsStore', () => ({
  useThreadsStore: () => ({
    toggleAgentMode: vi.fn(),
  }),
}));

// Now import App after all mocks are set up
import App from '../../src/App';

describe('Workspace Root Change - Clean Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call both loadThreads and loadMindMaps when workspace root changes', async () => {
    const user = userEvent.setup();

    render(<App />);

    // Wait for the workspace view to be rendered
    await waitFor(() => {
      const workspaceView = screen.getByTestId('workspace-view');
      expect(workspaceView).toBeDefined();
    });

    // Verify the callback was passed to WorkspaceView
    expect(mockOnDirectoryChange).toBeDefined();

    // Clear any initial calls
    mockLoadThreads.mockClear();
    mockLoadMindMaps.mockClear();

    // Click the button which triggers onDirectoryChange
    const button = screen.getByTestId('set-workspace-root');
    await user.click(button);

    // Verify both functions were called
    await waitFor(() => {
      expect(mockLoadThreads).toHaveBeenCalledTimes(1);
      expect(mockLoadMindMaps).toHaveBeenCalledTimes(1);
    });
  });

  it('should handle errors when loading fails', async () => {
    const error = new Error('Test error');
    mockLoadThreads.mockRejectedValueOnce(error);
    mockLoadMindMaps.mockRejectedValueOnce(error);

    const user = userEvent.setup();

    render(<App />);

    await waitFor(() => {
      const workspaceView = screen.getByTestId('workspace-view');
      expect(workspaceView).toBeDefined();
    });

    // Clear any initial calls
    mockLoadThreads.mockClear();
    mockLoadMindMaps.mockClear();

    // Click the button
    const button = screen.getByTestId('set-workspace-root');
    await user.click(button);

    // Verify both functions were still called despite errors
    await waitFor(() => {
      expect(mockLoadThreads).toHaveBeenCalledTimes(1);
      expect(mockLoadMindMaps).toHaveBeenCalledTimes(1);
    });
  });
});
