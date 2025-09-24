import { useState, useCallback, useRef } from 'react';
import {
  useReactFlow,
  type NodeDragHandler,
  type XYPosition,
  type Node,
} from 'reactflow';
import type { MindMapNodeData } from '../types/mindMap';
import { NODE_SIZING } from '../constants/nodeSizing';

interface UseMindMapDragProps {
  nodes: Node<MindMapNodeData>[];
  rootNodeId: string;
  layout: 'LR' | 'RL' | 'TB' | 'BT' | 'RD';
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
  const { screenToFlowPosition } = useReactFlow();

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

      // Get node dimensions - use actual height/width or defaults
      const nodeHeight =
        targetNode.data.height || NODE_SIZING.DEFAULT_NODE_HEIGHT;
      const nodeWidth = targetNode.data.width || NODE_SIZING.DEFAULT_NODE_WIDTH;

      // Calculate threshold as a percentage of node dimension
      // This creates three equal zones for determining drop position
      const ZONE_PERCENTAGE = NODE_SIZING.ZONE_PERCENTAGE;

      let offset: number;
      let nodeSize: number;

      switch (layout) {
        case 'LR':
        case 'RL':
        case 'RD':
          // Horizontal layouts: check vertical position for above/below
          offset = dragPosition.y - targetNode.position.y;
          nodeSize = nodeHeight;
          break;
        case 'TB':
        case 'BT':
          // Vertical layouts: check horizontal position
          // Note: 'above' means left, 'below' means right for TB/BT
          offset = dragPosition.x - targetNode.position.x;
          nodeSize = nodeWidth;
          break;
        default:
          offset = dragPosition.y - targetNode.position.y;
          nodeSize = nodeHeight;
      }

      const threshold = nodeSize * ZONE_PERCENTAGE;

      // For TB/BT: first third = left (mapped to 'above')
      //            last third = right (mapped to 'below')
      //            middle third = over
      if (offset < threshold) {
        return 'above';
      }
      if (offset > nodeSize - threshold) {
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

      // Find all sibling nodes (excluding the node being moved)
      const siblingNodes = nodes.filter(
        n => n.data.parentId === parentNodeId && n.id !== nodeId
      );

      // Sort siblings by their current array position to maintain order
      siblingNodes.sort((a, b) => {
        const indexA = nodes.findIndex(n => n.id === a.id);
        const indexB = nodes.findIndex(n => n.id === b.id);
        return indexA - indexB;
      });

      // Find the target node's position among siblings
      const targetSiblingIndex = siblingNodes.findIndex(
        n => n.id === targetNodeId
      );
      if (targetSiblingIndex === -1) {
        return;
      }

      // Calculate the desired position in the siblings array
      // For LR/RL: 'above' means before in array, 'below' means after
      // For TB/BT: 'above' means left (before), 'below' means right (after)
      let desiredSiblingPosition = targetSiblingIndex;
      if (position === 'below') {
        desiredSiblingPosition = targetSiblingIndex + 1;
      }

      // Find the global index where we should insert
      let insertIndex: number;
      if (desiredSiblingPosition === 0) {
        // Insert before the first sibling
        insertIndex = nodes.findIndex(n => n.id === siblingNodes[0].id);
      } else if (desiredSiblingPosition >= siblingNodes.length) {
        // Insert after the last sibling
        const lastSibling = siblingNodes[siblingNodes.length - 1];
        insertIndex = nodes.findIndex(n => n.id === lastSibling.id) + 1;
      } else {
        // Insert before the sibling at the desired position
        const siblingAtPosition = siblingNodes[desiredSiblingPosition];
        insertIndex = nodes.findIndex(n => n.id === siblingAtPosition.id);
      }

      // Adjust insert index if the dragged node is currently before the insert position
      // This is necessary because moveNode will remove the node first, then insert it
      const draggedNodeIndex = nodes.findIndex(n => n.id === nodeId);
      if (draggedNodeIndex !== -1 && draggedNodeIndex < insertIndex) {
        insertIndex -= 1;
      }

      moveNode(nodeId, parentNodeId, insertIndex);
    },
    [nodes, moveNode]
  );

  // Main drag handler
  const handleNodeDrag = useCallback(
    (
      nodeId: string,
      closestNodeId: string,
      dragPosition: 'above' | 'below' | 'over'
    ) => {
      if (nodeId === rootNodeId) {
        return;
      }

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
    [rootNodeId, nodes, handleSiblingPositioning, wouldCreateCycle, moveNode]
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

      // Track cursor position and convert to flow coordinates
      let cursorFlowPosition: XYPosition | null = null;
      if (event && 'clientX' in event && 'clientY' in event) {
        setDragCursorPosition({
          x: event.clientX,
          y: event.clientY,
        });

        // Convert screen coordinates to flow coordinates
        cursorFlowPosition = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
      }

      // Check if dragged significantly
      const distance = Math.sqrt(
        Math.pow(node.position.x - dragStartPosition.x, 2) +
          Math.pow(node.position.y - dragStartPosition.y, 2)
      );

      if (distance > NODE_SIZING.MIN_DRAG_DISTANCE) {
        if (!hasDraggedSignificantly) {
          setHasDraggedSignificantly(true);
        }

        // Throttle updates more aggressively to reduce flicker
        const now = Date.now();
        if (now - lastDragUpdate.current < NODE_SIZING.DRAG_UPDATE_THROTTLE) {
          return;
        }
        lastDragUpdate.current = now;

        // Use cursor position if available, otherwise fall back to node position
        const positionForDetection = cursorFlowPosition || node.position;

        const closestNodeId = findClosestNode(positionForDetection, node.id);

        if (closestNodeId && !wouldCreateCycle(node.id, closestNodeId)) {
          const position = getDropPosition(positionForDetection, closestNodeId);

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
        dropPosition &&
        closestDropTarget
      ) {
        handleNodeDrag(node.id, closestDropTarget, dropPosition);
      }

      // Clear drag state
      setDraggedNodeId(null);
      setClosestDropTarget(null);
      setDropPosition(null);
      setDragStartPosition(null);
      setHasDraggedSignificantly(false);
      setDragCursorPosition(null);
    },
    [
      handleNodeDrag,
      hasDraggedSignificantly,
      draggedNodeId,
      dropPosition,
      closestDropTarget,
    ]
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
