import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { NodeProps } from 'reactflow';
import { Handle, Position } from 'reactflow';
import {
  Plus,
  Minus,
  PanelRightOpen,
  Edit,
  Trash2,
  Share,
  FileText,
  BookOpen,
  MessageCircle,
} from 'lucide-react';
import type { MindMapNodeData } from '../types/mindMap';
import {
  useMindMapActions,
  useMindMapSelection,
} from '../../store/useMindMapStore';
import { createDefaultSizingStrategy } from '../services/nodeSizingStrategy';
import { NODE_COLORS, DEFAULT_NODE_COLORS } from '../constants/nodeColors';

// Define all styles as objects to replace Tailwind classes
const styles = {
  container: {
    position: 'relative' as const,
  },
  dropIndicatorHorizontal: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    height: '4px',
    backgroundColor: '#4ade80',
    borderRadius: '9999px',
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
    zIndex: 20,
  },
  dropIndicatorVertical: {
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    width: '4px',
    backgroundColor: '#4ade80',
    borderRadius: '9999px',
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
    zIndex: 20,
  },
  dropDot: {
    width: '8px',
    height: '8px',
    backgroundColor: '#4ade80',
    borderRadius: '50%',
  },
  inferenceButton: {
    position: 'absolute' as const,
    left: '8px',
    top: '50%',
    transform: 'translate(-100%, -50%)',
    marginRight: '4px',
    zIndex: 20,
  },
  inferenceButtonInner: {
    position: 'relative' as const,
    width: '32px',
    height: '32px',
    backgroundColor: '#2563eb',
    border: '1px solid #3b82f6',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    zIndex: 10,
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
  },
  inferenceButtonHover: {
    backgroundColor: '#1d4ed8',
  },
  ripple: {
    position: 'absolute' as const,
    inset: 0,
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    zIndex: 0,
  },
  node: {
    padding: '8px 16px',
    borderRadius: '8px',
    border: '2px solid',
    transition: 'all 0.2s',
    position: 'relative' as const,
    boxSizing: 'border-box' as const,
  },
  nodeSelected: {
    boxShadow: '0 0 0 2px #fbbf24, 0 0 0 4px #111827',
  },
  nodeRoot: {
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    transform: 'scale(1.1)',
  },
  nodeDragging: {
    opacity: 0.3,
    transform: 'scale(0.95)',
    boxShadow: '0 0 0 2px #60a5fa, 0 0 0 4px #111827',
  },
  nodeDropTarget: {
    boxShadow: '0 0 0 2px #4ade80, 0 0 0 4px #111827',
    animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  },
  iconContainer: {
    position: 'absolute' as const,
    bottom: '-10px',
    right: '-10px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    zIndex: 10,
  },
  iconBadge: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  chatIcon: {
    backgroundColor: '#10b981',
  },
  chatIconHover: {
    backgroundColor: '#059669',
  },
  notesIcon: {
    backgroundColor: '#ef4444',
  },
  notesIconHover: {
    backgroundColor: '#dc2626',
  },
  sourcesIcon: {
    backgroundColor: '#f97316',
  },
  sourcesIconHover: {
    backgroundColor: '#ea580c',
  },
  textContainer: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '8px',
    width: '100%',
    minHeight: '100%',
  },
  textInput: {
    backgroundColor: 'transparent',
    border: 'none',
    outline: 'none',
    fontSize: '0.875rem',
    fontWeight: '500',
    flex: 1,
    minWidth: 0,
    resize: 'none' as const,
    width: '100%',
    lineHeight: 1.5,
    minHeight: '1.5em',
    color: 'inherit',
    wordBreak: 'break-word' as const,
    whiteSpace: 'pre-wrap' as const,
    overflowWrap: 'break-word' as const,
    overflow: 'hidden',
    height: 'auto',
  },
  textLabel: {
    fontSize: '0.875rem',
    fontWeight: '500',
    flex: 1,
    minWidth: 0,
    cursor: 'pointer',
    userSelect: 'none' as const,
    wordBreak: 'break-word' as const,
    whiteSpace: 'pre-wrap' as const,
    overflowWrap: 'break-word' as const,
    lineHeight: 1.5,
    color: 'inherit',
    display: 'block',
  },
  collapseButton: {
    position: 'absolute' as const,
    width: '24px',
    height: '24px',
    backgroundColor: '#4b5563',
    border: '1px solid #6b7280',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    zIndex: 10,
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
  },
  collapseButtonHover: {
    backgroundColor: '#6b7280',
  },
  contextMenu: {
    position: 'fixed' as const,
    backgroundColor: '#1f2937',
    border: '1px solid #4b5563',
    borderRadius: '8px',
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    padding: '8px 0',
    minWidth: '160px',
    zIndex: 9999,
  },
  contextMenuItem: {
    width: '100%',
    textAlign: 'left' as const,
    padding: '8px 16px',
    fontSize: '0.875rem',
    color: '#ffffff',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    transition: 'background-color 0.2s',
  },
  contextMenuItemHover: {
    backgroundColor: '#374151',
  },
  contextMenuItemDanger: {
    color: '#f87171',
  },
  contextMenuDivider: {
    margin: '4px 0',
    borderTop: '1px solid #4b5563',
  },
};

// Add keyframes for animations
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }
  @keyframes ripple {
    0% {
      transform: scale(1);
      opacity: 1;
    }
    100% {
      transform: scale(2.5);
      opacity: 0;
    }
  }
  @keyframes ripple-delayed {
    0% {
      transform: scale(1);
      opacity: 1;
    }
    100% {
      transform: scale(2.5);
      opacity: 0;
    }
  }
  .animate-ripple {
    animation: ripple 1.5s linear infinite;
  }
  .animate-ripple-delayed {
    animation: ripple-delayed 1.5s linear infinite;
    animation-delay: 0.5s;
  }
`;
document.head.appendChild(styleSheet);

export function MindMapNode({
  id,
  data,
  selected,
}: NodeProps<MindMapNodeData>) {
  const [isEditing, setIsEditing] = useState(data.isEditing || false);
  const [label, setLabel] = useState(data.label);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({
    x: 0,
    y: 0,
  });
  const [nodeWidth, setNodeWidth] = useState(data.width || 120);
  const [nodeHeight, setNodeHeight] = useState(data.height || 32);
  const [isInferenceActive, setIsInferenceActive] = useState(false);
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Create sizing strategy instance
  const sizingStrategy = createDefaultSizingStrategy();

  // Get actions from store
  const {
    addChildNode,
    addSiblingNode,
    deleteNode,
    updateNodeLabelWithLayout,
    toggleNodeCollapse,
    updateNodeDimensions,
  } = useMindMapActions();

  // Get selection from store
  const { selectNode } = useMindMapSelection();

  useEffect(() => {
    if (isEditing && inputRef.current) {
      // Use setTimeout to ensure the input is properly mounted and visible
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
          // Auto-resize to fit content
          inputRef.current.style.height = 'auto';
          inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
        }
      }, 100);
    }
  }, [isEditing]);

  useEffect(() => {
    if (data.isEditing !== undefined) {
      setIsEditing(data.isEditing);
    }
  }, [data.isEditing]);

  // Calculate node dimensions using sizing strategy
  useEffect(() => {
    if (!data.isDragging) {
      const displayLabel = label || data.label || 'Untitled';
      const hasIcons = !!(
        data.chatId ||
        data.notes?.trim() ||
        (data.sources && data.sources.length > 0)
      );

      const dimensions = sizingStrategy.calculateNodeSize(displayLabel, {
        isEditing,
        hasIcons,
        level: data.level || 0,
        isCollapsed: data.isCollapsed,
      });

      // Only update if dimensions changed significantly
      let dimensionsChanged = false;
      if (Math.abs(dimensions.width - nodeWidth) > 5) {
        setNodeWidth(dimensions.width);
        dimensionsChanged = true;
      }
      if (Math.abs(dimensions.height - nodeHeight) > 2) {
        setNodeHeight(dimensions.height);
        dimensionsChanged = true;
      }

      // Notify the store about dimension changes to trigger re-layout
      if (dimensionsChanged && !isEditing) {
        // Debounce the update to avoid too many re-layouts
        const timeoutId = setTimeout(() => {
          updateNodeDimensions(id, dimensions.width, dimensions.height);
        }, 300);

        return () => clearTimeout(timeoutId);
      }
    }
  }, [
    label,
    data.label,
    data.isDragging,
    isEditing,
    data.chatId,
    data.notes,
    data.sources,
    data.level,
    data.isCollapsed,
    sizingStrategy,
    nodeWidth,
    nodeHeight,
    id,
    updateNodeDimensions,
  ]);

  // Update dimensions when data changes (from parent)
  useEffect(() => {
    if (data.width && Math.abs(data.width - nodeWidth) > 5) {
      setNodeWidth(data.width);
    }
    if (data.height && Math.abs(data.height - nodeHeight) > 2) {
      setNodeHeight(data.height);
    }
  }, [data.width, data.height, data.label, data.isDragging]);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      // Don't close if clicking on the context menu itself
      if (contextMenuRef.current && contextMenuRef.current.contains(target)) {
        return;
      }

      // Don't close if clicking on this node (let the node handle its own events)
      const nodeElement = document.querySelector(`[data-id="${id}"]`);
      if (nodeElement && nodeElement.contains(target)) {
        return;
      }

      setShowContextMenu(false);
    };

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowContextMenu(false);
      }
    };

    if (showContextMenu) {
      // Add a longer delay before registering outside click handlers
      // This prevents touchpad right-click gestures from immediately closing the menu
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside, true);
        document.addEventListener('click', handleClickOutside, true);
        document.addEventListener('keydown', handleEscapeKey);
      }, 500);

      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside, true);
        document.removeEventListener('click', handleClickOutside, true);
        document.removeEventListener('keydown', handleEscapeKey);
      };
    }
  }, [showContextMenu, id]);

  // Listen for global context menu close events
  useEffect(() => {
    const handleCloseContextMenu = () => {
      setShowContextMenu(false);
    };

    window.addEventListener(
      'mindmap-close-context-menu',
      handleCloseContextMenu
    );

    return () => {
      window.removeEventListener(
        'mindmap-close-context-menu',
        handleCloseContextMenu
      );
    };
  }, []);

  // Listen for inference active state changes
  useEffect(() => {
    const handleInferenceActive = (event: CustomEvent) => {
      const { activeNodeId } = event.detail;
      setIsInferenceActive(activeNodeId === id);
    };

    // Check if this node is currently active when component mounts
    // by dispatching a request for current active state
    const checkCurrentActiveState = () => {
      window.dispatchEvent(
        new CustomEvent('mindmap-inference-get-active', {
          detail: { requestingNodeId: id },
        })
      );
    };

    window.addEventListener(
      'mindmap-inference-active',
      handleInferenceActive as EventListener
    );

    // Check current state on mount
    setTimeout(checkCurrentActiveState, 0);

    return () => {
      window.removeEventListener(
        'mindmap-inference-active',
        handleInferenceActive as EventListener
      );
    };
  }, [id]);

  const handleSubmit = () => {
    setIsEditing(false);
    const finalLabel = label.trim() || 'Untitled';

    // Update node label via store action
    updateNodeLabelWithLayout(id, finalLabel);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      setLabel(data.label);
      setIsEditing(false);
    }
  };

  const handleToggleCollapse = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleNodeCollapse(id);
  };

  const handleInferenceClick = (e: React.MouseEvent) => {
    e.stopPropagation();

    // Get button position for popup positioning
    const rect = e.currentTarget.getBoundingClientRect();
    const position = {
      x: rect.left,
      y: rect.top + rect.height / 2,
    };

    window.dispatchEvent(
      new CustomEvent('mindmap-inference-open', {
        detail: {
          nodeId: id,
          label: data.label,
          chatId: data.chatId,
          notes: data.notes,
          sources: data.sources,
          position,
        },
      })
    );
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };

  const handleAddChild = () => {
    setShowContextMenu(false);
    addChildNode(id);
  };

  const handleAddSibling = () => {
    setShowContextMenu(false);
    addSiblingNode(id);
  };

  const handleEdit = () => {
    setShowContextMenu(false);
    setIsEditing(true);
  };

  const handleDelete = () => {
    setShowContextMenu(false);
    if (!data.isRoot) {
      deleteNode(id);
    }
  };

  const handleNodeClick = (e: React.MouseEvent) => {
    // Don't handle clicks if context menu is open
    if (showContextMenu) {
      return;
    }

    // Don't handle clicks that are part of a right-click gesture (touchpad)
    // These have button 0 but detail 1, and a contextmenu event will follow shortly
    if (e.button === 0 && e.detail === 1) {
      // Wait to see if a contextmenu event follows
      setTimeout(() => {
        if (!showContextMenu) {
          selectNode(id);
        }
      }, 100); // Longer delay to let contextmenu event fire
      return;
    }

    // Handle trackpad taps and regular clicks
    e.preventDefault();
    e.stopPropagation();
    selectNode(id);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    // Don't handle pointer events if context menu is open
    if (showContextMenu) {
      return;
    }

    // Don't handle pointer events that are part of a right-click gesture
    if (
      e.button === 2 ||
      (e.button === 0 && e.pointerType === 'mouse' && e.pressure === 0)
    ) {
      return;
    }

    // Capture all pointer events including light trackpad taps
    if (e.pointerType === 'mouse' && e.pressure === 0) {
      // This is likely a trackpad tap with no pressure
      setTimeout(() => {
        if (!showContextMenu) {
          selectNode(id);
        }
      }, 50);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsEditing(true);
  };

  const nodeLevel = data.level || 0;

  // Node color logic
  const isRootNode = nodeLevel === 0;

  // Get colors based on theme or defaults
  let colors: {
    backgroundColor: string;
    borderColor: string;
    foregroundColor: string;
  };

  if (data.colorTheme && NODE_COLORS[data.colorTheme]) {
    // Use theme colors if set
    colors = NODE_COLORS[data.colorTheme];
  } else if (isRootNode) {
    // Use default root colors
    colors = DEFAULT_NODE_COLORS.root;
  } else {
    // Use default regular node colors
    colors = DEFAULT_NODE_COLORS.regular;
  }

  const { backgroundColor, borderColor, foregroundColor: textColor } = colors;

  // Compute node styles - order matters for boxShadow precedence
  const nodeStyle = {
    ...styles.node,
    backgroundColor,
    borderColor,
    color: textColor,
    width: `${nodeWidth}px`,
    minHeight: `${nodeHeight}px`,
    minWidth: '120px',
    maxWidth: '300px',
    // Default box shadow
    boxShadow: data.isRoot
      ? '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
      : '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    // Root node scaling
    ...(data.isRoot ? { transform: 'scale(1.1)' } : {}),
    // Selected state (should override default boxShadow)
    ...(selected ? styles.nodeSelected : {}),
    // Dragging state (should override selected)
    ...(data.isDragging ? styles.nodeDragging : {}),
    // Drop target states (highest priority)
    ...(data.isDropTarget && data.dropPosition === 'over'
      ? { ...styles.nodeDropTarget }
      : {}),
    ...(data.isDropTarget &&
    (data.dropPosition === 'above' || data.dropPosition === 'below')
      ? { boxShadow: '0 0 0 2px #60a5fa, 0 0 0 4px #111827' }
      : {}),
    ...(!isEditing ? { userSelect: 'none' as const } : {}),
  };

  return (
    <div style={styles.container}>
      {/* Drop Position Indicators */}
      {data.isDropTarget && data.dropPosition === 'above' && (
        <>
          {/* For LR/RL layouts: show above indicator */}
          {(data.layout === 'LR' || data.layout === 'RL' || !data.layout) && (
            <div style={{ ...styles.dropIndicatorHorizontal, top: '-8px' }}>
              <div
                style={{
                  position: 'absolute',
                  top: '-4px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                }}
              >
                <div style={styles.dropDot}></div>
              </div>
            </div>
          )}
          {/* For TB/BT layouts: show left indicator */}
          {(data.layout === 'TB' || data.layout === 'BT') && (
            <div style={{ ...styles.dropIndicatorVertical, left: '-8px' }}>
              <div
                style={{
                  position: 'absolute',
                  left: '-4px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                }}
              >
                <div style={styles.dropDot}></div>
              </div>
            </div>
          )}
        </>
      )}

      {data.isDropTarget && data.dropPosition === 'below' && (
        <>
          {/* For LR/RL layouts: show below indicator */}
          {(data.layout === 'LR' || data.layout === 'RL' || !data.layout) && (
            <div style={{ ...styles.dropIndicatorHorizontal, bottom: '-8px' }}>
              <div
                style={{
                  position: 'absolute',
                  bottom: '-4px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                }}
              >
                <div style={styles.dropDot}></div>
              </div>
            </div>
          )}
          {/* For TB/BT layouts: show right indicator */}
          {(data.layout === 'TB' || data.layout === 'BT') && (
            <div style={{ ...styles.dropIndicatorVertical, right: '-8px' }}>
              <div
                style={{
                  position: 'absolute',
                  right: '-4px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                }}
              >
                <div style={styles.dropDot}></div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Inference Button */}
      <div style={styles.inferenceButton}>
        {/* Ripple Effects */}
        {isInferenceActive && (
          <>
            <div
              className="animate-ripple"
              style={{
                ...styles.ripple,
                backgroundColor: '#60a5fa',
              }}
            />
            <div
              className="animate-ripple-delayed"
              style={{
                ...styles.ripple,
                backgroundColor: '#93c5fd',
              }}
            />
          </>
        )}

        <button
          onClick={handleInferenceClick}
          onMouseEnter={() => setHoveredButton('inference')}
          onMouseLeave={() => setHoveredButton(null)}
          style={{
            ...styles.inferenceButtonInner,
            ...(hoveredButton === 'inference'
              ? styles.inferenceButtonHover
              : {}),
          }}
          title="Node Panel"
        >
          <PanelRightOpen size={16} color="#ffffff" />
        </button>
      </div>

      <div
        style={nodeStyle}
        onContextMenu={handleContextMenu}
        onClick={handleNodeClick}
        onPointerDown={handlePointerDown}
        onDoubleClick={handleDoubleClick}
      >
        {/* Icon container for chat, notes, and sources */}
        {(data.chatId ||
          data.notes?.trim() ||
          (data.sources && data.sources.length > 0)) && (
          <div style={styles.iconContainer}>
            {/* Chat watermark icon */}
            {data.chatId && (
              <div
                style={{
                  ...styles.iconBadge,
                  ...styles.chatIcon,
                  ...(hoveredButton === 'chat' ? styles.chatIconHover : {}),
                }}
                onMouseEnter={() => setHoveredButton('chat')}
                onMouseLeave={() => setHoveredButton(null)}
                onClick={e => {
                  e.stopPropagation();
                  window.dispatchEvent(
                    new CustomEvent('mindmap-inference-open', {
                      detail: {
                        nodeId: id,
                        label: data.label,
                        chatId: data.chatId,
                        notes: data.notes,
                        sources: data.sources,
                        focusChat: true,
                      },
                    })
                  );
                }}
                title="View chat"
              >
                <MessageCircle size={12} color="#ffffff" />
              </div>
            )}

            {/* Notes watermark icon */}
            {data.notes?.trim() && (
              <div
                style={{
                  ...styles.iconBadge,
                  ...styles.notesIcon,
                  ...(hoveredButton === 'notes' ? styles.notesIconHover : {}),
                }}
                onMouseEnter={() => setHoveredButton('notes')}
                onMouseLeave={() => setHoveredButton(null)}
                onClick={e => {
                  e.stopPropagation();
                  window.dispatchEvent(
                    new CustomEvent('mindmap-inference-open', {
                      detail: {
                        nodeId: id,
                        label: data.label,
                        chatId: data.chatId,
                        notes: data.notes,
                        sources: data.sources,
                        focusNotes: true,
                      },
                    })
                  );
                }}
                title="View notes"
              >
                <FileText size={12} color="#ffffff" />
              </div>
            )}

            {/* Sources watermark icon */}
            {data.sources && data.sources.length > 0 && (
              <div
                style={{
                  ...styles.iconBadge,
                  ...styles.sourcesIcon,
                  ...(hoveredButton === 'sources'
                    ? styles.sourcesIconHover
                    : {}),
                }}
                onMouseEnter={() => setHoveredButton('sources')}
                onMouseLeave={() => setHoveredButton(null)}
                onClick={e => {
                  e.stopPropagation();
                  window.dispatchEvent(
                    new CustomEvent('mindmap-inference-open', {
                      detail: {
                        nodeId: id,
                        label: data.label,
                        chatId: data.chatId,
                        notes: data.notes,
                        sources: data.sources,
                        focusSources: true,
                      },
                    })
                  );
                }}
                title="View sources"
              >
                <BookOpen size={12} color="#ffffff" />
              </div>
            )}
          </div>
        )}

        {/* Hidden handles for automatic connections - ReactFlow needs these for proper edge routing */}
        <Handle
          type="target"
          position={Position.Top}
          id="top"
          style={{
            opacity: 0,
            pointerEvents: 'none',
            width: 1,
            height: 1,
            position: 'absolute',
          }}
        />
        <Handle
          type="target"
          position={Position.Bottom}
          id="bottom"
          style={{
            opacity: 0,
            pointerEvents: 'none',
            width: 1,
            height: 1,
            position: 'absolute',
          }}
        />
        <Handle
          type="target"
          position={Position.Left}
          id="left"
          style={{
            opacity: 0,
            pointerEvents: 'none',
            width: 1,
            height: 1,
            position: 'absolute',
          }}
        />
        <Handle
          type="target"
          position={Position.Right}
          id="right"
          style={{
            opacity: 0,
            pointerEvents: 'none',
            width: 1,
            height: 1,
            position: 'absolute',
          }}
        />
        <Handle
          type="source"
          position={Position.Top}
          id="top-source"
          style={{
            opacity: 0,
            pointerEvents: 'none',
            width: 1,
            height: 1,
            position: 'absolute',
          }}
        />
        <Handle
          type="source"
          position={Position.Bottom}
          id="bottom-source"
          style={{
            opacity: 0,
            pointerEvents: 'none',
            width: 1,
            height: 1,
            position: 'absolute',
          }}
        />
        <Handle
          type="source"
          position={Position.Left}
          id="left-source"
          style={{
            opacity: 0,
            pointerEvents: 'none',
            width: 1,
            height: 1,
            position: 'absolute',
          }}
        />
        <Handle
          type="source"
          position={Position.Right}
          id="right-source"
          style={{
            opacity: 0,
            pointerEvents: 'none',
            width: 1,
            height: 1,
            position: 'absolute',
          }}
        />

        <div style={styles.textContainer}>
          {isEditing ? (
            <textarea
              ref={inputRef}
              value={label}
              onChange={e => {
                setLabel(e.target.value);
                // Auto-resize textarea
                if (inputRef.current) {
                  inputRef.current.style.height = 'auto';
                  inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
                }
              }}
              onBlur={handleSubmit}
              onKeyDown={handleKeyDown}
              style={styles.textInput}
              placeholder="Enter text..."
            />
          ) : (
            <span
              style={styles.textLabel}
              onDoubleClick={() => setIsEditing(true)}
            >
              {data.label}
            </span>
          )}
        </div>

        {/* Collapse/Expand Button */}
        {data.hasChildren && (
          <button
            onClick={handleToggleCollapse}
            onMouseEnter={() => setHoveredButton('collapse')}
            onMouseLeave={() => setHoveredButton(null)}
            style={{
              ...styles.collapseButton,
              ...(hoveredButton === 'collapse'
                ? styles.collapseButtonHover
                : {}),
              ...(data.layout === 'TB'
                ? {
                    bottom: '-12px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                  }
                : data.layout === 'BT'
                  ? { top: '-12px', left: '50%', transform: 'translateX(-50%)' }
                  : {
                      right: '-12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                    }),
            }}
            title={data.isCollapsed ? 'Expand children' : 'Collapse children'}
          >
            {data.isCollapsed ? (
              <Plus size={12} color="#ffffff" />
            ) : (
              <Minus size={12} color="#ffffff" />
            )}
          </button>
        )}
      </div>

      {/* Context Menu - Render using Portal */}
      {showContextMenu &&
        createPortal(
          <div
            ref={contextMenuRef}
            style={{
              ...styles.contextMenu,
              left: contextMenuPosition.x,
              top: contextMenuPosition.y,
            }}
            data-context-menu="true"
          >
            <button
              onClick={handleAddChild}
              onMouseEnter={() => setHoveredButton('addChild')}
              onMouseLeave={() => setHoveredButton(null)}
              style={{
                ...styles.contextMenuItem,
                ...(hoveredButton === 'addChild'
                  ? styles.contextMenuItemHover
                  : {}),
              }}
            >
              <Plus size={14} />
              Add Child
            </button>
            {!data.isRoot && (
              <button
                onClick={handleAddSibling}
                onMouseEnter={() => setHoveredButton('addSibling')}
                onMouseLeave={() => setHoveredButton(null)}
                style={{
                  ...styles.contextMenuItem,
                  ...(hoveredButton === 'addSibling'
                    ? styles.contextMenuItemHover
                    : {}),
                }}
              >
                <Share size={14} />
                Add Sibling
              </button>
            )}
            <button
              onClick={handleEdit}
              onMouseEnter={() => setHoveredButton('edit')}
              onMouseLeave={() => setHoveredButton(null)}
              style={{
                ...styles.contextMenuItem,
                ...(hoveredButton === 'edit'
                  ? styles.contextMenuItemHover
                  : {}),
              }}
            >
              <Edit size={14} />
              Edit Label
            </button>
            {data.hasChildren && (
              <button
                onClick={e => {
                  setShowContextMenu(false);
                  handleToggleCollapse(e);
                }}
                onMouseEnter={() => setHoveredButton('toggle')}
                onMouseLeave={() => setHoveredButton(null)}
                style={{
                  ...styles.contextMenuItem,
                  ...(hoveredButton === 'toggle'
                    ? styles.contextMenuItemHover
                    : {}),
                }}
              >
                {data.isCollapsed ? <Plus size={14} /> : <Minus size={14} />}
                {data.isCollapsed ? 'Expand' : 'Collapse'}
              </button>
            )}
            <button
              onClick={e => {
                setShowContextMenu(false);
                handleInferenceClick(e);
              }}
              onMouseEnter={() => setHoveredButton('panel')}
              onMouseLeave={() => setHoveredButton(null)}
              style={{
                ...styles.contextMenuItem,
                ...(hoveredButton === 'panel'
                  ? styles.contextMenuItemHover
                  : {}),
              }}
            >
              <PanelRightOpen size={14} />
              Node Panel
            </button>
            {!data.isRoot && (
              <>
                <hr style={styles.contextMenuDivider} />
                <button
                  onClick={handleDelete}
                  onMouseEnter={() => setHoveredButton('delete')}
                  onMouseLeave={() => setHoveredButton(null)}
                  style={{
                    ...styles.contextMenuItem,
                    ...styles.contextMenuItemDanger,
                    ...(hoveredButton === 'delete'
                      ? styles.contextMenuItemHover
                      : {}),
                  }}
                >
                  <Trash2 size={14} />
                  Delete Node
                </button>
              </>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
