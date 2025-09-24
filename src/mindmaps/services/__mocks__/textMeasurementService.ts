import { vi } from 'vitest';

export interface TextMetrics {
  width: number;
  height: number;
}

export interface TextMeasurementOptions {
  text: string;
  fontSize: string;
  fontFamily: string;
  fontWeight: string;
  padding: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
  minWidth: number;
  maxWidth?: number;
}

// Default mock implementation
export const calculateTextDimensions = vi.fn(
  (options: TextMeasurementOptions): TextMetrics => {
    const { text, fontSize, padding, minWidth, maxWidth } = options;

    // Simple mock calculation
    let textWidth = text.length * 8; // 8px per character

    // Handle font size differences
    const fontSizeNum = parseInt(fontSize, 10) || 14;
    const lineHeight = fontSizeNum * 1.5;
    const singleLineHeight = fontSizeNum * 1.2;

    let finalHeight = singleLineHeight;

    // Component has built-in padding px-4 py-2 (32px horizontal, 16px vertical)
    const componentPaddingH = 32;
    const componentPaddingV = 16;

    // If maxWidth is specified and text exceeds available width, calculate wrapped dimensions
    const availableWidth = maxWidth
      ? maxWidth - componentPaddingH - padding.left - padding.right
      : Infinity;

    if (maxWidth && textWidth > availableWidth) {
      const avgCharWidth = 8;
      const charsPerLine = Math.floor(availableWidth / avgCharWidth);
      const lines = Math.ceil(text.length / charsPerLine);

      textWidth = Math.min(textWidth, availableWidth);
      finalHeight = singleLineHeight + (lines - 1) * lineHeight;
    }

    return {
      width: Math.max(
        textWidth + componentPaddingH + padding.left + padding.right,
        minWidth
      ),
      height: finalHeight + componentPaddingV + padding.top + padding.bottom,
    };
  }
);

export const clearMeasurementCache = vi.fn();
export const clearCanvasInstance = vi.fn();
export const getCacheSize = vi.fn(() => 0);
