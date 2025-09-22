import { Network } from 'lucide-react';
import { AppBar } from '../../components/AppBar';
import { MindMapsPanel } from './MindMapsPanel';
import { MindMapCanvas } from './MindMapCanvas';
import { ThreadMetadata } from '../../store/useThreadsStore';
import { MindMap } from '../hooks/useMindMaps';
import { Source } from '../../types/mindMap';

interface MindMapsViewProps {
  mindMaps: MindMap[];
  activeMindMapId?: string;
  activeMindMap: MindMap | null;
  threads: ThreadMetadata[];
  onMindMapSelect: (mindMapId: string) => void;
  onMindMapCreate: () => void;
  onMindMapRename: (mindMapId: string, newName: string) => void;
  onMindMapDelete: (mindMapId: string) => void;
  onThreadAssociate: (nodeId: string, threadId: string) => void;
  onThreadUnassign: (nodeId: string) => void;
  onThreadCreate: () => void;
  onThreadRename: (threadId: string, newName: string) => void;
  onThreadDelete: (threadId: string) => void;
  onNavigateToChat: (threadId?: string) => void;
  onPromptUpdate: (threadId: string, customPrompt?: string) => void;
  onCustomizePrompts: () => void;
  onNodeNotesUpdate: (nodeId: string, notes: string | null) => Promise<void>;
  onNodeSourcesUpdate: (nodeId: string, sources: Source[]) => Promise<void>;
  loadMindMaps: (preserveActiveId?: boolean) => Promise<void>;
  pendingNodeUpdate?: {
    nodeId: string;
    chatId?: string | null;
    notes?: string | null;
    sources?: Source[];
    timestamp: number;
  };
}

export function MindMapsView({
  mindMaps,
  activeMindMapId,
  activeMindMap,
  threads,
  onMindMapSelect,
  onMindMapCreate,
  onMindMapRename,
  onMindMapDelete,
  onThreadAssociate,
  onThreadUnassign,
  onThreadCreate,
  onThreadRename,
  onThreadDelete,
  onNavigateToChat,
  onPromptUpdate,
  onCustomizePrompts,
  onNodeNotesUpdate,
  onNodeSourcesUpdate,
  loadMindMaps,
  pendingNodeUpdate,
}: MindMapsViewProps) {
  return (
    <div className="flex flex-col h-full">
      {/* MindMaps Header */}
      <AppBar icon={Network} title="MindMaps" actions={<></>} />

      {/* MindMaps content area */}
      <div className="flex flex-1 min-h-0">
        <MindMapsPanel
          mindMaps={mindMaps}
          activeMindMapId={activeMindMapId}
          onMindMapSelect={onMindMapSelect}
          onMindMapCreate={onMindMapCreate}
          onMindMapRename={onMindMapRename}
          onMindMapDelete={onMindMapDelete}
          threads={threads}
          onThreadAssociate={onThreadAssociate}
          onThreadUnassign={onThreadUnassign}
          onThreadCreate={onThreadCreate}
          onThreadRename={onThreadRename}
          onThreadDelete={onThreadDelete}
          onNavigateToChat={onNavigateToChat}
          onPromptUpdate={onPromptUpdate}
          onCustomizePrompts={onCustomizePrompts}
          onNodeNotesUpdate={onNodeNotesUpdate}
          onNodeSourcesUpdate={onNodeSourcesUpdate}
        />
        <MindMapCanvas
          activeMindMap={activeMindMap}
          loadMindMaps={loadMindMaps}
          pendingNodeUpdate={pendingNodeUpdate}
        />
      </div>
    </div>
  );
}
