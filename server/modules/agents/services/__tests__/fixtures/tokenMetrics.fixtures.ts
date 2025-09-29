import type { ConversationMessage } from '../../../chat/types/conversation.types';

/**
 * Test fixtures for token metrics feature
 */

// Sample token rate data simulating real streaming
export const mockTokenRateSamples = [
  10.5, // Initial slow rate
  15.3,
  22.7,
  35.4,
  42.1, // Peak performance
  41.8,
  40.2,
  38.5,
  36.7,
  30.2, // Slowing down
];

// Expected median from above samples (sorted middle value)
export const expectedMedianTokenRate = 37.6; // Between 36.7 and 38.5

// Mock message with token metrics
export const mockMessageWithTokens: ConversationMessage = {
  id: 'msg-123',
  role: 'assistant',
  content: 'This is a test response with token metrics',
  timestamp: new Date('2024-01-01T12:00:00Z'),
  status: 'completed',
  model: 'gpt-4',
  medianTokensPerSecond: 37.6,
  totalTokens: 425,
};

// Mock message with minimal token metrics
export const mockMessageWithMinimalTokens: ConversationMessage = {
  id: 'msg-minimal',
  role: 'assistant',
  content: 'Message with minimal token metrics',
  timestamp: new Date('2024-01-01T11:00:00Z'),
  status: 'completed',
  model: 'gpt-3.5-turbo',
  medianTokensPerSecond: 5.0,
  totalTokens: 10,
};

// Mock streaming chunks for testing
export const mockStreamChunks = [
  { content: 'Hello', timestamp: 0 },
  { content: ', ', timestamp: 100 },
  { content: 'this ', timestamp: 200 },
  { content: 'is ', timestamp: 300 },
  { content: 'a ', timestamp: 400 },
  { content: 'streaming ', timestamp: 500 },
  { content: 'response', timestamp: 600 },
  { content: '!', timestamp: 700 },
];

// Mock SSE event with token metrics
export const mockCompletedEventWithTokens = {
  type: 'completed',
  message: {
    id: 'msg-456',
    content: 'Full response content',
    timestamp: new Date('2024-01-01T12:30:00Z'),
    status: 'completed',
    model: 'claude-3-opus',
    medianTokensPerSecond: 45.2,
    totalTokens: 512,
  },
  threadId: 'thread-123',
};

// Mock agent response with tool calls and tokens
export const mockAgentResponseWithTokens = {
  id: 'agent-msg-789',
  content: 'I found the information you requested.',
  timestamp: new Date('2024-01-01T13:00:00Z'),
  status: 'completed' as const,
  model: 'gpt-4-turbo',
  medianTokensPerSecond: 52.3,
  totalTokens: 678,
  toolCalls: [
    {
      id: 'tool-1',
      name: 'search',
      parameters: { query: 'test query' },
    },
  ],
  toolResults: [
    {
      name: 'search',
      result: { hits: 5, results: ['result1', 'result2'] },
    },
  ],
};

// Helper to generate mock token samples
export function generateTokenSamples(
  count: number,
  minRate: number = 10,
  maxRate: number = 60
): number[] {
  const samples: number[] = [];
  for (let i = 0; i < count; i++) {
    // Simulate realistic pattern: slow start, peak in middle, slight decline at end
    const progress = i / count;
    let rate: number;
    if (progress < 0.2) {
      // Warmup phase
      rate = minRate + (maxRate - minRate) * 0.3 * (progress / 0.2);
    } else if (progress < 0.7) {
      // Peak performance
      rate =
        minRate + (maxRate - minRate) * (0.3 + 0.5 * ((progress - 0.2) / 0.5));
    } else {
      // Cooldown phase
      rate =
        minRate + (maxRate - minRate) * (0.8 - 0.2 * ((progress - 0.7) / 0.3));
    }
    samples.push(Math.round(rate * 10) / 10); // Round to 1 decimal
  }
  return samples;
}

// Helper to calculate expected median
export function calculateMedian(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// Mock thread with messages including token metrics
export const mockThreadWithTokenMetrics = {
  id: 'thread-with-tokens',
  name: 'Token Metrics Test Thread',
  messages: [
    {
      id: 'user-1',
      role: 'user' as const,
      content: 'Generate a long response',
      timestamp: new Date('2024-01-01T12:00:00Z'),
      status: 'completed' as const,
    },
    mockMessageWithTokens,
    {
      id: 'user-2',
      role: 'user' as const,
      content: 'Another question',
      timestamp: new Date('2024-01-01T12:01:00Z'),
      status: 'completed' as const,
    },
    {
      id: 'assistant-2',
      role: 'assistant' as const,
      content: 'Another response with different metrics',
      timestamp: new Date('2024-01-01T12:01:30Z'),
      status: 'completed' as const,
      model: 'claude-3-sonnet',
      medianTokensPerSecond: 28.9,
      totalTokens: 234,
    },
  ],
  createdAt: new Date('2024-01-01T11:00:00Z'),
  updatedAt: new Date('2024-01-01T12:01:30Z'),
};
