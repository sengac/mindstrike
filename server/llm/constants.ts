/**
 * Constants for all magic numbers used in local LLM code
 * This file consolidates numeric constants to avoid magic numbers in the codebase
 */

// Default model parameters
export const DEFAULT_MODEL_PARAMS = {
  TEMPERATURE: 0.7,
  MAX_TOKENS: 4000,
  BATCH_SIZE: 512,
  CONTEXT_SIZE: 4096,
} as const;

// HTTP Status codes
export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  GATEWAY_TIMEOUT: 504,
} as const;

// Timing constants (in milliseconds)
export const TIMING = {
  MCP_TOOL_TIMEOUT: 5000, // 5 seconds
  MCP_FUNCTION_TIMEOUT: 30000, // 30 seconds
  CACHE_EXPIRATION: 5 * 60 * 1000, // 5 minutes
  MODEL_UPDATE_DELAY: 2000, // 2 seconds
  SPEED_CALCULATION_INTERVAL: 1000, // 1 second
} as const;

// Progress constants
export const PROGRESS = {
  COMPLETE: 100,
  INITIAL: 0,
} as const;

// Random string generation
export const RANDOM_STRING = {
  RADIX: 36,
  SUBSTRING_START: 2,
  ID_LENGTH: 7,
  SUFFIX_LENGTH: 9,
} as const;

// Probability constants
export const PROBABILITY = {
  LOG_SAMPLING_CHANCE: 0.1, // 10%
} as const;

// Memory and size constants
export const MEMORY = {
  BYTES_TO_KB: 1024,
  KB_TO_MB: 1024,
  MB_TO_GB: 1024,
  BYTES_TO_MB: 1024 * 1024,
  BYTES_TO_GB: 1024 * 1024 * 1024,
  VRAM_RESERVATION_RATIO: 0.8, // Reserve 80% of free VRAM
  VRAM_BATCH_RATIO: 0.3, // 30% of VRAM for batch processing
  BATCH_MEMORY_RESERVE_GB: 1.0, // 1GB reserved
  MIN_GPU_MEMORY_GB: 1, // 1GB minimum
} as const;

// Model architecture defaults (typical values)
export const MODEL_ARCHITECTURE = {
  HIDDEN_SIZE_9B: 4096, // typical for 9B models
  NUM_LAYERS_9B: 48, // typical layer count
  NUM_ATTENTION_HEADS_9B: 32, // typical ratio
  NUM_KEY_VALUE_HEADS_9B: 8, // typical GQA ratio
  DEFAULT_HEAD_COUNT_MAX: 32, // Common default
  DEFAULT_HEAD_COUNT_KV_MIN: 8, // Common GQA ratio
  BITS_PER_PARAM_FP16: 16,
  BYTES_PER_PARAM_FP16: 2,
  CACHE_BITS: 16,
  CACHE_BYTES: 8,
} as const;

// Model size thresholds (in MB)
export const MODEL_SIZE_THRESHOLDS = {
  XLARGE: 15000, // > 15GB
  LARGE: 8000, // 8-15GB
  MEDIUM: 4000, // 4-8GB
} as const;

// Context size values
export const CONTEXT_SIZES = {
  MIN: 512,
  SMALL: 1024,
  MEDIUM: 2048,
  LARGE: 4096,
  XLARGE: 8192,
  XXLARGE: 16384,
} as const;

// GPU layer constants
export const GPU_LAYERS = {
  AUTO: -1, // Auto-calculate GPU layers
  NONE: 0, // CPU-only mode
  TEST_DEFAULT: 16, // Default for tests
} as const;

// Model estimation constants
export const MODEL_ESTIMATION = {
  PARAMS_PER_GB: 0.5, // Rough parameter estimation from file size
  LAYER_MULTIPLIER: 8, // Multiplier for estimating layers from GB
  MIN_LAYERS: 32,
  MAX_LAYERS: 80,
} as const;

// Calculation constants
export const CALCULATION = {
  BINARY_SEARCH_LOW: 512,
  CONTEXT_MEMORY_FACTOR: 2,
  CONTEXT_MEMORY_OFFSET: 0.75,
  DIVISOR_TWO: 2,
  INCREMENT: 1,
} as const;

// User agent constants
export const USER_AGENT = {
  NAME: 'mindstrike-local-llm',
  VERSION: '1.0',
} as const;

// Speed formatting constants
export const SPEED_FORMAT = {
  UNITS: ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s'] as const,
  PRECISION: 1,
} as const;

// Test constants
export const TEST_VALUES = {
  // File sizes
  SMALL_FILE_SIZE: 1000000, // 1MB
  MEDIUM_FILE_SIZE: 2000000, // 2MB

  // Model parameters
  TEST_CONTEXT_LENGTH: 4096,
  TEST_LAYER_COUNT: 32,
  TEST_BATCH_SIZE: 512,
  TEST_GPU_LAYERS: 16,

  // Progress values
  HALF_PROGRESS: 50,
  DOWNLOADS_COUNT: 100,

  // Driver versions
  DRIVER_MAJOR: 12,
  DRIVER_MINOR: 0,

  // Compute capability
  DEFAULT_COMPUTE: '8.0',
} as const;

// Type guards for readonly arrays
export type SpeedUnit = (typeof SPEED_FORMAT.UNITS)[number];
