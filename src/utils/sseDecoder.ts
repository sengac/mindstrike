import { logger } from './logger';
import { SSE_CONFIG, ERROR_MESSAGES } from '../constants/sse.constants';

/**
 * Shared utilities for encoding/decoding SSE data with base64 and large content support
 */

/**
 * Decode base64 encoded SSE data, handling UTF-8 properly
 */
export interface SseDataWithBase64 {
  _base64: true;
  data: string;
}

export interface SseDataWithLargeContent {
  _large_content: true;
  contentId: string;
  length: number;
}

interface SseConnectedData {
  type: 'connected';
}

interface SseContentChunkData {
  [key: string]: unknown;
  type: 'content-chunk';
  content?: string;
  chunk?: string;
  messageId?: string;
  delta?: boolean;
}

interface SseToolCallData {
  type: 'tool-call';
  toolCall: {
    id: string;
    name: string;
    parameters: Record<string, unknown>;
  };
  messageId?: string;
}

interface SseToolResultData {
  type: 'tool-result';
  result: {
    name: string;
    result: unknown;
  };
  messageId?: string;
}

interface SseCompleteData {
  type: 'complete';
  messageId?: string;
}

interface SseErrorData {
  type: 'error';
  error: string;
  messageId?: string;
}

interface SseWorkflowData {
  type:
    | 'workflow_started'
    | 'tasks_planned'
    | 'task_progress'
    | 'task_completed';
  workflowId?: string;
  task?: unknown;
  tasks?: unknown[];
}

interface SseMessageUpdateData {
  [key: string]: unknown;
  type: 'message-update';
  message: {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
    status?: string;
    model?: string;
    toolCalls?: unknown[];
    toolResults?: unknown[];
  };
}

interface SseCompletedData {
  [key: string]: unknown;
  type: 'completed';
  message: {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
    status?: string;
    model?: string;
    toolCalls?: unknown[];
    toolResults?: unknown[];
  };
}

interface SseLocalModelNotLoadedData {
  [key: string]: unknown;
  type: 'local-model-not-loaded';
  modelId: string;
  error: string;
}

interface SseDebugEntryData {
  [key: string]: unknown;
  type: 'debug-entry';
  entryType: 'error' | 'request' | 'response';
  title: string;
  content: string;
  duration?: number;
  model?: string;
  endpoint?: string;
  tokensPerSecond?: number;
  totalTokens?: number;
}

interface SseTokenStatsData {
  [key: string]: unknown;
  type: 'token-stats';
  tokensPerSecond: number;
  totalTokens: number;
  isGenerating: boolean;
}

interface SseGenerationStatusData {
  [key: string]: unknown;
  type: 'generation-status';
  generating: boolean;
}

interface SseMcpLogData {
  [key: string]: unknown;
  type: 'mcp-log';
  id: string;
  timestamp: number;
  serverId: string;
  level: 'error' | 'warn' | 'info';
  message: string;
}

interface SseMindmapChangeData {
  [key: string]: unknown;
  type: 'mindmap_change';
  action: 'create' | 'update' | 'delete';
  text?: string;
}

interface SseMindmapCompleteData {
  [key: string]: unknown;
  type: 'complete';
  result: unknown;
}

interface SseWorkflowStartedData {
  [key: string]: unknown;
  type: 'workflow_started';
  workflowId: string;
  originalQuery?: string;
  contextId?: string;
}

interface SseTasksPlannedData {
  [key: string]: unknown;
  type: 'tasks_planned';
  workflowId?: string;
  tasks: Array<{
    id: string;
    description: string;
    priority?: string;
    status?: string;
    details?: unknown;
    result?: unknown;
    error?: string;
    createdAt?: string;
    completedAt?: string;
  }>;
}

interface SseTaskProgressData {
  [key: string]: unknown;
  type: 'task_progress';
  workflowId?: string;
  task: {
    id: string;
    status: string;
    result?: unknown;
    error?: string;
  };
}

interface SseTaskCompletedData {
  [key: string]: unknown;
  type: 'task_completed';
  workflowId?: string;
  task: {
    id: string;
    result?: unknown;
    error?: string;
  };
}

export type SseEventData =
  | SseConnectedData
  | SseContentChunkData
  | SseToolCallData
  | SseToolResultData
  | SseCompleteData
  | SseErrorData
  | SseWorkflowData
  | SseMessageUpdateData
  | SseCompletedData
  | SseLocalModelNotLoadedData
  | SseDebugEntryData
  | SseTokenStatsData
  | SseGenerationStatusData
  | SseMcpLogData
  | SseMindmapChangeData
  | SseMindmapCompleteData
  | SseWorkflowStartedData
  | SseTasksPlannedData
  | SseTaskProgressData
  | SseTaskCompletedData;

type SseDataInput =
  | string
  | number
  | boolean
  | null
  | SseDataWithBase64
  | SseDataWithLargeContent
  | SseEventData
  | Record<string, unknown>
  | unknown[];

// Object type for SSE event data
export interface SseObjectData {
  [key: string]: unknown;
  type?: string;
  chunk?: string;
  content?: string;
  message?: unknown;
  error?: string;
  workflowId?: string;
  task?: unknown;
  tasks?: unknown[];
  modelId?: string;
  entryType?: string;
  title?: string;
  duration?: number;
  model?: string;
  endpoint?: string;
  tokensPerSecond?: number;
  totalTokens?: number;
  isGenerating?: boolean;
  generating?: boolean;
  id?: string;
  timestamp?: number;
  serverId?: string;
  level?: string;
  action?: string;
  text?: string;
  result?: unknown;
  originalQuery?: string;
  contextId?: string;
  totalChanges?: number;
}

// Union type for all possible decoded results
export type SseDecodedData =
  | SseObjectData
  | string
  | number
  | boolean
  | null
  | unknown[];

// Type guard to check if result is an object with properties
export function isSseObject(data: SseDecodedData): data is SseObjectData {
  return typeof data === 'object' && data !== null && !Array.isArray(data);
}

// Type guards for specific SSE event types
export function isSseCompletedData(
  data: SseObjectData
): data is SseCompletedData {
  return (
    data.type === 'completed' &&
    typeof data.message === 'object' &&
    data.message !== null
  );
}

export function isSseLocalModelNotLoadedData(
  data: SseObjectData
): data is SseLocalModelNotLoadedData {
  return (
    data.type === 'local-model-not-loaded' &&
    typeof data.modelId === 'string' &&
    typeof data.error === 'string'
  );
}

export function isSseMessageUpdateData(
  data: SseObjectData
): data is SseMessageUpdateData {
  return (
    data.type === 'message-update' &&
    typeof data.message === 'object' &&
    data.message !== null
  );
}

export function isSseContentChunkData(
  data: SseObjectData
): data is SseContentChunkData {
  return data.type === 'content-chunk';
}

export function isSseDebugEntryData(
  data: SseObjectData
): data is SseDebugEntryData {
  return (
    data.type === 'debug-entry' &&
    typeof data.entryType === 'string' &&
    typeof data.title === 'string' &&
    typeof data.content === 'string'
  );
}

export function isSseTokenStatsData(
  data: SseObjectData
): data is SseTokenStatsData {
  return (
    data.type === 'token-stats' &&
    typeof data.tokensPerSecond === 'number' &&
    typeof data.totalTokens === 'number' &&
    typeof data.isGenerating === 'boolean'
  );
}

export function isSseMcpLogData(data: SseObjectData): data is SseMcpLogData {
  return (
    data.type === 'mcp-log' &&
    typeof data.id === 'string' &&
    typeof data.timestamp === 'number' &&
    typeof data.serverId === 'string' &&
    typeof data.level === 'string' &&
    typeof data.message === 'string'
  );
}

export function isSseMindmapChangeData(
  data: SseObjectData
): data is SseMindmapChangeData {
  return data.type === 'mindmap_change' && typeof data.action === 'string';
}

export function isSseMindmapCompleteData(
  data: SseObjectData
): data is SseMindmapCompleteData {
  return data.type === 'complete';
}

export function isSseWorkflowStartedData(
  data: SseObjectData
): data is SseWorkflowStartedData {
  return (
    data.type === 'workflow_started' && typeof data.workflowId === 'string'
  );
}

export function isSseTasksPlannedData(
  data: SseObjectData
): data is SseTasksPlannedData {
  return data.type === 'tasks_planned' && Array.isArray(data.tasks);
}

export function isSseTaskProgressData(
  data: SseObjectData
): data is SseTaskProgressData {
  return (
    data.type === 'task_progress' &&
    typeof data.task === 'object' &&
    data.task !== null
  );
}

export function isSseTaskCompletedData(
  data: SseObjectData
): data is SseTaskCompletedData {
  return (
    data.type === 'task_completed' &&
    typeof data.task === 'object' &&
    data.task !== null
  );
}

// Helper function that guarantees an object result for SSE events
export async function decodeSseEventData(obj: unknown): Promise<SseObjectData> {
  const decoded = await decodeSseData(obj as SseDataInput);
  if (isSseObject(decoded)) {
    return decoded;
  }
  // This shouldn't happen for valid SSE data, but provide a fallback
  return { rawData: decoded } as SseObjectData;
}

export async function decodeSseData(
  obj: SseDataInput
): Promise<SseDecodedData> {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if ('_base64' in obj && obj._base64 && typeof obj.data === 'string') {
    // Properly decode UTF-8 base64 string
    const bytes = Uint8Array.from(atob(obj.data), c => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  }

  if ('_large_content' in obj && obj._large_content && obj.contentId) {
    try {
      const response = await fetch(
        `${SSE_CONFIG.LARGE_CONTENT_ENDPOINT}/${obj.contentId}`
      );
      if (response.ok) {
        const data = await response.json();
        return data.content;
      } else {
        return `[Large content not available - ${obj.length} characters]`;
      }
    } catch (error) {
      logger.error(ERROR_MESSAGES.LARGE_CONTENT_FETCH_ERROR, error);
      return `[Large content error - ${obj.length} characters]`;
    }
  }

  if (Array.isArray(obj)) {
    const results = await Promise.all(
      obj.map(item => decodeSseData(item as SseDataInput))
    );
    return results;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    result[key] = await decodeSseData(value as SseDataInput);
  }
  return result;
}

/**
 * Synchronous version for simple cases where no large content is expected
 */
export function decodeSseDataSync(obj: SseDataInput): SseDecodedData {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if ('_base64' in obj && obj._base64 && typeof obj.data === 'string') {
    // Properly decode UTF-8 base64 string
    const bytes = Uint8Array.from(atob(obj.data), c => c.charCodeAt(0));
    const decoded = new TextDecoder('utf-8').decode(bytes);

    return decoded;
  }

  if ('_large_content' in obj && obj._large_content && obj.contentId) {
    return `[Large content - ${obj.length} characters]`;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => decodeSseDataSync(item as SseDataInput));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    result[key] = decodeSseDataSync(value as SseDataInput);
  }
  return result;
}
