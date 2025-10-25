import React, { useState, useEffect } from 'react';

interface ScrollModeOverlayProps {
  isPanMode: boolean;
  panModifierKey: string;
  isScrolling: boolean;
}

export const ScrollModeOverlay: React.FC<ScrollModeOverlayProps> = ({
  isPanMode,
  panModifierKey,
  isScrolling,
}) => {
  const [isInteracting, setIsInteracting] = useState(false);

  useEffect(() => {
    if (isPanMode || isScrolling) {
      setIsInteracting(true);
    } else {
      // Fade back to semi-transparent after interaction ends
      const timer = setTimeout(() => setIsInteracting(false), 500);
      return () => clearTimeout(timer);
    }
  }, [isPanMode, isScrolling]);

  const opacity = isInteracting ? '1' : '0.5';

  return (
    <div
      data-testid="scroll-mode-overlay"
      className="absolute bottom-4 left-4 bg-slate-800 dark:bg-slate-900 text-white px-4 py-2 rounded-lg shadow-lg transition-opacity duration-200 z-[1000] pointer-events-none"
      style={{ opacity }}
    >
      {isPanMode ? (
        <span className="text-sm font-medium">Pan Mode</span>
      ) : (
        <span className="text-sm font-medium">
          Zoom Mode (hold {panModifierKey} for Pan Mode)
        </span>
      )}
    </div>
  );
};
