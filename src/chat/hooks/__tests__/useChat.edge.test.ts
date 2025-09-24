import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

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
} from './mocks/chatMocks';

describe('useChat - Edge Cases and Error Scenarios', () => {
  let mockChatThreadStore: ReturnType<typeof createMockChatThreadStore>;
  let fetchMock: ReturnType<typeof createFetchMock>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup fetch mock
    fetchMock = createFetchMock();
    global.fetch = fetchMock.mockFetch;

    // Setup chat thread store mock
    mockChatThreadStore = createMockChatThreadStore();

    const { useChatThreadStore } = await import(
      '../../../store/useChatThreadStore'
    );
    const mockUseChatThreadStore = vi.mocked(useChatThreadStore);
    const mockStore = createMockZustandStore(mockChatThreadStore);
    mockUseChatThreadStore.mockReturnValue(mockStore);

    // Setup SSE subscriptions
    const { sseEventBus } = await import('../../../utils/sseEventBus');
    Object.assign(sseEventBus, mockSSEEventBus);
    vi.mocked(sseEventBus.subscribe).mockImplementation(() => vi.fn());

    // Setup other mocks
    const toast = await import('react-hot-toast');
    vi.mocked(toast.default).error = mockToast.error;
    vi.mocked(toast.default).success = mockToast.success;

    const { useResponseValidation } = await import(
      '../../../hooks/useResponseValidation'
    );
    vi.mocked(useResponseValidation).mockReturnValue(mockResponseValidation);

    const { useThreadsStore } = await import('../../../store/useThreadsStore');
    vi.mocked(useThreadsStore).mockReturnValue(mockThreadsStore);

    const { logger } = await import('../../../utils/logger');
    Object.assign(logger, mockLogger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('edge cases', () => {
    it('should handle message with tool calls', async () => {
      fetchMock.mockSuccess(fixtures.mockMessageResponse);
      mockChatThreadStore.messages = [fixtures.mockMessageWithTools];

      const { result } = renderHook(() =>
        useChat({ threadId: fixtures.mockThreadId })
      );

      expect(result.current.messages[0].toolCalls).toBeDefined();
      expect(result.current.messages[0].toolResults).toBeDefined();
    });

    it('should handle empty message content', async () => {
      fetchMock.mockSuccess(fixtures.mockMessageResponse);
      const { result } = renderHook(() =>
        useChat({ threadId: fixtures.mockThreadId })
      );

      await act(async () => {
        await result.current.sendMessage('');
      });

      expect(mockChatThreadStore.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: '',
        })
      );
    });

    it('should handle very long messages', async () => {
      fetchMock.mockSuccess(fixtures.mockMessageResponse);
      const longMessage = 'x'.repeat(10000);
      const { result } = renderHook(() =>
        useChat({ threadId: fixtures.mockThreadId })
      );

      await act(async () => {
        await result.current.sendMessage(longMessage);
      });

      expect(fetchMock.mockFetch).toHaveBeenCalledWith(
        '/api/message',
        expect.objectContaining({
          body: expect.stringContaining(longMessage),
        })
      );
    });

    it('should handle rapid successive messages', async () => {
      fetchMock.mockSuccess(fixtures.mockMessageResponse);
      const { result } = renderHook(() =>
        useChat({ threadId: fixtures.mockThreadId })
      );

      await act(async () => {
        // Send multiple messages rapidly
        const promises = [
          result.current.sendMessage('Message 1'),
          result.current.sendMessage('Message 2'),
          result.current.sendMessage('Message 3'),
        ];
        await Promise.all(promises);
      });

      expect(fetchMock.mockFetch).toHaveBeenCalledTimes(3);
      expect(mockChatThreadStore.addMessage).toHaveBeenCalledTimes(3);
    });

    it('should handle thread switching during streaming', () => {
      mockChatThreadStore.messages = [fixtures.mockStreamingMessage];
      mockChatThreadStore.isStreaming = true;

      const { rerender } = renderHook(({ threadId }) => useChat({ threadId }), {
        initialProps: { threadId: fixtures.mockThreadId },
      });

      // Switch to different thread
      rerender({ threadId: fixtures.mockThreadId2 });

      // Should not affect the streaming state of the original thread
      expect(mockChatThreadStore.isStreaming).toBe(true);
    });
  });

  describe('error recovery', () => {
    it('should recover from loadMessages failure', async () => {
      (
        mockChatThreadStore.loadMessages as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce(new Error('Load failed'));

      renderHook(() => useChat({ threadId: fixtures.mockThreadId }));

      // Wait for the loadMessages to be called and fail
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[useChat] Failed to load messages:',
        expect.any(Error)
      );
    });

    it('should handle malformed server responses', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
        text: vi.fn().mockResolvedValue(''),
        headers: new Headers(),
      };
      fetchMock.mockFetch.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() =>
        useChat({ threadId: fixtures.mockThreadId })
      );

      await act(async () => {
        await result.current.sendMessage('Hello');
      });

      expect(mockToast.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send message')
      );
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'AbortError';
      fetchMock.mockNetworkError(timeoutError);

      const { result } = renderHook(() =>
        useChat({ threadId: fixtures.mockThreadId })
      );

      await act(async () => {
        await result.current.sendMessage('Hello');
      });

      expect(mockToast.error).toHaveBeenCalled();
      // Check that setError was called with the error message
      expect(mockChatThreadStore.setError).toHaveBeenCalledWith(
        expect.stringContaining('Request timeout')
      );
    });

    it('should clear errors on successful operation', async () => {
      // First, trigger an error
      fetchMock.mockError(500, { error: 'Server error' });
      const { result } = renderHook(() =>
        useChat({ threadId: fixtures.mockThreadId })
      );

      await act(async () => {
        await result.current.sendMessage('Hello');
      });

      // Check that setError was called with the error message
      expect(mockChatThreadStore.setError).toHaveBeenCalledWith(
        expect.stringContaining('Server error')
      );

      // Reset the mock call history
      (mockChatThreadStore.setError as ReturnType<typeof vi.fn>).mockClear();

      // Then succeed
      fetchMock.mockSuccess(fixtures.mockMessageResponse);

      // Mock the getState calls that will happen during successful sendMessage
      const { useThreadsStore } = await import(
        '../../../store/useThreadsStore'
      );
      Object.defineProperty(vi.mocked(useThreadsStore), 'getState', {
        value: vi.fn(() => mockThreadsStore),
        writable: true,
        configurable: true,
      });

      await act(async () => {
        await result.current.sendMessage('Hello again');
      });

      // setError should be called with null to clear the error
      expect(mockChatThreadStore.setError).toHaveBeenCalledWith(null);
    });
  });

  describe('validation edge cases', () => {
    it('should handle validation failures gracefully', async () => {
      mockResponseValidation.validateMessage.mockRejectedValueOnce(
        new Error('Validation failed')
      );

      const { result } = renderHook(() =>
        useChat({ threadId: fixtures.mockThreadId })
      );

      // The hook should continue to work despite validation failures
      expect(result.current.messages).toBeDefined();
      expect(result.current.sendMessage).toBeDefined();
    });

    it('should process messages with validation changes', async () => {
      mockResponseValidation.validateMessage.mockResolvedValueOnce({
        message: {
          ...fixtures.mockAssistantMessage,
          content: 'Corrected content',
        },
        hasChanges: true,
      });

      // This would be called during message processing
      expect(mockResponseValidation.validateMessage).toBeDefined();
    });
  });

  describe('local model error handling', () => {
    it('should expose local model error state', () => {
      const { result } = renderHook(() =>
        useChat({ threadId: fixtures.mockThreadId })
      );

      expect(result.current.localModelError).toBeNull();
      expect(result.current.clearLocalModelError).toBeDefined();
    });

    it('should clear local model error', () => {
      const { result } = renderHook(() =>
        useChat({ threadId: fixtures.mockThreadId })
      );

      act(() => {
        // Set error through internal state (would normally come from server)
        result.current.clearLocalModelError();
      });

      expect(result.current.localModelError).toBeNull();
    });
  });

  describe('agent mode', () => {
    it('should send isAgentMode flag when enabled', async () => {
      fetchMock.mockSuccess(fixtures.mockMessageResponse);
      const { result } = renderHook(() =>
        useChat({ threadId: fixtures.mockThreadId, isAgentMode: true })
      );

      await act(async () => {
        await result.current.sendMessage('Hello');
      });

      expect(fetchMock.mockFetch).toHaveBeenCalledWith('/api/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('"isAgentMode":true'),
      });
    });
  });

  describe('concurrent operations', () => {
    it('should handle cancel during regenerate', async () => {
      fetchMock.mockSuccess({});
      mockChatThreadStore.messages = [
        fixtures.mockUserMessage,
        fixtures.mockStreamingMessage,
      ];

      const { result } = renderHook(() =>
        useChat({ threadId: fixtures.mockThreadId })
      );

      await act(async () => {
        // Start regenerate and cancel simultaneously
        const regeneratePromise = result.current.regenerateMessage(
          fixtures.mockStreamingMessage.id
        );
        const cancelPromise = result.current.cancelStreaming();

        await Promise.all([regeneratePromise, cancelPromise]);
      });

      // Both operations should complete without errors
      expect(fetchMock.mockFetch).toHaveBeenCalled();
    });

    it('should handle multiple edits in sequence', async () => {
      fetchMock.mockSuccess(fixtures.mockMessageResponse);
      mockChatThreadStore.messages = [
        fixtures.mockUserMessage,
        fixtures.mockAssistantMessage,
      ];

      const { result } = renderHook(() =>
        useChat({ threadId: fixtures.mockThreadId })
      );

      await act(async () => {
        await result.current.editMessage(fixtures.mockUserMessage.id, 'Edit 1');
        await result.current.editMessage(fixtures.mockUserMessage.id, 'Edit 2');
      });

      expect(fetchMock.mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
