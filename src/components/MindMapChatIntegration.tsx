import React, { useState, useRef } from 'react';
import { Thread, ConversationMessage } from '../types';
import { ChatThreadSelector } from './shared/ChatThreadSelector';
import { ChatContentViewer } from './shared/ChatContentViewer';
import { ChatPanelRef } from './ChatPanel';

interface MindMapChatIntegrationProps {
  nodeId: string;
  nodeLabel: string;
  chatId?: string | null;
  threads: Thread[];
  onThreadAssociate: (nodeId: string, threadId: string) => void;
  onThreadUnassign: (nodeId: string) => void;
  onClose?: () => void;
  onNavigateToChat?: () => void;
  onDeleteMessage?: (messageId: string) => void;
  onMessagesUpdate?: (messages: ConversationMessage[]) => void;
  onFirstMessage?: () => void;
  onRoleUpdate?: (threadId: string, customRole?: string) => void;
}

export function MindMapChatIntegration({
  nodeId,
  nodeLabel,
  chatId,
  threads,
  onThreadAssociate,
  onThreadUnassign,
  onClose,
  onNavigateToChat,
  onDeleteMessage,
  onMessagesUpdate,
  onFirstMessage,
  onRoleUpdate
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

  // If no chatId or thread not found, show thread selector
  if (!chatId || !associatedThread) {
    return (
      <ChatThreadSelector
        threads={threads}
        onThreadSelect={handleThreadSelect}
        onClose={onClose}
      />
    );
  }

  // Show the chat content for the associated thread
  return (
    <ChatContentViewer
      ref={chatPanelRef}
      thread={associatedThread}
      nodeLabel={nodeLabel}
      onNavigateToChat={onNavigateToChat}
      onUnassignThread={handleThreadUnassign}
      onClose={onClose}
      onDeleteMessage={handleDeleteMessageForThread}
      onMessagesUpdate={handleMessagesUpdateForThread}
      onFirstMessage={onFirstMessage}
      onRoleUpdate={handleRoleUpdateForThread}
    />
  );
}
