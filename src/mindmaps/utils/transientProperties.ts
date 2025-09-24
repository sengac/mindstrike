import type { Node } from 'reactflow';
import type { MindMapNodeData } from '../types/mindMap';

/**
 * Properties in MindMapNodeData that are transient UI state
 * and should not be persisted in history or storage
 */
export const TRANSIENT_NODE_DATA_PROPERTIES = [
  'isEditing',
  'isDragging',
  'isDropTarget',
  'dropPosition',
  // Note: width/height are kept as they're needed for layout calculations
  // hasChildren is kept as it's used for collapse/expand state
] as const;

/**
 * Properties in ReactFlow Node that are transient UI state
 */
export const TRANSIENT_REACTFLOW_NODE_PROPERTIES = [
  'selected',
  'dragging',
] as const;

export type TransientNodeDataProperty =
  (typeof TRANSIENT_NODE_DATA_PROPERTIES)[number];
export type TransientReactFlowProperty =
  (typeof TRANSIENT_REACTFLOW_NODE_PROPERTIES)[number];

/**
 * Type for node data without transient properties
 */
export type PersistentMindMapNodeData = Omit<
  MindMapNodeData,
  TransientNodeDataProperty
>;

/**
 * Type for ReactFlow node without transient properties
 */
export type PersistentNode = Omit<
  Node<MindMapNodeData>,
  TransientReactFlowProperty
> & {
  data: PersistentMindMapNodeData;
  selected?: false;
  dragging?: false;
};

/**
 * Removes transient properties from a single node's data
 */
export function cleanNodeData(
  data: MindMapNodeData
): PersistentMindMapNodeData {
  const cleaned = { ...data };

  TRANSIENT_NODE_DATA_PROPERTIES.forEach(prop => {
    delete cleaned[prop];
  });

  return cleaned;
}

/**
 * Removes all transient properties from a ReactFlow node
 */
export function cleanNode(node: Node<MindMapNodeData>): PersistentNode {
  return {
    ...node,
    data: cleanNodeData(node.data),
    selected: false,
    dragging: false,
  };
}

/**
 * Removes transient properties from an array of nodes
 */
export function cleanNodes(nodes: Node<MindMapNodeData>[]): PersistentNode[] {
  return nodes.map(cleanNode);
}

/**
 * Extracts transient state from a node
 */
export function extractTransientState(node: Node<MindMapNodeData>) {
  return {
    isEditing: node.data.isEditing,
    isDragging: node.data.isDragging,
    isDropTarget: node.data.isDropTarget,
    dropPosition: node.data.dropPosition,
    selected: node.selected,
    dragging: node.dragging,
  };
}

/**
 * Merges transient state back into a node
 */
export function mergeTransientState(
  node: Node<MindMapNodeData>,
  transientState: ReturnType<typeof extractTransientState>
): Node<MindMapNodeData> {
  return {
    ...node,
    data: {
      ...node.data,
      isEditing: transientState.isEditing,
      isDragging: transientState.isDragging,
      isDropTarget: transientState.isDropTarget,
      dropPosition: transientState.dropPosition,
    },
    selected: transientState.selected,
    dragging: transientState.dragging,
  };
}
