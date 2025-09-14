import React, { useEffect, useCallback, useRef } from 'react'
import ReactFlow, {
  Node,
  ConnectionMode,
  useReactFlow,
  ReactFlowProvider,
  useNodesInitialized
} from 'reactflow'
import 'reactflow/dist/style.css'
import { Plus, Trash2, Sparkles } from 'lucide-react'

import { MindMapNode } from './MindMapNode'
import { MindMapNodeData } from '../types/mindMap'
import { Source } from '../types/mindMap'
import { GenerateDialog } from '../../components/shared/GenerateDialog'
import { useGenerationStreaming } from '../../hooks/useGenerationStreaming'
import { useTaskBasedGeneration } from '../../hooks/useTaskBasedGeneration'
import { useTaskStore } from '../../store/useTaskStore'
import { useMindMapDrag } from '../hooks/useMindMapDrag'
import { MindMapData } from '../../utils/mindMapData'
import { useDialogAnimation } from '../../hooks/useDialogAnimation'

// Import the new Zustand store and hooks
import { 
  useMindMapStore,
  useMindMapNodes,
  useMindMapEdges,
  useMindMapLayout,
  useMindMapSelection,
  useMindMapHistory,
  useMindMapGeneration,
  useMindMapActions
} from '../../store/useMindMapStore'

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

function MindMapInner({
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
  
  // Use Zustand store
  const initializeMindMap = useMindMapStore(state => state.initializeMindMap)
  const isInitialized = useMindMapStore(state => state.isInitialized)
  const layoutManager = useMindMapStore(state => state.layoutManager)
  
  // Get reactive state from store
  const allNodes = useMindMapNodes()
  const allEdges = useMindMapEdges()
  const layout = useMindMapLayout()
  const { selectedNodeId, selectNode } = useMindMapSelection()
  const { canUndo, canRedo, undo, redo } = useMindMapHistory()
  const { 
    isGenerating, 
    generationError, 
    generationSummary,
    setGenerating,
    setGenerationError,
    setGenerationSummary
  } = useMindMapGeneration()
  
  // Filter visible nodes and edges based on collapse state
  const nodes = React.useMemo(() => {
    if (!layoutManager) return allNodes
    return layoutManager.getVisibleNodes(allNodes, allEdges)
  }, [allNodes, allEdges, layoutManager])
  
  const edges = React.useMemo(() => {
    if (!layoutManager) return allEdges
    return layoutManager.getVisibleEdges(allNodes, allEdges)
  }, [allNodes, allEdges, layoutManager])
  
  // Get actions from store
  const {
    addChildNode,
    addSiblingNode,
    deleteNode,
    updateNodeLabel,
    updateNodeLabelWithLayout,
    toggleNodeCollapse,
    moveNode,
    updateNodeChatId,
    updateNodeNotes,
    updateNodeSources,
    setNodeColors,
    clearNodeColors,
    changeLayout,
    resetLayout,
    applyMindmapChanges
  } = useMindMapActions()

  // Local UI state that doesn't belong in global store
  const [showGenerativePanel, setShowGenerativePanel] = React.useState(false)
  const [generativeInput, setGenerativeInput] = React.useState('')

  // Animation for the generative panel dialog
  const { 
    shouldRender: shouldRenderGenerativePanel, 
    isVisible: isGenerativePanelVisible, 
    handleClose: handleCloseGenerativePanel 
  } = useDialogAnimation(showGenerativePanel, () => setShowGenerativePanel(false))

  const generativeInputRef = useRef<HTMLTextAreaElement>(null)

  // Generation streaming hook
  const { isStreaming, cancelGeneration: cancelStreamGeneration } = useGenerationStreaming()
  const { isGenerating: isTaskGenerating, currentWorkflowId, startGeneration: startTaskGeneration, cancelGeneration: cancelTaskGeneration } = useTaskBasedGeneration()
  
  // Use task-based generation by default
  const totalIsGenerating = isTaskGenerating || isStreaming || isGenerating
  
  // Handle cancel generation  
  const handleCancelGeneration = useCallback(() => {
    if (isTaskGenerating) {
      cancelTaskGeneration()
    } else {
      cancelStreamGeneration()
    }
    setGenerationError('Generation cancelled by user')
  }, [isTaskGenerating, cancelTaskGeneration, cancelStreamGeneration])

  // Initialize mind map on mount or when mindMapId changes
  useEffect(() => {
    if (mindMapId) {
      initializeMindMap(mindMapId, initialData, onSave)
    }
  }, [mindMapId, initialData, onSave, initializeMindMap])

  // Handle external node updates via props
  useEffect(() => {
    if (!externalNodeUpdates || !isInitialized) return

    const { nodeId, chatId, notes, sources } = externalNodeUpdates
    
    if (chatId !== undefined) {
      updateNodeChatId(nodeId, chatId)
    }
    
    if (notes !== undefined) {
      updateNodeNotes(nodeId, notes)
    }

    if (sources !== undefined) {
      updateNodeSources(nodeId, sources)
    }
  }, [externalNodeUpdates, updateNodeChatId, updateNodeNotes, updateNodeSources, isInitialized])

  // Global click handler to deselect nodes when clicking outside
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as Element
      
      // Check if click is on color palette, mindmap controls, or dialog
      const isColorPaletteClick = target.closest('[data-color-palette]') !== null
      const isMindMapControlsClick = target.closest('[data-mindmap-controls]') !== null
      const isDialogClick = target.closest('[role="dialog"]') !== null
      
      // Check if click is outside the mindmap container
      if (containerRef.current && !containerRef.current.contains(e.target as HTMLElement)) {
        // Don't deselect if clicking on color palette, mindmap controls, or dialog
        if (selectedNodeId && !isColorPaletteClick && !isMindMapControlsClick && !isDialogClick) {
          selectNode(null)
          window.dispatchEvent(new CustomEvent('mindmap-close-context-menu'))
        }
      }
    }

    document.addEventListener('click', handleGlobalClick)
    return () => document.removeEventListener('click', handleGlobalClick)
  }, [selectedNodeId, selectNode])

  // Debounce fit view function
  const fitViewRef = useRef<NodeJS.Timeout>()
  const fitView = useCallback(({ padding, maxZoom, minZoom }: { padding?: number; maxZoom?: number; minZoom?: number }) => {
    if (fitViewRef.current) {
      clearTimeout(fitViewRef.current)
    }
    fitViewRef.current = setTimeout(() => {
      reactFlowInstance.fitView({ padding, maxZoom, minZoom, duration: 300 })
    }, 50)
  }, [reactFlowInstance])

  // Action handlers that wrap store actions
  const handleAddChildNode = useCallback(async (parentNodeId: string) => {
    await addChildNode(parentNodeId)
  }, [addChildNode])

  const handleAddSiblingNode = useCallback(async (siblingNodeId: string) => {
    await addSiblingNode(siblingNodeId)
  }, [addSiblingNode])

  const handleDeleteNode = useCallback(async (nodeIdToDelete: string) => {
    await deleteNode(nodeIdToDelete)
  }, [deleteNode])

  const handleUpdateNodeLabel = useCallback((nodeId: string, newLabel: string) => {
    updateNodeLabel(nodeId, newLabel)
  }, [updateNodeLabel])

  const handleNodeLabelFinished = useCallback(async (nodeId: string, newLabel: string) => {
    await updateNodeLabelWithLayout(nodeId, newLabel)
  }, [updateNodeLabelWithLayout])

  const handleToggleNodeCollapse = useCallback(async (nodeId: string) => {
    await toggleNodeCollapse(nodeId)
  }, [toggleNodeCollapse])

  const handleMoveNode = useCallback(async (
    nodeId: string,
    newParentId: string,
    insertIndex?: number
  ) => {
    await moveNode(nodeId, newParentId, insertIndex)
  }, [moveNode])

  const handleChangeLayout = useCallback(async (newLayout: 'LR' | 'RL' | 'TB' | 'BT') => {
    await changeLayout(newLayout)
    // Fit view after layout change
    setTimeout(() => fitView({}), 200)
  }, [changeLayout, fitView])

  const handleResetLayout = useCallback(async () => {
    await resetLayout()
    fitView({})
  }, [resetLayout, fitView])

  const handleUndo = useCallback(() => {
    undo()
    fitView({})
  }, [undo, fitView])

  const handleRedo = useCallback(() => {
    redo()
    fitView({})
  }, [redo, fitView])

  const handleSetNodeColors = useCallback((nodeId: string, colors: { backgroundClass: string; foregroundClass: string }) => {
    setNodeColors(nodeId, colors)
  }, [setNodeColors])

  const handleClearNodeColors = useCallback((nodeId: string) => {
    clearNodeColors(nodeId)
  }, [clearNodeColors])

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
    nodes: allNodes, // Use all nodes for drag logic, not just visible ones
    rootNodeId: useMindMapStore(state => state.rootNodeId),
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

  // Listen for individual task completions and apply their changes immediately
  const taskStore = useTaskStore()
  const currentWorkflow = taskStore.currentWorkflow
  const processedTasksRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!currentWorkflow || !currentWorkflowId) return
    
    // Find completed tasks that haven't been processed yet
    const unprocessedTasks = currentWorkflow.tasks.filter(task => 
      task.status === 'completed' && 
      task.result?.changes && 
      task.result.changes.length > 0 &&
      !processedTasksRef.current.has(task.id)
    )
    
    // Process each unprocessed task
    unprocessedTasks.forEach(task => {
      console.log('Processing task completion:', task.id, 'changes:', task.result.changes.length)
      processedTasksRef.current.add(task.id)
      
      applyMindmapChanges(task.result.changes).catch(error => {
        console.error('Failed to apply task changes:', task.id, error)
        // Remove from processed set on error so it can be retried
        processedTasksRef.current.delete(task.id)
      })
    })
  }, [currentWorkflow?.tasks, currentWorkflowId, applyMindmapChanges])

  // Reset processed tasks when workflow changes
  useEffect(() => {
    processedTasksRef.current.clear()
  }, [currentWorkflowId])

  // Generation function
  const handleGenerate = useCallback(async () => {
    console.log('handleGenerate called', { 
      generativeInput: generativeInput.trim(), 
      selectedNodeId, 
      totalIsGenerating 
    });
    
    if (!generativeInput.trim() || !selectedNodeId || totalIsGenerating) {
      console.log('Generation blocked:', {
        noInput: !generativeInput.trim(),
        noSelectedNode: !selectedNodeId,
        alreadyGenerating: totalIsGenerating
      });
      return;
    }

    setGenerationError(null)
    setGenerationSummary(null)

    try {
      await startTaskGeneration(
        mindMapId,
        generativeInput.trim(),
        selectedNodeId,
        {
          onProgress: (progress) => {
            console.log('Generation progress:', progress)
          },
          onComplete: (result) => {
            setGenerationSummary(result.summary)
            setGenerativeInput('')
            setShowGenerativePanel(false)
          },
          onError: (error) => {
            setGenerationError(error)
          }
        }
      )
    } catch (error) {
      console.error('Generation failed:', error)
      setGenerationError(error instanceof Error ? error.message : 'Generation failed')
    }
  }, [generativeInput, selectedNodeId, totalIsGenerating, mindMapId, startTaskGeneration])

  // Resize observer for responsive fitView
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    
    let resizeTimeout: NodeJS.Timeout
    let lastSize = { width: 0, height: 0 }
    
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        
        if (width !== lastSize.width || height !== lastSize.height) {
          lastSize = { width, height }
          
          if (width > 0 && height > 0) {
            clearTimeout(resizeTimeout)
            resizeTimeout = setTimeout(() => {
              if (nodesInitialized && allNodes.length > 0) {
                const padding = allNodes.length <= 3 ? 0.8 : 0.2
                
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
  }, [nodesInitialized, allNodes.length, fitView])

  // Provide controls to parent component
  useEffect(() => {
    if (onControlsReady) {
      const controls: MindMapControls = {
        undo: handleUndo,
        redo: handleRedo,
        resetLayout: handleResetLayout,
        changeLayout: handleChangeLayout,
        canUndo,
        canRedo,
        currentLayout: layout,
        selectedNodeId,
        setNodeColors: handleSetNodeColors,
        clearNodeColors: handleClearNodeColors
      }
      onControlsReady(controls)
    }
  }, [onControlsReady, handleUndo, handleRedo, handleResetLayout, handleChangeLayout, canUndo, canRedo, layout, selectedNodeId, handleSetNodeColors, handleClearNodeColors])

  // Default key bindings if none provided
  const effectiveKeyBindings = keyBindings && Object.keys(keyBindings).length > 0 ? keyBindings : {
    'Tab': 'addChild',
    'Enter': 'addSibling', 
    'Delete': 'deleteNode',
    'Backspace': 'deleteNode',
    'Ctrl+z': 'undo',
    'Ctrl+Z': 'undo',
    'Ctrl+y': 'redo',
    'Ctrl+Y': 'redo',
    '.': 'openInference',
    '/': 'openGenerative'
  }

  // Event listeners for node operations
  useEffect(() => {
    const handleToggleCollapse = (e: CustomEvent) => {
      handleToggleNodeCollapse(e.detail.nodeId)
    }

    const handleNodeUpdate = (e: CustomEvent) => {
      handleUpdateNodeLabel(e.detail.nodeId, e.detail.label)
    }

    const handleNodeUpdateFinished = (e: CustomEvent) => {
      handleNodeLabelFinished(e.detail.nodeId, e.detail.label)
    }

    const handleNodeSelect = (e: CustomEvent) => {
      const { nodeId } = e.detail
      selectNode(nodeId)
    }

    const handleNavigateSibling = (e: CustomEvent) => {
      const { currentNodeId, direction } = e.detail

      const currentNode = allNodes.find(n => n.id === currentNodeId)
      if (!currentNode) return

      // Build a tree traversal order (depth-first)
      const buildTraversalOrder = (): Node<MindMapNodeData>[] => {
        const traversalOrder: Node<MindMapNodeData>[] = []

        // Find root node
        const rootNode = allNodes.find(n => n.data.isRoot || !n.data.parentId)
        if (!rootNode) return []

        // Recursive depth-first traversal
        const traverse = (node: Node<MindMapNodeData>) => {
          traversalOrder.push(node)

          // Get children of this node, sorted by position
          const children = allNodes
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

    // Add event listeners
    window.addEventListener('mindmap-toggle-collapse', handleToggleCollapse as EventListener)
    window.addEventListener('mindmap-node-update', handleNodeUpdate as EventListener)
    window.addEventListener('mindmap-node-update-finished', handleNodeUpdateFinished as EventListener)
    window.addEventListener('mindmap-node-select', handleNodeSelect as EventListener)
    window.addEventListener('mindmap-navigate-sibling', handleNavigateSibling as EventListener)

    return () => {
      window.removeEventListener('mindmap-toggle-collapse', handleToggleCollapse as EventListener)
      window.removeEventListener('mindmap-node-update', handleNodeUpdate as EventListener)
      window.removeEventListener('mindmap-node-update-finished', handleNodeUpdateFinished as EventListener)
      window.removeEventListener('mindmap-node-select', handleNodeSelect as EventListener)
      window.removeEventListener('mindmap-navigate-sibling', handleNavigateSibling as EventListener)
    }
  }, [handleToggleNodeCollapse, handleUpdateNodeLabel, handleNodeLabelFinished, selectNode, allNodes])

  // Key bindings with better key matching
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't handle keys when user is typing in an input
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }

      const getKeyString = (e: KeyboardEvent) => {
        const modifiers = []
        if (e.ctrlKey || e.metaKey) modifiers.push('Ctrl')
        if (e.shiftKey) modifiers.push('Shift')
        if (e.altKey) modifiers.push('Alt')
        
        let key = e.key
        if (key === ' ') key = 'Space'
        
        return modifiers.length > 0 ? `${modifiers.join('+')}+${key}` : key
      }

      const normalizeKeyForComparison = (key: string) => {
        // Treat Delete and Backspace as the same key for comparison
        if (key === 'Backspace' || key === 'Delete') {
          return 'Delete/Backspace'
        }
        return key
      }

      const keyString = getKeyString(event)
      
      // Check if this key matches any binding
      for (const [bindingKey, action] of Object.entries(effectiveKeyBindings)) {
        // Normalize both keys for comparison to treat Delete and Backspace as synonymous
        const normalizedBindingKey = normalizeKeyForComparison(bindingKey)
        const normalizedKeyString = normalizeKeyForComparison(keyString)
        
        if (bindingKey.toLowerCase() === keyString.toLowerCase() || 
            normalizedBindingKey === normalizedKeyString) {
          event.preventDefault()
          
          switch (action) {
            case 'undo':
              handleUndo()
              break
            case 'redo':
              handleRedo()
              break
            case 'addChild':
              if (selectedNodeId) {
                handleAddChildNode(selectedNodeId)
              }
              break
            case 'addSibling':
              if (selectedNodeId) {
                handleAddSiblingNode(selectedNodeId)
              }
              break
            case 'deleteNode':
            case 'delete':
              if (selectedNodeId) {
                handleDeleteNode(selectedNodeId)
              }
              break
            case 'generate':
            case 'openGenerative':
              if (selectedNodeId) {
                setShowGenerativePanel(true)
                setTimeout(() => {
                  generativeInputRef.current?.focus()
                }, 100)
              }
              break
            case 'openInference':
              if (selectedNodeId) {
                const selectedNode = allNodes.find(node => node.id === selectedNodeId)
                if (selectedNode) {
                  window.dispatchEvent(new CustomEvent('mindmap-inference-open', {
                    detail: { 
                      nodeId: selectedNodeId,
                      label: selectedNode.data.label,
                      chatId: selectedNode.data.chatId,
                      notes: selectedNode.data.notes,
                      sources: selectedNode.data.sources,
                      position: { x: 0, y: 0 } // Default position since we don't have mouse position
                    }
                  }))
                }
              }
              break
          }
          break
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [effectiveKeyBindings, selectedNodeId, handleUndo, handleRedo, handleAddChildNode, handleAddSiblingNode, handleDeleteNode])

  // Node event handlers
  const onNodeClick = useCallback((event: React.MouseEvent, node: Node<MindMapNodeData>) => {
    selectNode(node.id)
  }, [selectNode])

  const onNodeDoubleClick = useCallback((event: React.MouseEvent, node: Node<MindMapNodeData>) => {
    // Start editing the node
    handleUpdateNodeLabel(node.id, node.data.label)
  }, [handleUpdateNodeLabel])

  const onPaneClick = useCallback(() => {
    selectNode(null)
  }, [selectNode])

  return (
    <div 
      ref={containerRef} 
      className="w-full h-full bg-slate-50 dark:bg-slate-900 relative"
    >
      {/* Drag Preview */}
      {draggedNodeId && hasDraggedSignificantly && dragCursorPosition && (() => {
        const draggedNode = nodes.find(n => n.id === draggedNodeId);
        if (!draggedNode) return null;
        
        const nodeLevel = draggedNode.data.level || 0;
        const rootColorClass = 'bg-blue-500 border-blue-400';
        const defaultColorClass = nodeLevel === 0 ? rootColorClass : '';
        const colorClass = draggedNode.data.customColors ? draggedNode.data.customColors.backgroundClass : defaultColorClass;
        const foregroundClass = draggedNode.data.customColors?.foregroundClass || (draggedNode.data.customColors ? '' : 'text-white');
        
        return (
          <div
            className="fixed pointer-events-none z-50"
            style={{
              left: dragCursorPosition.x,
              top: dragCursorPosition.y,
              transform: 'translate(-50%, -50%)'
            }}
          >
            <div className={`px-4 py-2 rounded-lg border-2 transition-colors duration-200 ${colorClass} ${foregroundClass} opacity-80 shadow-2xl scale-110 rotate-1 ${draggedNode.data.isRoot ? 'shadow-lg scale-110' : 'shadow-md'}`}>
              <span className="text-sm font-medium">
                {draggedNode.data.label}
              </span>
            </div>
          </div>
        );
      })()}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onPaneClick={onPaneClick}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.1 }}
        className="mind-map-flow"
        proOptions={{ hideAttribution: true }}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        panOnScroll={true}
        zoomOnScroll={true}
        zoomOnPinch={true}

        minZoom={0.1}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
      >
        {/* Node editing handlers */}
        {nodes.map(node => {
          if (node.data.isEditing) {
            return (
              <div
                key={node.id}
                style={{
                  position: 'absolute',
                  left: node.position.x,
                  top: node.position.y,
                  zIndex: 1000,
                  pointerEvents: 'none'
                }}
              >
                {/* Custom editing overlay if needed */}
              </div>
            )
          }
          return null
        })}

        {/* Drag and drop overlay */}
        {draggedNodeId && (
          <div className="absolute inset-0 pointer-events-none z-50">
            {/* Visual feedback for drag operations */}
            {closestDropTarget && (() => {
              const targetNode = nodes.find(n => n.id === closestDropTarget);
              if (!targetNode) return null;
              
              // Get the actual DOM element for the target node
              const targetElement = document.querySelector(`[data-id="${closestDropTarget}"]`);
              if (!targetElement) return null;
              
              const targetRect = targetElement.getBoundingClientRect();
              const containerRect = containerRef.current?.getBoundingClientRect();
              if (!containerRect) return null;
              
              // Calculate position relative to the ReactFlow container
              const relativeLeft = targetRect.left - containerRect.left;
              const relativeTop = targetRect.top - containerRect.top;
              const nodeWidth = targetRect.width;
              const nodeHeight = targetRect.height;
              
              if (dropPosition === 'over') {
                // Child indicator - highlight the entire node
                return (
                  <div
                    className="absolute border-2 border-dashed border-blue-400 bg-blue-100/20 rounded-lg pointer-events-none"
                    style={{
                      left: relativeLeft - 5,
                      top: relativeTop - 5,
                      width: nodeWidth + 10,
                      height: nodeHeight + 10
                    }}
                  />
                );
              } else if (dropPosition === 'above') {
                // Above indicator - thick line above the node
                return (
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      left: relativeLeft - 10,
                      top: relativeTop - 6,
                      width: nodeWidth + 20,
                      height: 4
                    }}
                  >
                    <div className="w-full h-full bg-green-400 rounded-full shadow-lg animate-pulse" />
                    <div className="absolute -left-2 -top-1 w-6 h-6 bg-green-400 rounded-full flex items-center justify-center shadow-lg">
                      <div className="w-2 h-2 bg-white rounded-full" />
                    </div>
                    <div className="absolute -right-2 -top-1 w-6 h-6 bg-green-400 rounded-full flex items-center justify-center shadow-lg">
                      <div className="w-2 h-2 bg-white rounded-full" />
                    </div>
                  </div>
                );
              } else if (dropPosition === 'below') {
                // Below indicator - thick line below the node
                return (
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      left: relativeLeft - 10,
                      top: relativeTop + nodeHeight + 2,
                      width: nodeWidth + 20,
                      height: 4
                    }}
                  >
                    <div className="w-full h-full bg-green-400 rounded-full shadow-lg animate-pulse" />
                    <div className="absolute -left-2 -top-1 w-6 h-6 bg-green-400 rounded-full flex items-center justify-center shadow-lg">
                      <div className="w-2 h-2 bg-white rounded-full" />
                    </div>
                    <div className="absolute -right-2 -top-1 w-6 h-6 bg-green-400 rounded-full flex items-center justify-center shadow-lg">
                      <div className="w-2 h-2 bg-white rounded-full" />
                    </div>
                  </div>
                );
              }
              
              return null;
            })()}
          </div>
        )}
      </ReactFlow>

      {/* Unified Generate Dialog */}
      {shouldRenderGenerativePanel && (
        <GenerateDialog
          isOpen={isGenerativePanelVisible}
          onClose={totalIsGenerating ? handleCancelGeneration : handleCloseGenerativePanel}
          workflowId={currentWorkflowId || undefined}
          isGenerating={totalIsGenerating}
          input={generativeInput}
          onInputChange={setGenerativeInput}
          onGenerate={handleGenerate}
          generationSummary={generationSummary}
        />
      )}

      {/* Floating Action Buttons - appear when a node is selected */}
      {selectedNodeId && (
        <div className="absolute bottom-4 right-4 flex gap-4 z-10">
          {/* Add Child Button */}
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
              setShowGenerativePanel(true)
              setTimeout(() => {
                generativeInputRef.current?.focus()
              }, 100)
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
    </div>
  )
}

export function MindMap(props: MindMapProps) {
  return (
    <ReactFlowProvider>
      <MindMapInner {...props} />
    </ReactFlowProvider>
  )
}
