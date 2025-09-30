import { MessageSquare, Terminal } from 'lucide-react';
import type { ThreadMetadata } from '../../store/useThreadsStore';
import { ListPanel } from '../../components/shared/ListPanel';

interface ThreadsPanelProps {
  threads: ThreadMetadata[];
  activeThreadId?: string;
  onThreadSelect: (threadId: string) => void;
  onThreadCreate: () => void;
  onThreadRename: (threadId: string, newName: string) => void;
  onThreadDelete: (threadId: string) => void;
  onPromptEdit?: (threadId: string) => void;
}

export function ThreadsPanel({
  threads,
  activeThreadId,
  onThreadSelect,
  onThreadCreate,
  onThreadRename,
  onThreadDelete,
  onPromptEdit,
}: ThreadsPanelProps) {
  return (
    <ListPanel
      items={threads}
      activeItemId={activeThreadId}
      onItemSelect={onThreadSelect}
      onItemCreate={onThreadCreate}
      onItemRename={onThreadRename}
      onItemDelete={onThreadDelete}
      emptyState={{
        icon: MessageSquare,
        title: 'No conversations yet',
        subtitle: 'Start a new chat to begin',
      }}
      createButtonTitle="New conversation"
      renameButtonTitle="Rename conversation"
      deleteButtonTitle="Delete conversation"
      testId="chat-slider"
      renderItemContent={thread =>
        thread.customPrompt ? (
          <button
            title="Custom prompt applied - Click to edit"
            onClick={e => {
              e.stopPropagation();
              onPromptEdit?.(thread.id);
            }}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
          >
            <Terminal size={14} className="text-purple-400 shrink-0" />
          </button>
        ) : null
      }
    />
  );
}
