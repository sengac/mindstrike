// SSE Event Type Definitions

export interface SSEChunkEvent {
  chunk: string;
  threadId?: string;
}

export interface SSEMessageEvent {
  message: {
    id: string;
    content: string;
    role: string;
    timestamp: number;
    [key: string]: unknown;
  };
  threadId?: string;
}

export interface SSETokenStatsEvent {
  totalTokens: number;
  tokensPerSecond: number;
}

export interface SSEContentEvent {
  content: string;
}

export interface SSEStatusEvent {
  status: string;
}

export interface SSEResultEvent {
  result: unknown;
}

export interface SSEErrorEvent {
  error: string | Error;
}

export interface SSETaskEvent {
  id: string;
  result?: unknown;
  status?: string;
  [key: string]: unknown;
}

export interface SSEDebugEvent {
  type: string;
  timestamp: number;
  model: string;
  prompt: string;
  response: string;
  tokens: number;
  duration: number;
  tokensPerSecond: number;
  [key: string]: unknown;
}

export interface SSEDownloadEvent {
  progress?: number;
  speed?: string;
  filename?: string;
  isDownloading?: boolean;
  completed?: boolean;
  error?: string;
  cancelled?: boolean;
  errorType?: string;
  errorMessage?: string;
  huggingFaceUrl?: string;
  [key: string]: unknown;
}

export interface SSELogEvent {
  level: string;
  message: string;
  timestamp: number;
  [key: string]: unknown;
}

export interface SSEModelScanEvent {
  models?: Array<{
    name: string;
    url: string;
    filename: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export interface SSECancelledEvent {
  threadId?: string;
  messageId?: string;
}

// Union type for all SSE events
export type SSEEventData =
  | SSEChunkEvent
  | SSEMessageEvent
  | SSETokenStatsEvent
  | SSEContentEvent
  | SSEStatusEvent
  | SSEResultEvent
  | SSEErrorEvent
  | SSETaskEvent
  | SSEDebugEvent
  | SSEDownloadEvent
  | SSELogEvent
  | SSEModelScanEvent
  | SSECancelledEvent;

// Type guards for SSE events
export function isSSEChunkEvent(data: unknown): data is SSEChunkEvent {
  return typeof data === 'object' && data !== null && 'chunk' in data;
}

export function isSSEMessageEvent(data: unknown): data is SSEMessageEvent {
  return typeof data === 'object' && data !== null && 'message' in data;
}

export function isSSETokenStatsEvent(
  data: unknown
): data is SSETokenStatsEvent {
  return (
    typeof data === 'object' &&
    data !== null &&
    'totalTokens' in data &&
    'tokensPerSecond' in data
  );
}

export function isSSEContentEvent(data: unknown): data is SSEContentEvent {
  return typeof data === 'object' && data !== null && 'content' in data;
}

export function isSSEStatusEvent(data: unknown): data is SSEStatusEvent {
  return typeof data === 'object' && data !== null && 'status' in data;
}

export function isSSEResultEvent(data: unknown): data is SSEResultEvent {
  return typeof data === 'object' && data !== null && 'result' in data;
}

export function isSSEErrorEvent(data: unknown): data is SSEErrorEvent {
  return typeof data === 'object' && data !== null && 'error' in data;
}

export function isSSETaskEvent(data: unknown): data is SSETaskEvent {
  return typeof data === 'object' && data !== null && 'id' in data;
}

export function isSSEDebugEvent(data: unknown): data is SSEDebugEvent {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    'timestamp' in data &&
    'model' in data
  );
}

export function isSSEDownloadEvent(data: unknown): data is SSEDownloadEvent {
  return (
    typeof data === 'object' &&
    data !== null &&
    ('progress' in data || 'status' in data || 'filename' in data)
  );
}

export function isSSELogEvent(data: unknown): data is SSELogEvent {
  return (
    typeof data === 'object' &&
    data !== null &&
    'level' in data &&
    'message' in data &&
    'timestamp' in data
  );
}

export function isSSEModelScanEvent(data: unknown): data is SSEModelScanEvent {
  return (
    typeof data === 'object' &&
    data !== null &&
    ('models' in data || typeof data === 'object')
  );
}

export function isSSECancelledEvent(data: unknown): data is SSECancelledEvent {
  return (
    typeof data === 'object' &&
    data !== null &&
    ('threadId' in data || 'messageId' in data)
  );
}
