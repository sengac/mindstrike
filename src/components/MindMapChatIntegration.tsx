import React, { useState, useRef } from 'react';
import { Thread, ConversationMessage } from '../types';
import { ChatThreadSelector } from './shared/ChatThreadSelector';
import { ChatContentViewer } from './shared/ChatContentViewer';
import { MindMapInferenceViewer } from './shared/MindMapInferenceViewer';
import { ChatPanelRef } from './ChatPanel';

interface MindMapChatIntegrationProps {
  nodeId: string;
  nodeLabel: string;
  chatId?: string | null;
  nodeNotes?: string | null;
  focusNotes?: boolean;
  threads: Thread[];
  onThreadAssociate: (nodeId: string, threadId: string) => void;
  onThreadUnassign: (nodeId: string) => void;
  onThreadCreate?: () => void;
  onThreadRename?: (threadId: string, newName: string) => void;
  onThreadDelete?: (threadId: string) => void;
  onClose?: () => void;
  onNavigateToChat?: () => void;
  onDeleteMessage?: (messageId: string) => void;
  onMessagesUpdate?: (messages: ConversationMessage[]) => void;
  onFirstMessage?: () => void;
  onRoleUpdate?: (threadId: string, customRole?: string) => void;
  onNotesUpdate?: (nodeId: string, notes: string) => Promise<void>;
}

export function MindMapChatIntegration({
  nodeId,
  nodeLabel,
  chatId,
  nodeNotes,
  focusNotes,
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
  onFirstMessage,
  onRoleUpdate,
  onNotesUpdate
}: MindMapChatIntegrationProps) {
  const chatPanelRef = useRef<ChatPanelRef>(null);

  // Find the associated thread if chatId exists
  const associatedThread = chatId ? threads.find(t => t.id === chatId) : null;

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

  const handleRoleUpdateForThread = (customRole?: string) => {
    if (onRoleUpdate && chatId) {
      onRoleUpdate(chatId, customRole);
    }
  };

  // If no chatId or thread not found, show inference viewer
  if (!chatId || !associatedThread) {
    return (
      <MindMapInferenceViewer
        nodeId={nodeId}
        nodeLabel={nodeLabel}
        nodeNotes={nodeNotes}
        focusNotes={focusNotes}
        threads={threads}
        onThreadSelect={handleThreadSelect}
        onThreadCreate={onThreadCreate}
        onThreadRename={onThreadRename}
        onThreadDelete={onThreadDelete}
        onClose={onClose}
        onNotesUpdate={async (notes) => {
          if (onNotesUpdate) {
            await onNotesUpdate(nodeId, notes);
          }
        }}
      />
    );
  }

  // Show the chat content for the associated thread
  return (
    <ChatContentViewer
      ref={chatPanelRef}
      thread={associatedThread}
      nodeLabel={nodeLabel}
      nodeNotes={nodeNotes}
      focusNotes={focusNotes}
      onNavigateToChat={onNavigateToChat}
      onUnassignThread={handleThreadUnassign}
      onClose={onClose}
      onDeleteMessage={handleDeleteMessageForThread}
      onMessagesUpdate={handleMessagesUpdateForThread}
      onFirstMessage={onFirstMessage}
      onRoleUpdate={handleRoleUpdateForThread}
      onNotesUpdate={async (notes) => {
        if (onNotesUpdate) {
          await onNotesUpdate(nodeId, notes);
        }
      }}
    />
  );
}
