import { LCDCanvas } from './LCDCanvas';
import { type LCDSize } from '../constants/lcdCommon';

interface LCDLine {
  text: string;
  position?: number; // Optional position to place text at specific character column
}

interface LCDDisplayProps {
  text?: string; // For backward compatibility
  lines?: (string | LCDLine | LCDLine[])[]; // Array of lines with optional positioning, or multiple segments per line
  width: number; // Number of characters wide OR pixel width for dynamic sizing
  height: number; // Number of character rows high OR pixel height for dynamic sizing
  size?: LCDSize;
  className?: string;
  dynamicSize?: boolean; // Whether to calculate character grid from pixel dimensions
  onDimensionsChange?: (charCols: number, charRows: number) => void; // Callback for when calculated dimensions change
}

export function LCDDisplay({
  text,
  lines,
  width,
  height,
  size = 'medium',
  className = '',
  dynamicSize = false,
  onDimensionsChange,
}: LCDDisplayProps) {
  return (
    <LCDCanvas
      text={text}
      lines={lines}
      width={width}
      height={height}
      size={size}
      className={className}
      showFullGrid={true}
      mode="display"
      dynamicSize={dynamicSize}
      onDimensionsChange={onDimensionsChange}
    />
  );
}
