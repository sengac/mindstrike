import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChatAgent } from '../chatAgent';
import type { AgentConfig } from '../baseAgent';
import {
  MockConversationManager,
  MockChatModel,
  createMockLogger,
} from './mocks/mockServices';
import { mockAgentConfig } from './fixtures/mockData';

// Mock instances
const mockSSEManagerInstance = {
  broadcast: vi.fn(),
  clear: vi.fn(),
  getBroadcastsByType: vi.fn(() => []),
};

// Mock dependencies
vi.mock('../conversationManager', () => ({
  ConversationManager: vi.fn(() => new MockConversationManager()),
}));

vi.mock('../sseManager', () => ({
  sseManager: mockSSEManagerInstance,
}));

vi.mock('../mcpManager', () => ({
  mcpManager: {
    getLangChainTools: vi.fn(() => []),
    executeTool: vi.fn(),
  },
}));

vi.mock('../lfsManager', () => ({
  lfsManager: {
    isLFSReference: vi.fn(() => false),
    retrieveContent: vi.fn(),
    getSummaryByReference: vi.fn(),
  },
}));

vi.mock('../logger', () => ({
  logger: createMockLogger(),
}));

// Mock LangChain models
vi.mock('@langchain/openai', () => ({
  ChatOpenAI: vi.fn(() => new MockChatModel()),
}));

describe('ChatAgent', () => {
  let agent: ChatAgent;
  let mockConversationManager: MockConversationManager;
  let mockChatModel: MockChatModel;

  beforeEach(() => {
    mockConversationManager = new MockConversationManager();
    mockChatModel = new MockChatModel();

    agent = new ChatAgent(mockAgentConfig);
    agent['conversationManager'] = mockConversationManager;
    agent['chatModel'] = mockChatModel;
  });

  describe('Prompt Management', () => {
    it('should use default prompt when no custom prompt is provided', () => {
      const config: AgentConfig = {
        ...mockAgentConfig,
        customPrompt: undefined,
      };

      const agent = new ChatAgent(config);
      const systemPrompt = agent.createSystemPrompt();

      expect(systemPrompt).toBe('You are a helpful assistant.');
    });

    it('should use custom prompt when provided', () => {
      const customPrompt = 'You are a specialized coding assistant.';
      const config: AgentConfig = {
        ...mockAgentConfig,
        customPrompt,
      };

      const agent = new ChatAgent(config);
      const systemPrompt = agent.createSystemPrompt();

      expect(systemPrompt).toBe(customPrompt);
    });

    it('should return correct default prompt', () => {
      const defaultPrompt = agent.getDefaultPrompt();
      expect(defaultPrompt).toBe('You are a helpful assistant.');
    });
  });

  describe('Message Processing', () => {
    it('should process messages using base agent functionality', async () => {
      const threadId = 'test-thread';
      const userMessage = 'Hello, can you help me?';
      const assistantResponse = 'Of course! I would be happy to help you.';

      mockChatModel.setResponses(assistantResponse);

      const result = await agent.processMessage(threadId, userMessage);

      expect(result).toBeDefined();
      expect(result.role).toBe('assistant');
      expect(result.content).toBe(assistantResponse);
      expect(result.status).toBe('completed');
    });

    it('should maintain conversation context', async () => {
      const threadId = 'test-thread';

      // Pre-create the thread
      await mockConversationManager.createThread(threadId);
      mockChatModel.setResponses(
        'Nice to meet you!',
        'I remember you said your name is Alice.'
      );

      await agent.processMessage(threadId, 'Hi, my name is Alice');
      await agent.processMessage(threadId, 'Do you remember my name?');

      const messages = agent.getConversation(threadId);
      expect(messages).toHaveLength(4); // 2 user + 2 assistant messages
      expect(messages[3].content).toContain('Alice');
    });

    it('should handle images in messages', async () => {
      const threadId = 'test-thread';
      const userMessage = 'What do you see?';
      const response = 'I can see an image.';

      // Pre-create the thread
      await mockConversationManager.createThread(threadId);
      mockChatModel.setResponses(response);

      const imageAttachment = {
        id: 'img-1',
        filename: 'test.png',
        filepath: '/images/test.png',
        mimeType: 'image/png',
        size: 1024,
        thumbnail: 'data:image/png;base64,test',
        fullImage: 'data:image/png;base64,test',
        uploadedAt: new Date(),
      };

      const result = await agent.processMessage(threadId, userMessage, {
        images: [imageAttachment],
      });

      expect(result.content).toBe(response);

      const messages = mockConversationManager.getThreadMessages(threadId);
      const userMsg = messages.find(m => m.role === 'user');
      expect(userMsg?.images).toHaveLength(1);
    });

    it('should handle notes attachments', async () => {
      const threadId = 'test-thread';
      const userMessage = 'Please review these notes';
      const response = 'I have reviewed the notes.';

      // Pre-create the thread
      await mockConversationManager.createThread(threadId);
      mockChatModel.setResponses(response);

      const notesAttachment = {
        id: 'note-1',
        title: 'Important Notes',
        content: 'These are important meeting notes.',
        nodeLabel: 'Meeting',
        attachedAt: new Date(),
      };

      const result = await agent.processMessage(threadId, userMessage, {
        notes: [notesAttachment],
      });

      expect(result.content).toBe(response);

      const messages = mockConversationManager.getThreadMessages(threadId);
      const userMsg = messages.find(m => m.role === 'user');
      expect(userMsg?.notes).toHaveLength(1);
      expect(userMsg?.notes?.[0].title).toBe('Important Notes');
    });
  });

  describe('Conversation Management', () => {
    it('should inherit conversation management from BaseAgent', async () => {
      const threadId = 'test-thread';
      await mockConversationManager.createThread(threadId);

      // Add some messages
      mockChatModel.setResponses('Response 1', 'Response 2');
      await agent.processMessage(threadId, 'Message 1');
      await agent.processMessage(threadId, 'Message 2');

      // Test getConversation
      const conversation = agent.getConversation(threadId);
      expect(conversation.length).toBeGreaterThan(0);

      // Test deleteMessage
      const messageToDelete = conversation[0];
      const deleted = await agent.deleteMessage(threadId, messageToDelete.id);
      expect(deleted).toBe(true);

      // Test clearConversation
      await agent.clearConversation(threadId);
      const clearedConversation = agent.getConversation(threadId);
      expect(clearedConversation).toHaveLength(0);
    });

    it('should update prompts dynamically', async () => {
      const threadId = 'test-thread';
      const newPrompt = 'You are a Python expert assistant.';

      await agent.updatePrompt(threadId, newPrompt);

      expect(agent.getCurrentPrompt()).toBe(newPrompt);
      expect(agent.createSystemPrompt()).toBe(newPrompt);
    });
  });

  describe('Configuration Updates', () => {
    it('should update LLM configuration', () => {
      const newLLMConfig = {
        baseURL: 'https://api.anthropic.com',
        model: 'claude-3',
        displayName: 'Claude 3',
        apiKey: 'new-api-key',
        type: 'anthropic' as const,
        temperature: 0.5,
        maxTokens: 8000,
      };

      agent.updateLLMConfig(newLLMConfig);

      expect(agent['config'].llmConfig).toEqual(newLLMConfig);
    });

    it('should update workspace root', () => {
      const newWorkspaceRoot = '/new/workspace/path';

      agent.updateWorkspaceRoot(newWorkspaceRoot);

      expect(agent['config'].workspaceRoot).toBe(newWorkspaceRoot);
    });
  });

  describe('Tool Support', () => {
    it('should support tool refreshing', async () => {
      await agent.refreshTools();

      // Verify that the agent can refresh tools without errors
      expect(agent.getTools()).toBeDefined();
    });

    it('should inherit tool execution from BaseAgent', async () => {
      const threadId = 'test-thread';

      // Mock a response with tool calls
      const toolCallResponse = `I'll help you with that.
      
      \`\`\`json
      {
        "tool": "read_file",
        "parameters": {
          "path": "/test.txt"
        }
      }
      \`\`\``;

      mockChatModel.setResponses(toolCallResponse, 'File contents processed.');

      const result = await agent.processMessage(threadId, 'Read the test file');

      // The agent should process the tool call and provide a response
      expect(result).toBeDefined();
      expect(result.role).toBe('assistant');
    });
  });

  describe('Error Handling', () => {
    it('should handle errors gracefully', async () => {
      const threadId = 'test-thread';
      const userMessage = 'This will cause an error';

      // Create a mock error model
      const errorModel = new MockChatModel();
      errorModel.invoke = vi.fn().mockRejectedValue(new Error('API Error'));
      errorModel.stream = vi.fn().mockRejectedValue(new Error('API Error'));
      agent['chatModel'] = errorModel;

      const result = await agent.processMessage(threadId, userMessage);

      expect(result).toBeDefined();
      expect(result.status).toBe('cancelled');
      expect(result.content).toContain('Error');
    });

    it('should handle rate limit errors', async () => {
      const threadId = 'test-thread';
      const userMessage = 'Test rate limit';

      // Create a mock error model
      const rateLimitModel = new MockChatModel();
      rateLimitModel.invoke = vi
        .fn()
        .mockRejectedValue(new Error('rate limit exceeded'));
      rateLimitModel.stream = vi
        .fn()
        .mockRejectedValue(new Error('rate limit exceeded'));
      agent['chatModel'] = rateLimitModel;

      const result = await agent.processMessage(threadId, userMessage);

      expect(result.content).toContain('Rate Limit');
    });
  });

  describe('Streaming Support', () => {
    it('should support streaming responses', async () => {
      const threadId = 'test-thread';
      const userMessage = 'Stream a response';
      const streamContent =
        'This is a streaming response that will be sent in chunks.';

      mockChatModel.setResponses(streamContent);

      let updateCount = 0;
      const onUpdate = vi.fn(() => {
        updateCount++;
      });

      const result = await agent.processMessage(threadId, userMessage, {
        onUpdate,
      });

      expect(result.content).toBe(streamContent);
      expect(updateCount).toBeGreaterThan(0);
      expect(onUpdate).toHaveBeenCalled();
    });

    it('should handle stream cancellation', async () => {
      const threadId = 'test-thread';
      const userMessage = 'Cancel this stream';
      const abortController = new AbortController();

      mockChatModel.setResponses('This will be cancelled...');

      // Cancel after a short delay
      setTimeout(() => abortController.abort(), 5);

      const result = await agent.processMessage(threadId, userMessage, {
        signal: abortController.signal,
      });

      expect(result).toBeDefined();
      // The message should complete even if cancelled
      expect(result.role).toBe('assistant');
    });
  });
});
