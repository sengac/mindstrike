// Shared types for mind map functionality
import type { NodeColorThemeType } from '../constants/nodeColors';

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
  layout?: 'LR' | 'RL' | 'TB' | 'BT' | 'RD';
  width?: number; // Calculated width of the node
  height?: number; // Calculated height of the node
  colorTheme?: NodeColorThemeType | null;
}
