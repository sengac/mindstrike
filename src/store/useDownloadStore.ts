import { create } from 'zustand';
import toast from 'react-hot-toast';
import { modelEvents } from '../utils/modelEvents';
import { sseEventBus, SSEEvent } from '../utils/sseEventBus';

interface DownloadProgress {
  progress: number;
  speed?: string;
  isDownloading: boolean;
  completed?: boolean;
  error?: string;
  cancelled?: boolean;
  errorType?: string;
  errorMessage?: string;
  huggingFaceUrl?: string;
  filename?: string;
}

interface DownloadStore {
  downloads: Map<string, DownloadProgress>;
  addDownload: (filename: string, progress: DownloadProgress) => void;
  removeDownload: (filename: string) => void;
}

export const useDownloadStore = create<DownloadStore>(set => ({
  downloads: new Map(),

  addDownload: (filename: string, progress: DownloadProgress) => {
    set(state => {
      const newDownloads = new Map(state.downloads);
      newDownloads.set(filename, progress);
      return { downloads: newDownloads };
    });
  },

  removeDownload: (filename: string) => {
    set(state => {
      const newDownloads = new Map(state.downloads);
      newDownloads.delete(filename);
      return { downloads: newDownloads };
    });
  },
}));

const activeDownloads = new Set<string>();

export function startDownloadTracking(filename: string) {
  if (activeDownloads.has(filename)) return;

  activeDownloads.add(filename);

  const unsubscribe = sseEventBus.subscribe(
    'download-progress',
    (event: SSEEvent) => {
      // Handle nested data structure from unified SSE
      const progressData =
        (event.data as Record<string, unknown>).data || event.data;
      const data = progressData as DownloadProgress;

      if (data.filename === filename) {
        useDownloadStore.getState().addDownload(filename, data);

        if (data.completed) {
          toast.success('Download completed successfully');
          activeDownloads.delete(filename);
          unsubscribe();

          // Give server time to process the new model file before triggering rescan
          setTimeout(() => {
            modelEvents.emit('local-model-downloaded');
            useDownloadStore.getState().removeDownload(filename);
          }, 1000);
        } else if (data.error) {
          if (data.cancelled) {
            toast.success('Download cancelled');
          } else if (data.errorType === '401') {
            // Don't show toast for 401 - will be shown in UI
          } else if (data.errorType === '403') {
            // Don't show toast for 403 - will be shown in UI
          } else {
            toast.error(`Download failed: ${data.error}`);
          }
          activeDownloads.delete(filename);
          unsubscribe();
          // Don't auto-remove downloads with 401/403 errors so the error persists in UI
          if (data.errorType !== '401' && data.errorType !== '403') {
            setTimeout(
              () => useDownloadStore.getState().removeDownload(filename),
              1000
            );
          }
        }
      }
    }
  );
}
