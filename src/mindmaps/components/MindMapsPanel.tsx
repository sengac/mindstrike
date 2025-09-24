import { useState, useEffect } from 'react';
import { Network } from 'lucide-react';
import type { MindMap } from '../hooks/useMindMaps';
import type { ConversationMessage } from '../../types';
import type { ThreadMetadata } from '../../store/useThreadsStore';
import { ListPanel } from '../../components/shared/ListPanel';
import { MindMapChatIntegration } from './MindMapChatIntegration';
import type { Source } from '../types/mindMap';

interface MindMapsPanelProps {
  mindMaps: MindMap[];
  activeMindMapId?: string;
  onMindMapSelect: (mindMapId: string) => void;
  onMindMapCreate: () => void;
  onMindMapRename: (mindMapId: string, newName: string) => void;
  onMindMapDelete: (mindMapId: string) => void;
  // Thread-related props
  threads: ThreadMetadata[];
  onThreadAssociate: (nodeId: string, threadId: string) => void;
  onThreadUnassign: (nodeId: string) => void;
  onThreadCreate?: () => void;
  onThreadRename?: (threadId: string, newName: string) => void;
  onThreadDelete?: (threadId: string) => void;
  onNavigateToChat?: (threadId?: string) => void;
  onDeleteMessage?: (threadId: string, messageId: string) => void;
  onMessagesUpdate?: (
    threadId: string,
    messages: ConversationMessage[]
  ) => void;
  onFirstMessage?: () => void;
  onPromptUpdate?: (threadId: string, customPrompt?: string) => void;
  onCustomizePrompts?: () => void;
  onNodeNotesUpdate?: (nodeId: string, notes: string) => Promise<void>;
  onNodeSourcesUpdate?: (nodeId: string, sources: Source[]) => Promise<void>;
  // MindMap node operations
  onNodeAdd?: (parentId: string, text: string) => Promise<void>;
  onNodeUpdate?: (nodeId: string, text: string) => Promise<void>;
  onNodeDelete?: (nodeId: string) => Promise<void>;
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
  onPromptUpdate,
  onCustomizePrompts,
  onNodeNotesUpdate,
  onNodeSourcesUpdate,
  onNodeAdd,
  onNodeUpdate,
  onNodeDelete,
}: MindMapsPanelProps) {
  const [showInferenceChat, setShowInferenceChat] = useState(false);
  const [inferenceChatNode, setInferenceChatNode] = useState<{
    id: string;
    label: string;
    chatId?: string | null;
    notes?: string | null;
    sources?: Source[];
    focusChat?: boolean;
    focusNotes?: boolean;
    focusSources?: boolean;
  } | null>(null);

  // Listen for mindmap inference events
  useEffect(() => {
    const handleInferenceOpen = (event: Event) => {
      const customEvent = event as CustomEvent;
      const {
        nodeId,
        label,
        chatId,
        notes,
        sources,
        focusChat,
        focusNotes,
        focusSources,
      } = customEvent.detail;
      setInferenceChatNode({
        id: nodeId,
        label,
        chatId,
        notes,
        sources,
        focusChat,
        focusNotes,
        focusSources,
      });
      setShowInferenceChat(true);

      // Broadcast the active inference node ID for UI updates
      window.dispatchEvent(
        new CustomEvent('mindmap-inference-active', {
          detail: { activeNodeId: nodeId },
        })
      );
    };

    const handleInferenceClose = () => {
      setShowInferenceChat(false);
      setInferenceChatNode(null);

      // Broadcast that no node is active
      window.dispatchEvent(
        new CustomEvent('mindmap-inference-active', {
          detail: { activeNodeId: null },
        })
      );
    };

    const handleGetActiveState = (event: Event) => {
      // Log the event type for debugging purposes
      console.debug('Received get-active-state event:', event.type);

      setInferenceChatNode(currentNode => {
        const currentActiveNodeId = currentNode?.id || null;

        // Respond with current active state for the requesting node
        window.dispatchEvent(
          new CustomEvent('mindmap-inference-active', {
            detail: { activeNodeId: currentActiveNodeId },
          })
        );

        return currentNode; // Return unchanged state
      });
    };

    const handleNodeNotesUpdated = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { nodeId, notes } = customEvent.detail;

      // Update the inferenceChatNode if it's the same node
      setInferenceChatNode(prevNode => {
        if (prevNode && prevNode.id === nodeId) {
          return {
            ...prevNode,
            notes,
          };
        }
        return prevNode;
      });
    };

    const handleNodeSourcesUpdated = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { nodeId, sources } = customEvent.detail;

      // Update the inferenceChatNode if it's the same node
      setInferenceChatNode(prevNode => {
        if (prevNode && prevNode.id === nodeId) {
          return {
            ...prevNode,
            sources,
          };
        }
        return prevNode;
      });
    };

    const handleNodeLabelUpdated = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { nodeId, label } = customEvent.detail;

      // Update the inferenceChatNode label if it's the same node
      setInferenceChatNode(prevNode => {
        if (prevNode && prevNode.id === nodeId) {
          return {
            ...prevNode,
            label,
          };
        }
        return prevNode;
      });
    };

    const handleInferenceCheckAndClose = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { deletedNodeIds, parentId } = customEvent.detail;

      setInferenceChatNode(prevNode => {
        if (prevNode) {
          // Check if the active inference node is being deleted or is the parent of deleted nodes
          const shouldClose =
            deletedNodeIds.includes(prevNode.id) ||
            (parentId && prevNode.id === parentId);

          if (shouldClose) {
            setShowInferenceChat(false);
            window.dispatchEvent(new CustomEvent('mindmap-inference-close'));
            return null;
          }
        }
        return prevNode;
      });
    };

    window.addEventListener('mindmap-inference-open', handleInferenceOpen);
    window.addEventListener('mindmap-inference-close', handleInferenceClose);
    window.addEventListener(
      'mindmap-inference-get-active',
      handleGetActiveState
    );
    window.addEventListener(
      'mindmap-node-notes-updated',
      handleNodeNotesUpdated
    );
    window.addEventListener(
      'mindmap-node-sources-updated',
      handleNodeSourcesUpdated
    );
    window.addEventListener(
      'mindmap-node-update-finished',
      handleNodeLabelUpdated
    );
    window.addEventListener(
      'mindmap-inference-check-and-close',
      handleInferenceCheckAndClose
    );

    return () => {
      window.removeEventListener('mindmap-inference-open', handleInferenceOpen);
      window.removeEventListener(
        'mindmap-inference-close',
        handleInferenceClose
      );
      window.removeEventListener(
        'mindmap-inference-get-active',
        handleGetActiveState
      );
      window.removeEventListener(
        'mindmap-node-notes-updated',
        handleNodeNotesUpdated
      );
      window.removeEventListener(
        'mindmap-node-sources-updated',
        handleNodeSourcesUpdated
      );
      window.removeEventListener(
        'mindmap-node-update-finished',
        handleNodeLabelUpdated
      );
      window.removeEventListener(
        'mindmap-inference-check-and-close',
        handleInferenceCheckAndClose
      );
    };
  }, []); // Empty dependencies array to register listeners only once

  const handleCloseInferenceChat = () => {
    setShowInferenceChat(false);
    setInferenceChatNode(null);
    // Also dispatch close event to sync with MindMap component
    window.dispatchEvent(new CustomEvent('mindmap-inference-close'));

    // Broadcast that no node is active
    window.dispatchEvent(
      new CustomEvent('mindmap-inference-active', {
        detail: { activeNodeId: null },
      })
    );
  };

  const handleThreadAssociate = (nodeId: string, threadId: string) => {
    // Update the mindmap node with the chatId
    onThreadAssociate(nodeId, threadId);

    // Update local state to reflect the new chatId
    if (inferenceChatNode && inferenceChatNode.id === nodeId) {
      setInferenceChatNode({
        ...inferenceChatNode,
        chatId: threadId,
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
        chatId: null,
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

  // Navigation logic - using event system to get sibling nodes
  const handleNavigateToPrevNode = () => {
    if (!inferenceChatNode) {
      return;
    }

    // Dispatch event to request previous sibling
    window.dispatchEvent(
      new CustomEvent('mindmap-navigate-sibling', {
        detail: {
          currentNodeId: inferenceChatNode.id,
          direction: 'prev',
        },
      })
    );
  };

  const handleNavigateToNextNode = () => {
    if (!inferenceChatNode) {
      return;
    }

    // Dispatch event to request next sibling
    window.dispatchEvent(
      new CustomEvent('mindmap-navigate-sibling', {
        detail: {
          currentNodeId: inferenceChatNode.id,
          direction: 'next',
        },
      })
    );
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
        title: 'No MindMaps yet',
        subtitle: 'Create a new MindMap to begin',
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
            nodeSources={inferenceChatNode.sources}
            focusChat={inferenceChatNode.focusChat}
            focusNotes={inferenceChatNode.focusNotes}
            focusSources={inferenceChatNode.focusSources}
            threads={threads}
            onThreadAssociate={handleThreadAssociate}
            onThreadUnassign={handleThreadUnassign}
            onClose={handleCloseInferenceChat}
            onNavigateToChat={onNavigateToChat}
            onDeleteMessage={handleDeleteMessage}
            onMessagesUpdate={handleMessagesUpdate}
            onFirstMessage={onFirstMessage}
            onPromptUpdate={onPromptUpdate}
            onThreadCreate={onThreadCreate}
            onThreadRename={onThreadRename}
            onThreadDelete={onThreadDelete}
            onNotesUpdate={async (nodeId, notes) => {
              if (onNodeNotesUpdate) {
                await onNodeNotesUpdate(nodeId, notes);
              }
            }}
            onSourcesUpdate={async (nodeId, sources) => {
              if (onNodeSourcesUpdate) {
                await onNodeSourcesUpdate(nodeId, sources);
              }
            }}
            onNodeAdd={onNodeAdd}
            onNodeUpdate={onNodeUpdate}
            onNodeDelete={onNodeDelete}
            onNavigateToPrevNode={handleNavigateToPrevNode}
            onNavigateToNextNode={handleNavigateToNextNode}
            onCustomizePrompts={onCustomizePrompts}
          />
        ) : null
      }
    />
  );
}
