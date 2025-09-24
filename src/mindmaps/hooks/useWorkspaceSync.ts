import { useEffect, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';

interface WorkspaceSyncOptions {
  onWorkspaceChange: () => void;
}

/**
 * Hook that handles workspace version changes
 * Completely decoupled from mind map logic
 */
export function useWorkspaceSync({ onWorkspaceChange }: WorkspaceSyncOptions) {
  const workspaceVersion = useAppStore(state => state.workspaceVersion);
  const prevVersionRef = useRef(workspaceVersion);
  const isFirstMountRef = useRef(true);

  useEffect(() => {
    // Skip on first mount
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }

    // Check if workspace version actually changed
    if (prevVersionRef.current !== workspaceVersion) {
      prevVersionRef.current = workspaceVersion;
      onWorkspaceChange();
    }
  }, [workspaceVersion, onWorkspaceChange]);

  return { workspaceVersion };
}
