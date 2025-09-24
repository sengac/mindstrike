import { Network } from 'lucide-react';
import { useCallback } from 'react';
import { AppBar } from '../../components/AppBar';
import { MindMapsPanel } from './MindMapsPanel';
import { MindMapCanvas } from './MindMapCanvas';
import type { ThreadMetadata } from '../../store/useThreadsStore';
import type { MindMap } from '../hooks/useMindMaps';
interface MindMapsViewProps {
  mindMaps: MindMap[];
  activeMindMapId?: string;
  activeMindMap: MindMap | null;
  threads: ThreadMetadata[];
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

export function MindMapsView({
  mindMaps,
  activeMindMapId,
  activeMindMap,
  threads,
  onMindMapSelect,
  onMindMapCreate,
  onMindMapRename,
  onMindMapDelete,
  onThreadCreate,
  onThreadRename,
  onThreadDelete,
  onNavigateToChat,
  onPromptUpdate,
  onCustomizePrompts,
  loadMindMaps,
}: MindMapsViewProps) {
  // Error-safe wrapper for synchronous callbacks
  const createSafeCallback = useCallback(
    <TArgs extends unknown[]>(
      callback: (...args: TArgs) => void,
      errorContext: string
    ) => {
      return (...args: TArgs) => {
        try {
          callback(...args);
        } catch (error) {
          console.error(`Error in ${errorContext}:`, error);
          // Optionally, you could show a toast notification here
          // toast.error(`Failed to ${errorContext}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      };
    },
    []
  );

  // Error-safe wrapper for async callbacks
  const createSafeAsyncCallback = useCallback(
    <TArgs extends unknown[]>(
      callback: (...args: TArgs) => Promise<void>,
      errorContext: string
    ) => {
      return async (...args: TArgs) => {
        try {
          await callback(...args);
        } catch (error) {
          console.error(`Error in ${errorContext}:`, error);
          // Optionally, you could show a toast notification here
          // toast.error(`Failed to ${errorContext}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      };
    },
    []
  );

  // Create error-safe versions of all callbacks
  const safeMindMapSelect = useCallback(
    createSafeCallback(onMindMapSelect, 'mind map selection'),
    [createSafeCallback, onMindMapSelect]
  );

  const safeMindMapCreate = useCallback(
    createSafeCallback(onMindMapCreate, 'mind map creation'),
    [createSafeCallback, onMindMapCreate]
  );

  const safeMindMapRename = useCallback(
    createSafeCallback(onMindMapRename, 'mind map renaming'),
    [createSafeCallback, onMindMapRename]
  );

  const safeMindMapDelete = useCallback(
    createSafeCallback(onMindMapDelete, 'mind map deletion'),
    [createSafeCallback, onMindMapDelete]
  );

  const safeThreadCreate = useCallback(
    createSafeCallback(onThreadCreate, 'thread creation'),
    [createSafeCallback, onThreadCreate]
  );

  const safeThreadRename = useCallback(
    createSafeCallback(onThreadRename, 'thread renaming'),
    [createSafeCallback, onThreadRename]
  );

  const safeThreadDelete = useCallback(
    createSafeCallback(onThreadDelete, 'thread deletion'),
    [createSafeCallback, onThreadDelete]
  );

  const safeNavigateToChat = useCallback(
    createSafeCallback(onNavigateToChat, 'navigation to chat'),
    [createSafeCallback, onNavigateToChat]
  );

  const safePromptUpdate = useCallback(
    createSafeCallback(onPromptUpdate, 'prompt update'),
    [createSafeCallback, onPromptUpdate]
  );

  const safeCustomizePrompts = useCallback(
    createSafeCallback(onCustomizePrompts, 'prompt customization'),
    [createSafeCallback, onCustomizePrompts]
  );

  const safeLoadMindMaps = useCallback(
    createSafeAsyncCallback(loadMindMaps, 'mind maps loading'),
    [createSafeAsyncCallback, loadMindMaps]
  );
  return (
    <div className="flex flex-col h-full">
      {/* MindMaps Header */}
      <AppBar icon={Network} title="MindMaps" actions={<></>} />

      {/* MindMaps content area */}
      <div className="flex flex-1 min-h-0">
        <MindMapsPanel
          mindMaps={mindMaps}
          activeMindMapId={activeMindMapId}
          onMindMapSelect={safeMindMapSelect}
          onMindMapCreate={safeMindMapCreate}
          onMindMapRename={safeMindMapRename}
          onMindMapDelete={safeMindMapDelete}
          threads={threads}
          onThreadCreate={safeThreadCreate}
          onThreadRename={safeThreadRename}
          onThreadDelete={safeThreadDelete}
          onNavigateToChat={safeNavigateToChat}
          onPromptUpdate={safePromptUpdate}
          onCustomizePrompts={safeCustomizePrompts}
        />
        <MindMapCanvas
          activeMindMap={activeMindMap}
          loadMindMaps={safeLoadMindMaps}
        />
      </div>
    </div>
  );
}
