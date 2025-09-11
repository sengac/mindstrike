import { forwardRef, useState } from 'react';
import { MessageSquare, X, StickyNote, Network, Plus, Edit2, Trash2 } from 'lucide-react';
import { Thread } from '../../types';
import { MarkdownEditor } from './MarkdownEditor';

interface MindMapInferenceViewerProps {
  nodeId: string;
  nodeLabel: string;
  nodeNotes?: string | null;
  focusNotes?: boolean;
  threads: Thread[];
  onThreadSelect: (threadId: string) => void;
  onThreadCreate?: () => void;
  onThreadRename?: (threadId: string, newName: string) => void;
  onThreadDelete?: (threadId: string) => void;
  onClose?: () => void;
  onNotesUpdate?: (notes: string) => void;
}

export const MindMapInferenceViewer = forwardRef<HTMLDivElement, MindMapInferenceViewerProps>(({
  nodeId,
  nodeLabel,
  nodeNotes,
  focusNotes,
  threads,
  onThreadSelect,
  onThreadCreate,
  onThreadRename,
  onThreadDelete,
  onClose,
  onNotesUpdate
}, ref) => {
  const [activeTab, setActiveTab] = useState<'chat' | 'notes'>(focusNotes ? 'notes' : 'chat');
  const [hoveredThreadId, setHoveredThreadId] = useState<string | null>(null);
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const handleSaveNotes = async (value: string) => {
    if (onNotesUpdate) {
      onNotesUpdate(value);
    }
  };

  const handleStartEdit = (thread: Thread) => {
    setEditingThreadId(thread.id);
    setEditingName(thread.name);
  };

  const handleFinishEdit = (threadId: string) => {
    if (editingName.trim() && onThreadRename) {
      onThreadRename(threadId, editingName.trim());
    }
    setEditingThreadId(null);
    setEditingName('');
  };

  const handleCancelEdit = () => {
    setEditingThreadId(null);
    setEditingName('');
  };

  const handleDeleteThread = (threadId: string) => {
    if (onThreadDelete) {
      onThreadDelete(threadId);
    }
  };

  // Format node label for tab title with 40 character limit
  const formatNodeTitle = (label: string) => {
    if (label.length <= 40) {
      return label;
    }
    return label.substring(0, 37) + '...';
  };

  return (
    <div ref={ref} className="flex flex-col h-full">
      {/* Header with Tabs */}
      <div className="flex-shrink-0 border-b border-gray-600">
        <div className="flex items-center justify-between p-3" data-testid="inference-viewer-header">
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
              <span>Chat Threads</span>
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
              <span>{formatNodeTitle(nodeLabel)}</span>
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
        {activeTab === 'chat' ? (
          <div className="flex flex-col h-full relative">
            {/* Thread List */}
            <div className="flex-1 overflow-y-auto">
              {threads.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  <Network size={24} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No chat threads yet</p>
                  <p className="text-xs mt-1">Create a new conversation to get started</p>
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {threads.map((thread) => (
                    <div
                      key={thread.id}
                      className="group relative p-3 rounded-lg cursor-pointer transition-colors hover:bg-gray-700 border border-transparent hover:border-gray-600"
                      onMouseEnter={() => setHoveredThreadId(thread.id)}
                      onMouseLeave={() => setHoveredThreadId(null)}
                      onClick={() => {
                        if (editingThreadId !== thread.id) {
                          onThreadSelect(thread.id);
                        }
                      }}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {editingThreadId === thread.id ? (
                              <input
                                type="text"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                onBlur={() => handleFinishEdit(thread.id)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleFinishEdit(thread.id);
                                  } else if (e.key === 'Escape') {
                                    handleCancelEdit();
                                  }
                                }}
                                className="bg-gray-600 border border-gray-500 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-400 flex-1"
                                autoFocus
                              />
                            ) : (
                              <h4 className="text-sm font-medium text-gray-200 truncate">
                                {thread.name}
                              </h4>
                            )}
                          </div>
                          {editingThreadId !== thread.id && (
                            <>
                              {thread.summary && (
                                <p className="text-xs text-gray-400 mt-1 line-cl-2">
                                  {thread.summary}
                                </p>
                              )}
                              <div className="flex items-center justify-between mt-1">
                                <p className="text-xs text-gray-500">
                                  {thread.messages.length} message{thread.messages.length !== 1 ? 's' : ''}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {thread.updatedAt.toLocaleDateString()}
                                </p>
                              </div>
                            </>
                          )}
                        </div>
                        
                        {hoveredThreadId === thread.id && editingThreadId !== thread.id && (onThreadRename || onThreadDelete) && (
                          <div className="flex items-center space-x-1 ml-2">
                            {onThreadRename && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStartEdit(thread);
                                }}
                                className="p-1 hover:bg-gray-600 rounded text-gray-400 hover:text-gray-200 transition-colors"
                                title="Rename thread"
                              >
                                <Edit2 size={12} />
                              </button>
                            )}
                            {onThreadDelete && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteThread(thread.id);
                                }}
                                className="p-1 hover:bg-gray-600 rounded text-gray-400 hover:text-red-400 transition-colors"
                                title="Delete thread"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Floating New Chat Button */}
            {onThreadCreate && (
              <button
                onClick={onThreadCreate}
                className="absolute bottom-4 right-4 p-3 bg-blue-600 hover:bg-blue-700 rounded-full shadow-lg transition-colors text-white z-10"
                title="New Chat"
              >
                <Plus size={20} />
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <MarkdownEditor
              value={nodeNotes || ''}
              onChange={() => {}} // MarkdownEditor handles its own state
              placeholder="Add notes and context for this node using markdown..."
              showTabs={true}
              defaultMode={nodeNotes && nodeNotes.trim() ? "preview" : "edit"}
              autoSave={false}
              onSave={handleSaveNotes}
              className="flex-1"
            />
          </div>
        )}
      </div>
    </div>
  );
});

MindMapInferenceViewer.displayName = 'MindMapInferenceViewer';
