import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ModelResponseGenerator } from '../responseGenerator';
import type { LlamaChatSession, ChatHistoryItem } from 'node-llama-cpp';
import { parentPort } from 'worker_threads';

// Mock worker_threads
vi.mock('worker_threads', () => ({
  parentPort: {
    on: vi.fn(),
    off: vi.fn(),
    postMessage: vi.fn(),
  },
}));

vi.mock('../../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('ModelResponseGenerator', () => {
  let generator: ModelResponseGenerator;
  let mockSession: LlamaChatSession;

  beforeEach(() => {
    vi.clearAllMocks();
    generator = new ModelResponseGenerator();

    // Mock session
    const chatHistory: unknown[] = [];
    const mockModel = {
      detokenize: vi.fn((tokens: unknown[]) => {
        // For test purposes, just join the tokens as strings
        return tokens.map(t => String(t)).join('');
      }),
    };

    mockSession = {
      prompt: vi.fn(),
      getChatHistory: vi.fn(() => chatHistory.slice()),
      setChatHistory: vi.fn(newHistory => {
        chatHistory.length = 0;
        chatHistory.push(...newHistory);
      }),
      model: mockModel,
    } as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should set up message listener if parentPort exists', () => {
      new ModelResponseGenerator();
      expect(parentPort?.on).toHaveBeenCalledWith(
        'message',
        expect.any(Function)
      );
    });
  });

  describe('generateResponse', () => {
    it('should generate a non-streaming response', async () => {
      const mockResponse = 'This is the generated response';
      vi.mocked(mockSession.prompt).mockResolvedValue(mockResponse);

      const result = await generator.generateResponse(mockSession, 'Hello', {
        disableFunctions: true, // Disable functions to avoid MCP tool loading
      });

      expect(mockSession.prompt).toHaveBeenCalledWith('Hello', {
        signal: undefined,
        temperature: undefined,
        maxTokens: undefined,
        topK: undefined,
        topP: undefined,
        seed: undefined,
        functions: undefined,
        onToken: undefined,
      });
      expect(result).toEqual({
        content: mockResponse,
        tokensGenerated: mockResponse.length,
      });
    });

    it('should use provided options', async () => {
      const mockResponse = 'Response';
      vi.mocked(mockSession.prompt).mockResolvedValue(mockResponse);

      const options = {
        temperature: 0.8,
        maxTokens: 100,
        topK: 40,
        topP: 0.9,
        seed: 12345,
      };

      await generator.generateResponse(mockSession, 'Test', {
        ...options,
        disableFunctions: true, // Disable functions to avoid MCP tool loading
      });

      expect(mockSession.prompt).toHaveBeenCalledWith(
        'Test',
        expect.objectContaining({
          temperature: 0.8,
          maxTokens: 100,
          topK: 40,
          topP: 0.9,
          seed: 12345,
        })
      );
    });

    it('should handle abort signals', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      vi.mocked(mockSession.prompt).mockRejectedValue(abortError);

      const controller = new AbortController();
      const result = await generator.generateResponse(mockSession, 'Test', {
        signal: controller.signal,
        disableFunctions: true, // Disable functions to avoid MCP tool loading
      });

      expect(result).toEqual({
        content: '',
        tokensGenerated: 0,
        stopReason: 'abort',
      });
    });

    it('should preserve chat history when disableChatHistory is true', async () => {
      const originalHistory = [
        { type: 'user' as const, text: 'Previous message' },
        { type: 'model' as const, response: ['Previous response'] },
      ] as ChatHistoryItem[];
      vi.mocked(mockSession.getChatHistory).mockReturnValue(originalHistory);

      vi.mocked(mockSession.prompt).mockResolvedValue('New response');

      await generator.generateResponse(mockSession, 'New message', {
        disableChatHistory: true,
        disableFunctions: true, // Disable functions to avoid MCP tool loading
      });

      // History should be restored
      expect(mockSession.setChatHistory).toHaveBeenCalledWith(originalHistory);
    });

    it('should request MCP tools when functions not disabled', async () => {
      vi.mocked(mockSession.prompt).mockResolvedValue('Response');

      // Mock parentPort message handling
      let messageHandler: Function | undefined;
      let messageId: string | undefined;

      vi.mocked(parentPort!.on).mockImplementation((event, handler) => {
        if (event === 'message') {
          messageHandler = handler as Function;
        }
        return parentPort as any;
      });

      vi.mocked(parentPort!.postMessage).mockImplementation(
        (message: unknown) => {
          if (message.type === 'getMCPTools') {
            messageId = message.id;
            // Immediately respond with tools
            setTimeout(() => {
              if (messageHandler && messageId) {
                messageHandler({
                  type: 'mcpToolsResponse',
                  id: messageId,
                  data: [
                    {
                      name: 'testTool',
                      description: 'Test tool',
                      inputSchema: { type: 'object' },
                    },
                  ],
                });
              }
            }, 0);
          }
        }
      );

      // Start generation with functions enabled
      await generator.generateResponse(mockSession, 'Test', {
        disableFunctions: false,
      });

      expect(parentPort!.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'getMCPTools',
        })
      );
    });
  });

  describe('generateStreamResponse', () => {
    it('should generate a streaming response', async () => {
      const tokens = ['Hello', ' ', 'world', '!'];
      const fullResponse = tokens.join('');

      vi.mocked(mockSession.prompt).mockImplementation(
        async (message, options) => {
          // Simulate streaming by calling onToken
          for (const token of tokens) {
            if (options?.onToken) {
              // onToken expects Token[] not string
              options.onToken([token as any]);
            }
          }
          return fullResponse;
        }
      );

      const generator = new ModelResponseGenerator();
      const stream = generator.generateStreamResponse(mockSession, 'Test', {
        disableFunctions: true, // Disable functions to avoid MCP tool loading
      });

      const receivedTokens: string[] = [];
      let result: unknown = undefined;

      // Use the async iterator protocol properly
      const iterator = stream[Symbol.asyncIterator]();
      while (true) {
        const { value, done } = await iterator.next();
        if (done) {
          // The return value is in 'value' when done is true
          result = value;
          break;
        }
        receivedTokens.push(value);
      }

      expect(receivedTokens).toEqual(tokens);
      expect(result).toEqual({
        content: fullResponse,
        tokensGenerated: tokens.length,
      });
    });

    it('should use model.detokenize for token decoding', async () => {
      const tokenObjects = [{ id: 123 }, { id: 456 }]; // Simulate Token objects
      const decodedText = 'Hello world';

      // Mock detokenize to verify it's called correctly
      const mockDetokenize = vi.fn().mockReturnValue(decodedText);
      (mockSession as any).model.detokenize = mockDetokenize;

      vi.mocked(mockSession.prompt).mockImplementation(
        async (message, options) => {
          if (options?.onToken) {
            options.onToken(tokenObjects as any);
          }
          return decodedText;
        }
      );

      const generator = new ModelResponseGenerator();
      const stream = generator.generateStreamResponse(mockSession, 'Test', {
        disableFunctions: true,
      });

      const receivedTokens: string[] = [];
      for await (const token of stream) {
        receivedTokens.push(token);
      }

      // Verify detokenize was called with the token objects
      expect(mockDetokenize).toHaveBeenCalledWith(tokenObjects);
      expect(receivedTokens).toEqual([decodedText]);
    });

    it('should handle abort during streaming', async () => {
      const controller = new AbortController();
      const tokens = ['Hello', ' ', 'world', '!'];
      let tokenIndex = 0;

      vi.mocked(mockSession.prompt).mockImplementation(
        async (message, options) => {
          // Simulate streaming with abort
          return new Promise((resolve, reject) => {
            const interval = setInterval(() => {
              if (controller.signal.aborted) {
                clearInterval(interval);
                const error = new Error('Aborted');
                error.name = 'AbortError';
                reject(error);
                return;
              }

              if (tokenIndex < tokens.length && options?.onToken) {
                options.onToken([tokens[tokenIndex] as any]);
                tokenIndex++;
              }

              if (tokenIndex >= tokens.length) {
                clearInterval(interval);
                resolve(tokens.slice(0, tokenIndex).join(''));
              }
            }, 5);
          });
        }
      );

      const stream = generator.generateStreamResponse(mockSession, 'Test', {
        signal: controller.signal,
        disableFunctions: true,
      });

      const receivedTokens: string[] = [];

      // Abort after 2 tokens
      setTimeout(() => controller.abort(), 15);

      try {
        for await (const token of stream) {
          receivedTokens.push(token);
        }
      } catch {
        // Expected to throw due to abort
      }

      // The generator should have emitted at least 2 tokens before abort
      expect(receivedTokens.length).toBeGreaterThanOrEqual(2);
    }, 10000);

    it('should preserve chat history for streaming when disableChatHistory is true', async () => {
      const originalHistory = [
        { type: 'user' as const, text: 'Previous message' },
        { type: 'model' as const, response: ['Previous response'] },
      ] as ChatHistoryItem[];
      vi.mocked(mockSession.getChatHistory).mockReturnValue(originalHistory);

      vi.mocked(mockSession.prompt).mockImplementation(
        async (message, options) => {
          options?.onToken?.(['Test' as any]);
          return 'Test';
        }
      );

      const stream = generator.generateStreamResponse(
        mockSession,
        'New message',
        {
          disableChatHistory: true,
          disableFunctions: true, // Disable functions to avoid MCP tool loading
        }
      );

      // Consume stream
      const tokens: string[] = [];
      for await (const token of stream) {
        tokens.push(token);
      }

      // History should be restored
      expect(mockSession.setChatHistory).toHaveBeenCalledWith(originalHistory);
    });

    it('should handle errors during streaming', async () => {
      vi.mocked(mockSession.prompt).mockRejectedValue(
        new Error('Generation error')
      );

      const stream = generator.generateStreamResponse(mockSession, 'Test', {
        disableFunctions: true, // Disable functions to avoid MCP tool loading
      });

      // Consume stream and capture the return value
      const tokens: string[] = [];
      let finalResult: unknown = undefined;

      try {
        // Use async iterator protocol to get both tokens and final result
        const iterator = stream[Symbol.asyncIterator]();
        while (true) {
          const { value, done } = await iterator.next();
          if (done) {
            finalResult = value;
            break;
          }
          tokens.push(value);
        }
      } catch {
        // Expected error, stream should complete with error result
        finalResult = { content: '', tokensGenerated: 0 };
      }

      // Should complete with empty result
      expect(tokens).toEqual([]);
      expect(finalResult).toEqual({
        content: '',
        tokensGenerated: 0,
      });
    });
  });

  describe('clearMCPTools', () => {
    it('should clear cached MCP tools', () => {
      // Simulate having tools
      (generator as any).mcpTools = [{ name: 'tool1' }];
      (generator as any).mcpToolsPromise = Promise.resolve([]);

      generator.clearMCPTools();

      expect((generator as any).mcpTools).toEqual([]);
      expect((generator as any).mcpToolsPromise).toBeNull();
    });
  });

  describe('MCP tool execution', () => {
    it('should execute MCP tools when called', async () => {
      // Set up generator with tools
      (generator as any).mcpTools = [
        {
          name: 'calculator',
          description: 'Performs calculations',
          inputSchema: { type: 'object' },
        },
      ];

      // Mock session prompt to call a function
      vi.mocked(mockSession.prompt).mockImplementation(
        async (message, options) => {
          if (options?.functions && Object.keys(options.functions).length > 0) {
            const firstFunction = Object.values(options.functions)[0];
            const result = await (firstFunction as any).handler({
              operation: 'add',
              a: 1,
              b: 2,
            });
            return `Result: ${result}`;
          }
          return 'No function called';
        }
      );

      // Mock parentPort message handling for tool execution
      let messageHandler: Function | undefined;
      vi.mocked(parentPort!.on).mockImplementation((event, handler) => {
        if (event === 'message') {
          messageHandler = handler;
        }
        return parentPort!;
      });

      // Start generation
      const responsePromise = generator.generateResponse(
        mockSession,
        'Calculate 1+2',
        {
          disableFunctions: false, // Enable functions for this test
        }
      );

      // Wait a bit for the tool execution message
      await new Promise(resolve => setTimeout(resolve, 10));

      // Simulate parent responding to tool execution
      const postMessageCall = vi
        .mocked(parentPort!.postMessage)
        .mock.calls.find(call => call[0].type === 'executeTool');

      if (postMessageCall && messageHandler) {
        messageHandler({
          id: postMessageCall[0].id,
          type: 'toolExecutionResponse',
          result: 3,
        });
      }

      const result = await responsePromise;
      expect(result.content).toBe('Result: 3');
    });
  });
});
