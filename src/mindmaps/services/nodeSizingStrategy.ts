/**
 * Node sizing strategy for calculating mind map node dimensions
 * Provides flexible sizing based on content and node state
 */

import {
  calculateTextDimensions,
  type TextMeasurementOptions,
} from './textMeasurementService';

export interface NodeDimensions {
  width: number;
  height: number;
}

export interface NodeSizingOptions {
  isEditing?: boolean;
  hasIcons?: boolean;
  level?: number;
  isCollapsed?: boolean;
  fontSize?: string;
  fontWeight?: string;
  padding?: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
}

export interface NodeSizingStrategy {
  calculateNodeSize(label: string, options?: NodeSizingOptions): NodeDimensions;
}

/**
 * Default implementation of node sizing strategy
 * Handles standard sizing rules for mind map nodes
 */
export class DefaultNodeSizingStrategy implements NodeSizingStrategy {
  // Component already has padding via inline styles, so we should NOT add padding here
  private readonly defaultPadding = {
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  };

  // Default font size (0.875rem = 14px)
  private readonly defaultFontSize = '14px';
  // Match the actual font-family from CSS including Inter font
  private readonly defaultFontFamily =
    'Inter, system-ui, -apple-system, sans-serif';
  // Default font weight
  private readonly defaultFontWeight = '500';
  private readonly minWidth = 120;
  private readonly maxWidth = 300; // Maximum width before text wraps (matching node maxWidth)

  calculateNodeSize(
    label: string,
    options?: NodeSizingOptions
  ): NodeDimensions {
    const {
      isEditing = false,
      hasIcons = false,
      level = 1,
      isCollapsed = false,
      fontSize = this.defaultFontSize,
      fontWeight = this.defaultFontWeight,
      padding = this.defaultPadding,
    } = options || {};

    // Calculate base text dimensions
    const textOptions: TextMeasurementOptions = {
      text: label,
      fontSize,
      fontFamily: this.defaultFontFamily,
      fontWeight,
      padding,
      minWidth: this.minWidth,
      maxWidth: this.maxWidth,
    };

    const baseDimensions = calculateTextDimensions(textOptions);

    // Apply modifiers
    let width = baseDimensions.width;
    let height = baseDimensions.height;

    // Add extra width for icons (chat, notes, sources badges)
    if (hasIcons) {
      width += 30; // Space for icon badges
    }

    // Add extra width for editing mode (cursor and comfortable typing)
    if (isEditing) {
      width += 20; // Extra space for cursor
    }

    // Add extra width for collapsed indicator
    if (isCollapsed) {
      width += 10; // Space for expand/collapse button
    }

    // Apply root node scaling (level 0 nodes are larger)
    if (level === 0) {
      width *= 1.1; // 10% wider
      height *= 1.2; // 20% taller
    }

    return {
      width: Math.round(width),
      height: Math.round(height),
    };
  }
}

/**
 * Factory function to create default sizing strategy
 */
export function createDefaultSizingStrategy(): NodeSizingStrategy {
  return new DefaultNodeSizingStrategy();
}
