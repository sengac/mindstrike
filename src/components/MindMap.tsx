import React, { useEffect, useCallback, useMemo, useRef, useState } from 'react'
import ReactFlow, {
  Node,
  ConnectionMode,
  useReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  Edge
} from 'reactflow'
import 'reactflow/dist/style.css'
import { Plus, Trash2, Sparkles } from 'lucide-react'

import { MindMapNode } from './MindMapNode'
import { MindMapNodeData } from '../types/mindMap'


import { MindMapData, MindMapDataManager } from '../utils/mindMapData'
import { MindMapLayoutManager } from '../utils/mindMapLayout'
import { MindMapActionsManager } from '../utils/mindMapActions'
import { useMindMapDrag } from '../hooks/useMindMapDrag'
import { Source } from '../types/mindMap'
import { GeneratingBlocker } from './shared/GeneratingBlocker'
import { useGenerationStreaming } from '../hooks/useGenerationStreaming'

const nodeTypes = {
  mindMapNode: MindMapNode
}

export interface MindMapControls {
  undo: () => void
  redo: () => void
  resetLayout: () => void
  changeLayout: (layout: 'LR' | 'RL' | 'TB' | 'BT') => void
  canUndo: boolean
  canRedo: boolean
  currentLayout: 'LR' | 'RL' | 'TB' | 'BT'
  selectedNodeId: string | null
  setNodeColors: (nodeId: string, colors: { backgroundClass: string; foregroundClass: string }) => void
  clearNodeColors: (nodeId: string) => void
}

interface MindMapProps {
  mindMapId: string
  onSave: (data: MindMapData) => Promise<void>
  initialData?: MindMapData
  onControlsReady?: (controls: MindMapControls) => void
  keyBindings?: Record<string, string>
  // Props for external updates instead of imperative functions
  externalNodeUpdates?: {
    nodeId: string
    chatId?: string | null
    notes?: string | null
    sources?: Source[]
    timestamp: number // to ensure React detects changes
  }
}

function MindMapInner ({
  mindMapId,
  onSave,
  initialData,
  onControlsReady,
  keyBindings = {},
  externalNodeUpdates
}: MindMapProps) {
  const reactFlowInstance = useReactFlow()
  const nodesInitialized = useNodesInitialized()
  const containerRef = useRef<HTMLDivElement>(null)
  
  // State
  const [nodes, setNodes] = useState<Node<MindMapNodeData>[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [rootNodeId, setRootNodeId] = useState<string>('')
  const [layout, setLayout] = useState<'LR' | 'RL' | 'TB' | 'BT'>('LR')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [showGenerativePanel, setShowGenerativePanel] = useState(false)
  const [generativeInput, setGenerativeInput] = useState('')
  const [isAnimatingToPanel, setIsAnimatingToPanel] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [generationSummary, setGenerationSummary] = useState<string | null>(null)
  const generativeInputRef = useRef<HTMLInputElement>(null)

  // Generation streaming hook
  const { isStreaming, stats, startStreaming, cancelGeneration } = useGenerationStreaming()
  
  // Handle cancel generation  
  const handleCancelGeneration = useCallback(() => {
    cancelGeneration()
    setIsGenerating(false)
    setGenerationError('Generation cancelled by user')
  }, [cancelGeneration])

  // Managers (initialized once) - use refs to ensure they never change
  const dataManagerRef = useRef<MindMapDataManager>()
  const layoutManagerRef = useRef<MindMapLayoutManager>()
  const actionsManagerRef = useRef<MindMapActionsManager>()
  
  if (!dataManagerRef.current) {
    dataManagerRef.current = new MindMapDataManager()
  }
  if (!layoutManagerRef.current) {
    layoutManagerRef.current = new MindMapLayoutManager()
  }
  if (!actionsManagerRef.current) {
    actionsManagerRef.current = new MindMapActionsManager(dataManagerRef.current, layoutManagerRef.current)
  }
  
  const dataManager = dataManagerRef.current
  const layoutManager = layoutManagerRef.current
  const actionsManager = actionsManagerRef.current

  // Refs to prevent stale closures and reduce dependencies
  const stateRef = useRef({ nodes, edges, rootNodeId, layout })
  stateRef.current = { nodes, edges, rootNodeId, layout }

  // Batch state updates function to prevent multiple re-renders
  const updateState = useCallback((updates: {
    nodes?: Node<MindMapNodeData>[]
    edges?: Edge[]
    rootNodeId?: string
    layout?: 'LR' | 'RL' | 'TB' | 'BT'
    selectedNodeId?: string | null
  }) => {
    React.startTransition(() => {
      if (updates.nodes !== undefined) setNodes(updates.nodes)
      if (updates.edges !== undefined) setEdges(updates.edges)
      if (updates.rootNodeId !== undefined) setRootNodeId(updates.rootNodeId)
      if (updates.layout !== undefined) setLayout(updates.layout)
      if (updates.selectedNodeId !== undefined) setSelectedNodeId(updates.selectedNodeId)
    })
  }, [])

  // Global click handler to deselect nodes when clicking outside
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as Element
      
      // Check if click is on color palette or mindmap controls
      const isColorPaletteClick = target.closest('[data-color-palette]') !== null
      const isMindMapControlsClick = target.closest('[data-mindmap-controls]') !== null
      
      // Check if click is outside the mindmap container
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        // Don't deselect if clicking on color palette or mindmap controls
        if (selectedNodeId && !isColorPaletteClick && !isMindMapControlsClick) {
          setSelectedNodeId(null)
          const updatedNodes = nodes.map(n => ({ ...n, selected: false }))
          setNodes(updatedNodes)
          window.dispatchEvent(new CustomEvent('mindmap-close-context-menu'))
        }
      }
    }

    document.addEventListener('click', handleGlobalClick)
    return () => document.removeEventListener('click', handleGlobalClick)
  }, [selectedNodeId, nodes])

  // Debounce fit view function with reset - each call resets the 200ms timer
  const fitViewRef = useRef<NodeJS.Timeout>()
  const fitView = useCallback(({ padding, maxZoom, minZoom }: { padding?: number; maxZoom?: number; minZoom?: number }) => {
    if (fitViewRef.current) {
      clearTimeout(fitViewRef.current)
    }
    fitViewRef.current = setTimeout(() => {
      reactFlowInstance.fitView({ padding, maxZoom, minZoom, duration: 300 })
    }, 50)
  }, [reactFlowInstance])

  // Track initialization to prevent multiple runs
  const lastInitializedData = useRef<{ mindMapId: string; dataHash: string }>({ 
    mindMapId: '', 
    dataHash: '' 
  })
  const isCurrentlyInitializing = useRef(false)

  // Reset initialization tracking when mindMapId changes
  useEffect(() => {
    lastInitializedData.current = { mindMapId: '', dataHash: '' };
    isCurrentlyInitializing.current = false;
  }, [mindMapId]);

  // Initialize data on mount - run only when mindMapId or actual data changes
  useEffect(() => {
    // Create a simple hash of the data to detect real changes
    const dataHash = initialData ? JSON.stringify(initialData) : 'null'
    const currentKey = `${mindMapId}:${dataHash}`
    const lastKey = `${lastInitializedData.current.mindMapId}:${lastInitializedData.current.dataHash}`
    // Skip if we've already initialized this exact combination
    if (currentKey === lastKey && isCurrentlyInitializing.current) {
      return
    }

    isCurrentlyInitializing.current = true
    let isCancelled = false

    const initializeData = async () => {
      if (isCancelled) return
      
      try {
        const result = await dataManager.initializeData(mindMapId, initialData)
        
        if (!isCancelled) {
          // Perform initial layout immediately
          const layoutResult = await layoutManager.performCompleteLayout(
            result.nodes,
            result.edges,
            result.rootNodeId,
            result.layout
          )
          
          // Update state directly since we're already in a useEffect
          if (!isCancelled) {
            updateState({
              nodes: layoutResult.nodes,
              edges: layoutResult.edges,
              rootNodeId: result.rootNodeId,
              layout: result.layout
            })
          }
          
          // Update our tracking
          lastInitializedData.current = { mindMapId, dataHash }
        }
      } catch (error) {
        console.error('Failed to initialize MindMap data:', error)
      } finally {
        isCurrentlyInitializing.current = false
      }
    }

    initializeData()

    return () => {
      isCancelled = true
      isCurrentlyInitializing.current = false
    }
  }, [mindMapId, initialData])

  // Handle external node updates via props instead of imperative functions
  useEffect(() => {
    const handleExternalUpdates = async () => {
      if (!externalNodeUpdates) return;
      
    if (externalNodeUpdates) {
      const { nodeId, chatId, notes, sources } = externalNodeUpdates
      const { nodes: currentNodes, rootNodeId: currentRootId, layout: currentLayout } = stateRef.current
      
      let updatedNodes = currentNodes
      let hasChanges = false
      
      if (chatId !== undefined) {
        const newNodes = actionsManager.updateNodeChatId(currentNodes, nodeId, chatId)
        if (newNodes !== currentNodes) {
          updatedNodes = newNodes
          hasChanges = true
        }
      }
      
      if (notes !== undefined) {
        const newNodes = actionsManager.updateNodeNotes(updatedNodes, nodeId, notes)
        if (newNodes !== updatedNodes) {
          updatedNodes = newNodes
          hasChanges = true
        }
      }

      if (sources !== undefined) {
        const newNodes = actionsManager.updateNodeSources(updatedNodes, nodeId, sources)
        if (newNodes !== updatedNodes) {
          updatedNodes = newNodes
          hasChanges = true
        }
      }
      
      if (hasChanges) {
        dataManager.saveToHistory(updatedNodes, currentRootId, currentLayout)
        updateState({ nodes: updatedNodes })
        
        // If notes were updated, notify the chat panel to refresh
        if (notes !== undefined) {
          const updatedNode = updatedNodes.find(n => n.id === nodeId)
          if (updatedNode) {
            window.dispatchEvent(new CustomEvent('mindmap-node-notes-updated', {
              detail: { 
                nodeId, 
                notes: updatedNode.data.notes 
              }
            }))
          }
        }

        // If sources were updated, notify the chat panel to refresh
        if (sources !== undefined) {
          const updatedNode = updatedNodes.find(n => n.id === nodeId)
          if (updatedNode) {
            window.dispatchEvent(new CustomEvent('mindmap-node-sources-updated', {
              detail: { 
                nodeId, 
                sources: updatedNode.data.sources 
              }
            }))
          }
        }
        
        // Save the changes
        try {
          if (currentRootId && updatedNodes.find(n => n.id === currentRootId)) {
            const treeData = dataManager.convertNodesToTree(updatedNodes, currentRootId, currentLayout)
            await onSave(treeData)
          }
        } catch (error) {
          console.error('Error saving external node update:', error)
        }
      }
    }
    };
    
    handleExternalUpdates();
  }, [externalNodeUpdates, actionsManager, dataManager, updateState, onSave])

  // Optimized auto-save with debouncing and memoized dependency
  const saveData = useCallback(async () => {
    const { nodes: currentNodes, rootNodeId: currentRootId, layout: currentLayout } = stateRef.current
    if (currentNodes.length > 0 && currentRootId && !isCurrentlyInitializing.current) {
      try {
        const treeData = dataManager.convertNodesToTree(currentNodes, currentRootId, currentLayout)
        await onSave(treeData)
      } catch (error) {
        console.error('Failed to save MindMap data:', error)
      }
    }
  }, [dataManager, onSave])

  // Debounced save function for user actions
  const saveTimeoutRef = useRef<NodeJS.Timeout>()
  const triggerSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    saveTimeoutRef.current = setTimeout(saveData, 500)
  }, [saveData])

  // Cleanup save timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  // Optimized action handlers with reduced dependencies
  const handleAddChildNode = useCallback(async (parentNodeId: string) => {
    const { nodes: currentNodes, edges: currentEdges, rootNodeId: currentRootId, layout: currentLayout } = stateRef.current
    
    try {
      const result = await actionsManager.addChildNode(
        currentNodes,
        currentEdges,
        currentRootId,
        currentLayout,
        parentNodeId
      )
      
      // Update selection state on the nodes
      const nodesWithSelection = result.nodes.map(n => ({
        ...n,
        selected: n.id === result.newNodeId
      }))
      
      updateState({
        nodes: nodesWithSelection,
        edges: result.edges,
        selectedNodeId: result.newNodeId
      })
      triggerSave()
    } catch (error) {
      console.error('Failed to add child node:', error)
    }
  }, [actionsManager, updateState, triggerSave])

  const handleAddSiblingNode = useCallback(async (siblingNodeId: string) => {
    const { nodes: currentNodes, edges: currentEdges, rootNodeId: currentRootId, layout: currentLayout } = stateRef.current
    
    try {
      const result = await actionsManager.addSiblingNode(
        currentNodes,
        currentEdges,
        currentRootId,
        currentLayout,
        siblingNodeId
      )
      
      // Update selection state on the nodes
      const nodesWithSelection = result.nodes.map(n => ({
        ...n,
        selected: n.id === result.newNodeId
      }))
      
      updateState({
        nodes: nodesWithSelection,
        edges: result.edges,
        selectedNodeId: result.newNodeId
      })
      triggerSave()
    } catch (error) {
      console.error('Failed to add sibling node:', error)
    }
  }, [actionsManager, updateState, triggerSave])



  const handleDeleteNode = useCallback(async (nodeIdToDelete: string) => {
    const { nodes: currentNodes, edges: currentEdges, rootNodeId: currentRootId, layout: currentLayout } = stateRef.current
    
    try {
      // Find all nodes that will be deleted (including descendants)
      const nodesToDelete = new Set([nodeIdToDelete])
      const findDescendants = (nodeId: string) => {
        const children = currentNodes.filter(n => n.data.parentId === nodeId)
        children.forEach(child => {
          if (!nodesToDelete.has(child.id)) {
            nodesToDelete.add(child.id)
            findDescendants(child.id)
          }
        })
      }
      findDescendants(nodeIdToDelete)
      
      // Find the parent of the node being deleted
      const nodeToDelete = currentNodes.find(n => n.id === nodeIdToDelete)
      const parentId = nodeToDelete?.data.parentId
      
      // Dispatch event to check and close inference panel if any deleted node or parent is active
      window.dispatchEvent(new CustomEvent('mindmap-inference-check-and-close', {
        detail: { 
          deletedNodeIds: Array.from(nodesToDelete),
          parentId: parentId 
        }
      }))
      
      const result = await actionsManager.deleteNode(
        currentNodes,
        currentEdges,
        currentRootId,
        currentLayout,
        nodeIdToDelete
      )
      
      updateState({
        nodes: result.nodes,
        edges: result.edges,
        selectedNodeId: null
      })
      triggerSave()
    } catch (error) {
      console.error('Failed to delete node:', error)
    }
  }, [actionsManager, updateState, triggerSave])





  const handleUpdateNodeLabel = useCallback((nodeId: string, newLabel: string) => {
    const { nodes: currentNodes } = stateRef.current
    const updatedNodes = actionsManager.updateNodeLabel(currentNodes, nodeId, newLabel)
    setNodes(updatedNodes)
  }, [actionsManager])

  const handleNodeLabelFinished = useCallback(async (nodeId: string, newLabel: string) => {
    const { nodes: currentNodes, edges: currentEdges, rootNodeId: currentRootId, layout: currentLayout } = stateRef.current
    
    try {
      const result = await actionsManager.updateNodeLabelWithLayout(
        currentNodes,
        currentEdges,
        currentRootId,
        currentLayout,
        nodeId,
        newLabel
      )
      
      updateState({
        nodes: result.nodes,
        edges: result.edges
      })
      triggerSave()
    } catch (error) {
      console.error('Failed to update node label with layout:', error)
    }
  }, [actionsManager, updateState, triggerSave])

  const handleToggleNodeCollapse = useCallback(async (nodeId: string) => {
    const { nodes: currentNodes, edges: currentEdges, rootNodeId: currentRootId, layout: currentLayout } = stateRef.current
    
    try {
      const result = await actionsManager.toggleNodeCollapse(
        currentNodes,
        currentEdges,
        currentRootId,
        currentLayout,
        nodeId
      )
      
      updateState({
        nodes: result.nodes,
        edges: result.edges
      })
      triggerSave()
    } catch (error) {
      console.error('Failed to toggle node collapse:', error)
    }
  }, [actionsManager, updateState, triggerSave])

  const handleMoveNode = useCallback(async (
    nodeId: string,
    newParentId: string,
    insertIndex?: number
  ) => {
    const { nodes: currentNodes, edges: currentEdges, rootNodeId: currentRootId, layout: currentLayout } = stateRef.current
    
    
    try {
      const result = await actionsManager.moveNode(
        currentNodes,
        currentEdges,
        currentRootId,
        currentLayout,
        nodeId,
        newParentId,
        insertIndex
      )
      
      updateState({
        nodes: result.nodes,
        edges: result.edges
      })
      triggerSave()
    } catch (error) {
      console.error('Failed to move node:', error)
    }
  }, [actionsManager, updateState, triggerSave])

  const handleChangeLayout = useCallback(async (newLayout: 'LR' | 'RL' | 'TB' | 'BT') => {
    const { nodes: currentNodes, edges: currentEdges, rootNodeId: currentRootId } = stateRef.current
    
    
    try {
      const result = await actionsManager.changeLayout(
        currentNodes,
        currentEdges,
        currentRootId,
        newLayout
      )
      
      updateState({
        nodes: result.nodes,
        edges: result.edges,
        layout: newLayout
      })
      triggerSave()

      // Note: this needs maybe around 200ms of time to recalculate
      setTimeout(() => fitView({}), 200);
    } catch (error) {
      console.error('Failed to change layout:', error)
    }
  }, [actionsManager, updateState, fitView, triggerSave])

  const handleResetLayout = useCallback(async () => {
    const { nodes: currentNodes, edges: currentEdges, rootNodeId: currentRootId, layout: currentLayout } = stateRef.current
    
    
    try {
      const result = await actionsManager.resetLayout(
        currentNodes,
        currentEdges,
        currentRootId,
        currentLayout
      )
      
      updateState({
        nodes: result.nodes,
        edges: result.edges
      })
      triggerSave()
      
      fitView({})
    } catch (error) {
      console.error('Failed to reset layout:', error)
    }
  }, [actionsManager, updateState, fitView, triggerSave])

  // Update node chatId handler
  const handleUpdateNodeChatId = useCallback((nodeId: string, chatId: string | null) => {
    const { nodes: currentNodes, rootNodeId: currentRootId, layout: currentLayout } = stateRef.current
    
    const updatedNodes = actionsManager.updateNodeChatId(currentNodes, nodeId, chatId)
    
    dataManager.saveToHistory(updatedNodes, currentRootId, currentLayout)
    updateState({ nodes: updatedNodes })
    
    // Force immediate save to ensure chatId is persisted
    try {
      // Check if root node exists before converting
      if (!currentRootId || !updatedNodes.find(n => n.id === currentRootId)) {
        console.warn('Root node not found, skipping save for chatId update')
        return
      }
      const treeData = dataManager.convertNodesToTree(updatedNodes, currentRootId, currentLayout)
      onSave(treeData)
    } catch (error) {
      console.error('Error saving chatId update:', error)
    }
  }, [actionsManager, updateState, dataManager, onSave])

  // Update node notes handler
  const handleUpdateNodeNotes = useCallback((nodeId: string, notes: string | null) => {
    const { nodes: currentNodes, rootNodeId: currentRootId, layout: currentLayout } = stateRef.current
    
    const updatedNodes = actionsManager.updateNodeNotes(currentNodes, nodeId, notes)
    
    dataManager.saveToHistory(updatedNodes, currentRootId, currentLayout)
    updateState({ nodes: updatedNodes })
    
    // Dispatch event to update node panel content if it's open
    window.dispatchEvent(new CustomEvent('mindmap-node-notes-updated', {
      detail: { nodeId, notes }
    }));
    
    // Force immediate save to ensure notes are persisted
    try {
      // Check if root node exists before converting
      if (!currentRootId || !updatedNodes.find(n => n.id === currentRootId)) {
        console.warn('Root node not found, skipping save for notes update')
        return
      }
      const treeData = dataManager.convertNodesToTree(updatedNodes, currentRootId, currentLayout)
      onSave(treeData)
    } catch (error) {
      console.error('Error saving notes update:', error)
    }
  }, [actionsManager, updateState, dataManager, onSave])

  // Update node sources handler
  const handleUpdateNodeSources = useCallback((nodeId: string, sources: Source[]) => {
    const { nodes: currentNodes, rootNodeId: currentRootId, layout: currentLayout } = stateRef.current
    
    const updatedNodes = actionsManager.updateNodeSources(currentNodes, nodeId, sources)
    
    dataManager.saveToHistory(updatedNodes, currentRootId, currentLayout)
    updateState({ nodes: updatedNodes })
    
    // Dispatch event to update node panel content if it's open
    window.dispatchEvent(new CustomEvent('mindmap-node-sources-updated', {
      detail: { nodeId, sources }
    }));
    
    // Force immediate save to ensure sources are persisted
    try {
      // Check if root node exists before converting
      if (!currentRootId || !updatedNodes.find(n => n.id === currentRootId)) {
        console.warn('Root node not found, skipping save for sources update')
        return
      }
      const treeData = dataManager.convertNodesToTree(updatedNodes, currentRootId, currentLayout)
      onSave(treeData)
    } catch (error) {
      console.error('Error saving sources update:', error)
    }
  }, [actionsManager, updateState, dataManager, onSave])

  // Color methods
  const handleSetNodeColors = useCallback((nodeId: string, colors: { backgroundClass: string; foregroundClass: string }) => {
    const { nodes: currentNodes, rootNodeId: currentRootId, layout: currentLayout } = stateRef.current
    
    const updatedNodes = currentNodes.map(node => 
      node.id === nodeId 
        ? { 
            ...node, 
            data: { ...node.data, customColors: colors },
            // Force re-render by updating a timestamp
            style: { ...node.style }
          }
        : node
    )
    
    dataManager.saveToHistory(updatedNodes, currentRootId, currentLayout)
    
    // Force immediate re-render for color changes
    setNodes(updatedNodes)
    
    // Force immediate save to ensure colors are persisted
    try {
      if (!currentRootId || !updatedNodes.find(n => n.id === currentRootId)) {
        console.warn('Root node not found, skipping save for colors update')
        return
      }
      const treeData = dataManager.convertNodesToTree(updatedNodes, currentRootId, currentLayout)
      onSave(treeData)
    } catch (error) {
      console.error('Error saving colors update:', error)
    }
  }, [updateState, dataManager, onSave])

  const handleClearNodeColors = useCallback((nodeId: string) => {
    const { nodes: currentNodes, rootNodeId: currentRootId, layout: currentLayout } = stateRef.current
    
    const updatedNodes = currentNodes.map(node => 
      node.id === nodeId 
        ? { 
            ...node, 
            data: { ...node.data, customColors: null },
            // Force re-render by updating a timestamp
            style: { ...node.style }
          }
        : node
    )
    
    dataManager.saveToHistory(updatedNodes, currentRootId, currentLayout)
    
    // Force immediate re-render for color changes
    setNodes(updatedNodes)
    
    // Force immediate save to ensure color clearing is persisted
    try {
      if (!currentRootId || !updatedNodes.find(n => n.id === currentRootId)) {
        console.warn('Root node not found, skipping save for color clearing')
        return
      }
      const treeData = dataManager.convertNodesToTree(updatedNodes, currentRootId, currentLayout)
      onSave(treeData)
    } catch (error) {
      console.error('Error saving color clearing:', error)
    }
  }, [updateState, dataManager, onSave])

  // Undo/Redo handlers - optimized
  const handleUndo = useCallback(async () => {
    
    
    const result = dataManager.undo()
    if (result) {
      updateState({
        nodes: result.nodes,
        edges: result.edges,
        rootNodeId: result.rootNodeId,
        layout: result.layout
      })

      fitView({})
    }
  }, [dataManager, updateState, fitView])

  const handleRedo = useCallback(async () => {
    const result = dataManager.redo()
    
    if (result) {
      updateState({
        nodes: result.nodes,
        edges: result.edges,
        rootNodeId: result.rootNodeId,
        layout: result.layout
      })

      fitView({})
    }
  }, [dataManager, updateState, fitView])

  // Initialize drag & drop
  const {
    draggedNodeId,
    closestDropTarget,
    dropPosition,
    hasDraggedSignificantly,
    dragCursorPosition,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop
  } = useMindMapDrag({
    nodes,
    rootNodeId,
    layout,
    moveNode: handleMoveNode
  })

  // Parse mindmap changes from agent response
  const parseMindmapChanges = useCallback((response: string) => {
    try {
      // First try to extract MINDMAP_CHANGES section (for compatibility)
      let changesMatch = response.match(/MINDMAP_CHANGES:\s*({[\s\S]*?})\s*(?:```|$)/);
      let changesJson: string;
      
      if (changesMatch) {
        changesJson = changesMatch[1];
      } else {
        // New format: entire response should be JSON
        changesJson = response.trim();
        // Remove any markdown code blocks
        changesJson = changesJson.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
      }
      
      const parsed = JSON.parse(changesJson);
      return parsed.changes || [];
    } catch (error) {
      console.error('Error parsing mindmap changes:', error);
      return null;
    }
  }, [])

  // Apply mindmap changes to the current state
  const applyMindmapChanges = useCallback(async (changes: any[]) => {
    if (!dataManagerRef.current || !layoutManagerRef.current || !actionsManagerRef.current) return;

    let updatedNodes = [...nodes];
    
    for (const change of changes) {
      try {
        if (change.action === 'create') {
          // Create new node
          const newNodeData = {
            id: change.nodeId,
            label: change.text,
            isRoot: false,
            parentId: change.parentId,
            notes: change.notes || null,
            sources: (change.sources || []).map((source: any) => ({
              id: source.id || `src-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              name: source.name || source.title || 'Untitled Source',
              directory: source.directory || source.description || '',
              type: source.type || 'reference'
            })),
            level: 0, // Will be calculated by layout
            hasChildren: false
          };

          const newNode = {
            id: change.nodeId,
            type: 'mindMapNode',
            position: { x: 0, y: 0 }, // Will be positioned by layout
            data: newNodeData
          };

          updatedNodes.push(newNode);
          
        } else if (change.action === 'update') {
          // Update existing node
          const nodeIndex = updatedNodes.findIndex(n => n.id === change.nodeId);
          if (nodeIndex >= 0) {
            const node = updatedNodes[nodeIndex];
            const newData = { ...node.data };
            
            if (change.text !== undefined) newData.label = change.text;
            if (change.notes !== undefined) newData.notes = change.notes;
            if (change.sources !== undefined) {
              // Ensure sources have required fields
              newData.sources = change.sources.map((source: any) => ({
                id: source.id || `src-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                name: source.name || source.title || 'Untitled Source',
                directory: source.directory || source.description || '',
                type: source.type || 'reference'
              }));
            }
            
            updatedNodes[nodeIndex] = { ...node, data: newData };
          }
          
        } else if (change.action === 'delete') {
          // Delete node and its children
          const deleteNodeAndChildren = (nodeId: string) => {
            const children = updatedNodes.filter(n => n.data.parentId === nodeId);
            children.forEach(child => deleteNodeAndChildren(child.id));
            updatedNodes = updatedNodes.filter(n => n.id !== nodeId);
          };
          deleteNodeAndChildren(change.nodeId);
        }
      } catch (error) {
        console.error('Error applying change:', change, error);
      }
    }

    // Update hierarchy levels
    const updateLevels = (nodeId: string, level: number) => {
      const node = updatedNodes.find(n => n.id === nodeId);
      if (node) {
        node.data.level = level;
        const children = updatedNodes.filter(n => n.data.parentId === nodeId);
        children.forEach(child => updateLevels(child.id, level + 1));
      }
    };
    updateLevels(rootNodeId, 0);

    // Update hasChildren flags
    updatedNodes.forEach(node => {
      node.data.hasChildren = updatedNodes.some(n => n.data.parentId === node.id);
    });

    // Apply layout using actionsManager which handles this properly
    const result = await actionsManagerRef.current.resetLayout(
      updatedNodes,
      dataManagerRef.current.generateEdges(updatedNodes, layout),
      rootNodeId,
      layout
    );

    // Update state
    setNodes(result.nodes);
    setEdges(result.edges);

    // Save to history and backend
    dataManagerRef.current.saveToHistory(result.nodes, rootNodeId, layout);
    const treeData = dataManagerRef.current.convertNodesToTree(result.nodes, rootNodeId, layout);
    await onSave(treeData);

    // Dispatch events to update node panel content if it's open
    changes.forEach(change => {
      if (change.action === 'update' || change.action === 'create') {
        const updatedNode = result.nodes.find(n => n.id === change.nodeId);
        if (updatedNode) {
          // Dispatch notes update event
          if (change.notes !== undefined) {
            window.dispatchEvent(new CustomEvent('mindmap-node-notes-updated', {
              detail: { nodeId: change.nodeId, notes: change.notes }
            }));
          }
          
          // Dispatch sources update event
          if (change.sources !== undefined) {
            window.dispatchEvent(new CustomEvent('mindmap-node-sources-updated', {
              detail: { nodeId: change.nodeId, sources: change.sources }
            }));
          }
        }
      }
    });

    console.log(`Applied ${changes.length} mindmap changes`);
  }, [nodes, rootNodeId, layout, onSave])

  // Generation function
  const handleGenerate = useCallback(async () => {
    if (!generativeInput.trim() || !selectedNodeId || isGenerating || isStreaming) return

    setIsGenerating(true)
    setGenerationError(null)
    setGenerationSummary(null)

    try {
      await startStreaming(
        `/api/mindmaps/${mindMapId}/generate`,
        {
          prompt: generativeInput.trim(),
          selectedNodeId: selectedNodeId
        },
        {
          onProgress: (stats) => {
            // Progress is handled by the GeneratingBlocker component
          },
          onComplete: async (result) => {
            try {
              // Parse and apply mindmap changes
              const changes = parseMindmapChanges(result.response)
              if (changes && changes.length > 0) {
                await applyMindmapChanges(changes)
                setGenerationSummary(`Applied ${changes.length} change(s) to the mindmap: ${result.response.split('MINDMAP_CHANGES:')[0].trim()}`)
              } else {
                setGenerationSummary(result.response || 'Content generated successfully!')
              }
              
              // Auto-clear success message after 5 seconds
              setTimeout(() => {
                setGenerationSummary(null)
              }, 5000)
              
              // Clear input and hide panel
              setGenerativeInput('')
              setShowGenerativePanel(false)
              setIsAnimatingToPanel(false)
              
            } catch (error: any) {
              console.error('Error applying changes:', error)
              setGenerationError(error.message || 'Error applying changes')
            } finally {
              setIsGenerating(false)
            }
          },
          onError: (error) => {
            console.error('Generation error:', error)
            setGenerationError(error || 'An error occurred during generation')
            setIsGenerating(false)
          }
        }
      )
      
    } catch (error: any) {
      console.error('Generation error:', error)
      setGenerationError(error.message || 'An error occurred during generation')
      setIsGenerating(false)
    }
  }, [generativeInput, selectedNodeId, mindMapId, isGenerating, isStreaming, startStreaming, applyMindmapChanges])

  // Clear generation status when panel is hidden
  useEffect(() => {
    if (!showGenerativePanel) {
      setGenerationError(null)
      setGenerationSummary(null)
    }
  }, [showGenerativePanel])

  // Inference chat state is now managed by MindMapsPanel

  // Optimized resize handling with debouncing
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let lastSize = { width: 0, height: 0 }
    let resizeTimeout: NodeJS.Timeout

    const resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) {
        const { width, height } = entry.contentRect

        if (width !== lastSize.width || height !== lastSize.height) {
          lastSize = { width, height }

          if (width > 0 && height > 0) {
            clearTimeout(resizeTimeout)
            resizeTimeout = setTimeout(() => {
              if (nodesInitialized && nodes.length > 0) {
                const padding = nodes.length <= 3 ? 0.8 : 0.2
                
                fitView({
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
      clearTimeout(resizeTimeout)
    }
  }, [reactFlowInstance, nodesInitialized, nodes.length])
  // Memoized event handlers to prevent re-registering
  const memoizedHandlers = useMemo(() => ({
    handleAddChild: (event: CustomEvent) => {
      handleAddChildNode(event.detail.nodeId)
    },
    handleAddSibling: (event: CustomEvent) => {
      handleAddSiblingNode(event.detail.nodeId)
    },
    handleDeleteNodeEvent: (event: CustomEvent) => {
      handleDeleteNode(event.detail.nodeId)
    },
    handleNodeUpdate: (e: CustomEvent) => {
      handleUpdateNodeLabel(e.detail.nodeId, e.detail.label)
    },
    handleNodeUpdateFinished: (e: CustomEvent) => {
      handleNodeLabelFinished(e.detail.nodeId, e.detail.label)
    },
    handleToggleCollapse: (e: CustomEvent) => {
      handleToggleNodeCollapse(e.detail.nodeId)
    },
    handleNodeSelect: (e: CustomEvent) => {
      const { nodeId } = e.detail
      setSelectedNodeId(nodeId)
      setNodes((currentNodes: Node<MindMapNodeData>[]) =>
        currentNodes.map(n => ({
          ...n,
          selected: n.id === nodeId
        }))
      )
      window.dispatchEvent(new CustomEvent('mindmap-close-context-menu'))
    },
    handleNavigateSibling: (e: CustomEvent) => {
      const { currentNodeId, direction } = e.detail
      
      const currentNode = nodes.find(n => n.id === currentNodeId)
      if (!currentNode) return
      
      // Build a tree traversal order (depth-first)
      const buildTraversalOrder = (): Node<MindMapNodeData>[] => {
        const traversalOrder: Node<MindMapNodeData>[] = []
        
        // Find root node
        const rootNode = nodes.find(n => n.data.isRoot || !n.data.parentId)
        if (!rootNode) return []
        
        // Recursive depth-first traversal
        const traverse = (node: Node<MindMapNodeData>) => {
          traversalOrder.push(node)
          
          // Get children of this node, sorted by position
          const children = nodes
            .filter(n => n.data.parentId === node.id)
            .sort((a, b) => {
              // Sort by position (top to bottom, left to right)
              if (Math.abs(a.position.y - b.position.y) > 10) {
                return a.position.y - b.position.y
              }
              return a.position.x - b.position.x
            })
          
          // Recursively traverse each child
          children.forEach(child => traverse(child))
        }
        
        traverse(rootNode)
        return traversalOrder
      }
      
      const traversalOrder = buildTraversalOrder()
      const currentIndex = traversalOrder.findIndex(n => n.id === currentNodeId)
      
      if (currentIndex === -1) return
      
      let targetNode: Node<MindMapNodeData> | null = null
      
      if (direction === 'prev') {
        // Go to previous node in traversal order (wrap to end if at beginning)
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : traversalOrder.length - 1
        targetNode = traversalOrder[prevIndex]
      } else if (direction === 'next') {
        // Go to next node in traversal order (wrap to beginning if at end)
        const nextIndex = currentIndex < traversalOrder.length - 1 ? currentIndex + 1 : 0
        targetNode = traversalOrder[nextIndex]
      }
      
      if (targetNode) {
        // Dispatch inference open event for the target node
        window.dispatchEvent(new CustomEvent('mindmap-inference-open', {
          detail: {
            nodeId: targetNode.id,
            label: targetNode.data.label,
            chatId: targetNode.data.chatId,
            notes: targetNode.data.notes,
            sources: targetNode.data.sources
          }
        }))
      }
    }
  }), [handleAddChildNode, handleAddSiblingNode, handleDeleteNode, handleUpdateNodeLabel, handleNodeLabelFinished, handleToggleNodeCollapse, nodes])

  // Event listeners with memoized handlers
  useEffect(() => {
    const { 
      handleAddChild,
      handleAddSibling,
      handleDeleteNodeEvent,
      handleNodeUpdate,
      handleNodeUpdateFinished,
      handleToggleCollapse,
      handleNodeSelect,
      handleNavigateSibling
    } = memoizedHandlers

    // Inference chat events are now handled by MindMapsPanel

    // Context menu events
    window.addEventListener('mindmap-add-child', handleAddChild as EventListener)
    window.addEventListener('mindmap-add-sibling', handleAddSibling as EventListener)
    window.addEventListener('mindmap-delete-node', handleDeleteNodeEvent as EventListener)

    // Node update events
    window.addEventListener('mindmap-node-update', handleNodeUpdate as EventListener)
    window.addEventListener('mindmap-node-update-finished', handleNodeUpdateFinished as EventListener)
    window.addEventListener('mindmap-toggle-collapse', handleToggleCollapse as EventListener)
    window.addEventListener('mindmap-node-select', handleNodeSelect as EventListener)
    window.addEventListener('mindmap-navigate-sibling', handleNavigateSibling as EventListener)
    


    return () => {
      window.removeEventListener('mindmap-add-child', handleAddChild as EventListener)
      window.removeEventListener('mindmap-add-sibling', handleAddSibling as EventListener)
      window.removeEventListener('mindmap-delete-node', handleDeleteNodeEvent as EventListener)
      window.removeEventListener('mindmap-node-update', handleNodeUpdate as EventListener)
      window.removeEventListener('mindmap-node-update-finished', handleNodeUpdateFinished as EventListener)
      window.removeEventListener('mindmap-toggle-collapse', handleToggleCollapse as EventListener)
      window.removeEventListener('mindmap-node-select', handleNodeSelect as EventListener)
      window.removeEventListener('mindmap-navigate-sibling', handleNavigateSibling as EventListener)
    }
  }, [memoizedHandlers])

  // Keyboard handlers - memoized
  const keyboardHandlers = useMemo(() => {
    const getKeyBinding = (action: string, defaultKey: string) => {
      return keyBindings[action] || defaultKey
    }

    const matchesKeyBinding = (e: KeyboardEvent, bindingKey: string) => {
      const modifiers = []
      if (e.ctrlKey || e.metaKey) modifiers.push('Ctrl')
      if (e.shiftKey) modifiers.push('Shift')
      if (e.altKey) modifiers.push('Alt')

      let key = e.key
      if (key === ' ') key = 'Space'

      const pressedKey = modifiers.length > 0 ? `${modifiers.join('+')}+${key}` : key
      return pressedKey === bindingKey
    }

    const openInferenceForSelectedNode = () => {
      if (!selectedNodeId) return

      const selectedNode = nodes.find(n => n.id === selectedNodeId)
      if (!selectedNode) return

      const nodeElement = document.querySelector(`[data-id="${selectedNodeId}"]`)
      let position = { x: window.innerWidth / 2, y: window.innerHeight / 2 }

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
            chatId: selectedNode.data.chatId,
            position
          }
        })
      )
    }

    return {
      getKeyBinding,
      matchesKeyBinding,
      openInferenceForSelectedNode,
      handleKeyDown: (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement) return

        if (matchesKeyBinding(e, getKeyBinding('addChild', 'Tab')) && selectedNodeId) {
          e.preventDefault()
          handleAddChildNode(selectedNodeId)
        } else if (matchesKeyBinding(e, getKeyBinding('addSibling', 'Enter')) && selectedNodeId) {
          e.preventDefault()
          handleAddSiblingNode(selectedNodeId)
        } else if ((matchesKeyBinding(e, getKeyBinding('deleteNode', 'Delete')) || 
                   matchesKeyBinding(e, getKeyBinding('deleteNodeBackspace', 'Backspace'))) && selectedNodeId) {
          e.preventDefault()
          handleDeleteNode(selectedNodeId)
        } else if (matchesKeyBinding(e, getKeyBinding('undo', 'Ctrl+Z'))) {
          e.preventDefault()
          handleUndo()
        } else if (matchesKeyBinding(e, getKeyBinding('redo', 'Ctrl+Shift+Z'))) {
          e.preventDefault()
          handleRedo()
        } else if (matchesKeyBinding(e, getKeyBinding('redoAlt', 'Ctrl+Y'))) {
          e.preventDefault()
          handleRedo()
        } else if (matchesKeyBinding(e, getKeyBinding('openInference', '.')) && selectedNodeId) {
          e.preventDefault()
          openInferenceForSelectedNode()
        } else if (matchesKeyBinding(e, getKeyBinding('openGenerative', '/')) && selectedNodeId) {
          e.preventDefault()
          setIsAnimatingToPanel(true)
          setTimeout(() => {
            setShowGenerativePanel(true)
          }, 200)
        }
      }
    }
  }, [keyBindings, selectedNodeId, nodes, handleAddChildNode, handleAddSiblingNode, handleDeleteNode, handleUndo, handleRedo, setIsAnimatingToPanel, setShowGenerativePanel])

  useEffect(() => {
    window.addEventListener('keydown', keyboardHandlers.handleKeyDown)
    return () => window.removeEventListener('keydown', keyboardHandlers.handleKeyDown)
  }, [keyboardHandlers.handleKeyDown])

  // Focus input when generative panel becomes visible
  useEffect(() => {
    if (showGenerativePanel && generativeInputRef.current) {
      // Small delay to ensure the panel animation has started
      const timer = setTimeout(() => {
        generativeInputRef.current?.focus()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [showGenerativePanel])

  // React Flow event handlers - memoized
  const reactFlowHandlers = useMemo(() => ({
    onConnect: () => {
      // Connections are handled automatically
    },
    onNodeClick: (event: React.MouseEvent | React.TouchEvent, node: Node) => {
      // Don't handle click events that are part of a right-click gesture
      // These will have button 0 but detail 1, indicating a touchpad right-click first click
      if ('button' in event && event.button === 0 && 'detail' in event && event.detail === 1) {
        // Delay slightly to see if a contextmenu event follows
        setTimeout(() => {
          // Only proceed if no context menu opened in the meantime
          const anyContextMenuOpen = document.querySelector('[role="menu"], .context-menu, [data-context-menu]');
          if (!anyContextMenuOpen) {
            setSelectedNodeId(node.id)
            setNodes((currentNodes: Node<MindMapNodeData>[]) =>
              currentNodes.map(n => ({
                ...n,
                selected: n.id === node.id
              }))
            )
            window.dispatchEvent(new CustomEvent('mindmap-close-context-menu'))
          }
        }, 150);
        return;
      }
      
      // Handle all other pointer events (mouse, touchpad, touch) immediately
      event.preventDefault()
      event.stopPropagation()
      
      setSelectedNodeId(node.id)
      setNodes((currentNodes: Node<MindMapNodeData>[]) =>
        currentNodes.map(n => ({
          ...n,
          selected: n.id === node.id
        }))
      )
      window.dispatchEvent(new CustomEvent('mindmap-close-context-menu'))
    },
    onPaneClick: () => {
      setSelectedNodeId(null)
      const updatedNodes = nodes.map(n => ({ ...n, selected: false }))
      setNodes(updatedNodes)
      window.dispatchEvent(new CustomEvent('mindmap-close-context-menu'))
    },
    onEdgeClick: () => {
      // Edges are not interactive
    }
  }), [nodes])

  // Track undo/redo state separately to avoid excessive re-creation
  const [undoRedoState, setUndoRedoState] = useState({ canUndo: false, canRedo: false })
  
  // Update undo/redo state when necessary
  useEffect(() => {
    const newCanUndo = dataManager.canUndo
    const newCanRedo = dataManager.canRedo
    if (newCanUndo !== undoRedoState.canUndo || newCanRedo !== undoRedoState.canRedo) {
      setUndoRedoState({ canUndo: newCanUndo, canRedo: newCanRedo })
    }
  }, [dataManager.canUndo, dataManager.canRedo, undoRedoState.canUndo, undoRedoState.canRedo])

  // Expose controls to parent - memoized
  const controls = useMemo((): MindMapControls => ({
    undo: handleUndo,
    redo: handleRedo,
    resetLayout: handleResetLayout,
    changeLayout: handleChangeLayout,
    canUndo: undoRedoState.canUndo,
    canRedo: undoRedoState.canRedo,
    currentLayout: layout,
    selectedNodeId,
    setNodeColors: handleSetNodeColors,
    clearNodeColors: handleClearNodeColors
  }), [handleUndo, handleRedo, handleResetLayout, handleChangeLayout, undoRedoState.canUndo, undoRedoState.canRedo, layout, selectedNodeId, handleSetNodeColors, handleClearNodeColors])

  // Use ref to prevent excessive callback calls and potential render warnings
  const lastControlsRef = useRef<MindMapControls | null>(null)
  const controlsCallbackTimeoutRef = useRef<NodeJS.Timeout>()
  
  useEffect(() => {
    if (onControlsReady && controls !== lastControlsRef.current) {
      lastControlsRef.current = controls
      onControlsReady(controls)
    }
  }, [onControlsReady, controls])
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (controlsCallbackTimeoutRef.current) {
        clearTimeout(controlsCallbackTimeoutRef.current)
      }
    }
  }, [])

  // Prepare visible nodes and edges with drag state - memoized
  const visibleNodes = useMemo(() => {
    const baseVisibleNodes = layoutManager.getVisibleNodes(nodes, edges)
    return baseVisibleNodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        layout: layout
      }
    }))
  }, [nodes, edges, layout, layoutManager])

  // Apply drag state only when dragging, without triggering memo recalculation
  const nodesWithDragState = useMemo(() => {
    if (!draggedNodeId || !hasDraggedSignificantly) {
      return visibleNodes
    }
    
    return visibleNodes.map(node => {
      if (node.id === draggedNodeId || node.id === closestDropTarget) {
        return {
          ...node,
          data: {
            ...node.data,
            isDragging: node.id === draggedNodeId,
            isDropTarget: node.id === closestDropTarget,
            dropPosition: node.id === closestDropTarget ? dropPosition : null
          }
        }
      }
      return node
    })
  }, [visibleNodes, draggedNodeId, hasDraggedSignificantly, closestDropTarget, dropPosition])

  const visibleEdges = useMemo(() => {
    return layoutManager.getVisibleEdges(nodes, edges).map(edge => ({
      ...edge,
      selectable: false,
      deletable: false,
      focusable: false
    }))
  }, [nodes, edges, layoutManager])

  const draggedNode = useMemo(() => 
    draggedNodeId ? nodesWithDragState.find(n => n.id === draggedNodeId) : null,
    [draggedNodeId, nodesWithDragState]
  )

  return (
    <div
      ref={containerRef}
      className='h-full w-full relative overflow-hidden'
      style={{ minHeight: '400px' }}
    >
      {/* Drag Preview */}
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

      {/* ReactFlow */}
      <ReactFlow
        key={mindMapId}
        nodes={nodesWithDragState}
        edges={visibleEdges}
        onConnect={reactFlowHandlers.onConnect}
        onNodeClick={reactFlowHandlers.onNodeClick}
        onEdgeClick={reactFlowHandlers.onEdgeClick}
        onPaneClick={reactFlowHandlers.onPaneClick}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        elementsSelectable={true}
        nodesDraggable={true}
        connectOnClick={false}
        deleteKeyCode={null}
        selectNodesOnDrag={false}
        proOptions={{ hideAttribution: true }}
        panOnDrag={true} // Allow panning with mouse drag
        nodeDragThreshold={5} // Require more movement before considering it a drag
        fitView
        className='bg-gray-900 w-full h-full'
        style={{ 
          width: '100%', 
          height: '100%'
        }}
        defaultEdgeOptions={{
          style: { stroke: '#64748b', strokeWidth: 2 }
        }}
        onNodeContextMenu={() => {
          // Let nodes handle their own context menus
        }}
      >
      </ReactFlow>

      {/* Floating Action Buttons - appear when a node is selected */}
      {selectedNodeId && (
        <div className={`absolute bottom-4 right-4 flex gap-4 z-10 transition-opacity duration-300 ${
          isAnimatingToPanel || showGenerativePanel ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}>
          {/* Add Button */}
          <button
            onClick={() => handleAddChildNode(selectedNodeId)}
            className="p-3 bg-blue-600 hover:bg-blue-700 rounded-full shadow-lg transition-colors text-white"
            title="Add child node"
          >
            <Plus size={20} />
          </button>
          
          {/* Generative Button */}
          <button
            onClick={() => {
              setIsAnimatingToPanel(true)
              // First hide the buttons, then show the panel after a delay
              setTimeout(() => {
                setShowGenerativePanel(true)
              }, 200)
            }}
            className="generative-button p-3 rounded-full"
            title="Generate"
          >
            <Sparkles size={20} className="generative-icon" />
          </button>
          
          {/* Remove Button */}
          <button
            onClick={() => {
              if (selectedNodeId) {
                handleDeleteNode(selectedNodeId)
              }
            }}
            className="p-3 bg-red-600 hover:bg-red-700 rounded-full shadow-lg transition-colors text-white"
            title="Delete node"
          >
            <Trash2 size={20} />
          </button>
        </div>
      )}

      {/* Generative Input Panel */}
      {selectedNodeId && (
        <div className={`absolute bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 p-4 z-20 transform transition-transform duration-300 ease-out ${
          showGenerativePanel ? 'translate-y-0' : 'translate-y-full'
        }`}>
          <div className="max-w-4xl mx-auto flex gap-3 items-center">
            <input
              ref={generativeInputRef}
              type="text"
              value={generativeInput}
              onChange={(e) => setGenerativeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && generativeInput.trim() && !isGenerating) {
                  handleGenerate()
                }
                if (e.key === 'Escape') {
                  setShowGenerativePanel(false)
                  setGenerativeInput('')
                  setIsAnimatingToPanel(false)
                }
              }}
              placeholder="Enter your prompt to generate content..."
              className="flex-1 px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {/* Error message */}
            {generationError && (
              <div className="absolute left-0 right-0 top-full mt-2 p-3 bg-red-900/50 border border-red-600 rounded-lg text-red-200 text-sm flex justify-between items-start">
                <div>
                  <div className="font-medium mb-1">Error:</div>
                  <div>{generationError}</div>
                </div>
                <button 
                  onClick={() => setGenerationError(null)}
                  className="ml-2 text-red-300 hover:text-red-100 transition-colors"
                >
                  ✕
                </button>
              </div>
            )}
            {/* Success message */}
            {generationSummary && (
              <div className="absolute left-0 right-0 top-full mt-2 p-3 bg-green-900/50 border border-green-600 rounded-lg text-green-200 text-sm flex justify-between items-start">
                <div>
                  <div className="font-medium mb-1">Generation Complete!</div>
                  <div>{generationSummary}</div>
                </div>
                <button 
                  onClick={() => setGenerationSummary(null)}
                  className="ml-2 text-green-300 hover:text-green-100 transition-colors"
                >
                  ✕
                </button>
              </div>
            )}
            <button
              onClick={handleGenerate}
              disabled={!generativeInput.trim() || isGenerating || isStreaming}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium flex items-center gap-2"
            >
              {(isGenerating || isStreaming) ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Generating...
                </>
              ) : (
                'Generate'
              )}
            </button>
            <button
              onClick={() => {
                setShowGenerativePanel(false)
                setGenerativeInput('')
                setIsAnimatingToPanel(false)
              }}
              className="px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Inference Chat is now handled by MindMapsPanel */}
      
      {/* Generation Blocker */}
      <GeneratingBlocker
        isVisible={isStreaming}
        onCancel={handleCancelGeneration}
        status={stats.status}
        tokensPerSecond={stats.tokensPerSecond}
        totalTokens={stats.totalTokens}
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

export type { MindMapData }
