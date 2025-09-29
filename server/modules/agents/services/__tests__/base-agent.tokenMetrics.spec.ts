import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BaseAgentService } from '../base-agent.service';
import { McpManagerService } from '../../../mcp/services/mcp-manager.service';
import { SseService } from '../../../events/services/sse.service';
import { LfsService } from '../../../content/services/lfs.service';
import { ConversationService } from '../../../chat/services/conversation.service';
import type {
  ConversationMessage,
  ImageAttachment,
  NotesAttachment,
} from '../../../chat/types/conversation.types';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
  mockTokenRateSamples,
  expectedMedianTokenRate,
  generateTokenSamples,
  calculateMedian,
  mockMessageWithTokens,
  mockAgentResponseWithTokens,
} from './fixtures/tokenMetrics.fixtures';

// Don't use vi.mock when using TestingModule - it interferes with dependency injection

interface ProcessMessageOptions {
  images?: ImageAttachment[];
  notes?: NotesAttachment[];
  onUpdate?: (message: ConversationMessage) => void;
  userMessageId?: string;
  includePriorConversation?: boolean;
  signal?: AbortSignal;
}

// Create test implementation
class TestAgentService extends BaseAgentService {
  public tokenRateSamples: number[] = [];
  public lastMedianCalculated?: number;
  public lastTotalTokens?: number;

  // Expose chatModel for testing
  public testChatModel?: BaseChatModel;

  constructor(
    mcpManagerService: McpManagerService,
    sseService: SseService,
    lfsService: LfsService,
    conversationService: ConversationService
  ) {
    super(mcpManagerService, sseService, lfsService, conversationService);
  }

  createSystemPrompt(): string {
    return 'Test system prompt';
  }

  getDefaultPrompt(): string {
    return 'Default test prompt';
  }

  // Expose protected method for testing
  public async testProcessMessage(
    threadId: string,
    userMessage: string,
    options?: ProcessMessageOptions
  ): Promise<ConversationMessage> {
    return this.processMessage(threadId, userMessage, options);
  }

  // Helper to set chat model for testing
  public setChatModel(model: unknown): void {
    // Use Object.defineProperty to bypass TypeScript checking
    Object.defineProperty(this, 'chatModel', {
      value: model,
      writable: true,
      configurable: true,
    });
  }
}

describe('BaseAgentService - Token Metrics', () => {
  let service: TestAgentService;
  let mockSseService: Partial<SseService>;
  let mockConversationService: Partial<ConversationService>;
  let mockMcpManagerService: Partial<McpManagerService>;
  let mockLfsService: Partial<LfsService>;

  beforeEach(async () => {
    // Create mocks
    mockSseService = {
      broadcast: vi.fn(),
    };

    // Track messages added to the conversation
    const threadMessages: ConversationMessage[] = [];

    mockConversationService = {
      load: vi.fn().mockResolvedValue(undefined),
      save: vi.fn().mockResolvedValue(undefined),
      getThread: vi.fn().mockReturnValue({
        id: 'test-thread',
        name: 'Test Thread',
        messages: threadMessages,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      getThreadMessages: vi.fn().mockImplementation(() => threadMessages),
      createThread: vi.fn().mockResolvedValue({
        id: 'test-thread',
        name: 'Test Thread',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      addMessage: vi.fn().mockImplementation((threadId, message) => {
        threadMessages.push(message);
        return Promise.resolve(undefined);
      }),
      updateMessage: vi.fn().mockImplementation((threadId, msgId, updates) => {
        const msg = threadMessages.find(m => m.id === msgId);
        if (msg) {
          Object.assign(msg, updates);
        }
        return Promise.resolve(undefined);
      }),
      clearThread: vi.fn().mockResolvedValue(undefined),
      deleteMessage: vi.fn().mockResolvedValue(true),
      updateWorkspaceRoot: vi.fn(),
    };

    mockMcpManagerService = {
      getLangChainTools: vi.fn().mockReturnValue([]),
    };

    mockLfsService = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: TestAgentService,
          useFactory: (
            mcpManagerService: McpManagerService,
            sseService: SseService,
            lfsService: LfsService,
            conversationService: ConversationService
          ) => {
            return new TestAgentService(
              mcpManagerService,
              sseService,
              lfsService,
              conversationService
            );
          },
          inject: [
            McpManagerService,
            SseService,
            LfsService,
            ConversationService,
          ],
        },
        { provide: McpManagerService, useValue: mockMcpManagerService },
        { provide: SseService, useValue: mockSseService },
        { provide: LfsService, useValue: mockLfsService },
        { provide: ConversationService, useValue: mockConversationService },
      ],
    }).compile();

    service = module.get<TestAgentService>(TestAgentService);

    // Initialize the service
    await service.initialize({
      workspaceRoot: '/test',
      llmConfig: {
        baseURL: 'http://localhost:11434',
        model: 'test-model',
        type: 'ollama',
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Token Rate Calculation', () => {
    it('should calculate median token rate from samples', () => {
      const samples = [10, 20, 30, 40, 50];
      const median = calculateMedian(samples);
      expect(median).toBe(30);
    });

    it('should calculate median with even number of samples', () => {
      const samples = [10, 20, 30, 40];
      const median = calculateMedian(samples);
      expect(median).toBe(25); // (20 + 30) / 2
    });

    it('should handle single sample', () => {
      const samples = [42.5];
      const median = calculateMedian(samples);
      expect(median).toBe(42.5);
    });

    it('should generate realistic token rate patterns', () => {
      const samples = generateTokenSamples(100, 20, 60);

      // Check that samples follow expected pattern
      expect(samples.length).toBe(100);

      // Early samples should be lower (warmup)
      const earlyAvg = samples.slice(0, 20).reduce((a, b) => a + b, 0) / 20;

      // Middle samples should be higher (peak)
      const middleAvg = samples.slice(40, 60).reduce((a, b) => a + b, 0) / 20;

      // Check that middle average is generally higher than early (warmup effect)
      // Due to randomness, we just check it's not drastically lower
      expect(middleAvg).toBeGreaterThan(earlyAvg * 0.9);

      // All samples should be within the min/max range
      const min = Math.min(...samples);
      const max = Math.max(...samples);
      expect(min).toBeGreaterThanOrEqual(15); // Allow some variance from specified 20
      expect(max).toBeLessThanOrEqual(65); // Allow some variance from specified 60
    });
  });

  describe('Message Processing with Token Metrics', () => {
    it('should track token metrics during streaming', async () => {
      // Mock the chat model stream
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield { content: 'Hello', timestamp: Date.now() };
          yield { content: ' world', timestamp: Date.now() + 100 };
          yield { content: '!', timestamp: Date.now() + 200 };
        },
      };

      // Mock chat model using helper method
      service.setChatModel({
        stream: vi.fn().mockResolvedValue(mockStream),
        bindTools: vi.fn().mockReturnThis(),
      });

      // Spy on updateMessage to capture token metrics
      let capturedMetrics: Partial<ConversationMessage> = {};
      mockConversationService.updateMessage = vi.fn(
        (threadId, msgId, updates) => {
          if (updates.medianTokensPerSecond !== undefined) {
            capturedMetrics = updates;
          }
          return Promise.resolve();
        }
      );

      // Process message
      await service.testProcessMessage('test-thread', 'Test message', {
        onUpdate: vi.fn(),
      });

      // Verify token metrics were calculated and saved
      expect(capturedMetrics.medianTokensPerSecond).toBeDefined();
      expect(capturedMetrics.totalTokens).toBeDefined();
      expect(capturedMetrics.medianTokensPerSecond).toBeGreaterThan(0);
      expect(capturedMetrics.totalTokens).toBeGreaterThan(0);
    });

    it('should broadcast token metrics in SSE events', async () => {
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield { content: 'Test response content' };
        },
      };

      service.setChatModel({
        stream: vi.fn().mockResolvedValue(mockStream),
        bindTools: vi.fn().mockReturnThis(),
      });

      await service.testProcessMessage('test-thread', 'Test message');

      // Check that SSE broadcast includes token metrics
      const broadcastCalls = (
        mockSseService.broadcast as ReturnType<typeof vi.fn>
      ).mock.calls;

      // The broadcast happens multiple times - find any broadcast with completed status
      const hasTokenMetricsBroadcast = broadcastCalls.some(
        (call: unknown[]) => {
          const data = call[1] as { entity?: ConversationMessage };
          if (data?.entity?.status === 'completed') {
            // Check if this completed message has token metrics
            return (
              data.entity.medianTokensPerSecond !== undefined &&
              data.entity.totalTokens !== undefined
            );
          }
          return false;
        }
      );

      expect(hasTokenMetricsBroadcast).toBe(true);
    });

    it('should persist token metrics with message', async () => {
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield { content: 'Response with metrics' };
        },
      };

      service.setChatModel({
        stream: vi.fn().mockResolvedValue(mockStream),
        bindTools: vi.fn().mockReturnThis(),
      });

      await service.testProcessMessage('test-thread', 'Test message');

      // Verify updateMessage was called with token metrics
      const updateCalls = (
        mockConversationService.updateMessage as ReturnType<typeof vi.fn>
      ).mock.calls;
      const finalUpdate = updateCalls[updateCalls.length - 1] as [
        string,
        string,
        Partial<ConversationMessage>,
      ];

      expect(finalUpdate[2]).toMatchObject({
        content: 'Response with metrics',
        status: 'completed',
        medianTokensPerSecond: expect.any(Number),
        totalTokens: expect.any(Number),
      });
    });

    it('should always include token metrics in messages', async () => {
      // All messages should have token metrics
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield { content: 'Message with required metrics' };
        },
      };

      service.setChatModel({
        stream: vi.fn().mockResolvedValue(mockStream),
        bindTools: vi.fn().mockReturnThis(),
      });

      await service.testProcessMessage('test-thread', 'Test');

      const updateCalls = (
        mockConversationService.updateMessage as ReturnType<typeof vi.fn>
      ).mock.calls;
      const finalUpdate = updateCalls[updateCalls.length - 1] as [
        string,
        string,
        Partial<ConversationMessage>,
      ];

      // Verify metrics are always present
      expect(finalUpdate[2].medianTokensPerSecond).toBeDefined();
      expect(finalUpdate[2].totalTokens).toBeDefined();
      expect(typeof finalUpdate[2].medianTokensPerSecond).toBe('number');
      expect(typeof finalUpdate[2].totalTokens).toBe('number');
    });
  });

  describe('Token Counting', () => {
    it('should estimate tokens based on content length', async () => {
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          // 20 characters should be ~5 tokens (using 4 chars per token estimate)
          yield { content: 'This is twenty chars' };
        },
      };

      service.setChatModel({
        stream: vi.fn().mockResolvedValue(mockStream),
        bindTools: vi.fn().mockReturnThis(),
      });

      let capturedTokens = 0;
      mockConversationService.updateMessage = vi.fn(
        (threadId, msgId, updates: Partial<ConversationMessage>) => {
          if (updates.totalTokens) {
            capturedTokens = updates.totalTokens;
          }
          return Promise.resolve();
        }
      );

      await service.testProcessMessage('test-thread', 'Test');

      // Should be approximately 5 tokens (20 chars / 4)
      expect(capturedTokens).toBeGreaterThanOrEqual(5);
      expect(capturedTokens).toBeLessThanOrEqual(6); // Allow for rounding
    });

    it('should accumulate tokens across multiple chunks', async () => {
      const chunks = ['Hello', ' ', 'world', '!'];
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of chunks) {
            yield { content: chunk };
          }
        },
      };

      service.setChatModel({
        stream: vi.fn().mockResolvedValue(mockStream),
        bindTools: vi.fn().mockReturnThis(),
      });

      let finalTokenCount = 0;
      mockConversationService.updateMessage = vi.fn(
        (threadId, msgId, updates: Partial<ConversationMessage>) => {
          if (updates.totalTokens) {
            finalTokenCount = updates.totalTokens;
          }
          return Promise.resolve();
        }
      );

      await service.testProcessMessage('test-thread', 'Test');

      // "Hello world!" = 12 chars ≈ 3 tokens
      expect(finalTokenCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty response', async () => {
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield { content: '' };
        },
      };

      service.setChatModel({
        stream: vi.fn().mockResolvedValue(mockStream),
        bindTools: vi.fn().mockReturnThis(),
      });

      await service.testProcessMessage('test-thread', 'Test');

      const updateCalls = (
        mockConversationService.updateMessage as ReturnType<typeof vi.fn>
      ).mock.calls;
      const finalUpdate = updateCalls[updateCalls.length - 1] as [
        string,
        string,
        Partial<ConversationMessage>,
      ];

      // Empty content should result in minimal token count (possibly 1 for the empty message)
      expect(finalUpdate[2].totalTokens).toBeLessThanOrEqual(1);
    });

    it('should handle streaming interruption', async () => {
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield { content: 'Partial resp' };
          throw new Error('Stream interrupted');
        },
      };

      service.setChatModel({
        stream: vi.fn().mockResolvedValue(mockStream),
        bindTools: vi.fn().mockReturnThis(),
      });

      // The service catches errors and returns a message with error or cancelled status
      const result = await service.testProcessMessage('test-thread', 'Test');

      // Check that the error was handled and the message has appropriate status
      expect(['error', 'cancelled']).toContain(result.status);
      expect(result.content.toLowerCase()).toMatch(/error|cancelled|failed/);
    });

    it('should calculate median correctly with many samples', () => {
      const samples = generateTokenSamples(1000, 10, 100);
      const median = calculateMedian(samples);

      // Median should be somewhere in the middle range
      expect(median).toBeGreaterThan(30);
      expect(median).toBeLessThan(80);
    });
  });
});
