import { useState, useEffect, useRef, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatPanel, ChatPanelRef } from './chat/components/ChatPanel';
import { ThreadsPanel } from './chat/components/ThreadsPanel';

import { MindMapsPanel } from './mindmaps/components/MindMapsPanel';
import { MindMapsView } from './mindmaps/components/MindMapsView';
import { FileExplorer } from './workspace/components/FileExplorer';
import { AgentsPanel } from './components/AgentsPanel';
import { SettingsPanel } from './settings/components/SettingsPanel';
import { ModelSelector } from './settings/components/ModelSelector';
import { PromptsModal } from './settings/components/PromptsModal';
import { HeaderStats } from './components/HeaderStats';
import { LocalModelLoadDialog } from './components/LocalModelLoadDialog';
import { ApplicationLogsDialog } from './components/ApplicationLogsDialog';
import { useThreadsRefactored } from './chat/hooks/useThreadsRefactored';
import { useThreadsStore } from './store/useThreadsStore';
import { useChatThreadStore } from './store/useChatThreadStore';
import { sseEventBus } from './utils/sseEventBus';
import { useMCPLogsStore } from './store/useMCPLogsStore';

import { useMindMaps } from './mindmaps/hooks/useMindMaps';
import { useAppStore } from './store/useAppStore';
import { loadFontScheme } from './utils/fontSchemes';

import { Source } from './types/mindMap';
import {
  Menu,
  X,
  MessageSquare,
  Network,
  Cpu,
  FileText,
  Terminal,
  Bot,
} from 'lucide-react';
import { AppBar } from './components/AppBar';
import { Toaster } from 'react-hot-toast';
import { initStormToastEffect } from './utils/stormToastEffect';
import { ConnectionMonitorDialog } from './components/shared/ConnectionMonitorDialog';
import { useConnectionMonitor } from './hooks/useConnectionMonitor';

function App() {
  const [, setWorkspaceRestored] = useState(false);
  const [showLocalModelDialog, setShowLocalModelDialog] = useState(false);
  const [showApplicationLogsDialog, setShowApplicationLogsDialog] =
    useState(false);
  const [debugDialogInitialTab, setDebugDialogInitialTab] = useState<
    'debug' | 'tasks' | 'mcp'
  >('debug');
  const [showConnectionDialog, setShowConnectionDialog] = useState(false);
  const [isMusicPlayerOpen, setIsMusicPlayerOpen] = useState(false);
  const [showPromptsModal, setShowPromptsModal] = useState(false);

  const { isConnected } = useConnectionMonitor();

  // Initialize storm toast effect
  useEffect(() => {
    const cleanup = initStormToastEffect();
    return cleanup;
  }, []);

  // Function to open debug dialog with specific tab
  const openDebugDialog = (tab: 'debug' | 'tasks' | 'mcp' = 'debug') => {
    setDebugDialogInitialTab(tab);
    setShowApplicationLogsDialog(true);
  };

  // Make it available globally
  (
    window as typeof window & { openDebugDialog?: typeof openDebugDialog }
  ).openDebugDialog = openDebugDialog;

  // Manage connection dialog state
  useEffect(() => {
    if (!isConnected && !showConnectionDialog) {
      setShowConnectionDialog(true);
    }
    // Don't auto-close here - let the dialog handle its own close animation
  }, [isConnected, showConnectionDialog]);

  const [pendingNodeUpdate, setPendingNodeUpdate] = useState<
    | {
        nodeId: string;
        chatId?: string | null;
        notes?: string | null;
        sources?: Source[];
        timestamp: number;
      }
    | undefined
  >(undefined);

  const {
    sidebarOpen,
    setSidebarOpen,
    activePanel,
    setActivePanel,
    fontScheme,
    defaultCustomPrompt,
  } = useAppStore();
  const chatPanelRef = useRef<ChatPanelRef>(null);
  const { activeThreadId, toggleAgentMode } = useThreadsStore();
  // Always call the hook with a fallback threadId to avoid conditional hook calls
  const fallbackThreadId = activeThreadId || 'empty';
  const threadStore = useChatThreadStore(fallbackThreadId);
  // Always call the selector to avoid conditional hooks
  const allMessages = threadStore(state => state.messages);
  // Only use messages if we have an active thread, otherwise empty array
  const currentMessages = activeThreadId ? allMessages : [];

  // LLM config is now managed server-side through ModelSelector

  // Load font scheme on startup and when it changes
  useEffect(() => {
    loadFontScheme(fontScheme);
  }, [fontScheme]);

  // Initialize workspace once globally
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const initializeApp = async () => {
      try {
        const { initializeWorkspace } = await import(
          './utils/workspace-initializer'
        );
        await initializeWorkspace();

        // Initialize single SSE event bus for all real-time updates
        sseEventBus.initialize();

        // Initialize system information store
        const { useSystemInformationStore } = await import(
          './store/use-system-information-store'
        );
        await useSystemInformationStore.getState().initialize();

        // Load workspace roots from server
        await useAppStore.getState().loadWorkspaceRoots();

        // Set up SSE listeners for workspace root changes
        const unsubscribeWorkspaceRoot = sseEventBus.subscribe(
          'workspace_root_changed',
          event => {
            const data = event.data as { workspaceRoot: string };
            useAppStore.getState().setWorkspaceRoot(data.workspaceRoot);
            // Also trigger reloads when workspace root changes
            loadThreads();
            loadMindMaps();
          }
        );

        const unsubscribeMusicRoot = sseEventBus.subscribe(
          'music_root_changed',
          event => {
            const data = event.data as { musicRoot: string };
            useAppStore.getState().setMusicRoot(data.musicRoot);
          }
        );

        // Fetch any existing MCP logs
        useMCPLogsStore.getState().fetchLogs();

        // Set cleanup function
        cleanup = () => {
          unsubscribeWorkspaceRoot();
          unsubscribeMusicRoot();
        };
      } catch (error) {
        console.error('Failed to initialize workspace:', error);
      }
      setWorkspaceRestored(true);
    };

    initializeApp();

    return () => {
      if (cleanup) {
        cleanup();
      }
    };
  }, []); // No dependencies - runs once on mount

  const {
    threads,
    activeThreadId: threadsActiveThreadId,

    isLoaded,
    loadThreads,
    createThread,
    deleteThread,
    renameThread,
    updateThreadPrompt,
    selectThread,
  } = useThreadsRefactored();

  // Get active thread from threads array
  const activeThread = threads.find(
    thread => thread.id === threadsActiveThreadId
  );

  const {
    mindMaps,
    activeMindMapId,
    activeMindMap,
    isLoaded: _mindMapsLoaded,
    loadMindMaps,
    createMindMap,
    deleteMindMap,
    renameMindMap,
    selectMindMap,
  } = useMindMaps();

  // Create a default thread if none exist (only after data is loaded)
  useEffect(() => {
    if (isLoaded && threads.length === 0 && activePanel === 'chat') {
      createThread();
    }
  }, [isLoaded, threads.length, activePanel, createThread]);

  const handleNewThread = async () => {
    await createThread();
  };

  const handleNewMindMap = async () => {
    await createMindMap();
  };

  const handleDeleteMessage = async (messageId: string) => {
    try {
      const response = await fetch(`/api/message/${messageId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete message');
      }
    } catch (error) {
      console.error('Error deleting message:', error);
    }
  };

  // Helper functions for node updates using the new props-based approach
  const updateNodeChatId = useCallback(
    (nodeId: string, chatId: string | null) => {
      setPendingNodeUpdate({
        nodeId,
        chatId,
        timestamp: Date.now(),
      });
    },
    []
  );

  const updateNodeNotes = useCallback(
    async (nodeId: string, notes: string | null) => {
      setPendingNodeUpdate({
        nodeId,
        notes,
        timestamp: Date.now(),
      });

      // Wait for the save to complete
      return new Promise<void>(resolve => {
        const timeout = setTimeout(resolve, 1000); // Max 1 second timeout

        const checkSave = () => {
          // Check if the update was processed by checking if pendingNodeUpdate is cleared
          if (
            !pendingNodeUpdate ||
            pendingNodeUpdate.nodeId !== nodeId ||
            pendingNodeUpdate.notes !== notes
          ) {
            clearTimeout(timeout);
            resolve();
          } else {
            setTimeout(checkSave, 50);
          }
        };
        checkSave();
      });
    },
    [pendingNodeUpdate]
  );

  const updateNodeSources = useCallback(
    async (nodeId: string, sources: Source[]) => {
      setPendingNodeUpdate({
        nodeId,
        sources,
        timestamp: Date.now(),
      });

      // Wait for the save to complete
      return new Promise<void>(resolve => {
        const timeout = setTimeout(resolve, 1000); // Max 1 second timeout

        const checkSave = () => {
          // Check if the update was processed by checking if pendingNodeUpdate is cleared
          if (
            !pendingNodeUpdate ||
            pendingNodeUpdate.nodeId !== nodeId ||
            pendingNodeUpdate.sources !== sources
          ) {
            clearTimeout(timeout);
            resolve();
          } else {
            setTimeout(checkSave, 50);
          }
        };
        checkSave();
      });
    },
    [pendingNodeUpdate]
  );

  // Clear pending node update after a short delay to ensure it's been processed
  useEffect(() => {
    if (pendingNodeUpdate) {
      const timeout = setTimeout(() => {
        setPendingNodeUpdate(undefined);
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [pendingNodeUpdate]);

  // Navigation confirmation handler
  useEffect(() => {
    const originalHandler = window.onbeforeunload;

    window.onbeforeunload = event => {
      event.preventDefault();
      return 'Leave MindStrike?';
    };

    return () => {
      window.onbeforeunload = originalHandler;
    };
  }, []);

  return (
    <div className="flex h-screen bg-dark-bg text-dark-text-primary">
      {/* Mobile menu button */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-gray-800 rounded-md"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static fixed inset-y-0 left-0 z-40`}
      >
        <Sidebar
          activePanel={activePanel}
          onPanelChange={setActivePanel}
          isMusicPlayerOpen={isMusicPlayerOpen}
          setIsMusicPlayerOpen={setIsMusicPlayerOpen}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {activePanel === 'chat' && (
          <div className="flex flex-col h-full">
            {/* Chat Header spanning across threads and messages */}
            <AppBar
              icon={MessageSquare}
              title="Chat"
              actions={
                <>
                  <HeaderStats messages={currentMessages} />
                  <div className="flex items-center gap-2">
                    <ModelSelector />
                    <button
                      onClick={() => setShowPromptsModal(true)}
                      className="relative p-2 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-white"
                      title="Customize prompts"
                    >
                      <Terminal size={16} />
                      {activeThread?.customPrompt && (
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"></div>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        if (activeThread) {
                          toggleAgentMode(activeThread.id);
                        }
                      }}
                      className={`relative p-2 rounded transition-all duration-300 ${
                        activeThread?.isAgentActive
                          ? 'bg-blue-900/30 text-blue-300'
                          : 'hover:bg-gray-800 text-gray-400 hover:text-gray-200'
                      }`}
                      title="Agent Mode"
                    >
                      <div
                        className={`transition-all duration-300 ${activeThread?.isAgentActive ? 'scale-110' : 'scale-100'}`}
                      >
                        <Bot
                          size={16}
                          className={`transition-all duration-300 ${
                            activeThread?.isAgentActive
                              ? 'text-blue-300 animate-pulse'
                              : 'text-gray-400'
                          }`}
                        />
                      </div>
                      {activeThread?.isAgentActive && (
                        <div className="absolute inset-0 rounded bg-blue-400/20 animate-ping"></div>
                      )}
                    </button>
                    <button
                      onClick={() => setShowLocalModelDialog(true)}
                      className="p-2 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-white"
                      title="Manage Local Models"
                    >
                      <Cpu size={16} />
                    </button>
                    <button
                      onClick={() => setShowApplicationLogsDialog(true)}
                      className="p-2 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-white"
                      title="Application Logs"
                    >
                      <FileText size={16} />
                    </button>
                  </div>
                </>
              }
            />

            {/* Chat content area */}
            <div className="flex flex-1 min-h-0">
              <ThreadsPanel
                threads={threads}
                activeThreadId={threadsActiveThreadId || undefined}
                onThreadSelect={selectThread}
                onThreadCreate={handleNewThread}
                onThreadRename={renameThread}
                onThreadDelete={deleteThread}
              />
              <ChatPanel
                ref={chatPanelRef}
                threadId={threadsActiveThreadId || undefined}
                onDeleteMessage={handleDeleteMessage}
                onPromptUpdate={updateThreadPrompt}
                onNavigateToWorkspaces={() => setActivePanel('files')}
              />
            </div>
          </div>
        )}

        {activePanel === 'mind-maps' && (
          <div className="flex flex-col h-full">
            {/* MindMaps Header */}
            <AppBar
              icon={Network}
              title="MindMaps"
              actions={
                <>
                  <div className="flex items-center gap-2">
                    <ModelSelector />
                    <button
                      onClick={() => setShowLocalModelDialog(true)}
                      className="p-2 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-white"
                      title="Manage Local Models"
                    >
                      <Cpu size={16} />
                    </button>
                    <button
                      onClick={() => setShowApplicationLogsDialog(true)}
                      className="p-2 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-white"
                      title="Application Logs"
                    >
                      <FileText size={16} />
                    </button>
                  </div>
                </>
              }
            />

            {/* MindMaps content area */}
            <div className="flex flex-1 min-h-0">
              <MindMapsPanel
                mindMaps={mindMaps}
                activeMindMapId={activeMindMapId || undefined}
                onMindMapSelect={selectMindMap}
                onMindMapCreate={handleNewMindMap}
                onMindMapRename={renameMindMap}
                onMindMapDelete={deleteMindMap}
                threads={threads}
                onThreadAssociate={(nodeId: string, threadId: string) => {
                  updateNodeChatId(nodeId, threadId);
                }}
                onThreadUnassign={(nodeId: string) => {
                  updateNodeChatId(nodeId, null);
                }}
                onThreadCreate={handleNewThread}
                onThreadRename={renameThread}
                onThreadDelete={deleteThread}
                onNavigateToChat={(threadId?: string) => {
                  if (threadId) {
                    selectThread(threadId);
                  }
                  setActivePanel('chat');
                }}
                onDeleteMessage={(_threadId: string, _messageId: string) => {
                  // TODO: Implement delete message functionality
                }}
                onMessagesUpdate={(_threadId: string, _messages) => {
                  // TODO: Implement update messages functionality
                }}
                onFirstMessage={() => {}}
                onPromptUpdate={updateThreadPrompt}
                onNodeNotesUpdate={updateNodeNotes}
                onNodeSourcesUpdate={updateNodeSources}
              />
              <MindMapsView
                activeMindMap={activeMindMap}
                loadMindMaps={loadMindMaps}
                pendingNodeUpdate={pendingNodeUpdate}
              />
            </div>
          </div>
        )}
        {activePanel === 'files' && (
          <FileExplorer onDirectoryChange={loadThreads} />
        )}
        {activePanel === 'agents' && <AgentsPanel />}
        {activePanel === 'settings' && <SettingsPanel />}
      </div>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 4000,
          className: 'storm-toast',
          style: {
            background:
              'linear-gradient(135deg, rgba(75, 85, 99, 0.1) 0%, rgba(75, 85, 99, 0.25) 25%, rgba(75, 85, 99, 0.25) 75%, rgba(75, 85, 99, 0.1) 100%)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(75, 85, 99, 0.4)',
            borderRadius: '2px',
            color: '#ffffff',
            padding: '16px',
            fontSize: '14px',
            fontWeight: '500',
          },
        }}
      />

      {/* Local Model Management Dialog */}
      {showLocalModelDialog && (
        <LocalModelLoadDialog
          isOpen={showLocalModelDialog}
          onClose={() => setShowLocalModelDialog(false)}
          targetModelId={undefined} // No auto-loading when opened manually
          onModelLoaded={() => {
            setShowLocalModelDialog(false);
          }}
        />
      )}

      {/* Application Logs Dialog */}
      {showApplicationLogsDialog && (
        <ApplicationLogsDialog
          isOpen={showApplicationLogsDialog}
          onClose={() => setShowApplicationLogsDialog(false)}
          initialTab={debugDialogInitialTab}
        />
      )}

      {/* Connection Monitor Dialog */}
      <ConnectionMonitorDialog
        isOpen={showConnectionDialog}
        onClose={() => setShowConnectionDialog(false)}
        isConnected={isConnected}
      />

      {/* Prompts Modal */}
      {showPromptsModal && (
        <PromptsModal
          isOpen={showPromptsModal}
          onClose={() => setShowPromptsModal(false)}
          currentPrompt={
            activeThread?.customPrompt ||
            defaultCustomPrompt ||
            'You are a helpful AI assistant.'
          }
          defaultPrompt="You are a helpful AI assistant."
          onPromptChange={async (customPrompt?: string) => {
            const currentThreadId = threadsActiveThreadId || 'default';
            await updateThreadPrompt(currentThreadId, customPrompt);
          }}
        />
      )}
    </div>
  );
}

export default App;
