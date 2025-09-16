import { create } from 'zustand';
import toast from 'react-hot-toast';
import { modelEvents } from '../utils/modelEvents';

interface DownloadProgress {
  progress: number;
  speed?: string;
  isDownloading: boolean;
  errorType?: string;
  errorMessage?: string;
  huggingFaceUrl?: string;
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

const connections = new Map<string, EventSource>();

export function startDownloadTracking(filename: string) {
  if (connections.has(filename)) return;

  const eventSource = new EventSource(
    `/api/local-llm/download-progress-stream/${filename}`
  );
  connections.set(filename, eventSource);

  eventSource.onmessage = event => {
    const data = JSON.parse(event.data);
    useDownloadStore.getState().addDownload(filename, data);

    if (data.completed) {
      toast.success('Download completed successfully');
      eventSource.close();
      connections.delete(filename);

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
      eventSource.close();
      connections.delete(filename);
      // Don't auto-remove downloads with 401/403 errors so the error persists in UI
      if (data.errorType !== '401' && data.errorType !== '403') {
        setTimeout(
          () => useDownloadStore.getState().removeDownload(filename),
          1000
        );
      }
    }
  };

  eventSource.onerror = () => {
    eventSource.close();
    connections.delete(filename);
  };
}
