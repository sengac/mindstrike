import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Agent } from '../agent';
import { ChatAgent } from '../agents/chatAgent';
import type { AgentConfig } from '../agents/baseAgent';

// Mock the ChatAgent module
vi.mock('../agents/chatAgent', () => {
  const mockProcessMessage = vi.fn();
  const mockGenerateTitle = vi.fn();
  const mockCleanup = vi.fn();

  class MockChatAgent {
    processMessage = mockProcessMessage;
    generateTitle = mockGenerateTitle;
    cleanup = mockCleanup;

    constructor(config: unknown, agentId?: string) {
      MockChatAgent.constructorCalls.push({ config, agentId });
    }

    static constructorCalls: Array<{ config: unknown; agentId?: string }> = [];
    static mockProcessMessage = mockProcessMessage;
    static mockGenerateTitle = mockGenerateTitle;
    static mockCleanup = mockCleanup;
  }

  return {
    ChatAgent: MockChatAgent,
  };
});

describe('Agent (Backward Compatibility Wrapper)', () => {
  let mockConfig: AgentConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    // Get the mocked ChatAgent and reset tracking
    const MockedChatAgent = vi.mocked(ChatAgent) as typeof ChatAgent & {
      constructorCalls: Array<{ config: unknown; agentId?: string }>;
      mockProcessMessage: ReturnType<typeof vi.fn>;
      mockGenerateTitle: ReturnType<typeof vi.fn>;
      mockCleanup: ReturnType<typeof vi.fn>;
    };

    MockedChatAgent.constructorCalls = [];
    MockedChatAgent.mockProcessMessage.mockResolvedValue('Agent response');
    MockedChatAgent.mockGenerateTitle.mockResolvedValue('Generated title');
    MockedChatAgent.mockCleanup.mockReturnValue(undefined);

    mockConfig = {
      workspaceRoot: '/test/workspace',
      llmConfig: {
        baseURL: 'http://localhost:11434',
        model: 'test-model',
        displayName: 'Test Model',
        temperature: 0.7,
        maxTokens: 2048,
      },
    };
  });

  describe('Inheritance and Compatibility', () => {
    it('should extend ChatAgent', () => {
      const agent = new Agent(mockConfig);

      expect(agent).toBeInstanceOf(Agent);
      const MockedChatAgent = vi.mocked(ChatAgent) as typeof ChatAgent & {
        constructorCalls: Array<{ config: unknown; agentId?: string }>;
      };
      expect(MockedChatAgent.constructorCalls).toHaveLength(1);
      expect(MockedChatAgent.constructorCalls[0]).toEqual({
        config: mockConfig,
        agentId: undefined,
      });
    });

    it('should accept agentId parameter', () => {
      const agentId = 'test-agent-123';
      const agent = new Agent(mockConfig, agentId);

      expect(agent).toBeInstanceOf(Agent);
      const MockedChatAgent = vi.mocked(ChatAgent) as typeof ChatAgent & {
        constructorCalls: Array<{ config: unknown; agentId?: string }>;
      };
      expect(MockedChatAgent.constructorCalls).toHaveLength(1);
      expect(MockedChatAgent.constructorCalls[0]).toEqual({
        config: mockConfig,
        agentId,
      });
    });

    it('should have same interface as ChatAgent', async () => {
      const agent = new Agent(mockConfig);

      // Verify key methods exist and work
      expect(typeof agent.processMessage).toBe('function');
      expect(typeof agent.generateTitle).toBe('function');
      expect(typeof agent.cleanup).toBe('function');

      // Test method calls
      const response = await agent.processMessage('test message');
      expect(response).toBe('Agent response');

      const title = await agent.generateTitle([]);
      expect(title).toBe('Generated title');
    });

    it('should maintain ChatAgent functionality', async () => {
      const agent = new Agent(mockConfig);

      // Test that methods are properly inherited
      const result = await agent.processMessage('Hello world');

      expect(result).toBe('Agent response');
      const MockedChatAgent = vi.mocked(ChatAgent) as typeof ChatAgent & {
        mockProcessMessage: ReturnType<typeof vi.fn>;
      };
      expect(MockedChatAgent.mockProcessMessage).toHaveBeenCalledWith(
        'Hello world'
      );
      expect(MockedChatAgent.mockProcessMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('Constructor Variations', () => {
    it('should handle minimal config', () => {
      const minimalConfig: AgentConfig = {
        workspaceRoot: '/test',
        llmConfig: {
          baseURL: 'http://localhost:11434',
          model: 'minimal-model',
        },
      };

      const agent = new Agent(minimalConfig);
      expect(agent).toBeInstanceOf(Agent);
      const MockedChatAgent = vi.mocked(ChatAgent) as typeof ChatAgent & {
        constructorCalls: Array<{ config: unknown; agentId?: string }>;
      };
      expect(MockedChatAgent.constructorCalls).toHaveLength(1);
      expect(MockedChatAgent.constructorCalls[0]).toEqual({
        config: minimalConfig,
        agentId: undefined,
      });
    });

    it('should handle full config with optional properties', () => {
      const fullConfig: AgentConfig = {
        workspaceRoot: '/test/workspace',
        llmConfig: {
          baseURL: 'http://localhost:11434',
          model: 'full-model',
          displayName: 'Full Model',
          temperature: 0.8,
          maxTokens: 4000,
          apiKey: 'test-key',
          type: 'openai',
        },
        customPrompt: 'Custom system prompt',
        disableFunctions: true,
        disableChatHistory: false,
      };

      const agent = new Agent(fullConfig, 'full-agent');
      expect(agent).toBeInstanceOf(Agent);
      const MockedChatAgent = vi.mocked(ChatAgent) as typeof ChatAgent & {
        constructorCalls: Array<{ config: unknown; agentId?: string }>;
      };
      expect(MockedChatAgent.constructorCalls).toHaveLength(1);
      expect(MockedChatAgent.constructorCalls[0]).toEqual({
        config: fullConfig,
        agentId: 'full-agent',
      });
    });
  });

  describe('Type Exports', () => {
    it('should export AgentConfig type', () => {
      // This test verifies that the type export is working
      // by attempting to use it (compilation would fail if not exported)
      const config: AgentConfig = mockConfig;
      expect(config).toBeDefined();
      expect(config.workspaceRoot).toBe('/test/workspace');
    });
  });

  describe('Error Handling', () => {
    it('should propagate method errors from ChatAgent', async () => {
      const MockedChatAgent = vi.mocked(ChatAgent) as typeof ChatAgent & {
        mockProcessMessage: ReturnType<typeof vi.fn>;
      };
      MockedChatAgent.mockProcessMessage.mockRejectedValueOnce(
        new Error('Process failed')
      );

      const agent = new Agent(mockConfig);

      await expect(agent.processMessage('test')).rejects.toThrow(
        'Process failed'
      );
    });

    it('should handle ChatAgent method failures gracefully', async () => {
      const MockedChatAgent = vi.mocked(ChatAgent) as typeof ChatAgent & {
        mockGenerateTitle: ReturnType<typeof vi.fn>;
      };
      MockedChatAgent.mockGenerateTitle.mockRejectedValueOnce(
        new Error('Generation failed')
      );

      const agent = new Agent(mockConfig);

      await expect(agent.generateTitle([])).rejects.toThrow(
        'Generation failed'
      );
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain same API surface as original Agent class', () => {
      const agent = new Agent(mockConfig);

      // Verify that the key methods expected from the original Agent class exist
      expect(agent).toHaveProperty('processMessage');
      expect(agent).toHaveProperty('generateTitle');
      expect(agent).toHaveProperty('cleanup');

      // Verify these are functions
      expect(typeof agent.processMessage).toBe('function');
      expect(typeof agent.generateTitle).toBe('function');
      expect(typeof agent.cleanup).toBe('function');
    });

    it('should work as drop-in replacement', async () => {
      // Test that existing code using Agent class would still work
      const agent = new Agent(mockConfig);

      // Simulate typical usage patterns
      const response = await agent.processMessage('User input');
      expect(response).toBeDefined();

      const title = await agent.generateTitle([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ]);
      expect(title).toBeDefined();

      // Cleanup should not throw
      expect(() => agent.cleanup()).not.toThrow();
    });
  });
});
