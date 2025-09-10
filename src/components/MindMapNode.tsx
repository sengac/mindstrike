import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, NodeProps } from 'reactflow';
import { Plus, Minus, Brain, MoreVertical, Edit, Trash2, Share } from 'lucide-react';
import { clsx } from 'clsx';

export interface MindMapNodeData {
  id: string;
  label: string;
  isRoot: boolean;
  parentId?: string; // Parent node ID for hierarchy (not saved, computed dynamically)
  isEditing?: boolean;
  level?: number;
  isCollapsed?: boolean;
  hasChildren?: boolean;
  isDragging?: boolean;
  isDropTarget?: boolean;
  dropPosition?: 'above' | 'below' | 'over' | null;
  layout?: 'LR' | 'RL' | 'TB' | 'BT';
  width?: number; // Calculated width of the node
}

export function MindMapNode({ id, data, selected }: NodeProps<MindMapNodeData>) {
  const [isEditing, setIsEditing] = useState(data.isEditing || false);
  const [label, setLabel] = useState(data.label);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [nodeWidth, setNodeWidth] = useState(data.width || 120);
  const inputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);

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

  // Calculate text width and update node width (debounced)
  useEffect(() => {
    const measureTextWidth = () => {
      if (measureRef.current) {
        const textWidth = measureRef.current.scrollWidth;
        const padding = 32; // 16px padding on each side
        const minWidth = 120;
        const maxWidth = 800;
        const calculatedWidth = Math.min(Math.max(textWidth + padding, minWidth), maxWidth);
        
        if (calculatedWidth !== nodeWidth) {
          setNodeWidth(calculatedWidth);
        }
      }
    };

    // Use requestAnimationFrame for immediate visual feedback
    requestAnimationFrame(measureTextWidth);

    // Debounce the layout update event to prevent overwhelming React Flow
    const debounceTimeout = setTimeout(() => {
      if (measureRef.current) {
        const textWidth = measureRef.current.scrollWidth;
        const padding = 32;
        const minWidth = 120;
        const maxWidth = 800;
        const calculatedWidth = Math.min(Math.max(textWidth + padding, minWidth), maxWidth);
        
        // Only emit the event if we're not actively editing (to avoid constant layout updates)
        if (!isEditing) {
          window.dispatchEvent(new CustomEvent('mindmap-node-width-change', {
            detail: { nodeId: id, width: calculatedWidth }
          }));
        }
      }
    }, 750); // Increased to 750ms for better performance

    return () => clearTimeout(debounceTimeout);
  }, [label, id, nodeWidth, isEditing]);

  // Update width when data.width changes (from parent)
  useEffect(() => {
    if (data.width && data.width !== nodeWidth) {
      setNodeWidth(data.width);
    }
  }, [data.width, nodeWidth]);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setShowContextMenu(false);
      }
    };

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowContextMenu(false);
      }
    };

    if (showContextMenu) {
      // Use capture phase to ensure we catch the event before other handlers
      document.addEventListener('mousedown', handleClickOutside, true);
      document.addEventListener('click', handleClickOutside, true);
      document.addEventListener('keydown', handleEscapeKey);
      
      return () => {
        document.removeEventListener('mousedown', handleClickOutside, true);
        document.removeEventListener('click', handleClickOutside, true);
        document.removeEventListener('keydown', handleEscapeKey);
      };
    }
  }, [showContextMenu]);

  // Listen for global context menu close events
  useEffect(() => {
    const handleCloseContextMenu = () => {
      setShowContextMenu(false);
    };

    window.addEventListener('mindmap-close-context-menu', handleCloseContextMenu);
    
    return () => {
      window.removeEventListener('mindmap-close-context-menu', handleCloseContextMenu);
    };
  }, []);

  const handleSubmit = () => {
    setIsEditing(false);
    // Emit custom event to update node data
    window.dispatchEvent(new CustomEvent('mindmap-node-update', {
      detail: { nodeId: id, label: label.trim() || 'Untitled' }
    }));

    // Trigger immediate layout update when editing finishes
    setTimeout(() => {
      if (measureRef.current) {
        const textWidth = measureRef.current.scrollWidth;
        const padding = 32;
        const minWidth = 120;
        const maxWidth = 800;
        const calculatedWidth = Math.min(Math.max(textWidth + padding, minWidth), maxWidth);
        
        window.dispatchEvent(new CustomEvent('mindmap-node-width-change', {
          detail: { nodeId: id, width: calculatedWidth }
        }));
      }
    }, 100);
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
    window.dispatchEvent(new CustomEvent('mindmap-toggle-collapse', {
      detail: { nodeId: id }
    }));
  };

  const handleInferenceClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Get button position for popup positioning
    const rect = e.currentTarget.getBoundingClientRect();
    const position = {
      x: rect.left,
      y: rect.top + rect.height / 2
    };
    
    window.dispatchEvent(new CustomEvent('mindmap-inference-open', {
      detail: { 
        nodeId: id, 
        label: data.label,
        position
      }
    }));
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };

  const handleAddChild = () => {
    setShowContextMenu(false);
    window.dispatchEvent(new CustomEvent('mindmap-add-child', {
      detail: { nodeId: id }
    }));
  };

  const handleAddSibling = () => {
    setShowContextMenu(false);
    window.dispatchEvent(new CustomEvent('mindmap-add-sibling', {
      detail: { nodeId: id }
    }));
  };

  const handleEdit = () => {
    setShowContextMenu(false);
    setIsEditing(true);
  };

  const handleDelete = () => {
    setShowContextMenu(false);
    if (!data.isRoot) {
      window.dispatchEvent(new CustomEvent('mindmap-delete-node', {
        detail: { nodeId: id }
      }));
    }
  };

  const nodeLevel = data.level || 0;
  const nodeColors = [
    'bg-blue-500 border-blue-400',     // Root
    'bg-green-500 border-green-400',   // Level 1
    'bg-purple-500 border-purple-400', // Level 2
    'bg-orange-500 border-orange-400', // Level 3
    'bg-pink-500 border-pink-400',     // Level 4+
  ];
  
  const colorClass = nodeColors[Math.min(nodeLevel, nodeColors.length - 1)];

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
      <button
        onClick={handleInferenceClick}
        className="absolute left-0 top-1/2 transform -translate-y-1/2 -translate-x-full w-10 h-8 bg-blue-600 border border-blue-500 rounded-l-lg flex items-center justify-center hover:bg-blue-700 transition-colors z-10 shadow-lg mr-1"
        title="AI Inferences"
      >
        <Brain size={16} className="text-white" />
      </button>

      <div
        className={clsx(
          'px-4 py-2 rounded-lg border-2 transition-colors duration-200 relative',
          colorClass,
          selected ? 'ring-2 ring-yellow-400 ring-offset-2 ring-offset-gray-900' : '',
          data.isRoot ? 'shadow-lg scale-110' : 'shadow-md',
          data.isDragging ? 'opacity-30 scale-95 ring-2 ring-blue-400 ring-offset-2 ring-offset-gray-900 shadow-lg' : '',
          data.isDropTarget && data.dropPosition === 'over' ? 'ring-2 ring-green-400 ring-offset-2 ring-offset-gray-900 shadow-lg animate-pulse' : '',
          data.isDropTarget && (data.dropPosition === 'above' || data.dropPosition === 'below') ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-gray-900 shadow-lg' : '',
          !isEditing ? 'select-none' : ''
        )}
        style={{ width: `${nodeWidth}px`, minWidth: '120px', maxWidth: '800px', touchAction: 'manipulation' }}
        onContextMenu={handleContextMenu}
        onTouchEnd={(e) => {
          e.preventDefault();
          e.stopPropagation();
          // Emit custom event to trigger selection
          window.dispatchEvent(new CustomEvent('mindmap-node-select', {
            detail: { nodeId: id }
          }));
        }}
      >
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
            onChange={(e) => setLabel(e.target.value)}
            onBlur={handleSubmit}
            onKeyDown={handleKeyDown}
            className="bg-transparent border-none outline-none text-white text-sm font-medium flex-1 min-w-0"
            placeholder="Enter text..."
            style={{ width: '100%' }}
          />
        ) : (
          <span 
            className="text-white text-sm font-medium flex-1 min-w-0 break-words cursor-pointer"
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
            "absolute w-6 h-6 bg-gray-600 border border-gray-500 rounded-full flex items-center justify-center hover:bg-gray-500 transition-colors z-10 shadow-lg",
            data.layout === 'TB' ? "-bottom-3 left-1/2 transform -translate-x-1/2" :
            data.layout === 'BT' ? "-top-3 left-1/2 transform -translate-x-1/2" :
            "-right-3 top-1/2 transform -translate-y-1/2"
          )}
          title={data.isCollapsed ? "Expand children" : "Collapse children"}
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
      {showContextMenu && createPortal(
        <div
          ref={contextMenuRef}
          className="fixed bg-gray-800 border border-gray-600 rounded-lg shadow-lg py-2 min-w-[160px]"
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
              onClick={(e) => {
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
            onClick={(e) => {
              setShowContextMenu(false);
              handleInferenceClick(e);
            }}
            className="w-full text-left px-4 py-2 text-sm text-white hover:bg-gray-700 flex items-center gap-2"
          >
            <Brain size={14} />
            AI Inferences
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
