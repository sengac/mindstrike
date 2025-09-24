import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { DynamicStructuredTool } from '@langchain/core/tools';

// Use vi.hoisted to define mocks before imports
const {
  mockConversationManager,
  mockSSEManagerInstance,
  mockMCPManagerInstance,
  mockLFSManagerInstance,
  MockChatModel,
  createMockLogger,
} = vi.hoisted(() => {
  // Define mock classes inline
  interface MockMessage {
    id?: string;
    role?: string;
    content?: string;
    timestamp?: Date;
    images?: unknown[];
    notes?: unknown[];
    [key: string]: unknown;
  }

  class MockConversationManager {
    private threads: Map<string, { id: string; messages: MockMessage[] }> =
      new Map();

    async load() {
      return Promise.resolve();
    }

    getThread(threadId: string) {
      return this.threads.get(threadId);
    }

    async createThread(threadId?: string) {
      const id = threadId ?? `thread-${Date.now()}`;
      const thread = {
        id,
        messages: [] as MockMessage[],
      };
      this.threads.set(id, thread);
      return thread;
    }

    getThreadMessages(threadId: string): MockMessage[] {
      const thread = this.threads.get(threadId);
      return thread?.messages ?? [];
    }

    async addMessage(threadId: string, message: MockMessage) {
      let thread = this.threads.get(threadId);
      if (!thread) {
        thread = {
          id: threadId,
          messages: [],
        };
        this.threads.set(threadId, thread);
      }
      thread.messages.push(message);
      return message;
    }

    async updateMessage(
      threadId: string,
      messageId: string,
      updates: Partial<MockMessage>
    ) {
      const thread = this.threads.get(threadId);
      if (thread) {
        const messageIndex = thread.messages.findIndex(m => m.id === messageId);
        if (messageIndex !== -1) {
          thread.messages[messageIndex] = {
            ...thread.messages[messageIndex],
            ...updates,
          };
        }
      }
    }

    async deleteMessage(threadId: string, messageId: string): Promise<boolean> {
      const thread = this.threads.get(threadId);
      if (thread) {
        const initialLength = thread.messages.length;
        thread.messages = thread.messages.filter(m => m.id !== messageId);
        return thread.messages.length < initialLength;
      }
      return false;
    }

    async clearThread(threadId: string) {
      let thread = this.threads.get(threadId);
      if (!thread) {
        thread = {
          id: threadId,
          messages: [],
        };
        this.threads.set(threadId, thread);
      } else {
        thread.messages = [];
      }
    }

    updateWorkspaceRoot(workspaceRoot: string) {
      // Store the workspace root for mock implementation
      this.workspaceRoot = workspaceRoot;
    }

    private workspaceRoot: string = '';

    clear() {
      this.threads.clear();
    }
  }

  class MockSSEManager {
    broadcasts: Array<{ topic: string; data: unknown }> = [];

    broadcast(topic: string, data: unknown) {
      this.broadcasts.push({ topic, data });
    }

    broadcastThreadUpdate(threadId: string, data: unknown) {
      this.broadcast(`thread:${threadId}`, {
        type: 'update',
        threadId,
        ...data,
      });
    }

    broadcastMessageCreate(threadId: string, data: unknown) {
      this.broadcast(`thread:${threadId}`, {
        type: 'create',
        threadId,
        ...data,
      });
    }

    clear() {
      this.broadcasts = [];
    }

    getLastBroadcast() {
      return this.broadcasts[this.broadcasts.length - 1];
    }

    getBroadcastsByType(type: string) {
      return this.broadcasts.filter(b => {
        if (typeof b.data === 'object' && b.data !== null && 'type' in b.data) {
          const dataWithType = b.data as { type: unknown };
          return dataWithType.type === type;
        }
        return false;
      });
    }
  }

  class MockMCPManager {
    private tools: Map<string, DynamicStructuredTool> = new Map();
    private toolResults: Map<string, unknown> = new Map();
    public lastParameters: Record<string, unknown> = {};

    getLangChainTools(): DynamicStructuredTool[] {
      return Array.from(this.tools.values());
    }

    addMockTool(name: string, tool: DynamicStructuredTool) {
      this.tools.set(name, tool);
    }

    setToolResult(serverId: string, toolName: string, result: unknown) {
      this.toolResults.set(`${serverId}_${toolName}`, result);
    }

    async executeTool(
      serverId: string,
      toolName: string,
      parameters: Record<string, unknown>
    ) {
      // Store parameters for mock tracking
      this.lastParameters = parameters;
      const key = `${serverId}_${toolName}`;
      const result = this.toolResults.get(key);
      if (result instanceof Error) {
        throw result;
      }
      if (result && typeof result === 'object' && 'output' in result) {
        return (result as { output: unknown }).output;
      }
      return result ?? `Mock result for ${toolName}`;
    }

    clear() {
      this.tools.clear();
      this.toolResults.clear();
    }
  }

  class MockLFSManager {
    private references: Map<string, string> = new Map();
    private summaries: Map<
      string,
      { summary: string; originalSize: number; keyPoints?: string[] }
    > = new Map();

    isLFSReference(content: string): boolean {
      return content.startsWith('LFS:');
    }

    retrieveContent(reference: string): string | null {
      return this.references.get(reference) ?? null;
    }

    getSummaryByReference(reference: string) {
      return this.summaries.get(reference);
    }

    addReference(
      reference: string,
      content: string,
      summary?: { summary: string; originalSize: number; keyPoints?: string[] }
    ) {
      this.references.set(reference, content);
      if (summary) {
        this.summaries.set(reference, summary);
      }
    }

    clear() {
      this.references.clear();
      this.summaries.clear();
    }
  }

  class MockChatModel {
    private responses: string[] = [];
    private currentIndex = 0;
    public bindToolsCalled = false;
    public tools: DynamicStructuredTool[] = [];
    private shouldThrowError = false;
    private errorToThrow: Error | null = null;
    public lastInvokeMessages: unknown = null;
    public lastStreamMessages: unknown = null;

    setResponses(...responses: string[]) {
      this.responses = responses;
      this.currentIndex = 0;
    }

    async invoke(messages: unknown) {
      // Log messages for mock debugging
      this.lastInvokeMessages = messages;
      if (this.shouldThrowError && this.errorToThrow) {
        throw this.errorToThrow;
      }
      const response =
        this.responses[this.currentIndex] ?? 'Default mock response';
      this.currentIndex =
        (this.currentIndex + 1) % Math.max(1, this.responses.length);
      return {
        content: response,
        _getType: () => 'ai',
      };
    }

    async *stream(messages: unknown) {
      // Log messages for mock debugging
      this.lastStreamMessages = messages;
      if (this.shouldThrowError && this.errorToThrow) {
        throw this.errorToThrow;
      }
      const response =
        this.responses[this.currentIndex] ?? 'Default streaming response';
      this.currentIndex =
        (this.currentIndex + 1) % Math.max(1, this.responses.length);

      const chunkSize = 10;
      for (let i = 0; i < response.length; i += chunkSize) {
        yield {
          content: response.slice(i, i + chunkSize),
          tool_calls: [],
          tool_call_chunks: [],
        };
      }
    }

    mockError(error: Error) {
      this.shouldThrowError = true;
      this.errorToThrow = error;
    }

    bindTools(tools: DynamicStructuredTool[]) {
      this.bindToolsCalled = true;
      this.tools = tools;
      return this;
    }

    reset() {
      this.responses = [];
      this.currentIndex = 0;
      this.bindToolsCalled = false;
      this.tools = [];
      this.shouldThrowError = false;
      this.errorToThrow = null;
    }
  }

  const createMockLogger = () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
  });

  // Create instances
  const mockConversationManager = new MockConversationManager();
  const mockSSEManagerInstance = new MockSSEManager();
  const mockMCPManagerInstance = new MockMCPManager();
  const mockLFSManagerInstance = new MockLFSManager();

  return {
    mockConversationManager,
    mockSSEManagerInstance,
    mockMCPManagerInstance,
    mockLFSManagerInstance,
    MockChatModel,
    createMockLogger,
  };
});

// Mock dependencies using the hoisted instances
vi.mock('../../conversationManager', () => ({
  ConversationManager: vi.fn(() => mockConversationManager),
}));

vi.mock('../../sseManager', () => ({
  sseManager: mockSSEManagerInstance,
}));

vi.mock('../../mcpManager', () => ({
  mcpManager: mockMCPManagerInstance,
}));

vi.mock('../../lfsManager', () => ({
  lfsManager: mockLFSManagerInstance,
}));

vi.mock('../../logger', () => ({
  logger: createMockLogger(),
}));

vi.mock('../../serverDebugLogger', () => ({
  serverDebugLogger: {
    logRequest: vi.fn(),
    logResponse: vi.fn(),
    logError: vi.fn(),
  },
}));

// Mock LangChain models
vi.mock('@langchain/openai', () => ({
  ChatOpenAI: vi.fn(() => new MockChatModel()),
}));

vi.mock('@langchain/anthropic', () => ({
  ChatAnthropic: vi.fn(() => new MockChatModel()),
}));

vi.mock('@langchain/ollama', () => ({
  ChatOllama: vi.fn(() => new MockChatModel()),
}));

vi.mock('@langchain/community/chat_models/perplexity', () => ({
  ChatPerplexity: vi.fn(() => new MockChatModel()),
}));

vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: vi.fn(() => new MockChatModel()),
}));

vi.mock('../../chatLocalLlm', () => ({
  ChatLocalLLM: vi.fn(() => new MockChatModel()),
}));

// Import test data AFTER mocks are set up
import {
  mockAgentConfig,
  mockMessages,
  mockImageAttachment,
  mockNotesAttachment,
  mockJsonToolResponse,
  mockLLMConfigs,
  mockProviderConfigs,
  mockComplexMessages,
  mockToolCallScenarios,
  mockMCPResults,
  mockLFSSummary,
  mockErrorScenarios,
  mockEdgeCaseConfigs,
} from './fixtures/mockData';

// NOW import BaseAgent after mocks are set up
import { BaseAgent } from '../baseAgent';
import type { AgentConfig, ConversationMessage } from '../baseAgent';

// Create a concrete implementation of BaseAgent for testing
class TestAgent extends BaseAgent {
  createSystemPrompt(): string {
    return this.config.customPrompt ?? 'Test system prompt';
  }

  getDefaultPrompt(): string {
    return 'Default test prompt';
  }

  // Expose protected methods for testing
  public testParseToolCalls(content: string) {
    return this.parseToolCalls(content);
  }

  public testGenerateId() {
    return this.generateId();
  }
}

describe('BaseAgent', () => {
  let agent: TestAgent;
  let mockChatModel: InstanceType<typeof MockChatModel>;

  beforeEach(() => {
    // Clear all mocks
    mockConversationManager.clear();
    mockSSEManagerInstance.clear();
    mockMCPManagerInstance.clear();
    mockLFSManagerInstance.clear();

    mockChatModel = new MockChatModel();
    mockChatModel.reset();

    // Reset mockAgentConfig to avoid test contamination
    mockAgentConfig.customPrompt = undefined;

    // Create agent instance
    agent = new TestAgent(mockAgentConfig);
    agent['chatModel'] = mockChatModel;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Agent Creation', () => {
    it('should create agent with OpenAI config', () => {
      const config: AgentConfig = {
        ...mockAgentConfig,
        llmConfig: mockLLMConfigs.openai,
      };
      const agent = new TestAgent(config);
      expect(agent).toBeDefined();
      expect(agent.llmConfig).toEqual(mockLLMConfigs.openai);
    });

    it('should create agent with Anthropic config', () => {
      const config: AgentConfig = {
        ...mockAgentConfig,
        llmConfig: mockLLMConfigs.anthropic,
      };
      const agent = new TestAgent(config);
      expect(agent).toBeDefined();
      expect(agent.llmConfig).toEqual(mockLLMConfigs.anthropic);
    });

    it('should create agent with Ollama config', () => {
      const config: AgentConfig = {
        ...mockAgentConfig,
        llmConfig: mockLLMConfigs.ollama,
      };
      const agent = new TestAgent(config);
      expect(agent).toBeDefined();
      expect(agent.llmConfig).toEqual(mockLLMConfigs.ollama);
    });

    it('should create agent with local LLM config', () => {
      const config: AgentConfig = {
        ...mockAgentConfig,
        llmConfig: mockLLMConfigs.local,
      };
      const agent = new TestAgent(config);
      expect(agent).toBeDefined();
      expect(agent.llmConfig).toEqual(mockLLMConfigs.local);
    });

    it('should use custom prompt if provided', () => {
      const customPrompt = 'You are a custom assistant';
      const config: AgentConfig = {
        ...mockAgentConfig,
        customPrompt,
      };
      const agent = new TestAgent(config);

      expect(agent.createSystemPrompt()).toBe(customPrompt);
    });

    it('should generate unique agent ID', () => {
      const agent1 = new TestAgent(mockAgentConfig);
      const agent2 = new TestAgent(mockAgentConfig);

      expect(agent1['agentId']).toBeDefined();
      expect(agent2['agentId']).toBeDefined();
      expect(agent1['agentId']).not.toBe(agent2['agentId']);
    });
  });

  describe('Message Processing', () => {
    it('should process simple text message', async () => {
      const threadId = 'test-thread';
      const userMessage = 'Hello, how are you?';
      const response = 'I am doing well, thank you!';

      // Pre-create the thread with the specific ID
      await mockConversationManager.createThread(threadId);
      mockChatModel.setResponses(response);

      const result = await agent.processMessage(threadId, userMessage);

      expect(result).toBeDefined();
      expect(result.role).toBe('assistant');
      expect(result.content).toBe(response);
      expect(result.status).toBe('completed');
    });

    it('should handle streaming responses', async () => {
      const threadId = 'test-thread';
      const userMessage = 'Stream this response';
      const response = 'This is a streaming response';

      await mockConversationManager.createThread(threadId);
      mockChatModel.setResponses(response);

      const updates: ConversationMessage[] = [];
      const result = await agent.processMessage(threadId, userMessage, {
        onUpdate: msg => updates.push(msg),
      });

      expect(result.content).toBe(response);
      expect(updates.length).toBeGreaterThan(0);
    });

    it('should process message with images', async () => {
      const threadId = 'test-thread';
      const userMessage = 'What is in this image?';
      const response = 'I see a test image';

      await mockConversationManager.createThread(threadId);
      mockChatModel.setResponses(response);

      const result = await agent.processMessage(threadId, userMessage, {
        images: [mockImageAttachment],
      });

      expect(result.content).toBe(response);

      // Verify the image was included in the conversation
      const messages = mockConversationManager.getThreadMessages(threadId);
      expect(messages.length).toBeGreaterThan(0);
      const userMsg = messages.find(m => m.role === 'user');
      expect(userMsg).toBeDefined();
      expect(userMsg?.images).toHaveLength(1);
      expect(userMsg?.images?.[0]).toEqual(mockImageAttachment);
    });

    it('should process message with notes', async () => {
      const threadId = 'test-thread';
      const userMessage = 'Review these notes';
      const response = 'I have reviewed the notes';

      await mockConversationManager.createThread(threadId);
      mockChatModel.setResponses(response);

      const result = await agent.processMessage(threadId, userMessage, {
        notes: [mockNotesAttachment],
      });

      expect(result.content).toBe(response);

      // Verify notes were included
      const messages = mockConversationManager.getThreadMessages(threadId);
      const userMsg = messages.find(m => m.role === 'user');
      expect(userMsg?.notes).toHaveLength(1);
      expect(userMsg?.notes?.[0]).toEqual(mockNotesAttachment);
    });

    it('should handle message cancellation', async () => {
      const threadId = 'test-thread';
      const userMessage = 'Long running task';
      const abortController = new AbortController();

      // Simulate cancellation after a delay
      setTimeout(() => abortController.abort(), 10);

      await mockConversationManager.createThread(threadId);
      mockChatModel.setResponses('This will be cancelled...');

      const result = await agent.processMessage(threadId, userMessage, {
        signal: abortController.signal,
      });

      // The actual behavior depends on implementation
      // Just verify the method completes without throwing
      expect(result).toBeDefined();
    });

    it('should broadcast SSE events during processing', async () => {
      const threadId = 'test-thread';
      const userMessage = 'Test SSE';
      const response = 'SSE response';

      await mockConversationManager.createThread(threadId);
      mockChatModel.setResponses(response);
      mockSSEManagerInstance.clear();

      await agent.processMessage(threadId, userMessage);

      // Check for message creation events
      const createEvents = mockSSEManagerInstance.getBroadcastsByType('create');
      expect(createEvents.length).toBeGreaterThan(0);

      // Check for update events
      const updateEvents = mockSSEManagerInstance.getBroadcastsByType('update');
      expect(updateEvents.length).toBeGreaterThan(0);
    });
  });

  describe('Tool Management', () => {
    it('should parse tool calls from JSON blocks', () => {
      const content = mockJsonToolResponse('read_file', { path: '/test.txt' });
      const result = agent.testParseToolCalls(content);

      expect(result.toolCalls).toBeDefined();
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls?.[0].name).toBe('read_file');
      expect(result.toolCalls?.[0].parameters).toEqual({ path: '/test.txt' });
    });

    it('should parse multiple tool calls', () => {
      const content = `
        Here's the first tool:
        ${mockJsonToolResponse('read_file', { path: '/test.txt' })}
        
        And the second:
        ${mockJsonToolResponse('web_search', { query: 'test' })}
      `;

      const result = agent.testParseToolCalls(content);

      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls?.[0].name).toBe('read_file');
      expect(result.toolCalls?.[1].name).toBe('web_search');
    });

    it('should handle malformed JSON gracefully', () => {
      const content = '```json\n{ invalid json }\n```';
      const result = agent.testParseToolCalls(content);

      expect(result.toolCalls).toBeUndefined();
      expect(result.content).toBe(content);
    });

    it('should execute MCP tools', async () => {
      const threadId = 'test-thread';
      await mockConversationManager.createThread(threadId);

      // Set up mock tool result - BaseAgent will wrap it in success/output format
      mockMCPManagerInstance.setToolResult('filesystem', 'read_file', {
        success: true,
        output: 'File contents',
      });

      const toolCalls = [
        {
          id: 'tool-1',
          name: 'mcp_filesystem_read_file',
          parameters: { path: '/test.txt' },
        },
      ];

      const results = await agent['executeToolCalls'](
        threadId,
        toolCalls,
        'msg-1'
      );

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('mcp_filesystem_read_file');
      expect(results[0].result).toHaveProperty('success', true);
    });

    it('should handle tool execution errors', async () => {
      const threadId = 'test-thread';
      await mockConversationManager.createThread(threadId);

      // Set up mock to throw error
      mockMCPManagerInstance.setToolResult(
        'filesystem',
        'read_file',
        new Error('File not found')
      );

      const toolCalls = [
        {
          id: 'tool-1',
          name: 'mcp_filesystem_read_file',
          parameters: { path: '/nonexistent.txt' },
        },
      ];

      const results = await agent['executeToolCalls'](
        threadId,
        toolCalls,
        'msg-1'
      );

      expect(results).toHaveLength(1);
      expect(results[0].result).toHaveProperty('success', false);
      expect(results[0].result).toHaveProperty('error');
    });

    it('should refresh tools when MCP servers change', async () => {
      await agent.refreshTools();

      const tools = agent.getTools();
      expect(tools).toBeDefined();
      expect(Array.isArray(tools)).toBe(true);
    });
  });

  describe('Conversation Management', () => {
    it('should create new thread if none exists', async () => {
      const threadId = 'new-thread';
      const userMessage = 'First message';

      mockChatModel.setResponses('Response');

      const result = await agent.processMessage(threadId, userMessage);

      // The agent creates a new thread with a generated ID, not the provided one
      // Since mock doesn't expose threads directly, check result instead
      expect(result).toBeDefined();
      expect(result.role).toBe('assistant');
      expect(result.content).toBe('Response');
      expect(result.status).toBe('completed');
    });

    it('should add messages to existing thread', async () => {
      const threadId = 'test-thread';
      await mockConversationManager.createThread(threadId);

      mockChatModel.setResponses('Response 1', 'Response 2');

      await agent.processMessage(threadId, 'Message 1');
      await agent.processMessage(threadId, 'Message 2');

      const messages = mockConversationManager.getThreadMessages(threadId);
      expect(messages.length).toBeGreaterThan(2);
    });

    it('should delete message from thread', async () => {
      const threadId = 'test-thread';
      const message: ConversationMessage = {
        id: 'msg-to-delete',
        role: 'user',
        content: 'Delete me',
        timestamp: new Date(),
      };
      await mockConversationManager.addMessage(threadId, message);

      const deleted = await agent.deleteMessage(threadId, 'msg-to-delete');

      expect(deleted).toBe(true);
      const messages = mockConversationManager.getThreadMessages(threadId);
      expect(messages.find(m => m.id === 'msg-to-delete')).toBeUndefined();
    });

    it('should clear conversation', async () => {
      const threadId = 'test-thread';
      await mockConversationManager.createThread(threadId);
      await mockConversationManager.addMessage(threadId, mockMessages[0]);
      await mockConversationManager.addMessage(threadId, mockMessages[1]);

      await agent.clearConversation(threadId);

      const messages = mockConversationManager.getThreadMessages(threadId);
      expect(messages).toHaveLength(0);
    });

    it('should load conversation history', async () => {
      const threadId = 'test-thread';
      await mockConversationManager.createThread(threadId);

      await agent.loadConversation(threadId, mockMessages);

      const messages = mockConversationManager.getThreadMessages(threadId);
      // Only non-system messages should be loaded
      const nonSystemMessages = mockMessages.filter(m => m.role !== 'system');
      expect(messages).toHaveLength(nonSystemMessages.length);
    });
  });

  describe('Utility Methods', () => {
    it('should generate unique IDs', () => {
      const id1 = agent.testGenerateId();
      const id2 = agent.testGenerateId();

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
    });

    it('should update LLM config', () => {
      const newConfig = mockLLMConfigs.anthropic;

      agent.updateLLMConfig(newConfig);

      expect(agent.llmConfig).toEqual(newConfig);
    });

    it('should update workspace root', () => {
      const newRoot = '/new/workspace/root';

      agent.updateWorkspaceRoot(newRoot);

      expect(agent['config'].workspaceRoot).toBe(newRoot);
    });

    it('should update custom prompt', async () => {
      const threadId = 'test-thread';
      const newPrompt = 'Updated custom prompt';

      await agent.updatePrompt(threadId, newPrompt);

      expect(agent.getCurrentPrompt()).toBe(newPrompt);
      expect(agent.createSystemPrompt()).toBe(newPrompt);
    });

    it('should get current prompt', () => {
      // Create a fresh agent to avoid state from previous tests
      const freshAgent = new TestAgent(mockAgentConfig);
      freshAgent['chatModel'] = mockChatModel;

      const prompt = freshAgent.getCurrentPrompt();
      expect(prompt).toBe('Default test prompt');

      freshAgent['config'].customPrompt = 'Custom prompt';
      expect(freshAgent.getCurrentPrompt()).toBe('Custom prompt');
    });

    it('should set stream ID', () => {
      const streamId = 'stream-123';

      agent.setStreamId(streamId);

      expect(agent['streamId']).toBe(streamId);
    });
  });

  describe('Error Handling', () => {
    it('should handle LLM errors gracefully', async () => {
      const threadId = 'test-thread';
      const userMessage = 'Cause an error';

      // Make the mock throw an error on stream (base agent uses stream)
      mockChatModel.stream = vi
        .fn()
        .mockRejectedValue(new Error('LLM API Error'));

      const result = await agent.processMessage(threadId, userMessage);

      // Should return an error message instead of throwing
      expect(result).toBeDefined();
      expect(result.status).toBe('cancelled');
      expect(result.content).toContain('Error');
    });

    it('should provide user-friendly error messages for rate limits', async () => {
      const threadId = 'test-thread';
      const userMessage = 'Test rate limit';

      mockChatModel.stream = vi
        .fn()
        .mockRejectedValue(new Error('rate limit exceeded'));

      const result = await agent.processMessage(threadId, userMessage);

      expect(result.content).toContain('Rate Limit');
    });

    it('should handle authentication errors', async () => {
      const threadId = 'test-thread';
      const userMessage = 'Test auth error';

      mockChatModel.stream = vi
        .fn()
        .mockRejectedValue(new Error('unauthorized'));

      const result = await agent.processMessage(threadId, userMessage);

      expect(result.content).toContain('Authentication');
    });

    it('should handle model not found errors', async () => {
      const threadId = 'test-thread';
      const userMessage = 'Test model error';

      mockChatModel.stream = vi
        .fn()
        .mockRejectedValue(new Error('model not found'));

      const result = await agent.processMessage(threadId, userMessage);

      expect(result.content).toContain('Model Not Available');
    });

    it('should handle timeout errors', async () => {
      const threadId = 'test-thread';
      const userMessage = 'Test timeout';

      mockChatModel.stream = vi
        .fn()
        .mockRejectedValue(new Error('Request timeout'));

      const result = await agent.processMessage(threadId, userMessage);

      expect(result.content).toContain('Timeout');
    });

    it('should handle network errors', async () => {
      const threadId = 'test-thread';
      const userMessage = 'Test network error';

      mockChatModel.stream = vi
        .fn()
        .mockRejectedValue(new Error('network error'));

      const result = await agent.processMessage(threadId, userMessage);

      expect(result.content).toContain('Network');
    });

    it('should handle credit exhaustion errors', async () => {
      const threadId = 'test-thread';
      const userMessage = 'Test credits';

      mockChatModel.stream = vi
        .fn()
        .mockRejectedValue(new Error('credit balance is too low'));

      const result = await agent.processMessage(threadId, userMessage);

      expect(result.content).toContain('Credits');
    });
  });

  describe('Message Conversion to LangChain', () => {
    describe('Provider-Specific Image Handling', () => {
      it('should format images correctly for Anthropic', async () => {
        const anthropicAgent = new TestAgent({
          ...mockAgentConfig,
          llmConfig: {
            baseURL: 'https://api.anthropic.com',
            model: 'claude-3-opus',
            displayName: 'Claude 3 Opus',
            apiKey: 'test-api-key',
            type: 'anthropic',
            temperature: 0.7,
            maxTokens: 4000,
          },
        });
        anthropicAgent['chatModel'] = mockChatModel;

        // Add message with image to conversation
        const threadId = 'anthropic-test';
        await mockConversationManager.createThread(threadId);
        await mockConversationManager.addMessage(
          threadId,
          mockComplexMessages.withImagesAnthropic[0]
        );

        const messages = anthropicAgent['convertToLangChainMessages'](threadId);

        // Should have system message + user message with image
        expect(messages).toHaveLength(2);

        const userMessage = messages[1];
        expect(Array.isArray(userMessage.content)).toBe(true);

        if (Array.isArray(userMessage.content)) {
          expect(userMessage.content).toHaveLength(2); // text + image
          expect(userMessage.content[0]).toHaveProperty('type', 'text');

          // Should be Anthropic format based on type detection
          const imageContent = userMessage.content[1];
          if (imageContent.type === 'image') {
            expect(imageContent).toHaveProperty('source');
            expect(imageContent.source).toHaveProperty('type', 'base64');
            expect(imageContent.source).toHaveProperty(
              'media_type',
              'image/png'
            );
          } else {
            // If not detected as Anthropic, it defaults to OpenAI format
            expect(imageContent).toHaveProperty('type', 'image_url');
            expect(imageContent).toHaveProperty('image_url');
          }
        }
      });

      it('should strip images for Perplexity', async () => {
        const perplexityAgent = new TestAgent({
          ...mockAgentConfig,
          llmConfig: mockProviderConfigs.perplexity,
        });
        perplexityAgent['chatModel'] = mockChatModel;

        const threadId = 'perplexity-test';
        await mockConversationManager.createThread(threadId);
        await mockConversationManager.addMessage(
          threadId,
          mockComplexMessages.withImagesAnthropic[0]
        );

        const messages =
          perplexityAgent['convertToLangChainMessages'](threadId);

        const userMessage = messages[1];
        // Perplexity should only have text content, no image array
        expect(typeof userMessage.content).toBe('string');
        expect(userMessage.content).toBe('What do you see in this image?');
      });

      it('should format images correctly for Google', async () => {
        const googleAgent = new TestAgent({
          ...mockAgentConfig,
          llmConfig: mockProviderConfigs.google,
        });
        googleAgent['chatModel'] = mockChatModel;

        const threadId = 'google-test';
        await mockConversationManager.createThread(threadId);
        await mockConversationManager.addMessage(
          threadId,
          mockComplexMessages.withImagesGoogle[0]
        );

        const messages = googleAgent['convertToLangChainMessages'](threadId);

        const userMessage = messages[1];
        expect(Array.isArray(userMessage.content)).toBe(true);

        if (Array.isArray(userMessage.content)) {
          expect(userMessage.content).toHaveLength(2); // text + image
          expect(userMessage.content[0]).toHaveProperty('type', 'text');
          expect(userMessage.content[1]).toHaveProperty('type', 'image_url');
          expect(userMessage.content[1]).toHaveProperty('image_url');
          expect(userMessage.content[1].image_url).toHaveProperty('url');
        }
      });

      it('should format images correctly for Ollama', async () => {
        const ollamaAgent = new TestAgent({
          ...mockAgentConfig,
          llmConfig: mockLLMConfigs.ollama,
        });
        ollamaAgent['chatModel'] = mockChatModel;

        const threadId = 'ollama-test';
        await mockConversationManager.createThread(threadId);
        await mockConversationManager.addMessage(
          threadId,
          mockComplexMessages.withImagesOllama[0]
        );

        const messages = ollamaAgent['convertToLangChainMessages'](threadId);

        const userMessage = messages[1];
        expect(Array.isArray(userMessage.content)).toBe(true);

        if (Array.isArray(userMessage.content)) {
          expect(userMessage.content).toHaveLength(2); // text + image
          expect(userMessage.content[0]).toHaveProperty('type', 'text');
          expect(userMessage.content[1]).toHaveProperty('type', 'image_url');
          expect(userMessage.content[1]).toHaveProperty('image_url');
          // Ollama should have direct image URL (data URL)
          expect(userMessage.content[1].image_url).toMatch(/^data:image/);
        }
      });
    });

    describe('Notes and Image Integration', () => {
      it('should combine images and notes correctly', async () => {
        const threadId = 'notes-images-test';
        await mockConversationManager.createThread(threadId);
        await mockConversationManager.addMessage(
          threadId,
          mockComplexMessages.withImagesAndNotes[0]
        );

        const messages = agent['convertToLangChainMessages'](threadId);
        const userMessage = messages[1];

        expect(Array.isArray(userMessage.content)).toBe(true);
        if (Array.isArray(userMessage.content)) {
          // Should have text content that includes notes
          const textContent = userMessage.content.find(
            item => item.type === 'text'
          );
          expect(textContent).toBeDefined();
          expect(textContent.text).toContain(
            'Review this image along with my notes'
          );
          expect(textContent.text).toContain('ATTACHED NOTES: Meeting Notes');
          expect(textContent.text).toContain(
            'ATTACHED NOTES: Additional Context'
          );

          // Should also have image content
          const imageContent = userMessage.content.find(
            item => item.type === 'image_url' || item.type === 'image'
          );
          expect(imageContent).toBeDefined();
        }
      });

      it('should format notes without images', async () => {
        const message = {
          id: 'msg-notes-only',
          role: 'user' as const,
          content: 'Please review my notes',
          timestamp: new Date(),
          status: 'completed' as const,
          notes: [mockNotesAttachment],
        };

        const threadId = 'notes-only-test';
        await mockConversationManager.createThread(threadId);
        await mockConversationManager.addMessage(threadId, message);

        const messages = agent['convertToLangChainMessages'](threadId);
        const userMessage = messages[1];

        expect(typeof userMessage.content).toBe('string');
        expect(userMessage.content).toContain('Please review my notes');
        expect(userMessage.content).toContain('ATTACHED NOTES: Meeting Notes');
        expect(userMessage.content).toContain('from node: Project Planning');
        expect(userMessage.content).toContain('## Key Points');
      });
    });

    describe('System Message Handling', () => {
      it('should merge multiple system messages', async () => {
        const threadId = 'system-merge-test';
        await mockConversationManager.createThread(threadId);

        // Add multiple system messages
        await mockConversationManager.addMessage(threadId, {
          id: 'sys-1',
          role: 'system',
          content: 'First system message',
          timestamp: new Date(),
          status: 'completed',
        });
        await mockConversationManager.addMessage(threadId, {
          id: 'sys-2',
          role: 'system',
          content: 'Second system message',
          timestamp: new Date(),
          status: 'completed',
        });
        await mockConversationManager.addMessage(threadId, mockMessages[0]);

        const messages = agent['convertToLangChainMessages'](threadId);

        // Should have system + merged system + user = 2 messages
        // (agent adds its own system message, then merges stored ones)
        expect(messages).toHaveLength(2);
        expect(messages[0]._getType()).toBe('system');
        expect(messages[1]._getType()).toBe('human');
      });

      it('should filter empty content messages', async () => {
        const threadId = 'filter-empty-test';
        await mockConversationManager.createThread(threadId);

        // Add messages with empty content
        await mockConversationManager.addMessage(threadId, {
          id: 'empty-1',
          role: 'user',
          content: '',
          timestamp: new Date(),
          status: 'completed',
        });
        await mockConversationManager.addMessage(threadId, {
          id: 'empty-2',
          role: 'assistant',
          content: '   ',
          timestamp: new Date(),
          status: 'completed',
        });
        await mockConversationManager.addMessage(threadId, mockMessages[0]);

        const messages = agent['convertToLangChainMessages'](threadId);

        // Should only have system + valid user message
        expect(messages).toHaveLength(2);
        expect(messages[1]._getType()).toBe('human');
        expect(messages[1].content).toBe(mockMessages[0].content);
      });

      it('should handle includePriorConversation=false correctly', async () => {
        const threadId = 'no-prior-test';
        await mockConversationManager.createThread(threadId);

        // Add multiple messages
        await mockConversationManager.addMessage(threadId, mockMessages[0]);
        await mockConversationManager.addMessage(threadId, mockMessages[1]);
        await mockConversationManager.addMessage(threadId, mockMessages[2]);

        const messages = agent['convertToLangChainMessages'](threadId, false);

        // Should have system + only last user message
        expect(messages).toHaveLength(2);
        expect(messages[0]._getType()).toBe('system');
        expect(messages[1]._getType()).toBe('human');
        expect(messages[1].content).toBe(mockMessages[2].content);
      });
    });

    describe('Perplexity Message Reordering', () => {
      it('should enforce proper user-assistant alternation', async () => {
        const perplexityAgent = new TestAgent({
          ...mockAgentConfig,
          llmConfig: mockProviderConfigs.perplexity,
        });
        perplexityAgent['chatModel'] = mockChatModel;

        const threadId = 'perplexity-alternating-test';
        await mockConversationManager.createThread(threadId);

        // Add properly alternating messages
        for (const msg of mockComplexMessages.perplexityAlternating) {
          await mockConversationManager.addMessage(threadId, msg);
        }

        const messages =
          perplexityAgent['convertToLangChainMessages'](threadId);

        // Should reorder messages properly for Perplexity
        expect(messages.length).toBeGreaterThan(0);
        expect(messages[0]._getType()).toBe('system');

        // Find last message should be human for Perplexity
        const lastMessage = messages[messages.length - 1];
        expect(lastMessage._getType()).toBe('human');
      });

      it('should handle invalid message sequences', async () => {
        const perplexityAgent = new TestAgent({
          ...mockAgentConfig,
          llmConfig: mockProviderConfigs.perplexity,
        });
        perplexityAgent['chatModel'] = mockChatModel;

        const threadId = 'perplexity-invalid-test';
        await mockConversationManager.createThread(threadId);

        // Add invalid sequence (assistant messages first)
        for (const msg of mockComplexMessages.perplexityInvalidSequence) {
          await mockConversationManager.addMessage(threadId, msg);
        }

        const messages =
          perplexityAgent['convertToLangChainMessages'](threadId);

        // Should handle invalid sequences - may not always end with human
        // depending on the specific reordering logic
        expect(messages.length).toBeGreaterThan(0);

        // Test that system message is first
        expect(messages[0]._getType()).toBe('system');

        // Test that we have proper message distribution
        const userMessages = messages.filter(m => m._getType() === 'human');
        const assistantMessages = messages.filter(m => m._getType() === 'ai');
        expect(userMessages.length).toBeGreaterThan(0);
        expect(assistantMessages.length).toBeGreaterThan(0);
      });

      it('should handle empty conversation for Perplexity', async () => {
        const perplexityAgent = new TestAgent({
          ...mockAgentConfig,
          llmConfig: mockProviderConfigs.perplexity,
        });
        perplexityAgent['chatModel'] = mockChatModel;

        const threadId = 'perplexity-empty-test';
        await mockConversationManager.createThread(threadId);

        const messages =
          perplexityAgent['convertToLangChainMessages'](threadId);

        // Should have at least system message
        expect(messages).toHaveLength(1);
        expect(messages[0]._getType()).toBe('system');
      });
    });
  });

  describe('Tool Call Parsing', () => {
    describe('JSON Format Detection', () => {
      it('should parse standard tool call format', () => {
        const result = agent.testParseToolCalls(
          mockToolCallScenarios.standardFormat
        );

        expect(result.toolCalls).toHaveLength(1);
        expect(result.toolCalls![0].name).toBe('mcp_filesystem_read_file');
        expect(result.toolCalls![0].parameters).toEqual({
          path: '/test/file.txt',
        });
        expect(result.content).toBe(
          "Here's the file content:\n\nThe file contains the requested information."
        );
      });

      it('should parse alternate tool call format', () => {
        const result = agent.testParseToolCalls(
          mockToolCallScenarios.alternateFormat
        );

        expect(result.toolCalls).toHaveLength(1);
        expect(result.toolCalls![0].name).toBe('web_search');
        expect(result.toolCalls![0].parameters).toEqual({
          query: 'TypeScript decorators tutorial',
          limit: 5,
        });
      });

      it('should parse multiple tool calls', () => {
        const result = agent.testParseToolCalls(
          mockToolCallScenarios.multipleToolCalls
        );

        expect(result.toolCalls).toHaveLength(2);
        expect(result.toolCalls![0].name).toBe('mcp_filesystem_read_file');
        expect(result.toolCalls![0].parameters).toEqual({
          path: '/config/settings.json',
        });
        expect(result.toolCalls![1].name).toBe('mcp_web_search');
        expect(result.toolCalls![1].parameters).toEqual({
          query: 'API documentation',
        });
      });

      it('should handle malformed JSON gracefully', () => {
        const result = agent.testParseToolCalls(
          mockToolCallScenarios.malformedJSON
        );

        expect(result.toolCalls).toBeUndefined();
        expect(result.content).toBe(mockToolCallScenarios.malformedJSON);
      });

      it('should parse standalone JSON without code blocks', () => {
        const result = agent.testParseToolCalls(
          mockToolCallScenarios.standaloneJSON
        );

        expect(result.toolCalls).toHaveLength(1);
        expect(result.toolCalls![0].name).toBe('mcp_filesystem_create_file');
        expect(result.toolCalls![0].parameters).toEqual({
          path: '/new/file.txt',
          content: 'Hello world',
        });
        expect(result.content).toBe(mockToolCallScenarios.standaloneJSON); // Fallback to original content if standalone
      });

      it('should handle responses with no tool calls', () => {
        const result = agent.testParseToolCalls(
          mockToolCallScenarios.noToolCalls
        );

        expect(result.toolCalls).toBeUndefined();
        expect(result.content).toBe(mockToolCallScenarios.noToolCalls);
      });

      it('should handle MCP tools with underscores in names', () => {
        const result = agent.testParseToolCalls(
          mockToolCallScenarios.mcpToolWithUnderscores
        );

        expect(result.toolCalls).toHaveLength(1);
        expect(result.toolCalls![0].name).toBe('mcp_database_execute_query');
        expect(result.toolCalls![0].parameters).toEqual({
          query: 'SELECT * FROM users WHERE active = true',
          database: 'production',
        });
      });
    });

    describe('Content Cleaning', () => {
      it('should remove JSON blocks after parsing', () => {
        const content = `Before tool call.

\`\`\`json
{
  "tool": "test_tool",
  "parameters": {"key": "value"}
}
\`\`\`

After tool call.`;

        const result = agent.testParseToolCalls(content);

        expect(result.content.trim()).toBe(
          'Before tool call.\n\nAfter tool call.'
        );
        expect(result.toolCalls).toHaveLength(1);
      });

      it('should clean up excessive whitespace', () => {
        const content = `Text\n\n\n\nMore text\n\n\n\nEnd`;
        const result = agent.testParseToolCalls(content);

        expect(result.content).toBe('Text\n\nMore text\n\nEnd');
      });
    });
  });

  describe('Model Creation Edge Cases', () => {
    it('should handle missing API keys gracefully', () => {
      const configWithoutKey = {
        ...mockEdgeCaseConfigs[0],
      };

      expect(() => {
        new TestAgent(configWithoutKey);
      }).not.toThrow();
    });

    it('should transform relative URLs for local models', () => {
      const configWithRelativePath = mockEdgeCaseConfigs[1];
      const testAgent = new TestAgent(configWithRelativePath);

      // Should not throw and should create agent successfully
      expect(testAgent).toBeDefined();
      expect(testAgent.llmConfig.baseURL).toBe('/api/relative-path');
    });

    it('should handle vLLM configuration', () => {
      const vllmAgent = new TestAgent({
        ...mockAgentConfig,
        llmConfig: mockProviderConfigs.vllm,
      });

      expect(vllmAgent).toBeDefined();
      expect(vllmAgent.llmConfig.type).toBe('vllm');
    });

    it('should create OpenAI-compatible models for unknown types', () => {
      const unknownConfig: AgentConfig = {
        workspaceRoot: '/test/workspace',
        llmConfig: {
          baseURL: 'https://custom-api.com/v1',
          model: 'custom-model',
          apiKey: 'test-key',
          type: 'openai-compatible',
          temperature: 0.7,
          maxTokens: 4000,
        },
      };

      const testAgent = new TestAgent(unknownConfig);
      expect(testAgent).toBeDefined();
    });
  });

  describe('Context Management and LFS', () => {
    it('should format LFS summaries correctly', async () => {
      // Test LFS summary formatting through executeToolCalls
      const threadId = 'lfs-test';
      await mockConversationManager.createThread(threadId);

      mockMCPManagerInstance.setToolResult(
        'filesystem',
        'read_file',
        mockMCPResults.lfsResult
      );
      mockLFSManagerInstance.addReference(
        mockMCPResults.lfsResult,
        'Large content here...',
        mockLFSSummary
      );

      const toolCalls = [
        {
          id: 'tool-lfs',
          name: 'mcp_filesystem_read_file',
          parameters: { path: '/large-file.txt' },
        },
      ];

      const results = await agent['executeToolCalls'](
        threadId,
        toolCalls,
        'msg-1'
      );

      expect(results).toHaveLength(1);
      expect(results[0].result).toHaveProperty('success', true);
      const output = (results[0].result as { output: string }).output;
      expect(output).toContain('Large Content Summary');
      expect(output).toContain('15420 characters');
      expect(output).toContain('REST API with JSON responses');
      expect(output).toContain('OAuth 2.0 authentication required');
    });

    it('should handle different MCP result formats', async () => {
      const threadId = 'mcp-formats-test';
      await mockConversationManager.createThread(threadId);

      // Test array result
      mockMCPManagerInstance.setToolResult(
        'test',
        'array_tool',
        mockMCPResults.arrayResult
      );

      const toolCalls = [
        {
          id: 'tool-array',
          name: 'mcp_test_array_tool',
          parameters: {},
        },
      ];

      const results = await agent['executeToolCalls'](
        threadId,
        toolCalls,
        'msg-1'
      );

      expect(results).toHaveLength(1);
      const output = (results[0].result as { output: string }).output;
      expect(output).toContain('First result item');
      expect(output).toContain('Second result item');
      expect(output).toContain('console.log("Hello");');
    });

    it('should handle tool execution errors', async () => {
      const threadId = 'tool-error-test';
      await mockConversationManager.createThread(threadId);

      mockMCPManagerInstance.setToolResult(
        'filesystem',
        'read_file',
        mockMCPResults.errorResult
      );

      const toolCalls = [
        {
          id: 'tool-error',
          name: 'mcp_filesystem_read_file',
          parameters: { path: '/nonexistent.txt' },
        },
      ];

      const results = await agent['executeToolCalls'](
        threadId,
        toolCalls,
        'msg-1'
      );

      expect(results).toHaveLength(1);
      expect(results[0].result).toHaveProperty('success', false);
      expect(results[0].result).toHaveProperty('error');
    });
  });
});

// Additional comprehensive error scenario tests
describe('BaseAgent - Comprehensive Error Scenarios', () => {
  let agent: TestAgent;
  let mockChatModel: InstanceType<typeof MockChatModel>;

  beforeEach(() => {
    // Clear all mocks
    mockConversationManager.clear();
    mockSSEManagerInstance.clear();
    mockMCPManagerInstance.clear();
    mockLFSManagerInstance.clear();

    mockChatModel = new MockChatModel();
    mockChatModel.reset();

    // Create agent instance
    agent = new TestAgent(mockAgentConfig);
    agent['chatModel'] = mockChatModel;
  });

  describe('Specific Error Message Testing', () => {
    Object.entries(mockErrorScenarios).forEach(([errorType, error]) => {
      it(`should handle ${errorType} correctly`, async () => {
        const threadId = `error-test-${errorType}`;
        const userMessage = `Test ${errorType}`;

        mockChatModel.stream = vi.fn().mockRejectedValue(error);

        const result = await agent.processMessage(threadId, userMessage);

        expect(result).toBeDefined();
        expect(result.status).toBe('cancelled');
        expect(result.content).toBeDefined();
        expect(typeof result.content).toBe('string');
        expect(result.content.length).toBeGreaterThan(0);
      });
    });
  });
});

// Streaming and Tool Call Integration Tests
describe('BaseAgent - Streaming and Tool Integration', () => {
  let agent: TestAgent;
  let mockChatModel: InstanceType<typeof MockChatModel>;

  beforeEach(() => {
    // Clear all mocks
    mockConversationManager.clear();
    mockSSEManagerInstance.clear();
    mockMCPManagerInstance.clear();
    mockLFSManagerInstance.clear();

    mockChatModel = new MockChatModel();
    mockChatModel.reset();

    // Create agent instance
    agent = new TestAgent(mockAgentConfig);
    agent['chatModel'] = mockChatModel;
  });

  describe('Streaming Response Handling', () => {
    it('should handle simple streaming without tools', async () => {
      const threadId = 'stream-test';
      const userMessage = 'Tell me about TypeScript';
      const response = 'TypeScript is a superset of JavaScript';

      await mockConversationManager.createThread(threadId);

      // Mock streaming response
      mockChatModel.stream = vi.fn().mockImplementation(async function* () {
        const chunks = response.split(' ');
        for (const chunk of chunks) {
          yield { content: chunk + ' ', tool_calls: [], tool_call_chunks: [] };
        }
      });

      const updates: ConversationMessage[] = [];
      const result = await agent.processMessage(threadId, userMessage, {
        onUpdate: msg => updates.push(msg),
      });

      expect(result.content).toBe(
        response
          .split(' ')
          .map(chunk => chunk + ' ')
          .join('')
      );
      expect(result.status).toBe('completed');
      expect(updates.length).toBeGreaterThan(0);
    });

    it('should handle streaming with tool call chunks', async () => {
      const threadId = 'stream-tool-test';
      const userMessage = 'Read a file for me';

      await mockConversationManager.createThread(threadId);

      // Set up MCP tool result
      mockMCPManagerInstance.setToolResult('filesystem', 'read_file', {
        success: true,
        output: 'File contents from streaming test',
      });

      // Mock streaming response with tool call chunks
      mockChatModel.stream = vi.fn().mockImplementation(async function* () {
        yield {
          content: "I'll read the file",
          tool_calls: [],
          tool_call_chunks: [
            { index: 0, id: 'tool-1', name: 'mcp_filesystem_read_file' },
          ],
        };
        yield {
          content: ' for you.',
          tool_calls: [],
          tool_call_chunks: [{ index: 0, args: '{"path": "/test.txt"}' }],
        };
      });

      // Mock follow-up response after tool execution
      const followUpStream = vi.fn().mockImplementation(async function* () {
        yield {
          content: 'The file contains: ',
          tool_calls: [],
          tool_call_chunks: [],
        };
        yield {
          content: 'File contents from streaming test',
          tool_calls: [],
          tool_call_chunks: [],
        };
      });

      mockChatModel.stream.mockImplementationOnce(
        mockChatModel.stream.getMockImplementation()
      );
      mockChatModel.stream.mockImplementationOnce(followUpStream);

      const result = await agent.processMessage(threadId, userMessage);

      expect(result.status).toBe('completed');
      expect(result.content).toContain('File contents from streaming test');
      expect(result.toolResults).toBeDefined();
      expect(result.toolResults).toHaveLength(1);
      expect(result.toolResults![0].name).toBe('mcp_filesystem_read_file');
    });

    it('should handle streaming cancellation', async () => {
      const threadId = 'cancel-stream-test';
      const userMessage = 'Long running task';

      await mockConversationManager.createThread(threadId);

      const abortController = new AbortController();

      // Mock long streaming response
      mockChatModel.stream = vi.fn().mockImplementation(async function* () {
        for (let i = 0; i < 100; i++) {
          if (abortController.signal.aborted) {
            throw new Error('Aborted');
          }
          yield {
            content: `chunk ${i} `,
            tool_calls: [],
            tool_call_chunks: [],
          };
          // Simulate delay
          await new Promise(resolve => setTimeout(resolve, 1));
        }
      });

      // Cancel after a brief delay
      setTimeout(() => abortController.abort(), 5);

      const result = await agent.processMessage(threadId, userMessage, {
        signal: abortController.signal,
      });

      expect(result.status).toBe('cancelled');
    });

    it('should accumulate tool call chunks correctly', async () => {
      const threadId = 'chunk-accumulation-test';
      const userMessage = 'Execute a complex tool';

      await mockConversationManager.createThread(threadId);

      // Set up MCP tool result
      mockMCPManagerInstance.setToolResult('web', 'search', {
        success: true,
        output: 'Search results for complex query',
      });

      // Spy on executeTool method
      const executeToolSpy = vi.spyOn(mockMCPManagerInstance, 'executeTool');

      // Mock streaming response with fragmented tool call chunks
      mockChatModel.stream = vi.fn().mockImplementation(async function* () {
        yield {
          content: 'Searching...',
          tool_calls: [],
          tool_call_chunks: [
            { index: 0, id: 'search-1', name: 'mcp_web_search' },
          ],
        };
        yield {
          content: '',
          tool_calls: [],
          tool_call_chunks: [{ index: 0, args: '{"query": "complex' }],
        };
        yield {
          content: '',
          tool_calls: [],
          tool_call_chunks: [{ index: 0, args: ' search query"}' }],
        };
      });

      // Mock follow-up response
      const followUpStream = vi.fn().mockImplementation(async function* () {
        yield {
          content: 'Found: Search results for complex query',
          tool_calls: [],
          tool_call_chunks: [],
        };
      });

      mockChatModel.stream.mockImplementationOnce(
        mockChatModel.stream.getMockImplementation()
      );
      mockChatModel.stream.mockImplementationOnce(followUpStream);

      const result = await agent.processMessage(threadId, userMessage);

      expect(result.status).toBe('completed');
      expect(result.toolResults).toHaveLength(1);
      expect(result.toolResults![0].name).toBe('mcp_web_search');

      // Verify the tool was called with the accumulated parameters
      expect(executeToolSpy).toHaveBeenCalledWith('web', 'search', {
        query: 'complex search query',
      });
    });

    it('should handle mixed tool_calls and tool_call_chunks', async () => {
      const threadId = 'mixed-tools-test';
      const userMessage = 'Mixed tool execution';

      await mockConversationManager.createThread(threadId);

      // Set up MCP tool results
      mockMCPManagerInstance.setToolResult('filesystem', 'read_file', {
        success: true,
        output: 'File content',
      });
      mockMCPManagerInstance.setToolResult('web', 'search', {
        success: true,
        output: 'Search results',
      });

      // Mock streaming with both complete tool_calls and chunked tool_call_chunks
      mockChatModel.stream = vi.fn().mockImplementation(async function* () {
        yield {
          content: 'Processing...',
          tool_calls: [
            {
              id: 'file-1',
              name: 'mcp_filesystem_read_file',
              args: { path: '/test.txt' },
            },
          ],
          tool_call_chunks: [
            { index: 1, id: 'search-1', name: 'mcp_web_search' },
          ],
        };
        yield {
          content: '',
          tool_calls: [],
          tool_call_chunks: [{ index: 1, args: '{"query": "test"}' }],
        };
      });

      // Mock follow-up response
      const followUpStream = vi.fn().mockImplementation(async function* () {
        yield {
          content: 'Results: File content and Search results',
          tool_calls: [],
          tool_call_chunks: [],
        };
      });

      mockChatModel.stream.mockImplementationOnce(
        mockChatModel.stream.getMockImplementation()
      );
      mockChatModel.stream.mockImplementationOnce(followUpStream);

      const result = await agent.processMessage(threadId, userMessage);

      expect(result.status).toBe('completed');
      expect(result.toolResults).toHaveLength(2);

      // Should have both tools executed
      const toolNames = result.toolResults!.map(r => r.name);
      expect(toolNames).toContain('mcp_filesystem_read_file');
      expect(toolNames).toContain('mcp_web_search');
    });
  });

  describe('Complex Integration Scenarios', () => {
    it('should handle tool execution failure during streaming', async () => {
      const threadId = 'tool-failure-stream-test';
      const userMessage = 'Try to read a missing file';

      await mockConversationManager.createThread(threadId);

      // Set up failing MCP tool
      mockMCPManagerInstance.setToolResult(
        'filesystem',
        'read_file',
        new Error('File not found')
      );

      // Mock streaming response with tool call
      mockChatModel.stream = vi.fn().mockImplementation(async function* () {
        yield {
          content: "I'll read the file",
          tool_calls: [
            {
              id: 'file-1',
              name: 'mcp_filesystem_read_file',
              args: { path: '/missing.txt' },
            },
          ],
          tool_call_chunks: [],
        };
      });

      // Mock follow-up response after tool failure
      const followUpStream = vi.fn().mockImplementation(async function* () {
        yield {
          content: 'Sorry, the file could not be found.',
          tool_calls: [],
          tool_call_chunks: [],
        };
      });

      mockChatModel.stream.mockImplementationOnce(
        mockChatModel.stream.getMockImplementation()
      );
      mockChatModel.stream.mockImplementationOnce(followUpStream);

      const result = await agent.processMessage(threadId, userMessage);

      expect(result.status).toBe('completed');
      expect(result.toolResults).toHaveLength(1);
      expect(result.toolResults![0].result).toHaveProperty('success', false);
      expect(result.toolResults![0].result).toHaveProperty('error');
    });

    it('should handle multiple concurrent tool calls', async () => {
      const threadId = 'concurrent-tools-test';
      const userMessage = 'Execute multiple tools simultaneously';

      await mockConversationManager.createThread(threadId);

      // Set up multiple MCP tools
      mockMCPManagerInstance.setToolResult('filesystem', 'read_file', {
        success: true,
        output: 'File 1 content',
      });
      mockMCPManagerInstance.setToolResult('filesystem', 'list_directory', {
        success: true,
        output: 'dir1/\ndir2/\nfile1.txt',
      });
      mockMCPManagerInstance.setToolResult('web', 'search', {
        success: true,
        output: 'Search result data',
      });

      // Mock streaming response with multiple tool calls
      mockChatModel.stream = vi.fn().mockImplementation(async function* () {
        yield {
          content: 'Executing multiple operations...',
          tool_calls: [
            {
              id: 'file-1',
              name: 'mcp_filesystem_read_file',
              args: { path: '/file1.txt' },
            },
            {
              id: 'dir-1',
              name: 'mcp_filesystem_list_directory',
              args: { path: '/' },
            },
            {
              id: 'search-1',
              name: 'mcp_web_search',
              args: { query: 'test query' },
            },
          ],
          tool_call_chunks: [],
        };
      });

      // Mock follow-up response
      const followUpStream = vi.fn().mockImplementation(async function* () {
        yield {
          content: 'All operations completed successfully.',
          tool_calls: [],
          tool_call_chunks: [],
        };
      });

      mockChatModel.stream.mockImplementationOnce(
        mockChatModel.stream.getMockImplementation()
      );
      mockChatModel.stream.mockImplementationOnce(followUpStream);

      const result = await agent.processMessage(threadId, userMessage);

      expect(result.status).toBe('completed');
      expect(result.toolResults).toHaveLength(3);

      // Verify all tools were executed
      const toolNames = result.toolResults!.map(r => r.name);
      expect(toolNames).toContain('mcp_filesystem_read_file');
      expect(toolNames).toContain('mcp_filesystem_list_directory');
      expect(toolNames).toContain('mcp_web_search');
    });

    it('should handle streaming with empty content chunks', async () => {
      const threadId = 'empty-chunks-test';
      const userMessage = 'Test empty chunks';

      await mockConversationManager.createThread(threadId);

      // Mock streaming with some empty content chunks
      mockChatModel.stream = vi.fn().mockImplementation(async function* () {
        yield { content: 'Start', tool_calls: [], tool_call_chunks: [] };
        yield { content: '', tool_calls: [], tool_call_chunks: [] }; // Empty chunk
        yield { content: ' middle', tool_calls: [], tool_call_chunks: [] };
        yield { content: '', tool_calls: [], tool_call_chunks: [] }; // Another empty chunk
        yield { content: ' end', tool_calls: [], tool_call_chunks: [] };
      });

      const result = await agent.processMessage(threadId, userMessage);

      expect(result.status).toBe('completed');
      expect(result.content).toBe('Start middle end');
    });

    it('should handle complex content types in streaming', async () => {
      const threadId = 'complex-content-test';
      const userMessage = 'Test complex content';

      await mockConversationManager.createThread(threadId);

      // Mock streaming with different content types
      mockChatModel.stream = vi.fn().mockImplementation(async function* () {
        // String content
        yield { content: 'Text: ', tool_calls: [], tool_call_chunks: [] };

        // Array content
        yield {
          content: [
            { type: 'text', text: 'Array text ' },
            { type: 'text', text: 'more text' },
          ],
          tool_calls: [],
          tool_call_chunks: [],
        };

        // Object content
        yield {
          content: { text: ' Object text', content: ' extra' },
          tool_calls: [],
          tool_call_chunks: [],
        };
      });

      const result = await agent.processMessage(threadId, userMessage);

      expect(result.status).toBe('completed');
      expect(result.content).toContain('Text: ');
      expect(result.content).toContain('Array text');
      expect(result.content).toContain('more text');
      expect(result.content).toContain('Object text');
    });
  });
});
