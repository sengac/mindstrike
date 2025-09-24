/**
 * SSE Event Test Fixtures
 * Reusable test data for SSE event testing
 */

import {
  SSE_EVENT_TYPES,
  MESSAGE_STATUS,
  MESSAGE_ROLES,
} from '../constants/sse.constants';
import type { SSEEvent } from '../utils/sseEventBus';
import type {
  SSEChunkEvent,
  SSEMessageEvent,
  SSETokenStatsEvent,
  SSECancelledEvent,
  SSEErrorEvent,
} from '../types/sse-events';
import type {
  SseDataWithBase64,
  SseDataWithLargeContent,
} from '../utils/sseDecoder';

// Basic SSE Event wrapper helper
function createSSEEvent<T>(
  type: string,
  data: T,
  options?: Partial<SSEEvent>
): SSEEvent {
  return {
    type,
    data,
    timestamp: Date.now(),
    ...options,
  };
}

// Content chunk events
export const contentChunkEvents = {
  simple: createSSEEvent<SSEChunkEvent>(
    SSE_EVENT_TYPES.CONTENT_CHUNK,
    {
      chunk: 'Hello',
      threadId: 'test-thread-1',
    },
    { threadId: 'test-thread-1' }
  ),

  withEmoji: createSSEEvent<SSEChunkEvent>(
    SSE_EVENT_TYPES.CONTENT_CHUNK,
    {
      chunk: ' 👋 World!',
      threadId: 'test-thread-1',
    },
    { threadId: 'test-thread-1' }
  ),

  withCode: createSSEEvent<SSEChunkEvent>(
    SSE_EVENT_TYPES.CONTENT_CHUNK,
    {
      chunk: '```javascript\nconst greeting = "Hello";\n```',
      threadId: 'test-thread-1',
    },
    { threadId: 'test-thread-1' }
  ),

  empty: createSSEEvent<SSEChunkEvent>(
    SSE_EVENT_TYPES.CONTENT_CHUNK,
    {
      chunk: '',
      threadId: 'test-thread-1',
    },
    { threadId: 'test-thread-1' }
  ),
};

// Message update events
export const messageUpdateEvents = {
  initial: createSSEEvent<SSEMessageEvent>(
    SSE_EVENT_TYPES.MESSAGE_UPDATE,
    {
      message: {
        id: 'msg-123',
        role: MESSAGE_ROLES.ASSISTANT,
        content: '',
        timestamp: 1704067200000, // 2024-01-01T00:00:00Z
        status: MESSAGE_STATUS.PROCESSING,
        model: 'gpt-4',
      },
      threadId: 'test-thread-1',
    },
    { threadId: 'test-thread-1' }
  ),

  withContent: createSSEEvent<SSEMessageEvent>(
    SSE_EVENT_TYPES.MESSAGE_UPDATE,
    {
      message: {
        id: 'msg-123',
        role: MESSAGE_ROLES.ASSISTANT,
        content: 'Hello! How can I help you today?',
        timestamp: 1704067200000,
        status: MESSAGE_STATUS.PROCESSING,
        model: 'gpt-4',
      },
      threadId: 'test-thread-1',
    },
    { threadId: 'test-thread-1' }
  ),

  withToolCalls: createSSEEvent<SSEMessageEvent>(
    SSE_EVENT_TYPES.MESSAGE_UPDATE,
    {
      message: {
        id: 'msg-456',
        role: MESSAGE_ROLES.ASSISTANT,
        content: 'Let me search for that information...',
        timestamp: 1704067200000,
        status: MESSAGE_STATUS.PROCESSING,
        model: 'gpt-4',
        toolCalls: [
          {
            id: 'tool-1',
            name: 'search',
            parameters: { query: 'latest news' },
          },
        ],
      },
      threadId: 'test-thread-1',
    },
    { threadId: 'test-thread-1' }
  ),
};

// Completed events
export const completedEvents = {
  simple: createSSEEvent<SSEMessageEvent>(
    SSE_EVENT_TYPES.COMPLETED,
    {
      message: {
        id: 'msg-123',
        role: MESSAGE_ROLES.ASSISTANT,
        content: 'Hello! How can I help you today?',
        timestamp: 1704067200000,
        status: MESSAGE_STATUS.COMPLETED,
        model: 'gpt-4',
      },
      threadId: 'test-thread-1',
    },
    { threadId: 'test-thread-1' }
  ),

  withToolResults: createSSEEvent<SSEMessageEvent>(
    SSE_EVENT_TYPES.COMPLETED,
    {
      message: {
        id: 'msg-456',
        role: MESSAGE_ROLES.ASSISTANT,
        content: 'Based on my search, here are the latest news...',
        timestamp: 1704067200000,
        status: MESSAGE_STATUS.COMPLETED,
        model: 'gpt-4',
        toolCalls: [
          {
            id: 'tool-1',
            name: 'search',
            parameters: { query: 'latest news' },
          },
        ],
        toolResults: [
          {
            name: 'search',
            result: {
              success: true,
              output: 'Search results here...',
            },
          },
        ],
      },
      threadId: 'test-thread-1',
    },
    { threadId: 'test-thread-1' }
  ),
};

// Cancelled events
export const cancelledEvents = {
  byUser: createSSEEvent<SSECancelledEvent>(
    SSE_EVENT_TYPES.CANCELLED,
    {
      threadId: 'test-thread-1',
      messageId: 'msg-123',
    },
    { threadId: 'test-thread-1' }
  ),

  toolCalls: createSSEEvent<SSECancelledEvent>(
    SSE_EVENT_TYPES.CANCELLED,
    {
      threadId: 'test-thread-1',
      messageId: 'msg-456',
    },
    { threadId: 'test-thread-1' }
  ),
};

// Error events
export const errorEvents = {
  networkError: createSSEEvent<SSEErrorEvent>(SSE_EVENT_TYPES.ERROR, {
    error: 'Network request failed',
  }),

  modelError: createSSEEvent<SSEErrorEvent>(SSE_EVENT_TYPES.ERROR, {
    error: 'Model not available',
  }),

  withDetails: createSSEEvent<SSEErrorEvent>(SSE_EVENT_TYPES.ERROR, {
    error: new Error('Detailed error with stack trace'),
  }),
};

// Token stats events
export const tokenStatsEvents = {
  generating: createSSEEvent<SSETokenStatsEvent>(SSE_EVENT_TYPES.TOKEN_STATS, {
    totalTokens: 150,
    tokensPerSecond: 25.5,
  }),

  completed: createSSEEvent<SSETokenStatsEvent>(SSE_EVENT_TYPES.TOKEN_STATS, {
    totalTokens: 500,
    tokensPerSecond: 30.2,
  }),
};

// Workflow events
export const workflowEvents = {
  started: createSSEEvent(
    SSE_EVENT_TYPES.WORKFLOW_STARTED,
    {
      workflowId: 'workflow-123',
      originalQuery: 'Please analyze this codebase',
      contextId: 'ctx-456',
    },
    { workflowId: 'workflow-123' }
  ),

  tasksPlanned: createSSEEvent(
    SSE_EVENT_TYPES.TASKS_PLANNED,
    {
      workflowId: 'workflow-123',
      tasks: [
        {
          id: 'task-1',
          description: 'Scan project structure',
          priority: 'high',
          status: 'pending',
        },
        {
          id: 'task-2',
          description: 'Analyze dependencies',
          priority: 'medium',
          status: 'pending',
        },
      ],
    },
    { workflowId: 'workflow-123' }
  ),

  taskProgress: createSSEEvent(
    SSE_EVENT_TYPES.TASK_PROGRESS,
    {
      workflowId: 'workflow-123',
      task: {
        id: 'task-1',
        status: 'in-progress',
      },
    },
    { workflowId: 'workflow-123' }
  ),

  taskCompleted: createSSEEvent(
    SSE_EVENT_TYPES.TASK_COMPLETED,
    {
      workflowId: 'workflow-123',
      task: {
        id: 'task-1',
        result: {
          filesScanned: 125,
          totalSize: '2.5MB',
        },
      },
    },
    { workflowId: 'workflow-123' }
  ),
};

// Local model events
export const localModelEvents = {
  notLoaded: createSSEEvent(SSE_EVENT_TYPES.LOCAL_MODEL_NOT_LOADED, {
    modelId: 'llama-2-7b',
    error: 'Model not loaded. Please load the model first.',
  }),
};

// Messages deleted events
export const messagesDeletedEvents = {
  single: createSSEEvent(SSE_EVENT_TYPES.MESSAGES_DELETED, {
    messageIds: ['msg-123'],
  }),

  multiple: createSSEEvent(SSE_EVENT_TYPES.MESSAGES_DELETED, {
    messageIds: ['msg-123', 'msg-456', 'msg-789'],
  }),
};

// Connection events
export const connectionEvents = {
  connected: createSSEEvent(SSE_EVENT_TYPES.CONNECTED, {
    type: SSE_EVENT_TYPES.CONNECTED,
  }),
};

// Combined event sequences for integration testing
export const eventSequences = {
  // Normal message flow
  normalMessageFlow: [
    messageUpdateEvents.initial,
    contentChunkEvents.simple,
    contentChunkEvents.withEmoji,
    completedEvents.simple,
  ],

  // Message with tool calls
  toolCallFlow: [
    messageUpdateEvents.withToolCalls,
    createSSEEvent(SSE_EVENT_TYPES.TOOL_CALL, {
      toolCall: {
        id: 'tool-1',
        name: 'search',
        parameters: { query: 'latest news' },
      },
      messageId: 'msg-456',
    }),
    createSSEEvent(SSE_EVENT_TYPES.TOOL_RESULT, {
      result: {
        name: 'search',
        result: { success: true, output: 'Search results...' },
      },
      messageId: 'msg-456',
    }),
    completedEvents.withToolResults,
  ],

  // Cancelled message flow
  cancelledFlow: [
    messageUpdateEvents.initial,
    contentChunkEvents.simple,
    cancelledEvents.byUser,
  ],

  // Error flow
  errorFlow: [messageUpdateEvents.initial, errorEvents.networkError],

  // Workflow execution
  workflowFlow: [
    workflowEvents.started,
    workflowEvents.tasksPlanned,
    workflowEvents.taskProgress,
    workflowEvents.taskCompleted,
  ],
};

// Helper to create custom events
export function createCustomSSEEvent(
  type: string,
  data: unknown,
  options?: Partial<SSEEvent>
): SSEEvent {
  return createSSEEvent(type, data, options);
}

// Helper to simulate event stream
export async function* simulateEventStream(
  events: SSEEvent[],
  delayMs = 50
): AsyncGenerator<SSEEvent, void, unknown> {
  for (const event of events) {
    yield event;
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
}

// Helper to create encoded SSE data
export function createEncodedSSEData(data: unknown): unknown {
  // Simulate base64 encoding
  if (typeof data === 'string' && data.length > 100) {
    const encoded = btoa(
      encodeURIComponent(data).replace(
        /%([0-9A-F]{2})/g,
        (match, p1: string) => String.fromCharCode(parseInt(p1, 16)) // match param required by replace() API
      )
    );
    const base64Data: SseDataWithBase64 = {
      _base64: true,
      data: encoded,
    };
    return base64Data;
  }

  // Simulate large content
  if (typeof data === 'string' && data.length > 1000) {
    const largeContentData: SseDataWithLargeContent = {
      _large_content: true,
      contentId: 'content-123',
      length: data.length,
    };
    return largeContentData;
  }

  return data;
}
