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
import { NODE_SIZING } from '../constants/nodeSizing';
import {
  NODE_UI_CONSTANTS,
  NODE_STYLE_COLORS,
  NODE_SHADOWS,
} from '../constants/nodeStyles';
import { LAYOUT_CONSTANTS } from '../../utils/mindMapLayout';
import {
  CSS_UNITS,
  TRANSFORM_VALUES,
  OPACITY_VALUES,
  HANDLE_CONSTANTS,
} from '../constants/magicNumbers';

// Define all styles as objects to replace Tailwind classes
const styles = {
  container: {
    position: 'relative' as const,
  },
  dropIndicatorHorizontal: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    height: `${NODE_UI_CONSTANTS.DROP_INDICATOR_SIZE}px`,
    backgroundColor: NODE_STYLE_COLORS.DROP_INDICATOR,
    borderRadius: CSS_UNITS.BORDER_RADIUS_FULL,
    boxShadow: NODE_SHADOWS.ELEVATED,
    animation: `pulse ${NODE_UI_CONSTANTS.PULSE_DURATION} cubic-bezier(0.4, 0, 0.6, 1) infinite`,
    zIndex: NODE_UI_CONSTANTS.Z_INDEX_ACTIVE,
  },
  dropIndicatorVertical: {
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    width: `${NODE_UI_CONSTANTS.DROP_INDICATOR_SIZE}px`,
    backgroundColor: NODE_STYLE_COLORS.DROP_INDICATOR,
    borderRadius: CSS_UNITS.BORDER_RADIUS_FULL,
    boxShadow: NODE_SHADOWS.ELEVATED,
    animation: `pulse ${NODE_UI_CONSTANTS.PULSE_DURATION} cubic-bezier(0.4, 0, 0.6, 1) infinite`,
    zIndex: NODE_UI_CONSTANTS.Z_INDEX_ACTIVE,
  },
  dropDot: {
    width: `${NODE_UI_CONSTANTS.DROP_DOT_SIZE}px`,
    height: `${NODE_UI_CONSTANTS.DROP_DOT_SIZE}px`,
    backgroundColor: NODE_STYLE_COLORS.DROP_INDICATOR,
    borderRadius: NODE_UI_CONSTANTS.BORDER_RADIUS_FULL,
  },
  inferenceButton: {
    position: 'absolute' as const,
    top: CSS_UNITS.PERCENT_50,
    transform: TRANSFORM_VALUES.TRANSLATE_Y_CENTER,
    marginRight: CSS_UNITS.PX_4,
    zIndex: NODE_UI_CONSTANTS.Z_INDEX_ACTIVE,
  },
  inferenceButtonInner: {
    position: 'relative' as const,
    width: `${NODE_UI_CONSTANTS.INFERENCE_BUTTON_SIZE}px`,
    height: `${NODE_UI_CONSTANTS.INFERENCE_BUTTON_SIZE}px`,
    backgroundColor: NODE_STYLE_COLORS.INFERENCE_BUTTON_BG,
    border: `${NODE_UI_CONSTANTS.BORDER_WIDTH}px solid ${NODE_STYLE_COLORS.INFERENCE_BUTTON_BORDER}`,
    borderRadius: NODE_UI_CONSTANTS.BORDER_RADIUS_FULL,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    zIndex: 10,
    boxShadow: NODE_SHADOWS.ELEVATED,
  },
  inferenceButtonHover: {
    backgroundColor: NODE_STYLE_COLORS.INFERENCE_BUTTON_HOVER,
  },
  ripple: {
    position: 'absolute' as const,
    inset: 0,
    width: `${NODE_UI_CONSTANTS.INFERENCE_BUTTON_SIZE}px`,
    height: `${NODE_UI_CONSTANTS.INFERENCE_BUTTON_SIZE}px`,
    borderRadius: NODE_UI_CONSTANTS.BORDER_RADIUS_FULL,
    zIndex: NODE_UI_CONSTANTS.Z_INDEX_NODE,
  },
  node: {
    padding: `${NODE_SIZING.PADDING_VERTICAL}px ${NODE_SIZING.PADDING_HORIZONTAL}px`,
    borderRadius: `${NODE_UI_CONSTANTS.BORDER_RADIUS}px`,
    border: `${NODE_SIZING.BORDER_WIDTH}px solid`,
    transition: `all ${NODE_UI_CONSTANTS.ANIMATION_DURATION}`,
    position: 'relative' as const,
    boxSizing: 'border-box' as const,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeSelected: {
    boxShadow: NODE_SHADOWS.SELECTION,
  },
  nodeRoot: {
    boxShadow: NODE_SHADOWS.ELEVATED,
    transform: `scale(${NODE_UI_CONSTANTS.SCALE_ROOT})`,
  },
  nodeDragging: {
    opacity: NODE_UI_CONSTANTS.OPACITY_DRAGGING,
    transform: `scale(${NODE_UI_CONSTANTS.SCALE_DRAGGING})`,
    boxShadow: NODE_SHADOWS.DRAGGING,
  },
  nodeDropTarget: {
    boxShadow: NODE_SHADOWS.DROP_TARGET,
    animation: `pulse ${NODE_UI_CONSTANTS.PULSE_DURATION} cubic-bezier(0.4, 0, 0.6, 1) infinite`,
  },
  iconContainer: {
    position: 'absolute' as const,
    bottom: `-${NODE_UI_CONSTANTS.COLLAPSE_BUTTON_OFFSET - 2}px`,
    right: `-${NODE_UI_CONSTANTS.COLLAPSE_BUTTON_OFFSET - 2}px`,
    display: 'flex',
    alignItems: 'center',
    gap: `${NODE_UI_CONSTANTS.INDICATOR_GAP}px`,
    zIndex: NODE_UI_CONSTANTS.Z_INDEX_INDICATOR,
  },
  iconBadge: {
    width: `${NODE_UI_CONSTANTS.INDICATOR_SIZE}px`,
    height: `${NODE_UI_CONSTANTS.INDICATOR_SIZE}px`,
    borderRadius: NODE_UI_CONSTANTS.BORDER_RADIUS_FULL,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: `background-color ${NODE_UI_CONSTANTS.ANIMATION_DURATION}`,
  },
  chatIcon: {
    backgroundColor: NODE_STYLE_COLORS.CHAT_INDICATOR,
  },
  chatIconHover: {
    backgroundColor: NODE_STYLE_COLORS.CHAT_INDICATOR_HOVER,
  },
  notesIcon: {
    backgroundColor: NODE_STYLE_COLORS.NOTES_INDICATOR,
  },
  notesIconHover: {
    backgroundColor: NODE_STYLE_COLORS.NOTES_INDICATOR_HOVER,
  },
  sourcesIcon: {
    backgroundColor: NODE_STYLE_COLORS.SOURCES_INDICATOR,
  },
  sourcesIconHover: {
    backgroundColor: NODE_STYLE_COLORS.SOURCES_INDICATOR_HOVER,
  },
  textContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  textInput: {
    backgroundColor: 'transparent',
    border: 'none',
    outline: 'none',
    fontSize: '0.875rem',
    fontWeight: '500',
    resize: 'none' as const,
    width: '100%',
    lineHeight: '21px',
    color: 'inherit',
    wordBreak: 'normal' as const,
    whiteSpace: 'normal' as const,
    overflowWrap: 'break-word' as const,
    overflow: 'hidden',
    height: '21px',
    padding: 0,
    margin: 0,
    fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
    display: 'block',
  },
  textLabel: {
    fontSize: '0.875rem',
    fontWeight: '500',
    cursor: 'pointer',
    userSelect: 'none' as const,
    wordBreak: 'normal' as const,
    whiteSpace: 'normal' as const,
    overflowWrap: 'break-word' as const,
    lineHeight: 1.5,
    color: 'inherit',
    display: 'block',
    width: '100%',
  },
  collapseButton: {
    position: 'absolute' as const,
    width: `${NODE_UI_CONSTANTS.COLLAPSE_BUTTON_SIZE}px`,
    height: `${NODE_UI_CONSTANTS.COLLAPSE_BUTTON_SIZE}px`,
    backgroundColor: NODE_STYLE_COLORS.COLLAPSE_BUTTON_BG,
    border: `${NODE_UI_CONSTANTS.BORDER_WIDTH}px solid ${NODE_STYLE_COLORS.COLLAPSE_BUTTON_BORDER}`,
    borderRadius: NODE_UI_CONSTANTS.BORDER_RADIUS_FULL,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: `background-color ${NODE_UI_CONSTANTS.ANIMATION_DURATION}`,
    zIndex: NODE_UI_CONSTANTS.Z_INDEX_BUTTON,
    boxShadow: NODE_SHADOWS.ELEVATED,
  },
  collapseButtonHover: {
    backgroundColor: NODE_STYLE_COLORS.COLLAPSE_BUTTON_HOVER,
  },
  contextMenu: {
    position: 'fixed' as const,
    backgroundColor: NODE_STYLE_COLORS.MENU_BG,
    border: `${NODE_UI_CONSTANTS.BORDER_WIDTH}px solid ${NODE_STYLE_COLORS.MENU_BORDER}`,
    borderRadius: `${NODE_UI_CONSTANTS.BORDER_RADIUS}px`,
    boxShadow: NODE_SHADOWS.ELEVATED,
    padding: `${NODE_UI_CONSTANTS.MENU_PADDING}px 0`,
    minWidth: `${NODE_UI_CONSTANTS.MENU_MIN_WIDTH}px`,
    zIndex: NODE_UI_CONSTANTS.Z_INDEX_MENU,
  },
  contextMenuItem: {
    width: CSS_UNITS.PERCENT_100,
    textAlign: 'left' as const,
    padding: `${NODE_UI_CONSTANTS.MENU_ITEM_PADDING_V}px ${NODE_UI_CONSTANTS.MENU_ITEM_PADDING_H}px`,
    fontSize: NODE_UI_CONSTANTS.FONT_SIZE_NORMAL,
    color: NODE_STYLE_COLORS.TEXT_WHITE,
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: `${NODE_UI_CONSTANTS.CONTENT_GAP}px`,
    transition: `background-color ${NODE_UI_CONSTANTS.ANIMATION_DURATION}`,
  },
  contextMenuItemHover: {
    backgroundColor: NODE_STYLE_COLORS.MENU_ITEM_HOVER,
  },
  contextMenuItemDanger: {
    color: NODE_STYLE_COLORS.MENU_TEXT_DANGER,
  },
  contextMenuDivider: {
    margin: `${NODE_UI_CONSTANTS.BUTTON_MARGIN}px 0`,
    borderTop: `${NODE_UI_CONSTANTS.BORDER_WIDTH}px solid ${NODE_STYLE_COLORS.MENU_DIVIDER}`,
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
      opacity: ${NODE_UI_CONSTANTS.OPACITY_DISABLED};
    }
  }
  @keyframes ripple {
    0% {
      transform: scale(1);
      opacity: 1;
    }
    100% {
      transform: scale(${NODE_UI_CONSTANTS.SCALE_RIPPLE});
      opacity: 0;
    }
  }
  @keyframes ripple-delayed {
    0% {
      transform: scale(1);
      opacity: 1;
    }
    100% {
      transform: scale(${NODE_UI_CONSTANTS.SCALE_RIPPLE});
      opacity: 0;
    }
  }
  .animate-ripple {
    animation: ripple ${NODE_UI_CONSTANTS.RIPPLE_DURATION} linear infinite;
  }
  .animate-ripple-delayed {
    animation: ripple-delayed ${NODE_UI_CONSTANTS.RIPPLE_DURATION} linear infinite;
    animation-delay: ${NODE_UI_CONSTANTS.RIPPLE_DELAY};
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
  const [nodeWidth, setNodeWidth] = useState(
    data.width || LAYOUT_CONSTANTS.DEFAULT_NODE_WIDTH
  );
  const [nodeHeight, setNodeHeight] = useState(
    data.height || NODE_SIZING.DEFAULT_NODE_HEIGHT
  );
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
          // Set initial height to match span height
          inputRef.current.style.height = '21px';

          // Auto-resize if content is larger
          const lineHeight = 21;
          const scrollHeight = inputRef.current.scrollHeight;
          const lines = Math.ceil(scrollHeight / lineHeight);
          inputRef.current.style.height = `${lines * lineHeight}px`;
        }
      }, NODE_UI_CONSTANTS.EDIT_MODE_DELAY);
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
      const displayLabel = (label || data.label) ?? 'Untitled';

      const dimensions = sizingStrategy.calculateNodeSize(displayLabel, {
        isEditing,
        level: data.level ?? 0,
      });

      // Only update if dimensions changed significantly
      let dimensionsChanged = false;
      if (
        Math.abs(dimensions.width - nodeWidth) >
        NODE_UI_CONSTANTS.WIDTH_CHANGE_THRESHOLD
      ) {
        setNodeWidth(dimensions.width);
        dimensionsChanged = true;
      }
      if (
        Math.abs(dimensions.height - nodeHeight) >
        NODE_UI_CONSTANTS.HEIGHT_CHANGE_THRESHOLD
      ) {
        setNodeHeight(dimensions.height);
        dimensionsChanged = true;
      }

      // Notify the store about dimension changes to trigger re-layout
      if (dimensionsChanged && !isEditing) {
        // Debounce the update to avoid too many re-layouts
        const timeoutId = setTimeout(() => {
          updateNodeDimensions(id, dimensions.width, dimensions.height);
        }, NODE_UI_CONSTANTS.UPDATE_DELAY);

        return () => clearTimeout(timeoutId);
      }
    }
  }, [
    label,
    data.label,
    data.isDragging,
    isEditing,
    data.level,
    sizingStrategy,
    nodeWidth,
    nodeHeight,
    id,
    updateNodeDimensions,
  ]);

  // Update dimensions when data changes (from parent)
  useEffect(() => {
    if (
      data.width &&
      Math.abs(data.width - nodeWidth) >
        NODE_UI_CONSTANTS.WIDTH_CHANGE_THRESHOLD
    ) {
      setNodeWidth(data.width);
    }
    if (
      data.height &&
      Math.abs(data.height - nodeHeight) >
        NODE_UI_CONSTANTS.HEIGHT_CHANGE_THRESHOLD
    ) {
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
      }, NODE_UI_CONSTANTS.CONTEXT_MENU_DELAY);

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
      }, NODE_UI_CONSTANTS.EDIT_MODE_DELAY); // Longer delay to let contextmenu event fire
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
      }, NODE_UI_CONSTANTS.HANDLE_CLICK_DELAY);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsEditing(true);
  };

  const nodeLevel = data.level ?? 0;

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
    minWidth: `${NODE_SIZING.MIN_WIDTH}px`,
    // Default box shadow
    boxShadow: data.isRoot ? NODE_SHADOWS.ELEVATED : NODE_SHADOWS.DEFAULT,
    // Root node scaling
    ...(data.isRoot
      ? { transform: `scale(${NODE_UI_CONSTANTS.SCALE_ROOT})` }
      : {}),
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
      ? { boxShadow: NODE_SHADOWS.DRAGGING }
      : {}),
    ...(!isEditing ? { userSelect: 'none' as const } : {}),
  };

  return (
    <div style={styles.container}>
      {/* Drop Position Indicators */}
      {data.isDropTarget && data.dropPosition === 'above' && (
        <>
          {/* For LR/RL layouts: 'above' means top - show horizontal indicator above node */}
          {(data.layout === 'LR' ||
            data.layout === 'RL' ||
            data.layout === 'RD' ||
            !data.layout) && (
            <div
              style={{
                ...styles.dropIndicatorHorizontal,
                top: `-${NODE_UI_CONSTANTS.DROP_INDICATOR_OFFSET}px`,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: `-${NODE_UI_CONSTANTS.DROP_DOT_OFFSET}px`,
                  left: CSS_UNITS.PERCENT_50,
                  transform: TRANSFORM_VALUES.TRANSLATE_X_CENTER,
                }}
              >
                <div style={styles.dropDot}></div>
              </div>
            </div>
          )}
          {/* For TB/BT layouts: 'above' means left - show vertical indicator on left side */}
          {(data.layout === 'TB' || data.layout === 'BT') && (
            <div
              style={{
                ...styles.dropIndicatorVertical,
                left: `-${NODE_UI_CONSTANTS.DROP_INDICATOR_OFFSET}px`,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: `-${NODE_UI_CONSTANTS.DROP_DOT_OFFSET}px`,
                  top: CSS_UNITS.PERCENT_50,
                  transform: TRANSFORM_VALUES.TRANSLATE_Y_CENTER,
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
          {/* For LR/RL layouts: 'below' means bottom - show horizontal indicator below node */}
          {(data.layout === 'LR' ||
            data.layout === 'RL' ||
            data.layout === 'RD' ||
            !data.layout) && (
            <div
              style={{
                ...styles.dropIndicatorHorizontal,
                bottom: `-${NODE_UI_CONSTANTS.DROP_INDICATOR_OFFSET}px`,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  bottom: `-${NODE_UI_CONSTANTS.DROP_DOT_OFFSET}px`,
                  left: CSS_UNITS.PERCENT_50,
                  transform: TRANSFORM_VALUES.TRANSLATE_X_CENTER,
                }}
              >
                <div style={styles.dropDot}></div>
              </div>
            </div>
          )}
          {/* For TB/BT layouts: 'below' means right - show vertical indicator on right side */}
          {(data.layout === 'TB' || data.layout === 'BT') && (
            <div
              style={{
                ...styles.dropIndicatorVertical,
                right: `-${NODE_UI_CONSTANTS.DROP_INDICATOR_OFFSET}px`,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  right: `-${NODE_UI_CONSTANTS.DROP_DOT_OFFSET}px`,
                  top: CSS_UNITS.PERCENT_50,
                  transform: TRANSFORM_VALUES.TRANSLATE_Y_CENTER,
                }}
              >
                <div style={styles.dropDot}></div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Inference Button */}
      <div
        className="nodrag"
        style={{
          ...styles.inferenceButton,
          ...(data.layout === 'RL'
            ? {
                right: `${NODE_UI_CONSTANTS.BUTTON_OFFSET}px`,
                transform: TRANSFORM_VALUES.TRANSLATE_X_FULL_RIGHT,
              }
            : {
                left: `${NODE_UI_CONSTANTS.BUTTON_OFFSET}px`,
                transform: TRANSFORM_VALUES.TRANSLATE_X_FULL_LEFT,
              }),
        }}
      >
        {/* Ripple Effects */}
        {isInferenceActive && (
          <>
            <div
              className="animate-ripple"
              style={{
                ...styles.ripple,
                backgroundColor: NODE_STYLE_COLORS.INFERENCE_BUTTON_ACTIVE,
              }}
            />
            <div
              className="animate-ripple-delayed"
              style={{
                ...styles.ripple,
                backgroundColor: NODE_STYLE_COLORS.INFERENCE_BUTTON_ACTIVE_RING,
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
          data-test-id="node-panel-button"
        >
          <PanelRightOpen
            size={NODE_UI_CONSTANTS.ICON_SIZE_LARGE}
            color={NODE_STYLE_COLORS.TEXT_WHITE}
          />
        </button>
      </div>

      <div
        data-id={id}
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
          <div className="nodrag" style={styles.iconContainer}>
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
                <MessageCircle
                  size={NODE_UI_CONSTANTS.ICON_SIZE_SMALL}
                  color={NODE_STYLE_COLORS.TEXT_WHITE}
                />
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
                <FileText
                  size={NODE_UI_CONSTANTS.ICON_SIZE_SMALL}
                  color={NODE_STYLE_COLORS.TEXT_WHITE}
                />
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
                <BookOpen
                  size={NODE_UI_CONSTANTS.ICON_SIZE_SMALL}
                  color={NODE_STYLE_COLORS.TEXT_WHITE}
                />
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
            opacity: OPACITY_VALUES.NONE,
            pointerEvents: 'none',
            width: HANDLE_CONSTANTS.WIDTH,
            height: HANDLE_CONSTANTS.HEIGHT,
            position: 'absolute',
          }}
        />
        <Handle
          type="target"
          position={Position.Bottom}
          id="bottom"
          style={{
            opacity: OPACITY_VALUES.NONE,
            pointerEvents: 'none',
            width: HANDLE_CONSTANTS.WIDTH,
            height: HANDLE_CONSTANTS.HEIGHT,
            position: 'absolute',
          }}
        />
        <Handle
          type="target"
          position={Position.Left}
          id="left"
          style={{
            opacity: OPACITY_VALUES.NONE,
            pointerEvents: 'none',
            width: HANDLE_CONSTANTS.WIDTH,
            height: HANDLE_CONSTANTS.HEIGHT,
            position: 'absolute',
          }}
        />
        <Handle
          type="target"
          position={Position.Right}
          id="right"
          style={{
            opacity: OPACITY_VALUES.NONE,
            pointerEvents: 'none',
            width: HANDLE_CONSTANTS.WIDTH,
            height: HANDLE_CONSTANTS.HEIGHT,
            position: 'absolute',
          }}
        />
        <Handle
          type="source"
          position={Position.Top}
          id="top-source"
          style={{
            opacity: OPACITY_VALUES.NONE,
            pointerEvents: 'none',
            width: HANDLE_CONSTANTS.WIDTH,
            height: HANDLE_CONSTANTS.HEIGHT,
            position: 'absolute',
          }}
        />
        <Handle
          type="source"
          position={Position.Bottom}
          id="bottom-source"
          style={{
            opacity: OPACITY_VALUES.NONE,
            pointerEvents: 'none',
            width: HANDLE_CONSTANTS.WIDTH,
            height: HANDLE_CONSTANTS.HEIGHT,
            position: 'absolute',
          }}
        />
        <Handle
          type="source"
          position={Position.Left}
          id="left-source"
          style={{
            opacity: OPACITY_VALUES.NONE,
            pointerEvents: 'none',
            width: HANDLE_CONSTANTS.WIDTH,
            height: HANDLE_CONSTANTS.HEIGHT,
            position: 'absolute',
          }}
        />
        <Handle
          type="source"
          position={Position.Right}
          id="right-source"
          style={{
            opacity: OPACITY_VALUES.NONE,
            pointerEvents: 'none',
            width: HANDLE_CONSTANTS.WIDTH,
            height: HANDLE_CONSTANTS.HEIGHT,
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
                // Auto-resize textarea to fit content
                if (inputRef.current) {
                  // Reset height to measure content
                  inputRef.current.style.height = '21px';

                  // Calculate the number of lines
                  const lineHeight = 21;
                  const scrollHeight = inputRef.current.scrollHeight;
                  const lines = Math.ceil(scrollHeight / lineHeight);

                  // Set height based on actual lines needed
                  inputRef.current.style.height = `${lines * lineHeight}px`;
                }
              }}
              onClick={e => {
                // If text is fully selected, unselect it
                const textarea = e.currentTarget;
                if (
                  textarea.selectionStart === 0 &&
                  textarea.selectionEnd === textarea.value.length &&
                  textarea.value.length > 0
                ) {
                  // Place cursor at the click position
                  // Click coordinates could be used for more precise cursor positioning
                  // but for now we just place cursor at end
                  textarea.setSelectionRange(
                    textarea.value.length,
                    textarea.value.length
                  );
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
              {data.label ?? '\u00A0'}
            </span>
          )}
        </div>

        {/* Collapse/Expand Button */}
        {data.hasChildren && (
          <button
            className="nodrag"
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
                    bottom: `-${NODE_UI_CONSTANTS.COLLAPSE_BUTTON_OFFSET}px`,
                    left: CSS_UNITS.PERCENT_50,
                    transform: TRANSFORM_VALUES.TRANSLATE_X_CENTER,
                  }
                : data.layout === 'BT'
                  ? {
                      top: `-${NODE_UI_CONSTANTS.COLLAPSE_BUTTON_OFFSET}px`,
                      left: CSS_UNITS.PERCENT_50,
                      transform: TRANSFORM_VALUES.TRANSLATE_X_CENTER,
                    }
                  : data.layout === 'RL'
                    ? {
                        left: `-${NODE_UI_CONSTANTS.COLLAPSE_BUTTON_OFFSET}px`,
                        top: CSS_UNITS.PERCENT_50,
                        transform: TRANSFORM_VALUES.TRANSLATE_Y_CENTER,
                      }
                    : {
                        right: `-${NODE_UI_CONSTANTS.COLLAPSE_BUTTON_OFFSET}px`,
                        top: CSS_UNITS.PERCENT_50,
                        transform: TRANSFORM_VALUES.TRANSLATE_Y_CENTER,
                      }),
            }}
            title={data.isCollapsed ? 'Expand children' : 'Collapse children'}
            data-test-id="collapse-expand-button"
          >
            {data.isCollapsed ? (
              <Plus
                size={NODE_UI_CONSTANTS.ICON_SIZE_SMALL}
                color={NODE_STYLE_COLORS.TEXT_WHITE}
              />
            ) : (
              <Minus
                size={NODE_UI_CONSTANTS.ICON_SIZE_SMALL}
                color={NODE_STYLE_COLORS.TEXT_WHITE}
              />
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
              <Plus size={NODE_UI_CONSTANTS.ICON_SIZE_MEDIUM} />
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
                <Share size={NODE_UI_CONSTANTS.ICON_SIZE_MEDIUM} />
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
              <Edit size={NODE_UI_CONSTANTS.ICON_SIZE_MEDIUM} />
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
                {data.isCollapsed ? (
                  <Plus size={NODE_UI_CONSTANTS.ICON_SIZE_MEDIUM} />
                ) : (
                  <Minus size={NODE_UI_CONSTANTS.ICON_SIZE_MEDIUM} />
                )}
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
              <PanelRightOpen size={NODE_UI_CONSTANTS.ICON_SIZE_MEDIUM} />
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
                  <Trash2 size={NODE_UI_CONSTANTS.ICON_SIZE_MEDIUM} />
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
