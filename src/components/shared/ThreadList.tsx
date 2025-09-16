import { useState } from 'react';
import { MessageSquare, Plus, Edit2, Trash2, UserCheck } from 'lucide-react';

import { ThreadMetadata } from '../../store/useThreadsStore';

interface ThreadListProps {
  threads: ThreadMetadata[];
  activeThreadId?: string;
  onThreadSelect: (threadId: string) => void;
  onThreadCreate?: () => void;
  onThreadRename?: (threadId: string, newName: string) => void;
  onThreadDelete?: (threadId: string) => void;
  showCreateButton?: boolean;
  emptyStateTitle?: string;
  emptyStateSubtitle?: string;
  createButtonTitle?: string;
  className?: string;
}

export function ThreadList({
  threads,
  activeThreadId,
  onThreadSelect,
  onThreadCreate,
  onThreadRename,
  onThreadDelete,
  showCreateButton = true,
  emptyStateTitle = 'No chat threads yet',
  emptyStateSubtitle = 'Create a new conversation to get started',
  createButtonTitle = 'New Chat',
  className = '',
}: ThreadListProps) {
  const [hoveredThreadId, setHoveredThreadId] = useState<string | null>(null);
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const handleStartEdit = (thread: ThreadMetadata) => {
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

  return (
    <div className={`flex flex-col h-full relative ${className}`}>
      {/* Thread List */}
      <div className="flex-1 overflow-y-auto">
        {threads.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            <MessageSquare size={24} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">{emptyStateTitle}</p>
            <p className="text-xs mt-1">{emptyStateSubtitle}</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {threads.map(thread => (
              <div
                key={thread.id}
                className={`group relative p-3 rounded-lg cursor-pointer transition-colors border ${
                  activeThreadId === thread.id
                    ? 'bg-gray-700 border-gray-600'
                    : 'hover:bg-gray-700 border-transparent hover:border-gray-600'
                }`}
                onMouseEnter={() => setHoveredThreadId(thread.id)}
                onMouseLeave={() => setHoveredThreadId(null)}
                onClick={() => {
                  if (editingThreadId !== thread.id) {
                    onThreadSelect(thread.id);
                  }
                }}
              >
                {editingThreadId === thread.id ? (
                  <input
                    type="text"
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    onBlur={() => handleFinishEdit(thread.id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        handleFinishEdit(thread.id);
                      } else if (e.key === 'Escape') {
                        handleCancelEdit();
                      }
                    }}
                    className="w-full bg-gray-600 border border-gray-500 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-400"
                    autoFocus
                  />
                ) : (
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-medium text-gray-200 truncate">
                          {thread.name}
                        </h4>
                        {thread.customRole && (
                          <div title="Custom personality applied">
                            <UserCheck
                              size={14}
                              className="text-purple-400 flex-shrink-0"
                            />
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between mt-1">
                        <p className="text-xs text-gray-500">
                          {thread.messageCount} message
                          {thread.messageCount !== 1 ? 's' : ''}
                        </p>
                        <p className="text-xs text-gray-500">
                          {thread.updatedAt.toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    {hoveredThreadId === thread.id &&
                      editingThreadId !== thread.id &&
                      (onThreadRename || onThreadDelete) && (
                        <div className="flex items-center space-x-1 ml-2">
                          {onThreadRename && (
                            <button
                              onClick={e => {
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
                              onClick={e => {
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
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating New Thread Button */}
      {showCreateButton && onThreadCreate && (
        <button
          onClick={onThreadCreate}
          className="absolute bottom-4 right-4 p-3 bg-blue-600 hover:bg-blue-700 rounded-full shadow-lg transition-colors text-white z-10"
          title={createButtonTitle}
        >
          <Plus size={20} />
        </button>
      )}
    </div>
  );
}
