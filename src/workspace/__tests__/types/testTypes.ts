import type { Thread } from '../../../types';
import type { MindMapData } from '../../../mindmaps/types';

export interface WorkspaceViewTestProps {
  onDirectoryChange?: () => void;
}

export interface ChatViewTestProps {
  threads: Thread[];
  activeThreadId: string | null;
  onThreadSelect: (threadId: string) => void;
  onThreadCreate: () => void;
  onThreadDelete: (threadId: string) => void;
  onThreadRename: (threadId: string, newName: string) => void;
}

export interface MindMapsViewTestProps {
  mindMaps: MindMapData[];
  activeMindMapId: string | null;
  activeMindMap: MindMapData | null;
  threads: Thread[];
  onMindMapSelect: (mindMapId: string) => void;
  onMindMapCreate: () => void;
  onMindMapRename: (mindMapId: string, newName: string) => void;
  onMindMapDelete: (mindMapId: string) => void;
  onThreadCreate: () => void;
  onThreadRename: (threadId: string, newName: string) => void;
  onThreadDelete: (threadId: string) => void;
  onNavigateToChat: (threadId?: string) => void;
  onPromptUpdate: (threadId: string, customPrompt?: string) => void;
  onCustomizePrompts: () => void;
  loadMindMaps: (preserveActiveId?: boolean) => Promise<void>;
}

export interface SSEEvent {
  type: string;
  data: unknown;
}

export type SSECallback = (event: SSEEvent) => void;

export interface MockSSEEventBus {
  initialize: () => void;
  subscribe: (type: string, callback: SSECallback) => () => void;
  trigger?: (type: string, data: unknown) => void;
}
