/**
 * Node sizing strategy for calculating mind map node dimensions
 * Provides flexible sizing based on content and node state
 */

import {
  calculateTextDimensions,
  type TextMeasurementOptions,
} from './textMeasurementService';
import { NODE_SIZING } from '../constants/nodeSizing';

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
  // Use shared constants for consistency across tests and implementation
  private readonly defaultPadding = NODE_SIZING.DEFAULT_PADDING;
  private readonly defaultFontSize = NODE_SIZING.DEFAULT_FONT_SIZE;
  private readonly defaultFontFamily = NODE_SIZING.DEFAULT_FONT_FAMILY;
  private readonly defaultFontWeight = NODE_SIZING.DEFAULT_FONT_WEIGHT;
  private readonly minWidth = NODE_SIZING.MIN_WIDTH;
  private readonly maxWidth = NODE_SIZING.MAX_WIDTH;

  calculateNodeSize(
    label: string,
    options?: NodeSizingOptions
  ): NodeDimensions {
    const {
      isEditing = false,
      level = 1,
      fontSize = this.defaultFontSize,
      fontWeight = this.defaultFontWeight,
      padding = this.defaultPadding,
    } = options ?? {};

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

    // Note: No extra width needed for icons since they are positioned
    // absolutely outside the node bounds (bottom: -10px, right: -10px)

    // Add extra width for editing mode (cursor and comfortable typing)
    if (isEditing) {
      width += NODE_SIZING.EDITING_EXTRA_WIDTH; // Extra space for cursor
    }

    // Note: No extra width needed for collapsed state since the collapse button
    // is positioned absolutely outside the node bounds

    // Apply root node scaling (level 0 nodes are larger)
    if (level === 0) {
      width *= NODE_SIZING.ROOT_NODE_WIDTH_MULTIPLIER; // 10% wider
      height *= NODE_SIZING.ROOT_NODE_HEIGHT_MULTIPLIER; // 20% taller
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
