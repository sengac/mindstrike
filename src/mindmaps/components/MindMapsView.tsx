import { Network } from 'lucide-react';
import { useCallback } from 'react';
import { AppBar } from '../../components/AppBar';
import { MindMapsPanel } from './MindMapsPanel';
import { MindMapCanvas } from './MindMapCanvas';
import type { ThreadMetadata } from '../../store/useThreadsStore';
import type { MindMap } from '../hooks/useMindMaps';
import { logger } from '../../utils/logger';
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
          logger.error(`Error in ${errorContext}`, error);
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
          logger.error(`Error in ${errorContext}`, error);
          // Optionally, you could show a toast notification here
          // toast.error(`Failed to ${errorContext}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      };
    },
    []
  );

  // Create error-safe versions of all callbacks
  const safeMindMapSelect = useCallback(
    (...args: Parameters<typeof onMindMapSelect>) =>
      createSafeCallback(onMindMapSelect, 'mind map selection')(...args),
    [createSafeCallback, onMindMapSelect]
  );

  const safeMindMapCreate = useCallback(
    (...args: Parameters<typeof onMindMapCreate>) =>
      createSafeCallback(onMindMapCreate, 'mind map creation')(...args),
    [createSafeCallback, onMindMapCreate]
  );

  const safeMindMapRename = useCallback(
    (...args: Parameters<typeof onMindMapRename>) =>
      createSafeCallback(onMindMapRename, 'mind map renaming')(...args),
    [createSafeCallback, onMindMapRename]
  );

  const safeMindMapDelete = useCallback(
    (...args: Parameters<typeof onMindMapDelete>) =>
      createSafeCallback(onMindMapDelete, 'mind map deletion')(...args),
    [createSafeCallback, onMindMapDelete]
  );

  const safeThreadCreate = useCallback(
    (...args: Parameters<typeof onThreadCreate>) =>
      createSafeCallback(onThreadCreate, 'thread creation')(...args),
    [createSafeCallback, onThreadCreate]
  );

  const safeThreadRename = useCallback(
    (...args: Parameters<typeof onThreadRename>) =>
      createSafeCallback(onThreadRename, 'thread renaming')(...args),
    [createSafeCallback, onThreadRename]
  );

  const safeThreadDelete = useCallback(
    (...args: Parameters<typeof onThreadDelete>) =>
      createSafeCallback(onThreadDelete, 'thread deletion')(...args),
    [createSafeCallback, onThreadDelete]
  );

  const safeNavigateToChat = useCallback(
    (...args: Parameters<typeof onNavigateToChat>) =>
      createSafeCallback(onNavigateToChat, 'navigation to chat')(...args),
    [createSafeCallback, onNavigateToChat]
  );

  const safePromptUpdate = useCallback(
    (...args: Parameters<typeof onPromptUpdate>) =>
      createSafeCallback(onPromptUpdate, 'prompt update')(...args),
    [createSafeCallback, onPromptUpdate]
  );

  const safeCustomizePrompts = useCallback(
    (...args: Parameters<typeof onCustomizePrompts>) =>
      createSafeCallback(onCustomizePrompts, 'prompt customization')(...args),
    [createSafeCallback, onCustomizePrompts]
  );

  const safeLoadMindMaps = useCallback(
    (...args: Parameters<typeof loadMindMaps>) =>
      createSafeAsyncCallback(loadMindMaps, 'mind maps loading')(...args),
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
