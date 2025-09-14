import { useState, useEffect, useCallback } from 'react';

export function useDialogAnimation(isOpen: boolean, onClose: () => void, duration = 250) {
  const [isVisible, setIsVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      // Small delay to ensure DOM is updated before showing animation
      const timer = setTimeout(() => setIsVisible(true), 10);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    // Wait for animation to complete, then actually close
    setTimeout(() => {
      setShouldRender(false);
      onClose();
    }, duration);
  }, [onClose, duration]);

  return {
    shouldRender,
    isVisible,
    handleClose
  };
}
