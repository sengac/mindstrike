import type { Node } from 'reactflow';
import type { MindMapNodeData } from '../types/mindMap';

/**
 * Calculator for Radial layout mode where direct children of the root
 * alternate between LR (left-to-right) and RL (right-to-left) positioning.
 */
export class RadialLayoutCalculator {
  /**
   * Determines if a child node should use LR or RL layout in radial mode
   * @param childIndex The index of the child among its siblings (0-based)
   * @returns 'LR' or 'RL' based on alternating pattern
   */
  static getChildDirection(childIndex: number): 'LR' | 'RL' {
    // Even indices (0, 2, 4...) get LR (right side)
    // Odd indices (1, 3, 5...) get RL (left side)
    return childIndex % 2 === 0 ? 'LR' : 'RL';
  }

  /**
   * Finds the path from a node to the root
   * @param nodeId The starting node
   * @param nodes All nodes in the mindmap
   * @param rootNodeId The root node ID
   * @returns Array of node IDs from the node to root (inclusive)
   */
  static getPathToRoot(
    nodeId: string,
    nodes: Node<MindMapNodeData>[],
    rootNodeId: string
  ): string[] {
    const path: string[] = [];
    let currentId = nodeId;

    while (currentId) {
      path.push(currentId);
      if (currentId === rootNodeId) {
        break;
      }

      const currentNode = nodes.find(n => n.id === currentId);
      if (!currentNode?.data.parentId) {
        break;
      }

      currentId = currentNode.data.parentId;
    }

    return path;
  }

  /**
   * Gets the direct children of a node
   * @param parentId The parent node ID
   * @param nodes All nodes in the mindmap
   * @returns Array of child nodes sorted by their current order
   */
  static getChildrenOfNode(
    parentId: string,
    nodes: Node<MindMapNodeData>[]
  ): Node<MindMapNodeData>[] {
    return nodes.filter(n => n.data.parentId === parentId);
  }

  /**
   * Calculates the effective layout for a node in radial mode
   * @param nodeId The node to calculate layout for
   * @param nodes All nodes in the mindmap
   * @param rootNodeId The root node ID
   * @returns The effective layout direction for the node
   */
  static getNodeEffectiveLayout(
    nodeId: string,
    nodes: Node<MindMapNodeData>[],
    rootNodeId: string
  ): 'LR' | 'RL' {
    // If this is the root node, return default
    if (nodeId === rootNodeId) {
      return 'LR';
    }

    // Find the path from this node to root
    const path = this.getPathToRoot(nodeId, nodes, rootNodeId);

    // The direct child of root determines the layout
    if (path.length >= 2) {
      // path[0] is the current node, path[length-1] is root
      // So path[length-2] is the direct child of root
      const directChildOfRoot = path[path.length - 2];
      const siblings = this.getChildrenOfNode(rootNodeId, nodes);
      const childIndex = siblings.findIndex(s => s.id === directChildOfRoot);

      if (childIndex !== -1) {
        return this.getChildDirection(childIndex);
      }
    }

    return 'LR'; // Default fallback
  }

  /**
   * Groups nodes by their effective layout in radial mode
   * @param nodes All nodes in the mindmap
   * @param rootNodeId The root node ID
   * @returns Nodes grouped by left (RL) and right (LR) positioning
   */
  static groupNodesByLayout(
    nodes: Node<MindMapNodeData>[],
    rootNodeId: string
  ): {
    leftNodes: Node<MindMapNodeData>[];
    rightNodes: Node<MindMapNodeData>[];
    rootNode: Node<MindMapNodeData> | undefined;
  } {
    const leftNodes: Node<MindMapNodeData>[] = [];
    const rightNodes: Node<MindMapNodeData>[] = [];
    let rootNode: Node<MindMapNodeData> | undefined;

    nodes.forEach(node => {
      if (node.id === rootNodeId) {
        rootNode = node;
        return;
      }

      const effectiveLayout = this.getNodeEffectiveLayout(
        node.id,
        nodes,
        rootNodeId
      );
      if (effectiveLayout === 'RL') {
        leftNodes.push(node);
      } else {
        rightNodes.push(node);
      }
    });

    return { leftNodes, rightNodes, rootNode };
  }

  /**
   * Determines if a node is a descendant of another node
   * @param nodeId The potential descendant
   * @param ancestorId The potential ancestor
   * @param nodes All nodes in the mindmap
   * @returns True if nodeId is a descendant of ancestorId
   */
  static isDescendantOf(
    nodeId: string,
    ancestorId: string,
    nodes: Node<MindMapNodeData>[]
  ): boolean {
    let currentId = nodeId;

    while (currentId) {
      const currentNode = nodes.find(n => n.id === currentId);
      if (!currentNode?.data.parentId) {
        return false;
      }

      if (currentNode.data.parentId === ancestorId) {
        return true;
      }

      currentId = currentNode.data.parentId;
    }

    return false;
  }

  /**
   * Gets all descendants of a node
   * @param nodeId The node to get descendants for
   * @param nodes All nodes in the mindmap
   * @returns Array of descendant nodes
   */
  static getAllDescendants(
    nodeId: string,
    nodes: Node<MindMapNodeData>[]
  ): Node<MindMapNodeData>[] {
    const descendants: Node<MindMapNodeData>[] = [];
    const visited = new Set<string>();

    const collectDescendants = (parentId: string) => {
      const children = nodes.filter(n => n.data.parentId === parentId);

      children.forEach(child => {
        if (!visited.has(child.id)) {
          visited.add(child.id);
          descendants.push(child);
          collectDescendants(child.id);
        }
      });
    };

    collectDescendants(nodeId);
    return descendants;
  }
}
