import React, { useRef, forwardRef } from 'react';
import { MessageSquare, ExternalLink, Unlink, X } from 'lucide-react';
import { Thread, ConversationMessage } from '../../types';
import { ChatPanel, ChatPanelRef } from '../ChatPanel';

interface ChatContentViewerProps {
  thread: Thread;
  nodeLabel: string;
  onNavigateToChat?: () => void;
  onUnassignThread?: () => void;
  onClose?: () => void;
  onDeleteMessage?: (messageId: string) => void;
  onMessagesUpdate?: (messages: ConversationMessage[]) => void;
  onFirstMessage?: () => void;
  onRoleUpdate?: (threadId: string, customRole?: string) => void;
}

export const ChatContentViewer = forwardRef<ChatPanelRef, ChatContentViewerProps>(({
  thread,
  nodeLabel,
  onNavigateToChat,
  onUnassignThread,
  onClose,
  onDeleteMessage,
  onMessagesUpdate,
  onFirstMessage,
  onRoleUpdate
}, ref) => {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 p-3 border-b border-gray-600">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare size={16} className="text-blue-400" />
            <span className="text-white text-sm font-medium">Chat Thread</span>
            <span className="text-gray-400 text-xs">• {nodeLabel}</span>
          </div>
          <div className="flex items-center gap-1">
            {onUnassignThread && (
              <button
                onClick={onUnassignThread}
                className="text-gray-400 hover:text-red-400 transition-colors p-1 rounded"
                title="Unassign thread from this node"
              >
                <Unlink size={14} />
              </button>
            )}
            {onNavigateToChat && (
              <button
                onClick={onNavigateToChat}
                className="text-gray-400 hover:text-white transition-colors p-1 rounded"
                title="Open in chat view"
              >
                <ExternalLink size={14} />
              </button>
            )}
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
        <p className="text-xs text-gray-400 mt-1 truncate">
          {thread.name}
        </p>
      </div>

      {/* Chat Content */}
      <div className="flex-1 min-h-0">
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
        />
      </div>
    </div>
  );
});

ChatContentViewer.displayName = 'ChatContentViewer';
