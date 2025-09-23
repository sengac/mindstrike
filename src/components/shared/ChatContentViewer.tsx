import {
  forwardRef,
  useState,
  useEffect,
  useRef,
  useImperativeHandle,
} from 'react';
import {
  MessageSquare,
  ExternalLink,
  Unlink,
  X,
  StickyNote,
  BookOpen,
  Copy,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { ConversationMessage, NotesAttachment } from '../../types';
import type { ThreadMetadata } from '../../store/useThreadsStore';
import type { Source } from '../../types/mindMap';
import type { ChatPanelRef } from '../../chat/components/ChatPanel';
import { ChatPanel } from '../../chat/components/ChatPanel';
import { MarkdownEditor } from './MarkdownEditor';
import { ThreadList } from './ThreadList';
import { SourcesList } from './SourcesList';
import { MultiChoiceDialog } from './MultiChoiceDialog';

interface ChatContentViewerProps {
  threadId?: string;
  threads?: ThreadMetadata[];
  nodeLabel: string;
  nodeNotes?: string | null;
  nodeSources?: Source[];
  focusChat?: boolean;
  focusNotes?: boolean;
  focusSources?: boolean;
  onNavigateToChat?: (threadId?: string) => void;
  onUnassignThread?: () => void;
  onClose?: () => void;
  onDeleteMessage?: (messageId: string) => void;
  onMessagesUpdate?: (messages: ConversationMessage[]) => void;
  onPromptUpdate?: (threadId: string, customPrompt?: string) => void;
  onNotesUpdate?: (notes: string) => Promise<void>;
  onSourcesUpdate?: (sources: Source[]) => Promise<void>;
  onThreadSelect?: (threadId: string) => void;
  onThreadCreate?: () => void;
  onThreadRename?: (threadId: string, newName: string) => void;
  onThreadDelete?: (threadId: string) => void;
  onCopyNotesToChat?: (notes: NotesAttachment) => void;
  onNavigateToPrevNode?: () => void;
  onNavigateToNextNode?: () => void;
  onCustomizePrompts?: () => void;
}

export const ChatContentViewer = forwardRef<
  ChatPanelRef,
  ChatContentViewerProps
>(
  (
    {
      threadId,
      threads,
      nodeLabel,
      nodeNotes,
      nodeSources,
      focusChat,
      focusNotes,
      focusSources,
      onNavigateToChat,
      onUnassignThread,
      onClose,
      onDeleteMessage,
      onMessagesUpdate,
      onPromptUpdate,
      onNotesUpdate,
      onSourcesUpdate,
      onThreadSelect,
      onThreadCreate,
      onThreadRename,
      onThreadDelete,
      onCopyNotesToChat: _onCopyNotesToChat,
      onNavigateToPrevNode,
      onNavigateToNextNode,
      onCustomizePrompts,
    },
    ref
  ) => {
    const [activeTab, setActiveTab] = useState<'chat' | 'notes' | 'sources'>(
      focusNotes ? 'notes' : focusSources ? 'sources' : 'chat'
    );
    const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
    const [pendingContent, setPendingContent] = useState('');
    const [notesActiveMode, setNotesActiveMode] = useState<
      'preview' | 'edit'
    >();
    const [pendingNotesAttachment, setPendingNotesAttachment] =
      useState<NotesAttachment | null>(null);
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
      },
    }));

    // Update active tab when focusChat, focusNotes or focusSources prop changes
    useEffect(() => {
      if (focusChat) {
        setActiveTab('chat');
      } else if (focusNotes) {
        setActiveTab('notes');
      } else if (focusSources) {
        setActiveTab('sources');
      }
    }, [focusChat, focusNotes, focusSources]);

    // Add pending notes attachment when ChatPanel becomes available
    useEffect(() => {
      if (pendingNotesAttachment && chatPanelRef.current) {
        chatPanelRef.current.addNotesAttachment(pendingNotesAttachment);
        setPendingNotesAttachment(null);
      }
    }, [pendingNotesAttachment, activeTab, threadId]);

    const handleSaveNotes = async (value: string) => {
      if (onNotesUpdate) {
        await onNotesUpdate(value);
      }
    };

    const handleCopyToNotes = (content: string) => {
      // Check if notes already have content
      if (nodeNotes?.trim()) {
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
      setPendingContent('');
    };

    const handleCancelOverwrite = () => {
      setPendingContent('');
    };

    const handleCopyNotesToChat = () => {
      if (!nodeNotes?.trim()) {
        toast.error('No notes content to copy');
        return;
      }

      const notesAttachment: NotesAttachment = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        title: `Notes from ${nodeLabel}`,
        content: nodeNotes,
        nodeLabel,
        attachedAt: new Date(),
      };

      // Store the notes attachment to be added when ChatPanel is available
      setPendingNotesAttachment(notesAttachment);
      setActiveTab('chat');
      toast.success('Notes copied to chat as attachment');
    };

    return (
      <div className="flex flex-col h-full">
        {/* Add to Notes Dialog */}
        <MultiChoiceDialog
          isOpen={showOverwriteConfirm}
          onClose={() => setShowOverwriteConfirm(false)}
          title="Add to Notes"
          message="The notes section already contains content. How would you like to add this message?"
          choices={[
            {
              text: 'Cancel',
              onClick: handleCancelOverwrite,
              variant: 'secondary',
            },
            {
              text: 'Append to Notes',
              onClick: handleAppendToNotes,
              variant: 'primary',
            },
            {
              text: 'Replace Notes',
              onClick: handleConfirmOverwrite,
              variant: 'primary',
            },
          ]}
          icon={<StickyNote size={20} />}
        />

        {/* Header with Tabs */}
        <div className="flex-shrink-0 border-b border-gray-700">
          <div
            className="flex items-center justify-between"
            data-testid="chat-content-viewer-header"
          >
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
                  <MessageSquare
                    size={16}
                    className={activeTab === 'chat' ? 'text-blue-400' : ''}
                  />
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
                  <StickyNote
                    size={16}
                    className={activeTab === 'notes' ? 'text-blue-400' : ''}
                  />
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
                  <BookOpen
                    size={16}
                    className={activeTab === 'sources' ? 'text-blue-400' : ''}
                  />
                  <span>Sources</span>
                </button>
              </nav>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-1 pl-6 pr-3">
              {/* Chat-specific actions - only show when chat tab is active and thread exists */}
              {activeTab === 'chat' && threadId && (
                <>
                  {onUnassignThread && (
                    <button
                      onClick={onUnassignThread}
                      className="p-2 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white"
                      title="Unassign thread from this node"
                    >
                      <Unlink size={20} />
                    </button>
                  )}
                  {onNavigateToChat && (
                    <button
                      onClick={() => onNavigateToChat(threadId)}
                      className="p-2 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white"
                      title="Open in chat view"
                    >
                      <ExternalLink size={20} />
                    </button>
                  )}
                </>
              )}
              {onNavigateToPrevNode && (
                <button
                  onClick={onNavigateToPrevNode}
                  className="p-2 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white"
                  title="Previous Node"
                >
                  <ChevronLeft size={20} />
                </button>
              )}
              {onNavigateToNextNode && (
                <button
                  onClick={onNavigateToNextNode}
                  className="p-2 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white"
                  title="Next Node"
                >
                  <ChevronRight size={20} />
                </button>
              )}
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
        <div className="flex-1 min-h-0 bg-dark-bg relative">
          {activeTab === 'chat' ? (
            threadId ? (
              <ChatPanel
                ref={chatPanelRef}
                threadId={threadId}
                onMessagesUpdate={messages => {
                  if (onMessagesUpdate) {
                    onMessagesUpdate(messages);
                  }
                }}
                onDeleteMessage={messageId => {
                  if (onDeleteMessage) {
                    onDeleteMessage(messageId);
                  }
                }}
                onPromptUpdate={onPromptUpdate}
                onCopyToNotes={handleCopyToNotes}
                onCustomizePrompts={onCustomizePrompts}
                inMindMapContext={true}
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
                defaultMode={nodeNotes?.trim() ? 'preview' : 'edit'}
                activeMode={notesActiveMode}
                onSave={handleSaveNotes}
                className="flex-1"
                additionalButtons={
                  <button
                    onClick={handleCopyNotesToChat}
                    disabled={!nodeNotes?.trim()}
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
          ) : null}
        </div>
      </div>
    );
  }
);

ChatContentViewer.displayName = 'ChatContentViewer';
