import type { Node, Edge } from 'reactflow';
import type { MindMapNodeData } from '../types/mindMap';
import { createDefaultSizingStrategy } from '../mindmaps/services/nodeSizingStrategy';

export class MindMapLayoutManager {
  constructor() {
    // Simple recursive layout manager - no complex algorithms needed
  }
  // Get visible nodes (excluding collapsed subtrees)
  getVisibleNodes(
    nodes: Node<MindMapNodeData>[],
    edges: Edge[]
  ): Node<MindMapNodeData>[] {
    const collapsedNodes = new Set(
      nodes.filter(node => node.data.isCollapsed).map(node => node.id)
    );

    const hiddenDescendants = new Set<string>();

    const findDescendants = (nodeId: string) => {
      const childEdges = edges.filter(edge => edge.source === nodeId);
      for (const edge of childEdges) {
        hiddenDescendants.add(edge.target);
        findDescendants(edge.target);
      }
    };

    collapsedNodes.forEach(nodeId => findDescendants(nodeId));

    return nodes.filter(node => !hiddenDescendants.has(node.id));
  }

  // Get visible edges (excluding those to collapsed subtrees)
  getVisibleEdges(nodes: Node<MindMapNodeData>[], edges: Edge[]): Edge[] {
    const collapsedNodes = new Set(
      nodes.filter(node => node.data.isCollapsed).map(node => node.id)
    );

    const hiddenDescendants = new Set<string>();

    const findDescendants = (nodeId: string) => {
      const childEdges = edges.filter(edge => edge.source === nodeId);
      for (const edge of childEdges) {
        hiddenDescendants.add(edge.target);
        findDescendants(edge.target);
      }
    };

    collapsedNodes.forEach(nodeId => findDescendants(nodeId));

    return edges.filter(edge => !hiddenDescendants.has(edge.target));
  }

  // Update node levels based on hierarchy
  updateNodeLevels(
    nodes: Node<MindMapNodeData>[],
    edges: Edge[],
    rootId: string,
    layout: 'LR' | 'RL' | 'TB' | 'BT'
  ): Node<MindMapNodeData>[] {
    const levels = new Map<string, number>();
    const visited = new Set<string>();

    // BFS to calculate levels
    const queue = [{ nodeId: rootId, level: 0 }];
    levels.set(rootId, 0);

    while (queue.length > 0) {
      const { nodeId, level } = queue.shift()!;

      if (visited.has(nodeId)) {
        continue;
      }
      visited.add(nodeId);

      const childEdges = edges.filter(edge => edge.source === nodeId);
      for (const edge of childEdges) {
        if (!levels.has(edge.target)) {
          levels.set(edge.target, level + 1);
          queue.push({ nodeId: edge.target, level: level + 1 });
        }
      }
    }

    // Check which nodes have children
    const nodeHasChildren = (nodeId: string) => {
      return edges.some(edge => edge.source === nodeId);
    };

    // Update nodes with levels and metadata
    return nodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        level: levels.get(node.id) || 0,
        isRoot: node.id === rootId,
        hasChildren: nodeHasChildren(node.id),
        layout,
      },
    }));
  }

  // Calculate node dimensions for proper spacing
  calculateNodeDimensions(
    text: string,
    nodeData?: MindMapNodeData
  ): { width: number; height: number } {
    const sizingStrategy = createDefaultSizingStrategy();
    const hasIcons = !!(
      nodeData?.chatId ||
      nodeData?.notes?.trim() ||
      (nodeData?.sources && nodeData.sources.length > 0)
    );

    const dimensions = sizingStrategy.calculateNodeSize(text, {
      hasIcons,
      level: nodeData?.level || 1,
      isCollapsed: nodeData?.isCollapsed || false,
    });

    return dimensions;
  }

  // Calculate all node dimensions and update them in the nodes
  async calculateAllNodeDimensions(
    nodes: Node<MindMapNodeData>[]
  ): Promise<Node<MindMapNodeData>[]> {
    const updatedNodes = await Promise.all(
      nodes.map(async node => {
        const dimensions = this.calculateNodeDimensions(
          node.data.label || '',
          node.data
        );
        return {
          ...node,
          data: {
            ...node.data,
            width: dimensions.width,
            height: dimensions.height,
          },
        };
      })
    );
    return updatedNodes;
  }

  // Main layout algorithm - restored working recursive approach
  async arrangeNodes(
    nodes: Node<MindMapNodeData>[],
    edges: Edge[],
    rootId: string,
    direction: 'LR' | 'RL' | 'TB' | 'BT' = 'LR'
  ): Promise<Node<MindMapNodeData>[]> {
    const rootNode = nodes.find(n => n.id === rootId);
    if (!rootNode) {
      return nodes;
    }

    // First, calculate all node dimensions (keep this improvement)
    const nodesWithDimensions = await this.calculateAllNodeDimensions(nodes);

    const visibleEdges = this.getVisibleEdges(nodesWithDimensions, edges);

    // Build hierarchy
    const children = new Map<string, string[]>();
    visibleEdges.forEach(edge => {
      if (!children.has(edge.source)) {
        children.set(edge.source, []);
      }
      children.get(edge.source)!.push(edge.target);
    });

    // Sort children to preserve order
    const nodeOrderMap = new Map<string, number>();
    nodesWithDimensions.forEach((node, index) => {
      nodeOrderMap.set(node.id, index);
    });

    children.forEach(childrenList => {
      childrenList.sort((a, b) => {
        const orderA = nodeOrderMap.get(a) ?? Infinity;
        const orderB = nodeOrderMap.get(b) ?? Infinity;
        return orderA - orderB;
      });
    });

    // Layout constants
    const LEVEL_SPACING = 250;
    const MIN_NODE_SPACING =
      direction === 'TB' || direction === 'BT' ? 220 : 120;

    // Get node dimensions (improved from current implementation)
    const nodeWidths = new Map<string, number>();
    const nodeHeights = new Map<string, number>();
    nodesWithDimensions.forEach(node => {
      const width = node.data.width || 120;
      const height = node.data.height || 40;
      nodeWidths.set(node.id, width);
      nodeHeights.set(node.id, height);
    });

    // Tree positioning data
    interface TreeNode {
      id: string;
      depth: number;
      subtreeSize: number;
      x: number;
      y: number;
    }

    const treeNodes = new Map<string, TreeNode>();

    // Calculate subtree sizes recursively (accounting for node heights)
    const calculateSubtreeSize = (nodeId: string, depth: number): number => {
      const nodeChildren = children.get(nodeId) || [];
      const nodeHeight = nodeHeights.get(nodeId) || 40;

      if (nodeChildren.length === 0) {
        // Leaf node: size based on its height relative to min spacing
        return Math.max(1, Math.ceil(nodeHeight / MIN_NODE_SPACING));
      }

      let totalSize = 0;
      for (const childId of nodeChildren) {
        totalSize += calculateSubtreeSize(childId, depth + 1);
      }

      // Parent node: ensure it can accommodate its own height and children
      const ownSizeRequirement = Math.ceil(nodeHeight / MIN_NODE_SPACING);
      return Math.max(totalSize, ownSizeRequirement);
    };

    // Proper recursive layout: parent positions children in their allocated space
    const positionNodes = (
      nodeId: string,
      depth: number,
      allocatedY: number,
      allocatedHeight: number
    ): void => {
      const nodeChildren = children.get(nodeId) || [];
      const nodeHeight = nodeHeights.get(nodeId) || 40;

      if (nodeChildren.length === 0) {
        // Leaf node: center in allocated space
        const nodeY = allocatedY + (allocatedHeight - nodeHeight) / 2;
        treeNodes.set(nodeId, {
          id: nodeId,
          depth,
          subtreeSize: 1,
          x: 0,
          y: nodeY,
        });
        return;
      }

      // Calculate space needed for each child subtree
      const childSubtreeSizes = nodeChildren.map(childId =>
        calculateSubtreeSize(childId, depth + 1)
      );
      const totalChildSize = childSubtreeSizes.reduce(
        (sum, size) => sum + size,
        0
      );

      // Position children in their allocated portions
      let currentY = allocatedY;
      for (let i = 0; i < nodeChildren.length; i++) {
        const childId = nodeChildren[i];
        const childSubtreeSize = childSubtreeSizes[i];
        const childHeight =
          (allocatedHeight * childSubtreeSize) / totalChildSize;

        // Recursively position this child in its allocated space
        positionNodes(childId, depth + 1, currentY, childHeight);
        currentY += childHeight;
      }

      // Position parent at center of its allocated space
      const parentY = allocatedY + (allocatedHeight - nodeHeight) / 2;
      treeNodes.set(nodeId, {
        id: nodeId,
        depth,
        subtreeSize: calculateSubtreeSize(nodeId, depth),
        x: 0,
        y: parentY,
      });
    };

    // Calculate total height needed for the tree
    const rootSubtreeSize = calculateSubtreeSize(rootId, 0);
    const totalHeight = rootSubtreeSize * MIN_NODE_SPACING;

    positionNodes(rootId, 0, 0, totalHeight);

    // Convert to screen coordinates
    const positions = new Map<string, { x: number; y: number }>();
    const ROOT_X = 600;
    const ROOT_Y = 400;

    // Calculate bounds for centering
    let minY = Infinity;
    let maxY = -Infinity;

    for (const node of treeNodes.values()) {
      minY = Math.min(minY, node.y);
      maxY = Math.max(maxY, node.y);
    }

    const treeHeight = maxY - minY;
    const yOffset = -treeHeight / 2;

    // Calculate X positions with proper spacing
    const nodeSpacing = new Map<string, number>();
    const parentMap = new Map<string, string>();

    visibleEdges.forEach(edge => {
      parentMap.set(edge.target, edge.source);
    });

    const calculateNodeSpacing = (nodeId: string): number => {
      if (nodeId === rootId) {
        nodeSpacing.set(nodeId, 0);
        return 0;
      }

      if (nodeSpacing.has(nodeId)) {
        return nodeSpacing.get(nodeId)!;
      }

      const parentId = parentMap.get(nodeId);
      if (!parentId) {
        nodeSpacing.set(nodeId, LEVEL_SPACING);
        return LEVEL_SPACING;
      }

      const parentPosition = calculateNodeSpacing(parentId);
      const parentWidth = nodeWidths.get(parentId) || 120;

      const parentBasedSpacing = parentPosition + parentWidth + 60;
      const levelBasedSpacing = parentPosition + LEVEL_SPACING;
      const newPosition = Math.max(parentBasedSpacing, levelBasedSpacing);

      nodeSpacing.set(nodeId, newPosition);
      return newPosition;
    };

    // Calculate all positions
    for (const node of treeNodes.values()) {
      calculateNodeSpacing(node.id);
    }

    // Apply layout direction
    for (const node of treeNodes.values()) {
      let screenX: number, screenY: number;

      switch (direction) {
        case 'LR':
          screenX = ROOT_X + (nodeSpacing.get(node.id) || 0);
          screenY = ROOT_Y + node.y + yOffset;
          break;
        case 'RL':
          screenX = ROOT_X - (nodeSpacing.get(node.id) || 0);
          screenY = ROOT_Y + node.y + yOffset;
          break;
        case 'TB':
          screenX = ROOT_X + node.y + yOffset;
          screenY = ROOT_Y + node.depth * LEVEL_SPACING;
          break;
        case 'BT':
          screenX = ROOT_X + node.y + yOffset;
          screenY = ROOT_Y - node.depth * LEVEL_SPACING;
          break;
        default:
          screenX = ROOT_X + (nodeSpacing.get(node.id) || 0);
          screenY = ROOT_Y + node.y + yOffset;
      }

      positions.set(node.id, { x: screenX, y: screenY });
    }

    // Apply positions to nodes
    return nodesWithDimensions.map(node => {
      const newPosition = positions.get(node.id);
      if (newPosition) {
        return { ...node, position: newPosition };
      }
      return node;
    });
  }

  // Complete layout operation that combines all steps
  async performCompleteLayout(
    nodes: Node<MindMapNodeData>[],
    edges: Edge[],
    rootId: string,
    layout: 'LR' | 'RL' | 'TB' | 'BT'
  ): Promise<{
    nodes: Node<MindMapNodeData>[];
    edges: Edge[];
  }> {
    // Step 1: Arrange nodes with proper positioning and width calculations
    const arrangedNodes = await this.arrangeNodes(nodes, edges, rootId, layout);

    // Step 2: Update node levels and metadata
    const finalNodes = this.updateNodeLevels(
      arrangedNodes,
      edges,
      rootId,
      layout
    );

    return {
      nodes: finalNodes,
      edges,
    };
  }
}
