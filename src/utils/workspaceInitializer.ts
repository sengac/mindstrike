import { logger } from './logger';

// Global workspace initializer that runs once regardless of component lifecycle
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

export async function initializeWorkspace() {
  // Return existing promise if already initializing
  if (initializationPromise) {
    return initializationPromise;
  }

  // Return immediately if already initialized
  if (isInitialized) {
    return Promise.resolve();
  }

  initializationPromise = (async () => {
    try {
      const { useAppStore } = await import('../store/useAppStore');
      const { initializeModelsEventSubscription } = await import(
        '../store/useModelsStore'
      );
      const { initializeLocalModelsStore } = await import(
        '../store/useLocalModelsStore'
      );

      // Initialize the global stores
      initializeModelsEventSubscription();
      initializeLocalModelsStore();

      const { workspaceRoot, musicRoot } = useAppStore.getState();

      if (workspaceRoot) {
        // Restore saved workspace
        const response = await fetch('/api/workspace/root', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ path: workspaceRoot }),
        });

        if (!response.ok) {
          logger.error('Failed to restore workspace:', await response.text());
        }
      } else {
        // Set workspace to current working directory if none is selected
        const response = await fetch('/api/workspace/root', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ path: '.' }),
        });

        if (response.ok) {
          const data: unknown = await response.json();
          const workspaceData = data as { workspaceRoot?: string };
          useAppStore.getState().setWorkspaceRoot(workspaceData.workspaceRoot);
        } else {
          logger.error(
            'Failed to set initial workspace:',
            await response.text()
          );
        }
      }

      if (musicRoot) {
        // Restore saved music root
        const response = await fetch('/api/music/root', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ path: musicRoot }),
        });

        if (!response.ok) {
          logger.error('Failed to restore music root:', await response.text());
        }
      }

      isInitialized = true;
    } catch (error) {
      logger.error('Failed to initialize workspace:', error);
      // Reset promise to allow retry
      initializationPromise = null;
      throw error;
    }
  })();

  return initializationPromise;
}
