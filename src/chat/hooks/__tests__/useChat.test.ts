import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock all dependencies before imports
vi.mock('react-hot-toast');
vi.mock('../../../hooks/useResponseValidation');
vi.mock('../../../types/sseEvents');
vi.mock('../../../store/useChatThreadStore');
vi.mock('../../../store/useThreadsStore');
vi.mock('../../../utils/sseEventBus');
vi.mock('../../../utils/logger');

// Now import after mocks are set up
import { useChat } from '../useChat';
import * as fixtures from './fixtures/chatFixtures';
import {
  createMockChatThreadStore,
  createMockZustandStore,
  mockThreadsStore,
  mockSSEEventBus,
  mockResponseValidation,
  mockLogger,
  mockToast,
  createFetchMock,
  mockIsSSEChunkEvent,
  mockIsSSEMessageEvent,
} from './mocks/chatMocks';

describe('useChat', () => {
  let mockChatThreadStore: ReturnType<typeof createMockChatThreadStore>;
  let fetchMock: ReturnType<typeof createFetchMock>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup fetch mock
    fetchMock = createFetchMock();
    global.fetch = fetchMock.mockFetch;

    // Setup chat thread store mock
    mockChatThreadStore = createMockChatThreadStore({
      messages: [fixtures.mockUserMessage, fixtures.mockAssistantMessage],
    });

    const { useChatThreadStore } = await import(
      '../../../store/useChatThreadStore'
    );
    const mockUseChatThreadStore = vi.mocked(useChatThreadStore);
    const mockStore = createMockZustandStore(mockChatThreadStore);
    mockUseChatThreadStore.mockReturnValue(mockStore);

    // Setup SSE subscriptions to return proper unsubscribe functions
    vi.mocked(mockSSEEventBus.subscribe).mockImplementation(() => vi.fn());

    // Setup other mocks
    const toast = await import('react-hot-toast');
    vi.mocked(toast.default).error = mockToast.error;
    vi.mocked(toast.default).success = mockToast.success;

    const { useResponseValidation } = await import(
      '../../../hooks/useResponseValidation'
    );
    vi.mocked(useResponseValidation).mockReturnValue(mockResponseValidation);

    const { isSSEChunkEvent, isSSEMessageEvent } = await import(
      '../../../types/sseEvents'
    );
    vi.mocked(isSSEChunkEvent).mockImplementation(mockIsSSEChunkEvent);
    vi.mocked(isSSEMessageEvent).mockImplementation(mockIsSSEMessageEvent);

    const { useThreadsStore } = await import('../../../store/useThreadsStore');
    vi.mocked(useThreadsStore).mockReturnValue(mockThreadsStore);

    const { sseEventBus } = await import('../../../utils/sseEventBus');
    Object.assign(sseEventBus, mockSSEEventBus);

    const { logger } = await import('../../../utils/logger');
    Object.assign(logger, mockLogger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should load messages on mount when threadId is provided', async () => {
      const { result } = renderHook(() =>
        useChat({ threadId: fixtures.mockThreadId })
      );

      await waitFor(() => {
        expect(mockChatThreadStore.loadMessages).toHaveBeenCalledTimes(1);
      });

      expect(result.current.messages).toEqual([
        fixtures.mockUserMessage,
        fixtures.mockAssistantMessage,
      ]);
    });

    it('should use activeThreadId from store when no threadId prop provided', () => {
      mockThreadsStore.activeThreadId = fixtures.mockThreadId;

      const { result } = renderHook(() => useChat());

      expect(result.current.messages).toEqual([
        fixtures.mockUserMessage,
        fixtures.mockAssistantMessage,
      ]);
    });

    it('should provide empty defaults when no thread is active', () => {
      mockThreadsStore.activeThreadId = null;

      const { result } = renderHook(() => useChat({ threadId: undefined }));

      expect(result.current.messages).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should setup SSE event subscriptions', () => {
      renderHook(() => useChat({ threadId: fixtures.mockThreadId }));

      expect(mockSSEEventBus.subscribe).toHaveBeenCalledWith(
        'content-chunk',
        expect.any(Function)
      );
      expect(mockSSEEventBus.subscribe).toHaveBeenCalledWith(
        'message-update',
        expect.any(Function)
      );
      expect(mockSSEEventBus.subscribe).toHaveBeenCalledWith(
        'completed',
        expect.any(Function)
      );
      expect(mockSSEEventBus.subscribe).toHaveBeenCalledWith(
        'cancelled',
        expect.any(Function)
      );
      expect(mockSSEEventBus.subscribe).toHaveBeenCalledWith(
        'messages-deleted',
        expect.any(Function)
      );
    });
  });

  describe('sendMessage', () => {
    it('should send a message successfully', async () => {
      fetchMock.mockSuccess(fixtures.mockMessageResponse);

      // Mock the getState calls that will happen during sendMessage
      const { useThreadsStore } = await import(
        '../../../store/useThreadsStore'
      );
      Object.defineProperty(vi.mocked(useThreadsStore), 'getState', {
        value: vi.fn(() => mockThreadsStore),
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() =>
        useChat({ threadId: fixtures.mockThreadId })
      );

      await act(async () => {
        await result.current.sendMessage('Hello world');
      });

      expect(mockChatThreadStore.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'user',
          content: 'Hello world',
        })
      );

      expect(fetchMock.mockFetch).toHaveBeenCalledWith(
        '/api/message',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"message":"Hello world"'),
        })
      );

      expect(mockThreadsStore.loadThreads).toHaveBeenCalled();
    });

    it('should send message with attachments', async () => {
      fetchMock.mockSuccess(fixtures.mockMessageResponse);
      const { result } = renderHook(() =>
        useChat({ threadId: fixtures.mockThreadId })
      );

      await act(async () => {
        await result.current.sendMessage(
          'Check this image',
          [fixtures.mockImageAttachment],
          [fixtures.mockNotesAttachment]
        );
      });

      expect(fetchMock.mockFetch).toHaveBeenCalledWith(
        '/api/message',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"message":"Check this image"'),
        })
      );

      // Verify attachments are included in the request
      const callArgs = fetchMock.mockFetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body) as {
        images: unknown[];
        notes: unknown[];
      };

      // Convert date fields to string for comparison since they get serialized
      const expectedImage = {
        ...fixtures.mockImageAttachment,
        uploadedAt: fixtures.mockImageAttachment.uploadedAt.toISOString(),
      };
      const expectedNotes = {
        ...fixtures.mockNotesAttachment,
        attachedAt: fixtures.mockNotesAttachment.attachedAt.toISOString(),
      };

      expect(body.images).toEqual([expectedImage]);
      expect(body.notes).toEqual([expectedNotes]);
    });

    it('should handle /clear command', async () => {
      // Mock the getState calls that will happen during /clear
      const { useThreadsStore } = await import(
        '../../../store/useThreadsStore'
      );
      Object.defineProperty(vi.mocked(useThreadsStore), 'getState', {
        value: vi.fn(() => mockThreadsStore),
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() =>
        useChat({ threadId: fixtures.mockThreadId })
      );

      await act(async () => {
        await result.current.sendMessage('/clear');
      });

      expect(mockThreadsStore.clearThread).toHaveBeenCalledWith(
        fixtures.mockThreadId
      );
      expect(mockChatThreadStore.loadMessages).toHaveBeenCalled();
      expect(fetchMock.mockFetch).not.toHaveBeenCalled();
    });

    it('should handle send errors', async () => {
      fetchMock.mockError(429, fixtures.mockAPIError);
      const { result } = renderHook(() =>
        useChat({ threadId: fixtures.mockThreadId })
      );

      await act(async () => {
        await result.current.sendMessage('Hello');
      });

      expect(mockToast.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send message')
      );
      // Check that setError was called with the error message
      expect(mockChatThreadStore.setError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send message')
      );
    });

    it('should handle network errors', async () => {
      fetchMock.mockNetworkError(fixtures.mockNetworkError);
      const { result } = renderHook(() =>
        useChat({ threadId: fixtures.mockThreadId })
      );

      await act(async () => {
        await result.current.sendMessage('Hello');
      });

      expect(mockToast.error).toHaveBeenCalledWith(
        'Failed to send message: Error: Network error'
      );
    });

    it('should show error when no thread is selected', async () => {
      mockThreadsStore.activeThreadId = null;
      const { result } = renderHook(() => useChat({ threadId: undefined }));

      await act(async () => {
        await result.current.sendMessage('Hello');
      });

      expect(mockToast.error).toHaveBeenCalledWith('No active thread selected');
      expect(fetchMock.mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('clearConversation', () => {
    it('should clear conversation for current thread', async () => {
      // Mock the getState calls that will happen during clearConversation
      const { useThreadsStore } = await import(
        '../../../store/useThreadsStore'
      );
      Object.defineProperty(vi.mocked(useThreadsStore), 'getState', {
        value: vi.fn(() => mockThreadsStore),
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() =>
        useChat({ threadId: fixtures.mockThreadId })
      );

      await act(async () => {
        await result.current.clearConversation();
      });

      expect(mockThreadsStore.clearThread).toHaveBeenCalledWith(
        fixtures.mockThreadId
      );
      expect(mockChatThreadStore.loadMessages).toHaveBeenCalled();
    });

    it('should handle clear errors', async () => {
      // Mock the getState calls
      const { useThreadsStore } = await import(
        '../../../store/useThreadsStore'
      );
      Object.defineProperty(vi.mocked(useThreadsStore), 'getState', {
        value: vi.fn(() => mockThreadsStore),
        writable: true,
        configurable: true,
      });

      mockThreadsStore.clearThread.mockRejectedValueOnce(
        new Error('Clear failed')
      );
      const { result } = renderHook(() =>
        useChat({ threadId: fixtures.mockThreadId })
      );

      await act(async () => {
        await result.current.clearConversation();
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to clear conversation:',
        expect.any(Error)
      );
      expect(mockToast.error).toHaveBeenCalledWith(
        'Failed to clear conversation'
      );
    });
  });

  describe('regenerateMessage', () => {
    it('should regenerate last assistant message', async () => {
      fetchMock.mockSuccess(fixtures.mockMessageResponse);
      mockChatThreadStore.messages = [
        fixtures.mockUserMessage,
        fixtures.mockAssistantMessage,
      ];

      const { result } = renderHook(() =>
        useChat({ threadId: fixtures.mockThreadId })
      );

      await act(async () => {
        await result.current.regenerateMessage(
          fixtures.mockAssistantMessage.id
        );
      });

      expect(mockChatThreadStore.setMessages).toHaveBeenCalledWith([
        fixtures.mockUserMessage,
      ]);

      expect(fetchMock.mockFetch).toHaveBeenCalledWith('/api/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: fixtures.mockUserMessage.content,
          threadId: fixtures.mockThreadId,
          images: [],
          notes: [],
          isAgentMode: false,
        }),
      });
    });

    it('should handle regenerate errors', async () => {
      fetchMock.mockError(500, { error: 'Server error' });
      mockChatThreadStore.messages = [
        fixtures.mockUserMessage,
        fixtures.mockAssistantMessage,
      ];

      const { result } = renderHook(() =>
        useChat({ threadId: fixtures.mockThreadId })
      );

      await act(async () => {
        await result.current.regenerateMessage(
          fixtures.mockAssistantMessage.id
        );
      });

      expect(mockToast.error).toHaveBeenCalledWith(
        'Failed to regenerate message: Error: Server error'
      );
      expect(mockChatThreadStore.loadMessages).toHaveBeenCalled();
    });
  });

  describe('editMessage', () => {
    it('should edit user message and regenerate response', async () => {
      fetchMock.mockSuccess(fixtures.mockMessageResponse);
      mockChatThreadStore.messages = [
        fixtures.mockUserMessage,
        fixtures.mockAssistantMessage,
      ];

      const { result } = renderHook(() =>
        useChat({ threadId: fixtures.mockThreadId })
      );

      await act(async () => {
        await result.current.editMessage(
          fixtures.mockUserMessage.id,
          'Edited content'
        );
      });

      // Should update message and remove following messages
      expect(mockChatThreadStore.setMessages).toHaveBeenCalledWith([
        expect.objectContaining({
          ...fixtures.mockUserMessage,
          content: 'Edited content',
        }),
      ]);

      expect(fetchMock.mockFetch).toHaveBeenCalledWith('/api/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Edited content',
          threadId: fixtures.mockThreadId,
          images: [],
          isAgentMode: false,
        }),
      });
    });
  });

  describe('cancelStreaming', () => {
    it('should cancel currently streaming message', async () => {
      fetchMock.mockSuccess({});
      mockChatThreadStore.messages = [
        fixtures.mockUserMessage,
        fixtures.mockStreamingMessage,
      ];

      const { result } = renderHook(() =>
        useChat({ threadId: fixtures.mockThreadId })
      );

      await act(async () => {
        await result.current.cancelStreaming();
      });

      expect(fetchMock.mockFetch).toHaveBeenCalledWith('/api/message/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: fixtures.mockStreamingMessage.id,
          threadId: fixtures.mockThreadId,
        }),
      });
    });

    it('should fallback to local cancellation on error', async () => {
      fetchMock.mockError(500, {});
      mockChatThreadStore.messages = [
        fixtures.mockUserMessage,
        fixtures.mockStreamingMessage,
      ];

      const { result } = renderHook(() =>
        useChat({ threadId: fixtures.mockThreadId })
      );

      await act(async () => {
        await result.current.cancelStreaming();
      });

      expect(mockChatThreadStore.updateMessage).toHaveBeenCalledWith(
        fixtures.mockStreamingMessage.id,
        {
          status: 'cancelled',
          content:
            fixtures.mockStreamingMessage.content + '\n\n[Cancelled by user]',
        }
      );
    });
  });

  describe('retryLastMessage', () => {
    it('should retry last user message', async () => {
      fetchMock.mockSuccess(fixtures.mockMessageResponse);
      mockChatThreadStore.messages = [
        fixtures.mockAssistantMessage,
        fixtures.mockUserMessage,
      ];

      const { result } = renderHook(() =>
        useChat({ threadId: fixtures.mockThreadId })
      );

      await act(async () => {
        await result.current.retryLastMessage();
      });

      expect(fetchMock.mockFetch).toHaveBeenCalledWith('/api/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: fixtures.mockUserMessage.content,
          threadId: fixtures.mockThreadId,
          images: [],
          isAgentMode: false,
        }),
      });
    });

    it('should not retry if last message is not from user', async () => {
      mockChatThreadStore.messages = [
        fixtures.mockUserMessage,
        fixtures.mockAssistantMessage,
      ];

      const { result } = renderHook(() =>
        useChat({ threadId: fixtures.mockThreadId })
      );

      await act(async () => {
        await result.current.retryLastMessage();
      });

      expect(fetchMock.mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('computed states', () => {
    it('should compute isStreaming from message status', () => {
      mockChatThreadStore.messages = [
        fixtures.mockUserMessage,
        fixtures.mockStreamingMessage,
      ];

      const { result } = renderHook(() =>
        useChat({ threadId: fixtures.mockThreadId })
      );

      expect(result.current.isLoading).toBe(true); // isLoading includes isStreaming
    });

    it('should return loading state correctly', () => {
      mockChatThreadStore.isLoading = true;
      mockChatThreadStore.messages = [];

      const { result } = renderHook(() =>
        useChat({ threadId: fixtures.mockThreadId })
      );

      expect(result.current.isLoading).toBe(true);
    });
  });
});
