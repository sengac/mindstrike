import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, NodeProps } from 'reactflow';
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
import { clsx } from 'clsx';
import { MindMapNodeData } from '../types/mindMap';
import {
  useMindMapActions,
  useMindMapSelection,
} from '../../store/useMindMapStore';

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
  const [isInferenceActive, setIsInferenceActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);

  // Get actions from store
  const {
    addChildNode,
    addSiblingNode,
    deleteNode,
    updateNodeLabelWithLayout,
    toggleNodeCollapse,
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
        }
      }, 100);
    }
  }, [isEditing]);

  useEffect(() => {
    if (data.isEditing !== undefined) {
      setIsEditing(data.isEditing);
    }
  }, [data.isEditing]);

  // Calculate text width for display purposes only
  useEffect(() => {
    const measureTextWidth = () => {
      if (measureRef.current && !data.isDragging) {
        const textWidth = measureRef.current.scrollWidth;
        const padding = 32; // 16px padding on each side
        const minWidth = 120;
        const maxWidth = 800;
        const calculatedWidth = Math.min(
          Math.max(textWidth + padding, minWidth),
          maxWidth
        );

        if (Math.abs(calculatedWidth - nodeWidth) > 5) {
          // Only update if difference > 5px
          setNodeWidth(calculatedWidth);
        }
      }
    };

    // Only measure width when not dragging to prevent flicker
    if (!data.isDragging) {
      requestAnimationFrame(measureTextWidth);
    }
  }, [label, data.isDragging, data.label]);

  // Update width when data.width changes (from parent)
  useEffect(() => {
    if (data.width && Math.abs(data.width - nodeWidth) > 5) {
      // Only update if difference > 5px
      setNodeWidth(data.width);
    }
  }, [data.width, data.label, data.isDragging]);

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
    if (e.key === 'Enter') {
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
  const rootColorClass = 'bg-blue-500 border-blue-400';

  // Only apply default color to root node (level 0), others get no color unless user picks one
  const defaultColorClass = nodeLevel === 0 ? rootColorClass : '';
  const colorClass = data.customColors
    ? data.customColors.backgroundClass
    : defaultColorClass;

  return (
    <div className="relative">
      {/* Drop Position Indicators */}
      {data.isDropTarget && data.dropPosition === 'above' && (
        <>
          {/* For LR/RL layouts: show above indicator */}
          {(data.layout === 'LR' || data.layout === 'RL' || !data.layout) && (
            <div className="absolute -top-2 left-0 right-0 h-1 bg-green-400 rounded-full shadow-lg animate-pulse z-20">
              <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 text-green-400">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              </div>
            </div>
          )}
          {/* For TB/BT layouts: show left indicator */}
          {(data.layout === 'TB' || data.layout === 'BT') && (
            <div className="absolute -left-2 top-0 bottom-0 w-1 bg-green-400 rounded-full shadow-lg animate-pulse z-20">
              <div className="absolute -left-1 top-1/2 transform -translate-y-1/2 text-green-400">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              </div>
            </div>
          )}
        </>
      )}

      {data.isDropTarget && data.dropPosition === 'below' && (
        <>
          {/* For LR/RL layouts: show below indicator */}
          {(data.layout === 'LR' || data.layout === 'RL' || !data.layout) && (
            <div className="absolute -bottom-2 left-0 right-0 h-1 bg-green-400 rounded-full shadow-lg animate-pulse z-20">
              <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 text-green-400">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              </div>
            </div>
          )}
          {/* For TB/BT layouts: show right indicator */}
          {(data.layout === 'TB' || data.layout === 'BT') && (
            <div className="absolute -right-2 top-0 bottom-0 w-1 bg-green-400 rounded-full shadow-lg animate-pulse z-20">
              <div className="absolute -right-1 top-1/2 transform -translate-y-1/2 text-green-400">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Inference Button */}
      <div className="absolute left-2 top-1/2 transform -translate-y-1/2 -translate-x-full mr-1 z-20">
        {/* Ripple Effects */}
        {isInferenceActive && (
          <>
            <div className="absolute inset-0 w-8 h-8 bg-blue-400 rounded-full animate-ripple z-0" />
            <div className="absolute inset-0 w-8 h-8 bg-blue-300 rounded-full animate-ripple-delayed z-0" />
          </>
        )}

        <button
          onClick={handleInferenceClick}
          className="relative w-8 h-8 bg-blue-600 border border-blue-500 rounded-full flex items-center justify-center hover:bg-blue-700 transition-colors z-10 shadow-lg"
          title="Node Panel"
        >
          <PanelRightOpen size={16} className="text-white" />
        </button>
      </div>

      <div
        className={clsx(
          'px-4 py-2 rounded-lg border-2 transition-colors duration-200 relative',
          colorClass,
          data.customColors?.foregroundClass ||
            (data.customColors ? '' : 'text-white'),
          selected
            ? 'ring-2 ring-yellow-400 ring-offset-2 ring-offset-gray-900'
            : '',
          data.isRoot ? 'shadow-lg scale-110' : 'shadow-md',
          data.isDragging
            ? 'opacity-30 scale-95 ring-2 ring-blue-400 ring-offset-2 ring-offset-gray-900 shadow-lg'
            : '',
          data.isDropTarget && data.dropPosition === 'over'
            ? 'ring-2 ring-green-400 ring-offset-2 ring-offset-gray-900 shadow-lg animate-pulse'
            : '',
          data.isDropTarget &&
            (data.dropPosition === 'above' || data.dropPosition === 'below')
            ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-gray-900 shadow-lg'
            : '',
          !isEditing ? 'select-none' : ''
        )}
        style={{
          width: `${nodeWidth}px`,
          minWidth: '120px',
          maxWidth: '800px',
        }}
        onContextMenu={handleContextMenu}
        onClick={handleNodeClick}
        onPointerDown={handlePointerDown}
        onDoubleClick={handleDoubleClick}
      >
        {/* Icon container for chat, notes, and sources */}
        {(data.chatId ||
          (data.notes && data.notes.trim()) ||
          (data.sources && data.sources.length > 0)) && (
          <div className="absolute -bottom-2.5 -right-2.5 flex items-center gap-1 z-10">
            {/* Chat watermark icon */}
            {data.chatId && (
              <div
                className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center cursor-pointer hover:bg-green-600 transition-colors"
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
                <MessageCircle size={12} className="text-white" />
              </div>
            )}

            {/* Notes watermark icon */}
            {data.notes && data.notes.trim() && (
              <div
                className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center cursor-pointer hover:bg-red-600 transition-colors"
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
                <FileText size={12} className="text-white" />
              </div>
            )}

            {/* Sources watermark icon */}
            {data.sources && data.sources.length > 0 && (
              <div
                className="w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center cursor-pointer hover:bg-orange-600 transition-colors"
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
                <BookOpen size={12} className="text-white" />
              </div>
            )}
          </div>
        )}

        {/* Hidden handles for automatic connections only */}
        <Handle
          type="target"
          position={Position.Top}
          id="top"
          style={{ opacity: 0, pointerEvents: 'none' }}
        />
        <Handle
          type="target"
          position={Position.Bottom}
          id="bottom"
          style={{ opacity: 0, pointerEvents: 'none' }}
        />
        <Handle
          type="target"
          position={Position.Left}
          id="left"
          style={{ opacity: 0, pointerEvents: 'none' }}
        />
        <Handle
          type="target"
          position={Position.Right}
          id="right"
          style={{ opacity: 0, pointerEvents: 'none' }}
        />
        <Handle
          type="source"
          position={Position.Top}
          id="top-source"
          style={{ opacity: 0, pointerEvents: 'none' }}
        />
        <Handle
          type="source"
          position={Position.Bottom}
          id="bottom-source"
          style={{ opacity: 0, pointerEvents: 'none' }}
        />
        <Handle
          type="source"
          position={Position.Left}
          id="left-source"
          style={{ opacity: 0, pointerEvents: 'none' }}
        />
        <Handle
          type="source"
          position={Position.Right}
          id="right-source"
          style={{ opacity: 0, pointerEvents: 'none' }}
        />

        {/* Hidden element for measuring text width */}
        <span
          ref={measureRef}
          className="absolute opacity-0 pointer-events-none text-sm font-medium whitespace-nowrap"
          style={{ left: '-9999px', top: '-9999px' }}
        >
          {label || data.label || 'Untitled'}
        </span>

        <div className="flex items-center justify-between gap-2">
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              onBlur={handleSubmit}
              onKeyDown={handleKeyDown}
              className={clsx(
                'bg-transparent border-none outline-none text-sm font-medium flex-1 min-w-0',
                data.customColors?.foregroundClass || 'text-white'
              )}
              style={{ width: '100%' }}
              placeholder="Enter text..."
            />
          ) : (
            <span
              className={clsx(
                'text-sm font-medium flex-1 min-w-0 break-words cursor-pointer select-none',
                data.customColors?.foregroundClass || 'text-white'
              )}
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
            className={clsx(
              'absolute w-6 h-6 bg-gray-600 border border-gray-500 rounded-full flex items-center justify-center hover:bg-gray-500 transition-colors z-10 shadow-lg',
              data.layout === 'TB'
                ? '-bottom-3 left-1/2 transform -translate-x-1/2'
                : data.layout === 'BT'
                  ? '-top-3 left-1/2 transform -translate-x-1/2'
                  : '-right-3 top-1/2 transform -translate-y-1/2'
            )}
            title={data.isCollapsed ? 'Expand children' : 'Collapse children'}
          >
            {data.isCollapsed ? (
              <Plus size={12} className="text-white" />
            ) : (
              <Minus size={12} className="text-white" />
            )}
          </button>
        )}
      </div>

      {/* Context Menu - Render using Portal */}
      {showContextMenu &&
        createPortal(
          <div
            ref={contextMenuRef}
            className="fixed bg-gray-800 border border-gray-600 rounded-lg shadow-lg py-2 min-w-[160px] context-menu"
            data-context-menu="true"
            style={{
              left: contextMenuPosition.x,
              top: contextMenuPosition.y,
              zIndex: 9999,
            }}
          >
            <button
              onClick={handleAddChild}
              className="w-full text-left px-4 py-2 text-sm text-white hover:bg-gray-700 flex items-center gap-2"
            >
              <Plus size={14} />
              Add Child
            </button>
            {!data.isRoot && (
              <button
                onClick={handleAddSibling}
                className="w-full text-left px-4 py-2 text-sm text-white hover:bg-gray-700 flex items-center gap-2"
              >
                <Share size={14} />
                Add Sibling
              </button>
            )}
            <button
              onClick={handleEdit}
              className="w-full text-left px-4 py-2 text-sm text-white hover:bg-gray-700 flex items-center gap-2"
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
                className="w-full text-left px-4 py-2 text-sm text-white hover:bg-gray-700 flex items-center gap-2"
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
              className="w-full text-left px-4 py-2 text-sm text-white hover:bg-gray-700 flex items-center gap-2"
            >
              <PanelRightOpen size={14} />
              Node Panel
            </button>
            {!data.isRoot && (
              <>
                <hr className="my-1 border-gray-600" />
                <button
                  onClick={handleDelete}
                  className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700 flex items-center gap-2"
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
