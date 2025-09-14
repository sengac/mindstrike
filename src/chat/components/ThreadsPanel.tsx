import { MessageSquare, UserCheck } from 'lucide-react';
import { Thread } from '../../types';
import { ListPanel } from '../../components/shared/ListPanel';

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
        title: "No conversations yet",
        subtitle: "Start a new chat to begin"
      }}
      createButtonTitle="New conversation"
      renameButtonTitle="Rename conversation"
      deleteButtonTitle="Delete conversation"
      testId="chat-slider"
      renderItemContent={(thread) => 
        thread.customRole ? (
          <div title="Custom personality applied">
            <UserCheck 
              size={14} 
              className="text-purple-400 flex-shrink-0" 
            />
          </div>
        ) : null
      }
    />
  );
}
