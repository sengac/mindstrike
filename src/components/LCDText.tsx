import { LCDCanvas } from './LCDCanvas';
import { type LCDSize } from '../constants/lcd-common';

interface LCDTextProps {
  text: string;
  size?: LCDSize;
  className?: string;
  maxWidth?: number; // Maximum number of characters to display before scrolling
  showFullGrid?: boolean; // Show background grid of all possible dots
}

export function LCDText({
  text,
  size = 'medium',
  className = '',
  maxWidth,
  showFullGrid = false,
}: LCDTextProps) {
  return (
    <LCDCanvas
      text={text}
      size={size}
      className={className}
      maxWidth={maxWidth}
      showFullGrid={showFullGrid}
      mode="text"
    />
  );
}
