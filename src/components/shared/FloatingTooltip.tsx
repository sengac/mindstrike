import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface FloatingTooltipProps {
  /** Content to display in the tooltip */
  children: React.ReactNode;
  /** Reference to the target element that triggers the tooltip */
  targetRef: React.RefObject<HTMLElement | SVGElement>;
  /** Whether the tooltip is currently visible */
  isVisible: boolean;
  /** Optional custom className for the tooltip container */
  className?: string;
  /** Preferred placement of the tooltip relative to the target */
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  /** Offset from the target element in pixels */
  offset?: number;
}

/**
 * FloatingTooltip - A tooltip component that uses React Portal to render at the document body level
 * This ensures the tooltip is not constrained by parent containers and appears above all other content
 */
export function FloatingTooltip({
  children,
  targetRef,
  isVisible,
  className = '',
  placement = 'auto',
  offset = 8,
}: FloatingTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!isVisible || !targetRef.current || !tooltipRef.current) {
      return;
    }

    const updatePosition = () => {
      if (!targetRef.current || !tooltipRef.current) {
        return;
      }

      const targetRect = targetRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();

      let top = 0;
      let left = 0;

      // Calculate position based on placement
      switch (placement) {
        case 'top':
          top = targetRect.top - tooltipRect.height - offset;
          left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
          break;
        case 'bottom':
          top = targetRect.bottom + offset;
          left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
          break;
        case 'left':
          top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
          left = targetRect.left - tooltipRect.width - offset;
          break;
        case 'right':
          top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
          left = targetRect.right + offset;
          break;
        case 'auto':
        default:
          // Auto placement - try top first, then bottom if no space
          top = targetRect.top - tooltipRect.height - offset;
          left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;

          // If tooltip would go off the top of the screen, position below
          if (top < 10) {
            top = targetRect.bottom + offset;
          }
          break;
      }

      // Keep tooltip within viewport bounds
      const padding = 10;
      if (left < padding) {
        left = padding;
      } else if (left + tooltipRect.width > window.innerWidth - padding) {
        left = window.innerWidth - tooltipRect.width - padding;
      }

      if (top < padding) {
        top = padding;
      } else if (top + tooltipRect.height > window.innerHeight - padding) {
        top = window.innerHeight - tooltipRect.height - padding;
      }

      setPosition({ top, left });
    };

    // Initial position calculation
    updatePosition();

    // Update position on scroll or resize
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isVisible, targetRef, placement, offset]);

  if (!isVisible) {
    return null;
  }

  return createPortal(
    <div
      ref={tooltipRef}
      className="fixed z-[99999] pointer-events-none"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
      data-testid="floating-tooltip"
    >
      <div
        className={`bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-3 pointer-events-auto ${className}`}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
