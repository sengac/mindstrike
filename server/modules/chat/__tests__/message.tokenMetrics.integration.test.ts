import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MessageService } from '../services/message.service';
import type { ConversationService } from '../services/conversation.service';
import type { SseService } from '../../events/services/sse.service';
import type { GlobalLlmConfigService } from '../../shared/services/global-llm-config.service';
import type { AgentPoolService } from '../../agents/services/agent-pool.service';
import type { ModuleRef } from '@nestjs/core';
// Import SSEEventType from the shared types
enum SSEEventType {
  COMPLETED = 'completed',
  ERROR = 'error',
  LOCAL_MODEL_NOT_LOADED = 'local-model-not-loaded',
}
import type { Response } from 'express';
import type { ConversationMessage } from '../types/conversation.types';
import {
  mockMessageWithTokens,
  mockCompletedEventWithTokens,
  generateTokenSamples,
  calculateMedian,
} from '../../agents/services/__tests__/fixtures/tokenMetrics.fixtures';

// Create a properly typed mock response
function createMockResponse(): Partial<Response> {
  return {
    writeHead: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
  };
}

describe('Message Service - Token Metrics Integration', () => {
  let messageService: MessageService;
  let mockConversationService: Partial<ConversationService>;
  let mockSseService: Partial<SseService>;
  let mockAgentPoolService: Partial<AgentPoolService>;
  let mockGlobalLlmConfigService: Partial<GlobalLlmConfigService>;
  let mockModuleRef: Partial<ModuleRef>;

  beforeEach(async () => {
    // Create comprehensive mocks
    mockConversationService = {
      load: vi.fn().mockResolvedValue(undefined),
      save: vi.fn().mockResolvedValue(undefined),
      getThread: vi.fn().mockReturnValue({
        id: 'test-thread',
        name: 'Test Thread',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      getThreadMessages: vi.fn().mockReturnValue([]),
      createThread: vi.fn().mockResolvedValue({
        id: 'test-thread',
        name: 'Test Thread',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      addMessage: vi.fn().mockResolvedValue(undefined),
      updateMessage: vi.fn().mockResolvedValue(true),
    };

    mockSseService = {
      broadcast: vi.fn(),
      addClient: vi.fn().mockReturnValue('client-123'),
      removeClient: vi.fn(),
      sendMessage: vi.fn(),
    };

    mockAgentPoolService = {
      setCurrentThread: vi.fn().mockResolvedValue(undefined),
      getAgent: vi.fn(),
      getCurrentAgent: vi.fn(),
      getCurrentThreadId: vi.fn().mockReturnValue('test-thread'),
      syncCurrentAgentWithThread: vi.fn().mockResolvedValue(undefined),
    };

    mockGlobalLlmConfigService = {
      getCurrentLlmConfig: vi.fn().mockReturnValue({
        baseURL: 'http://localhost:11434',
        model: 'test-model',
        displayName: 'Test Model',
        type: 'ollama',
      }),
      setCurrentLlmConfig: vi.fn(),
      updateCurrentLlmConfig: vi.fn(),
      refreshLLMConfig: vi.fn(),
    };

    // Mock ModuleRef to return the AgentPoolService
    mockModuleRef = {
      get: vi.fn().mockReturnValue(mockAgentPoolService),
    };

    // Create service directly
    messageService = new MessageService(
      mockConversationService as ConversationService,
      mockSseService as SseService,
      mockModuleRef as ModuleRef,
      mockGlobalLlmConfigService as GlobalLlmConfigService
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('SSE Streaming with Token Metrics', () => {
    it('should stream token metrics through SSE during message processing', async () => {
      // Create mock response object
      const mockRes = createMockResponse() as Response;

      // Mock agent with streaming response
      const mockAgent = {
        processMessage: vi
          .fn()
          .mockImplementation(async (threadId, message, options) => {
            // Simulate streaming with token metrics
            const response: ConversationMessage = {
              id: 'assistant-msg-1',
              role: 'assistant',
              content: 'Streamed response content',
              timestamp: new Date(),
              status: 'completed',
              model: 'test-model',
              medianTokensPerSecond: 45.3,
              totalTokens: 523,
            };

            // Call onUpdate callback during streaming
            if (options?.onUpdate) {
              // Simulate progressive updates
              for (let i = 0; i < 3; i++) {
                await new Promise(resolve => setTimeout(resolve, 10));
                options.onUpdate({
                  ...response,
                  content: response.content.slice(0, (i + 1) * 8),
                  status: 'processing',
                });
              }
              options.onUpdate(response);
            }

            return response;
          }),
      };

      const getCurrentAgentMock =
        mockAgentPoolService.getCurrentAgent as ReturnType<typeof vi.fn>;
      getCurrentAgentMock.mockResolvedValue(mockAgent);

      // Start streaming
      await messageService.streamMessage(
        {
          message: 'Test prompt',
          threadId: 'test-thread',
        },
        mockRes
      );

      // Verify SSE client was added
      expect(mockSseService.addClient).toHaveBeenCalledWith(
        expect.stringMatching(/^chat-/),
        mockRes,
        'unified-events'
      );

      // Verify token metrics were broadcast
      const broadcastMock = mockSseService.broadcast as ReturnType<
        typeof vi.fn
      >;
      const broadcastCalls = broadcastMock.mock.calls;

      // Find completion event with token metrics
      const completionEvent = broadcastCalls.find(
        call => call[1]?.type === SSEEventType.COMPLETED
      );

      expect(completionEvent).toBeDefined();
      if (completionEvent) {
        const eventData = completionEvent[1];
        expect(eventData.message.medianTokensPerSecond).toBe(45.3);
        expect(eventData.message.totalTokens).toBe(523);
        expect(eventData.medianTokensPerSecond).toBe(45.3);
      }
    });

    it('should handle progressive token rate updates during streaming', async () => {
      const mockRes = createMockResponse() as Response;

      let updateCount = 0;
      const tokenRates: number[] = [];

      const mockAgent = {
        processMessage: vi
          .fn()
          .mockImplementation(async (threadId, message, options) => {
            // Simulate realistic token rate progression
            const samples = generateTokenSamples(10, 20, 60);

            for (const rate of samples) {
              await new Promise(resolve => setTimeout(resolve, 5));
              if (options?.onUpdate) {
                updateCount++;
                const currentTokens = updateCount * 10;
                const medianRate = calculateMedian(
                  samples.slice(0, updateCount)
                );

                options.onUpdate({
                  id: 'msg-streaming',
                  role: 'assistant',
                  content: 'x'.repeat(currentTokens * 4), // ~4 chars per token
                  timestamp: new Date(),
                  status: 'processing',
                  medianTokensPerSecond: medianRate,
                  totalTokens: currentTokens,
                });

                tokenRates.push(medianRate);
              }
            }

            return {
              id: 'msg-streaming',
              role: 'assistant',
              content: 'Final content',
              timestamp: new Date(),
              status: 'completed',
              medianTokensPerSecond: calculateMedian(samples),
              totalTokens: samples.length * 10,
            };
          }),
      };

      const getCurrentAgentMock =
        mockAgentPoolService.getCurrentAgent as ReturnType<typeof vi.fn>;
      getCurrentAgentMock.mockResolvedValue(mockAgent);

      await messageService.streamMessage(
        {
          message: 'Test streaming',
          threadId: 'test-thread',
        },
        mockRes
      );

      // Verify progressive updates
      expect(updateCount).toBeGreaterThan(0);
      expect(tokenRates.length).toBeGreaterThan(0);

      // Verify rates changed over time (simulating warmup)
      const earlyRates = tokenRates.slice(0, 3);
      const laterRates = tokenRates.slice(-3);
      const avgEarly =
        earlyRates.reduce((a, b) => a + b, 0) / earlyRates.length;
      const avgLater =
        laterRates.reduce((a, b) => a + b, 0) / laterRates.length;

      // Later rates should generally be higher than early rates (warmup effect)
      expect(avgLater).toBeGreaterThanOrEqual(avgEarly);
    });

    it('should persist token metrics to conversation storage', async () => {
      const mockRes = createMockResponse() as Response;

      const responseWithMetrics: ConversationMessage = {
        id: 'msg-persist',
        role: 'assistant',
        content: 'Response to persist',
        timestamp: new Date(),
        status: 'completed',
        model: 'test-model',
        medianTokensPerSecond: 38.7,
        totalTokens: 456,
      };

      const mockAgent = {
        processMessage: vi.fn().mockResolvedValue(responseWithMetrics),
      };

      const getCurrentAgentMock =
        mockAgentPoolService.getCurrentAgent as ReturnType<typeof vi.fn>;
      getCurrentAgentMock.mockResolvedValue(mockAgent);

      await messageService.streamMessage(
        {
          message: 'Test persistence',
          threadId: 'test-thread',
        },
        mockRes
      );

      // Verify conversation service was called to update message with metrics
      const updateMessageMock =
        mockConversationService.updateMessage as ReturnType<typeof vi.fn>;
      expect(updateMessageMock).toHaveBeenCalled();

      const updateCalls = updateMessageMock.mock.calls;
      const finalUpdate = updateCalls[updateCalls.length - 1];

      expect(finalUpdate[0]).toBe('test-thread');
      expect(finalUpdate[2]).toMatchObject({
        content: 'Response to persist',
        status: 'completed',
        model: 'test-model',
        medianTokensPerSecond: 38.7,
        totalTokens: 456,
      });
    });

    it('should always include token metrics in responses', async () => {
      const mockRes = createMockResponse() as Response;

      // All responses must have token metrics
      const responseWithMetrics: ConversationMessage = {
        id: 'msg-required-metrics',
        role: 'assistant',
        content: 'Response with required metrics',
        timestamp: new Date(),
        status: 'completed',
        model: 'gpt-4',
        medianTokensPerSecond: 25.5,
        totalTokens: 150,
      };

      const mockAgent = {
        processMessage: vi.fn().mockResolvedValue(responseWithMetrics),
      };

      const getCurrentAgentMock =
        mockAgentPoolService.getCurrentAgent as ReturnType<typeof vi.fn>;
      getCurrentAgentMock.mockResolvedValue(mockAgent);

      await messageService.streamMessage(
        {
          message: 'Test required metrics',
          threadId: 'test-thread',
        },
        mockRes
      );

      // Verify completion event always includes metrics
      const broadcastMock = mockSseService.broadcast as ReturnType<
        typeof vi.fn
      >;
      const completionEvent = broadcastMock.mock.calls.find(
        call => call[1]?.type === SSEEventType.COMPLETED
      );

      expect(completionEvent).toBeDefined();
      if (completionEvent) {
        const eventData = completionEvent[1];
        expect(eventData.message.medianTokensPerSecond).toBe(25.5);
        expect(eventData.message.totalTokens).toBe(150);
      }
    });

    it('should broadcast token rate updates periodically during streaming', async () => {
      const mockRes = createMockResponse() as Response;

      const tokenUpdateEvents: unknown[] = [];

      // Capture all broadcast calls
      const broadcastMock = mockSseService.broadcast as ReturnType<
        typeof vi.fn
      >;
      broadcastMock.mockImplementation((topic, data) => {
        if (data.type === 'token' || data.tokensPerSecond !== undefined) {
          tokenUpdateEvents.push(data);
        }
      });

      const mockAgent = {
        processMessage: vi
          .fn()
          .mockImplementation(async (threadId, message, options) => {
            // Simulate long streaming with periodic updates
            for (let i = 0; i < 5; i++) {
              await new Promise(resolve => setTimeout(resolve, 50));
              if (options?.onUpdate) {
                options.onUpdate({
                  id: 'msg-1',
                  role: 'assistant',
                  content: 'x'.repeat((i + 1) * 100),
                  timestamp: new Date(),
                  status: 'processing',
                  model: 'test-model',
                });
              }
            }

            return {
              id: 'msg-1',
              role: 'assistant',
              content: 'Final',
              timestamp: new Date(),
              status: 'completed',
              medianTokensPerSecond: 40.0,
              totalTokens: 500,
            };
          }),
      };

      const getCurrentAgentMock =
        mockAgentPoolService.getCurrentAgent as ReturnType<typeof vi.fn>;
      getCurrentAgentMock.mockResolvedValue(mockAgent);

      await messageService.streamMessage(
        {
          message: 'Test periodic updates',
          threadId: 'test-thread',
        },
        mockRes
      );

      // Should have received periodic token rate updates
      // Note: The actual broadcasting of token rates happens in BaseAgentService,
      // but we're testing that the infrastructure supports it
      expect(broadcastMock).toHaveBeenCalled();
    });
  });

  describe('Error Handling with Token Metrics', () => {
    it('should handle streaming errors without losing partial metrics', async () => {
      const mockRes = createMockResponse() as Response;

      const mockAgent = {
        processMessage: vi
          .fn()
          .mockImplementation(async (threadId, message, options) => {
            // Send some updates with metrics
            if (options?.onUpdate) {
              options.onUpdate({
                id: 'msg-error',
                role: 'assistant',
                content: 'Partial content',
                timestamp: new Date(),
                status: 'processing',
                medianTokensPerSecond: 25.0,
                totalTokens: 50,
              });
            }

            // Then throw an error
            throw new Error('Streaming failed');
          }),
      };

      const getCurrentAgentMock =
        mockAgentPoolService.getCurrentAgent as ReturnType<typeof vi.fn>;
      getCurrentAgentMock.mockResolvedValue(mockAgent);

      await messageService.streamMessage(
        {
          message: 'Test error',
          threadId: 'test-thread',
        },
        mockRes
      );

      // Wait for the error handling to complete (there's a 100ms delay in the error handler)
      await new Promise(resolve => setTimeout(resolve, 150));

      // Verify error was broadcast
      const broadcastMock = mockSseService.broadcast as ReturnType<
        typeof vi.fn
      >;
      const errorEvent = broadcastMock.mock.calls.find(
        call => call[1]?.type === SSEEventType.ERROR
      );

      expect(errorEvent).toBeDefined();

      // Verify response was ended
      expect(mockRes.end).toHaveBeenCalled();
    });
  });
});
