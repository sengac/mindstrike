import { Node, Edge } from 'reactflow'
import { MindMapNodeData } from '../components/MindMapNode'
import { MindMapData, MindMapDataManager } from './mindMapData'
import { MindMapLayoutManager } from './mindMapLayout'
import { Source } from '../components/shared/ChatContentViewer'

export class MindMapActionsManager {
  constructor(
    private dataManager: MindMapDataManager,
    private layoutManager: MindMapLayoutManager
  ) {}

  // Helper to apply complete layout and save to history
  private async applyCompleteLayout(
    nodes: Node<MindMapNodeData>[],
    edges: Edge[],
    rootNodeId: string,
    layout: 'LR' | 'RL' | 'TB' | 'BT',
    skipSave = false
  ): Promise<{
    nodes: Node<MindMapNodeData>[]
    edges: Edge[]
  }> {
    // Perform complete layout including width calculations
    const { nodes: finalNodes, edges: finalEdges } = await this.layoutManager.performCompleteLayout(
      nodes,
      edges,
      rootNodeId,
      layout
    )

    // Save to history
    if (!skipSave) {
      this.dataManager.saveToHistory(finalNodes, rootNodeId, layout)
    }

    return { nodes: finalNodes, edges: finalEdges }
  }

  // Add a child node
  async addChildNode(
    nodes: Node<MindMapNodeData>[],
    edges: Edge[],
    rootNodeId: string,
    layout: 'LR' | 'RL' | 'TB' | 'BT',
    parentNodeId: string
  ): Promise<{
    nodes: Node<MindMapNodeData>[]
    edges: Edge[]
    newNodeId: string
  }> {
    const parentNode = nodes.find(n => n.id === parentNodeId)
    if (!parentNode) {
      throw new Error('Parent node not found')
    }

    const newNodeId = `node-${Date.now()}`
    const newNode: Node<MindMapNodeData> = {
      id: newNodeId,
      type: 'mindMapNode',
      position: {
        x: parentNode.position.x + 200,
        y: parentNode.position.y + 100
      },
      data: {
        id: newNodeId,
        label: 'New Idea',
        isRoot: false,
        parentId: parentNodeId,
        isEditing: true,
        level: (parentNode.data.level || 0) + 1
      }
    }

    const newNodes = [...nodes, newNode]
    const newEdges = this.dataManager.generateEdges(newNodes, layout)
    
    const { nodes: finalNodes, edges: finalEdges } = await this.applyCompleteLayout(
      newNodes,
      newEdges,
      rootNodeId,
      layout
    )

    return {
      nodes: finalNodes,
      edges: finalEdges,
      newNodeId
    }
  }

  // Add a sibling node
  async addSiblingNode(
    nodes: Node<MindMapNodeData>[],
    edges: Edge[],
    rootNodeId: string,
    layout: 'LR' | 'RL' | 'TB' | 'BT',
    siblingNodeId: string
  ): Promise<{
    nodes: Node<MindMapNodeData>[]
    edges: Edge[]
    newNodeId: string
  }> {
    const siblingNode = nodes.find(n => n.id === siblingNodeId)
    if (!siblingNode || !siblingNode.data.parentId) {
      throw new Error('Sibling node not found or has no parent')
    }

    const parentNodeId = siblingNode.data.parentId
    const newNodeId = `node-${Date.now()}`
    const newNode: Node<MindMapNodeData> = {
      id: newNodeId,
      type: 'mindMapNode',
      position: {
        x: siblingNode.position.x + 150,
        y: siblingNode.position.y + 100
      },
      data: {
        id: newNodeId,
        label: 'New Idea',
        isRoot: false,
        parentId: parentNodeId,
        isEditing: true,
        level: siblingNode.data.level || 0
      }
    }

    // Insert after the sibling
    const siblingIndex = nodes.findIndex(n => n.id === siblingNodeId)
    const newNodes = [
      ...nodes.slice(0, siblingIndex + 1),
      newNode,
      ...nodes.slice(siblingIndex + 1)
    ]

    const newEdges = this.dataManager.generateEdges(newNodes, layout)
    
    const { nodes: finalNodes, edges: finalEdges } = await this.applyCompleteLayout(
      newNodes,
      newEdges,
      rootNodeId,
      layout
    )

    return {
      nodes: finalNodes,
      edges: finalEdges,
      newNodeId
    }
  }

  // Delete a node and its children
  async deleteNode(
    nodes: Node<MindMapNodeData>[],
    edges: Edge[],
    rootNodeId: string,
    layout: 'LR' | 'RL' | 'TB' | 'BT',
    nodeIdToDelete: string
  ): Promise<{
    nodes: Node<MindMapNodeData>[]
    edges: Edge[]
  }> {
    if (nodeIdToDelete === rootNodeId) {
      throw new Error('Cannot delete root node')
    }

    const nodeToDelete = nodes.find(n => n.id === nodeIdToDelete)
    if (!nodeToDelete) {
      throw new Error('Node to delete not found')
    }

    // Find all descendants to delete
    const nodesToDelete = new Set([nodeIdToDelete])
    const findDescendants = (nodeId: string) => {
      const children = nodes.filter(n => n.data.parentId === nodeId)
      children.forEach(child => {
        if (!nodesToDelete.has(child.id)) {
          nodesToDelete.add(child.id)
          findDescendants(child.id)
        }
      })
    }
    findDescendants(nodeIdToDelete)

    const newNodes = nodes.filter(node => !nodesToDelete.has(node.id))

    if (newNodes.length === 0 || !newNodes.find(n => n.id === rootNodeId)) {
      throw new Error('Cannot delete all nodes or root node')
    }

    const newEdges = this.dataManager.generateEdges(newNodes, layout)
    
    return await this.applyCompleteLayout(newNodes, newEdges, rootNodeId, layout)
  }

  // Update node label (doesn't require layout recalculation immediately)
  updateNodeLabel(
    nodes: Node<MindMapNodeData>[],
    nodeId: string,
    newLabel: string
  ): Node<MindMapNodeData>[] {
    return nodes.map(node =>
      node.id === nodeId
        ? {
            ...node,
            data: { ...node.data, label: newLabel, isEditing: false }
          }
        : node
    )
  }

  // Update node label and trigger layout recalculation (for width changes)
  async updateNodeLabelWithLayout(
    nodes: Node<MindMapNodeData>[],
    edges: Edge[],
    rootNodeId: string,
    layout: 'LR' | 'RL' | 'TB' | 'BT',
    nodeId: string,
    newLabel: string
  ): Promise<{
    nodes: Node<MindMapNodeData>[]
    edges: Edge[]
  }> {
    const updatedNodes = this.updateNodeLabel(nodes, nodeId, newLabel)
    return await this.applyCompleteLayout(updatedNodes, edges, rootNodeId, layout)
  }

  // Toggle node collapse state
  async toggleNodeCollapse(
    nodes: Node<MindMapNodeData>[],
    edges: Edge[],
    rootNodeId: string,
    layout: 'LR' | 'RL' | 'TB' | 'BT',
    nodeId: string
  ): Promise<{
    nodes: Node<MindMapNodeData>[]
    edges: Edge[]
  }> {
    const updatedNodes = nodes.map(node =>
      node.id === nodeId
        ? {
            ...node,
            data: { ...node.data, isCollapsed: !node.data.isCollapsed }
          }
        : node
    )

    return await this.applyCompleteLayout(updatedNodes, edges, rootNodeId, layout)
  }

  // Move node to new parent
  async moveNode(
    nodes: Node<MindMapNodeData>[],
    edges: Edge[],
    rootNodeId: string,
    layout: 'LR' | 'RL' | 'TB' | 'BT',
    nodeId: string,
    newParentId: string,
    insertIndex?: number
  ): Promise<{
    nodes: Node<MindMapNodeData>[]
    edges: Edge[]
  }> {
    if (nodeId === rootNodeId) {
      throw new Error('Cannot move root node')
    }

    // Prevent cycles
    const wouldCreateCycle = (checkNodeId: string, checkParentId: string): boolean => {
      const findDescendants = (currentNodeId: string): string[] => {
        const descendants: string[] = []
        const childNodes = nodes.filter(node => node.data.parentId === currentNodeId)
        
        for (const childNode of childNodes) {
          descendants.push(childNode.id)
          descendants.push(...findDescendants(childNode.id))
        }
        return descendants
      }

      const descendants = findDescendants(checkNodeId)
      return descendants.includes(checkParentId)
    }

    if (wouldCreateCycle(nodeId, newParentId)) {
      throw new Error('Operation would create a cycle')
    }

    // Update parent relationship
    let updatedNodes = nodes.map(node =>
      node.id === nodeId
        ? { ...node, data: { ...node.data, parentId: newParentId } }
        : node
    )

    // Reorder if insert index is specified
    if (insertIndex !== undefined) {
      const nodeToMove = updatedNodes.find(n => n.id === nodeId)
      if (nodeToMove) {
        updatedNodes = updatedNodes.filter(n => n.id !== nodeId)
        updatedNodes.splice(insertIndex, 0, nodeToMove)
      }
    }

    const newEdges = this.dataManager.generateEdges(updatedNodes, layout)
    
    return await this.applyCompleteLayout(updatedNodes, newEdges, rootNodeId, layout)
  }

  // Change layout direction
  async changeLayout(
    nodes: Node<MindMapNodeData>[],
    edges: Edge[],
    rootNodeId: string,
    newLayout: 'LR' | 'RL' | 'TB' | 'BT'
  ): Promise<{
    nodes: Node<MindMapNodeData>[]
    edges: Edge[]
  }> {
    const newEdges = this.dataManager.generateEdges(nodes, newLayout)
    
    return await this.applyCompleteLayout(nodes, newEdges, rootNodeId, newLayout)
  }

  // Reset layout (re-arrange existing nodes)
  async resetLayout(
    nodes: Node<MindMapNodeData>[],
    edges: Edge[],
    rootNodeId: string,
    layout: 'LR' | 'RL' | 'TB' | 'BT'
  ): Promise<{
    nodes: Node<MindMapNodeData>[]
    edges: Edge[]
  }> {
    return await this.applyCompleteLayout(nodes, edges, rootNodeId, layout, true)
  }

  // Update node chatId
  updateNodeChatId(
    nodes: Node<MindMapNodeData>[],
    nodeId: string,
    chatId: string | null
  ): Node<MindMapNodeData>[] {
    return nodes.map(node => {
      if (node.id === nodeId) {
        return {
          ...node,
          data: { ...node.data, chatId }
        };
      }
      return node;
    });
  }

  // Update node notes
  updateNodeNotes(
    nodes: Node<MindMapNodeData>[],
    nodeId: string,
    notes: string | null
  ): Node<MindMapNodeData>[] {
    return nodes.map(node => {
      if (node.id === nodeId) {
        return {
          ...node,
          data: { ...node.data, notes }
        };
      }
      return node;
    });
  }

  // Update node sources
  updateNodeSources(
    nodes: Node<MindMapNodeData>[],
    nodeId: string,
    sources: Source[]
  ): Node<MindMapNodeData>[] {
    return nodes.map(node => {
      if (node.id === nodeId) {
        return {
          ...node,
          data: { ...node.data, sources }
        };
      }
      return node;
    });
  }
}
