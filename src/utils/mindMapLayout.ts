import type { Node, Edge } from 'reactflow';
import type { MindMapNodeData } from '../types/mindMap';
import { createDefaultSizingStrategy } from '../mindmaps/services/nodeSizingStrategy';
import { RadialLayoutCalculator } from './radialLayoutCalculator';
import {
  LAYOUT_CALC,
  DEFAULT_POSITION,
  ARRAY_NAVIGATION,
} from '../mindmaps/constants/magicNumbers';

// Layout Constants
export const LAYOUT_CONSTANTS = {
  // Base positioning
  ROOT_X: 600,
  ROOT_Y: 400,

  // Spacing between levels (horizontal for LR/RL, vertical for TB/BT)
  LEVEL_SPACING: 250,

  // Minimum spacing between nodes
  MIN_NODE_SPACING: 120,

  // Horizontal gap between siblings in TB/BT layouts
  HORIZONTAL_SIBLING_GAP: 80,

  // Vertical gap between levels in TB/BT layouts
  VERTICAL_LEVEL_GAP: 60,

  // Gap between parent edge and child node in LR/RL layouts
  PARENT_CHILD_GAP: 60,

  // Default node dimensions
  DEFAULT_NODE_WIDTH: 120,
  DEFAULT_NODE_HEIGHT: 40,

  // BT layout depth multiplier for initial positioning
  BT_DEPTH_MULTIPLIER: 200,
} as const;

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
    layout: 'LR' | 'RL' | 'TB' | 'BT' | 'RD'
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
    direction: 'LR' | 'RL' | 'TB' | 'BT' | 'RD' = 'LR'
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
    const LEVEL_SPACING = LAYOUT_CONSTANTS.LEVEL_SPACING;
    const MIN_NODE_SPACING = LAYOUT_CONSTANTS.MIN_NODE_SPACING;
    const MIN_HORIZONTAL_SPACING = LAYOUT_CONSTANTS.HORIZONTAL_SIBLING_GAP;

    // Get node dimensions (improved from current implementation)
    const nodeWidths = new Map<string, number>();
    const nodeHeights = new Map<string, number>();
    nodesWithDimensions.forEach(node => {
      const width = node.data.width || LAYOUT_CONSTANTS.DEFAULT_NODE_WIDTH;
      const height = node.data.height || LAYOUT_CONSTANTS.DEFAULT_NODE_HEIGHT;
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

    // For TB/BT layouts, we need to calculate horizontal subtree widths
    const calculateSubtreeWidth = (nodeId: string): number => {
      const nodeChildren = children.get(nodeId) || [];
      const nodeWidth =
        nodeWidths.get(nodeId) || LAYOUT_CONSTANTS.DEFAULT_NODE_WIDTH;

      if (nodeChildren.length === 0) {
        // Leaf node: just its own width
        return nodeWidth;
      }

      // Parent node: sum of children widths plus gaps
      let totalWidth = DEFAULT_POSITION.X;
      for (const childId of nodeChildren) {
        totalWidth += calculateSubtreeWidth(childId);
      }
      // Add gaps between children
      totalWidth += (nodeChildren.length - 1) * MIN_HORIZONTAL_SPACING;

      // Parent should be at least as wide as its own width
      return Math.max(totalWidth, nodeWidth);
    };

    // Calculate subtree sizes for vertical layouts (LR/RL)
    const calculateSubtreeSize = (nodeId: string, depth: number): number => {
      const nodeChildren = children.get(nodeId) || [];
      const nodeHeight =
        nodeHeights.get(nodeId) || LAYOUT_CONSTANTS.DEFAULT_NODE_HEIGHT;

      if (nodeChildren.length === 0) {
        // Leaf node: size based on its height relative to min spacing
        return Math.max(1, Math.ceil(nodeHeight / MIN_NODE_SPACING));
      }

      let totalSize = DEFAULT_POSITION.X;
      for (const childId of nodeChildren) {
        totalSize += calculateSubtreeSize(childId, depth + 1);
      }

      // Parent node: ensure it can accommodate its own height and children
      const ownSizeRequirement = Math.ceil(nodeHeight / MIN_NODE_SPACING);
      return Math.max(totalSize, ownSizeRequirement);
    };

    if (direction === 'TB' || direction === 'BT') {
      // Simplified horizontal positioning for TB/BT layouts
      // Use consistent spacing between siblings for predictable drag/drop behavior
      const positionNodesHorizontally = (
        nodeId: string,
        depth: number,
        centerX: number
      ): number => {
        const nodeChildren = children.get(nodeId) || [];
        const nodeWidth =
          nodeWidths.get(nodeId) || LAYOUT_CONSTANTS.DEFAULT_NODE_WIDTH;

        if (nodeChildren.length === 0) {
          // Leaf node: position at center
          treeNodes.set(nodeId, {
            id: nodeId,
            depth,
            subtreeSize: LAYOUT_CALC.MIN_SUBTREE_SIZE,
            x: centerX - nodeWidth / 2,
            y: DEFAULT_POSITION.Y, // Will be set based on depth later
          });
          return nodeWidth;
        }

        // For parent nodes with children, use consistent spacing
        // This ensures dropped nodes appear exactly where expected
        const SIBLING_SPACING = MIN_HORIZONTAL_SPACING;

        // Calculate total width needed for all children INCLUDING their subtrees
        let totalChildrenWidth = DEFAULT_POSITION.X;
        const childSubtreeWidths: number[] = [];

        // Calculate the full subtree width for each child
        for (const childId of nodeChildren) {
          const childSubtreeWidth = calculateSubtreeWidth(childId);
          childSubtreeWidths.push(childSubtreeWidth);
          totalChildrenWidth += childSubtreeWidth;
        }
        totalChildrenWidth += (nodeChildren.length - 1) * SIBLING_SPACING;

        // Position children with consistent spacing based on their subtree widths
        let currentX = centerX - totalChildrenWidth / 2;
        const childCenters: number[] = [];

        for (
          let i = ARRAY_NAVIGATION.FIRST_INDEX;
          i < nodeChildren.length;
          i++
        ) {
          const childId = nodeChildren[i];
          const childSubtreeWidth = childSubtreeWidths[i];
          const childCenterX = currentX + childSubtreeWidth / 2;

          // Recursively position this child and its subtree
          positionNodesHorizontally(childId, depth + 1, childCenterX);
          childCenters.push(childCenterX);

          currentX += childSubtreeWidth + SIBLING_SPACING;
        }

        // Position parent centered above/below its children
        treeNodes.set(nodeId, {
          id: nodeId,
          depth,
          subtreeSize: 1,
          x: centerX - nodeWidth / 2,
          y: DEFAULT_POSITION.Y,
        });

        // Return the actual subtree width for this node
        // This should match what calculateSubtreeWidth returns
        return calculateSubtreeWidth(nodeId);
      };

      // Start positioning from root at center
      positionNodesHorizontally(rootId, 0, LAYOUT_CONSTANTS.ROOT_X);
    } else if (direction === 'RD') {
      // Radial layout: alternate direct children between LR and RL

      // Position root node at center
      const rootWidth =
        nodeWidths.get(rootId) || LAYOUT_CONSTANTS.DEFAULT_NODE_WIDTH;
      const rootHeight =
        nodeHeights.get(rootId) || LAYOUT_CONSTANTS.DEFAULT_NODE_HEIGHT;
      treeNodes.set(rootId, {
        id: rootId,
        depth: 0,
        subtreeSize: 1,
        x: 0, // Will be positioned at ROOT_X later
        y: 0, // Will be positioned at ROOT_Y later
      });

      // Get direct children of root
      const directChildren = nodesWithDimensions.filter(
        n => n.data.parentId === rootId
      );

      // Sort direct children to preserve order
      directChildren.sort((a, b) => {
        const orderA = nodeOrderMap.get(a.id) ?? Infinity;
        const orderB = nodeOrderMap.get(b.id) ?? Infinity;
        return orderA - orderB;
      });

      // Separate direct children by their layout direction
      const leftDirectChildren: Node<MindMapNodeData>[] = [];
      const rightDirectChildren: Node<MindMapNodeData>[] = [];

      directChildren.forEach((child, index) => {
        const direction = RadialLayoutCalculator.getChildDirection(index);
        if (direction === 'RL') {
          leftDirectChildren.push(child);
        } else {
          rightDirectChildren.push(child);
        }
      });

      console.debug('Radial Layout Debug:', {
        totalDirectChildren: directChildren.length,
        leftCount: leftDirectChildren.length,
        rightCount: rightDirectChildren.length,
        leftNodes: leftDirectChildren.map(n => ({
          id: n.id,
          label: n.data.label,
        })),
        rightNodes: rightDirectChildren.map(n => ({
          id: n.id,
          label: n.data.label,
        })),
        orderedChildren: directChildren.map((n, i) => ({
          index: i,
          id: n.id,
          label: n.data.label,
          expectedDir: RadialLayoutCalculator.getChildDirection(i),
        })),
      });

      // Helper to calculate subtree size recursively
      const calculateSubtreeSize = (nodeId: string, depth: number): number => {
        const nodeChildren = children.get(nodeId) || [];
        const nodeHeight =
          nodeHeights.get(nodeId) || LAYOUT_CONSTANTS.DEFAULT_NODE_HEIGHT;

        if (nodeChildren.length === 0) {
          return Math.max(1, Math.ceil(nodeHeight / MIN_NODE_SPACING));
        }

        let totalSize = 0;
        for (const childId of nodeChildren) {
          totalSize += calculateSubtreeSize(childId, depth + 1);
        }

        const ownSizeRequirement = Math.ceil(nodeHeight / MIN_NODE_SPACING);
        return Math.max(totalSize, ownSizeRequirement);
      };

      // Helper to position a subtree recursively
      const positionSubtree = (
        nodeId: string,
        depth: number,
        allocatedY: number,
        allocatedHeight: number
      ): void => {
        const nodeChildren = children.get(nodeId) || [];
        const nodeHeight =
          nodeHeights.get(nodeId) || LAYOUT_CONSTANTS.DEFAULT_NODE_HEIGHT;

        if (nodeChildren.length === 0) {
          // Leaf node
          const nodeY = allocatedY + (allocatedHeight - nodeHeight) / 2;
          treeNodes.set(nodeId, {
            id: nodeId,
            depth,
            subtreeSize: 1,
            x: 0, // Will be adjusted based on direction
            y: nodeY,
          });
          return;
        }

        // Calculate space for children
        const childSubtreeSizes = nodeChildren.map(childId =>
          calculateSubtreeSize(childId, depth + 1)
        );
        const totalChildSize = childSubtreeSizes.reduce(
          (sum, size) => sum + size,
          0
        );

        // Position children
        let currentY = allocatedY;
        for (let i = 0; i < nodeChildren.length; i++) {
          const childId = nodeChildren[i];
          const childSubtreeSize = childSubtreeSizes[i];
          const childHeight =
            (allocatedHeight * childSubtreeSize) / totalChildSize;

          positionSubtree(childId, depth + 1, currentY, childHeight);
          currentY += childHeight;
        }

        // Position parent
        const parentY = allocatedY + (allocatedHeight - nodeHeight) / 2;
        treeNodes.set(nodeId, {
          id: nodeId,
          depth,
          subtreeSize: calculateSubtreeSize(nodeId, depth),
          x: 0,
          y: parentY,
        });
      };

      // Layout left side branches
      let leftCumulativeY = 0;
      leftDirectChildren.forEach(child => {
        const branchSize = calculateSubtreeSize(child.id, 1);
        const branchHeight = branchSize * MIN_NODE_SPACING;
        positionSubtree(child.id, 1, leftCumulativeY, branchHeight);
        leftCumulativeY += branchHeight;
      });

      // Layout right side branches
      let rightCumulativeY = 0;
      rightDirectChildren.forEach(child => {
        const branchSize = calculateSubtreeSize(child.id, 1);
        const branchHeight = branchSize * MIN_NODE_SPACING;
        positionSubtree(child.id, 1, rightCumulativeY, branchHeight);
        rightCumulativeY += branchHeight;
      });
    } else {
      // Vertical recursive positioning for LR/RL layouts (existing algorithm)
      const positionNodes = (
        nodeId: string,
        depth: number,
        allocatedY: number,
        allocatedHeight: number
      ): void => {
        const nodeChildren = children.get(nodeId) || [];
        const nodeHeight =
          nodeHeights.get(nodeId) || LAYOUT_CONSTANTS.DEFAULT_NODE_HEIGHT;

        if (nodeChildren.length === 0) {
          // Leaf node: center in allocated space
          const nodeY = allocatedY + (allocatedHeight - nodeHeight) / 2;
          treeNodes.set(nodeId, {
            id: nodeId,
            depth,
            subtreeSize: LAYOUT_CALC.MIN_SUBTREE_SIZE,
            x: DEFAULT_POSITION.X,
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
        for (
          let i = ARRAY_NAVIGATION.FIRST_INDEX;
          i < nodeChildren.length;
          i++
        ) {
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
          x: DEFAULT_POSITION.X,
          y: parentY,
        });
      };

      // Calculate total height needed for the tree
      const rootSubtreeSize = calculateSubtreeSize(rootId, 0);
      const totalHeight = rootSubtreeSize * MIN_NODE_SPACING;

      positionNodes(rootId, 0, 0, totalHeight);
    }

    // Convert to screen coordinates
    const positions = new Map<string, { x: number; y: number }>();
    const ROOT_X = LAYOUT_CONSTANTS.ROOT_X;
    const ROOT_Y = LAYOUT_CONSTANTS.ROOT_Y;

    if (direction === 'TB' || direction === 'BT') {
      // For TB/BT layouts, center the tree horizontally
      let minX = Infinity;
      let maxX = -Infinity;

      for (const node of treeNodes.values()) {
        minX = Math.min(minX, node.x);
        maxX = Math.max(
          maxX,
          node.x +
            (nodeWidths.get(node.id) || LAYOUT_CONSTANTS.DEFAULT_NODE_WIDTH)
        );
      }

      const treeWidth = maxX - minX;
      const xOffset = ROOT_X - treeWidth / 2 - minX;

      // Calculate vertical positions based on actual node heights
      // Group nodes by depth level
      const nodesByDepth = new Map<number, string[]>();
      let maxDepth: number = LAYOUT_CALC.ROOT_LEVEL;
      for (const node of treeNodes.values()) {
        if (!nodesByDepth.has(node.depth)) {
          nodesByDepth.set(node.depth, []);
        }
        nodesByDepth.get(node.depth)!.push(node.id);
        maxDepth = Math.max(maxDepth, node.depth);
      }

      // Calculate cumulative Y positions for each depth level
      const depthYPositions = new Map<number, number>();
      depthYPositions.set(0, ROOT_Y);

      // For TB layout, calculate positions from top to bottom
      if (direction === 'TB') {
        for (
          let depth = LAYOUT_CALC.FIRST_CHILD_LEVEL;
          depth <= maxDepth;
          depth++
        ) {
          const prevDepthNodes = nodesByDepth.get(depth - 1) || [];
          let maxHeightAtPrevDepth: number = DEFAULT_POSITION.Y;

          // Find the maximum height of nodes at the previous depth
          for (const nodeId of prevDepthNodes) {
            const height =
              nodeHeights.get(nodeId) || LAYOUT_CONSTANTS.DEFAULT_NODE_HEIGHT;
            maxHeightAtPrevDepth = Math.max(maxHeightAtPrevDepth, height);
          }

          // Position this depth below the previous depth's tallest node + gap
          const prevY = depthYPositions.get(depth - 1) || ROOT_Y;
          const gap = LAYOUT_CONSTANTS.VERTICAL_LEVEL_GAP;
          depthYPositions.set(depth, prevY + maxHeightAtPrevDepth + gap);
        }
      } else {
        // For BT layout, calculate positions from bottom to top
        // First, calculate max height for each depth
        const depthHeights = new Map<number, number>();

        for (let depth = LAYOUT_CALC.ROOT_LEVEL; depth <= maxDepth; depth++) {
          const depthNodes = nodesByDepth.get(depth) || [];
          let maxHeightAtDepth: number = DEFAULT_POSITION.Y;

          for (const nodeId of depthNodes) {
            const height =
              nodeHeights.get(nodeId) || LAYOUT_CONSTANTS.DEFAULT_NODE_HEIGHT;
            maxHeightAtDepth = Math.max(maxHeightAtDepth, height);
          }

          depthHeights.set(depth, maxHeightAtDepth);
        }

        // Calculate positions from bottom to top
        // In BT layout: root is at bottom, children above
        const gap = LAYOUT_CONSTANTS.VERTICAL_LEVEL_GAP;

        // Calculate cumulative heights from bottom to top
        let cumulativeOffset = DEFAULT_POSITION.Y;

        // Position each depth level
        for (let depth = maxDepth; depth >= LAYOUT_CALC.ROOT_LEVEL; depth--) {
          if (depth === maxDepth) {
            // Deepest level starts at a base position
            depthYPositions.set(
              depth,
              ROOT_Y - LAYOUT_CONSTANTS.BT_DEPTH_MULTIPLIER * maxDepth
            );
          } else {
            // Each parent level is below its children
            const childHeight =
              depthHeights.get(depth + 1) ||
              LAYOUT_CONSTANTS.DEFAULT_NODE_HEIGHT;
            cumulativeOffset += childHeight + gap;
            const childY = depthYPositions.get(depth + 1) || ROOT_Y;
            depthYPositions.set(depth, childY + childHeight + gap);
          }
        }
      }

      // Apply positions
      for (const node of treeNodes.values()) {
        const screenX = node.x + xOffset;
        const screenY = depthYPositions.get(node.depth) || ROOT_Y;

        positions.set(node.id, { x: screenX, y: screenY });
      }
    } else if (direction === 'RD') {
      // For Radial layout, position nodes based on their group

      // Build parent-child relationships for positioning
      const parentMap = new Map<string, string>();
      visibleEdges.forEach(edge => {
        parentMap.set(edge.target, edge.source);
      });

      // Center the vertical layout for both sides
      let leftMinY = Infinity;
      let leftMaxY = -Infinity;
      let rightMinY = Infinity;
      let rightMaxY = -Infinity;

      // Calculate bounds for each side based on direct children
      for (const node of treeNodes.values()) {
        if (node.id === rootId) continue;

        // Find which direct child this node descends from
        let currentId = node.id;
        let parentId = parentMap.get(currentId);
        while (parentId && parentId !== rootId) {
          currentId = parentId;
          parentId = parentMap.get(currentId);
        }

        // If parentId is rootId, then currentId is a direct child
        if (parentId === rootId) {
          // Find the index of this direct child among root's children
          const rootChildren = nodesWithDimensions
            .filter(n => n.data.parentId === rootId)
            .sort((a, b) => {
              const orderA = nodeOrderMap.get(a.id) ?? Infinity;
              const orderB = nodeOrderMap.get(b.id) ?? Infinity;
              return orderA - orderB;
            });
          const directChildIndex = rootChildren.findIndex(
            n => n.id === currentId
          );
          if (directChildIndex !== -1) {
            const direction =
              RadialLayoutCalculator.getChildDirection(directChildIndex);
            if (direction === 'RL') {
              leftMinY = Math.min(leftMinY, node.y);
              leftMaxY = Math.max(leftMaxY, node.y);
            } else {
              rightMinY = Math.min(rightMinY, node.y);
              rightMaxY = Math.max(rightMaxY, node.y);
            }
          }
        }
      }

      // Calculate offsets to center each side vertically
      const leftHeight = leftMaxY - leftMinY;
      const rightHeight = rightMaxY - rightMinY;
      const leftYOffset = -leftHeight / 2;
      const rightYOffset = -rightHeight / 2;

      // Position root first
      const rootWidth =
        nodeWidths.get(rootId) || LAYOUT_CONSTANTS.DEFAULT_NODE_WIDTH;
      positions.set(rootId, {
        x: ROOT_X - rootWidth / 2,
        y:
          ROOT_Y -
          (nodeHeights.get(rootId) || LAYOUT_CONSTANTS.DEFAULT_NODE_HEIGHT) / 2,
      });

      // Calculate positions recursively from root
      const calculateNodePosition = (
        nodeId: string
      ): { x: number; y: number } => {
        if (positions.has(nodeId)) {
          return positions.get(nodeId)!;
        }

        const node = treeNodes.get(nodeId);
        if (!node) return { x: 0, y: 0 };

        const parentId = parentMap.get(nodeId);
        if (!parentId || !positions.has(parentId)) {
          return { x: 0, y: 0 };
        }

        const parentPos = positions.get(parentId)!;

        // Find which direct child this node descends from
        let currentId = nodeId;
        let ancestorId = parentId;
        while (ancestorId && ancestorId !== rootId) {
          currentId = ancestorId;
          ancestorId = parentMap.get(currentId);
        }

        // Determine side based on direct child ancestor
        let effectiveLayout: 'LR' | 'RL' = 'LR';
        if (ancestorId === rootId) {
          // Find the index of this direct child among root's children
          const rootChildren = nodesWithDimensions
            .filter(n => n.data.parentId === rootId)
            .sort((a, b) => {
              const orderA = nodeOrderMap.get(a.id) ?? Infinity;
              const orderB = nodeOrderMap.get(b.id) ?? Infinity;
              return orderA - orderB;
            });
          const directChildIndex = rootChildren.findIndex(
            n => n.id === currentId
          );
          if (directChildIndex !== -1) {
            effectiveLayout =
              RadialLayoutCalculator.getChildDirection(directChildIndex);
          }
        }

        const nodeWidth =
          nodeWidths.get(nodeId) || LAYOUT_CONSTANTS.DEFAULT_NODE_WIDTH;
        const parentWidth =
          nodeWidths.get(parentId) || LAYOUT_CONSTANTS.DEFAULT_NODE_WIDTH;

        let screenX: number, screenY: number;

        if (effectiveLayout === 'RL') {
          // Left side (RL layout) - position to the left of parent
          screenX = parentPos.x - LAYOUT_CONSTANTS.PARENT_CHILD_GAP - nodeWidth;
          screenY = ROOT_Y + node.y + leftYOffset;
        } else {
          // Right side (LR layout) - position to the right of parent
          screenX =
            parentPos.x + parentWidth + LAYOUT_CONSTANTS.PARENT_CHILD_GAP;
          screenY = ROOT_Y + node.y + rightYOffset;
        }

        positions.set(nodeId, { x: screenX, y: screenY });
        return { x: screenX, y: screenY };
      };

      // Sort nodes by depth to ensure parents are positioned before children
      const sortedNodes = Array.from(treeNodes.values()).sort(
        (a, b) => a.depth - b.depth
      );

      // Calculate all positions
      for (const node of sortedNodes) {
        if (node.id !== rootId) {
          calculateNodePosition(node.id);
        }
      }
    } else {
      // For LR/RL layouts, use the existing algorithm
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
        const parentWidth =
          nodeWidths.get(parentId) || LAYOUT_CONSTANTS.DEFAULT_NODE_WIDTH;

        const parentBasedSpacing =
          parentPosition + parentWidth + LAYOUT_CONSTANTS.PARENT_CHILD_GAP;
        const levelBasedSpacing = parentPosition + LEVEL_SPACING;
        const newPosition = Math.max(parentBasedSpacing, levelBasedSpacing);

        nodeSpacing.set(nodeId, newPosition);
        return newPosition;
      };

      // Calculate all positions
      for (const node of treeNodes.values()) {
        calculateNodeSpacing(node.id);
      }

      // Apply layout direction for LR/RL
      for (const node of treeNodes.values()) {
        let screenX: number, screenY: number;

        switch (direction) {
          case 'LR':
            screenX = ROOT_X + (nodeSpacing.get(node.id) || 0);
            screenY = ROOT_Y + node.y + yOffset;
            break;
          case 'RL':
            // For RL layout, position nodes by their right edge
            // Subtract node width so the right edge is at the calculated position
            const nodeWidth =
              nodeWidths.get(node.id) || LAYOUT_CONSTANTS.DEFAULT_NODE_WIDTH;
            screenX = ROOT_X - (nodeSpacing.get(node.id) || 0) - nodeWidth;
            screenY = ROOT_Y + node.y + yOffset;
            break;
          default:
            screenX = ROOT_X + (nodeSpacing.get(node.id) || 0);
            screenY = ROOT_Y + node.y + yOffset;
        }

        positions.set(node.id, { x: screenX, y: screenY });
      }
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
    layout: 'LR' | 'RL' | 'TB' | 'BT' | 'RD'
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
