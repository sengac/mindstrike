// Shared types for mind map functionality
export interface Source {
  id: string;
  name: string;
  directory: string;
  type: 'file' | 'url' | 'document' | 'reference';
  // Additional properties for server compatibility
  title?: string;
  url?: string;
  text?: string;
}

export interface MindMapNodeData {
  id: string;
  label: string;
  isRoot: boolean;
  parentId?: string; // Parent node ID for hierarchy (not saved, computed dynamically)
  notes?: string | null;
  sources?: Source[];
  chatId?: string | null;
  isEditing?: boolean;
  level?: number;
  isCollapsed?: boolean;
  hasChildren?: boolean;
  isDragging?: boolean;
  isDropTarget?: boolean;
  dropPosition?: 'above' | 'below' | 'over' | null;
  layout?: 'LR' | 'RL' | 'TB' | 'BT';
  width?: number; // Calculated width of the node
  customColors?: {
    backgroundClass: string;
    foregroundClass: string;
  } | null;
}
