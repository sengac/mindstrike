import React, { useState } from 'react';
import { Edit2, Trash2, Plus, MessageSquare, UserCheck } from 'lucide-react';
import { Thread } from '../types';
import { clsx } from 'clsx';

interface ThreadsPanelProps {
  threads: Thread[];
  activeThreadId?: string;
  onThreadSelect: (threadId: string) => void;
  onThreadCreate: () => void;
  onThreadRename: (threadId: string, newName: string) => void;
  onThreadDelete: (threadId: string) => void;
}

export function ThreadsPanel({
  threads,
  activeThreadId,
  onThreadSelect,
  onThreadCreate,
  onThreadRename,
  onThreadDelete
}: ThreadsPanelProps) {
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [hoveredThreadId, setHoveredThreadId] = useState<string | null>(null);

  const handleStartEdit = (thread: Thread) => {
    setEditingThreadId(thread.id);
    setEditingName(thread.name);
  };

  const handleSaveEdit = () => {
    if (editingThreadId && editingName.trim()) {
      onThreadRename(editingThreadId, editingName.trim());
    }
    setEditingThreadId(null);
    setEditingName('');
  };

  const handleCancelEdit = () => {
    setEditingThreadId(null);
    setEditingName('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  return (
    <div className="w-[20%] min-w-[200px] max-w-[500px] bg-gray-800 border-r border-gray-700 flex flex-col relative">
      {/* Threads List */}
      <div className="flex-1 overflow-y-auto">
        {threads.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            <MessageSquare size={24} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No conversations yet</p>
            <p className="text-xs mt-1">Start a new chat to begin</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {threads.map((thread) => (
              <div
                key={thread.id}
                className={clsx(
                  'group relative p-3 rounded-lg cursor-pointer transition-colors',
                  'hover:bg-gray-700',
                  activeThreadId === thread.id ? 'bg-gray-700 border border-blue-500' : 'border border-transparent'
                )}
                onMouseEnter={() => setHoveredThreadId(thread.id)}
                onMouseLeave={() => setHoveredThreadId(null)}
                onClick={() => !editingThreadId && onThreadSelect(thread.id)}
              >
                {editingThreadId === thread.id ? (
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={handleSaveEdit}
                    className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    autoFocus
                  />
                ) : (
                  <>
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-medium text-gray-200 truncate">
                            {thread.name}
                          </h3>
                          {thread.customRole && (
                            <UserCheck 
                              size={14} 
                              className="text-purple-400 flex-shrink-0" 
                              title="Custom personality applied"
                            />
                          )}
                        </div>
                        {thread.summary && (
                          <p className="text-xs text-gray-400 mt-1 line-cl-2">
                            {thread.summary}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(thread.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                      
                      {hoveredThreadId === thread.id && (
                        <div className="flex items-center space-x-1 ml-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEdit(thread);
                            }}
                            className="p-1 hover:bg-gray-600 rounded text-gray-400 hover:text-gray-200 transition-colors"
                            title="Rename conversation"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onThreadDelete(thread.id);
                            }}
                            className="p-1 hover:bg-gray-600 rounded text-gray-400 hover:text-red-400 transition-colors"
                            title="Delete conversation"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating New Conversation Button */}
      <button
        onClick={onThreadCreate}
        className="absolute bottom-4 right-4 p-3 bg-blue-600 hover:bg-blue-700 rounded-full shadow-lg transition-colors text-white z-10"
        title="New conversation"
      >
        <Plus size={20} />
      </button>
    </div>
  );
}
