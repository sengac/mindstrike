import { useRef } from 'react';
import { ConversationMessage, NotesAttachment } from '../../types';
import { ThreadMetadata } from '../../store/useThreadsStore';

import { ChatContentViewer } from '../../components/shared/ChatContentViewer';
import { Source } from '../types/mindMap';
import { ChatPanelRef } from '../../chat/components/ChatPanel';

interface MindMapChatIntegrationProps {
  nodeId: string;
  nodeLabel: string;
  chatId?: string | null;
  nodeNotes?: string | null;
  nodeSources?: Source[];
  focusChat?: boolean;
  focusNotes?: boolean;
  focusSources?: boolean;
  threads: ThreadMetadata[];
  onThreadAssociate: (nodeId: string, threadId: string) => void;
  onThreadUnassign: (nodeId: string) => void;
  onThreadCreate?: () => void;
  onThreadRename?: (threadId: string, newName: string) => void;
  onThreadDelete?: (threadId: string) => void;
  onClose?: () => void;
  onNavigateToChat?: (threadId?: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onMessagesUpdate?: (messages: ConversationMessage[]) => void;
  onFirstMessage?: () => void;
  onPromptUpdate?: (threadId: string, customPrompt?: string) => void;
  onNotesUpdate?: (nodeId: string, notes: string) => Promise<void>;
  onSourcesUpdate?: (nodeId: string, sources: Source[]) => Promise<void>;
  onNodeAdd?: (parentId: string, text: string) => Promise<void>;
  onNodeUpdate?: (nodeId: string, text: string) => Promise<void>;
  onNodeDelete?: (nodeId: string) => Promise<void>;
  onNavigateToPrevNode?: () => void;
  onNavigateToNextNode?: () => void;
  onCustomizePrompts?: () => void;
}

export function MindMapChatIntegration({
  nodeId,
  nodeLabel,
  chatId,
  nodeNotes,
  nodeSources,
  focusChat,
  focusNotes,
  focusSources,
  threads,
  onThreadAssociate,
  onThreadUnassign,
  onThreadCreate,
  onThreadRename,
  onThreadDelete,
  onClose,
  onNavigateToChat,
  onDeleteMessage,
  onMessagesUpdate,
  onPromptUpdate,
  onNotesUpdate,
  onSourcesUpdate,
  onNodeAdd: _onNodeAdd,
  onNodeUpdate: _onNodeUpdate,
  onNodeDelete: _onNodeDelete,
  onNavigateToPrevNode,
  onNavigateToNextNode,
  onCustomizePrompts,
}: MindMapChatIntegrationProps) {
  const chatPanelRef = useRef<ChatPanelRef>(null);

  // Find the associated thread if chatId exists
  const associatedThreadMetadata = chatId
    ? threads.find(t => t.id === chatId)
    : null;

  const handleThreadSelect = (threadId: string) => {
    onThreadAssociate(nodeId, threadId);
  };

  const handleThreadUnassign = () => {
    onThreadUnassign(nodeId);
  };

  // Create thread-specific handlers
  const handleDeleteMessageForThread = (messageId: string) => {
    if (onDeleteMessage) {
      onDeleteMessage(messageId);
    }
  };

  const handleMessagesUpdateForThread = (messages: ConversationMessage[]) => {
    if (onMessagesUpdate) {
      onMessagesUpdate(messages);
    }
  };

  const handlePromptUpdateForThread = (customPrompt?: string) => {
    if (onPromptUpdate && chatId) {
      onPromptUpdate(chatId, customPrompt);
    }
  };

  const handleCopyNotesToChat = (notes: NotesAttachment) => {
    // Add notes attachment to the current chat panel
    if (chatPanelRef.current) {
      chatPanelRef.current.addNotesAttachment(notes);
    }
  };

  // Always show ChatContentViewer, with or without a thread
  return (
    <ChatContentViewer
      ref={chatPanelRef}
      threadId={associatedThreadMetadata?.id}
      threads={threads}
      nodeLabel={nodeLabel}
      nodeNotes={nodeNotes}
      nodeSources={nodeSources}
      focusChat={focusChat}
      focusNotes={focusNotes}
      focusSources={focusSources}
      onNavigateToChat={onNavigateToChat}
      onUnassignThread={handleThreadUnassign}
      onClose={onClose}
      onDeleteMessage={handleDeleteMessageForThread}
      onMessagesUpdate={handleMessagesUpdateForThread}
      onPromptUpdate={handlePromptUpdateForThread}
      onNotesUpdate={async notes => {
        if (onNotesUpdate) {
          await onNotesUpdate(nodeId, notes);
        }
      }}
      onSourcesUpdate={async sources => {
        if (onSourcesUpdate) {
          await onSourcesUpdate(nodeId, sources);
        }
      }}
      onThreadSelect={handleThreadSelect}
      onThreadCreate={onThreadCreate}
      onThreadRename={onThreadRename}
      onThreadDelete={onThreadDelete}
      onCopyNotesToChat={handleCopyNotesToChat}
      onNavigateToPrevNode={onNavigateToPrevNode}
      onNavigateToNextNode={onNavigateToNextNode}
      onCustomizePrompts={onCustomizePrompts}
    />
  );
}
