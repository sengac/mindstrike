/**
 * Constants for mind map node sizing
 */

export const NODE_SIZING = {
  /**
   * Default padding for nodes (component handles padding via inline styles)
   */
  DEFAULT_PADDING: {
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },

  /**
   * Font settings
   */
  DEFAULT_FONT_SIZE: '14px',
  DEFAULT_FONT_FAMILY: 'Inter, system-ui, -apple-system, sans-serif',
  DEFAULT_FONT_WEIGHT: '500',

  /**
   * Default dimensions
   */
  DEFAULT_NODE_WIDTH: 150,
  DEFAULT_NODE_HEIGHT: 40,

  /**
   * Width constraints
   */
  MIN_WIDTH: 120,
  MAX_WIDTH: 300, // Maximum width before text wraps

  /**
   * Additional sizing adjustments
   */
  EDITING_EXTRA_WIDTH: 20, // Extra space for editing mode
  ROOT_NODE_WIDTH_MULTIPLIER: 1.1, // Root nodes are 10% wider
  ROOT_NODE_HEIGHT_MULTIPLIER: 1.2, // Root nodes are 20% taller

  /**
   * Node styling
   */
  BORDER_WIDTH: 2, // Border width in pixels
  PADDING_HORIZONTAL: 16, // Horizontal padding in pixels
  PADDING_VERTICAL: 8, // Vertical padding in pixels

  /**
   * Drop zone proportions
   */
  ZONE_PERCENTAGE: 0.33, // Each drop zone (above/below) is 33% of node dimension

  /**
   * Drag behavior
   */
  MIN_DRAG_DISTANCE: 20, // Minimum pixels to drag before considering it a "real" drag
  DRAG_UPDATE_THROTTLE: 50, // Milliseconds to throttle drag updates
} as const;
