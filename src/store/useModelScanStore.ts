import { create } from 'zustand';
import {
  useAvailableModelsStore,
  AvailableModel,
} from './useAvailableModelsStore';
import { sseEventBus } from '../utils/sseEventBus';
import { isSSEModelScanEvent } from '../types/sse-events';

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
  results?: Record<string, unknown>[]; // Search results when operationType is 'search'
}

interface ModelScanState {
  // Scan state
  isScanning: boolean;
  canCancel: boolean;
  scanId: string | null;
  progress: ScanProgress;

  // Event bus subscription
  unsubscribe: (() => void) | null;
  eventSource: EventSource | { close: () => void } | null;

  // Actions
  startScan: () => Promise<void>;
  startSearch: (
    query: string,
    searchType: string,
    filters: Record<string, unknown>
  ) => Promise<void>;
  cancelScan: () => Promise<void>;
  resetScan: () => void;
  updateProgress: (progress: ScanProgress) => void;

  // Internal event bus management
  subscribeToEvents: () => void;
  unsubscribeFromEvents: () => void;
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
  unsubscribe: null,
  eventSource: null,

  startScan: async () => {
    const { subscribeToEvents } = get();

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
      subscribeToEvents();

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
      const { unsubscribeFromEvents } = get();
      unsubscribeFromEvents();

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

  startSearch: async (
    query: string,
    searchType: string,
    filters: Record<string, unknown>
  ) => {
    const { subscribeToEvents } = get();

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
      subscribeToEvents();

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
      const { unsubscribeFromEvents } = get();
      unsubscribeFromEvents();

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
    const { scanId, unsubscribeFromEvents } = get();

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

      unsubscribeFromEvents();

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
    const { unsubscribeFromEvents } = get();
    unsubscribeFromEvents();

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
      const { unsubscribeFromEvents } = get();
      unsubscribeFromEvents();

      // If this was a search operation and we have results, update the available models store
      if (progress.operationType === 'search' && progress.results) {
        // Set the search results directly, replacing any previous results
        useAvailableModelsStore.setState({
          searchResults: progress.results as unknown as AvailableModel[],
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
      const { unsubscribeFromEvents } = get();
      unsubscribeFromEvents();

      set({
        isScanning: false,
        canCancel: false,
      });
    }
  },

  subscribeToEvents: () => {
    const { eventSource, unsubscribeFromEvents } = get();

    // Close existing connection
    if (eventSource) {
      unsubscribeFromEvents();
    }

    // Subscribe to unified event bus for scan progress
    const unsubscribe = sseEventBus.subscribe('scan-progress', async event => {
      // Handle nested data structure from unified SSE
      if (!isSSEModelScanEvent(event.data)) return;
      const data = event.data;
      if (data && data.progress) {
        get().updateProgress(data.progress as ScanProgress);
      }
    });

    // Store unsubscribe function as mock EventSource
    const mockEventSource = { close: unsubscribe };
    set({ eventSource: mockEventSource });
  },

  unsubscribeFromEvents: () => {
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
    const { unsubscribeFromEvents } = useModelScanStore.getState();
    unsubscribeFromEvents();
  });
}
