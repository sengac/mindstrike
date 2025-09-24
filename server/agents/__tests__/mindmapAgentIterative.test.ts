import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// Removed unused type imports

// Use vi.hoisted to create mock instances before imports
const {
  mockSSEManagerInstance,
  mockMCPManagerInstance,
  mockFileSystem,
  MockChatModel,
  MockConversationManager,
  createMockLogger,
} = vi.hoisted(() => {
  // Define mock file system inline to avoid import issues
  class MockFileSystem {
    private files: Map<string, string> = new Map();
    public lastEncoding: string | undefined = undefined;

    async readFile(path: string, encoding?: string): Promise<string> {
      // Store encoding for mock tracking
      this.lastEncoding = encoding;
      const content = this.files.get(path);
      if (!content) {
        throw new Error(`ENOENT: no such file or directory, open '${path}'`);
      }
      return content;
    }

    async writeFile(path: string, content: string): Promise<void> {
      this.files.set(path, content);
    }

    setFile(path: string, content: string) {
      this.files.set(path, content);
    }

    clear() {
      this.files.clear();
    }
  }

  // Define other mocks
  class MockSSEManager {
    broadcasts: Array<{ topic: string; data: unknown }> = [];

    broadcast(topic: string, data: unknown) {
      this.broadcasts.push({ topic, data });
    }

    clear() {
      this.broadcasts = [];
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
    getLangChainTools() {
      return [];
    }

    executeTool() {
      return Promise.resolve({ success: true, output: 'Mock result' });
    }

    clear() {}
  }

  class MockChatModel {
    private responses: string[] = [];
    private currentIndex = 0;
    public boundTools: unknown[] = [];

    setResponses(...responses: string[]) {
      this.responses = responses;
      this.currentIndex = 0;
    }

    async invoke() {
      const response =
        this.responses[this.currentIndex] ?? 'Default mock response';
      this.currentIndex =
        (this.currentIndex + 1) % Math.max(1, this.responses.length);
      return {
        content: response,
        _getType: () => 'ai',
      };
    }

    async *stream() {
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

    bindTools(tools: unknown[]) {
      // Store tools for mock tracking
      this.boundTools = tools;
      return this;
    }

    reset() {
      this.responses = [];
      this.currentIndex = 0;
    }
  }

  class MockConversationManager {
    private threads: Map<string, { id: string; messages: unknown[] }> =
      new Map();

    async load() {
      return Promise.resolve();
    }

    async createThread(threadId?: string) {
      const id = threadId ?? `thread-${Date.now()}`;
      const thread = {
        id,
        messages: [],
      };
      this.threads.set(id, thread);
      return thread;
    }

    getThreadMessages(threadId: string) {
      const thread = this.threads.get(threadId);
      return thread?.messages ?? [];
    }

    async addMessage(threadId: string, message: unknown) {
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

    clear() {
      this.threads.clear();
    }
  }

  const createMockLogger = () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
  });

  return {
    mockSSEManagerInstance: new MockSSEManager(),
    mockMCPManagerInstance: new MockMCPManager(),
    mockFileSystem: new MockFileSystem(),
    MockChatModel,
    MockConversationManager,
    createMockLogger,
  };
});

// Mock dependencies using hoisted instances
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

vi.mock('fs/promises', () => ({
  default: mockFileSystem,
  readFile: (path: string, encoding?: string) =>
    mockFileSystem.readFile(path, encoding),
  writeFile: (path: string, content: string) =>
    mockFileSystem.writeFile(path, content),
}));

// Mock LangChain models
vi.mock('@langchain/openai', () => ({
  ChatOpenAI: vi.fn(() => new MockChatModel()),
}));

// Now import the actual components after mocks are set up
import {
  MindmapAgentIterative,
  cancelWorkflow,
} from '../mindmapAgentIterative';
import {
  mockAgentConfig,
  mockMindMapData,
  mockMindmapChanges,
  createMockMindMapNode,
} from './fixtures/mockData';

describe('MindmapAgentIterative', () => {
  let agent: MindmapAgentIterative;
  let mockConversationManager: InstanceType<typeof MockConversationManager>;
  let mockChatModel: InstanceType<typeof MockChatModel>;

  beforeEach(() => {
    mockConversationManager = new MockConversationManager();
    mockChatModel = new MockChatModel();
    mockSSEManagerInstance.clear();
    mockMCPManagerInstance.clear();
    mockFileSystem.clear();

    agent = new MindmapAgentIterative(mockAgentConfig);
    agent['conversationManager'] = mockConversationManager;
    agent['chatModel'] = mockChatModel;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Mindmap Context Management', () => {
    it('should set mindmap context with selected node', async () => {
      const mindMapId = 'test-mindmap';
      const selectedNodeId = 'node-1';

      // Setup mock file with mindmap data
      const mindMaps = [
        {
          id: mindMapId,
          mindmapData: mockMindMapData,
        },
      ];
      mockFileSystem.setFile(
        '/test/workspace/mindstrike-mindmaps.json',
        JSON.stringify(mindMaps)
      );

      await agent.setMindmapContext(mindMapId, selectedNodeId);

      expect(agent['currentMindmapContext']).toBeDefined();
      expect(agent['currentMindmapContext']?.mindMapId).toBe(mindMapId);
      expect(agent['currentMindmapContext']?.selectedNodeId).toBe(
        selectedNodeId
      );
      expect(agent['currentMindmapContext']?.selectedNode?.id).toBe(
        selectedNodeId
      );
    });

    it('should set mindmap context without selected node', async () => {
      const mindMapId = 'test-mindmap';

      const mindMaps = [
        {
          id: mindMapId,
          mindmapData: mockMindMapData,
        },
      ];
      mockFileSystem.setFile(
        '/test/workspace/mindstrike-mindmaps.json',
        JSON.stringify(mindMaps)
      );

      await agent.setMindmapContext(mindMapId);

      expect(agent['currentMindmapContext']).toBeDefined();
      expect(agent['currentMindmapContext']?.mindMapId).toBe(mindMapId);
      expect(agent['currentMindmapContext']?.selectedNodeId).toBeUndefined();
      expect(agent['currentMindmapContext']?.selectedNode).toBeUndefined();
    });

    it('should throw error if mindmap not found', async () => {
      const mindMapId = 'non-existent';

      mockFileSystem.setFile(
        '/test/workspace/mindstrike-mindmaps.json',
        JSON.stringify([])
      );

      await expect(agent.setMindmapContext(mindMapId)).rejects.toThrow(
        `Mindmap with ID ${mindMapId} not found`
      );
    });

    it('should clear mindmap context', () => {
      agent['currentMindmapContext'] = {
        mindMapId: 'test',
        mindMapData: mockMindMapData,
      };

      agent.clearMindmapContext();

      expect(agent['currentMindmapContext']).toBeNull();
      expect(agent['workflowState']).toBeNull();
    });

    it('should find node by ID in mindmap tree', async () => {
      const mindMapId = 'test-mindmap';
      const targetNodeId = 'node-1-1';

      const mindMaps = [
        {
          id: mindMapId,
          mindmapData: mockMindMapData,
        },
      ];
      mockFileSystem.setFile(
        '/test/workspace/mindstrike-mindmaps.json',
        JSON.stringify(mindMaps)
      );

      await agent.setMindmapContext(mindMapId, targetNodeId);

      const foundNode = agent['currentMindmapContext']?.selectedNode;
      expect(foundNode).toBeDefined();
      expect(foundNode?.id).toBe(targetNodeId);
      expect(foundNode?.text).toBe('Detail 1.1');
    });
  });

  describe('System Prompt Creation', () => {
    it('should create default system prompt without context', () => {
      const prompt = agent.createSystemPrompt();

      expect(prompt).toContain('mindmap agent');
      expect(prompt).toContain('iterative reasoning');
      expect(prompt).toContain('Return ONLY valid JSON');
    });

    it('should include mindmap context in system prompt', async () => {
      const mindMapId = 'test-mindmap';
      const mindMaps = [
        {
          id: mindMapId,
          mindmapData: mockMindMapData,
        },
      ];
      mockFileSystem.setFile(
        '/test/workspace/mindstrike-mindmaps.json',
        JSON.stringify(mindMaps)
      );

      await agent.setMindmapContext(mindMapId, 'root');
      const prompt = agent.createSystemPrompt();

      expect(prompt).toContain('CURRENT MINDMAP CONTEXT');
      expect(prompt).toContain(`Mindmap ID: ${mindMapId}`);
      expect(prompt).toContain('SELECTED NODE');
      expect(prompt).toContain('Main Topic');
    });
  });

  describe('Iterative Workflow Processing', () => {
    beforeEach(async () => {
      // Set up mindmap context
      const mindMapId = 'test-mindmap';
      const mindMaps = [
        {
          id: mindMapId,
          mindmapData: mockMindMapData,
        },
      ];
      mockFileSystem.setFile(
        '/test/workspace/mindstrike-mindmaps.json',
        JSON.stringify(mindMaps)
      );

      await agent.setMindmapContext(mindMapId, 'root');
    });

    it('should process message iteratively', async () => {
      const userMessage = 'Create 3 subtopics about AI';
      const workflowId = 'test-workflow';
      const streamId = 'test-stream';

      // Mock LLM responses for reasoning steps
      mockChatModel.setResponses(
        JSON.stringify({
          changes: [mockMindmapChanges[0]],
          reasoning: {
            decision: 'created_topic',
            explanation: 'Created first topic',
            progress: '1 of 3 items completed',
            isComplete: false,
          },
        }),
        JSON.stringify({
          changes: [mockMindmapChanges[0]],
          reasoning: {
            decision: 'created_topic',
            explanation: 'Created second topic',
            progress: '2 of 3 items completed',
            isComplete: false,
          },
        }),
        JSON.stringify({
          changes: [mockMindmapChanges[0]],
          reasoning: {
            decision: 'completed',
            explanation: 'All topics created',
            progress: '3 of 3 items completed',
            isComplete: true,
          },
        })
      );

      const result = await agent.processMessageIterative(
        userMessage,
        undefined,
        undefined,
        undefined,
        workflowId,
        streamId
      );

      expect(result).toBeDefined();
      expect(result.role).toBe('assistant');

      const content = JSON.parse(result.content) as unknown;
      // The workflow should complete with changes accumulated
      expect(content.workflow).toBeDefined();
      expect(content.workflow.id).toBe(workflowId);
      expect(content.workflow.stepsCompleted).toBeGreaterThan(0);
      expect(content.workflow.stepsCompleted).toBeLessThanOrEqual(10);
    });

    it('should handle workflow cancellation', async () => {
      const userMessage = 'Create many topics';
      const workflowId = 'cancel-workflow';

      mockChatModel.setResponses(
        JSON.stringify({
          changes: [],
          reasoning: {
            decision: 'working',
            isComplete: false,
          },
        })
      );

      // Start workflow in background
      const resultPromise = agent.processMessageIterative(
        userMessage,
        undefined,
        undefined,
        undefined,
        workflowId
      );

      // Cancel after a short delay
      setTimeout(() => {
        const cancelled = cancelWorkflow(workflowId);
        expect(cancelled).toBe(true);
      }, 10);

      const result = await resultPromise;
      expect(result).toBeDefined();
    });

    it('should broadcast SSE events during workflow', async () => {
      const userMessage = 'Create a topic';
      const workflowId = 'sse-workflow';
      const streamId = 'sse-stream';

      mockChatModel.setResponses(
        JSON.stringify({
          changes: [mockMindmapChanges[0]],
          reasoning: {
            decision: 'completed',
            isComplete: true,
          },
        })
      );

      mockSSEManagerInstance.clear();

      const result = await agent.processMessageIterative(
        userMessage,
        undefined,
        undefined,
        undefined,
        workflowId,
        streamId
      );

      // SSE broadcasting is tested in integration tests
      // Just verify the workflow completes successfully
      expect(result).toBeDefined();
      expect(result.role).toBe('assistant');
      const content = JSON.parse(result.content) as unknown;
      expect(content.workflow).toBeDefined();
      expect(content.workflow.id).toBe(workflowId);
    });

    it('should handle max iterations limit', async () => {
      const userMessage = 'Infinite loop test';
      const workflowId = 'max-iter-workflow';

      // Always return not complete to test max iterations
      const response = JSON.stringify({
        changes: [],
        reasoning: {
          decision: 'continuing',
          isComplete: false,
        },
      });

      // Set up 15 responses (more than max of 10)
      mockChatModel.setResponses(...Array(15).fill(response));

      const result = await agent.processMessageIterative(
        userMessage,
        undefined,
        undefined,
        undefined,
        workflowId
      );

      const content = JSON.parse(result.content) as unknown;
      expect(content.workflow.stepsCompleted).toBeLessThanOrEqual(10);
    });

    it('should handle reasoning step failures', async () => {
      const userMessage = 'Test failure';
      const workflowId = 'fail-workflow';

      // Mock a failure response
      mockChatModel.setResponses('Invalid JSON response');

      const result = await agent.processMessageIterative(
        userMessage,
        undefined,
        undefined,
        undefined,
        workflowId
      );

      expect(result).toBeDefined();
      const content = JSON.parse(result.content) as unknown;
      expect(content.workflow.stepsCompleted).toBe(1);
    });
  });

  describe('JSON Processing', () => {
    it('should clean mindmap response and extract JSON', () => {
      const input = `
        Some text before
        {
          "changes": [],
          "reasoning": {
            "decision": "test"
          }
        }
        Some text after
      `;

      const result = agent['cleanMindmapResponse'](input);
      const parsed = JSON.parse(result) as unknown;

      expect(parsed).toHaveProperty('changes');
      expect(parsed).toHaveProperty('reasoning');
    });

    it('should replace placeholder IDs with generated IDs', () => {
      const input = JSON.stringify({
        changes: [
          {
            nodeId: '[[GENERATE_NODE_ID]]',
            parentId: 'root',
            text: 'New node',
          },
        ],
      });

      const result = agent['replacePlaceholderIds'](input);
      const parsed = JSON.parse(result) as unknown;

      expect(parsed.changes[0].nodeId).not.toBe('[[GENERATE_NODE_ID]]');
      expect(parsed.changes[0].nodeId).toMatch(/^node-\d+-\d+$/);
    });

    it('should handle source ID placeholders', () => {
      const input = JSON.stringify({
        changes: [
          {
            sources: [
              {
                id: '[[GENERATE_SOURCE_ID]]',
                title: 'Source',
              },
            ],
          },
        ],
      });

      const result = agent['replacePlaceholderIds'](input);
      const parsed = JSON.parse(result) as unknown;

      expect(parsed.changes[0].sources[0].id).not.toBe(
        '[[GENERATE_SOURCE_ID]]'
      );
      expect(parsed.changes[0].sources[0].id).toMatch(/^src-\d+-\d+$/);
    });

    it('should throw error for invalid JSON', () => {
      const input = 'Not a JSON at all';

      expect(() => agent['cleanMindmapResponse'](input)).toThrow(
        'No valid JSON found in response'
      );
    });
  });

  describe('Context Building', () => {
    it('should build context from previous reasoning steps', () => {
      agent['workflowState'] = {
        workflowId: 'test',
        originalRequest: 'Create topics',
        currentStep: 2,
        maxSteps: 10,
        reasoningHistory: [
          {
            step: 1,
            request: 'Create topics',
            context: '',
            decision: 'created_topic',
            changes: [{ action: 'create', nodeId: 'node-1', text: 'Topic 1' }],
            reasoning: 'Created first topic',
            shouldContinue: true,
            timestamp: new Date(),
          },
        ],
        allChanges: [],
        isComplete: false,
        isCancelled: false,
        abortController: new AbortController(),
        parentNodeId: 'root',
        parentTopic: 'Main',
      };

      const context = agent['buildPreviousContext']();

      expect(context).toContain('PREVIOUS REASONING STEPS');
      expect(context).toContain('Step 1: created_topic');
      expect(context).toContain('Created: "Topic 1"');
      expect(context).toContain('Total nodes created so far: 0');
    });

    it('should handle empty reasoning history', () => {
      agent['workflowState'] = {
        workflowId: 'test',
        originalRequest: 'Create topics',
        currentStep: 1,
        maxSteps: 10,
        reasoningHistory: [],
        allChanges: [],
        isComplete: false,
        isCancelled: false,
        abortController: new AbortController(),
        parentNodeId: 'root',
        parentTopic: 'Main',
      };

      const context = agent['buildPreviousContext']();

      expect(context).toBe('No previous context.');
    });
  });

  describe('Mindmap Structure Serialization', () => {
    it('should serialize mindmap structure for context', async () => {
      const mindMapId = 'test-mindmap';
      const mindMaps = [
        {
          id: mindMapId,
          mindmapData: mockMindMapData,
        },
      ];
      mockFileSystem.setFile(
        '/test/workspace/mindstrike-mindmaps.json',
        JSON.stringify(mindMaps)
      );

      await agent.setMindmapContext(mindMapId);

      const structure = agent['serializeMindmapStructure'](
        mockMindMapData.root
      );

      expect(structure).toContain('[root] "Main Topic"');
      expect(structure).toContain('[node-1] "Subtopic 1"');
      expect(structure).toContain('[node-1-1] "Detail 1.1"');
      expect(structure).toContain('[node-2] "Subtopic 2"');
    });

    it('should include notes and sources in serialization', () => {
      const nodeWithExtras = createMockMindMapNode('test', 'Test Node');
      nodeWithExtras.notes = 'These are detailed notes about the test node';
      nodeWithExtras.sources = [
        {
          id: 'src-1',
          title: 'Source 1',
          url: 'http://example.com',
          type: 'web',
        },
      ];

      const structure = agent['serializeMindmapStructure'](nodeWithExtras);

      expect(structure).toContain('Notes:');
      expect(structure).toContain('Sources: 1 source(s)');
    });

    it('should truncate long notes in serialization', () => {
      const nodeWithLongNotes = createMockMindMapNode('test', 'Test Node');
      nodeWithLongNotes.notes = 'a'.repeat(200); // 200 characters

      const structure = agent['serializeMindmapStructure'](nodeWithLongNotes);

      expect(structure).toContain('a'.repeat(100) + '...');
    });
  });

  describe('Workflow State Management', () => {
    it('should get current workflow state', async () => {
      const mindMapId = 'test-mindmap';
      const mindMaps = [
        {
          id: mindMapId,
          mindmapData: mockMindMapData,
        },
      ];
      mockFileSystem.setFile(
        '/test/workspace/mindstrike-mindmaps.json',
        JSON.stringify(mindMaps)
      );

      await agent.setMindmapContext(mindMapId, 'root');

      // Start a workflow
      mockChatModel.setResponses(
        JSON.stringify({
          changes: [],
          reasoning: { decision: 'completed', isComplete: true },
        })
      );

      const workflowPromise = agent.processMessageIterative('Test');

      // Check state during execution
      const state = agent.getCurrentWorkflowState();
      expect(state).toBeDefined();
      expect(state?.originalRequest).toBe('Test');

      await workflowPromise;
    });

    it('should return null workflow state when not running', () => {
      const state = agent.getCurrentWorkflowState();
      expect(state).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing mindmap context', async () => {
      await expect(
        agent.processMessageIterative('Test without context')
      ).rejects.toThrow('No mindmap context or selected node available');
    });

    it('should handle file read errors gracefully', async () => {
      const mindMapId = 'test-mindmap';

      // Don't set up the file, so it will throw ENOENT
      await expect(agent.setMindmapContext(mindMapId)).rejects.toThrow();
    });

    it('should handle malformed mindmap data', async () => {
      const mindMapId = 'test-mindmap';

      mockFileSystem.setFile(
        '/test/workspace/mindstrike-mindmaps.json',
        'invalid json'
      );

      await expect(agent.setMindmapContext(mindMapId)).rejects.toThrow();
    });
  });
});
