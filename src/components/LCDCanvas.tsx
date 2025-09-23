import { useEffect, useRef, useState, useMemo } from 'react';
import { LCD_FONT_DATA } from '../constants/lcd-font-data';
import {
  LCD_SIZES,
  LCD_COLORS,
  LCD_TIMING,
  type LCDSize,
} from '../constants/lcd-common';

interface LCDLine {
  text: string;
  position?: number; // Optional position to place text at specific character column
}

interface LCDCanvasProps {
  text?: string; // For backward compatibility
  lines?: (string | LCDLine | LCDLine[])[]; // Array of lines with optional positioning, or multiple segments per line
  width?: number; // Number of characters wide (for grid mode) OR pixel width for dynamic sizing
  height?: number; // Number of character rows high (for grid mode) OR pixel height for dynamic sizing
  size?: LCDSize;
  className?: string;
  maxWidth?: number; // Maximum number of characters to display before scrolling
  showFullGrid?: boolean; // Show background grid of all possible dots
  mode?: 'text' | 'display'; // 'text' for LCDText behavior, 'display' for LCDDisplay behavior
  dynamicSize?: boolean; // Whether to calculate character grid from pixel dimensions
  onDimensionsChange?: (charCols: number, charRows: number) => void; // Callback for when calculated dimensions change
}

export function LCDCanvas({
  text,
  lines,
  width,
  height = 1,
  size = 'medium',
  className = '',
  maxWidth,
  showFullGrid = false,
  mode = 'text',
  dynamicSize = false,
  onDimensionsChange,
}: LCDCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollOffsetRef = useRef<number>(0);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const { dotSize, charSpacing } = LCD_SIZES[size];

  // Process lines or text into consistent format
  const processedLines = useMemo(() => {
    if (lines) {
      return lines.map(line => {
        if (typeof line === 'string') {
          return [{ text: line, position: 0 }];
        }
        if (Array.isArray(line)) {
          return line;
        }
        return [line];
      });
    }
    if (text) {
      return text.split('\n').map(line => [{ text: line, position: 0 }]);
    }
    return [];
  }, [lines, text]);

  const actualWidth = useMemo(
    () => (dynamicSize ? containerSize.width || width : width),
    [dynamicSize, containerSize.width, width]
  );
  const actualHeight = useMemo(
    () => (dynamicSize ? containerSize.height || height : height),
    [dynamicSize, containerSize.height, height]
  );

  const charCols = useMemo(() => {
    if (dynamicSize && actualWidth) {
      const charWidth = 5 * dotSize + charSpacing;
      return Math.floor(actualWidth / charWidth);
    }
    const longestLine =
      processedLines.length > 0
        ? Math.max(
            ...processedLines.map(line =>
              line.reduce((total, segment) => total + segment.text.length, 0)
            )
          )
        : 0;
    return mode === 'display' ? width! : maxWidth || longestLine;
  }, [
    dynamicSize,
    actualWidth,
    dotSize,
    charSpacing,
    mode,
    width,
    maxWidth,
    processedLines,
  ]);

  const charRows = useMemo(() => {
    if (dynamicSize && actualHeight) {
      const charHeight = 8 * dotSize + charSpacing;
      return Math.floor(actualHeight / charHeight);
    }
    return height;
  }, [dynamicSize, actualHeight, dotSize, charSpacing, height]);

  const lineScrollInfo = useMemo(
    () =>
      processedLines.map(line => {
        const totalLength = line.reduce(
          (total, segment) => total + segment.text.length,
          0
        );
        const needsScroll =
          mode === 'display'
            ? charCols && totalLength > charCols
            : maxWidth && totalLength > maxWidth;
        return {
          needsScroll,
          totalLength,
          displayText: line.map(segment =>
            needsScroll ? segment.text + '    ' : segment.text
          ),
        };
      }),
    [mode, charCols, processedLines, maxWidth]
  );

  const needsScrolling = useMemo(
    () => lineScrollInfo.some(info => info.needsScroll),
    [lineScrollInfo]
  );

  // Call onDimensionsChange when dimensions change
  useEffect(() => {
    if (onDimensionsChange && charCols && charRows) {
      onDimensionsChange(charCols, charRows);
    }
  }, [charCols, charRows, onDimensionsChange]);
  const effectiveWidth = useMemo(() => charCols, [charCols]);
  const canvasWidth = useMemo(
    () =>
      dynamicSize
        ? actualWidth!
        : effectiveWidth * (5 * dotSize + charSpacing) + charSpacing,
    [dynamicSize, actualWidth, effectiveWidth, dotSize, charSpacing]
  );
  const canvasHeight = useMemo(
    () =>
      dynamicSize
        ? actualHeight
        : charRows * 8 * dotSize + (charRows - 1) * charSpacing,
    [dynamicSize, actualHeight, charRows, dotSize, charSpacing]
  );

  // Calculate centering offsets for dynamic sizing
  const centerOffsetX = useMemo(() => {
    if (!dynamicSize) {
      return 0;
    }
    const usedWidth = charCols * (5 * dotSize + charSpacing) - charSpacing;
    return Math.max(0, (canvasWidth - usedWidth) / 2);
  }, [dynamicSize, charCols, dotSize, charSpacing, canvasWidth]);

  const centerOffsetY = useMemo(() => {
    if (!dynamicSize) {
      return 0;
    }
    const usedHeight = charRows * (8 * dotSize + charSpacing) - charSpacing;
    return Math.max(0, (canvasHeight - usedHeight) / 2);
  }, [dynamicSize, charRows, dotSize, charSpacing, canvasHeight]);

  // Get positioned text segments for a line with scrolling applied
  const getPositionedSegments = (lineIndex: number) => {
    if (lineIndex >= processedLines.length) {
      return [];
    }

    const lineSegments = processedLines[lineIndex];
    if (!lineSegments) {
      return [];
    }

    const scrollInfo = lineScrollInfo[lineIndex];
    if (!scrollInfo?.needsScroll) {
      return lineSegments;
    }

    // Apply scrolling to this line
    const combinedText = scrollInfo.displayText.join('');
    let visibleText = '';
    for (let i = 0; i < effectiveWidth; i++) {
      const charIndex = (scrollOffsetRef.current + i) % combinedText.length;
      visibleText += combinedText[charIndex];
    }

    // Return as single segment at position 0
    return [{ text: visibleText, position: 0 }];
  };

  // Render function
  const render = () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    // Clear canvas completely
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Set background
    ctx.fillStyle = 'transparent';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Reset shadow
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';

    // Render each line
    for (let lineIndex = 0; lineIndex < charRows; lineIndex++) {
      const lineY = centerOffsetY + lineIndex * (8 * dotSize + charSpacing);

      // Always render background grid first if showFullGrid is true
      if (showFullGrid) {
        for (let charIndex = 0; charIndex < effectiveWidth; charIndex++) {
          const charX = centerOffsetX + charIndex * (5 * dotSize + charSpacing);
          const pattern = LCD_FONT_DATA[' '];

          // Render each row of the character
          for (let rowIndex = 0; rowIndex < 8; rowIndex++) {
            const row = pattern[rowIndex] || 0;
            const rowY = lineY + rowIndex * dotSize;

            // Render each dot in the row
            for (let bitIndex = 0; bitIndex < 5; bitIndex++) {
              const isLit = (row >> (4 - bitIndex)) & 1;
              const dotX = charX + bitIndex * dotSize;

              if (!isLit) {
                // Unlit dot with grid
                ctx.fillStyle = LCD_COLORS.unlitGrid;
                ctx.fillRect(dotX, rowY, dotSize - 1, dotSize - 1);
              }
            }
          }
        }
      }

      // Only render text segments if this line has content
      if (lineIndex < processedLines.length) {
        const segments = getPositionedSegments(lineIndex);

        // Render each segment
        for (const segment of segments) {
          const startPos = Math.min(segment.position || 0, effectiveWidth - 1);

          for (
            let charIndex = 0;
            charIndex < segment.text.length &&
            startPos + charIndex < effectiveWidth;
            charIndex++
          ) {
            const char = segment.text[charIndex] || ' ';
            const pattern =
              LCD_FONT_DATA[char.toUpperCase()] || LCD_FONT_DATA[' '];
            const charX =
              centerOffsetX +
              (startPos + charIndex) * (5 * dotSize + charSpacing);

            // Render each row of the character
            for (let rowIndex = 0; rowIndex < 8; rowIndex++) {
              const row = pattern[rowIndex] || 0;
              const rowY = lineY + rowIndex * dotSize;

              // Render each dot in the row
              for (let bitIndex = 0; bitIndex < 5; bitIndex++) {
                const isLit = (row >> (4 - bitIndex)) & 1;
                const dotX = charX + bitIndex * dotSize;

                if (isLit) {
                  // Lit dot
                  ctx.fillStyle = LCD_COLORS.lit;
                  ctx.fillRect(dotX, rowY, dotSize - 1, dotSize - 1);
                }
                // Don't render background here - it's already rendered above
              }
            }
          }
        }
      }
    }
  };

  // Render effect - render when content changes
  useEffect(() => {
    render();
  }, [lineScrollInfo, charCols, charRows, centerOffsetX, centerOffsetY]);

  // Animation loop - simple setInterval every 500ms
  useEffect(() => {
    if (!needsScrolling) {
      return;
    }

    const interval = setInterval(() => {
      // Calculate max length inside the interval to avoid dependency issues
      const maxLength = Math.max(
        ...processedLines.map(line => {
          const totalLength = line.reduce(
            (total, segment) => total + segment.text.length,
            0
          );
          const hasScrollableContent =
            mode === 'display'
              ? charCols && totalLength > charCols
              : maxWidth && totalLength > maxWidth;
          return hasScrollableContent ? totalLength + 4 : 0;
        })
      );

      if (maxLength > 0) {
        scrollOffsetRef.current = (scrollOffsetRef.current + 1) % maxLength;
        render(); // Re-render canvas directly
      }
    }, LCD_TIMING.scrollInterval);

    return () => {
      clearInterval(interval);
    };
  }, [needsScrolling]); // Only depend on needsScrolling

  // Measure container size for dynamic sizing
  useEffect(() => {
    if (!dynamicSize || !containerRef.current) {
      return;
    }

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize({ width, height });
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, [dynamicSize]);

  // Render when content changes (removed scrollOffset dependency)
  useEffect(() => {
    render();
  }, [text, showFullGrid, effectiveWidth, charRows, containerSize]);

  return (
    <div
      ref={containerRef}
      className={dynamicSize ? 'w-full h-full' : ''}
      style={dynamicSize ? { height: '100%' } : {}}
    >
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        className={className}
        style={{
          display: 'block',
          backgroundColor: 'transparent',
          maxWidth: '100%',
          maxHeight: '100%',
        }}
      />
    </div>
  );
}
