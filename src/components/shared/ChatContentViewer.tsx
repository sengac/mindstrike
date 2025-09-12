import { forwardRef, useState, useEffect } from 'react';
import { MessageSquare, ExternalLink, Unlink, X, StickyNote, BookOpen, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { Thread, ConversationMessage } from '../../types';
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
  onNavigateToChat?: () => void;
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
  onThreadDelete
}, ref) => {
  const [activeTab, setActiveTab] = useState<'chat' | 'notes' | 'sources' | 'refactor'>(
    focusNotes ? 'notes' : focusSources ? 'sources' : 'chat'
  );
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const [pendingContent, setPendingContent] = useState('');
  const [notesActiveMode, setNotesActiveMode] = useState<'preview' | 'edit'>();

  // Update active tab when focusNotes or focusSources prop changes
  useEffect(() => {
    if (focusNotes) {
      setActiveTab('notes');
    } else if (focusSources) {
      setActiveTab('sources');
    }
  }, [focusNotes, focusSources]);

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
      <div className="flex-shrink-0 border-b border-gray-600">
        <div className="flex items-center justify-between p-3" data-testid="chat-content-viewer-header">
          {/* Tab Navigation */}
          <div className="flex items-center">
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex items-center gap-2 px-3 py-1 rounded-t text-sm font-medium transition-colors ${
                activeTab === 'chat'
                  ? 'text-white bg-gray-700'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <MessageSquare size={16} className="text-blue-400" />
              <span>Chat</span>
            </button>
            <button
              onClick={() => setActiveTab('notes')}
              className={`flex items-center gap-2 px-3 py-1 rounded-t text-sm font-medium transition-colors ml-1 ${
                activeTab === 'notes'
                  ? 'text-white bg-gray-700'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <StickyNote size={16} className="text-green-400" />
              <span>Notes</span>
            </button>
            <button
              onClick={() => setActiveTab('sources')}
              className={`flex items-center gap-2 px-3 py-1 rounded-t text-sm font-medium transition-colors ml-1 ${
                activeTab === 'sources'
                  ? 'text-white bg-gray-700'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <BookOpen size={16} className="text-orange-400" />
              <span>Sources</span>
            </button>
            <button
              onClick={() => setActiveTab('refactor')}
              data-testid="generative-refactor-tab-button"
              className={`flex items-center gap-2 px-3 py-1 rounded-t text-sm font-medium transition-all duration-300 ml-1 relative overflow-hidden ${
                activeTab === 'refactor'
                  ? 'text-white bg-gray-700 animate-shimmer-inset bg-gradient-to-r from-purple-500/20 via-blue-500/20 to-cyan-500/20 animate-shine'
                  : 'text-gray-400 hover:text-white'
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
              <Sparkles size={16} className="text-purple-400" />
              <span>Generative Refactor</span>
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1">
            {onClose && (
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white transition-colors p-1 rounded"
                title="Close"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 relative">
        {/* Floating Action Buttons - Only show when chat tab is active and thread exists */}
        {activeTab === 'chat' && thread && (
          <div className="absolute top-4 right-4 z-10 flex gap-2">
            {onUnassignThread && (
              <button
                onClick={onUnassignThread}
                className="bg-gray-800 hover:bg-red-700 text-white p-3 rounded-full shadow-lg transition-colors border border-gray-600"
                title="Unassign thread from this node"
              >
                <Unlink size={20} />
              </button>
            )}
            {onNavigateToChat && (
              <button
                onClick={onNavigateToChat}
                className="bg-gray-800 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg transition-colors border border-gray-600"
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
              ref={ref}
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
