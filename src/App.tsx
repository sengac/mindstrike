import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatPanel } from './components/ChatPanel';
import { ThreadsPanel } from './components/ThreadsPanel';
import { FileExplorer } from './components/FileExplorer';
import { AgentsPanel } from './components/AgentsPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { useThreads } from './hooks/useThreads';
import { usePreferences } from './hooks/usePreferences';
import { useWorkspace } from './hooks/useWorkspace';
import { Menu, X, MessageSquare, Minus, Plus, Trash2 } from 'lucide-react';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activePanel, setActivePanel] = useState<'chat' | 'files' | 'agents' | 'settings'>('chat');
  const [workspaceRestored, setWorkspaceRestored] = useState(false);
  
  const { currentDirectory: savedDirectory, fontSize, setFontSize } = usePreferences();
  const { setWorkspaceRoot, changeDirectory } = useWorkspace();
  
  // Restore workspace before loading threads
  useEffect(() => {
    const restoreWorkspace = async () => {
      if (savedDirectory) {
        try {
          await setWorkspaceRoot(savedDirectory);
          await changeDirectory(savedDirectory);
        } catch (error) {
          console.error('Failed to restore workspace:', error);
        }
      }
      setWorkspaceRestored(true);
    };
    restoreWorkspace();
  }, [savedDirectory, setWorkspaceRoot, changeDirectory]);
  
  const {
    threads,
    activeThreadId,
    activeThread,
    isLoaded,
    loadThreads,
    createThread,
    deleteThread,
    renameThread,
    selectThread,
    updateThreadMessages,
    deleteMessage
  } = useThreads(workspaceRestored); // Pass flag to delay loading

  // Create a default thread if none exist (only after data is loaded)
  useEffect(() => {
    if (isLoaded && threads.length === 0 && activePanel === 'chat') {
      createThread();
    }
  }, [isLoaded, threads.length, activePanel, createThread]);

  const handleNewThread = async () => {
    await createThread();
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

  const increaseFontSize = () => {
    setFontSize(Math.min(fontSize + 2, 24));
  };

  const decreaseFontSize = () => {
    setFontSize(Math.max(fontSize - 2, 10));
  };

  const clearConversation = () => {
    // This will be handled by the ChatPanel's clearConversation function
    // For now, we'll just create a new thread
    handleNewThread();
  };

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
            <div className="flex-shrink-0 p-6 border-b border-gray-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <MessageSquare size={24} className="text-blue-400" />
                  <h1 className="text-xl font-semibold text-white">Chat</h1>
                </div>
              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-1 bg-gray-800 rounded-lg p-1">
                  <button
                    onClick={decreaseFontSize}
                    className="p-1 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-gray-200"
                    title="Decrease font size"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="text-xs text-gray-400 px-2">{fontSize}px</span>
                  <button
                    onClick={increaseFontSize}
                    className="p-1 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-gray-200"
                    title="Increase font size"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <button
                  onClick={clearConversation}
                  className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-gray-200"
                  title="Clear conversation"
                >
                  <Trash2 size={16} />
                </button>
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
                threadId={activeThreadId || undefined}
                messages={activeThread?.messages || []}
                onMessagesUpdate={handleMessagesUpdate}
                onFirstMessage={handleFirstMessage}
                onDeleteMessage={handleDeleteMessage}
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
    </div>
  );
}

export default App;
