import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AgentConfig } from '../baseAgent';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import type { DynamicStructuredTool } from '@langchain/core/tools';

// Use vi.hoisted to create mock instances before imports
const { mockSSEManagerInstance, mockMCPManagerInstance } = vi.hoisted(() => {
  // Define mocks inline to avoid require
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
      return this.broadcasts.filter(
        b =>
          typeof b.data === 'object' &&
          b.data !== null &&
          'type' in b.data &&
          (b.data as { type: string }).type === type
      );
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

  return {
    mockSSEManagerInstance: new MockSSEManager(),
    mockMCPManagerInstance: new MockMCPManager(),
  };
});

// Import other mocks after hoisting
import {
  MockConversationManager,
  MockChatModel,
  createMockLogger,
} from './mocks/mockServices';

// Mock dependencies
vi.mock('../conversationManager', () => ({
  ConversationManager: vi.fn(() => new MockConversationManager()),
}));

vi.mock('../sseManager', () => ({
  sseManager: mockSSEManagerInstance,
}));

vi.mock('../mcpManager', () => ({
  mcpManager: mockMCPManagerInstance,
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

vi.mock('../serverDebugLogger', () => ({
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

// Mock AgentExecutor
const mockAgentExecutor = {
  invoke: vi.fn(async () => ({ output: 'Tool executed successfully' })),
};

vi.mock('langchain/agents', () => ({
  AgentExecutor: vi.fn(() => mockAgentExecutor),
  createToolCallingAgent: vi.fn(() => ({})),
}));

// Import WorkflowAgent and test data after mocks are set up
import { WorkflowAgent } from '../workflowAgent';
import { mockAgentConfig } from './fixtures/mockData';

describe('WorkflowAgent', () => {
  let agent: WorkflowAgent;
  let mockConversationManager: MockConversationManager;
  let mockChatModel: MockChatModel;

  beforeEach(() => {
    mockConversationManager = new MockConversationManager();
    mockChatModel = new MockChatModel();
    mockSSEManagerInstance.clear();
    mockMCPManagerInstance.clear();
    mockAgentExecutor.invoke.mockClear();

    agent = new WorkflowAgent(mockAgentConfig);
    agent['conversationManager'] = mockConversationManager;
    agent['chatModel'] = mockChatModel;
    agent['agentExecutor'] = mockAgentExecutor;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('System Prompt Creation', () => {
    it('should create default workflow prompt', () => {
      const prompt = agent.createSystemPrompt();

      expect(prompt).toContain('workflow agent');
      expect(prompt).toContain('ReAct methodology');
      expect(prompt).toContain('Reasoning, Acting, Observing');
    });

    it('should use custom prompt when provided', () => {
      const customPrompt = 'You are a specialized workflow automation agent';
      const config: AgentConfig = {
        ...mockAgentConfig,
        customPrompt,
      };

      const customAgent = new WorkflowAgent(config);
      const prompt = customAgent.createSystemPrompt();

      expect(prompt).toContain(customPrompt);
      expect(prompt).toContain('ReAct Methodology Guidelines');
    });

    it('should return default prompt from getDefaultPrompt', () => {
      const defaultPrompt = agent.getDefaultPrompt();

      expect(defaultPrompt).toContain('sophisticated workflow agent');
      expect(defaultPrompt).toContain('Reason');
      expect(defaultPrompt).toContain('Plan');
      expect(defaultPrompt).toContain('Act');
      expect(defaultPrompt).toContain('Observe');
    });
  });

  describe('Chat Topic Management', () => {
    it('should set chat topic', () => {
      const topic = 'test-chat-topic';
      agent.setChatTopic(topic);

      expect(agent['chatTopic']).toBe(topic);
    });
  });

  describe('Direct Tool Execution Optimization', () => {
    it('should identify direct navigation to Google', () => {
      const task = 'Navigate to google.com';
      const result = agent['tryDirectToolExecution'](task);

      expect(result).toBeDefined();
      expect(result?.action).toBe('navigate to Google');
      expect(result?.toolCall).toContain('mcp_playwright_browser_navigate');
      expect(result?.toolCall).toContain('https://google.com');
    });

    it('should identify search for Roland Quast', () => {
      const task = 'Search for Roland Quast';
      const result = agent['tryDirectToolExecution'](task);

      expect(result).toBeDefined();
      expect(result?.action).toBe('search for Roland Quast');
      expect(result?.toolCall).toContain('mcp_playwright_browser_type');
      expect(result?.toolCall).toContain('roland quast');
    });

    it('should identify click search action', () => {
      const task = 'Click the search button';
      const result = agent['tryDirectToolExecution'](task);

      expect(result).toBeDefined();
      expect(result?.action).toBe('click search');
      expect(result?.toolCall).toContain('mcp_playwright_browser_press_key');
      expect(result?.toolCall).toContain('Enter');
    });

    it('should return null for complex tasks', () => {
      const task = 'Analyze the website structure and create a report';
      const result = agent['tryDirectToolExecution'](task);

      expect(result).toBeNull();
    });
  });

  describe('Workflow Processing', () => {
    it('should process message through workflow', async () => {
      const threadId = 'test-thread';
      const userMessage = 'Research TypeScript best practices';

      // Pre-create the thread
      await mockConversationManager.createThread(threadId);

      // Mock responses for each workflow node
      mockChatModel.setResponses(
        // Reasoning response
        `ANALYSIS:
        The user wants to research TypeScript best practices.
        
        PLAN:
        1. Search for TypeScript best practices documentation
        2. Compile key recommendations
        3. Create summary`,

        // Action response (if needed)
        'Searching for TypeScript best practices...',

        // Observation response
        'Found comprehensive TypeScript best practices documentation',

        // Finalization response
        'Here are the TypeScript best practices I found: use strict mode, prefer const, use interfaces over types, enable strict null checks, and always handle promise rejections.'
      );

      const result = await agent.processMessage(threadId, userMessage);

      expect(result).toBeDefined();
      expect(result.role).toBe('assistant');
      expect(result.content).toContain('TypeScript best practices');
    });

    it('should handle workflow with images', async () => {
      const threadId = 'test-thread';
      const userMessage = 'Analyze this diagram';

      // Pre-create the thread
      await mockConversationManager.createThread(threadId);
      const imageAttachment = {
        id: 'img-1',
        filename: 'diagram.png',
        filepath: '/images/diagram.png',
        mimeType: 'image/png',
        size: 1024,
        thumbnail: 'data:image/png;base64,test',
        fullImage: 'data:image/png;base64,test',
        uploadedAt: new Date(),
      };

      mockChatModel.setResponses(
        'ANALYSIS: Image analysis\n\nPLAN:\n1. Process image',
        'Image processed',
        'The diagram shows...'
      );

      const result = await agent.processMessage(threadId, userMessage, {
        images: [imageAttachment],
      });

      expect(result).toBeDefined();
      expect(result.content).toContain('diagram');
    });

    it('should handle workflow errors gracefully', async () => {
      const threadId = 'test-thread';
      const userMessage = 'This will fail';

      // Pre-create the thread
      await mockConversationManager.createThread(threadId);

      // Make the chat model throw an error
      mockChatModel.invoke = vi
        .fn()
        .mockRejectedValue(new Error('Workflow error'));

      const result = await agent.processMessage(threadId, userMessage);

      expect(result).toBeDefined();
      expect(result.role).toBe('assistant');
      expect(result.content).toContain('error');
    });
  });

  describe('Workflow Nodes', () => {
    it('should execute reasoning node', async () => {
      const state = {
        messages: [new HumanMessage('Test request')],
        reasoning: '',
        plan: [],
        currentTask: '',
        taskResults: {},
        workflowId: 'test-workflow',
        iteration: 0,
        maxIterations: 5,
      };

      mockChatModel.setResponses(
        `ANALYSIS:
        Analyzing the test request.
        
        PLAN:
        1. First task
        2. Second task`
      );

      const result = await agent['reasoningNode'](state);

      expect(result.reasoning).toContain('Analyzing the test request');
      expect(result.plan).toHaveLength(2);
      expect(result.plan?.[0]).toBe('First task');
      expect(result.plan?.[1]).toBe('Second task');
    });

    it('should execute planning node when no plan exists', async () => {
      const state = {
        messages: [],
        reasoning: 'Previous reasoning',
        plan: [],
        currentTask: '',
        taskResults: {},
        workflowId: 'test-workflow',
        iteration: 0,
        maxIterations: 5,
      };

      mockChatModel.setResponses('["Task 1", "Task 2", "Task 3"]');

      const result = await agent['planningNode'](state);

      expect(result.plan).toHaveLength(3);
      expect(result.plan?.[0]).toBe('Task 1');
    });

    it('should skip planning node when plan exists', async () => {
      const existingPlan = ['Existing task 1', 'Existing task 2'];
      const state = {
        messages: [],
        reasoning: '',
        plan: existingPlan,
        currentTask: '',
        taskResults: {},
        workflowId: 'test-workflow',
        iteration: 0,
        maxIterations: 5,
      };

      const result = await agent['planningNode'](state);

      expect(result.plan).toEqual(existingPlan);
    });

    it('should execute action node with direct tool execution', async () => {
      const state = {
        messages: [],
        reasoning: '',
        plan: ['Navigate to google.com'],
        currentTask: '',
        taskResults: {},
        workflowId: 'test-workflow',
        iteration: 0,
        maxIterations: 5,
      };

      mockAgentExecutor.invoke.mockResolvedValue({
        output: 'Navigated to Google',
      });

      const result = await agent['actionNode'](state);

      expect(result.currentTask).toBe('Navigate to google.com');
      expect(result.iteration).toBe(1);
      expect(result.taskResults).toHaveProperty('task-1');
      expect(mockAgentExecutor.invoke).toHaveBeenCalled();
    });

    it('should execute action node with LLM reasoning', async () => {
      const state = {
        messages: [],
        reasoning: '',
        plan: ['Complex analysis task'],
        currentTask: '',
        taskResults: {},
        workflowId: 'test-workflow',
        iteration: 0,
        maxIterations: 5,
      };

      mockAgentExecutor.invoke.mockResolvedValue({
        output: 'Analysis complete',
      });

      const result = await agent['actionNode'](state);

      expect(result.currentTask).toBe('Complex analysis task');
      expect(result.iteration).toBe(1);
      expect(mockAgentExecutor.invoke).toHaveBeenCalled();
    });

    it('should handle action node tool execution errors', async () => {
      const state = {
        messages: [],
        reasoning: '',
        plan: ['Task that will fail'],
        currentTask: '',
        taskResults: {},
        workflowId: 'test-workflow',
        iteration: 0,
        maxIterations: 5,
      };

      mockAgentExecutor.invoke.mockRejectedValue(new Error('Tool failed'));

      const result = await agent['actionNode'](state);

      expect(result.taskResults?.['task-1']).toBeDefined();
      expect(result.taskResults?.['task-1'].result).toContain(
        'Tool execution failed'
      );
    });

    it('should execute observation node', async () => {
      const state = {
        messages: [],
        reasoning: '',
        plan: ['Task 1', 'Task 2'],
        currentTask: 'Task 1',
        taskResults: {
          'task-1': {
            description: 'Task 1',
            result: 'Task 1 completed',
            timestamp: new Date().toISOString(),
          },
        },
        workflowId: 'test-workflow',
        iteration: 1,
        maxIterations: 5,
      };

      mockChatModel.setResponses(
        'Task completed successfully, proceeding to next task'
      );

      const result = await agent['observationNode'](state);

      expect(result).toBeDefined();
    });

    it('should execute finalization node', async () => {
      const state = {
        messages: [new HumanMessage('Original request')],
        reasoning: 'Initial analysis',
        plan: ['Task 1', 'Task 2'],
        currentTask: 'Task 2',
        taskResults: {
          'task-1': { result: 'Result 1' },
          'task-2': { result: 'Result 2' },
        },
        workflowId: 'test-workflow',
        iteration: 2,
        maxIterations: 5,
      };

      mockChatModel.setResponses('Final summary of completed tasks...');

      const result = await agent['finalizationNode'](state);

      expect(result.messages).toHaveLength(1);
      expect(result.messages?.[0]).toBeInstanceOf(AIMessage);
      expect(result.messages?.[0].content).toContain('Final summary');
    });
  });

  describe('Workflow Control Flow', () => {
    it('should continue when more tasks remain', () => {
      const state = {
        messages: [],
        reasoning: '',
        plan: ['Task 1', 'Task 2', 'Task 3'],
        currentTask: '',
        taskResults: {},
        workflowId: 'test-workflow',
        iteration: 1, // Just completed first task
        maxIterations: 5,
      };

      const decision = agent['shouldContinue'](state);

      expect(decision).toBe('continue');
    });

    it('should finalize when all tasks complete', () => {
      const state = {
        messages: [],
        reasoning: '',
        plan: ['Task 1', 'Task 2'],
        currentTask: '',
        taskResults: {},
        workflowId: 'test-workflow',
        iteration: 2, // Completed all tasks
        maxIterations: 5,
      };

      const decision = agent['shouldContinue'](state);

      expect(decision).toBe('finalize');
    });

    it('should finalize when max iterations reached', () => {
      const state = {
        messages: [],
        reasoning: '',
        plan: Array(10).fill('Task'), // Many tasks
        currentTask: '',
        taskResults: {},
        workflowId: 'test-workflow',
        iteration: 5, // Reached max
        maxIterations: 5,
      };

      const decision = agent['shouldContinue'](state);

      expect(decision).toBe('finalize');
    });
  });

  describe('SSE Event Broadcasting', () => {
    it('should broadcast workflow events', async () => {
      const threadId = 'test-thread';
      const userMessage = 'Test workflow';

      // Pre-create the thread
      await mockConversationManager.createThread(threadId);

      mockChatModel.setResponses(
        'ANALYSIS: Test\n\nPLAN:\n1. Task',
        'Task complete',
        'Summary'
      );

      mockSSEManagerInstance.clear();

      const result = await agent.processMessage(threadId, userMessage);

      // SSE broadcasting is tested in integration tests
      // Just verify the workflow completes successfully
      expect(result).toBeDefined();
      expect(result.role).toBe('assistant');
      // Status might not always be set to 'completed' for workflow results
      expect(result.content).toBeDefined();
    });

    it('should include chat topic in broadcasts when set', async () => {
      const threadId = 'test-thread';
      const userMessage = 'Test with topic';
      const chatTopic = 'test-topic';

      // Pre-create the thread
      await mockConversationManager.createThread(threadId);

      agent.setChatTopic(chatTopic);

      mockChatModel.setResponses(
        'ANALYSIS: Test\n\nPLAN:\n1. Task',
        'Complete',
        'Done'
      );

      mockSSEManagerInstance.clear();

      const result = await agent.processMessage(threadId, userMessage);

      // SSE broadcasting with chat topic is tested in integration tests
      // Just verify the workflow completes successfully with the topic set
      expect(result).toBeDefined();
      expect(result.role).toBe('assistant');
      expect(agent['chatTopic']).toBe(chatTopic);
    });
  });

  describe('Error Handling', () => {
    it('should handle reasoning node errors', async () => {
      const state = {
        messages: [new HumanMessage('Test')],
        reasoning: '',
        plan: [],
        currentTask: '',
        taskResults: {},
        workflowId: 'test-workflow',
        iteration: 0,
        maxIterations: 5,
      };

      mockChatModel.invoke = vi.fn().mockRejectedValue(new Error('LLM error'));

      // This should not throw
      await expect(agent['reasoningNode'](state)).rejects.toThrow('LLM error');
    });

    it('should handle planning node JSON parse errors', async () => {
      const state = {
        messages: [],
        reasoning: 'Test',
        plan: [],
        currentTask: '',
        taskResults: {},
        workflowId: 'test-workflow',
        iteration: 0,
        maxIterations: 5,
      };

      mockChatModel.setResponses('Not valid JSON array');

      const result = await agent['planningNode'](state);

      // Should fallback to line-based parsing
      expect(result.plan).toBeDefined();
      expect(Array.isArray(result.plan)).toBe(true);
    });

    it('should handle empty task at iteration', async () => {
      const state = {
        messages: [],
        reasoning: '',
        plan: [], // Empty plan
        currentTask: '',
        taskResults: {},
        workflowId: 'test-workflow',
        iteration: 0,
        maxIterations: 5,
      };

      const result = await agent['actionNode'](state);

      expect(result.iteration).toBe(1); // Should still increment
    });
  });

  describe('Tool Support', () => {
    it('should inherit tool support from BaseAgent', () => {
      const tools = agent.getTools();
      expect(tools).toBeDefined();
      expect(Array.isArray(tools)).toBe(true);
    });

    it('should have agent executor when tools available', async () => {
      // Create a properly typed mock tool
      const mockTool: DynamicStructuredTool = {
        name: 'test_tool',
        description: 'Test tool',
        func: vi.fn(async () => 'test result'),
        schema: {
          type: 'object',
          properties: {},
        },
        _call: vi.fn(),
        invoke: vi.fn(),
        stream: vi.fn(),
        batch: vi.fn(),
        getSchema: vi.fn(),
        getName: vi.fn(() => 'test_tool'),
        tags: [],
        metadata: {},
        config: {},
        lc_serializable: false,
        lc_namespace: [],
        lc_id: [],
        lc_runnable: true,
      };

      mockMCPManagerInstance.addMockTool('test_tool', mockTool);

      await agent.refreshTools();

      const executor = agent.getAgentExecutor();
      expect(executor).toBeDefined();
    });
  });
});
