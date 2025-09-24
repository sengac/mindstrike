import { vi } from 'vitest';
import type { ChatThreadState } from '../../../../store/useChatThreadStore';
import type { ConversationMessage } from '../../../../types';

// Helper to create a mock Zustand store that matches the store interface
export const createMockZustandStore = <T>(state: T) => {
  // Create a function that returns the state
  const storeFunction = () => state;

  // Add the required methods
  storeFunction.getState = () => state;
  storeFunction.setState = vi.fn();
  storeFunction.subscribe = vi.fn(() => () => {});
  storeFunction.destroy = vi.fn();
  storeFunction.getInitialState = () => state;

  // Add temporal and persist methods that Zustand might expect
  storeFunction.persist = undefined;
  storeFunction.temporal = undefined;

  return storeFunction;
};

// Mock store factory
export const createMockChatThreadStore = (
  overrides: Partial<ChatThreadState> = {}
): ChatThreadState => ({
  threadId: 'thread-123',
  messages: [],
  isLoading: false,
  isLoadingThread: false,
  isStreaming: false,
  error: null,
  loadMessages: vi.fn().mockResolvedValue(undefined),
  clearMessages: vi.fn(),
  addMessage: vi.fn(),
  updateMessage: vi.fn(),
  removeMessage: vi.fn(),
  setMessages: vi.fn(),
  setStreaming: vi.fn(),
  setLoading: vi.fn(),
  setError: vi.fn(),
  ...overrides,
});

// Mock threads store
export const mockThreadsStore = {
  threads: [],
  activeThreadId: 'thread-123' as string | null,
  isLoaded: true,
  isLoading: false,
  error: null as string | null,
  loadThreads: vi.fn().mockResolvedValue(undefined),
  createThread: vi.fn().mockResolvedValue('new-thread-id'),
  selectThread: vi.fn(),
  deleteThread: vi.fn().mockResolvedValue(undefined),
  renameThread: vi.fn().mockResolvedValue(undefined),
  updateThreadPrompt: vi.fn().mockResolvedValue(undefined),
  clearThread: vi.fn().mockResolvedValue(undefined),
  toggleAgentMode: vi.fn(),
  setThreads: vi.fn(),
  setActiveThreadId: vi.fn(),
  setLoading: vi.fn(),
  setError: vi.fn(),
  getState: vi.fn(() => mockThreadsStore),
};

// Mock SSE event bus
export const mockSSEEventBus = {
  subscribe: vi.fn(() => {
    // Return unsubscribe function
    return vi.fn();
  }),
  publish: vi.fn(),
  disconnect: vi.fn(),
  initialize: vi.fn(),
  getConnectionStatus: vi.fn(() => ({ isConnected: true })),
};

// Mock response validation
export const mockResponseValidation = {
  isValidating: false,
  validationProgress: null,
  validationEnabled: true,
  setValidationEnabled: vi.fn(),
  validateMessage: vi.fn().mockResolvedValue({
    message: {} as ConversationMessage,
    hasChanges: false,
  }),
  dismissNotification: vi.fn(),
  showNotification: false,
};

// Mock logger
export const mockLogger = {
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
};

// Mock toast
export const mockToast = {
  error: vi.fn(),
  success: vi.fn(),
  loading: vi.fn(),
};

// Fetch mock helper
export const createFetchMock = () => {
  const mockFetch = vi.fn();

  const mockResponse = (ok: boolean, data: unknown, status = 200) => ({
    ok,
    status,
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(JSON.stringify(data)),
    headers: new Headers(),
  });

  mockFetch.mockResolvedValue(mockResponse(true, {}));

  return {
    mockFetch,
    mockResponse,
    mockSuccess: (data: unknown) =>
      mockFetch.mockResolvedValueOnce(mockResponse(true, data)),
    mockError: (status: number, error: { error?: string }) =>
      mockFetch.mockResolvedValueOnce(mockResponse(false, error, status)),
    mockNetworkError: (error: Error) => mockFetch.mockRejectedValueOnce(error),
  };
};

// Type guard mock helpers
export const mockIsSSEChunkEvent = vi.fn((data: unknown): boolean => {
  const d = data as { chunk?: string; messageId?: string };
  return d?.chunk !== undefined && d?.messageId !== undefined;
});

export const mockIsSSEMessageEvent = vi.fn((data: unknown): boolean => {
  const d = data as { message?: unknown };
  return d?.message !== undefined;
});
