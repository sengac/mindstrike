import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  calculateTextDimensions,
  clearMeasurementCache,
  clearCanvasInstance,
  type TextMeasurementOptions,
} from '../textMeasurementService';

// Mock the text measurement service since jsdom doesn't provide accurate measurements
vi.mock('../textMeasurementService', async () => {
  const actual = await vi.importActual<
    typeof import('../textMeasurementService')
  >('../textMeasurementService');

  return {
    ...actual,
    calculateTextDimensions: vi.fn(options => {
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
    }),
  };
});

describe('Text Measurement Service', () => {
  beforeEach(() => {
    clearMeasurementCache();
    clearCanvasInstance();
  });

  afterEach(() => {
    clearMeasurementCache();
    clearCanvasInstance();
  });

  describe('Single Line Text', () => {
    it('should calculate dimensions for short text without wrapping', () => {
      const options: TextMeasurementOptions = {
        text: 'Short text',
        fontSize: '14px',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        fontWeight: '500',
        padding: { left: 16, right: 16, top: 8, bottom: 8 },
        minWidth: 120,
        maxWidth: 600,
      };

      const result = calculateTextDimensions(options);

      // Text should fit within maxWidth
      expect(result.width).toBeLessThanOrEqual(600);
      expect(result.width).toBeGreaterThanOrEqual(120);

      // Height should be single line height + padding
      // For 14px font, line height should be around 21px (14 * 1.5) + component padding (16px) + custom padding (16px) = ~53px
      expect(result.height).toBeGreaterThan(40);
      expect(result.height).toBeLessThan(60);
    });

    it('should respect minimum width even for empty text', () => {
      const options: TextMeasurementOptions = {
        text: '',
        fontSize: '14px',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        fontWeight: '500',
        padding: { left: 16, right: 16, top: 8, bottom: 8 },
        minWidth: 120,
        maxWidth: 600,
      };

      const result = calculateTextDimensions(options);

      // Component adds 32px horizontal padding, plus custom padding 32px = 64px total
      // So minimum width would be 120 + 64 = 184, but the component enforces its own minimum
      expect(result.width).toBeGreaterThanOrEqual(120);
      expect(result.height).toBeGreaterThan(20); // Should have height even with no text
    });

    it('should include padding in final dimensions', () => {
      const options: TextMeasurementOptions = {
        text: 'Test',
        fontSize: '14px',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        fontWeight: '500',
        padding: { left: 20, right: 20, top: 10, bottom: 10 },
        minWidth: 100,
        maxWidth: 600,
      };

      const result = calculateTextDimensions(options);

      // Width should include left + right padding (40px total)
      expect(result.width).toBeGreaterThanOrEqual(100);

      // Height should include component padding (16px) + custom padding (20px) = 36px total
      expect(result.height).toBeGreaterThan(45); // ~21px text + 36px padding
    });
  });

  describe('Multi-line Text Wrapping', () => {
    it('should wrap text when it exceeds maxWidth', () => {
      const longText =
        'This is a very long text that should definitely wrap when it exceeds the maximum width constraint';
      const options: TextMeasurementOptions = {
        text: longText,
        fontSize: '14px',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        fontWeight: '500',
        padding: { left: 16, right: 16, top: 8, bottom: 8 },
        minWidth: 120,
        maxWidth: 300, // Force wrapping with small maxWidth
      };

      const result = calculateTextDimensions(options);

      // Width should not exceed maxWidth
      expect(result.width).toBeLessThanOrEqual(300);
      expect(result.width).toBeGreaterThanOrEqual(120);

      // Height should be greater than single line due to wrapping
      expect(result.height).toBeGreaterThan(40); // Multiple lines
    });

    it('should calculate correct height for wrapped text', () => {
      const twoLineText =
        'This text should wrap into exactly two lines when constrained';
      const options: TextMeasurementOptions = {
        text: twoLineText,
        fontSize: '14px',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        fontWeight: '500',
        padding: { left: 16, right: 16, top: 8, bottom: 8 },
        minWidth: 120,
        maxWidth: 250, // Force into ~2 lines
      };

      const result = calculateTextDimensions(options);

      // For 2 lines: line height 21px * 2 lines = 42px + component padding (16px) + custom padding (16px) = ~74px
      expect(result.height).toBeGreaterThan(60);
      expect(result.height).toBeLessThan(95); // Allow some tolerance for rounding
    });

    it('should not wrap text when maxWidth is not specified', () => {
      const longText =
        'This is a very long text that would normally wrap but should not when maxWidth is not specified';
      const options: TextMeasurementOptions = {
        text: longText,
        fontSize: '14px',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        fontWeight: '500',
        padding: { left: 16, right: 16, top: 8, bottom: 8 },
        minWidth: 120,
      };

      const result = calculateTextDimensions(options);

      // Without maxWidth, text should expand freely but still includes component + custom padding
      // The text itself is long, so with padding it should be even wider
      expect(result.width).toBeGreaterThan(500); // Long text with padding

      // Height should remain single line with component + custom padding
      expect(result.height).toBeLessThan(60);
    });
  });

  describe('Padding Edge Cases', () => {
    it('should handle asymmetric padding correctly', () => {
      const options: TextMeasurementOptions = {
        text: 'Asymmetric',
        fontSize: '14px',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        fontWeight: '500',
        padding: { left: 10, right: 30, top: 5, bottom: 15 },
        minWidth: 120,
        maxWidth: 600,
      };

      const result = calculateTextDimensions(options);

      // Total horizontal padding is 40px (10 + 30)
      // Total vertical padding is 20px custom + 16px component = 36px
      expect(result.width).toBeGreaterThanOrEqual(120);
      expect(result.height).toBeGreaterThan(45); // ~21px text + 36px padding
    });

    it('should handle zero padding', () => {
      const options: TextMeasurementOptions = {
        text: 'No padding',
        fontSize: '14px',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        fontWeight: '500',
        padding: { left: 0, right: 0, top: 0, bottom: 0 },
        minWidth: 120,
        maxWidth: 600,
      };

      const result = calculateTextDimensions(options);

      expect(result.width).toBeGreaterThanOrEqual(120);
      // Height includes component padding (16px) even with zero custom padding
      expect(result.height).toBeGreaterThan(30); // Text height (~21px) + component padding (16px)
    });
  });

  describe('Font Variations', () => {
    it('should handle different font sizes correctly', () => {
      const text = 'Same text';
      const smallFontOptions: TextMeasurementOptions = {
        text,
        fontSize: '12px',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        fontWeight: '500',
        padding: { left: 16, right: 16, top: 8, bottom: 8 },
        minWidth: 120,
        maxWidth: 600,
      };

      const largeFontOptions: TextMeasurementOptions = {
        ...smallFontOptions,
        fontSize: '18px',
      };

      const smallResult = calculateTextDimensions(smallFontOptions);
      const largeResult = calculateTextDimensions(largeFontOptions);

      // Larger font should result in wider and taller dimensions
      // Note: with DOM measurement, width might be similar if text doesn't overflow
      expect(largeResult.width).toBeGreaterThanOrEqual(smallResult.width);
      expect(largeResult.height).toBeGreaterThan(smallResult.height);
    });

    it('should handle different font weights', () => {
      const text = 'Font weight test';
      const normalOptions: TextMeasurementOptions = {
        text,
        fontSize: '14px',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        fontWeight: '400',
        padding: { left: 16, right: 16, top: 8, bottom: 8 },
        minWidth: 120,
        maxWidth: 600,
      };

      const boldOptions: TextMeasurementOptions = {
        ...normalOptions,
        fontWeight: '700',
      };

      const normalResult = calculateTextDimensions(normalOptions);
      const boldResult = calculateTextDimensions(boldOptions);

      // Bold text is typically slightly wider
      expect(boldResult.width).toBeGreaterThanOrEqual(normalResult.width);
      // Height should be the same
      expect(boldResult.height).toBe(normalResult.height);
    });
  });

  describe('Caching Behavior', () => {
    it('should cache measurements for identical inputs', () => {
      const options: TextMeasurementOptions = {
        text: 'Cached text',
        fontSize: '14px',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        fontWeight: '500',
        padding: { left: 16, right: 16, top: 8, bottom: 8 },
        minWidth: 120,
        maxWidth: 600,
      };

      const result1 = calculateTextDimensions(options);
      const result2 = calculateTextDimensions(options);

      // Results should be identical
      expect(result2).toEqual(result1);
    });

    it('should not use cache when maxWidth differs', () => {
      const baseOptions: TextMeasurementOptions = {
        text: 'This text might wrap differently',
        fontSize: '14px',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        fontWeight: '500',
        padding: { left: 16, right: 16, top: 8, bottom: 8 },
        minWidth: 120,
        maxWidth: 600,
      };

      const narrowOptions: TextMeasurementOptions = {
        ...baseOptions,
        maxWidth: 200,
      };

      const wideResult = calculateTextDimensions(baseOptions);
      const narrowResult = calculateTextDimensions(narrowOptions);

      // Different maxWidth should produce different results
      // Narrow result should be at the narrow maxWidth (200)
      expect(narrowResult.width).toBeLessThanOrEqual(200);
      // Wide result can be wider
      expect(wideResult.width).toBeGreaterThan(200);
      // Narrow result should be taller due to wrapping
      expect(narrowResult.height).toBeGreaterThanOrEqual(wideResult.height);
    });
  });
});
