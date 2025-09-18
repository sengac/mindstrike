import React from 'react';
import { Minus, Square, X } from 'lucide-react';

interface WindowControlsProps {
  className?: string;
}

export const WindowControls: React.FC<WindowControlsProps> = ({
  className = '',
}) => {
  const isElectron = window.electronAPI !== undefined;
  const isMac = navigator.userAgent.includes('Mac');

  if (!isElectron || isMac) {
    return null;
  }

  const handleMinimize = () => {
    window.electronAPI?.minimizeWindow?.();
  };

  const handleMaximize = () => {
    window.electronAPI?.maximizeWindow?.();
  };

  const handleClose = () => {
    window.electronAPI?.closeWindow?.();
  };

  return (
    <div className={`flex items-center ${className}`}>
      <button
        onClick={handleMinimize}
        className="w-12 h-8 flex items-center justify-center hover:bg-gray-600 transition-colors text-gray-300 hover:text-white"
        title="Minimize"
      >
        <Minus size={14} />
      </button>
      <button
        onClick={handleMaximize}
        className="w-12 h-8 flex items-center justify-center hover:bg-gray-600 transition-colors text-gray-300 hover:text-white"
        title="Maximize"
      >
        <Square size={12} />
      </button>
      <button
        onClick={handleClose}
        className="w-12 h-8 flex items-center justify-center hover:bg-red-600 transition-colors text-gray-300 hover:text-white"
        title="Close"
      >
        <X size={14} />
      </button>
    </div>
  );
};
