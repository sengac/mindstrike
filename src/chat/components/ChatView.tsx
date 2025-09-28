import { forwardRef } from 'react';
import { MessageSquare } from 'lucide-react';
import { AppBar } from '../../components/AppBar';
import { ThreadsPanel } from './ThreadsPanel';
import type { ChatPanelRef } from './ChatPanel';
import { ChatPanel } from './ChatPanel';
import type { ThreadMetadata } from '../../store/useThreadsStore';

interface ChatViewProps {
  threads: ThreadMetadata[];
  activeThreadId?: string;
  onThreadSelect: (threadId: string) => void;
  onThreadCreate: () => void;
  onThreadRename: (threadId: string, newName: string) => void;
  onThreadDelete: (threadId: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onPromptUpdate: (threadId: string, customPrompt?: string) => void;
  onNavigateToWorkspaces: () => void;
  onCustomizePrompts: () => void;
  onToggleAgentMode: () => void;
  onPromptEdit?: (threadId: string) => void;
}

export const ChatView = forwardRef<ChatPanelRef, ChatViewProps>(
  (
    {
      threads,
      activeThreadId,
      onThreadSelect,
      onThreadCreate,
      onThreadRename,
      onThreadDelete,
      onDeleteMessage,
      onPromptUpdate,
      onNavigateToWorkspaces,
      onCustomizePrompts,
      onToggleAgentMode,
      onPromptEdit,
    },
    ref
  ) => {
    return (
      <div className="flex flex-col h-full">
        {/* Chat Header spanning across threads and messages */}
        <AppBar icon={MessageSquare} title="Chat" />

        {/* Chat content area */}
        <div className="flex flex-1 min-h-0">
          <ThreadsPanel
            threads={threads}
            activeThreadId={activeThreadId}
            onThreadSelect={onThreadSelect}
            onThreadCreate={onThreadCreate}
            onThreadRename={onThreadRename}
            onThreadDelete={onThreadDelete}
            onPromptEdit={onPromptEdit}
          />
          <ChatPanel
            ref={ref}
            threadId={activeThreadId}
            onDeleteMessage={onDeleteMessage}
            onPromptUpdate={onPromptUpdate}
            onNavigateToWorkspaces={onNavigateToWorkspaces}
            onCustomizePrompts={onCustomizePrompts}
            onToggleAgentMode={onToggleAgentMode}
          />
        </div>
      </div>
    );
  }
);

ChatView.displayName = 'ChatView';
