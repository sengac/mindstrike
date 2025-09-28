import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BaseAgentService } from '../base-agent.service';
import { McpManagerService } from '../../../mcp/services/mcp-manager.service';
import { SseService } from '../../../events/services/sse.service';
import { LfsService } from '../../../content/services/lfs.service';
import { ConversationService } from '../../../chat/services/conversation.service';
import { Logger } from '@nestjs/common';
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
} from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

// Mock all dependencies
vi.mock('../../../mcp/services/mcp-manager.service');
vi.mock('../../../events/services/sse.service');
vi.mock('../../../content/services/lfs.service');
vi.mock('../../../chat/services/conversation.service');

// Create a mock chat model that satisfies the type requirements
const createMockChatModel = (): BaseChatModel => {
  const mockModel = {
    invoke: vi.fn(),
    stream: vi.fn(),
    batch: vi.fn(),
    generate: vi.fn(),
    predict: vi.fn(),
    predictMessages: vi.fn(),
    call: vi.fn(),
    _modelType: vi.fn().mockReturnValue('mock'),
    _llmType: vi.fn().mockReturnValue('mock'),
    _generate: vi.fn(),
    _generateCached: vi.fn(),
    _combine: vi.fn(),
    _separateLLMOutput: vi.fn(),
    _getInvocationParams: vi.fn(),
    pipe: vi.fn(),
    getName: vi.fn().mockReturnValue('mock-model'),
    bind: vi.fn(),
    withConfig: vi.fn(),
    withRetry: vi.fn(),
    withFallbacks: vi.fn(),
    toJSON: vi.fn(),
    toJSONNotImplemented: vi.fn(),
    lc_serializable: false,
    lc_namespace: ['langchain', 'chat_models'],
    lc_id: ['langchain', 'chat_models', 'mock'],
    lc_kwargs: {},
    lc_runnable: true,
    name: 'mock-model',
    verbose: false,
    callbacks: undefined,
    tags: [],
    metadata: {},
    cache: undefined,
    callOptions: {},
    CallOptions: {},
    ParsedCallOptions: {},
    OutputType: {},
    get lc_attributes(): undefined {
      return undefined;
    },
    get lc_secrets(): undefined {
      return undefined;
    },
    get lc_aliases(): undefined {
      return undefined;
    },
  };
  return mockModel as BaseChatModel;
};

// Create a concrete implementation for testing
class TestAgentService extends BaseAgentService {
  constructor(
    mcpManagerService: McpManagerService,
    sseService: SseService,
    lfsService: LfsService,
    conversationService: ConversationService
  ) {
    super(mcpManagerService, sseService, lfsService, conversationService);

    // Initialize required properties
    this.config = {
      workspaceRoot: '/test/workspace',
      llmConfig: {
        baseURL: 'https://api.perplexity.ai',
        model: 'sonar',
        type: 'perplexity',
      },
    };
    this.systemPrompt = 'You are a helpful assistant.';
    // Mock chatModel - not needed for these tests but required by base class
    this.chatModel = createMockChatModel();
  }

  // Expose private methods for testing
  public testReorderMessagesForPerplexity(
    messages: BaseMessage[]
  ): BaseMessage[] {
    // Access private method through prototype
    const privateMethod = Object.getPrototypeOf(
      Object.getPrototypeOf(this)
    ).reorderMessagesForPerplexity;
    return privateMethod.call(this, messages);
  }

  public testCombineMessageContent(
    content1: string | Record<string, unknown> | unknown[],
    content2: string | Record<string, unknown> | unknown[]
  ): string {
    // Access private method through prototype
    const privateMethod = Object.getPrototypeOf(
      Object.getPrototypeOf(this)
    ).combineMessageContent;
    return privateMethod.call(this, content1, content2);
  }

  protected createSystemPrompt(): string {
    return 'You are a helpful assistant.';
  }
}

describe('BaseAgentService - Perplexity Message Ordering', () => {
  let service: TestAgentService;
  let module: TestingModule;

  beforeEach(async () => {
    const mockMcpManagerService = {
      getTools: vi.fn().mockReturnValue([]),
      listTools: vi.fn().mockReturnValue([]),
      callTool: vi.fn(),
    };

    const mockSseService = {
      broadcastToThread: vi.fn(),
      sendMessage: vi.fn(),
    };

    const mockLfsService = {
      getFileContent: vi.fn(),
      saveFile: vi.fn(),
    };

    const mockConversationService = {
      load: vi.fn(),
      getThread: vi.fn(),
      createThread: vi.fn(),
      addMessage: vi.fn(),
      getThreadMessages: vi.fn().mockReturnValue([]),
    };

    module = await Test.createTestingModule({
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
        {
          provide: McpManagerService,
          useValue: mockMcpManagerService,
        },
        {
          provide: SseService,
          useValue: mockSseService,
        },
        {
          provide: LfsService,
          useValue: mockLfsService,
        },
        {
          provide: ConversationService,
          useValue: mockConversationService,
        },
      ],
    }).compile();

    service = module.get<TestAgentService>(TestAgentService);
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
  });

  describe('reorderMessagesForPerplexity', () => {
    it('should ensure messages end with a user message', () => {
      const messages = [
        new SystemMessage('System prompt'),
        new HumanMessage('Hello'),
        new AIMessage('Hi there!'),
      ];

      const result = service.testReorderMessagesForPerplexity(messages);

      expect(result).toHaveLength(4);
      expect(result[0]).toBeInstanceOf(SystemMessage);
      expect(result[1]).toBeInstanceOf(HumanMessage);
      expect(result[2]).toBeInstanceOf(AIMessage);
      expect(result[3]).toBeInstanceOf(HumanMessage);
      expect(result[3].content).toBe('Please provide your response.');
    });

    it('should not add user message if already ends with user', () => {
      const messages = [
        new SystemMessage('System prompt'),
        new HumanMessage('Hello'),
        new AIMessage('Hi there!'),
        new HumanMessage('How are you?'),
      ];

      const result = service.testReorderMessagesForPerplexity(messages);

      expect(result).toHaveLength(4);
      expect(result[3]).toBeInstanceOf(HumanMessage);
      expect(result[3].content).toBe('How are you?');
    });

    it('should merge consecutive user messages', () => {
      const messages = [
        new SystemMessage('System prompt'),
        new HumanMessage('Question 1'),
        new HumanMessage('Question 2'),
        new HumanMessage('Question 3'),
        new AIMessage('Answer'),
      ];

      const result = service.testReorderMessagesForPerplexity(messages);

      expect(result).toHaveLength(4);
      expect(result[0]).toBeInstanceOf(SystemMessage);
      expect(result[1]).toBeInstanceOf(HumanMessage);
      expect(result[1].content).toBe('Question 1\n\nQuestion 2\n\nQuestion 3');
      expect(result[2]).toBeInstanceOf(AIMessage);
      expect(result[3]).toBeInstanceOf(HumanMessage);
      expect(result[3].content).toBe('Please provide your response.');
    });

    it('should merge consecutive assistant messages', () => {
      const messages = [
        new SystemMessage('System prompt'),
        new HumanMessage('Tell me a story'),
        new AIMessage('Once upon a time...'),
        new AIMessage('There was a brave knight.'),
        new AIMessage('He lived in a castle.'),
      ];

      const result = service.testReorderMessagesForPerplexity(messages);

      expect(result).toHaveLength(4);
      expect(result[0]).toBeInstanceOf(SystemMessage);
      expect(result[1]).toBeInstanceOf(HumanMessage);
      expect(result[2]).toBeInstanceOf(AIMessage);
      expect(result[2].content).toBe(
        'Once upon a time...\n\nThere was a brave knight.\n\nHe lived in a castle.'
      );
      expect(result[3]).toBeInstanceOf(HumanMessage);
      expect(result[3].content).toBe('Please provide your response.');
    });

    it('should handle assistant messages before first user message', () => {
      const messages = [
        new SystemMessage('System prompt'),
        new AIMessage('Welcome!'),
        new AIMessage('How can I help you today?'),
        new HumanMessage('I need help with coding'),
        new AIMessage('Sure, I can help with that.'),
      ];

      const result = service.testReorderMessagesForPerplexity(messages);

      expect(result).toHaveLength(4);
      expect(result[0]).toBeInstanceOf(SystemMessage);
      expect(result[1]).toBeInstanceOf(HumanMessage);
      expect(result[1].content).toBe(
        '[Previous assistant response: Welcome!\n\nHow can I help you today?]\n\nI need help with coding'
      );
      expect(result[2]).toBeInstanceOf(AIMessage);
      expect(result[3]).toBeInstanceOf(HumanMessage);
    });

    it('should handle empty conversation with only system message', () => {
      const messages = [new SystemMessage('System prompt')];

      const result = service.testReorderMessagesForPerplexity(messages);

      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(SystemMessage);
      expect(result[1]).toBeInstanceOf(HumanMessage);
      expect(result[1].content).toBe('Please respond.');
    });

    it('should handle conversation with no user messages', () => {
      const messages = [
        new SystemMessage('System prompt'),
        new AIMessage('Welcome!'),
        new AIMessage('I am ready to help.'),
      ];

      const result = service.testReorderMessagesForPerplexity(messages);

      expect(result).toHaveLength(4); // System, added user, merged AI, final user
      expect(result[0]).toBeInstanceOf(SystemMessage);
      expect(result[1]).toBeInstanceOf(HumanMessage);
      expect(result[1].content).toBe('Please continue with the conversation.');
      expect(result[2]).toBeInstanceOf(AIMessage);
      expect(result[2].content).toBe('Welcome!\n\nI am ready to help.');
      expect(result[3]).toBeInstanceOf(HumanMessage);
      expect(result[3].content).toBe('Please provide your response.');
    });

    it('should maintain alternating pattern', () => {
      const messages = [
        new SystemMessage('System prompt'),
        new HumanMessage('User 1'),
        new AIMessage('Assistant 1'),
        new HumanMessage('User 2'),
        new AIMessage('Assistant 2'),
        new HumanMessage('User 3'),
      ];

      const result = service.testReorderMessagesForPerplexity(messages);

      // Should maintain alternation and already ends with user
      expect(result).toHaveLength(6);

      let lastWasUser = false;
      for (let i = 1; i < result.length; i++) {
        const msg = result[i];
        const isUser = msg instanceof HumanMessage;

        if (i === 1) {
          expect(isUser).toBe(true);
          lastWasUser = true;
        } else {
          expect(isUser).toBe(!lastWasUser);
          lastWasUser = isUser;
        }
      }
    });

    it('should handle complex mixed messages', () => {
      const messages = [
        new SystemMessage('System 1'),
        new SystemMessage('System 2'), // Multiple system messages
        new HumanMessage('User 1'),
        new HumanMessage('User 2'),
        new AIMessage('Assistant 1'),
        new HumanMessage('User 3'),
        new HumanMessage('User 4'),
        new AIMessage('Assistant 2'),
        new AIMessage('Assistant 3'),
      ];

      const result = service.testReorderMessagesForPerplexity(messages);

      // System messages should be at the beginning
      expect(result[0]).toBeInstanceOf(SystemMessage);

      // Should merge consecutive messages and maintain alternation
      const nonSystemMessages = result.filter(
        m => !(m instanceof SystemMessage)
      );
      expect(nonSystemMessages[0]).toBeInstanceOf(HumanMessage);

      // Should end with a user message
      const lastMessage = result[result.length - 1];
      expect(lastMessage).toBeInstanceOf(HumanMessage);
    });
  });

  describe('combineMessageContent', () => {
    it('should combine two string contents', () => {
      const result = service.testCombineMessageContent('Hello', 'World');
      expect(result).toBe('Hello\n\nWorld');
    });

    it('should handle object content', () => {
      const obj1 = { text: 'Hello' };
      const obj2 = { text: 'World' };
      const result = service.testCombineMessageContent(obj1, obj2);
      expect(result).toContain('Hello');
      expect(result).toContain('World');
    });

    it('should handle array content', () => {
      const arr1 = ['Hello'];
      const arr2 = ['World'];
      const result = service.testCombineMessageContent(arr1, arr2);
      expect(result).toContain('Hello');
      expect(result).toContain('World');
    });

    it('should handle mixed content types', () => {
      const result = service.testCombineMessageContent('Hello', {
        text: 'World',
      });
      expect(result).toContain('Hello');
      expect(result).toContain('World');
    });
  });

  describe('Perplexity API Requirements', () => {
    it('should satisfy Perplexity requirement: alternating messages', () => {
      const messages = [
        new SystemMessage('System'),
        new HumanMessage('User 1'),
        new HumanMessage('User 2'), // Will be merged
        new AIMessage('Assistant 1'),
        new AIMessage('Assistant 2'), // Will be merged
        new HumanMessage('User 3'),
      ];

      const result = service.testReorderMessagesForPerplexity(messages);

      // Check alternation after system message
      let expectingUser = true;
      for (let i = 1; i < result.length; i++) {
        const msg = result[i];
        const isUser = msg instanceof HumanMessage;

        if (expectingUser) {
          expect(isUser).toBe(true);
        } else {
          expect(isUser).toBe(false);
        }
        expectingUser = !expectingUser;
      }
    });

    it('should satisfy Perplexity requirement: last message must be user', () => {
      const testCases = [
        // Case 1: Ends with assistant
        [
          new SystemMessage('System'),
          new HumanMessage('Hello'),
          new AIMessage('Hi'),
        ],
        // Case 2: Ends with multiple assistants
        [
          new SystemMessage('System'),
          new HumanMessage('Hello'),
          new AIMessage('Hi'),
          new AIMessage('How are you?'),
        ],
        // Case 3: Only system message
        [new SystemMessage('System')],
        // Case 4: System and assistant only
        [new SystemMessage('System'), new AIMessage('Welcome')],
      ];

      for (const messages of testCases) {
        const result = service.testReorderMessagesForPerplexity(messages);
        const lastMessage = result[result.length - 1];
        expect(lastMessage).toBeInstanceOf(HumanMessage);
      }
    });

    it('should not modify properly formatted messages ending with user', () => {
      const messages = [
        new SystemMessage('System'),
        new HumanMessage('Hello'),
        new AIMessage('Hi there!'),
        new HumanMessage('How are you?'),
      ];

      const result = service.testReorderMessagesForPerplexity(messages);

      expect(result).toHaveLength(4);
      expect(result[3].content).toBe('How are you?'); // Original user message preserved
    });
  });
});
