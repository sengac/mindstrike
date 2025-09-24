/**
 * Text measurement service for calculating text dimensions
 * Uses actual DOM rendering for accurate text measurement
 */

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

// Cache for text measurements to improve performance
const measurementCache = new Map<string, TextMetrics>();

// Offscreen measurement container
let measurementContainer: HTMLDivElement | null = null;
let measurementElement: HTMLDivElement | null = null;

/**
 * Get or create an offscreen DOM element for text measurement
 */
function getMeasurementElement(): HTMLDivElement {
  // In test environment, DOM might not be fully available
  if (typeof document === 'undefined') {
    throw new Error('Document is not available for text measurement');
  }

  if (!measurementContainer) {
    // Create container that's positioned off-screen
    measurementContainer = document.createElement('div');
    measurementContainer.style.cssText = `
      position: absolute;
      visibility: hidden;
      height: auto;
      width: auto;
      white-space: nowrap;
      pointer-events: none;
      left: -9999px;
      top: -9999px;
    `;

    // Create the actual measurement element
    measurementElement = document.createElement('div');
    // NO TAILWIND CLASSES - use pure CSS instead
    measurementContainer.appendChild(measurementElement);

    // Append to body
    document.body.appendChild(measurementContainer);
  }

  return measurementElement!;
}

/**
 * Calculate text dimensions using actual DOM rendering
 * @param options - Text measurement options
 * @returns Text dimensions including padding
 */
export function calculateTextDimensions(
  options: TextMeasurementOptions
): TextMetrics {
  const {
    text,
    fontSize,
    fontFamily,
    fontWeight,
    padding,
    minWidth,
    maxWidth,
  } = options;

  // Create cache key including all relevant parameters
  const cacheKey = `${text}|${fontSize}|${fontFamily}|${fontWeight}|${maxWidth || 'none'}|${padding.left},${padding.right},${padding.top},${padding.bottom}|${minWidth}`;

  // Check cache first
  const cached = measurementCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const element = getMeasurementElement();

  // Apply exact styles to match the actual node rendering
  // Use pure CSS values, NO TAILWIND CLASSES
  element.style.cssText = `
    font-size: ${fontSize};
    font-family: ${fontFamily};
    font-weight: ${fontWeight};
    line-height: 1.5;
    padding: 0;
    margin: 0;
    border: 0;
    white-space: nowrap;
    display: inline-block;
    box-sizing: border-box;
  `;

  // Handle empty text
  if (!text || text.length === 0) {
    element.textContent = '\u00A0'; // Non-breaking space for height calculation
    const rect = element.getBoundingClientRect();
    // Component has built-in padding
    const componentPaddingH = 32;
    const componentPaddingV = 16;
    const result = {
      width: Math.max(
        minWidth,
        rect.width + componentPaddingH + padding.left + padding.right
      ),
      height: rect.height + componentPaddingV + padding.top + padding.bottom,
    };
    measurementCache.set(cacheKey, result);
    return result;
  }

  // Set text content
  element.textContent = text;

  // Component has 8px 16px padding built-in via inline styles
  const componentPaddingH = 32; // 16px * 2
  const componentPaddingV = 16; // 8px * 2

  // First measure without wrapping
  let rect = element.getBoundingClientRect();
  let textWidth = rect.width;
  let textHeight = rect.height;

  // Check if we need to wrap (considering component's built-in padding)
  const availableWidth = maxWidth
    ? maxWidth - componentPaddingH - padding.left - padding.right
    : Infinity;

  // If text exceeds available width, apply wrapping
  if (maxWidth && textWidth > availableWidth) {
    element.style.whiteSpace = 'normal';
    element.style.wordBreak = 'break-word';
    element.style.width = `${availableWidth}px`;

    // Re-measure with wrapping
    rect = element.getBoundingClientRect();
    textWidth = rect.width;
    textHeight = rect.height;
  }

  // Calculate final dimensions (text + component padding + any extra padding)
  const finalWidth = Math.max(
    minWidth,
    textWidth + componentPaddingH + padding.left + padding.right
  );
  const finalHeight =
    textHeight + componentPaddingV + padding.top + padding.bottom;

  const result = { width: finalWidth, height: finalHeight };

  // Cache the result
  measurementCache.set(cacheKey, result);

  return result;
}

/**
 * Clear the measurement cache
 * Useful when font settings change globally
 */
export function clearMeasurementCache(): void {
  measurementCache.clear();
}

/**
 * Clear the measurement DOM elements (mainly for testing)
 */
export function clearCanvasInstance(): void {
  if (measurementContainer && measurementContainer.parentNode) {
    measurementContainer.parentNode.removeChild(measurementContainer);
  }
  measurementContainer = null;
  measurementElement = null;
}

/**
 * Get cache size for monitoring
 */
export function getCacheSize(): number {
  return measurementCache.size;
}
