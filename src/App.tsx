import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatPanel } from './components/ChatPanel';
import { ThreadsPanel } from './components/ThreadsPanel';
import { FileExplorer } from './components/FileExplorer';
import { useThreads } from './hooks/useThreads';
import { Menu, X } from 'lucide-react';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activePanel, setActivePanel] = useState<'chat' | 'files'>('chat');
  
  const {
    threads,
    activeThreadId,
    activeThread,
    isLoaded,
    createThread,
    deleteThread,
    renameThread,
    selectThread,
    updateThreadMessages,
    deleteMessage
  } = useThreads();

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

      {/* Threads Panel (only show when chat is active) */}
      {activePanel === 'chat' && (
        <ThreadsPanel
          threads={threads}
          activeThreadId={activeThreadId || undefined}
          onThreadSelect={selectThread}
          onThreadCreate={handleNewThread}
          onThreadRename={renameThread}
          onThreadDelete={deleteThread}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {activePanel === 'chat' && (
          <ChatPanel
            threadId={activeThreadId || undefined}
            messages={activeThread?.messages || []}
            onMessagesUpdate={handleMessagesUpdate}
            onFirstMessage={handleFirstMessage}
            onDeleteMessage={handleDeleteMessage}
          />
        )}
        {activePanel === 'files' && <FileExplorer />}
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
