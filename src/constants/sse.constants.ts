/**
 * SSE (Server-Sent Events) Constants
 * Centralized constants for all SSE-related functionality
 */

// SSE Connection Configuration
export const SSE_CONFIG = {
  MAX_RECONNECT_ATTEMPTS: 5,
  INITIAL_RECONNECT_DELAY: 3000, // 3 seconds
  RECONNECT_BACKOFF_MULTIPLIER: 2,
  CONNECTION_ENDPOINT: '/api/events/stream',
  LARGE_CONTENT_ENDPOINT: '/api/large-content',
} as const;

// SSE Event Types
export const SSE_EVENT_TYPES = {
  // Connection events
  CONNECTED: 'connected',
  ERROR: 'error',

  // Message streaming events
  CONTENT_CHUNK: 'content-chunk',
  MESSAGE_UPDATE: 'message-update',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  MESSAGES_DELETED: 'messages-deleted',

  // Workflow events
  WORKFLOW_STARTED: 'workflow_started',
  TASKS_PLANNED: 'tasks_planned',
  TASK_PROGRESS: 'task_progress',
  TASK_COMPLETED: 'task_completed',

  // Model events
  LOCAL_MODEL_NOT_LOADED: 'local-model-not-loaded',

  // Debug and stats events
  DEBUG_ENTRY: 'debug-entry',
  TOKEN_STATS: 'token-stats',
  GENERATION_STATUS: 'generation-status',

  // MCP events
  MCP_LOG: 'mcp-log',
  MCP_PROCESS_INFO: 'mcp-process-info',
  MCP_STDOUT_LOG: 'mcp-stdout-log',
  MCP_STDERR_LOG: 'mcp-stderr-log',
  MCP_SERVER_CONNECTED: 'mcp-server-connected',
  MCP_SERVER_DISCONNECTED: 'mcp-server-disconnected',

  // Mind map events
  MINDMAP_CHANGE: 'mindmap_change',
  COMPLETE: 'complete',

  // Tool events
  TOOL_CALL: 'tool-call',
  TOOL_RESULT: 'tool-result',

  // Model scan events
  MODEL_SCAN_PROGRESS: 'model-scan-progress',
  MODEL_SCAN_COMPLETE: 'model-scan-complete',

  // Download events
  DOWNLOAD_PROGRESS: 'download-progress',
  DOWNLOAD_COMPLETE: 'download-complete',
  DOWNLOAD_ERROR: 'download-error',

  // Wildcard for all events
  WILDCARD: '*',
} as const;

// Message Status Constants
export const MESSAGE_STATUS = {
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  FAILED: 'failed',
} as const;

// Message Roles
export const MESSAGE_ROLES = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
} as const;

// API Endpoints
export const API_ENDPOINTS = {
  MESSAGE: '/api/message',
  CANCEL_MESSAGE: '/api/message/cancel',
  GENERATE_TITLE: '/api/generate-title',
  THREADS: '/api/threads',
  THREAD_MESSAGES: (threadId: string) => `/api/threads/${threadId}/messages`,
  CLEAR_THREAD: (threadId: string) => `/api/threads/${threadId}/clear`,
} as const;

// Timing Constants
export const TIMING_CONFIG = {
  TITLE_GENERATION_CONTENT_LIMIT: 200,
  MERMAID_RENDER_DEBOUNCE: 50,
  CHAT_SCROLL_DEBOUNCE: 2000,
  FOCUS_DELAY: 100,
  VISIBILITY_CHECK_DELAY: 0,
} as const;

// Image Processing Constants
export const IMAGE_CONFIG = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  THUMBNAIL_MAX_SIZE: 400,
  FULL_IMAGE_MAX_SIZE: 1920,
  THUMBNAIL_FORMAT: 'image/png' as const,
  FULL_IMAGE_FORMAT: 'image/jpeg' as const,
  FULL_IMAGE_QUALITY: 0.9,
  IMAGE_SMOOTHING_QUALITY: 'high' as const,
} as const;

// Error Messages
export const ERROR_MESSAGES = {
  NO_ACTIVE_THREAD: 'No active thread selected',
  FAILED_TO_SEND: 'Failed to send message',
  FAILED_TO_CLEAR: 'Failed to clear conversation',
  FAILED_TO_REGENERATE: 'Failed to regenerate message',
  FAILED_TO_EDIT: 'Failed to edit message',
  FAILED_TO_CANCEL: 'Failed to cancel streaming',
  FAILED_TO_CANCEL_TOOLS: 'Failed to cancel tool calls',
  IMAGE_SIZE_TOO_LARGE: 'Image size must be less than 10MB',
  IMAGE_PROCESSING_ERROR: 'Error processing image. Please try again.',
  ONLY_IMAGE_FILES: 'Please select only image files.',
  SSE_PARSE_ERROR: 'Error parsing SSE event',
  SSE_CONNECTION_ERROR: 'SSE connection error',
  SSE_MAX_RECONNECT: 'Max reconnection attempts reached',
  LARGE_CONTENT_FETCH_ERROR: 'Failed to fetch large content',
} as const;

// EventSource States (matching browser API)
export const EVENT_SOURCE_STATE = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSED: 2,
} as const;

// Type exports for better type safety
export type SSEEventType =
  (typeof SSE_EVENT_TYPES)[keyof typeof SSE_EVENT_TYPES];
export type MessageStatus =
  (typeof MESSAGE_STATUS)[keyof typeof MESSAGE_STATUS];
export type MessageRole = (typeof MESSAGE_ROLES)[keyof typeof MESSAGE_ROLES];
export type EventSourceState =
  (typeof EVENT_SOURCE_STATE)[keyof typeof EVENT_SOURCE_STATE];
