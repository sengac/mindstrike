import React, { useEffect, useCallback, useRef } from 'react';
import type { Node } from 'reactflow';
import ReactFlow, {
  ConnectionMode,
  useReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Plus, Trash2, Sparkles } from 'lucide-react';
import { detectNodeOverlaps } from '../../utils/overlapDetection';

import { MindMapNode } from './MindMapNode';
import { MusicVisualization } from '../../components/MusicVisualization';
import type { MindMapNodeData } from '../types/mindMap';
import { GenerateDialog } from '../../components/shared/GenerateDialog';
import { useGenerationStreaming } from '../../hooks/useGenerationStreaming';
import { useIterativeGeneration } from '../../hooks/useIterativeGeneration';
import { NODE_COLORS, DEFAULT_NODE_COLORS } from '../constants/nodeColors';
import {
  Z_INDEX_LAYERS,
  ICON_SIZES,
  DEFAULT_POSITION,
  DEFAULT_VIEWPORT,
  ARRAY_NAVIGATION,
  FIT_VIEW_SETTINGS,
  TIMING_DELAYS,
  LAYOUT_CALC,
} from '../constants/magicNumbers';

import { useMindMapDrag } from '../hooks/useMindMapDrag';
import type { MindMapData } from '../../utils/mindMapData';
import { useDialogAnimation } from '../../hooks/useDialogAnimation';

// Import the new Zustand store and hooks
import {
  useMindMapStore,
  useMindMapNodes,
  useMindMapEdges,
  useMindMapLayout,
  useMindMapSelection,
  useMindMapHistory,
  useMindMapGeneration,
  useMindMapActions,
} from '../../store/useMindMapStore';

const nodeTypes = {
  mindMapNode: MindMapNode,
};

import type { NodeColorThemeType } from '../constants/nodeColors';

export interface MindMapControls {
  undo: () => void;
  redo: () => void;
  resetLayout: () => void;
  changeLayout: (layout: 'LR' | 'RL' | 'TB' | 'BT' | 'RD') => void;
  canUndo: boolean;
  canRedo: boolean;
  currentLayout: 'LR' | 'RL' | 'TB' | 'BT' | 'RD';
  selectedNodeId: string | null;
  setNodeColors: (nodeId: string, theme: NodeColorThemeType) => void;
  clearNodeColors: (nodeId: string) => void;
}

interface MindMapProps {
  mindMapId: string;
  onSave: (data: MindMapData) => Promise<void>;
  initialData?: MindMapData;
  onControlsReady?: (controls: MindMapControls) => void;
  keyBindings?: Record<string, string>;
}

function MindMapInner({
  mindMapId,
  onSave,
  initialData,
  onControlsReady,
  keyBindings = {},
}: MindMapProps) {
  const reactFlowInstance = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const containerRef = useRef<HTMLDivElement>(null);

  // Use Zustand store
  const initializeMindMap = useMindMapStore(state => state.initializeMindMap);
  const isInitialized = useMindMapStore(state => state.isInitialized);
  const layoutManager = useMindMapStore(state => state.layoutManager);

  // Get reactive state from store
  const allNodes = useMindMapNodes();
  const allEdges = useMindMapEdges();
  const layout = useMindMapLayout();
  const { selectedNodeId, selectNode } = useMindMapSelection();
  const { canUndo, canRedo, undo, redo } = useMindMapHistory();
  const { isGenerating, setGenerationError, setGenerationSummary } =
    useMindMapGeneration();

  // Filter visible nodes and edges based on collapse state
  const visibleNodes = React.useMemo(() => {
    if (!layoutManager) {
      return allNodes;
    }
    return layoutManager.getVisibleNodes(allNodes, allEdges);
  }, [allNodes, allEdges, layoutManager]);

  const edges = React.useMemo(() => {
    if (!layoutManager) {
      return allEdges;
    }
    return layoutManager.getVisibleEdges(allNodes, allEdges);
  }, [allNodes, allEdges, layoutManager]);

  // Get actions from store
  const {
    addChildNode,
    addSiblingNode,
    deleteNode,
    updateNodeLabel,
    updateNodeLabelWithLayout,
    toggleNodeCollapse,
    moveNode,
    setNodeColors,
    clearNodeColors,
    changeLayout,
    resetLayout,
  } = useMindMapActions();

  // Define handleMoveNode before using it in useMindMapDrag
  const handleMoveNode = useCallback(
    async (nodeId: string, newParentId: string, insertIndex?: number) => {
      await moveNode(nodeId, newParentId, insertIndex);
    },
    [moveNode]
  );

  // Initialize drag & drop before using its state
  const {
    draggedNodeId,
    closestDropTarget,
    dropPosition,
    hasDraggedSignificantly,
    dragCursorPosition,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
  } = useMindMapDrag({
    nodes: allNodes, // Use all nodes for drag logic, not just visible ones
    rootNodeId: useMindMapStore(state => state.rootNodeId),
    layout,
    moveNode: handleMoveNode,
  });

  // Map visible nodes with drag state
  const nodes = React.useMemo(() => {
    return visibleNodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        isDragging: node.id === draggedNodeId,
        isDropTarget: node.id === closestDropTarget,
        dropPosition: node.id === closestDropTarget ? dropPosition : null,
      },
    }));
  }, [visibleNodes, draggedNodeId, closestDropTarget, dropPosition]);

  // Local UI state that doesn't belong in global store
  const [showGenerativePanel, setShowGenerativePanel] = React.useState(false);
  const [generativeInput, setGenerativeInput] = React.useState('');

  // Animation for the generative panel dialog
  const {
    shouldRender: shouldRenderGenerativePanel,
    isVisible: isGenerativePanelVisible,
    handleClose: handleCloseGenerativePanel,
  } = useDialogAnimation(showGenerativePanel, () =>
    setShowGenerativePanel(false)
  );

  const generativeInputRef = useRef<HTMLTextAreaElement>(null);

  // Generation streaming hook
  const { isStreaming, cancelGeneration: cancelStreamGeneration } =
    useGenerationStreaming();
  const {
    isGenerating: isTaskGenerating,
    startGeneration: startTaskGeneration,
    cancelGeneration: cancelTaskGeneration,
  } = useIterativeGeneration();

  // Use task-based generation by default
  const totalIsGenerating = isTaskGenerating || isStreaming || isGenerating;

  // Handle cancel generation
  const handleCancelGeneration = useCallback(() => {
    if (isTaskGenerating) {
      cancelTaskGeneration();
    } else {
      cancelStreamGeneration();
    }
    setGenerationError('Generation cancelled by user');
  }, [isTaskGenerating, cancelTaskGeneration, cancelStreamGeneration]);

  // Initialize mind map on mount or when mindMapId changes
  useEffect(() => {
    if (mindMapId) {
      initializeMindMap(mindMapId, initialData, onSave);
    }
  }, [mindMapId, initialData, onSave, initializeMindMap]);

  // Overlap detection - runs after nodes are positioned
  useEffect(() => {
    if (!isInitialized || !nodesInitialized || nodes.length === 0) {
      return;
    }

    // Add a small delay to ensure nodes are fully rendered
    const timeoutId = setTimeout(() => {
      try {
        const result = detectNodeOverlaps(
          containerRef.current ?? undefined,
          false
        );

        // In development mode, log errors on overlap to catch layout issues
        if (result.hasOverlaps && process.env.NODE_ENV === 'development') {
          console.error('🚨 LAYOUT ERROR: Overlapping nodes detected!', result);
          // Only throw if there are many overlaps (indicates serious layout failure)
          if (result.overlaps.length > 3) {
            throw new Error(`Serious Layout Error: ${result.message}`);
          }
        }
      } catch (error) {
        console.error('Overlap detection failed:', error);
      }
    }, 500); // Small delay to ensure rendering is complete

    return () => clearTimeout(timeoutId);
  }, [isInitialized, nodesInitialized, nodes, edges, layout]);

  // Global click handler to deselect nodes when clicking outside
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as Element;

      // Check if click is on color palette, mindmap controls, or dialog
      const isColorPaletteClick =
        target.closest('[data-color-palette]') !== null;
      const isMindMapControlsClick =
        target.closest('[data-mindmap-controls]') !== null;
      const isDialogClick = target.closest('[role="dialog"]') !== null;

      // Check if click is outside the mindmap container
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as HTMLElement)
      ) {
        // Don't deselect if clicking on color palette, mindmap controls, or dialog
        if (
          selectedNodeId &&
          !isColorPaletteClick &&
          !isMindMapControlsClick &&
          !isDialogClick
        ) {
          selectNode(null);
          window.dispatchEvent(new CustomEvent('mindmap-close-context-menu'));
        }
      }
    };

    document.addEventListener('click', handleGlobalClick);
    return () => document.removeEventListener('click', handleGlobalClick);
  }, [selectedNodeId, selectNode]);

  // Debounce fit view function
  const fitViewRef = useRef<NodeJS.Timeout>();
  const fitView = useCallback(
    ({
      padding,
      maxZoom,
      minZoom,
    }: {
      padding?: number;
      maxZoom?: number;
      minZoom?: number;
    }) => {
      if (fitViewRef.current) {
        clearTimeout(fitViewRef.current);
      }
      fitViewRef.current = setTimeout(() => {
        reactFlowInstance.fitView({ padding, maxZoom, minZoom, duration: 300 });
      }, 50);
    },
    [reactFlowInstance]
  );

  // Action handlers that wrap store actions
  const handleAddChildNode = useCallback(
    async (parentNodeId: string) => {
      await addChildNode(parentNodeId);
    },
    [addChildNode]
  );

  const handleAddSiblingNode = useCallback(
    async (siblingNodeId: string) => {
      await addSiblingNode(siblingNodeId);
    },
    [addSiblingNode]
  );

  const handleDeleteNode = useCallback(
    async (nodeIdToDelete: string) => {
      await deleteNode(nodeIdToDelete);
    },
    [deleteNode]
  );

  const handleUpdateNodeLabel = useCallback(
    (nodeId: string, newLabel: string) => {
      updateNodeLabel(nodeId, newLabel);
    },
    [updateNodeLabel]
  );

  const handleNodeLabelFinished = useCallback(
    async (nodeId: string, newLabel: string) => {
      await updateNodeLabelWithLayout(nodeId, newLabel);
    },
    [updateNodeLabelWithLayout]
  );

  const handleToggleNodeCollapse = useCallback(
    async (nodeId: string) => {
      await toggleNodeCollapse(nodeId);
    },
    [toggleNodeCollapse]
  );

  const handleChangeLayout = useCallback(
    async (newLayout: 'LR' | 'RL' | 'TB' | 'BT' | 'RD') => {
      await changeLayout(newLayout);
      // Fit view after layout change
      setTimeout(() => fitView({}), 200);
    },
    [changeLayout, fitView]
  );

  const handleResetLayout = useCallback(async () => {
    await resetLayout();
    fitView({});
  }, [resetLayout, fitView]);

  const handleUndo = useCallback(() => {
    undo();
    fitView({});
  }, [undo, fitView]);

  const handleRedo = useCallback(() => {
    redo();
    fitView({});
  }, [redo, fitView]);

  const handleSetNodeColors = useCallback(
    (nodeId: string, theme: NodeColorThemeType) => {
      setNodeColors(nodeId, theme);
    },
    [setNodeColors]
  );

  const handleClearNodeColors = useCallback(
    (nodeId: string) => {
      clearNodeColors(nodeId);
    },
    [clearNodeColors]
  );

  // Note: Task processing is now handled by SSE in the mindmap store
  // This eliminates the issue where closing the dialog would disconnect task processing

  // Generation function
  const handleGenerate = useCallback(async () => {
    if (!generativeInput.trim() || !selectedNodeId || totalIsGenerating) {
      return;
    }

    setGenerationError(null);
    setGenerationSummary(null);

    try {
      await startTaskGeneration(
        mindMapId,
        generativeInput.trim(),
        selectedNodeId
      );
      // Clear input and hide panel on successful generation
      setGenerativeInput('');
      setShowGenerativePanel(false);
    } catch (error) {
      setGenerationError(
        error instanceof Error ? error.message : 'Generation failed'
      );
    }
  }, [
    generativeInput,
    selectedNodeId,
    totalIsGenerating,
    mindMapId,
    startTaskGeneration,
  ]);

  // Resize observer for responsive fitView
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let resizeTimeout: NodeJS.Timeout;
    let lastSize = { width: DEFAULT_POSITION.X, height: DEFAULT_POSITION.Y };

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;

        if (width !== lastSize.width || height !== lastSize.height) {
          lastSize = { width, height };

          if (width > 0 && height > 0) {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
              if (nodesInitialized && allNodes.length > 0) {
                const padding =
                  allNodes.length <= FIT_VIEW_SETTINGS.SMALL_MAP_THRESHOLD
                    ? FIT_VIEW_SETTINGS.PADDING_SMALL_MAP
                    : FIT_VIEW_SETTINGS.PADDING_LARGE_MAP;

                fitView({
                  padding,
                  maxZoom: FIT_VIEW_SETTINGS.MAX_ZOOM,
                  minZoom: FIT_VIEW_SETTINGS.MIN_ZOOM,
                });
              }
            }, TIMING_DELAYS.RESIZE_DEBOUNCE);
          }
        }
      }
    });

    resizeObserver.observe(container);
    return () => {
      resizeObserver.disconnect();
      clearTimeout(resizeTimeout);
    };
  }, [nodesInitialized, allNodes.length, fitView]);

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
        clearNodeColors: handleClearNodeColors,
      };
      onControlsReady(controls);
    }
  }, [
    onControlsReady,
    handleUndo,
    handleRedo,
    handleResetLayout,
    handleChangeLayout,
    canUndo,
    canRedo,
    layout,
    selectedNodeId,
    handleSetNodeColors,
    handleClearNodeColors,
  ]);

  // Default key bindings if none provided
  const effectiveKeyBindings =
    keyBindings && Object.keys(keyBindings).length > 0
      ? keyBindings
      : {
          Tab: 'addChild',
          Enter: 'addSibling',
          Delete: 'deleteNode',
          Backspace: 'deleteNode',
          'Ctrl+z': 'undo',
          'Ctrl+Z': 'undo',
          'Ctrl+y': 'redo',
          'Ctrl+Y': 'redo',
          'Shift+Ctrl+z': 'redo',
          'Shift+Ctrl+Z': 'redo',
          'Ctrl+Shift+z': 'redo',
          'Ctrl+Shift+Z': 'redo',
          '.': 'openInference',
          '/': 'openGenerative',
        };

  // Event listeners for node operations
  useEffect(() => {
    const handleToggleCollapse = (e: CustomEvent) => {
      handleToggleNodeCollapse(e.detail.nodeId);
    };

    const handleNodeUpdate = (e: CustomEvent) => {
      handleUpdateNodeLabel(e.detail.nodeId, e.detail.label);
    };

    const handleNodeUpdateFinished = (e: CustomEvent) => {
      handleNodeLabelFinished(e.detail.nodeId, e.detail.label);
    };

    const handleNodeSelect = (e: CustomEvent) => {
      const { nodeId } = e.detail;
      selectNode(nodeId);
    };

    const handleNavigateSibling = (e: CustomEvent) => {
      const { currentNodeId, direction } = e.detail;

      const currentNode = allNodes.find(n => n.id === currentNodeId);
      if (!currentNode) {
        return;
      }

      // Build a tree traversal order (depth-first)
      const buildTraversalOrder = (): Node<MindMapNodeData>[] => {
        const traversalOrder: Node<MindMapNodeData>[] = [];

        // Find root node
        const rootNode = allNodes.find(n => n.data.isRoot || !n.data.parentId);
        if (!rootNode) {
          return [];
        }

        // Recursive depth-first traversal
        const traverse = (node: Node<MindMapNodeData>) => {
          traversalOrder.push(node);

          // Get children of this node, sorted by position
          const children = allNodes
            .filter(n => n.data.parentId === node.id)
            .sort((a, b) => {
              // Sort by position (top to bottom, left to right)
              if (Math.abs(a.position.y - b.position.y) > 10) {
                return a.position.y - b.position.y;
              }
              return a.position.x - b.position.x;
            });

          // Recursively traverse each child
          children.forEach(child => traverse(child));
        };

        traverse(rootNode);
        return traversalOrder;
      };

      const traversalOrder = buildTraversalOrder();
      const currentIndex = traversalOrder.findIndex(
        n => n.id === currentNodeId
      );

      if (currentIndex === -1) {
        return;
      }

      let targetNode: Node<MindMapNodeData> | null = null;

      if (direction === 'prev') {
        // Go to previous node in traversal order (wrap to end if at beginning)
        const prevIndex =
          currentIndex > 0 ? currentIndex - 1 : traversalOrder.length - 1;
        targetNode = traversalOrder[prevIndex];
      } else if (direction === 'next') {
        // Go to next node in traversal order (wrap to beginning if at end)
        const nextIndex =
          currentIndex < traversalOrder.length - ARRAY_NAVIGATION.INCREMENT
            ? currentIndex + ARRAY_NAVIGATION.INCREMENT
            : ARRAY_NAVIGATION.FIRST_INDEX;
        targetNode = traversalOrder[nextIndex];
      }

      if (targetNode) {
        // Dispatch inference open event for the target node
        window.dispatchEvent(
          new CustomEvent('mindmap-inference-open', {
            detail: {
              nodeId: targetNode.id,
              label: targetNode.data.label,
              chatId: targetNode.data.chatId,
              notes: targetNode.data.notes,
              sources: targetNode.data.sources,
            },
          })
        );
      }
    };

    // Add event listeners
    window.addEventListener(
      'mindmap-toggle-collapse',
      handleToggleCollapse as EventListener
    );
    window.addEventListener(
      'mindmap-node-update',
      handleNodeUpdate as EventListener
    );
    window.addEventListener(
      'mindmap-node-update-finished',
      handleNodeUpdateFinished as EventListener
    );
    window.addEventListener(
      'mindmap-node-select',
      handleNodeSelect as EventListener
    );
    window.addEventListener(
      'mindmap-navigate-sibling',
      handleNavigateSibling as EventListener
    );

    return () => {
      window.removeEventListener(
        'mindmap-toggle-collapse',
        handleToggleCollapse as EventListener
      );
      window.removeEventListener(
        'mindmap-node-update',
        handleNodeUpdate as EventListener
      );
      window.removeEventListener(
        'mindmap-node-update-finished',
        handleNodeUpdateFinished as EventListener
      );
      window.removeEventListener(
        'mindmap-node-select',
        handleNodeSelect as EventListener
      );
      window.removeEventListener(
        'mindmap-navigate-sibling',
        handleNavigateSibling as EventListener
      );
    };
  }, [
    handleToggleNodeCollapse,
    handleUpdateNodeLabel,
    handleNodeLabelFinished,
    selectNode,
    allNodes,
  ]);

  // Key bindings with better key matching
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't handle keys when user is typing in an input
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const getKeyString = (e: KeyboardEvent) => {
        const modifiers = [];
        if (e.ctrlKey || e.metaKey) {
          modifiers.push('Ctrl');
        }
        if (e.shiftKey) {
          modifiers.push('Shift');
        }
        if (e.altKey) {
          modifiers.push('Alt');
        }

        let key = e.key;
        if (key === ' ') {
          key = 'Space';
        }

        return modifiers.length > 0 ? `${modifiers.join('+')}+${key}` : key;
      };

      const normalizeKeyForComparison = (key: string) => {
        // Treat Delete and Backspace as the same key for comparison
        if (key === 'Backspace' || key === 'Delete') {
          return 'Delete/Backspace';
        }
        return key;
      };

      const normalizeKeyString = (keyStr: string) => {
        // Split the key string into parts
        const parts = keyStr.split('+');
        const modifiers: string[] = [];
        let mainKey = '';

        // Separate modifiers from the main key
        parts.forEach(part => {
          if (['Ctrl', 'Shift', 'Alt', 'Meta'].includes(part)) {
            modifiers.push(part);
          } else {
            mainKey = part;
          }
        });

        // Sort modifiers to ensure consistent order
        modifiers.sort();

        // Rebuild the key string with sorted modifiers
        return modifiers.length > 0
          ? `${modifiers.join('+')}+${mainKey}`
          : mainKey;
      };

      const keyString = getKeyString(event);

      // Check if this key matches any binding
      for (const [bindingKey, action] of Object.entries(effectiveKeyBindings)) {
        // Normalize both keys for comparison to treat Delete and Backspace as synonymous
        const normalizedBindingKey = normalizeKeyForComparison(bindingKey);
        const normalizedKeyString = normalizeKeyForComparison(keyString);

        // Normalize both key strings to handle modifier order
        const normalizedBindingKeyString = normalizeKeyString(bindingKey);
        const normalizedPressedKeyString = normalizeKeyString(keyString);

        if (
          bindingKey.toLowerCase() === keyString.toLowerCase() ||
          normalizedBindingKey === normalizedKeyString ||
          normalizedBindingKeyString.toLowerCase() ===
            normalizedPressedKeyString.toLowerCase()
        ) {
          event.preventDefault();

          switch (action) {
            case 'undo':
              handleUndo();
              break;
            case 'redo':
              handleRedo();
              break;
            case 'addChild':
              if (selectedNodeId) {
                handleAddChildNode(selectedNodeId);
              }
              break;
            case 'addSibling':
              if (selectedNodeId) {
                handleAddSiblingNode(selectedNodeId);
              }
              break;
            case 'deleteNode':
            case 'delete':
              if (selectedNodeId) {
                handleDeleteNode(selectedNodeId);
              }
              break;
            case 'generate':
            case 'openGenerative':
              if (selectedNodeId) {
                setShowGenerativePanel(true);
                setTimeout(() => {
                  generativeInputRef.current?.focus();
                }, 100);
              }
              break;
            case 'openInference':
              if (selectedNodeId) {
                const selectedNode = allNodes.find(
                  node => node.id === selectedNodeId
                );
                if (selectedNode) {
                  window.dispatchEvent(
                    new CustomEvent('mindmap-inference-open', {
                      detail: {
                        nodeId: selectedNodeId,
                        label: selectedNode.data.label,
                        chatId: selectedNode.data.chatId,
                        notes: selectedNode.data.notes,
                        sources: selectedNode.data.sources,
                        position: {
                          x: DEFAULT_POSITION.X,
                          y: DEFAULT_POSITION.Y,
                        }, // Default position since we don't have mouse position
                      },
                    })
                  );
                }
              }
              break;
          }
          break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    effectiveKeyBindings,
    selectedNodeId,
    handleUndo,
    handleRedo,
    handleAddChildNode,
    handleAddSiblingNode,
    handleDeleteNode,
  ]);

  // Node event handlers
  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node<MindMapNodeData>) => {
      // Event parameter required by ReactFlow callback interface
      event; // Acknowledge parameter
      selectNode(node.id);
    },
    [selectNode]
  );

  const onNodeDoubleClick = useCallback(
    (event: React.MouseEvent, node: Node<MindMapNodeData>) => {
      // Event parameter required by ReactFlow callback interface
      event; // Acknowledge parameter
      // Start editing the node
      handleUpdateNodeLabel(node.id, node.data.label);
    },
    [handleUpdateNodeLabel]
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  // Custom wheel handler for Ctrl+scroll panning
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      // If Ctrl key is held, enable panning with scroll wheel
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();

        // Pan the viewport based on scroll delta
        const deltaX = event.deltaX;
        const deltaY = event.deltaY;

        const viewport = reactFlowInstance.getViewport();
        reactFlowInstance.setViewport({
          x: viewport.x - deltaX,
          y: viewport.y - deltaY,
          zoom: viewport.zoom,
        });
      }
    };

    const reactFlowElement = container.querySelector('.react-flow');
    if (reactFlowElement) {
      reactFlowElement.addEventListener('wheel', handleWheel, { passive: false });

      return () => {
        reactFlowElement.removeEventListener('wheel', handleWheel);
      };
    }
  }, [reactFlowInstance]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-slate-50 dark:bg-dark-bg relative"
    >
      {/* Music Visualization Background */}
      <MusicVisualization className="absolute inset-0 w-full h-full pointer-events-none" />
      {/* Drag Preview */}
      {draggedNodeId &&
        hasDraggedSignificantly &&
        dragCursorPosition &&
        (() => {
          const draggedNode = nodes.find(n => n.id === draggedNodeId);
          if (!draggedNode) {
            return null;
          }

          const nodeLevel = draggedNode.data.level ?? 0;
          const isRootNode = nodeLevel === LAYOUT_CALC.ROOT_LEVEL;

          // Get colors based on theme or defaults
          let colors: {
            backgroundColor: string;
            borderColor: string;
            foregroundColor: string;
          };

          if (
            draggedNode.data.colorTheme &&
            NODE_COLORS[draggedNode.data.colorTheme]
          ) {
            // Use theme colors if set
            colors = NODE_COLORS[draggedNode.data.colorTheme];
          } else if (isRootNode) {
            // Use default root colors
            colors = DEFAULT_NODE_COLORS.root;
          } else {
            // Use default regular node colors
            colors = DEFAULT_NODE_COLORS.regular;
          }

          const {
            backgroundColor,
            borderColor,
            foregroundColor: textColor,
          } = colors;

          return (
            <div
              className="fixed pointer-events-none z-50"
              style={{
                left: dragCursorPosition.x,
                top: dragCursorPosition.y,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <div
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: `2px solid ${borderColor}`,
                  backgroundColor,
                  color: textColor,
                  transition: 'all 0.2s',
                  opacity: 0.8,
                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
                  transform: 'scale(1.1) rotate(1deg)',
                  ...(draggedNode.data.isRoot
                    ? { boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }
                    : {}),
                }}
              >
                <span style={{ fontSize: '0.875rem', fontWeight: '500' }}>
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
        panOnScroll={false}
        zoomOnScroll={true}
        zoomOnPinch={true}
        zoomOnDoubleClick={false}
        minZoom={0.1}
        maxZoom={2}
        defaultViewport={{
          x: DEFAULT_VIEWPORT.X,
          y: DEFAULT_VIEWPORT.Y,
          zoom: DEFAULT_VIEWPORT.ZOOM,
        }}
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
                  zIndex: Z_INDEX_LAYERS.CONTROLS,
                  pointerEvents: 'none',
                }}
              >
                {/* Custom editing overlay if needed */}
              </div>
            );
          }
          return null;
        })}

        {/* Drag and drop overlay - Removed duplicate indicators as they are now handled by MindMapNode component
        {draggedNodeId && (
          <div className="absolute inset-0 pointer-events-none z-50">
            {/* Visual feedback for drag operations }
            {closestDropTarget &&
              (() => {
                const targetNode = nodes.find(n => n.id === closestDropTarget);
                if (!targetNode) {
                  return null;
                }

                // Get the actual DOM element for the target node
                const targetElement = document.querySelector(
                  `[data-id="${closestDropTarget}"]`
                );
                if (!targetElement) {
                  return null;
                }

                const targetRect = targetElement.getBoundingClientRect();

                // The overlay div is positioned absolute inside ReactFlow
                // We need to get the position relative to the ReactFlow component, not the outer container
                const reactFlowElement =
                  containerRef.current?.querySelector('.react-flow');
                if (!reactFlowElement) {
                  return null;
                }
                const reactFlowRect = reactFlowElement.getBoundingClientRect();

                // Calculate position relative to the ReactFlow component
                const relativeLeft = targetRect.left - reactFlowRect.left;
                const relativeTop = targetRect.top - reactFlowRect.top;
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
                        height: nodeHeight + 10,
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
                        height: UI_DIMENSIONS.DROP_INDICATOR_HEIGHT,
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
                        height: UI_DIMENSIONS.DROP_INDICATOR_HEIGHT,
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
        )} */}
      </ReactFlow>

      {/* Unified Generate Dialog */}
      {shouldRenderGenerativePanel && (
        <GenerateDialog
          isOpen={isGenerativePanelVisible}
          onClose={
            totalIsGenerating
              ? handleCancelGeneration
              : handleCloseGenerativePanel
          }
          input={generativeInput}
          onInputChange={setGenerativeInput}
          onGenerate={handleGenerate}
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
            <Plus size={ICON_SIZES.XLARGE} />
          </button>

          {/* Generative Button */}
          <button
            onClick={() => {
              setShowGenerativePanel(true);
              setTimeout(() => {
                generativeInputRef.current?.focus();
              }, 100);
            }}
            className="generative-button p-3 rounded-full"
            title="Generate"
          >
            <Sparkles size={ICON_SIZES.XLARGE} className="generative-icon" />
          </button>

          {/* Remove Button */}
          <button
            onClick={() => {
              if (selectedNodeId) {
                handleDeleteNode(selectedNodeId);
              }
            }}
            className="p-3 bg-red-600 hover:bg-red-700 rounded-full shadow-lg transition-colors text-white"
            title="Delete node"
          >
            <Trash2 size={ICON_SIZES.XLARGE} />
          </button>
        </div>
      )}
    </div>
  );
}

export function MindMap(props: MindMapProps) {
  return (
    <ReactFlowProvider>
      <MindMapInner {...props} />
    </ReactFlowProvider>
  );
}
