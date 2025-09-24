import type {
  AgentConfig,
  ConversationMessage,
  ImageAttachment,
  NotesAttachment,
} from '../../baseAgent';
import type {
  MindMapData,
  MindMapNode,
} from '../../../../src/utils/mindMapData';

// Mock LLM Configurations
export const mockLLMConfigs: Record<string, AgentConfig['llmConfig']> = {
  openai: {
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4',
    displayName: 'GPT-4',
    apiKey: 'test-api-key',
    type: 'openai',
    temperature: 0.7,
    maxTokens: 4000,
  },
  anthropic: {
    baseURL: 'https://api.anthropic.com',
    model: 'claude-3-opus',
    displayName: 'Claude 3 Opus',
    apiKey: 'test-api-key',
    type: 'anthropic',
    temperature: 0.5,
    maxTokens: 8000,
  },
  ollama: {
    baseURL: 'http://localhost:11434',
    model: 'llama2',
    displayName: 'Llama 2',
    type: 'ollama',
    temperature: 0.8,
    maxTokens: 2000,
  },
  local: {
    baseURL: '/api/local-llm',
    model: 'local-model-1',
    displayName: 'Local Model',
    type: 'local',
    temperature: 0.7,
    maxTokens: 4000,
  },
};

// Mock Agent Configurations
export const mockAgentConfig: AgentConfig = {
  workspaceRoot: '/test/workspace',
  llmConfig: mockLLMConfigs.openai,
  customPrompt: undefined,
  disableFunctions: false,
  disableChatHistory: false,
};

// Mock Conversation Messages
export const mockMessages: ConversationMessage[] = [
  {
    id: 'msg-1',
    role: 'user',
    content: 'Hello, how are you?',
    timestamp: new Date('2024-01-01T10:00:00Z'),
    status: 'completed',
  },
  {
    id: 'msg-2',
    role: 'assistant',
    content: 'I am doing well, thank you for asking!',
    timestamp: new Date('2024-01-01T10:00:10Z'),
    status: 'completed',
    model: 'gpt-4',
  },
  {
    id: 'msg-3',
    role: 'user',
    content: 'Can you help me with a task?',
    timestamp: new Date('2024-01-01T10:00:20Z'),
    status: 'completed',
  },
];

// Mock Image Attachments
export const mockImageAttachment: ImageAttachment = {
  id: 'img-1',
  filename: 'test-image.png',
  filepath: '/test/images/test-image.png',
  mimeType: 'image/png',
  size: 1024,
  thumbnail:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  fullImage:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  uploadedAt: new Date('2024-01-01T10:00:00Z'),
};

// Mock Notes Attachments
export const mockNotesAttachment: NotesAttachment = {
  id: 'note-1',
  title: 'Meeting Notes',
  content:
    '## Key Points\n- Discussion about project timeline\n- Budget considerations\n- Next steps',
  nodeLabel: 'Project Planning',
  attachedAt: new Date('2024-01-01T10:00:00Z'),
};

// Mock Tool Calls
export const mockToolCalls = [
  {
    id: 'tool-1',
    name: 'mcp_filesystem_read_file',
    parameters: {
      path: '/test/file.txt',
    },
  },
  {
    id: 'tool-2',
    name: 'mcp_web_search',
    parameters: {
      query: 'TypeScript best practices',
    },
  },
];

// Mock Tool Results
export const mockToolResults = [
  {
    name: 'mcp_filesystem_read_file',
    result: {
      success: true,
      output: 'File contents here',
    },
  },
  {
    name: 'mcp_web_search',
    result: {
      success: true,
      output: 'Search results: 1. Use strict types...',
    },
  },
];

// Mock Mind Map Node
export const createMockMindMapNode = (
  id: string,
  text: string,
  children?: MindMapNode[]
): MindMapNode => ({
  id,
  text,
  notes: `Notes for ${text}`,
  sources: [],
  children: children ?? [],
  collapsed: false,
  style: {},
  layout: 'right',
});

// Mock Mind Map Data
export const mockMindMapData: MindMapData = {
  root: createMockMindMapNode('root', 'Main Topic', [
    createMockMindMapNode('node-1', 'Subtopic 1', [
      createMockMindMapNode('node-1-1', 'Detail 1.1'),
      createMockMindMapNode('node-1-2', 'Detail 1.2'),
    ]),
    createMockMindMapNode('node-2', 'Subtopic 2', [
      createMockMindMapNode('node-2-1', 'Detail 2.1'),
    ]),
    createMockMindMapNode('node-3', 'Subtopic 3'),
  ]),
};

// Mock Workflow State
export const mockWorkflowState = {
  workflowId: 'workflow-1',
  originalRequest: 'Research TypeScript best practices and create a summary',
  currentStep: 0,
  maxSteps: 10,
  reasoningHistory: [],
  allChanges: [],
  isComplete: false,
  isCancelled: false,
  abortController: new AbortController(),
  parentNodeId: 'root',
  parentTopic: 'Main Topic',
};

// Mock LLM Streaming Response
export function* mockStreamResponse(
  content: string,
  chunkSize = 10
): Generator<string> {
  for (let i = 0; i < content.length; i += chunkSize) {
    yield content.slice(i, i + chunkSize);
  }
}

// Mock JSON Tool Response
export const mockJsonToolResponse = (
  tool: string,
  parameters: Record<string, unknown>
) => {
  return `\`\`\`json
{
  "tool": "${tool}",
  "parameters": ${JSON.stringify(parameters, null, 2)}
}
\`\`\``;
};

// Mock Mindmap Changes
export const mockMindmapChanges = [
  {
    action: 'create' as const,
    nodeId: '[[GENERATE_NODE_ID]]',
    parentId: 'root',
    text: 'New Node',
    notes: '## Overview\n\nThis is a new node with detailed content.',
    sources: [],
  },
  {
    action: 'update' as const,
    nodeId: 'node-1',
    text: 'Updated Subtopic 1',
    notes: 'Updated notes content',
  },
  {
    action: 'delete' as const,
    nodeId: 'node-3',
  },
];

// Mock Reasoning Step Response
export const mockReasoningStepResponse = {
  changes: mockMindmapChanges.slice(0, 1),
  reasoning: {
    decision: 'created_topic',
    explanation: 'Created a new topic node based on user request',
    progress: '1 of 3 items completed',
    isComplete: false,
  },
};

// Enhanced Mock Data for Comprehensive Testing

// Provider-specific LLM configs for testing different providers
export const mockProviderConfigs: Record<string, AgentConfig['llmConfig']> = {
  perplexity: {
    baseURL: 'https://api.perplexity.ai',
    model: 'sonar-medium-online',
    displayName: 'Perplexity Sonar',
    apiKey: 'test-perplexity-key',
    type: 'perplexity',
    temperature: 0.7,
    maxTokens: 4000,
  },
  google: {
    baseURL: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-1.5-pro',
    displayName: 'Google Gemini',
    apiKey: 'test-google-key',
    type: 'google',
    temperature: 0.7,
    maxTokens: 8192,
  },
  vllm: {
    baseURL: 'http://localhost:8000/v1',
    model: 'mistralai/Mistral-7B-Instruct-v0.1',
    displayName: 'vLLM Mistral',
    apiKey: 'dummy-key',
    type: 'vllm',
    temperature: 0.7,
    maxTokens: 4000,
  },
  localWithRelativePath: {
    baseURL: '/api/local-inference',
    model: 'local-model-relative',
    displayName: 'Local Relative Path',
    type: 'local',
    temperature: 0.7,
    maxTokens: 4000,
  },
};

// Complex message scenarios for different providers
export const mockComplexMessages = {
  // Messages with images for different providers
  withImagesAnthropic: [
    {
      id: 'msg-img-anthropic',
      role: 'user' as const,
      content: 'What do you see in this image?',
      timestamp: new Date(),
      status: 'completed' as const,
      images: [mockImageAttachment],
    },
  ],
  withImagesGoogle: [
    {
      id: 'msg-img-google',
      role: 'user' as const,
      content: 'Analyze this screenshot',
      timestamp: new Date(),
      status: 'completed' as const,
      images: [
        {
          ...mockImageAttachment,
          id: 'img-google',
          fullImage:
            'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/AAAAAAAB',
        },
      ],
    },
  ],
  withImagesOllama: [
    {
      id: 'msg-img-ollama',
      role: 'user' as const,
      content: 'Describe this diagram',
      timestamp: new Date(),
      status: 'completed' as const,
      images: [
        {
          ...mockImageAttachment,
          id: 'img-ollama',
          mimeType: 'image/jpeg',
        },
      ],
    },
  ],
  withImagesAndNotes: [
    {
      id: 'msg-complex',
      role: 'user' as const,
      content: 'Review this image along with my notes',
      timestamp: new Date(),
      status: 'completed' as const,
      images: [mockImageAttachment],
      notes: [
        mockNotesAttachment,
        {
          ...mockNotesAttachment,
          id: 'note-2',
          title: 'Additional Context',
          content: 'Extra context for the image analysis task',
        },
      ],
    },
  ],
  // Perplexity-specific message scenarios
  perplexityAlternating: [
    {
      id: 'msg-p1',
      role: 'system' as const,
      content: 'You are a helpful assistant.',
      timestamp: new Date(),
      status: 'completed' as const,
    },
    {
      id: 'msg-p2',
      role: 'user' as const,
      content: 'First user message',
      timestamp: new Date(),
      status: 'completed' as const,
    },
    {
      id: 'msg-p3',
      role: 'assistant' as const,
      content: 'First assistant response',
      timestamp: new Date(),
      status: 'completed' as const,
    },
    {
      id: 'msg-p4',
      role: 'user' as const,
      content: 'Second user message',
      timestamp: new Date(),
      status: 'completed' as const,
    },
  ],
  perplexityInvalidSequence: [
    {
      id: 'msg-inv1',
      role: 'assistant' as const,
      content: 'Assistant message first (invalid)',
      timestamp: new Date(),
      status: 'completed' as const,
    },
    {
      id: 'msg-inv2',
      role: 'assistant' as const,
      content: 'Another assistant message (invalid)',
      timestamp: new Date(),
      status: 'completed' as const,
    },
    {
      id: 'msg-inv3',
      role: 'user' as const,
      content: 'Finally a user message',
      timestamp: new Date(),
      status: 'completed' as const,
    },
  ],
};

// Tool call scenarios for comprehensive testing
export const mockToolCallScenarios = {
  // Multiple JSON formats
  standardFormat: `Here's the file content:

\`\`\`json
{
  "tool": "mcp_filesystem_read_file",
  "parameters": {
    "path": "/test/file.txt"
  }
}
\`\`\`

The file contains the requested information.`,

  alternateFormat: `Let me search for that information:

\`\`\`json
{
  "web_search": {
    "query": "TypeScript decorators tutorial",
    "limit": 5
  }
}
\`\`\`

I'll analyze the search results for you.`,

  multipleToolCalls: `I'll help you with that task:

\`\`\`json
{
  "tool": "mcp_filesystem_read_file",
  "parameters": {
    "path": "/config/settings.json"
  }
}
\`\`\`

Now let me also check the documentation:

\`\`\`json
{
  "tool": "mcp_web_search",
  "parameters": {
    "query": "API documentation"
  }
}
\`\`\`

These tools will help me provide accurate information.`,

  malformedJSON: `Let me try to read the file:

\`\`\`json
{
  "tool": "read_file",
  "parameters": {
    "path": "/invalid.txt"
    // missing closing brace and comma
\`\`\`

This should fail gracefully.`,

  standaloneJSON: `{
  "tool": "mcp_filesystem_create_file",
  "parameters": {
    "path": "/new/file.txt",
    "content": "Hello world"
  }
}`,

  noToolCalls: `This is just a regular response with no tool calls. The assistant is providing information without needing to execute any tools.`,

  mcpToolWithUnderscores: `\`\`\`json
{
  "tool": "mcp_database_execute_query",
  "parameters": {
    "query": "SELECT * FROM users WHERE active = true",
    "database": "production"
  }
}
\`\`\``,
};

// MCP tool results for different scenarios
export const mockMCPResults = {
  arrayResult: [
    { type: 'text', text: 'First result item' },
    { type: 'text', text: 'Second result item' },
    { type: 'code', language: 'javascript', text: 'console.log("Hello");' },
  ],
  stringResult: 'Simple string result from MCP tool',
  objectResult: {
    text: 'Object with text property',
    metadata: { timestamp: '2024-01-01T10:00:00Z' },
  },
  lfsResult: 'LFS:large-content-ref-12345',
  errorResult: new Error('Tool execution failed: File not found'),
};

// LFS summary mock data
export const mockLFSSummary = {
  summary:
    'This is a large document containing detailed technical specifications for the API endpoints. It includes authentication methods, request/response formats, and error handling procedures.',
  originalSize: 15420,
  keyPoints: [
    'REST API with JSON responses',
    'OAuth 2.0 authentication required',
    'Rate limiting: 1000 requests/hour',
    'Comprehensive error codes documented',
  ],
};

// Streaming scenarios
export const mockStreamingScenarios = {
  simpleText: {
    chunks: ['Hello', ' world', '! How', ' can I', ' help you', ' today?'],
    expected: 'Hello world! How can I help you today?',
  },
  withToolCalls: {
    chunks: [
      { content: "I'll help you ", tool_calls: [] },
      { content: 'with that. ', tool_calls: [] },
      {
        content: 'Let me ',
        tool_calls: [
          { id: 'tool-1', name: 'read_file', args: { path: '/test.txt' } },
        ],
      },
      { content: 'read the file.', tool_calls: [] },
    ],
    expectedContent: "I'll help you with that. Let me read the file.",
    expectedToolCalls: [
      { id: 'tool-1', name: 'read_file', args: { path: '/test.txt' } },
    ],
  },
  withToolCallChunks: {
    chunks: [
      {
        content: 'Searching...',
        tool_call_chunks: [{ index: 0, id: 'tool-1', name: 'web_search' }],
      },
      {
        content: '',
        tool_call_chunks: [{ index: 0, args: '{"query"' }],
      },
      {
        content: '',
        tool_call_chunks: [{ index: 0, args: ': "TypeScript"}' }],
      },
    ],
    expectedContent: 'Searching...',
    expectedToolCalls: [
      { id: 'tool-1', name: 'web_search', parameters: { query: 'TypeScript' } },
    ],
  },
};

// Error scenarios for testing
export const mockErrorScenarios = {
  rateLimitError: new Error('rate limit exceeded - please try again later'),
  authError: new Error('unauthorized access - invalid API key'),
  modelNotFoundError: new Error('model not found: gpt-5-turbo'),
  timeoutError: new Error('Request timeout after 30 seconds'),
  networkError: new Error('network error - connection refused'),
  creditsError: new Error('credit balance is too low to complete request'),
  genericError: new Error('Something unexpected happened'),
};

// Mock agent configs for edge cases
export const mockEdgeCaseConfigs: AgentConfig[] = [
  {
    workspaceRoot: '/test/workspace',
    llmConfig: {
      baseURL: 'https://api.openai.com/v1',
      model: 'gpt-4',
      type: 'openai',
      // Missing API key
      temperature: 0.7,
      maxTokens: 4000,
    },
  },
  {
    workspaceRoot: '/test/workspace',
    llmConfig: {
      baseURL: '/api/relative-path',
      model: 'local-model',
      type: 'local',
      temperature: 0.7,
      maxTokens: 4000,
    },
  },
  {
    workspaceRoot: '/test/workspace',
    llmConfig: {
      baseURL: 'invalid-url-format',
      model: 'some-model',
      apiKey: 'invalid-key-format',
      type: 'openai',
      temperature: 2.0, // Invalid temperature
      maxTokens: -1000, // Invalid max tokens
    },
  },
];
