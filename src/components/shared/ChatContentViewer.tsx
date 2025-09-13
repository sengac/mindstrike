import { forwardRef, useState, useEffect, useRef, useImperativeHandle } from 'react';
import { MessageSquare, ExternalLink, Unlink, X, StickyNote, BookOpen, Sparkles, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { Thread, ConversationMessage, NotesAttachment } from '../../types';
import { ChatPanel, ChatPanelRef } from '../ChatPanel';
import { MarkdownEditor } from './MarkdownEditor';
import { ThreadList } from './ThreadList';
import { SourcesList } from './SourcesList';

export interface Source {
  id: string;
  name: string;
  directory: string;
  type: 'file' | 'url' | 'document' | 'reference';
}

interface ChatContentViewerProps {
  thread?: Thread;
  threads?: Thread[];
  nodeLabel: string;
  nodeNotes?: string | null;
  nodeSources?: Source[];
  focusNotes?: boolean;
  focusSources?: boolean;
  onNavigateToChat?: (threadId?: string) => void;
  onUnassignThread?: () => void;
  onClose?: () => void;
  onDeleteMessage?: (messageId: string) => void;
  onMessagesUpdate?: (messages: ConversationMessage[]) => void;
  onFirstMessage?: () => void;
  onRoleUpdate?: (threadId: string, customRole?: string) => void;
  onNotesUpdate?: (notes: string) => Promise<void>;
  onSourcesUpdate?: (sources: Source[]) => Promise<void>;
  onThreadSelect?: (threadId: string) => void;
  onThreadCreate?: () => void;
  onThreadRename?: (threadId: string, newName: string) => void;
  onThreadDelete?: (threadId: string) => void;
  onCopyNotesToChat?: (notes: NotesAttachment) => void;
}

export const ChatContentViewer = forwardRef<ChatPanelRef, ChatContentViewerProps>(({
  thread,
  threads,
  nodeLabel,
  nodeNotes,
  nodeSources,
  focusNotes,
  focusSources,
  onNavigateToChat,
  onUnassignThread,
  onClose,
  onDeleteMessage,
  onMessagesUpdate,
  onFirstMessage,
  onRoleUpdate,
  onNotesUpdate,
  onSourcesUpdate,
  onThreadSelect,
  onThreadCreate,
  onThreadRename,
  onThreadDelete,
  onCopyNotesToChat
}, ref) => {
  const [activeTab, setActiveTab] = useState<'chat' | 'notes' | 'sources' | 'refactor'>(
    focusNotes ? 'notes' : focusSources ? 'sources' : 'chat'
  );
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const [pendingContent, setPendingContent] = useState('');
  const [notesActiveMode, setNotesActiveMode] = useState<'preview' | 'edit'>();
  const [pendingNotesAttachment, setPendingNotesAttachment] = useState<NotesAttachment | null>(null);
  const chatPanelRef = useRef<ChatPanelRef>(null);

  // Forward ref methods to parent
  useImperativeHandle(ref, () => ({
    clearConversation: () => {
      if (chatPanelRef.current) {
        chatPanelRef.current.clearConversation();
      }
    },
    addNotesAttachment: (notes: NotesAttachment) => {
      if (chatPanelRef.current) {
        chatPanelRef.current.addNotesAttachment(notes);
      } else {
        // Store for later if ChatPanel not available yet
        setPendingNotesAttachment(notes);
      }
    }
  }));

  // Update active tab when focusNotes or focusSources prop changes
  useEffect(() => {
    if (focusNotes) {
      setActiveTab('notes');
    } else if (focusSources) {
      setActiveTab('sources');
    }
  }, [focusNotes, focusSources]);

  // Add pending notes attachment when ChatPanel becomes available
  useEffect(() => {
    if (pendingNotesAttachment && chatPanelRef.current) {
      chatPanelRef.current.addNotesAttachment(pendingNotesAttachment);
      setPendingNotesAttachment(null);
    }
  }, [pendingNotesAttachment, activeTab, thread]);

  const handleSaveNotes = async (value: string) => {
    if (onNotesUpdate) {
      await onNotesUpdate(value);
    }
  };

  const handleCopyToNotes = (content: string) => {
    // Check if notes already have content
    if (nodeNotes && nodeNotes.trim()) {
      // Show confirmation dialog
      setPendingContent(content);
      setShowOverwriteConfirm(true);
    } else {
      // Directly copy to notes if empty
      if (onNotesUpdate) {
        onNotesUpdate(content);
        // Switch to notes tab and preview mode to show the content
        setActiveTab('notes');
        setNotesActiveMode('preview');
        toast.success('Content copied to notes');
      }
    }
  };

  const handleConfirmOverwrite = () => {
    if (onNotesUpdate && pendingContent) {
      onNotesUpdate(pendingContent);
      // Switch to notes tab and preview mode to show the content
      setActiveTab('notes');
      setNotesActiveMode('preview');
      toast.success('Notes replaced with copied content');
    }
    setShowOverwriteConfirm(false);
    setPendingContent('');
  };

  const handleAppendToNotes = () => {
    if (onNotesUpdate && pendingContent) {
      const currentNotes = nodeNotes || '';
      const separator = currentNotes.trim() ? '\n\n---\n\n' : '';
      const newContent = currentNotes + separator + pendingContent;
      onNotesUpdate(newContent);
      // Switch to notes tab and preview mode to show the content
      setActiveTab('notes');
      setNotesActiveMode('preview');
      toast.success('Content appended to notes');
    }
    setShowOverwriteConfirm(false);
    setPendingContent('');
  };

  const handleCancelOverwrite = () => {
    setShowOverwriteConfirm(false);
    setPendingContent('');
  };

  const handleCopyNotesToChat = () => {
    if (!nodeNotes || !nodeNotes.trim()) {
      toast.error('No notes content to copy');
      return;
    }

    const notesAttachment: NotesAttachment = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      title: `Notes from ${nodeLabel}`,
      content: nodeNotes,
      nodeLabel,
      attachedAt: new Date()
    };

    // Store the notes attachment to be added when ChatPanel is available
    setPendingNotesAttachment(notesAttachment);
    setActiveTab('chat');
    toast.success('Notes copied to chat as attachment');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Confirmation Dialog Overlay */}
      {showOverwriteConfirm && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-gray-600 rounded-lg p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold text-white mb-3">Add to Notes</h3>
            <p className="text-gray-300 mb-4">
              The notes section already contains content. How would you like to add this message?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={handleCancelOverwrite}
                className="px-4 py-2 text-sm bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAppendToNotes}
                className="px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
              >
                Append to Notes
              </button>
              <button
                onClick={handleConfirmOverwrite}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              >
                Replace Notes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header with Tabs */}
      <div className="flex-shrink-0 border-b border-gray-700">
        <div className="flex items-center justify-between" data-testid="chat-content-viewer-header">
          {/* Tab Navigation */}
          <div className="px-6">
            <nav className="flex space-x-8">
              <button
                onClick={() => setActiveTab('chat')}
                className={`flex items-center gap-2 py-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'chat'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
                }`}
              >
                <MessageSquare size={16} className={activeTab === 'chat' ? 'text-blue-400' : ''} />
                <span>Chat</span>
              </button>
              <button
                onClick={() => setActiveTab('notes')}
                className={`flex items-center gap-2 py-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'notes'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
                }`}
              >
                <StickyNote size={16} className={activeTab === 'notes' ? 'text-blue-400' : ''} />
                <span>Notes</span>
              </button>
              <button
                onClick={() => setActiveTab('sources')}
                className={`flex items-center gap-2 py-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'sources'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
                }`}
              >
                <BookOpen size={16} className={activeTab === 'sources' ? 'text-blue-400' : ''} />
                <span>Sources</span>
              </button>
              <button
                onClick={() => setActiveTab('refactor')}
                data-testid="generative-refactor-tab-button"
                className={`flex items-center gap-2 py-4 px-2 border-b-2 font-medium text-sm transition-all duration-300 relative overflow-hidden ${
                  activeTab === 'refactor'
                    ? 'border-transparent text-blue-400 animate-shimmer-inset bg-gradient-to-r from-purple-500/20 via-blue-500/20 to-cyan-500/20 animate-shine'
                    : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
                }`}
                style={{
                  backgroundImage: activeTab === 'refactor' 
                    ? 'linear-gradient(45deg, rgba(168, 85, 247, 0.1), rgba(59, 130, 246, 0.1), rgba(6, 182, 212, 0.1)), linear-gradient(135deg, transparent 25%, rgba(255, 255, 255, 0.1) 50%, transparent 75%)'
                    : undefined,
                  backgroundSize: activeTab === 'refactor' ? '200% 200%, 200% 200%' : undefined,
                  animation: activeTab === 'refactor' 
                    ? 'shimmer-inset 2s linear infinite, shine 2s ease-in-out infinite'
                    : undefined
                }}
              >
                <Sparkles size={16} className={activeTab === 'refactor' ? 'text-purple-400' : ''} />
                <span>Generative Refactor</span>
              </button>
            </nav>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1 pl-6 pr-3">
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white"
                title="Close"
              >
                <X size={20} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 relative">
        {/* Floating Action Buttons - Only show when chat tab is active and thread exists */}
        {activeTab === 'chat' && thread && (
          <div className="absolute top-4 right-4 z-10 flex gap-2 bg-black/20 p-3 rounded-lg backdrop-blur-sm">
            {onUnassignThread && (
              <button
                onClick={onUnassignThread}
                className="bg-transparent hover:bg-red-700 text-white p-3 rounded-full shadow-lg transition-colors border border-white"
                title="Unassign thread from this node"
              >
                <Unlink size={20} />
              </button>
            )}
            {onNavigateToChat && (
              <button
                onClick={() => onNavigateToChat(thread?.id)}
                className="bg-transparent hover:bg-blue-700 text-white p-3 rounded-full shadow-lg transition-colors border border-white"
                title="Open in chat view"
              >
                <ExternalLink size={20} />
              </button>
            )}
          </div>
        )}
        
        {activeTab === 'chat' ? (
          thread ? (
            <ChatPanel
              ref={chatPanelRef}
              threadId={thread.id}
              messages={thread.messages}
              onMessagesUpdate={(messages) => {
                if (onMessagesUpdate) {
                  onMessagesUpdate(messages);
                }
              }}
              onFirstMessage={onFirstMessage}
              onDeleteMessage={(messageId) => {
                if (onDeleteMessage) {
                  onDeleteMessage(messageId);
                }
              }}
              activeThread={thread}
              onRoleUpdate={onRoleUpdate}
              onCopyToNotes={handleCopyToNotes}
            />
          ) : (
            <ThreadList
              threads={threads || []}
              onThreadSelect={onThreadSelect || (() => {})}
              onThreadCreate={onThreadCreate}
              onThreadRename={onThreadRename}
              onThreadDelete={onThreadDelete}
              emptyStateTitle="No chat threads yet"
              emptyStateSubtitle="Create a new conversation to get started"
              createButtonTitle="New Chat"
            />
          )
        ) : activeTab === 'notes' ? (
          <div className="flex flex-col h-full">
            <MarkdownEditor
              value={nodeNotes || ''}
              onChange={() => {}} // MarkdownEditor handles its own state
              placeholder="Add notes and context for this node using markdown..."
              showTabs={true}
              defaultMode={nodeNotes && nodeNotes.trim() ? "preview" : "edit"}
              activeMode={notesActiveMode}
              onSave={handleSaveNotes}
              className="flex-1"
              additionalButtons={
                <button
                  onClick={handleCopyNotesToChat}
                  disabled={!nodeNotes || !nodeNotes.trim()}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded text-sm font-medium transition-colors"
                  title="Copy notes to chat as attachment"
                >
                  <Copy size={14} />
                  <span>Copy To Chat</span>
                </button>
              }
            />
          </div>
        ) : activeTab === 'sources' ? (
          <SourcesList
            sources={nodeSources || []}
            onSourcesUpdate={onSourcesUpdate}
          />
        ) : (
          <div className="flex flex-col h-full p-4">
            <h3 className="text-lg font-medium text-white mb-4">Refactor MindMap</h3>
            <div className="text-gray-400 text-center">
              MindMap refactoring functionality coming soon!
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

ChatContentViewer.displayName = 'ChatContentViewer';
