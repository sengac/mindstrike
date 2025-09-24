/**
 * Constants for all magic numbers used in mindmap code
 * This file consolidates numeric constants to avoid magic numbers in the codebase
 */

// CSS Units and Values
export const CSS_UNITS = {
  // Percentages
  PERCENT_50: '50%',
  PERCENT_100: '100%',
  PERCENT_NEGATIVE_50: '-50%',
  PERCENT_NEGATIVE_100: '-100%',

  // Border radius
  BORDER_RADIUS_FULL: '9999px',

  // Common pixel values (for inline styles that can't use NODE_UI_CONSTANTS)
  PX_4: '4px',
  PX_8: '8px',
  PX_24: '24px',
  PX_32: '32px',
  PX_160: '160px',
} as const;

// Transform values
export const TRANSFORM_VALUES = {
  TRANSLATE_X_CENTER: 'translateX(-50%)',
  TRANSLATE_Y_CENTER: 'translateY(-50%)',
  TRANSLATE_X_FULL_RIGHT: 'translate(100%, -50%)',
  TRANSLATE_X_FULL_LEFT: 'translate(-100%, -50%)',
  SCALE_1: 'scale(1)',
} as const;

// Zone detection constants
export const ZONE_DETECTION = {
  // Threshold for detecting drop zones (33% of node dimension)
  ZONE_THRESHOLD_PERCENTAGE: 0.33,
  // First/last third detection
  FIRST_THIRD: 0.33,
  LAST_THIRD: 0.67,
} as const;

// Test-specific constants
export const TEST_CONSTANTS = {
  // Default test node dimensions
  DEFAULT_TEST_NODE_WIDTH: 120,
  DEFAULT_TEST_NODE_HEIGHT: 40,

  // Common test positions
  TEST_POSITION_X_100: 100,
  TEST_POSITION_Y_100: 100,
  TEST_POSITION_X_200: 200,
  TEST_POSITION_X_250: 250,
  TEST_POSITION_X_300: 300,
  TEST_POSITION_X_400: 400,
  TEST_POSITION_X_500: 500,
  TEST_POSITION_Y_200: 200,

  // Test tolerances
  POSITION_TOLERANCE_STRICT: 10,
  POSITION_TOLERANCE_LOOSE: 50,

  // Test data
  MOCK_NODE_COUNT_SMALL: 3,
  MOCK_NODE_COUNT_MEDIUM: 5,

  // Character width approximation for text measurement
  CHAR_WIDTH_APPROX: 8,

  // Line height multipliers
  LINE_HEIGHT_MULTIPLIER: 1.5,
  SINGLE_LINE_HEIGHT_MULTIPLIER: 1.2,
} as const;

// Animation timing
export const ANIMATION_TIMING = {
  // Keyframe percentages
  KEYFRAME_0: 0,
  KEYFRAME_50: 50,
  KEYFRAME_100: 100,

  // Scale values for animations
  ANIMATION_SCALE_START: 1,
  ANIMATION_OPACITY_FULL: 1,
  ANIMATION_OPACITY_NONE: 0,
} as const;

// Layout calculation constants
export const LAYOUT_CALC = {
  // Centering calculations
  CENTER_DIVISOR: 2,

  // Array indices
  FIRST_INDEX: 0,
  ARRAY_OFFSET: 1,

  // Level calculations
  ROOT_LEVEL: 0,
  FIRST_CHILD_LEVEL: 1,

  // Minimum sizes
  MIN_SUBTREE_SIZE: 1,

  // Priority values
  INFINITY_PRIORITY: Infinity,
} as const;

// Opacity values (in decimal form)
export const OPACITY_VALUES = {
  FULL: 1,
  HALF: 0.5,
  NONE: 0,
} as const;

// Handle element sizes
export const HANDLE_CONSTANTS = {
  WIDTH: 1,
  HEIGHT: 1,
} as const;

// Z-index layers (should match NODE_UI_CONSTANTS but kept for reference)
export const Z_INDEX_LAYERS = {
  BASE: 0,
  ELEVATED: 10,
  ACTIVE: 20,
  CONTROLS: 1000,
  MODAL: 9999,
} as const;

// Icon sizes for UI elements
export const ICON_SIZES = {
  SMALL: 12,
  MEDIUM: 14,
  LARGE: 16,
  XLARGE: 20,
  XXLARGE: 48,
} as const;

// Default positions
export const DEFAULT_POSITION: { readonly X: number; readonly Y: number } = {
  X: 0,
  Y: 0,
};

// Default viewport
export const DEFAULT_VIEWPORT = {
  X: 0,
  Y: 0,
  ZOOM: 1,
} as const;

// Array navigation
export const ARRAY_NAVIGATION = {
  FIRST_INDEX: 0,
  INCREMENT: 1,
} as const;

// Fit view settings
export const FIT_VIEW_SETTINGS = {
  PADDING_SMALL_MAP: 0.8,
  PADDING_LARGE_MAP: 0.2,
  MAX_ZOOM: 1.2,
  MIN_ZOOM: 0.5,
  SMALL_MAP_THRESHOLD: 3,
} as const;

// Timing delays (ms)
export const TIMING_DELAYS = {
  RESIZE_DEBOUNCE: 150,
} as const;

// UI element dimensions
export const UI_DIMENSIONS = {
  DROP_INDICATOR_HEIGHT: 4,
} as const;
