import { useState, useCallback, useRef } from 'react';
import type { NodeDragHandler, XYPosition, Node } from 'reactflow';
import type { MindMapNodeData } from '../types/mindMap';

interface UseMindMapDragProps {
  nodes: Node<MindMapNodeData>[];
  rootNodeId: string;
  layout: 'LR' | 'RL' | 'TB' | 'BT';
  moveNode: (nodeId: string, newParentId: string, insertIndex?: number) => void;
}

export function useMindMapDrag({
  nodes,
  rootNodeId,
  layout,
  moveNode,
}: UseMindMapDragProps) {
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [closestDropTarget, setClosestDropTarget] = useState<string | null>(
    null
  );
  const [dropPosition, setDropPosition] = useState<
    'above' | 'below' | 'over' | null
  >(null);
  const [dragStartPosition, setDragStartPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [hasDraggedSignificantly, setHasDraggedSignificantly] = useState(false);
  const [dragCursorPosition, setDragCursorPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const lastDragUpdate = useRef<number>(0);

  // Find closest node to position
  const findClosestNode = useCallback(
    (position: XYPosition, excludeNodeId: string): string | null => {
      let closestNode: string | null = null;
      let closestDistance = Infinity;

      for (const node of nodes) {
        if (node.id === excludeNodeId) {
          continue;
        }

        const distance = Math.sqrt(
          Math.pow(node.position.x - position.x, 2) +
            Math.pow(node.position.y - position.y, 2)
        );

        if (distance < closestDistance) {
          closestDistance = distance;
          closestNode = node.id;
        }
      }

      return closestNode;
    },
    [nodes]
  );

  // Determine drop position relative to target
  const getDropPosition = useCallback(
    (
      dragPosition: XYPosition,
      targetNodeId: string
    ): 'above' | 'below' | 'over' => {
      const targetNode = nodes.find(n => n.id === targetNodeId);
      if (!targetNode) {
        return 'over';
      }

      // Root node only accepts children
      if (targetNodeId === rootNodeId) {
        return 'over';
      }

      const THRESHOLD = 30;

      let offset: number;
      switch (layout) {
        case 'LR':
        case 'RL':
          offset = dragPosition.y - targetNode.position.y;
          break;
        case 'TB':
        case 'BT':
          offset = dragPosition.x - targetNode.position.x;
          break;
        default:
          offset = dragPosition.y - targetNode.position.y;
      }

      if (offset < -THRESHOLD) {
        return 'above';
      }
      if (offset > THRESHOLD) {
        return 'below';
      }
      return 'over';
    },
    [nodes, rootNodeId, layout]
  );

  // Check if move would create cycle
  const wouldCreateCycle = useCallback(
    (nodeId: string, parentId: string): boolean => {
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

      const descendants = findDescendants(nodeId);
      return descendants.includes(parentId);
    },
    [nodes]
  );

  // Handle sibling positioning
  const handleSiblingPositioning = useCallback(
    (nodeId: string, targetNodeId: string, position: 'above' | 'below') => {
      const targetNode = nodes.find(n => n.id === targetNodeId);
      if (!targetNode?.data.parentId) {
        return;
      }

      const parentNodeId = targetNode.data.parentId;
      const targetIndex = nodes.findIndex(n => n.id === targetNodeId);
      const insertIndex = position === 'above' ? targetIndex : targetIndex + 1;

      moveNode(nodeId, parentNodeId, insertIndex);
    },
    [nodes, moveNode]
  );

  // Main drag handler
  const handleNodeDrag = useCallback(
    (
      nodeId: string,
      newPosition: XYPosition,
      dragPosition: 'above' | 'below' | 'over'
    ) => {
      if (nodeId === rootNodeId) {
        return;
      }

      const closestNodeId = findClosestNode(newPosition, nodeId);
      if (!closestNodeId || closestNodeId === nodeId) {
        return;
      }

      // Handle sibling positioning
      if (dragPosition === 'above' || dragPosition === 'below') {
        const targetNode = nodes.find(n => n.id === closestNodeId);
        if (targetNode?.data.parentId) {
          handleSiblingPositioning(nodeId, closestNodeId, dragPosition);
          return;
        }
      }

      // Handle child positioning
      if (wouldCreateCycle(nodeId, closestNodeId)) {
        return;
      }

      const draggedNode = nodes.find(n => n.id === nodeId);
      if (draggedNode && draggedNode.data.parentId === closestNodeId) {
        return;
      }

      moveNode(nodeId, closestNodeId);
    },
    [
      rootNodeId,
      nodes,
      findClosestNode,
      handleSiblingPositioning,
      wouldCreateCycle,
      moveNode,
    ]
  );

  // Drag start handler
  const onNodeDragStart: NodeDragHandler = useCallback(
    (_, node) => {
      if (node.id === rootNodeId) {
        return;
      }

      setDraggedNodeId(node.id);
      setDragStartPosition({ x: node.position.x, y: node.position.y });
      setHasDraggedSignificantly(false);
    },
    [rootNodeId]
  );

  // Drag handler
  const onNodeDrag: NodeDragHandler = useCallback(
    (event, node) => {
      if (
        node.id === rootNodeId ||
        node.id !== draggedNodeId ||
        !dragStartPosition
      ) {
        return;
      }

      // Track cursor position
      if (event && 'clientX' in event && 'clientY' in event) {
        setDragCursorPosition({
          x: event.clientX,
          y: event.clientY,
        });
      }

      // Check if dragged significantly
      const distance = Math.sqrt(
        Math.pow(node.position.x - dragStartPosition.x, 2) +
          Math.pow(node.position.y - dragStartPosition.y, 2)
      );

      if (distance > 20) {
        if (!hasDraggedSignificantly) {
          setHasDraggedSignificantly(true);
        }

        // Throttle updates more aggressively to reduce flicker
        const now = Date.now();
        if (now - lastDragUpdate.current < 50) {
          return;
        }
        lastDragUpdate.current = now;

        const closestNodeId = findClosestNode(node.position, node.id);

        if (closestNodeId && !wouldCreateCycle(node.id, closestNodeId)) {
          const position = getDropPosition(node.position, closestNodeId);

          if (
            closestNodeId !== closestDropTarget ||
            position !== dropPosition
          ) {
            setClosestDropTarget(closestNodeId);
            setDropPosition(position);
          }
        } else {
          if (closestDropTarget !== null || dropPosition !== null) {
            setClosestDropTarget(null);
            setDropPosition(null);
          }
        }
      }
    },
    [
      rootNodeId,
      draggedNodeId,
      dragStartPosition,
      hasDraggedSignificantly,
      closestDropTarget,
      dropPosition,
      findClosestNode,
      wouldCreateCycle,
      getDropPosition,
    ]
  );

  // Drag stop handler
  const onNodeDragStop: NodeDragHandler = useCallback(
    (_, node) => {
      if (
        hasDraggedSignificantly &&
        draggedNodeId === node.id &&
        dropPosition
      ) {
        handleNodeDrag(node.id, node.position, dropPosition);
      }

      // Clear drag state
      setDraggedNodeId(null);
      setClosestDropTarget(null);
      setDropPosition(null);
      setDragStartPosition(null);
      setHasDraggedSignificantly(false);
      setDragCursorPosition(null);
    },
    [handleNodeDrag, hasDraggedSignificantly, draggedNodeId, dropPosition]
  );

  return {
    // State
    draggedNodeId,
    closestDropTarget,
    dropPosition,
    hasDraggedSignificantly,
    dragCursorPosition,

    // Handlers
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,

    // Utilities
    findClosestNode,
    getDropPosition,
    wouldCreateCycle,
  };
}
