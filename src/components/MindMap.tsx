import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react'
import ReactFlow, {
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  ConnectionMode,
  Controls,
  MiniMap,
  useReactFlow,
  ReactFlowProvider,
  NodeDragHandler,
  XYPosition,
  useNodesInitialized
} from 'reactflow'
import 'reactflow/dist/style.css'
import { MindMapNode, MindMapNodeData } from './MindMapNode'
import { InferenceChatPopup } from './InferenceChatPopup'

const nodeTypes = {
  mindMapNode: MindMapNode
}

interface MindMapNode {
  id: string
  text: string
  notes?: string | null
  side?: 'left' | 'right'
  children?: MindMapNode[]
}

interface MindMapData {
  root: MindMapNode & {
    layout: 'graph-left' | 'graph-right' | 'graph-top' | 'graph-bottom'
  }
}

interface MindMapControls {
  undo: () => void
  redo: () => void
  resetLayout: () => void
  changeLayout: (layout: 'LR' | 'RL' | 'TB' | 'BT') => void
  canUndo: boolean
  canRedo: boolean
  currentLayout: 'LR' | 'RL' | 'TB' | 'BT'
}

interface MindMapProps {
  knowledgeGraphId: string
  onSave: (data: MindMapData) => void
  initialData?: MindMapData
  onControlsReady?: (controls: MindMapControls) => void
  keyBindings?: Record<string, string>
}

interface HistoryState {
  nodes: Node<MindMapNodeData>[]
  rootNodeId: string
  layout: 'LR' | 'RL' | 'TB' | 'BT'
}

// Convert React Flow nodes to tree structure for saving
const convertNodesToTree = (
  nodes: Node<MindMapNodeData>[],
  rootNodeId: string,
  layout: 'LR' | 'RL' | 'TB' | 'BT'
): MindMapData => {
  const rootNode = nodes.find(n => n.id === rootNodeId)
  if (!rootNode) {
    throw new Error('Root node not found')
  }

  // Map layout to tree layout format
  const layoutMap: Record<
    string,
    'graph-left' | 'graph-right' | 'graph-top' | 'graph-bottom'
  > = {
    LR: 'graph-right',
    RL: 'graph-left',
    TB: 'graph-bottom',
    BT: 'graph-top'
  }

  const buildTree = (nodeId: string): MindMapNode => {
    const node = nodes.find(n => n.id === nodeId)
    if (!node) {
      throw new Error(`Node ${nodeId} not found`)
    }

    const children = nodes
      .filter(n => n.data.parentId === nodeId)
      .map(childNode => buildTree(childNode.id))

    return {
      id: node.id,
      text: node.data.label,
      notes: null,
      ...(children.length > 0 && { children })
    }
  }

  const rootTree = buildTree(rootNodeId)

  return {
    root: {
      ...rootTree,
      layout: layoutMap[layout] || 'graph-right'
    }
  }
}

// Convert tree structure to React Flow nodes
const convertTreeToNodes = (
  treeData: MindMapData
): {
  nodes: Node<MindMapNodeData>[]
  rootNodeId: string
  layout: 'LR' | 'RL' | 'TB' | 'BT'
} => {
  const { root } = treeData

  // Map tree layout to React Flow layout
  const layoutMap: Record<string, 'LR' | 'RL' | 'TB' | 'BT'> = {
    'graph-right': 'LR',
    'graph-left': 'RL',
    'graph-bottom': 'TB',
    'graph-top': 'BT'
  }

  const layout = layoutMap[root.layout] || 'LR'
  const nodes: Node<MindMapNodeData>[] = []

  const buildReactFlowNodes = (
    treeNode: MindMapNode,
    parentId?: string,
    level: number = 0
  ) => {
    const reactFlowNode: Node<MindMapNodeData> = {
      id: treeNode.id,
      type: 'mindMapNode',
      position: { x: 0, y: 0 }, // Will be calculated by layout
      data: {
        id: treeNode.id,
        label: treeNode.text,
        isRoot: level === 0,
        parentId,
        level,
        hasChildren:
          (treeNode.children && treeNode.children.length > 0) || false
      }
    }

    nodes.push(reactFlowNode)

    // Process children
    if (treeNode.children) {
      treeNode.children.forEach(child => {
        buildReactFlowNodes(child, treeNode.id, level + 1)
      })
    }
  }

  buildReactFlowNodes(root)

  return {
    nodes,
    rootNodeId: root.id,
    layout
  }
}

// Helper function to generate edges from node hierarchy
const generateEdgesFromHierarchy = (
  nodes: Node<MindMapNodeData>[],
  layout: 'LR' | 'RL' | 'TB' | 'BT' = 'LR'
): Edge[] => {
  const edges: Edge[] = []

  // Determine source and target handles based on layout direction
  let sourceHandle: string, targetHandle: string
  switch (layout) {
    case 'LR': // Left to Right
      sourceHandle = 'right-source'
      targetHandle = 'left'
      break
    case 'RL': // Right to Left
      sourceHandle = 'left-source'
      targetHandle = 'right'
      break
    case 'TB': // Top to Bottom
      sourceHandle = 'bottom-source'
      targetHandle = 'top'
      break
    case 'BT': // Bottom to Top
      sourceHandle = 'top-source'
      targetHandle = 'bottom'
      break
  }

  // Generate edges from parentId relationships
  nodes.forEach(node => {
    if (node.data.parentId) {
      edges.push({
        id: `edge-${node.data.parentId}-${node.id}`,
        source: node.data.parentId,
        target: node.id,
        sourceHandle,
        targetHandle,
        type: 'default',
        style: { stroke: '#64748b', strokeWidth: 2 }
      })
    }
  })

  return edges
}

function MindMapInner ({
  knowledgeGraphId,
  onSave,
  initialData,
  onControlsReady,
  keyBindings = {}
}: MindMapProps) {
  const reactFlowInstance = useReactFlow()
  const nodesInitialized = useNodesInitialized()
  const [nodes, setNodes] = useNodesState<MindMapNodeData>([])
  const [edges, setEdges] = useEdgesState([])
  const [rootNodeId, setRootNodeId] = useState<string>('')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [layout, setLayout] = useState<'LR' | 'RL' | 'TB' | 'BT'>('LR')
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null)
  const [closestDropTarget, setClosestDropTarget] = useState<string | null>(
    null
  )
  const [dropPosition, setDropPosition] = useState<
    'above' | 'below' | 'over' | null
  >(null)
  const [dragStartPosition, setDragStartPosition] = useState<{
    x: number
    y: number
  } | null>(null)
  const [hasDraggedSignificantly, setHasDraggedSignificantly] = useState(false)
  const [dragCursorPosition, setDragCursorPosition] = useState<{
    x: number
    y: number
  } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const lastDragUpdate = useRef<number>(0)
  const lastWidthUpdate = useRef<number>(0)

  // Inference chat state
  const [inferenceChatOpen, setInferenceChatOpen] = useState(false)
  const [inferenceChatNode, setInferenceChatNode] = useState<{
    id: string
    label: string
  } | null>(null)
  const [inferenceChatPosition, setInferenceChatPosition] = useState<{
    x: number
    y: number
  } | null>(null)
  
  // Loading state for hiding graph during layout calculation
  const [isLayouting, setIsLayouting] = useState(false)
  
  // Track if we've already done the initial load to prevent multiple loading states
  const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false)

  // History for undo/redo
  const [history, setHistory] = useState<HistoryState[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const isUndoRedo = useRef(false)
  const isInitializing = useRef(true)
  const stableKey = useRef(knowledgeGraphId)

  // Update edge handles based on layout direction
  const updateEdgeHandles = useCallback(
    (edges: Edge[], direction: 'LR' | 'RL' | 'TB' | 'BT') => {
      let sourceHandle: string, targetHandle: string
      switch (direction) {
        case 'LR': // Left to Right
          sourceHandle = 'right-source'
          targetHandle = 'left'
          break
        case 'RL': // Right to Left
          sourceHandle = 'left-source'
          targetHandle = 'right'
          break
        case 'TB': // Top to Bottom
          sourceHandle = 'bottom-source'
          targetHandle = 'top'
          break
        case 'BT': // Bottom to Top
          sourceHandle = 'top-source'
          targetHandle = 'bottom'
          break
      }

      return edges.map(edge => ({
        ...edge,
        sourceHandle,
        targetHandle
      }))
    },
    []
  )

  // Force ReactFlow to resize when container size changes
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let lastSize = { width: 0, height: 0 }

    const resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) {
        const { width, height } = entry.contentRect

        // Only react to actual size changes
        if (width !== lastSize.width || height !== lastSize.height) {
          lastSize = { width, height }

          // Only force re-render on significant size changes (not during normal operations)
          if (width > 0 && height > 0) {
            setTimeout(() => {
              if (nodesInitialized && nodes.length > 0) {
                const padding = nodes.length <= 3 ? 0.8 : 0.2
                reactFlowInstance.fitView({
                  padding,
                  maxZoom: 1.2,
                  minZoom: 0.5
                })
              }
            }, 150)
          }
        }
      }
    })

    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
    }
  }, [reactFlowInstance, nodesInitialized, nodes.length])

  // Initialize with data or create default root node
  useEffect(() => {
    // Update stable key when knowledge graph actually changes
    if (stableKey.current !== knowledgeGraphId) {
      stableKey.current = knowledgeGraphId
      // Reset loading state for new knowledge graph
      setHasInitiallyLoaded(false)
    }

    if (initialData && initialData.root) {
      // Only show loading state if we haven't already loaded this specific data
      if (!hasInitiallyLoaded) {
        setIsLayouting(true)
      }
      
      // Make layout calculation asynchronous to allow loading state to be visible
      setTimeout(() => {
        // Convert tree structure to React Flow nodes
        const {
          nodes: convertedNodes,
          rootNodeId: convertedRootId,
          layout: loadLayout
        } = convertTreeToNodes(initialData)

        // Generate edges from hierarchy (parentId relationships)
        const generatedEdges = generateEdgesFromHierarchy(
          convertedNodes,
          loadLayout
        )

        // Calculate layout with proper text widths
        const arrangedNodes = arrangeNodes(
          convertedNodes,
          generatedEdges,
          convertedRootId,
          loadLayout
        )
        const updatedNodes = updateNodeLevels(
          arrangedNodes,
          generatedEdges,
          convertedRootId,
          loadLayout
        )

        setNodes(updatedNodes)
        setEdges(generatedEdges)
        setRootNodeId(convertedRootId)
        setLayout(loadLayout)
        
        // Initialize history
        const initialState = {
          nodes: updatedNodes,
          edges: generatedEdges
        }
        setHistory([initialState])
        setHistoryIndex(0)
        
        // Mark as initially loaded and hide loading state
        if (!hasInitiallyLoaded) {
          setHasInitiallyLoaded(true)
          setIsLayouting(false)
        }
      }, 50) // Small delay to ensure loading state is visible

      // View will be centered by the separate fitView effect
    } else if (knowledgeGraphId) {
      // Create initial root node only if we have a knowledge graph ID

      const rootId = `node-${Date.now()}`
      const rootNode: Node<MindMapNodeData> = {
        id: rootId,
        type: 'mindMapNode',
        position: { x: 400, y: 300 },
        data: {
          id: rootId,
          label: 'Central Idea',
          isRoot: true,
          level: 0
        }
      }

      setNodes([rootNode])
      setEdges([])
      setRootNodeId(rootId)

      // Initialize history
      const initialState = {
        nodes: [rootNode],
        rootNodeId: rootId,
        layout: 'LR' as const
      }
      setHistory([initialState])
      setHistoryIndex(0)

      // View will be centered by the separate fitView effect
    }

    // Mark initialization as complete after a brief delay
    setTimeout(() => {
      isInitializing.current = false
    }, 100)
  }, [knowledgeGraphId, initialData, hasInitiallyLoaded, setNodes, setEdges])

  // Minimal fitView only for significant changes
  useEffect(() => {
    // Only fit view when nodes are first loaded or when there's a significant change
    if (nodes.length > 0 && !isInitializing.current) {
      const timeoutId = setTimeout(() => {
        if (!isInitializing.current) {
          // Only fit view for the first node or major changes
          if (nodes.length === 1) {
            reactFlowInstance.fitView({
              padding: 0.8,
              maxZoom: 1.2,
              minZoom: 0.5
            })
          }
        }
      }, 300)

      return () => clearTimeout(timeoutId)
    }
  }, [nodes.length, reactFlowInstance])

  // Save state to history (for undo/redo)
  const saveToHistory = useCallback(
    (
      newNodes: Node<MindMapNodeData>[],
      newRootId: string,
      newLayout?: 'LR' | 'RL' | 'TB' | 'BT'
    ) => {
      if (isUndoRedo.current) {
        isUndoRedo.current = false
        return
      }

      const newState = {
        nodes: newNodes,
        rootNodeId: newRootId,
        layout: newLayout || layout
      }
      const newHistory = history.slice(0, historyIndex + 1)
      newHistory.push(newState)

      // Limit history size
      if (newHistory.length > 50) {
        newHistory.shift()
      } else {
        setHistoryIndex(prev => prev + 1)
      }

      setHistory(newHistory)
    },
    [history, historyIndex, layout]
  )

  // Auto-save when nodes or edges change (debounced)
  useEffect(() => {
    if (nodes.length > 0 && rootNodeId && !isInitializing.current) {
      const timeoutId = setTimeout(() => {
        // Convert nodes to tree structure for saving
        const treeData = convertNodesToTree(nodes, rootNodeId, layout)
        onSave(treeData)
      }, 500) // Debounce saves by 500ms

      return () => clearTimeout(timeoutId)
    }
  }, [nodes, edges, rootNodeId, layout, onSave])

  // Helper function to get visible edges (excluding those leading to collapsed subtrees)
  const getVisibleEdges = useCallback(
    (nodes: Node<MindMapNodeData>[], edges: Edge[]) => {
      const collapsedNodes = new Set(
        nodes.filter(node => node.data.isCollapsed).map(node => node.id)
      )

      const hiddenDescendants = new Set<string>()

      // Find all descendants of collapsed nodes
      const findDescendants = (nodeId: string) => {
        const childEdges = edges.filter(edge => edge.source === nodeId)
        for (const edge of childEdges) {
          hiddenDescendants.add(edge.target)
          findDescendants(edge.target)
        }
      }

      collapsedNodes.forEach(nodeId => findDescendants(nodeId))

      return edges.filter(edge => !hiddenDescendants.has(edge.target))
    },
    []
  )

  // Helper function to get visible nodes (excluding collapsed subtrees)
  const getVisibleNodes = useCallback(
    (nodes: Node<MindMapNodeData>[], edges: Edge[]) => {
      const collapsedNodes = new Set(
        nodes.filter(node => node.data.isCollapsed).map(node => node.id)
      )

      const hiddenDescendants = new Set<string>()

      // Find all descendants of collapsed nodes
      const findDescendants = (nodeId: string) => {
        const childEdges = edges.filter(edge => edge.source === nodeId)
        for (const edge of childEdges) {
          hiddenDescendants.add(edge.target)
          findDescendants(edge.target)
        }
      }

      collapsedNodes.forEach(nodeId => findDescendants(nodeId))

      return nodes.filter(node => !hiddenDescendants.has(node.id))
    },
    []
  )

  // Calculate node levels and update layout
  const updateNodeLevels = useCallback(
    (
      nodes: Node<MindMapNodeData>[],
      edges: Edge[],
      rootId: string,
      layout: 'LR' | 'RL' | 'TB' | 'BT'
    ) => {
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

      // Update nodes with levels, root status, and hasChildren info
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
    },
    []
  )

  // Hierarchical layout with proper depth-based positioning
  const arrangeNodes = useCallback(
    (
      nodes: Node<MindMapNodeData>[],
      edges: Edge[],
      rootId: string,
      direction: 'LR' | 'RL' | 'TB' | 'BT' = layout
    ) => {
      const rootNode = nodes.find(n => n.id === rootId)
      if (!rootNode) return nodes

      // Get visible edges (exclude edges to collapsed subtrees)
      const visibleEdges = getVisibleEdges(nodes, edges)

      // Build tree structure using only visible edges
      const children = new Map<string, string[]>()
      visibleEdges.forEach(edge => {
        if (!children.has(edge.source)) {
          children.set(edge.source, [])
        }
        children.get(edge.source)!.push(edge.target)
      })

      // Sort children based on their order in the nodes array to preserve sibling order
      const nodeOrderMap = new Map<string, number>()
      nodes.forEach((node, index) => {
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

      // Calculate actual text widths for spacing calculations
      const nodeWidths = new Map<string, number>()
      
      // Create a temporary canvas element for text measurement
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (ctx) {
        // Use the same font as MindMapNode component
        ctx.font = '14px system-ui, -apple-system, sans-serif'
        
        nodes.forEach(node => {
          const text = node.data.label || ''
          const textWidth = ctx.measureText(text).width
          const padding = 32 // 16px padding on each side
          const minWidth = 120
          const maxWidth = 800
          const calculatedWidth = Math.min(Math.max(textWidth + padding, minWidth), maxWidth)
          
          nodeWidths.set(node.id, calculatedWidth)
        })
      } else {
        // Fallback to existing width or default
        nodes.forEach(node => {
          nodeWidths.set(node.id, node.data.width || 120)
        })
      }

      // Recursively calculate positions and depths
      interface TreeNode {
        id: string
        depth: number
        siblingIndex: number
        subtreeSize: number
        x: number
        y: number
      }

      const treeNodes = new Map<string, TreeNode>()

      // Step 1: Calculate subtree sizes (post-order)
      const calculateSubtreeSize = (nodeId: string, depth: number): number => {
        const nodeChildren = children.get(nodeId) || []

        if (nodeChildren.length === 0) {
          return 1 // Leaf node has size 1
        }

        let totalSize = 0
        for (const childId of nodeChildren) {
          totalSize += calculateSubtreeSize(childId, depth + 1)
        }

        return Math.max(totalSize, 1)
      }

      // Step 2: Position nodes based on subtree sizes
      const positionNodes = (
        nodeId: string,
        depth: number,
        siblingIndex: number,
        startY: number
      ): number => {
        const nodeChildren = children.get(nodeId) || []
        const subtreeSize = calculateSubtreeSize(nodeId, depth)

        // Calculate this node's position
        const nodeY = startY + (subtreeSize * NODE_SPACING) / 2

        // Store node data
        treeNodes.set(nodeId, {
          id: nodeId,
          depth,
          siblingIndex,
          subtreeSize,
          x: 0, // Will be set based on depth
          y: nodeY
        })

        // Position children
        let currentY = startY
        for (let i = 0; i < nodeChildren.length; i++) {
          const childId = nodeChildren[i]
          calculateSubtreeSize(childId, depth + 1) // Calculate size for positioning
          const childEndY = positionNodes(childId, depth + 1, i, currentY)
          currentY = childEndY
        }

        return startY + subtreeSize * NODE_SPACING
      }

      // Execute positioning starting from root
      positionNodes(rootId, 0, 0, 0)

      // Step 3: Convert to screen coordinates
      const positions = new Map<string, { x: number; y: number }>()
      const ROOT_X = 600
      const ROOT_Y = 400

      // Calculate bounds to center the tree
      let minY = Infinity
      let maxY = -Infinity

      for (const node of treeNodes.values()) {
        minY = Math.min(minY, node.y)
        maxY = Math.max(maxY, node.y)
      }

      const treeHeight = maxY - minY
      const yOffset = -treeHeight / 2

      // Calculate individual node spacing based on parent positions and widths
      const nodeSpacing = new Map<string, number>()
      
      // Build parent-child relationships
      const parentMap = new Map<string, string>()
      visibleEdges.forEach(edge => {
        parentMap.set(edge.target, edge.source)
      })
      
      // Calculate X position for each node based on its specific parent
      const calculateNodeSpacing = (nodeId: string): number => {
        // Root node is at position 0
        if (nodeId === rootId) {
          nodeSpacing.set(nodeId, 0)
          return 0
        }
        
        // Check if already calculated
        if (nodeSpacing.has(nodeId)) {
          return nodeSpacing.get(nodeId)!
        }
        
        const parentId = parentMap.get(nodeId)
        if (!parentId) {
          // No parent found, use base level spacing
          nodeSpacing.set(nodeId, LEVEL_SPACING)
          return LEVEL_SPACING
        }
        
        // Get parent's position and width
        const parentPosition = calculateNodeSpacing(parentId)
        const parentWidth = nodeWidths.get(parentId) || 120
        
        // Position child: parent position + parent width + gap
        // Use minimum of parent-based spacing or standard level spacing
        const parentBasedSpacing = parentPosition + parentWidth + 60 // 60px gap
        const levelBasedSpacing = parentPosition + LEVEL_SPACING
        const newPosition = Math.max(parentBasedSpacing, levelBasedSpacing)
        
        nodeSpacing.set(nodeId, newPosition)
        return newPosition
      }
      
      // Calculate spacing for all nodes
      for (const node of treeNodes.values()) {
        calculateNodeSpacing(node.id)
      }

      for (const node of treeNodes.values()) {
        let screenX: number, screenY: number
        const nodeWidth = nodeWidths.get(node.id) || 120

        switch (direction) {
          case 'LR': // Left to Right
            // Use individual node spacing
            screenX = ROOT_X + (nodeSpacing.get(node.id) || 0)
            screenY = ROOT_Y + node.y + yOffset
            break
          case 'RL': // Right to Left
            // Use individual node spacing (negative for right to left)
            screenX = ROOT_X - (nodeSpacing.get(node.id) || 0)
            screenY = ROOT_Y + node.y + yOffset
            break
          case 'TB': // Top to Bottom
            screenX = ROOT_X + node.y + yOffset
            screenY = ROOT_Y + node.depth * LEVEL_SPACING
            break
          case 'BT': // Bottom to Top
            screenX = ROOT_X + node.y + yOffset
            screenY = ROOT_Y - node.depth * LEVEL_SPACING
            break
          default:
            // Default to LR layout
            screenX = ROOT_X + (nodeSpacing.get(node.id) || 0)
            screenY = ROOT_Y + node.y + yOffset
        }

        positions.set(node.id, { x: screenX, y: screenY })
      }

      // Apply positions to nodes - only return nodes that actually exist
      return nodes.map(node => {
        const newPosition = positions.get(node.id)
        if (newPosition) {
          return { ...node, position: newPosition }
        }
        // Keep existing position for hidden/collapsed nodes
        return node
      })
    },
    [layout, getVisibleEdges]
  )

  // Event listeners for inference chat and node width changes
  useEffect(() => {
    const handleInferenceOpen = (event: CustomEvent) => {
      const { nodeId, label, position } = event.detail
      setInferenceChatNode({ id: nodeId, label })
      setInferenceChatPosition(position)
      setInferenceChatOpen(true)
    }

    const handleInferenceClose = () => {
      setInferenceChatOpen(false)
      setInferenceChatNode(null)
      setInferenceChatPosition(null)
    }

    const handleNodeWidthChange = (event: CustomEvent) => {
      const { nodeId, width } = event.detail
      
      // Throttle width updates to prevent overwhelming React Flow (max 10 updates per second)
      const now = Date.now()
      if (now - lastWidthUpdate.current < 100) {
        return
      }
      lastWidthUpdate.current = now
      
      setNodes(prevNodes => {
        const updatedNodes = prevNodes.map(node =>
          node.id === nodeId ? { ...node, data: { ...node.data, width } } : node
        )

        // Use requestAnimationFrame to batch layout updates and prevent overwhelming React Flow
        requestAnimationFrame(() => {
          const generatedEdges = generateEdgesFromHierarchy(
            updatedNodes,
            layout
          )
          const arrangedNodes = arrangeNodes(
            updatedNodes,
            generatedEdges,
            rootNodeId
          )
          const finalNodes = updateNodeLevels(
            arrangedNodes,
            generatedEdges,
            rootNodeId,
            layout
          )

          setNodes(finalNodes)
          setEdges(generatedEdges)
        })

        return updatedNodes
      })
    }

    window.addEventListener(
      'mindmap-inference-open',
      handleInferenceOpen as EventListener
    )
    window.addEventListener('mindmap-inference-close', handleInferenceClose)
    window.addEventListener(
      'mindmap-node-width-change',
      handleNodeWidthChange as EventListener
    )

    return () => {
      window.removeEventListener(
        'mindmap-inference-open',
        handleInferenceOpen as EventListener
      )
      window.removeEventListener(
        'mindmap-inference-close',
        handleInferenceClose
      )
      window.removeEventListener(
        'mindmap-node-width-change',
        handleNodeWidthChange as EventListener
      )
    }
  }, [layout, rootNodeId, arrangeNodes, updateNodeLevels, setNodes, setEdges])





  // Add a new child node connected to the selected node
  const addChildNode = useCallback(
    (parentNodeId: string) => {
      const newNodeId = `node-${Date.now()}`
      const parentNode = nodes.find(n => n.id === parentNodeId)
      if (!parentNode) return

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

      // Generate edges from hierarchy
      const generatedEdges = generateEdgesFromHierarchy(newNodes, layout)

      const arrangedNodes = arrangeNodes(newNodes, generatedEdges, rootNodeId)
      const updatedNodes = updateNodeLevels(
        arrangedNodes,
        generatedEdges,
        rootNodeId,
        layout
      )

      // Mark the new node as selected in React Flow
      const updatedNodesWithSelection = updatedNodes.map(node => ({
        ...node,
        selected: node.id === newNodeId
      }))

      saveToHistory(updatedNodesWithSelection, rootNodeId)
      setNodes(updatedNodesWithSelection)
      setEdges(generatedEdges)

      // Update our custom selected state
      setSelectedNodeId(newNodeId)

      // Force save immediately when adding a node
      setTimeout(() => {
        // Convert nodes to tree structure for saving
        const treeData = convertNodesToTree(
          updatedNodesWithSelection,
          rootNodeId,
          layout
        )
        onSave(treeData)
      }, 100)

      // Auto-fit view after adding node (handled by fitView effect)
    },
    [
      nodes,
      edges,
      rootNodeId,
      arrangeNodes,
      updateNodeLevels,
      saveToHistory,
      setNodes,
      setEdges,
      onSave,
      reactFlowInstance
    ]
  )

  // Add a new sibling node (same parent as selected node)
  const addSiblingNode = useCallback(
    (siblingNodeId: string) => {
      // Find the parent of the selected node
      const siblingNode = nodes.find(n => n.id === siblingNodeId)
      if (!siblingNode || !siblingNode.data.parentId) {
        // No parent found (this is the root node)
        return
      }

      const parentNodeId = siblingNode.data.parentId
      const parentNode = nodes.find(n => n.id === parentNodeId)
      if (!parentNode || !siblingNode) return

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

      // Insert the new node right after the selected sibling node
      const siblingIndex = nodes.findIndex(n => n.id === siblingNodeId)
      const newNodes = [
        ...nodes.slice(0, siblingIndex + 1),
        newNode,
        ...nodes.slice(siblingIndex + 1)
      ]

      // Generate edges from hierarchy
      const generatedEdges = generateEdgesFromHierarchy(newNodes, layout)

      const arrangedNodes = arrangeNodes(newNodes, generatedEdges, rootNodeId)
      const updatedNodes = updateNodeLevels(
        arrangedNodes,
        generatedEdges,
        rootNodeId,
        layout
      )

      // Mark the new node as selected in React Flow
      const updatedNodesWithSelection = updatedNodes.map(node => ({
        ...node,
        selected: node.id === newNodeId
      }))

      saveToHistory(updatedNodesWithSelection, rootNodeId)
      setNodes(updatedNodesWithSelection)
      setEdges(generatedEdges)

      // Update our custom selected state
      setSelectedNodeId(newNodeId)

      // Force save immediately when adding a sibling node
      setTimeout(() => {
        // Convert nodes to tree structure for saving
        const treeData = convertNodesToTree(
          updatedNodesWithSelection,
          rootNodeId,
          layout
        )
        onSave(treeData)
      }, 100)

      // Auto-fit view after adding sibling node (handled by fitView effect)
    },
    [
      nodes,
      edges,
      rootNodeId,
      layout,
      arrangeNodes,
      updateNodeLevels,
      saveToHistory,
      setNodes,
      setEdges,
      onSave,
      reactFlowInstance
    ]
  )

  // Delete a node and all its children
  const deleteNode = useCallback(
    (nodeIdToDelete: string) => {
      if (nodeIdToDelete === rootNodeId) return // Can't delete root

      // Check if the node exists
      const nodeToDelete = nodes.find(n => n.id === nodeIdToDelete)
      if (!nodeToDelete) {
        return
      }

      // Find all nodes to delete (node + all descendants)
      const nodesToDelete = new Set([nodeIdToDelete])
      const findDescendants = (nodeId: string) => {
        const childEdges = edges.filter(edge => edge.source === nodeId)
        for (const edge of childEdges) {
          if (!nodesToDelete.has(edge.target)) {
            nodesToDelete.add(edge.target)
            findDescendants(edge.target)
          }
        }
      }
      findDescendants(nodeIdToDelete)

      const newNodes = nodes.filter(node => !nodesToDelete.has(node.id))

      // Ensure we still have at least the root node
      if (newNodes.length === 0 || !newNodes.find(n => n.id === rootNodeId)) {
        return
      }

      // Generate edges from updated hierarchy
      const generatedEdges = generateEdgesFromHierarchy(newNodes, layout)

      // Re-arrange nodes after deletion
      const arrangedNodes = arrangeNodes(newNodes, generatedEdges, rootNodeId)
      const updatedNodes = updateNodeLevels(
        arrangedNodes,
        generatedEdges,
        rootNodeId,
        layout
      )

      saveToHistory(updatedNodes, rootNodeId)
      setNodes(updatedNodes)
      setEdges(generatedEdges)
      setSelectedNodeId(null)

      // Force save immediately when deleting nodes
      setTimeout(() => {
        // Convert nodes to tree structure for saving
        const treeData = convertNodesToTree(updatedNodes, rootNodeId, layout)
        onSave(treeData)
      }, 100)

      // Auto-fit view after deleting node (handled by fitView effect)
    },
    [
      nodes,
      edges,
      rootNodeId,
      layout,
      arrangeNodes,
      updateNodeLevels,
      saveToHistory,
      setNodes,
      setEdges,
      onSave,
      reactFlowInstance
    ]
  )

  // Event handlers for context menu actions - use refs to avoid constant re-registration
  const addChildNodeRef = useRef(addChildNode)
  const addSiblingNodeRef = useRef(addSiblingNode)
  const deleteNodeRef = useRef(deleteNode)

  // Update refs when functions change
  useEffect(() => {
    addChildNodeRef.current = addChildNode
    addSiblingNodeRef.current = addSiblingNode
    deleteNodeRef.current = deleteNode
  }, [addChildNode, addSiblingNode, deleteNode])

  // Event listeners for context menu actions - only set up once
  useEffect(() => {
    const handleAddChildEvent = (event: CustomEvent) => {
      const { nodeId } = event.detail
      addChildNodeRef.current(nodeId)
    }

    const handleAddSiblingEvent = (event: CustomEvent) => {
      const { nodeId } = event.detail
      addSiblingNodeRef.current(nodeId)
    }

    const handleDeleteNodeEvent = (event: CustomEvent) => {
      const { nodeId } = event.detail
      deleteNodeRef.current(nodeId)
    }

    window.addEventListener(
      'mindmap-add-child',
      handleAddChildEvent as EventListener
    )
    window.addEventListener(
      'mindmap-add-sibling',
      handleAddSiblingEvent as EventListener
    )
    window.addEventListener(
      'mindmap-delete-node',
      handleDeleteNodeEvent as EventListener
    )

    return () => {
      window.removeEventListener(
        'mindmap-add-child',
        handleAddChildEvent as EventListener
      )
      window.removeEventListener(
        'mindmap-add-sibling',
        handleAddSiblingEvent as EventListener
      )
      window.removeEventListener(
        'mindmap-delete-node',
        handleDeleteNodeEvent as EventListener
      )
    }
  }, []) // Empty dependency array - only set up once

  // Update node label
  const updateNodeLabel = useCallback(
    (nodeId: string, newLabel: string) => {
      const updatedNodes = nodes.map(node =>
        node.id === nodeId
          ? {
              ...node,
              data: { ...node.data, label: newLabel, isEditing: false }
            }
          : node
      )
      setNodes(updatedNodes)
    },
    [nodes, setNodes]
  )

  // Toggle collapse state of a node
  const toggleNodeCollapse = useCallback(
    (nodeId: string) => {
      const updatedNodes = nodes.map(node =>
        node.id === nodeId
          ? {
              ...node,
              data: { ...node.data, isCollapsed: !node.data.isCollapsed }
            }
          : node
      )

      // Re-arrange nodes with new collapse state - keep all edges
      const arrangedNodes = arrangeNodes(updatedNodes, edges, rootNodeId)
      const finalNodes = updateNodeLevels(
        arrangedNodes,
        edges,
        rootNodeId,
        layout
      )

      saveToHistory(finalNodes, edges, rootNodeId)
      setNodes(finalNodes)
      // Don't modify edges - keep them all

      // Force save immediately when toggling collapse
      setTimeout(() => {
        // Convert nodes to tree structure for saving
        const treeData = convertNodesToTree(finalNodes, rootNodeId, layout)
        onSave(treeData)
      }, 100)
    },
    [
      nodes,
      edges,
      rootNodeId,
      layout,
      arrangeNodes,
      updateNodeLevels,
      saveToHistory,
      setNodes,
      onSave
    ]
  )

  // Undo/Redo functions
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      isUndoRedo.current = true
      const prevState = history[historyIndex - 1]
      const generatedEdges = generateEdgesFromHierarchy(
        prevState.nodes,
        prevState.layout
      )
      setNodes(prevState.nodes)
      setEdges(generatedEdges)
      setRootNodeId(prevState.rootNodeId)
      setLayout(prevState.layout)
      setHistoryIndex(prev => prev - 1)
    }
  }, [history, historyIndex, setNodes, setEdges])

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      isUndoRedo.current = true
      const nextState = history[historyIndex + 1]
      const generatedEdges = generateEdgesFromHierarchy(
        nextState.nodes,
        nextState.layout
      )
      setNodes(nextState.nodes)
      setEdges(generatedEdges)
      setRootNodeId(nextState.rootNodeId)
      setLayout(nextState.layout)
      setHistoryIndex(prev => prev + 1)
    }
  }, [history, historyIndex, setNodes, setEdges])

  // Reset to initial layout
  const resetLayout = useCallback(() => {
    const arrangedNodes = arrangeNodes(nodes, edges, rootNodeId)
    setNodes(arrangedNodes)
    // Auto-fit view is handled by the fitView effect
  }, [nodes, edges, rootNodeId, layout, arrangeNodes, setNodes])

  // Change layout direction
  const changeLayout = useCallback(
    (newLayout: 'LR' | 'RL' | 'TB' | 'BT') => {
      const arrangedNodes = arrangeNodes(nodes, edges, rootNodeId, newLayout)
      const updatedNodes = updateNodeLevels(
        arrangedNodes,
        edges,
        rootNodeId,
        newLayout
      )
      const updatedEdges = updateEdgeHandles(edges, newLayout)

      setLayout(newLayout)
      setNodes(updatedNodes)
      setEdges(updatedEdges)
      saveToHistory(updatedNodes, updatedEdges, rootNodeId, newLayout)

      // Force save immediately when changing layout
      setTimeout(() => {
        const data: MindMapData = {
          nodes: updatedNodes,
          edges: updatedEdges,
          rootNodeId,
          layout: newLayout
        }

        onSave(data)
      }, 100)

      // Auto-fit view after layout change
      setTimeout(() => {
        // Adjust padding based on number of nodes to prevent excessive zoom with few nodes
        const padding = updatedNodes.length <= 3 ? 0.8 : 0.2
        reactFlowInstance.fitView({ padding, maxZoom: 1.2, minZoom: 0.5 })
      }, 200)
    },
    [
      nodes,
      edges,
      rootNodeId,
      arrangeNodes,
      updateNodeLevels,
      updateEdgeHandles,
      setNodes,
      setEdges,
      saveToHistory,
      onSave,
      reactFlowInstance
    ]
  )

  // Expose controls to parent component
  useEffect(() => {
    if (onControlsReady) {
      const controls: MindMapControls = {
        undo,
        redo,
        resetLayout,
        changeLayout,
        canUndo: historyIndex > 0,
        canRedo: historyIndex < history.length - 1,
        currentLayout: layout
      }
      onControlsReady(controls)
    }
  }, [
    onControlsReady,
    undo,
    redo,
    resetLayout,
    changeLayout,
    historyIndex,
    history.length,
    layout
  ])

  // Open inference for the currently selected node
  const openInferenceForSelectedNode = useCallback(() => {
    if (!selectedNodeId) return

    const selectedNode = nodes.find(n => n.id === selectedNodeId)
    if (!selectedNode) return

    // Find the node element in the DOM to get its position
    const nodeElement = document.querySelector(`[data-id="${selectedNodeId}"]`)
    let position = { x: window.innerWidth / 2, y: window.innerHeight / 2 } // fallback to center

    if (nodeElement) {
      const rect = nodeElement.getBoundingClientRect()
      position = {
        x: rect.left,
        y: rect.top + rect.height / 2
      }
    }

    window.dispatchEvent(
      new CustomEvent('mindmap-inference-open', {
        detail: {
          nodeId: selectedNodeId,
          label: selectedNode.data.label,
          position
        }
      })
    )
  }, [selectedNodeId, nodes])

  // Helper function to check if key matches binding
  const matchesKeyBinding = useCallback(
    (e: KeyboardEvent, bindingKey: string) => {
      const modifiers = []
      if (e.ctrlKey || e.metaKey) modifiers.push('Ctrl')
      if (e.shiftKey) modifiers.push('Shift')
      if (e.altKey) modifiers.push('Alt')

      let key = e.key
      if (key === ' ') key = 'Space'

      const pressedKey =
        modifiers.length > 0 ? `${modifiers.join('+')}+${key}` : key
      return pressedKey === bindingKey
    },
    []
  )

  // Get key binding with fallback to default
  const getKeyBinding = useCallback(
    (action: string, defaultKey: string) => {
      return keyBindings[action] || defaultKey
    },
    [keyBindings]
  )

  // Keyboard event handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return

      if (
        matchesKeyBinding(e, getKeyBinding('addChild', 'Tab')) &&
        selectedNodeId
      ) {
        e.preventDefault()
        addChildNode(selectedNodeId)
      } else if (
        matchesKeyBinding(e, getKeyBinding('addSibling', 'Enter')) &&
        selectedNodeId
      ) {
        e.preventDefault()
        addSiblingNode(selectedNodeId)
      } else if (
        matchesKeyBinding(e, getKeyBinding('deleteNode', 'Delete')) &&
        selectedNodeId
      ) {
        e.preventDefault()
        deleteNode(selectedNodeId)
      } else if (matchesKeyBinding(e, getKeyBinding('undo', 'Ctrl+Z'))) {
        e.preventDefault()
        undo()
      } else if (matchesKeyBinding(e, getKeyBinding('redo', 'Ctrl+Shift+Z'))) {
        e.preventDefault()
        redo()
      } else if (matchesKeyBinding(e, getKeyBinding('redoAlt', 'Ctrl+Y'))) {
        e.preventDefault()
        redo()
      } else if (
        matchesKeyBinding(e, getKeyBinding('openInference', '.')) &&
        selectedNodeId
      ) {
        e.preventDefault()
        openInferenceForSelectedNode()
      }
    }

    const handleNodeUpdate = (e: CustomEvent) => {
      updateNodeLabel(e.detail.nodeId, e.detail.label)
    }

    const handleToggleCollapse = (e: CustomEvent) => {
      toggleNodeCollapse(e.detail.nodeId)
    }

    const handleNodeSelect = (e: CustomEvent) => {
      const { nodeId } = e.detail
      setSelectedNodeId(nodeId)
      setNodes((currentNodes: Node<MindMapNodeData>[]) =>
        currentNodes.map(n => ({
          ...n,
          selected: n.id === nodeId
        }))
      )
      // Close any open context menus when selecting a node
      window.dispatchEvent(new CustomEvent('mindmap-close-context-menu'))
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener(
      'mindmap-node-update',
      handleNodeUpdate as EventListener
    )
    window.addEventListener(
      'mindmap-toggle-collapse',
      handleToggleCollapse as EventListener
    )
    window.addEventListener(
      'mindmap-node-select',
      handleNodeSelect as EventListener
    )

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener(
        'mindmap-node-update',
        handleNodeUpdate as EventListener
      )
      window.removeEventListener(
        'mindmap-toggle-collapse',
        handleToggleCollapse as EventListener
      )
      window.removeEventListener(
        'mindmap-node-select',
        handleNodeSelect as EventListener
      )
    }
  }, [
    selectedNodeId,
    addChildNode,
    addSiblingNode,
    deleteNode,
    undo,
    redo,
    updateNodeLabel,
    toggleNodeCollapse,
    matchesKeyBinding,
    getKeyBinding,
    openInferenceForSelectedNode
  ])

  // Manual connections disabled - edges are created automatically
  const onConnect = useCallback(() => {
    // Do nothing - connections are handled automatically
  }, [])

  const onNodeClick = useCallback(
    (_: React.MouseEvent | React.TouchEvent, node: Node) => {
      setSelectedNodeId(node.id)

      // Update nodes to mark the clicked one as selected
      // Use functional update to avoid stale closure issues
      setNodes((currentNodes: Node<MindMapNodeData>[]) =>
        currentNodes.map(n => ({
          ...n,
          selected: n.id === node.id
        }))
      )

      // Close any open context menus when clicking on a node
      window.dispatchEvent(new CustomEvent('mindmap-close-context-menu'))
    },
    [setNodes]
  )

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null)

    // Clear selection from all nodes
    const updatedNodes = nodes.map(n => ({
      ...n,
      selected: false
    }))
    setNodes(updatedNodes)

    // Close any open context menus when clicking on the pane
    window.dispatchEvent(new CustomEvent('mindmap-close-context-menu'))
  }, [nodes, setNodes])

  // Edge clicking disabled - edges are not user-editable
  const onEdgeClick = useCallback(() => {
    // Do nothing - edges are not interactive
  }, [])

  // Find the closest node to a given position
  const findClosestNode = useCallback(
    (position: XYPosition, excludeNodeId: string): string | null => {
      let closestNode: string | null = null
      let closestDistance = Infinity

      for (const node of nodes) {
        if (node.id === excludeNodeId) continue

        const distance = Math.sqrt(
          Math.pow(node.position.x - position.x, 2) +
            Math.pow(node.position.y - position.y, 2)
        )

        if (distance < closestDistance) {
          closestDistance = distance
          closestNode = node.id
        }
      }

      return closestNode
    },
    [nodes]
  )

  // Determine drop position relative to target node
  const getDropPosition = useCallback(
    (
      dragPosition: XYPosition,
      targetNodeId: string
    ): 'above' | 'below' | 'over' => {
      const targetNode = nodes.find(n => n.id === targetNodeId)
      if (!targetNode) return 'over'

      // Root node can only accept child nodes, not sibling positioning
      if (targetNodeId === rootNodeId) {
        return 'over'
      }

      const THRESHOLD = 30 // pixels from center to trigger sibling positioning

      // Calculate offset from target node center based on layout direction
      let offset: number

      switch (layout) {
        case 'LR': // Left to Right - use vertical offset (above/below)
        case 'RL': // Right to Left - use vertical offset (above/below)
          offset = dragPosition.y - targetNode.position.y
          break
        case 'TB': // Top to Bottom - use horizontal offset (left/right, but return above/below for consistency)
        case 'BT': // Bottom to Top - use horizontal offset (left/right, but return above/below for consistency)
          offset = dragPosition.x - targetNode.position.x
          break
        default:
          offset = dragPosition.y - targetNode.position.y
      }

      if (offset < -THRESHOLD) {
        return 'above' // 'above' means 'before' in the layout direction
      } else if (offset > THRESHOLD) {
        return 'below' // 'below' means 'after' in the layout direction
      } else {
        return 'over'
      }
    },
    [nodes, rootNodeId, layout]
  )

  // Check if moving nodeId under parentId would create a cycle
  const wouldCreateCycle = useCallback(
    (nodeId: string, parentId: string): boolean => {
      // Check if parentId is a descendant of nodeId using parentId relationships
      const findDescendants = (currentNodeId: string): string[] => {
        const descendants: string[] = []
        const childNodes = nodes.filter(
          node => node.data.parentId === currentNodeId
        )

        for (const childNode of childNodes) {
          descendants.push(childNode.id)
          descendants.push(...findDescendants(childNode.id))
        }

        return descendants
      }

      const descendants = findDescendants(nodeId)
      return descendants.includes(parentId)
    },
    [nodes]
  )

  // Handle positioning a node as sibling (above or below target)
  const handleSiblingPositioning = useCallback(
    (nodeId: string, targetNodeId: string, position: 'above' | 'below') => {
      // Find the parent of the target node
      const targetNode = nodes.find(n => n.id === targetNodeId)
      if (!targetNode || !targetNode.data.parentId) return // Target has no parent (is root)

      const parentNodeId = targetNode.data.parentId

      // Update the dragged node's parentId
      const updatedNodes = nodes.map(node =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, parentId: parentNodeId } }
          : node
      )

      // Reorder nodes in array to position correctly relative to target
      const nodesCopy = [...updatedNodes]
      const draggedNodeIndex = nodesCopy.findIndex(n => n.id === nodeId)
      const targetNodeIndex = nodesCopy.findIndex(n => n.id === targetNodeId)

      if (draggedNodeIndex !== -1 && targetNodeIndex !== -1) {
        // Remove dragged node from current position
        const [draggedNode] = nodesCopy.splice(draggedNodeIndex, 1)

        // Find new target index (accounting for removal)
        const newTargetIndex =
          draggedNodeIndex < targetNodeIndex
            ? targetNodeIndex - 1
            : targetNodeIndex

        // Insert at appropriate position
        const insertIndex =
          position === 'above' ? newTargetIndex : newTargetIndex + 1
        nodesCopy.splice(insertIndex, 0, draggedNode)
      }

      // Generate edges from updated hierarchy
      const generatedEdges = generateEdgesFromHierarchy(nodesCopy, layout)

      // Rearrange and update the nodes
      const arrangedNodes = arrangeNodes(nodesCopy, generatedEdges, rootNodeId)
      const finalNodes = updateNodeLevels(
        arrangedNodes,
        generatedEdges,
        rootNodeId,
        layout
      )

      saveToHistory(finalNodes, rootNodeId)
      setNodes(finalNodes)
      setEdges(generatedEdges)

      // Force save immediately
      setTimeout(() => {
        const treeData = convertNodesToTree(finalNodes, rootNodeId, layout)
        onSave(treeData)
      }, 100)
    },
    [
      nodes,
      edges,
      layout,
      rootNodeId,
      arrangeNodes,
      updateNodeLevels,
      saveToHistory,
      setNodes,
      setEdges,
      onSave
    ]
  )

  // Handle node drag to restructure the mindmap
  const handleNodeDrag = useCallback(
    (
      nodeId: string,
      newPosition: XYPosition,
      dragPosition: 'above' | 'below' | 'over'
    ) => {
      // Don't allow dragging the root node
      if (nodeId === rootNodeId) {
        return
      }

      // Find the closest node to the drag position
      const closestNodeId = findClosestNode(newPosition, nodeId)

      if (!closestNodeId || closestNodeId === nodeId) {
        return // No valid target found
      }

      // Handle sibling positioning (above/below)
      if (dragPosition === 'above' || dragPosition === 'below') {
        // Check if target node has a parent (can't position relative to root)
        const targetNode = nodes.find(n => n.id === closestNodeId)
        if (targetNode && targetNode.data.parentId) {
          handleSiblingPositioning(nodeId, closestNodeId, dragPosition)
          return
        }
        // If target has no parent, fall through to child positioning
      }

      // Handle child positioning (over)
      // Check if this would create a cycle
      if (wouldCreateCycle(nodeId, closestNodeId)) {
        return // Prevent cycles
      }

      // Find current parent of the dragged node
      const draggedNode = nodes.find(n => n.id === nodeId)

      // If already a child of the closest node, no change needed
      if (draggedNode && draggedNode.data.parentId === closestNodeId) {
        return
      }

      // Update the dragged node's parentId to make it a child of the closest node
      const updatedNodes = nodes.map(node =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, parentId: closestNodeId } }
          : node
      )

      // Generate edges from updated hierarchy
      const generatedEdges = generateEdgesFromHierarchy(updatedNodes, layout)

      // Rearrange and update the nodes
      const arrangedNodes = arrangeNodes(
        updatedNodes,
        generatedEdges,
        rootNodeId
      )
      const finalNodes = updateNodeLevels(
        arrangedNodes,
        generatedEdges,
        rootNodeId,
        layout
      )

      saveToHistory(finalNodes, rootNodeId)
      setNodes(finalNodes)
      setEdges(generatedEdges)

      // Force save immediately
      setTimeout(() => {
        const treeData = convertNodesToTree(finalNodes, rootNodeId, layout)
        onSave(treeData)
      }, 100)

      // Auto-fit view after drag
      setTimeout(() => {
        reactFlowInstance.fitView({ padding: 0.2 })
      }, 150)
    },
    [
      rootNodeId,
      nodes,
      edges,
      layout,
      findClosestNode,
      wouldCreateCycle,
      handleSiblingPositioning,
      arrangeNodes,
      updateNodeLevels,
      saveToHistory,
      setNodes,
      setEdges,
      onSave,
      reactFlowInstance
    ]
  )

  // Handle drag start event
  const onNodeDragStart: NodeDragHandler = useCallback(
    (_, node) => {
      // Don't allow dragging the root node
      if (node.id === rootNodeId) {
        return
      }
      setDraggedNodeId(node.id)
      setDragStartPosition({ x: node.position.x, y: node.position.y })
      setHasDraggedSignificantly(false)
    },
    [rootNodeId]
  )

  // Handle drag events (while dragging)
  const onNodeDrag: NodeDragHandler = useCallback(
    (event, node) => {
      if (
        node.id === rootNodeId ||
        node.id !== draggedNodeId ||
        !dragStartPosition
      ) {
        return
      }

      // Track actual mouse cursor position for drag preview
      if (event && 'clientX' in event && 'clientY' in event) {
        setDragCursorPosition({
          x: event.clientX,
          y: event.clientY
        })
      }

      // Check if we've moved significantly (more than 20 pixels)
      const distance = Math.sqrt(
        Math.pow(node.position.x - dragStartPosition.x, 2) +
          Math.pow(node.position.y - dragStartPosition.y, 2)
      )

      if (distance > 20) {
        if (!hasDraggedSignificantly) {
          setHasDraggedSignificantly(true)
        }

        // Throttle drop target updates to prevent excessive re-renders (max 60fps)
        const now = Date.now()
        if (now - lastDragUpdate.current < 16) {
          return
        }
        lastDragUpdate.current = now

        // Find the closest node to the current drag position
        const closestNodeId = findClosestNode(node.position, node.id)

        // Check if this would create a cycle
        if (closestNodeId && !wouldCreateCycle(node.id, closestNodeId)) {
          // Determine drop position (above/below/over)
          const position = getDropPosition(node.position, closestNodeId)

          // Only update state if there's an actual change to prevent unnecessary re-renders
          if (
            closestNodeId !== closestDropTarget ||
            position !== dropPosition
          ) {
            setClosestDropTarget(closestNodeId)
            setDropPosition(position)
          }
        } else {
          // Only clear state if it's not already cleared
          if (closestDropTarget !== null || dropPosition !== null) {
            setClosestDropTarget(null)
            setDropPosition(null)
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
      lastDragUpdate
    ]
  )

  // Handle drag end event
  const onNodeDragStop: NodeDragHandler = useCallback(
    (_, node) => {
      // Only restructure if we actually dragged significantly
      if (
        hasDraggedSignificantly &&
        draggedNodeId === node.id &&
        dropPosition
      ) {
        handleNodeDrag(node.id, node.position, dropPosition)
      }

      // Clear drag states
      setDraggedNodeId(null)
      setClosestDropTarget(null)
      setDropPosition(null)
      setDragStartPosition(null)
      setHasDraggedSignificantly(false)
      setDragCursorPosition(null)
    },
    [handleNodeDrag, hasDraggedSignificantly, draggedNodeId, dropPosition]
  )

  // Get visible nodes and edges for rendering, with drag state information
  const visibleNodes = useMemo(() => {
    const baseVisibleNodes = getVisibleNodes(nodes, edges)
    return baseVisibleNodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        isDragging: node.id === draggedNodeId && hasDraggedSignificantly,
        isDropTarget: node.id === closestDropTarget && hasDraggedSignificantly,
        dropPosition:
          node.id === closestDropTarget && hasDraggedSignificantly
            ? dropPosition
            : null,
        layout: layout
      }
    }))
  }, [
    nodes,
    edges,
    draggedNodeId,
    hasDraggedSignificantly,
    closestDropTarget,
    dropPosition,
    layout,
    getVisibleNodes
  ])

  const visibleEdges = useMemo(() => {
    return getVisibleEdges(nodes, edges).map(edge => ({
      ...edge,
      selectable: false, // Prevent edges from being selected
      deletable: false, // Prevent edges from being deleted
      focusable: false // Prevent edges from being focused
    }))
  }, [nodes, edges, getVisibleEdges])

  // Get the dragged node data for the preview
  const draggedNode = draggedNodeId
    ? nodes.find(n => n.id === draggedNodeId)
    : null

  return (
    <div
      ref={containerRef}
      className='h-full w-full relative'
      style={{ minHeight: '400px' }}
    >
      {/* Drag Preview Overlay */}
      {draggedNode && hasDraggedSignificantly && dragCursorPosition && (
        <div
          className='fixed pointer-events-none z-50'
          style={{
            left: dragCursorPosition.x,
            top: dragCursorPosition.y,
            transform: 'translate(-50%, -50%)'
          }}
        >
          <div className='px-4 py-2 rounded-lg border-2 bg-blue-500 border-blue-400 opacity-80 shadow-2xl scale-110 rotate-1'>
            <span className='text-white text-sm font-medium'>
              {draggedNode.data.label}
            </span>
          </div>
        </div>
      )}

      {isLayouting ? (
        <div className='bg-gray-900 w-full h-full flex items-center justify-center'>
          <div className='text-gray-400 text-lg'>Loading mindmap...</div>
        </div>
      ) : (
        <ReactFlow
          key={stableKey.current}
          nodes={visibleNodes}
          edges={visibleEdges}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onPaneClick={onPaneClick}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={nodeTypes}
          connectionMode={ConnectionMode.Loose}
          elementsSelectable={true}
          nodesDraggable={true}
          connectOnClick={false}
          deleteKeyCode={null}
          fitView
          className='bg-gray-900 w-full h-full'
          style={{ width: '100%', height: '100%' }}
          defaultEdgeOptions={{
            style: { stroke: '#64748b', strokeWidth: 2 }
          }}
          onNodeContextMenu={() => {
            // Let the node handle its own context menu
          }}
        >
          <Controls className='bg-gray-800 border-gray-700 [&>button]:bg-gray-700 [&>button]:border-gray-600 [&>button]:text-gray-300 [&>button:hover]:bg-gray-600' />
          <MiniMap
            nodeColor='#6366f1'
            nodeStrokeWidth={3}
            className='bg-gray-800 border border-gray-700'
          />
        </ReactFlow>
      )}

      {/* Inference Chat Popup */}
      <InferenceChatPopup
        isOpen={inferenceChatOpen}
        onClose={() => setInferenceChatOpen(false)}
        nodeLabel={inferenceChatNode?.label || ''}
        nodeId={inferenceChatNode?.id || ''}
        position={inferenceChatPosition}
      />
    </div>
  )
}

export default function MindMap (props: MindMapProps) {
  return (
    <ReactFlowProvider>
      <MindMapInner {...props} />
    </ReactFlowProvider>
  )
}

export type { MindMapData, MindMapControls }
