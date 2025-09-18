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
import { HeaderStats } from './components/HeaderStats';
import { LocalModelLoadDialog } from './components/LocalModelLoadDialog';
import { ApplicationLogsDialog } from './components/ApplicationLogsDialog';
import { useThreadsRefactored } from './chat/hooks/useThreadsRefactored';
import { useChatMessagesStore } from './store/useChatMessagesStore';
import { sseEventBus } from './utils/sseEventBus';
import { useMCPLogsStore } from './store/useMCPLogsStore';

import { useMindMaps } from './mindmaps/hooks/useMindMaps';
import { useAppStore } from './store/useAppStore';

import { Source } from './types/mindMap';
import { Menu, X, MessageSquare, Network, Cpu, FileText } from 'lucide-react';
import { AppBar } from './components/AppBar';
import { Toaster } from 'react-hot-toast';
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
  const { isConnected } = useConnectionMonitor();

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

  const { sidebarOpen, setSidebarOpen, activePanel, setActivePanel } =
    useAppStore();
  const chatPanelRef = useRef<ChatPanelRef>(null);
  const currentMessages = useChatMessagesStore(state => state.messages);

  // LLM config is now managed server-side through ModelSelector

  // Initialize workspace once globally
  useEffect(() => {
    const initializeApp = async () => {
      try {
        const { initializeWorkspace } = await import(
          './utils/workspace-initializer'
        );
        await initializeWorkspace();

        // Initialize single SSE event bus for all real-time updates
        sseEventBus.initialize();

        // Fetch any existing MCP logs
        useMCPLogsStore.getState().fetchLogs();
      } catch (error) {
        console.error('Failed to initialize workspace:', error);
      }
      setWorkspaceRestored(true);
    };
    initializeApp();
  }, []); // No dependencies - runs once on mount

  const {
    threads,
    activeThreadId,

    isLoaded,
    loadThreads,
    createThread,
    deleteThread,
    renameThread,
    updateThreadRole,
    selectThread,
  } = useThreadsRefactored();

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
        <Sidebar activePanel={activePanel} onPanelChange={setActivePanel} />
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
                activeThreadId={activeThreadId || undefined}
                onThreadSelect={selectThread}
                onThreadCreate={handleNewThread}
                onThreadRename={renameThread}
                onThreadDelete={deleteThread}
              />
              <ChatPanel
                ref={chatPanelRef}
                threadId={activeThreadId || undefined}
                onDeleteMessage={handleDeleteMessage}
                onRoleUpdate={updateThreadRole}
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
                onRoleUpdate={updateThreadRole}
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
        position="bottom-center"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#374151',
            color: '#fff',
            border: '1px solid #4b5563',
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
    </div>
  );
}

export default App;
