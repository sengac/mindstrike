// Electron detection and utilities
export const isElectron = (): boolean => {
  return window.electronAPI !== undefined;
};

// Extend interfaces for TypeScript
declare global {
  interface Window {
    electronAPI?: {
      minimizeWindow?: () => void;
      maximizeWindow?: () => void;
      closeWindow?: () => void;
    };
  }
}
