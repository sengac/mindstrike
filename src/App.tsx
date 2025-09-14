import { useState, useEffect, useRef, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatPanel, ChatPanelRef } from './components/ChatPanel';
import { ThreadsPanel } from './components/ThreadsPanel';
import { WorkflowsPanel } from './components/WorkflowsPanel';
import { WorkflowsView } from './components/WorkflowsView';
import { MindMapsPanel } from './components/MindMapsPanel';
import { MindMapsView } from './components/MindMapsView';
import { FileExplorer } from './components/FileExplorer';
import { AgentsPanel } from './components/AgentsPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { ModelSelector } from './components/ModelSelector';
import { HeaderStats } from './components/HeaderStats';
import { LocalModelLoadDialog } from './components/LocalModelLoadDialog';
import { useThreads } from './hooks/useThreads';
import { useWorkflows } from './hooks/useWorkflows';
import { useMindMaps } from './hooks/useMindMaps';
import { useWorkspaceStore } from './hooks/useWorkspaceStore';
import { useAppStore } from './store/useAppStore';


import { ConversationMessage } from './types';
import { Source } from './types/mindMap';
import { Menu, X, MessageSquare, Workflow, Network, Settings, Cpu } from 'lucide-react';
import { Toaster } from 'react-hot-toast';

function App() {
  const [workspaceRestored, setWorkspaceRestored] = useState(false);
  const [showLocalModelDialog, setShowLocalModelDialog] = useState(false);
  const [pendingNodeUpdate, setPendingNodeUpdate] = useState<{
    nodeId: string
    chatId?: string | null
    notes?: string | null
    sources?: Source[]
    timestamp: number
  } | undefined>(undefined);
  
  const { 
    sidebarOpen, 
    setSidebarOpen, 
    activePanel, 
    setActivePanel, 
    workspaceRoot, 

  } = useAppStore();
  const chatPanelRef = useRef<ChatPanelRef>(null);
  
  // LLM config is now managed server-side through ModelSelector
  
  // Initialize workspace once globally
  useEffect(() => {
    const initializeApp = async () => {
      try {
        const { initializeWorkspace } = await import('./utils/workspace-initializer');
        await initializeWorkspace();
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
    activeThread,
    isLoaded,
    loadThreads,
    createThread,
    deleteThread,
    renameThread,
    updateThreadRole,
    selectThread,
    updateThreadMessages,
    deleteMessage
  } = useThreads();

  const {
    workflows,
    activeWorkflowId,
    activeWorkflow,
    isLoaded: workflowsLoaded,
    createWorkflow,
    deleteWorkflow,
    renameWorkflow,
    selectWorkflow
  } = useWorkflows();

  const {
    mindMaps,
    activeMindMapId,
    activeMindMap,
    isLoaded: mindMapsLoaded,
    createMindMap,
    deleteMindMap,
    renameMindMap,
    selectMindMap
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

  const handleNewWorkflow = async () => {
    await createWorkflow();
  };

  const handleNewMindMap = async () => {
    await createMindMap();
  };

  const handleFirstMessage = () => {
    // Title generation now happens automatically in updateThreadMessages
  };

  const handleMessagesUpdate = async (messages: any[]) => {
    if (activeThreadId) {
      await updateThreadMessages(activeThreadId, messages);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (activeThreadId) {
      await deleteMessage(activeThreadId, messageId);
    }
  };

  // Helper functions for node updates using the new props-based approach
  const updateNodeChatId = useCallback((nodeId: string, chatId: string | null) => {
    setPendingNodeUpdate({
      nodeId,
      chatId,
      timestamp: Date.now()
    });
  }, []);

  const updateNodeNotes = useCallback(async (nodeId: string, notes: string | null) => {
    setPendingNodeUpdate({
      nodeId,
      notes,
      timestamp: Date.now()
    });
    
    // Wait for the save to complete
    return new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 1000); // Max 1 second timeout
      
      const checkSave = () => {
        // Check if the update was processed by checking if pendingNodeUpdate is cleared
        if (!pendingNodeUpdate || 
            pendingNodeUpdate.nodeId !== nodeId || 
            pendingNodeUpdate.notes !== notes) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkSave, 50);
        }
      };
      checkSave();
    });
  }, [pendingNodeUpdate]);

  const updateNodeSources = useCallback(async (nodeId: string, sources: Source[]) => {
    setPendingNodeUpdate({
      nodeId,
      sources,
      timestamp: Date.now()
    });
    
    // Wait for the save to complete
    return new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 1000); // Max 1 second timeout
      
      const checkSave = () => {
        // Check if the update was processed by checking if pendingNodeUpdate is cleared
        if (!pendingNodeUpdate || 
            pendingNodeUpdate.nodeId !== nodeId || 
            pendingNodeUpdate.sources !== sources) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkSave, 50);
        }
      };
      checkSave();
    });
  }, [pendingNodeUpdate]);

  // Clear pending node update after a short delay to ensure it's been processed
  useEffect(() => {
    if (pendingNodeUpdate) {
      const timeout = setTimeout(() => {
        setPendingNodeUpdate(undefined);
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [pendingNodeUpdate]);





  // Model selection is now handled internally by ModelSelector

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      {/* Mobile menu button */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-gray-800 rounded-md"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Sidebar */}
      <div className={`${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static fixed inset-y-0 left-0 z-40`}>
        <Sidebar 
          activePanel={activePanel}
          onPanelChange={setActivePanel}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {activePanel === 'chat' && (
          <div className="flex flex-col h-full">
            {/* Chat Header spanning across threads and messages */}
            <div className="flex-shrink-0 px-6 border-b border-gray-700 flex items-center" style={{height: 'var(--header-height)'}}>
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                  <MessageSquare size={24} className="text-blue-400" />
                  <h1 className="text-xl font-semibold text-white">Chat</h1>
                </div>
                <div className="flex items-center space-x-4">
                  <HeaderStats 
                    messages={activeThread?.messages || []}
                  />
                  <div className="flex items-center gap-2">
                    <ModelSelector />
                    <button
                      onClick={() => setShowLocalModelDialog(true)}
                      className="p-2 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-white"
                      title="Manage Local Models"
                    >
                      <Cpu size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
            
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
                messages={activeThread?.messages || []}
                onMessagesUpdate={handleMessagesUpdate}
                onFirstMessage={handleFirstMessage}
                onDeleteMessage={handleDeleteMessage}
                activeThread={activeThread}
                onRoleUpdate={updateThreadRole}
                onNavigateToWorkspaces={() => setActivePanel('files')}
              />
            </div>
          </div>
        )}
        {activePanel === 'workflows' && (
          <div className="flex flex-col h-full">
            {/* Workflows Header */}
            <div className="flex-shrink-0 px-6 border-b border-gray-700 flex items-center" style={{height: 'var(--header-height)'}}>
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                  <Workflow size={24} className="text-blue-400" />
                  <h1 className="text-xl font-semibold text-white">Workflows</h1>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="flex items-center gap-2">
                    <ModelSelector />
                    <button
                      onClick={() => setShowLocalModelDialog(true)}
                      className="p-2 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-white"
                      title="Manage Local Models"
                    >
                      <Cpu size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Workflows content area */}
            <div className="flex flex-1 min-h-0">
              <WorkflowsPanel
                workflows={workflows}
                activeWorkflowId={activeWorkflowId || undefined}
                onWorkflowSelect={selectWorkflow}
                onWorkflowCreate={handleNewWorkflow}
                onWorkflowRename={renameWorkflow}
                onWorkflowDelete={deleteWorkflow}
              />
              <WorkflowsView activeWorkflow={activeWorkflow} />
            </div>
          </div>
        )}
        {activePanel === 'mind-maps' && (
          <div className="flex flex-col h-full">
            {/* MindMaps Header */}
            <div className="flex-shrink-0 px-6 border-b border-gray-700 flex items-center" style={{height: 'var(--header-height)'}}>
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                  <Network size={24} className="text-blue-400" />
                  <h1 className="text-xl font-semibold text-white">MindMaps</h1>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="flex items-center gap-2">
                    <ModelSelector />
                    <button
                      onClick={() => setShowLocalModelDialog(true)}
                      className="p-2 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-white"
                      title="Manage Local Models"
                    >
                      <Cpu size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
            
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
                onDeleteMessage={(threadId: string, messageId: string) => {
                  console.log('Deleting message:', { threadId, messageId });
                  deleteMessage(threadId, messageId);
                }}
                onMessagesUpdate={(threadId: string, messages) => {
                  console.log('Updating messages for thread:', { threadId, messageCount: messages.length });
                  updateThreadMessages(threadId, messages);
                }}
                onFirstMessage={() => {}}
                onRoleUpdate={updateThreadRole}
                onNodeNotesUpdate={updateNodeNotes}
                onNodeSourcesUpdate={updateNodeSources}
              />
              <MindMapsView 
                activeMindMap={activeMindMap}
                pendingNodeUpdate={pendingNodeUpdate}
              />
            </div>
          </div>
        )}
        {activePanel === 'files' && <FileExplorer onDirectoryChange={loadThreads} />}
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
    </div>
  );
}

export default App;
