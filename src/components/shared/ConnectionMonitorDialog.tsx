import { useEffect, useState } from 'react';
import { BaseDialog } from './BaseDialog';
import { useDialogAnimation } from '../../hooks/useDialogAnimation';
import { useConnectionMonitor } from '../../hooks/useConnectionMonitor';

interface ConnectionMonitorDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ConnectionMonitorDialog({ isOpen, onClose }: ConnectionMonitorDialogProps) {
  const { shouldRender, isVisible, handleClose } = useDialogAnimation(isOpen, onClose);
  const { isConnected } = useConnectionMonitor();

  // Auto-close when connection is restored
  useEffect(() => {
    if (isConnected && isOpen) {
      handleClose();
    }
  }, [isConnected, isOpen, handleClose]);

  if (!shouldRender) return null;

  return (
    <BaseDialog
      isOpen={shouldRender}
      onClose={handleClose}
      isVisible={isVisible}
      closeOnOverlayClick={false}
      maxWidth="max-w-sm"
    >
      <div className="p-6 text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-yellow-500/20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
        
        <h2 className="text-lg font-semibold text-white mb-2">
          Connection Lost
        </h2>
        
        <p className="text-gray-300 text-sm mb-4">
          Unable to connect to the server. Please check your connection and wait while we attempt to reconnect.
        </p>
        
        <div className="flex items-center justify-center text-gray-400 text-xs">
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse mr-2"></div>
          Reconnecting...
        </div>
      </div>
    </BaseDialog>
  );
}
