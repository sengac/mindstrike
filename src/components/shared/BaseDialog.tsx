import { ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface BaseDialogProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  overlayClassName?: string;
  closeOnOverlayClick?: boolean;
  maxWidth?: string;
  fullScreen?: boolean;
  isVisible?: boolean;
}

export function BaseDialog({
  isOpen,
  onClose,
  children,
  className = '',
  overlayClassName = '',
  closeOnOverlayClick = true,
  maxWidth = 'max-w-md',
  fullScreen = false,
  isVisible = true,
}: BaseDialogProps) {
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && closeOnOverlayClick) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className={`
        fixed inset-0 z-[9999] 
        ${fullScreen ? '' : 'bg-black flex items-center justify-center'}
        ${fullScreen ? '' : 'transition-opacity duration-250 ease-out'}
        ${fullScreen ? '' : isVisible ? 'bg-opacity-50' : 'bg-opacity-0'}
        ${overlayClassName}
      `}
      onClick={fullScreen ? undefined : handleOverlayClick}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`
          ${
            fullScreen
              ? 'w-full h-full'
              : `bg-dark-surface border border-dark-border rounded-lg ${maxWidth} w-full mx-4`
          }
          transition-all duration-250 ease-out
          ${isVisible ? 'scale-100 opacity-100' : 'scale-75 opacity-0'}
          ${className}
        `}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
