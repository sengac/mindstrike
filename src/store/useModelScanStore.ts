import { create } from 'zustand';
import { useAvailableModelsStore } from './useAvailableModelsStore';

export interface ScanProgress {
  stage:
    | 'idle'
    | 'initializing'
    | 'fetching-huggingface'
    | 'checking-models'
    | 'searching'
    | 'completing'
    | 'completed'
    | 'error'
    | 'cancelled';
  message: string;
  progress?: number; // 0-100 percentage
  currentItem?: string;
  totalItems?: number;
  completedItems?: number;
  error?: string;
  operationType?: 'scan' | 'search';
  results?: any[]; // Search results when operationType is 'search'
}

interface ModelScanState {
  // Scan state
  isScanning: boolean;
  canCancel: boolean;
  scanId: string | null;
  progress: ScanProgress;

  // SSE connection
  eventSource: EventSource | null;

  // Actions
  startScan: () => Promise<void>;
  startSearch: (
    query: string,
    searchType: string,
    filters: any
  ) => Promise<void>;
  cancelScan: () => Promise<void>;
  resetScan: () => void;
  updateProgress: (progress: ScanProgress) => void;

  // Internal SSE management
  connectSSE: () => void;
  disconnectSSE: () => void;
}

export const useModelScanStore = create<ModelScanState>((set, get) => ({
  // Initial state
  isScanning: false,
  canCancel: false,
  scanId: null,
  progress: {
    stage: 'idle',
    message: 'Ready to find models',
  },
  eventSource: null,

  startScan: async () => {
    const { connectSSE } = get();

    try {
      set({
        isScanning: true,
        canCancel: true,
        progress: {
          stage: 'initializing',
          message: 'Starting model scan...',
        },
      });

      // Connect to SSE first
      connectSSE();

      // Start the scan
      const response = await fetch('/api/model-scan/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to start scan: ${response.statusText}`);
      }

      const result = await response.json();

      set({
        scanId: result.scanId,
        progress: {
          stage: 'initializing',
          message: 'Scan started successfully',
        },
      });
    } catch (error) {
      const { disconnectSSE } = get();
      disconnectSSE();

      set({
        isScanning: false,
        canCancel: false,
        scanId: null,
        progress: {
          stage: 'error',
          message: 'Failed to start scan',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      throw error;
    }
  },

  startSearch: async (query: string, searchType: string, filters: any) => {
    const { connectSSE } = get();

    try {
      set({
        isScanning: true,
        canCancel: true,
        progress: {
          stage: 'searching',
          message: 'Searching for models...',
          operationType: 'search',
        },
      });

      // Connect to SSE first
      connectSSE();

      // Start the search
      const response = await fetch('/api/model-scan/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query.trim(),
          searchType,
          filters,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to start search: ${response.statusText}`);
      }

      const result = await response.json();

      set({
        scanId: result.searchId,
        progress: {
          stage: 'searching',
          message: 'Search started successfully',
          operationType: 'search',
        },
      });
    } catch (error) {
      const { disconnectSSE } = get();
      disconnectSSE();

      set({
        isScanning: false,
        canCancel: false,
        scanId: null,
        progress: {
          stage: 'error',
          message: 'Failed to start search',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      throw error;
    }
  },

  cancelScan: async () => {
    const { scanId, disconnectSSE } = get();

    if (!scanId || !get().canCancel) {
      return;
    }

    try {
      set({
        canCancel: false,
        progress: {
          stage: 'cancelled',
          message: 'Cancelling scan...',
        },
      });

      const response = await fetch(`/api/model-scan/cancel/${scanId}`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`Failed to cancel scan: ${response.statusText}`);
      }

      disconnectSSE();

      set({
        isScanning: false,
        scanId: null,
        progress: {
          stage: 'cancelled',
          message: 'Scan cancelled successfully',
        },
      });
    } catch (error) {
      set({
        canCancel: true,
        progress: {
          stage: 'error',
          message: 'Failed to cancel scan',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      throw error;
    }
  },

  resetScan: () => {
    const { disconnectSSE } = get();
    disconnectSSE();

    set({
      isScanning: false,
      canCancel: false,
      scanId: null,
      progress: {
        stage: 'idle',
        message: 'Ready to scan for models',
      },
    });
  },

  updateProgress: (progress: ScanProgress) => {
    set({ progress });

    // Auto-complete scan when stage is completed
    if (progress.stage === 'completed') {
      const { disconnectSSE } = get();
      disconnectSSE();

      // If this was a search operation and we have results, update the available models store
      if (progress.operationType === 'search' && progress.results) {
        // Set the search results directly, replacing any previous results
        useAvailableModelsStore.setState({
          searchResults: progress.results,
          hasSearched: true,
          currentPage: 1,
        });
      }

      set({
        isScanning: false,
        canCancel: false,
      });
    }

    // Handle error state
    if (progress.stage === 'error') {
      const { disconnectSSE } = get();
      disconnectSSE();

      set({
        isScanning: false,
        canCancel: false,
      });
    }
  },

  connectSSE: () => {
    const { eventSource, disconnectSSE } = get();

    // Close existing connection
    if (eventSource) {
      disconnectSSE();
    }

    const newEventSource = new EventSource('/api/model-scan/progress');

    newEventSource.onmessage = event => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'scan-progress') {
          get().updateProgress(data.progress);
        }
      } catch (error) {
        console.error('Error parsing SSE scan progress data:', error);
      }
    };

    newEventSource.onerror = error => {
      console.error('SSE scan progress connection error:', error);

      // Only attempt reconnect if we're still scanning
      if (
        get().isScanning &&
        newEventSource.readyState === EventSource.CLOSED
      ) {
        setTimeout(() => {
          if (get().isScanning) {
            get().connectSSE();
          }
        }, 3000);
      }
    };

    set({ eventSource: newEventSource });
  },

  disconnectSSE: () => {
    const { eventSource } = get();

    if (eventSource) {
      eventSource.close();
      set({ eventSource: null });
    }
  },
}));

// Auto-cleanup on unmount
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    const { disconnectSSE } = useModelScanStore.getState();
    disconnectSSE();
  });
}
