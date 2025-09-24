import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { logger } from '../utils/logger';

interface VramState {
  total: number; // bytes
  used: number; // bytes
  free: number; // bytes
}

interface SystemInformation {
  hasGpu: boolean;
  gpuType: string | null;
  vramState: VramState | null;
  totalRAM: number; // bytes
  freeRAM: number; // bytes
  cpuThreads: number;
  diskSpace: {
    total: number; // bytes
    free: number; // bytes
    used: number; // bytes
  };
  lastUpdated: number;
}

interface SystemInformationStore {
  systemInfo: SystemInformation;
  isLoading: boolean;
  pollingInterval: NodeJS.Timeout | null;
  updateSystemInfo: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
  initialize: () => Promise<void>;
}

const initialSystemInfo: SystemInformation = {
  hasGpu: false,
  gpuType: null,
  vramState: null,
  totalRAM: 0,
  freeRAM: 0,
  cpuThreads: 1,
  diskSpace: {
    total: 0,
    free: 0,
    used: 0,
  },
  lastUpdated: 0,
};

export const useSystemInformationStore = create<SystemInformationStore>()(
  persist(
    (set, get) => ({
      systemInfo: initialSystemInfo,
      isLoading: false,
      pollingInterval: null,

      updateSystemInfo: async () => {
        set({ isLoading: true });
        try {
          const response = await fetch('/api/system/info');
          if (response.ok) {
            const systemInfo = await response.json();
            set({
              systemInfo: {
                ...systemInfo,
                lastUpdated: Date.now(),
              },
              isLoading: false,
            });
          }
        } catch (error) {
          logger.error('Failed to update system information:', error);
          set({ isLoading: false });
        }
      },

      startPolling: () => {
        const { pollingInterval } = get();
        if (pollingInterval) {
          clearInterval(pollingInterval);
        }

        const newInterval = setInterval(() => {
          get().updateSystemInfo();
        }, 15000); // 15 seconds

        set({ pollingInterval: newInterval });
      },

      stopPolling: () => {
        const { pollingInterval } = get();
        if (pollingInterval) {
          clearInterval(pollingInterval);
          set({ pollingInterval: null });
        }
      },

      initialize: async () => {
        await get().updateSystemInfo();
        get().startPolling();
      },
    }),
    {
      name: 'system-information-store',
      partialize: state => ({
        systemInfo: state.systemInfo,
      }),
    }
  )
);
