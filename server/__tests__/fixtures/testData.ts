import type {
  LLMModel,
  CustomLLMService,
  LLMConfiguration,
} from '../../llmConfigManager';
import type {
  LocalModelInfo,
  ModelDownloadInfo,
  ModelLoadingSettings,
} from '../../localLlmManager';
import type { DynamicModelInfo } from '../../modelFetcher';

// LLM Config Manager Test Data
export const mockLLMModels: LLMModel[] = [
  {
    id: 'ollama:llama2',
    serviceId: 'ollama-local',
    serviceName: 'Ollama Local',
    model: 'llama2',
    displayName: 'Llama 2 | Ollama Local',
    baseURL: 'http://localhost:11434',
    type: 'ollama',
    contextLength: 4096,
    parameterCount: '7B',
    quantization: 'q4_0',
    available: true,
    isDefault: true,
  },
  {
    id: 'openai:gpt-4',
    serviceId: 'openai-service',
    serviceName: 'OpenAI',
    model: 'gpt-4',
    displayName: 'GPT-4 | OpenAI',
    baseURL: 'https://api.openai.com/v1',
    type: 'openai',
    contextLength: 8192,
    available: true,
    apiKey: 'sk-test-key',
  },
  {
    id: 'local:test-model',
    serviceId: 'local-llm',
    serviceName: 'Local Models (Built-in)',
    model: 'test-model',
    displayName: 'Test Model | Local Models',
    baseURL: '/api/local-llm',
    type: 'local',
    contextLength: 2048,
    available: true,
  },
];

export const mockCustomServices: CustomLLMService[] = [
  {
    id: 'custom-1234567890',
    name: 'Custom Ollama',
    baseURL: 'http://localhost:11434',
    type: 'ollama',
    enabled: true,
    custom: true,
  },
  {
    id: 'custom-9876543210',
    name: 'Custom OpenAI',
    baseURL: 'https://api.custom-openai.com/v1',
    type: 'openai',
    apiKey: 'sk-custom-key',
    enabled: true,
    custom: true,
  },
  {
    id: 'custom-disabled',
    name: 'Disabled Service',
    baseURL: 'http://localhost:8000',
    type: 'vllm',
    enabled: false,
    custom: true,
  },
];

export const mockLLMConfiguration: LLMConfiguration = {
  models: mockLLMModels,
  customServices: mockCustomServices,
  defaultModelId: 'ollama:llama2',
  lastUpdated: new Date('2024-01-01T00:00:00Z'),
};

export const mockDetectedServices = [
  {
    id: 'ollama-detected',
    name: 'Ollama Detected',
    baseURL: 'http://localhost:11434',
    type: 'ollama',
    available: true,
    modelsWithMetadata: [
      {
        name: 'llama2:latest',
        display_name: 'Llama 2 Latest',
        context_length: 4096,
        parameter_count: '7B',
        quantization: 'q4_0',
      },
    ],
  },
  {
    id: 'openai-detected',
    name: 'OpenAI API',
    baseURL: 'https://api.openai.com/v1',
    type: 'openai',
    available: true,
    models: ['gpt-4', 'gpt-3.5-turbo'],
  },
];

export const mockLocalModels: Array<{
  id: string;
  name: string;
  contextLength?: number;
  parameterCount?: string;
  quantization?: string;
}> = [
  {
    id: 'local-model-1',
    name: 'Local Test Model 1',
    contextLength: 2048,
    parameterCount: '7B',
    quantization: 'q4_0',
  },
  {
    id: 'local-model-2',
    name: 'Local Test Model 2',
    contextLength: 4096,
    parameterCount: '13B',
    quantization: 'q8_0',
  },
];

// Local LLM Manager Test Data
export const mockLocalModelInfo: LocalModelInfo[] = [
  {
    id: 'local-1',
    name: 'Test Local Model 1',
    filename: 'test-model-1.gguf',
    size: 4000000000,
    quantization: 'q4_0',
    parameterCount: '7B',
    contextLength: 2048,
    path: '/models/test-model-1.gguf',
    downloaded: true,
  },
  {
    id: 'local-2',
    name: 'Test Local Model 2',
    filename: 'test-model-2.gguf',
    size: 8000000000,
    quantization: 'q8_0',
    parameterCount: '13B',
    contextLength: 4096,
    path: '/models/test-model-2.gguf',
    downloaded: false,
  },
];

export const mockModelDownloadInfo: ModelDownloadInfo[] = [
  {
    id: 'download-1',
    name: 'Downloadable Model 1',
    filename: 'downloadable-1.gguf',
    url: 'https://example.com/models/downloadable-1.gguf',
    size: 4000000000,
    quantization: 'q4_0',
    parameterCount: '7B',
    contextLength: 2048,
    sha256: 'abc123',
  },
  {
    id: 'download-2',
    name: 'Downloadable Model 2',
    filename: 'downloadable-2.gguf',
    url: 'https://example.com/models/downloadable-2.gguf',
    size: 8000000000,
    quantization: 'q8_0',
    parameterCount: '13B',
    contextLength: 4096,
    sha256: 'def456',
  },
];

export const mockDynamicModelInfo: DynamicModelInfo[] = [
  {
    id: 'dynamic-1',
    name: 'Dynamic Model 1',
    repoId: 'huggingface/dynamic-1',
    filename: 'dynamic-1.gguf',
    size: 4000000000,
    quantization: 'q4_0',
    parameterCount: '7B',
    contextLength: 2048,
    tags: ['conversational', 'text-generation'],
    downloads: 1000,
    likes: 50,
  },
];

export const mockModelLoadingSettings: ModelLoadingSettings = {
  nGpuLayers: 32,
  threads: 8,
  contextSize: 2048,
  batchSize: 512,
  temperature: 0.7,
  topK: 40,
  topP: 0.9,
  repeatPenalty: 1.1,
  seed: -1,
};

// SSE Manager Test Data
export const mockSSEData = {
  simple: { type: 'test', message: 'hello' },
  complex: {
    type: 'chat_response',
    data: {
      content: 'This is a test response',
      metadata: { tokens: 5, model: 'test-model' },
    },
  },
  largeContent: 'x'.repeat(100000001), // Exceeds the 100MB limit
  circular: {} as Record<string, unknown>,
  withArrays: {
    items: [1, 2, 3, { nested: true }],
    strings: ['a', 'b', 'c'],
  },
};

// Create circular reference
mockSSEData.circular.self = mockSSEData.circular;

// Document Ingestion Service Test Data
export const mockDocuments = {
  simple: 'This is a simple document with some text content.',
  code: `
function calculateSum(a, b) {
  return a + b;
}

class Calculator {
  add(x, y) {
    return x + y;
  }
}
  `.trim(),
  json: JSON.stringify({
    name: 'Test Data',
    items: [{ id: 1, value: 'test' }],
    metadata: { version: '1.0' },
  }),
  markdown: `
# Test Document

This is a **markdown** document.

## Features
- Item 1
- Item 2
- Item 3

\`\`\`javascript
const example = 'code block';
\`\`\`
  `.trim(),
  large: 'x'.repeat(10000),
};

// Error scenarios
export const mockErrors = {
  fileNotFound: { code: 'ENOENT', message: 'File not found' },
  permissionDenied: { code: 'EACCES', message: 'Permission denied' },
  syntaxError: new SyntaxError('Unexpected token in JSON'),
  networkError: { code: 'ECONNREFUSED', message: 'Connection refused' },
  timeout: new Error('Request timeout'),
  aborted: new Error('AbortError: The operation was aborted'),
};

// Mock responses for external services
export const mockServiceResponses = {
  ollama: {
    tags: {
      models: [
        { name: 'llama2:latest', model: 'llama2:latest' },
        { name: 'codellama:7b', model: 'codellama:7b' },
      ],
    },
  },
  openai: {
    models: {
      data: [
        { id: 'gpt-4', object: 'model' },
        { id: 'gpt-3.5-turbo', object: 'model' },
      ],
    },
  },
  anthropic: {
    models: {
      data: [
        { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
        { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet' },
      ],
    },
  },
  perplexity: ['sonar-pro', 'sonar', 'sonar-deep-research'],
  google: [
    'gemini-1.5-pro',
    'gemini-1.5-flash',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-pro',
  ],
};

export const mockChatMessages = [
  { role: 'user', content: 'Hello, how are you?' },
  { role: 'assistant', content: 'I am doing well, thank you for asking!' },
  { role: 'user', content: 'Can you help me with a coding problem?' },
];

export const mockGenerationOptions = {
  temperature: 0.7,
  maxTokens: 1000,
  threadId: 'thread-123',
  disableFunctions: false,
  disableChatHistory: false,
};

// Mock Factories and Utilities
export class MockFactories {
  /**
   * Creates a mock Response object for Express.js testing
   */
  static createMockResponse(
    overrides: Partial<import('express').Response> = {}
  ): Partial<import('express').Response> {
    return {
      writeHead: vi.fn(),
      write: vi.fn().mockReturnValue(true),
      end: vi.fn(),
      on: vi.fn().mockReturnThis(),
      ...overrides,
    };
  }

  /**
   * Creates a mock LangChain chat model
   */
  static createMockChatModel(
    overrides: Partial<
      import('@langchain/core/language_models/chat_models').BaseChatModel
    > = {}
  ) {
    return {
      constructor: { name: 'MockChatModel' },
      invoke: vi.fn(),
      pipe: vi.fn(),
      ...overrides,
    };
  }

  /**
   * Creates a mock LangChain chain
   */
  static createMockChain(responses: string[] = []) {
    let callIndex = 0;
    return {
      invoke: vi.fn().mockImplementation(() => {
        if (callIndex < responses.length) {
          return Promise.resolve(responses[callIndex++]);
        }
        return Promise.resolve('Mock response');
      }),
    };
  }

  /**
   * Creates a mock text splitter
   */
  static createMockTextSplitter(chunks: Array<{ pageContent: string }> = []) {
    return {
      splitDocuments: vi.fn().mockResolvedValue(chunks),
    };
  }

  /**
   * Creates a mock LLM config manager
   */
  static createMockLLMConfigManager(model: LLMModel | null = mockLLMModels[0]) {
    return {
      getDefaultModel: vi.fn().mockResolvedValue(model),
      getModels: vi.fn().mockResolvedValue(mockLLMModels),
      loadConfiguration: vi.fn().mockResolvedValue(mockLLMConfiguration),
    };
  }

  /**
   * Creates a mock fetch function with customizable responses
   */
  static createMockFetch(
    responses: Array<{
      ok: boolean;
      json?: () => Promise<unknown>;
      status?: number;
      statusText?: string;
    }> = []
  ) {
    let callIndex = 0;
    return vi.fn().mockImplementation(() => {
      if (callIndex < responses.length) {
        return Promise.resolve(responses[callIndex++]);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    });
  }
}

/**
 * Error factory for creating consistent test errors
 */
export class ErrorFactory {
  static fileNotFound(filename = 'test.txt'): NodeJS.ErrnoException {
    const error = new Error(
      `ENOENT: no such file or directory, open '${filename}'`
    ) as NodeJS.ErrnoException;
    error.code = 'ENOENT';
    error.errno = -2;
    error.path = filename;
    return error;
  }

  static permissionDenied(resource = 'file'): NodeJS.ErrnoException {
    const error = new Error(
      `EACCES: permission denied, access '${resource}'`
    ) as NodeJS.ErrnoException;
    error.code = 'EACCES';
    error.errno = -13;
    return error;
  }

  static connectionRefused(
    host = 'localhost',
    port = 8080
  ): Error & { cause?: { code: string } } {
    const error = new Error(`connect ECONNREFUSED ${host}:${port}`) as Error & {
      cause?: { code: string };
    };
    error.cause = { code: 'ECONNREFUSED' };
    return error;
  }

  static networkTimeout(): Error {
    const error = new Error('Request timeout');
    error.name = 'TimeoutError';
    return error;
  }

  static abortError(): Error {
    const error = new Error('The operation was aborted');
    error.name = 'AbortError';
    return error;
  }

  static jsonParseError(input = 'invalid json{'): SyntaxError {
    return new SyntaxError(
      `Unexpected token } in JSON at position ${input.length - 1}`
    );
  }
}

/**
 * Test utilities for common testing patterns
 */
export class TestUtils {
  /**
   * Creates a promise that resolves after the specified delay
   */
  static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Creates a function that throws after being called N times
   */
  static createFailAfterNCalls<T>(n: number, error: Error, fallbackReturn?: T) {
    let callCount = 0;
    return vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount > n) {
        throw error;
      }
      return fallbackReturn;
    });
  }

  /**
   * Creates a function that succeeds after failing N times
   */
  static createSucceedAfterNFailures<T>(
    n: number,
    error: Error,
    successReturn: T
  ) {
    let callCount = 0;
    return vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount <= n) {
        throw error;
      }
      return successReturn;
    });
  }

  /**
   * Advances fake timers safely with cleanup
   */
  static async advanceTimersAndRunMicrotasks(ms: number): Promise<void> {
    vi.advanceTimersByTime(ms);
    await vi.runAllTimersAsync();
  }
}

// Re-export vi for convenience
export { vi } from 'vitest';
