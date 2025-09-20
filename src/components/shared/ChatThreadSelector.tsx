import { MessageSquare, Terminal, X } from 'lucide-react';
import { clsx } from 'clsx';
import { Thread } from '../../types';

interface ChatThreadSelectorProps {
  threads: Thread[];
  onThreadSelect: (threadId: string) => void;
  onClose?: () => void;
}

export function ChatThreadSelector({
  threads,
  onThreadSelect,
  onClose,
}: ChatThreadSelectorProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 p-3 border-b border-gray-600">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white text-sm font-medium flex items-center gap-2">
              <MessageSquare size={16} />
              Select a Chat Thread
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              Choose a thread to associate with this node
            </p>
          </div>
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

      {/* Thread List */}
      <div className="flex-1 overflow-y-auto">
        {threads.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            <MessageSquare size={24} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No chat threads yet</p>
            <p className="text-xs mt-1">
              Create a new conversation in the chat view first
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {threads.map(thread => (
              <div
                key={thread.id}
                className={clsx(
                  'group relative p-3 rounded-lg cursor-pointer transition-colors',
                  'hover:bg-gray-700 border border-transparent hover:border-gray-600'
                )}
                onClick={() => {
                  onThreadSelect(thread.id);
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium text-gray-200 truncate">
                        {thread.name}
                      </h4>
                      {thread.customPrompt && (
                        <div title="Custom prompt applied">
                          <Terminal
                            size={14}
                            className="text-purple-400 flex-shrink-0"
                          />
                        </div>
                      )}
                    </div>
                    {thread.summary && (
                      <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                        {thread.summary}
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-gray-500">
                        {thread.messages.length} message
                        {thread.messages.length !== 1 ? 's' : ''}
                      </p>
                      <p className="text-xs text-gray-500">
                        {thread.updatedAt.toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
