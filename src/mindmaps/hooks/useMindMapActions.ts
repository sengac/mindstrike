import { useCallback } from 'react';
import { Node, Edge } from 'reactflow';
import { MindMapNodeData } from '../types/mindMap';
import { MindMapData } from './useMindMapData';

interface UseMindMapActionsProps {
  nodes: Node<MindMapNodeData>[];
  rootNodeId: string;
  layout: 'LR' | 'RL' | 'TB' | 'BT';
  setNodes: (nodes: Node<MindMapNodeData>[]) => void;
  setEdges: (edges: Edge[]) => void;
  setSelectedNodeId: (id: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  generateEdges: (
    nodes: Node<MindMapNodeData>[],
    layout: 'LR' | 'RL' | 'TB' | 'BT'
  ) => Edge[];
  arrangeNodes: (
    nodes: Node<MindMapNodeData>[],
    edges: Edge[],
    rootId: string,
    layout?: 'LR' | 'RL' | 'TB' | 'BT'
  ) => Node<MindMapNodeData>[];
  updateNodeLevels: (
    nodes: Node<MindMapNodeData>[],
    edges: Edge[],
    rootId: string,
    layout: 'LR' | 'RL' | 'TB' | 'BT'
  ) => Node<MindMapNodeData>[];
  saveToHistory: (
    nodes: Node<MindMapNodeData>[],
    rootId: string,
    layout?: 'LR' | 'RL' | 'TB' | 'BT'
  ) => void;
  convertNodesToTree: (
    nodes: Node<MindMapNodeData>[],
    rootId: string,
    layout: 'LR' | 'RL' | 'TB' | 'BT'
  ) => MindMapData;
  onSave?: (data: MindMapData) => void;
  onLayoutComplete?: () => void;
}

export function useMindMapActions({
  nodes,
  rootNodeId,
  layout,
  setNodes,
  setEdges,
  setSelectedNodeId,
  setIsLoading,
  generateEdges,
  arrangeNodes,
  updateNodeLevels,
  saveToHistory,
  convertNodesToTree,
  onSave,
  onLayoutComplete,
}: UseMindMapActionsProps) {
  // Helper to apply layout and save
  const applyLayoutAndSave = useCallback(
    async (newNodes: Node<MindMapNodeData>[], skipSave = false) => {
      const generatedEdges = generateEdges(newNodes, layout);
      const arrangedNodes = arrangeNodes(newNodes, generatedEdges, rootNodeId);
      const finalNodes = updateNodeLevels(
        arrangedNodes,
        generatedEdges,
        rootNodeId,
        layout
      );

      setNodes(finalNodes);
      setEdges(generatedEdges);
      saveToHistory(finalNodes, rootNodeId);

      // Wait for React Flow to process the layout
      await new Promise(resolve => setTimeout(resolve, 50));

      // Trigger layout complete callback
      if (onLayoutComplete) {
        onLayoutComplete();
      }

      if (!skipSave && onSave) {
        setTimeout(() => {
          const treeData = convertNodesToTree(finalNodes, rootNodeId, layout);
          onSave(treeData);
        }, 100);
      }

      return finalNodes;
    },
    [
      generateEdges,
      arrangeNodes,
      updateNodeLevels,
      setNodes,
      setEdges,
      saveToHistory,
      convertNodesToTree,
      onSave,
      onLayoutComplete,
      layout,
      rootNodeId,
      setIsLoading,
    ]
  );

  // Add a child node
  const addChildNode = useCallback(
    async (parentNodeId: string) => {
      const parentNode = nodes.find(n => n.id === parentNodeId);
      if (!parentNode) return;

      const newNodeId = `node-${Date.now()}`;
      const newNode: Node<MindMapNodeData> = {
        id: newNodeId,
        type: 'mindMapNode',
        position: {
          x: parentNode.position.x + 200,
          y: parentNode.position.y + 100,
        },
        data: {
          id: newNodeId,
          label: 'New Idea',
          isRoot: false,
          parentId: parentNodeId,
          isEditing: true,
          level: (parentNode.data.level || 0) + 1,
        },
      };

      const newNodes = [...nodes, newNode];
      await applyLayoutAndSave(newNodes);

      // Select the new node after layout is complete
      setSelectedNodeId(newNodeId);
    },
    [nodes, applyLayoutAndSave, setNodes, setSelectedNodeId]
  );

  // Add a sibling node
  const addSiblingNode = useCallback(
    async (siblingNodeId: string) => {
      const siblingNode = nodes.find(n => n.id === siblingNodeId);
      if (!siblingNode || !siblingNode.data.parentId) return;

      const parentNodeId = siblingNode.data.parentId;
      const newNodeId = `node-${Date.now()}`;
      const newNode: Node<MindMapNodeData> = {
        id: newNodeId,
        type: 'mindMapNode',
        position: {
          x: siblingNode.position.x + 150,
          y: siblingNode.position.y + 100,
        },
        data: {
          id: newNodeId,
          label: 'New Idea',
          isRoot: false,
          parentId: parentNodeId,
          isEditing: true,
          level: siblingNode.data.level || 0,
        },
      };

      // Insert after the sibling
      const siblingIndex = nodes.findIndex(n => n.id === siblingNodeId);
      const newNodes = [
        ...nodes.slice(0, siblingIndex + 1),
        newNode,
        ...nodes.slice(siblingIndex + 1),
      ];

      await applyLayoutAndSave(newNodes);

      // Select the new node after layout is complete
      setSelectedNodeId(newNodeId);
    },
    [nodes, applyLayoutAndSave, setNodes, setSelectedNodeId]
  );

  // Delete a node and its children
  const deleteNode = useCallback(
    async (nodeIdToDelete: string) => {
      if (nodeIdToDelete === rootNodeId) return; // Can't delete root

      const nodeToDelete = nodes.find(n => n.id === nodeIdToDelete);
      if (!nodeToDelete) return;

      // Find all descendants to delete
      const nodesToDelete = new Set([nodeIdToDelete]);
      const findDescendants = (nodeId: string) => {
        const children = nodes.filter(n => n.data.parentId === nodeId);
        children.forEach(child => {
          if (!nodesToDelete.has(child.id)) {
            nodesToDelete.add(child.id);
            findDescendants(child.id);
          }
        });
      };
      findDescendants(nodeIdToDelete);

      const newNodes = nodes.filter(node => !nodesToDelete.has(node.id));

      if (newNodes.length === 0 || !newNodes.find(n => n.id === rootNodeId)) {
        return;
      }

      await applyLayoutAndSave(newNodes);
      setSelectedNodeId(null);
    },
    [nodes, rootNodeId, applyLayoutAndSave, setSelectedNodeId]
  );

  // Update node label
  const updateNodeLabel = useCallback(
    (nodeId: string, newLabel: string) => {
      const updatedNodes = nodes.map(node =>
        node.id === nodeId
          ? {
              ...node,
              data: { ...node.data, label: newLabel, isEditing: false },
            }
          : node
      );
      setNodes(updatedNodes);
    },
    [nodes, setNodes]
  );

  // Toggle node collapse state
  const toggleNodeCollapse = useCallback(
    async (nodeId: string) => {
      const updatedNodes = nodes.map(node =>
        node.id === nodeId
          ? {
              ...node,
              data: { ...node.data, isCollapsed: !node.data.isCollapsed },
            }
          : node
      );

      await applyLayoutAndSave(updatedNodes);
    },
    [nodes, applyLayoutAndSave]
  );

  // Move node to new parent
  const moveNode = useCallback(
    async (nodeId: string, newParentId: string, insertIndex?: number) => {
      if (nodeId === rootNodeId) return;

      // Prevent cycles
      const wouldCreateCycle = (
        checkNodeId: string,
        checkParentId: string
      ): boolean => {
        const findDescendants = (currentNodeId: string): string[] => {
          const descendants: string[] = [];
          const childNodes = nodes.filter(
            node => node.data.parentId === currentNodeId
          );

          for (const childNode of childNodes) {
            descendants.push(childNode.id);
            descendants.push(...findDescendants(childNode.id));
          }
          return descendants;
        };

        const descendants = findDescendants(checkNodeId);
        return descendants.includes(checkParentId);
      };

      if (wouldCreateCycle(nodeId, newParentId)) return;

      // Update parent relationship
      let updatedNodes = nodes.map(node =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, parentId: newParentId } }
          : node
      );

      // Reorder if insert index is specified
      if (insertIndex !== undefined) {
        const nodeToMove = updatedNodes.find(n => n.id === nodeId);
        if (nodeToMove) {
          updatedNodes = updatedNodes.filter(n => n.id !== nodeId);
          updatedNodes.splice(insertIndex, 0, nodeToMove);
        }
      }

      await applyLayoutAndSave(updatedNodes);
    },
    [nodes, rootNodeId, applyLayoutAndSave]
  );

  // Change layout direction
  const changeLayout = useCallback(
    async (newLayout: 'LR' | 'RL' | 'TB' | 'BT') => {
      const generatedEdges = generateEdges(nodes, newLayout);
      const arrangedNodes = arrangeNodes(
        nodes,
        generatedEdges,
        rootNodeId,
        newLayout
      );
      const finalNodes = updateNodeLevels(
        arrangedNodes,
        generatedEdges,
        rootNodeId,
        newLayout
      );

      setNodes(finalNodes);
      setEdges(generatedEdges);
      saveToHistory(finalNodes, rootNodeId, newLayout);

      // Wait for React Flow to process the layout
      await new Promise(resolve => setTimeout(resolve, 50));

      // Trigger layout complete callback
      if (onLayoutComplete) {
        onLayoutComplete();
      }

      if (onSave) {
        setTimeout(() => {
          const treeData = convertNodesToTree(
            finalNodes,
            rootNodeId,
            newLayout
          );
          onSave(treeData);
        }, 100);
      }
    },
    [
      nodes,
      rootNodeId,
      generateEdges,
      arrangeNodes,
      updateNodeLevels,
      setNodes,
      setEdges,
      saveToHistory,
      convertNodesToTree,
      onSave,
      onLayoutComplete,
      setIsLoading,
    ]
  );

  // Update node chatId
  const updateNodeChatId = useCallback(
    (nodeId: string, chatId: string | null) => {
      const updatedNodes = nodes.map(node =>
        node.id === nodeId
          ? {
              ...node,
              data: { ...node.data, chatId },
            }
          : node
      );
      setNodes(updatedNodes);
    },
    [nodes, setNodes]
  );

  return {
    addChildNode,
    addSiblingNode,
    deleteNode,
    updateNodeLabel,
    toggleNodeCollapse,
    moveNode,
    changeLayout,
    updateNodeChatId,
  };
}
