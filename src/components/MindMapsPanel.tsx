import { useState, useEffect } from 'react';
import { Network } from 'lucide-react';
import { MindMap } from '../hooks/useMindMaps';
import { Thread, ConversationMessage } from '../types';
import { ListPanel } from './shared/ListPanel';
import { MindMapChatIntegration } from './MindMapChatIntegration';

interface MindMapsPanelProps {
  mindMaps: MindMap[];
  activeMindMapId?: string;
  onMindMapSelect: (mindMapId: string) => void;
  onMindMapCreate: () => void;
  onMindMapRename: (mindMapId: string, newName: string) => void;
  onMindMapDelete: (mindMapId: string) => void;
  // Thread-related props
  threads: Thread[];
  onThreadAssociate: (nodeId: string, threadId: string) => void;
  onThreadUnassign: (nodeId: string) => void;
  onThreadCreate?: () => void;
  onThreadRename?: (threadId: string, newName: string) => void;
  onThreadDelete?: (threadId: string) => void;
  onNavigateToChat?: () => void;
  onDeleteMessage?: (threadId: string, messageId: string) => void;
  onMessagesUpdate?: (threadId: string, messages: ConversationMessage[]) => void;
  onFirstMessage?: () => void;
  onRoleUpdate?: (threadId: string, customRole?: string) => void;
  onNodeNotesUpdate?: (nodeId: string, notes: string) => Promise<void>;
}

export function MindMapsPanel({
  mindMaps,
  activeMindMapId,
  onMindMapSelect,
  onMindMapCreate,
  onMindMapRename,
  onMindMapDelete,
  threads,
  onThreadAssociate,
  onThreadUnassign,
  onThreadCreate,
  onThreadRename,
  onThreadDelete,
  onNavigateToChat,
  onDeleteMessage,
  onMessagesUpdate,
  onFirstMessage,
  onRoleUpdate,
  onNodeNotesUpdate
}: MindMapsPanelProps) {
  const [showInferenceChat, setShowInferenceChat] = useState(false);
  const [inferenceChatNode, setInferenceChatNode] = useState<{
    id: string;
    label: string;
    chatId?: string | null;
    notes?: string | null;
    focusNotes?: boolean;
  } | null>(null);

  // Listen for mindmap inference events
  useEffect(() => {
    const handleInferenceOpen = (event: CustomEvent) => {
      const { nodeId, label, chatId, notes, focusNotes } = event.detail;
      setInferenceChatNode({ id: nodeId, label, chatId, notes, focusNotes });
      setShowInferenceChat(true);
      
      // Broadcast the active inference node ID for UI updates
      window.dispatchEvent(new CustomEvent('mindmap-inference-active', {
        detail: { activeNodeId: nodeId }
      }));
    };

    const handleInferenceClose = () => {
      setShowInferenceChat(false);
      setInferenceChatNode(null);
      
      // Broadcast that no node is active
      window.dispatchEvent(new CustomEvent('mindmap-inference-active', {
        detail: { activeNodeId: null }
      }));
    };

    const handleGetActiveState = (event: CustomEvent) => {
      const { requestingNodeId } = event.detail;
      const currentActiveNodeId = inferenceChatNode?.id || null;
      
      // Respond with current active state for the requesting node
      window.dispatchEvent(new CustomEvent('mindmap-inference-active', {
        detail: { activeNodeId: currentActiveNodeId }
      }));
    };

    const handleNodeNotesUpdated = (event: CustomEvent) => {
      const { nodeId, notes } = event.detail;
      
      // Update the inferenceChatNode if it's the same node
      if (inferenceChatNode && inferenceChatNode.id === nodeId) {
        setInferenceChatNode({
          ...inferenceChatNode,
          notes
        });
      }
    };

    const handleNodeLabelUpdated = (event: CustomEvent) => {
      const { nodeId, label } = event.detail;
      
      // Update the inferenceChatNode label if it's the same node
      if (inferenceChatNode && inferenceChatNode.id === nodeId) {
        setInferenceChatNode({
          ...inferenceChatNode,
          label
        });
      }
    };

    const handleInferenceCheckAndClose = (event: CustomEvent) => {
      const { deletedNodeIds, parentId } = event.detail;
      
      if (inferenceChatNode) {
        // Check if the active inference node is being deleted or is the parent of deleted nodes
        const shouldClose = deletedNodeIds.includes(inferenceChatNode.id) || 
                           (parentId && inferenceChatNode.id === parentId);
        
        if (shouldClose) {
          setShowInferenceChat(false);
          setInferenceChatNode(null);
          window.dispatchEvent(new CustomEvent('mindmap-inference-close'));
        }
      }
    };

    window.addEventListener('mindmap-inference-open', handleInferenceOpen as EventListener);
    window.addEventListener('mindmap-inference-close', handleInferenceClose as EventListener);
    window.addEventListener('mindmap-inference-get-active', handleGetActiveState as EventListener);
    window.addEventListener('mindmap-node-notes-updated', handleNodeNotesUpdated as EventListener);
    window.addEventListener('mindmap-node-update-finished', handleNodeLabelUpdated as EventListener);
    window.addEventListener('mindmap-inference-check-and-close', handleInferenceCheckAndClose as EventListener);

    return () => {
      window.removeEventListener('mindmap-inference-open', handleInferenceOpen as EventListener);
      window.removeEventListener('mindmap-inference-close', handleInferenceClose as EventListener);
      window.removeEventListener('mindmap-inference-get-active', handleGetActiveState as EventListener);
      window.removeEventListener('mindmap-node-notes-updated', handleNodeNotesUpdated as EventListener);
      window.removeEventListener('mindmap-node-update-finished', handleNodeLabelUpdated as EventListener);
      window.removeEventListener('mindmap-inference-check-and-close', handleInferenceCheckAndClose as EventListener);
    };
  }, [inferenceChatNode]);

  const handleCloseInferenceChat = () => {
    setShowInferenceChat(false);
    setInferenceChatNode(null);
    // Also dispatch close event to sync with MindMap component
    window.dispatchEvent(new CustomEvent('mindmap-inference-close'));
    
    // Broadcast that no node is active
    window.dispatchEvent(new CustomEvent('mindmap-inference-active', {
      detail: { activeNodeId: null }
    }));
  };

  const handleThreadAssociate = (nodeId: string, threadId: string) => {
    // Update the mindmap node with the chatId
    onThreadAssociate(nodeId, threadId);
    
    // Update local state to reflect the new chatId
    if (inferenceChatNode && inferenceChatNode.id === nodeId) {
      setInferenceChatNode({
        ...inferenceChatNode,
        chatId: threadId
      });
    }
  };

  const handleThreadUnassign = (nodeId: string) => {
    // Update the mindmap node to remove the chatId
    onThreadUnassign(nodeId);
    
    // Update local state to reflect the removed chatId
    if (inferenceChatNode && inferenceChatNode.id === nodeId) {
      setInferenceChatNode({
        ...inferenceChatNode,
        chatId: null
      });
    }
  };

  // Create wrapper functions for thread-specific operations
  const handleDeleteMessage = (messageId: string) => {
    if (onDeleteMessage && inferenceChatNode?.chatId) {
      onDeleteMessage(inferenceChatNode.chatId, messageId);
    }
  };

  const handleMessagesUpdate = (messages: ConversationMessage[]) => {
    if (onMessagesUpdate && inferenceChatNode?.chatId) {
      onMessagesUpdate(inferenceChatNode.chatId, messages);
    }
  };
  return (
    <ListPanel
      items={mindMaps}
      activeItemId={activeMindMapId}
      onItemSelect={onMindMapSelect}
      onItemCreate={onMindMapCreate}
      onItemRename={onMindMapRename}
      onItemDelete={onMindMapDelete}
      emptyState={{
        icon: Network,
        title: "No MindMaps yet",
        subtitle: "Create a new MindMap to begin"
      }}
      createButtonTitle="New MindMap"
      renameButtonTitle="Rename MindMap"
      deleteButtonTitle="Delete MindMap"
      testId="mindmaps-slider"
      showChildComponent={showInferenceChat}
      showChildComponentHeader={false}
      childComponent={
        inferenceChatNode ? (
          <MindMapChatIntegration
            nodeId={inferenceChatNode.id}
            nodeLabel={inferenceChatNode.label}
            chatId={inferenceChatNode.chatId}
            nodeNotes={inferenceChatNode.notes}
            focusNotes={inferenceChatNode.focusNotes}
            threads={threads}
            onThreadAssociate={handleThreadAssociate}
            onThreadUnassign={handleThreadUnassign}
            onClose={handleCloseInferenceChat}
            onNavigateToChat={onNavigateToChat}
            onDeleteMessage={handleDeleteMessage}
            onMessagesUpdate={handleMessagesUpdate}
            onFirstMessage={onFirstMessage}
            onRoleUpdate={onRoleUpdate}
            onThreadCreate={onThreadCreate}
            onThreadRename={onThreadRename}
            onThreadDelete={onThreadDelete}
            onNotesUpdate={async (nodeId, notes) => {
              if (onNodeNotesUpdate) {
                await onNodeNotesUpdate(nodeId, notes);
              }
            }}
          />
        ) : null
      }
    />
  );
}
