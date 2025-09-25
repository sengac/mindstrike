import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BaseAgent,
  AgentConfig,
  ConversationMessage,
} from '../../agents/baseAgent';
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { ChatOllama } from '@langchain/ollama';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPerplexity } from '@langchain/community/chat_models/perplexity';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatLocalLLM } from '../../agents/chatLocalLlm';
import { logger } from '../../logger';
import { LLMConfigManager } from '../../llmConfigManager';
import { sseManager } from '../../sseManager';
import { ConversationManager } from '../../conversationManager';
import { mcpManager } from '../../mcpManager';
import { lfsManager } from '../../lfsManager';
import { cleanContentForLLM } from '../../utils/contentFilter';

// Mock dependencies
vi.mock('../../logger');
vi.mock('../../llmConfigManager');
vi.mock('../../sseManager');
vi.mock('../../conversationManager');
vi.mock('../../mcpManager');
vi.mock('../../lfsManager');
vi.mock('../../utils/contentFilter');
vi.mock('../../debugLogger', () => ({
  serverDebugLogger: {
    log: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('@langchain/ollama');
vi.mock('@langchain/openai');
vi.mock('@langchain/anthropic');
vi.mock('@langchain/community/chat_models/perplexity');
vi.mock('@langchain/google-genai');
vi.mock('../../agents/chatLocalLlm');
vi.mock('langchain/agents', () => ({
  AgentExecutor: vi.fn(),
  createToolCallingAgent: vi.fn(),
}));

// Create a concrete implementation for testing
class TestAgent extends BaseAgent {
  constructor(config: AgentConfig, agentId?: string) {
    super(config, agentId);
  }

  // Implement abstract methods
  createSystemPrompt(): string {
    return 'Test system prompt';
  }

  getDefaultPrompt(): string {
    return 'Test default prompt';
  }

  public testMethod(): string {
    return 'test';
  }

  // Expose protected methods for testing
  public exposeCreateChatModel(config: AgentConfig) {
    return this.createChatModel(config.llmConfig);
  }
}

describe('BaseAgent', () => {
  let agent: TestAgent;
  let mockConfig: AgentConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = {
      workspaceRoot: '/test/workspace',
      llmConfig: {
        baseURL: 'http://localhost:11434',
        model: 'llama2',
        displayName: 'Test Model',
        temperature: 0.7,
        maxTokens: 2048,
      },
    };

    // Setup mocks
    vi.mocked(cleanContentForLLM).mockImplementation(content => content);
    vi.mocked(lfsManager.isLFSReference).mockReturnValue(false);
    vi.mocked(lfsManager.retrieveContent).mockImplementation(ref => ref);
    vi.mocked(mcpManager.getLangChainTools).mockReturnValue([]);
    vi.mocked(sseManager.broadcast).mockImplementation(() => {});

    // Mock LLMConfigManager
    vi.mocked(LLMConfigManager).mockImplementation(() => ({
      getProviderConfigs: vi.fn().mockReturnValue([]),
      saveProviderConfig: vi.fn(),
      deleteProviderConfig: vi.fn(),
      getConfig: vi.fn().mockReturnValue({}),
      updateConfig: vi.fn(),
    }));

    // Mock ConversationManager
    vi.mocked(ConversationManager).mockImplementation(() => ({
      getConversation: vi.fn(),
      addMessage: vi.fn(),
      updateMessage: vi.fn(),
    }));

    // Mock chat models - create them as constructor mocks
    const mockChatModel = {
      invoke: vi.fn().mockResolvedValue({ content: 'response' }),
      bind: vi.fn().mockReturnThis(),
      stream: vi.fn().mockResolvedValue([]),
      batch: vi.fn().mockResolvedValue([]),
      getName: vi.fn().mockReturnValue('mock-model'),
    };

    const ChatOllamaMock = vi.mocked(ChatOllama);
    const ChatOpenAIMock = vi.mocked(ChatOpenAI);
    const ChatAnthropicMock = vi.mocked(ChatAnthropic);
    const ChatPerplexityMock = vi.mocked(ChatPerplexity);
    const ChatGoogleGenerativeAIMock = vi.mocked(ChatGoogleGenerativeAI);
    const ChatLocalLLMMock = vi.mocked(ChatLocalLLM);

    ChatOllamaMock.mockImplementation(() => mockChatModel);
    ChatOpenAIMock.mockImplementation(() => mockChatModel);
    ChatAnthropicMock.mockImplementation(() => mockChatModel);
    ChatPerplexityMock.mockImplementation(() => mockChatModel);
    ChatGoogleGenerativeAIMock.mockImplementation(() => mockChatModel);
    ChatLocalLLMMock.mockImplementation(() => mockChatModel);

    agent = new TestAgent(mockConfig, 'test-agent-id');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Chat Model Creation', () => {
    it('should create Ollama chat model', () => {
      const config: AgentConfig = {
        ...mockConfig,
        llmConfig: {
          ...mockConfig.llmConfig,
          type: 'ollama',
        },
      };

      agent.exposeCreateChatModel(config);
      expect(ChatOllama).toHaveBeenCalled();
    });

    it('should create OpenAI chat model', () => {
      const config: AgentConfig = {
        ...mockConfig,
        llmConfig: {
          ...mockConfig.llmConfig,
          type: 'openai',
          apiKey: 'test-key',
        },
      };

      agent.exposeCreateChatModel(config);
      expect(ChatOpenAI).toHaveBeenCalled();
    });

    it('should create Anthropic chat model', () => {
      const config: AgentConfig = {
        ...mockConfig,
        llmConfig: {
          ...mockConfig.llmConfig,
          type: 'anthropic',
          apiKey: 'test-key',
        },
      };

      agent.exposeCreateChatModel(config);
      expect(ChatAnthropic).toHaveBeenCalled();
    });

    it('should create Perplexity chat model', () => {
      const config: AgentConfig = {
        ...mockConfig,
        llmConfig: {
          ...mockConfig.llmConfig,
          type: 'perplexity',
          apiKey: 'test-key',
        },
      };

      agent.exposeCreateChatModel(config);
      expect(ChatPerplexity).toHaveBeenCalled();
    });

    it('should create Google Generative AI chat model', () => {
      const config: AgentConfig = {
        ...mockConfig,
        llmConfig: {
          ...mockConfig.llmConfig,
          type: 'google',
          apiKey: 'test-key',
        },
      };

      agent.exposeCreateChatModel(config);
      expect(ChatGoogleGenerativeAI).toHaveBeenCalled();
    });

    it('should create Local LLM chat model', () => {
      const config: AgentConfig = {
        ...mockConfig,
        llmConfig: {
          ...mockConfig.llmConfig,
          type: 'local',
        },
      };

      agent.exposeCreateChatModel(config);
      expect(ChatLocalLLM).toHaveBeenCalled();
    });

    it('should create VLLM chat model', () => {
      const config: AgentConfig = {
        ...mockConfig,
        llmConfig: {
          ...mockConfig.llmConfig,
          type: 'vllm',
        },
      };

      agent.exposeCreateChatModel(config);
      expect(ChatOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.objectContaining({
            baseURL: 'http://localhost:11434',
          }),
        })
      );
    });

    it('should create OpenAI-compatible chat model', () => {
      const config: AgentConfig = {
        ...mockConfig,
        llmConfig: {
          ...mockConfig.llmConfig,
          type: 'openai-compatible',
          apiKey: 'test-key',
        },
      };

      agent.exposeCreateChatModel(config);
      expect(ChatOpenAI).toHaveBeenCalled();
    });

    it('should handle missing API key for OpenAI', () => {
      const config: AgentConfig = {
        ...mockConfig,
        llmConfig: {
          ...mockConfig.llmConfig,
          type: 'openai',
        },
      };

      agent.exposeCreateChatModel(config);
      expect(ChatOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          openAIApiKey: undefined,
        })
      );
    });

    it('should use default case when no type specified', () => {
      const config: AgentConfig = {
        ...mockConfig,
        llmConfig: {
          ...mockConfig.llmConfig,
          baseURL: 'http://localhost:11434',
        },
      };

      agent.exposeCreateChatModel(config);
      // Without a type, it defaults to ChatOpenAI
      expect(ChatOpenAI).toHaveBeenCalled();
    });
  });

  describe('Configuration', () => {
    it('should handle custom prompts', () => {
      const config: AgentConfig = {
        ...mockConfig,
        customPrompt: 'Custom system prompt',
      };

      agent.exposeCreateChatModel(config);

      // Without a type, defaults to ChatOpenAI
      expect(ChatOpenAI).toHaveBeenCalled();
    });

    it('should handle disabled functions', () => {
      const config: AgentConfig = {
        ...mockConfig,
        disableFunctions: true,
      };

      agent.exposeCreateChatModel(config);

      // Without a type, defaults to ChatOpenAI
      expect(ChatOpenAI).toHaveBeenCalled();
    });

    it('should handle disabled chat history', () => {
      const config: AgentConfig = {
        ...mockConfig,
        disableChatHistory: true,
      };

      agent.exposeCreateChatModel(config);

      // Without a type, defaults to ChatOpenAI
      expect(ChatOpenAI).toHaveBeenCalled();
    });

    it('should use default temperature if not specified', () => {
      const config: AgentConfig = {
        workspaceRoot: '/test',
        llmConfig: {
          baseURL: 'http://localhost:11434',
          model: 'llama2',
        },
      };

      agent.exposeCreateChatModel(config);

      // Without a type, defaults to ChatOpenAI
      expect(ChatOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.7, // default value
        })
      );
    });

    it('should use default max tokens if not specified', () => {
      const config: AgentConfig = {
        workspaceRoot: '/test',
        llmConfig: {
          baseURL: 'http://localhost:11434',
          model: 'llama2',
        },
      };

      agent.exposeCreateChatModel(config);

      // Without a type, defaults to ChatOpenAI
      expect(ChatOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          maxTokens: 4000, // default value from baseAgent
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle missing model configuration', () => {
      const config: AgentConfig = {
        workspaceRoot: '/test',
        llmConfig: {
          baseURL: '',
          model: '',
        },
      };

      expect(() => agent.exposeCreateChatModel(config)).not.toThrow();
    });
  });

  describe('Abstract Class', () => {
    it('should be instantiable through concrete implementation', () => {
      expect(agent).toBeInstanceOf(BaseAgent);
      expect(agent).toBeInstanceOf(TestAgent);
    });

    it('should have test method in concrete implementation', () => {
      expect(agent.testMethod()).toBe('test');
    });
  });
});
