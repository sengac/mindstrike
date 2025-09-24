import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import App from './App';

// Define proper types for MindMapsView props (simplified after refactoring)
interface MindMapsViewProps {
  mindMaps: unknown[];
  activeMindMapId?: string;
  activeMindMap: unknown;
  threads: unknown[];
  onMindMapSelect: (mindMapId: string) => void;
  onMindMapCreate: () => void;
  onMindMapRename: (mindMapId: string, newName: string) => void;
  onMindMapDelete: (mindMapId: string) => void;
  onThreadCreate: () => void;
  onThreadRename: (threadId: string, newName: string) => void;
  onThreadDelete: (threadId: string) => void;
  onNavigateToChat: (threadId?: string) => void;
  onPromptUpdate: (threadId: string, customPrompt?: string) => void;
  onCustomizePrompts: () => void;
  loadMindMaps: (preserveActiveId?: boolean) => Promise<void>;
}

// Global variable to store the last props passed to MindMapsView
let lastMindMapsViewProps: MindMapsViewProps | undefined;

// Mock all the hooks and components
vi.mock('./components/Sidebar');
vi.mock('./chat/components/ChatView');
vi.mock('./mindmaps/components/MindMapsView');
vi.mock('./workspace/components/WorkspaceView');
vi.mock('./components/AgentsView');
vi.mock('./settings/components/SettingsView');
vi.mock('./components/LocalModelLoadDialog');
vi.mock('./chat/hooks/useThreads');
vi.mock('./store/useThreadsStore');
vi.mock('./store/useAppStore');
vi.mock('./utils/sseEventBus');
vi.mock('./hooks/useConnectionMonitor');
vi.mock('./mindmaps/hooks/useMindMaps');

// Import mocked modules
import * as useThreadsModule from './chat/hooks/useThreads';
import * as useThreadsStoreModule from './store/useThreadsStore';
import * as useAppStoreModule from './store/useAppStore';
import * as useConnectionMonitorModule from './hooks/useConnectionMonitor';
import * as useMindMapsModule from './mindmaps/hooks/useMindMaps';
import { MindMapsView } from './mindmaps/components/MindMapsView';

// Mock implementations
const mockThreads = {
  createThread: vi.fn(),
  threads: [],
  activeThreadId: null,
  activeThread: null,
  selectThread: vi.fn(),
  deleteThread: vi.fn(),
  renameThread: vi.fn(),
  updateThreadPrompt: vi.fn(),
  clearThread: vi.fn(),
  isLoaded: true,
  isLoading: false,
  error: null,
  loadThreads: vi.fn(),
};

const mockMindMaps = {
  mindMaps: [],
  activeMindMapId: null,
  activeMindMap: null,
  isLoaded: true,
  loadMindMaps: vi.fn(),
  createMindMap: vi.fn(),
  deleteMindMap: vi.fn(),
  renameMindMap: vi.fn(),
  selectMindMap: vi.fn(),
};

const mockAppStore = {
  sidebarOpen: true,
  setSidebarOpen: vi.fn(),
  activeView: 'mindmaps' as const,
  setActiveView: vi.fn(),
  showAppLogs: false,
  setShowAppLogs: vi.fn(),
  selectedLogsTab: 'application' as const,
  setSelectedLogsTab: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();

  // Setup default mock implementations
  vi.mocked(useThreadsModule.useThreads).mockReturnValue(mockThreads);
  vi.mocked(useThreadsStoreModule.useThreadsStore).mockReturnValue({
    activeThreadId: null,
    createThread: vi.fn(),
  });
  vi.mocked(useAppStoreModule.useAppStore).mockImplementation(() => {
    return mockAppStore;
  });
  vi.mocked(useConnectionMonitorModule.useConnectionMonitor).mockReturnValue({
    isConnected: true,
  });
  vi.mocked(useMindMapsModule.useMindMaps).mockReturnValue(mockMindMaps);

  // Mock the MindMapsView component to capture the props
  vi.mocked(MindMapsView).mockImplementation((props: unknown) => {
    // Store the props for testing
    lastMindMapsViewProps = props as MindMapsViewProps;
    return null;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('App Component - Rendering', () => {
  it('should render MindMapsView with correct props when activeView is mindmaps', async () => {
    const { unmount } = render(<App />);

    // Verify the component renders without throwing and passes props to MindMapsView
    expect(lastMindMapsViewProps).toBeDefined();
    expect(lastMindMapsViewProps?.mindMaps).toBeDefined();
    expect(lastMindMapsViewProps?.onMindMapSelect).toBeDefined();
    expect(lastMindMapsViewProps?.onMindMapCreate).toBeDefined();
    expect(lastMindMapsViewProps?.onThreadCreate).toBeDefined();
    expect(lastMindMapsViewProps?.loadMindMaps).toBeDefined();

    // Cleanup
    unmount();
  });
});
