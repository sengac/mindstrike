import { Node, Edge } from 'reactflow'
import { MindMapNodeData } from '../types/mindMap'

export class MindMapLayoutManager {
  // Get visible nodes (excluding collapsed subtrees)
  getVisibleNodes(
    nodes: Node<MindMapNodeData>[],
    edges: Edge[]
  ): Node<MindMapNodeData>[] {
    const collapsedNodes = new Set(
      nodes.filter(node => node.data.isCollapsed).map(node => node.id)
    )

    const hiddenDescendants = new Set<string>()

    const findDescendants = (nodeId: string) => {
      const childEdges = edges.filter(edge => edge.source === nodeId)
      for (const edge of childEdges) {
        hiddenDescendants.add(edge.target)
        findDescendants(edge.target)
      }
    }

    collapsedNodes.forEach(nodeId => findDescendants(nodeId))

    return nodes.filter(node => !hiddenDescendants.has(node.id))
  }

  // Get visible edges (excluding those to collapsed subtrees)
  getVisibleEdges(
    nodes: Node<MindMapNodeData>[],
    edges: Edge[]
  ): Edge[] {
    const collapsedNodes = new Set(
      nodes.filter(node => node.data.isCollapsed).map(node => node.id)
    )

    const hiddenDescendants = new Set<string>()

    const findDescendants = (nodeId: string) => {
      const childEdges = edges.filter(edge => edge.source === nodeId)
      for (const edge of childEdges) {
        hiddenDescendants.add(edge.target)
        findDescendants(edge.target)
      }
    }

    collapsedNodes.forEach(nodeId => findDescendants(nodeId))

    return edges.filter(edge => !hiddenDescendants.has(edge.target))
  }

  // Update node levels based on hierarchy
  updateNodeLevels(
    nodes: Node<MindMapNodeData>[],
    edges: Edge[],
    rootId: string,
    layout: 'LR' | 'RL' | 'TB' | 'BT'
  ): Node<MindMapNodeData>[] {
    const levels = new Map<string, number>()
    const visited = new Set<string>()

    // BFS to calculate levels
    const queue = [{ nodeId: rootId, level: 0 }]
    levels.set(rootId, 0)

    while (queue.length > 0) {
      const { nodeId, level } = queue.shift()!

      if (visited.has(nodeId)) continue
      visited.add(nodeId)

      const childEdges = edges.filter(edge => edge.source === nodeId)
      for (const edge of childEdges) {
        if (!levels.has(edge.target)) {
          levels.set(edge.target, level + 1)
          queue.push({ nodeId: edge.target, level: level + 1 })
        }
      }
    }

    // Check which nodes have children
    const nodeHasChildren = (nodeId: string) => {
      return edges.some(edge => edge.source === nodeId)
    }

    // Update nodes with levels and metadata
    return nodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        level: levels.get(node.id) || 0,
        isRoot: node.id === rootId,
        hasChildren: nodeHasChildren(node.id),
        layout
      }
    }))
  }

  // Calculate text width for proper spacing
  calculateNodeWidth(text: string): number {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.font = '14px system-ui, -apple-system, sans-serif'
      const textWidth = ctx.measureText(text).width
      const padding = 32
      const minWidth = 120
      const maxWidth = 800
      return Math.min(Math.max(textWidth + padding, minWidth), maxWidth)
    }
    return 120
  }

  // Calculate all node widths and update them in the nodes
  async calculateAllNodeWidths(nodes: Node<MindMapNodeData>[]): Promise<Node<MindMapNodeData>[]> {
    const updatedNodes = await Promise.all(
      nodes.map(async (node) => {
        const width = this.calculateNodeWidth(node.data.label || '')
        return {
          ...node,
          data: {
            ...node.data,
            width
          }
        }
      })
    )
    return updatedNodes
  }

  // Main layout algorithm with proper async handling
  async arrangeNodes(
    nodes: Node<MindMapNodeData>[],
    edges: Edge[],
    rootId: string,
    direction: 'LR' | 'RL' | 'TB' | 'BT' = 'LR'
  ): Promise<Node<MindMapNodeData>[]> {
    const rootNode = nodes.find(n => n.id === rootId)
    if (!rootNode) return nodes

    // First, calculate all node widths
    const nodesWithWidths = await this.calculateAllNodeWidths(nodes)

    const visibleEdges = this.getVisibleEdges(nodesWithWidths, edges)

    // Build hierarchy
    const children = new Map<string, string[]>()
    visibleEdges.forEach(edge => {
      if (!children.has(edge.source)) {
        children.set(edge.source, [])
      }
      children.get(edge.source)!.push(edge.target)
    })

    // Sort children to preserve order
    const nodeOrderMap = new Map<string, number>()
    nodesWithWidths.forEach((node, index) => {
      nodeOrderMap.set(node.id, index)
    })

    children.forEach(childrenList => {
      childrenList.sort((a, b) => {
        const orderA = nodeOrderMap.get(a) ?? Infinity
        const orderB = nodeOrderMap.get(b) ?? Infinity
        return orderA - orderB
      })
    })

    // Layout constants
    const LEVEL_SPACING = 250
    const NODE_SPACING = direction === 'TB' || direction === 'BT' ? 220 : 120

    // Get node widths
    const nodeWidths = new Map<string, number>()
    nodesWithWidths.forEach(node => {
      const width = node.data.width || this.calculateNodeWidth(node.data.label || '')
      nodeWidths.set(node.id, width)
    })

    // Tree positioning data
    interface TreeNode {
      id: string
      depth: number
      subtreeSize: number
      x: number
      y: number
    }

    const treeNodes = new Map<string, TreeNode>()

    // Calculate subtree sizes
    const calculateSubtreeSize = (nodeId: string, depth: number): number => {
      const nodeChildren = children.get(nodeId) || []
      if (nodeChildren.length === 0) return 1

      let totalSize = 0
      for (const childId of nodeChildren) {
        totalSize += calculateSubtreeSize(childId, depth + 1)
      }
      return Math.max(totalSize, 1)
    }

    // Position nodes recursively
    const positionNodes = (
      nodeId: string,
      depth: number,
      siblingIndex: number,
      startY: number
    ): number => {
      const nodeChildren = children.get(nodeId) || []
      const subtreeSize = calculateSubtreeSize(nodeId, depth)

      const nodeY = startY + (subtreeSize * NODE_SPACING) / 2

      treeNodes.set(nodeId, {
        id: nodeId,
        depth,
        subtreeSize,
        x: 0,
        y: nodeY
      })

      let currentY = startY
      for (let i = 0; i < nodeChildren.length; i++) {
        const childId = nodeChildren[i]
        const childEndY = positionNodes(childId, depth + 1, i, currentY)
        currentY = childEndY
      }

      return startY + subtreeSize * NODE_SPACING
    }

    positionNodes(rootId, 0, 0, 0)

    // Convert to screen coordinates
    const positions = new Map<string, { x: number; y: number }>()
    const ROOT_X = 600
    const ROOT_Y = 400

    // Calculate bounds for centering
    let minY = Infinity
    let maxY = -Infinity

    for (const node of treeNodes.values()) {
      minY = Math.min(minY, node.y)
      maxY = Math.max(maxY, node.y)
    }

    const treeHeight = maxY - minY
    const yOffset = -treeHeight / 2

    // Calculate X positions with proper spacing
    const nodeSpacing = new Map<string, number>()
    const parentMap = new Map<string, string>()
    
    visibleEdges.forEach(edge => {
      parentMap.set(edge.target, edge.source)
    })

    const calculateNodeSpacing = (nodeId: string): number => {
      if (nodeId === rootId) {
        nodeSpacing.set(nodeId, 0)
        return 0
      }

      if (nodeSpacing.has(nodeId)) {
        return nodeSpacing.get(nodeId)!
      }

      const parentId = parentMap.get(nodeId)
      if (!parentId) {
        nodeSpacing.set(nodeId, LEVEL_SPACING)
        return LEVEL_SPACING
      }

      const parentPosition = calculateNodeSpacing(parentId)
      const parentWidth = nodeWidths.get(parentId) || 120
      
      const parentBasedSpacing = parentPosition + parentWidth + 60
      const levelBasedSpacing = parentPosition + LEVEL_SPACING
      const newPosition = Math.max(parentBasedSpacing, levelBasedSpacing)

      nodeSpacing.set(nodeId, newPosition)
      return newPosition
    }

    // Calculate all positions
    for (const node of treeNodes.values()) {
      calculateNodeSpacing(node.id)
    }

    // Apply layout direction
    for (const node of treeNodes.values()) {
      let screenX: number, screenY: number

      switch (direction) {
        case 'LR':
          screenX = ROOT_X + (nodeSpacing.get(node.id) || 0)
          screenY = ROOT_Y + node.y + yOffset
          break
        case 'RL':
          screenX = ROOT_X - (nodeSpacing.get(node.id) || 0)
          screenY = ROOT_Y + node.y + yOffset
          break
        case 'TB':
          screenX = ROOT_X + node.y + yOffset
          screenY = ROOT_Y + node.depth * LEVEL_SPACING
          break
        case 'BT':
          screenX = ROOT_X + node.y + yOffset
          screenY = ROOT_Y - node.depth * LEVEL_SPACING
          break
        default:
          screenX = ROOT_X + (nodeSpacing.get(node.id) || 0)
          screenY = ROOT_Y + node.y + yOffset
      }

      positions.set(node.id, { x: screenX, y: screenY })
    }

    // Apply positions to nodes
    return nodesWithWidths.map(node => {
      const newPosition = positions.get(node.id)
      if (newPosition) {
        return { ...node, position: newPosition }
      }
      return node
    })
  }

  // Complete layout operation that combines all steps
  async performCompleteLayout(
    nodes: Node<MindMapNodeData>[],
    edges: Edge[],
    rootId: string,
    layout: 'LR' | 'RL' | 'TB' | 'BT'
  ): Promise<{
    nodes: Node<MindMapNodeData>[]
    edges: Edge[]
  }> {
    // Step 1: Arrange nodes with proper positioning and width calculations
    const arrangedNodes = await this.arrangeNodes(nodes, edges, rootId, layout)
    
    // Step 2: Update node levels and metadata
    const finalNodes = this.updateNodeLevels(arrangedNodes, edges, rootId, layout)
    
    return {
      nodes: finalNodes,
      edges
    }
  }
}
