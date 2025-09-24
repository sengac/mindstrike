import { vi } from 'vitest';
import type { ConversationMessage } from '../../baseAgent';
import type { DynamicStructuredTool } from '@langchain/core/tools';

// Mock Conversation Manager
export class MockConversationManager {
  private threads: Map<
    string,
    { id: string; messages: ConversationMessage[] }
  > = new Map();

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
      messages: [],
    };
    this.threads.set(id, thread);
    return thread;
  }

  getThreadMessages(threadId: string): ConversationMessage[] {
    const thread = this.threads.get(threadId);
    return thread?.messages ?? [];
  }

  async addMessage(threadId: string, message: ConversationMessage) {
    let thread = this.threads.get(threadId);
    if (!thread) {
      // Auto-create thread if it doesn't exist
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
    updates: Partial<ConversationMessage>
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
      // Create thread if it doesn't exist
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
    // Store workspace root for mock
    this.workspaceRoot = workspaceRoot;
  }

  private workspaceRoot: string = '';
}

// Mock SSE Manager
export class MockSSEManager {
  broadcasts: Array<{ topic: string; data: unknown }> = [];

  broadcast(topic: string, data: unknown) {
    this.broadcasts.push({ topic, data });
  }

  broadcastThreadUpdate(threadId: string, data: unknown) {
    this.broadcast(`thread:${threadId}`, { type: 'update', threadId, ...data });
  }

  broadcastMessageCreate(threadId: string, data: unknown) {
    this.broadcast(`thread:${threadId}`, { type: 'create', threadId, ...data });
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
        b.data.type === type
    );
  }
}

// Mock MCP Manager
export class MockMCPManager {
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
    // Return the raw result - BaseAgent will wrap it in { success: true, output: ... }
    // If result has success/output structure, extract just the output
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

// Mock Local LLM Manager
export class MockLocalLLMManager {
  private loadedModel: string | null = null;
  private sessionHistory: Map<string, unknown[]> = new Map();
  private responses: Map<string, string> = new Map();
  public lastOptions: unknown = null;

  async loadModel(modelName: string, threadId?: string) {
    this.loadedModel = modelName;
    if (threadId && !this.sessionHistory.has(threadId)) {
      this.sessionHistory.set(threadId, []);
    }
    return Promise.resolve();
  }

  async updateSessionHistory(modelName: string, threadId: string) {
    if (!this.sessionHistory.has(threadId)) {
      this.sessionHistory.set(threadId, []);
    }
    return Promise.resolve();
  }

  setResponse(pattern: string, response: string) {
    this.responses.set(pattern, response);
  }

  async generateResponse(
    modelName: string,
    messages: { role: string; content: string }[],
    options?: unknown
  ): Promise<string> {
    // Store options for mock tracking
    this.lastOptions = options;
    // Check for preset responses
    const lastMessage = messages[messages.length - 1];
    if (lastMessage) {
      for (const [pattern, response] of this.responses.entries()) {
        if (lastMessage.content.includes(pattern)) {
          return response;
        }
      }
    }
    return 'Mock response from local LLM';
  }

  async *generateStreamResponse(
    modelName: string,
    messages: { role: string; content: string }[],
    options?: unknown
  ): AsyncIterable<string> {
    const response = await this.generateResponse(modelName, messages, options);
    const chunkSize = 10;
    for (let i = 0; i < response.length; i += chunkSize) {
      yield response.slice(i, i + chunkSize);
    }
  }

  getLoadedModel() {
    return this.loadedModel;
  }

  clear() {
    this.loadedModel = null;
    this.sessionHistory.clear();
    this.responses.clear();
  }
}

// Mock LFS Manager
export class MockLFSManager {
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

// Mock Chat Model
export class MockChatModel {
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
    // Store messages for mock tracking
    this.lastInvokeMessages = messages;
    // Check if invoke was mocked to throw error
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
    // Store messages for mock tracking
    this.lastStreamMessages = messages;
    // Check if invoke was mocked to throw error (stream should also throw)
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

// Mock Logger
export const createMockLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
});

// Mock File System
export class MockFileSystem {
  private files: Map<string, string> = new Map();
  public lastEncoding: string | undefined = undefined;
  public lastMkdirPath: string = '';
  public lastMkdirOptions: unknown = null;

  async readFile(path: string, encoding?: string): Promise<string> {
    // Store encoding for mock tracking
    this.lastEncoding = encoding;
    const content = this.files.get(path);
    if (!content) {
      const error = new Error(
        `ENOENT: no such file or directory, open '${path}'`
      ) as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    }
    return content;
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async mkdir(path: string, options?: unknown): Promise<void> {
    // Store parameters for mock tracking
    this.lastMkdirPath = path;
    this.lastMkdirOptions = options;
  }

  async access(path: string): Promise<void> {
    if (!this.files.has(path)) {
      const error = new Error(
        `ENOENT: no such file or directory, access '${path}'`
      ) as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    }
  }

  setFile(path: string, content: string) {
    this.files.set(path, content);
  }

  getFile(path: string): string | undefined {
    return this.files.get(path);
  }

  clear() {
    this.files.clear();
  }
}

// Create singleton instances for testing
export const mockConversationManager = new MockConversationManager();
export const mockSSEManager = new MockSSEManager();
export const mockMCPManager = new MockMCPManager();
export const mockLocalLLMManager = new MockLocalLLMManager();
export const mockLFSManager = new MockLFSManager();
export const mockFileSystem = new MockFileSystem();
