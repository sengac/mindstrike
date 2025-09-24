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
} from './mocks/chatMocks';

describe('useChat - SSE Event Handling', () => {
  let mockChatThreadStore: ReturnType<typeof createMockChatThreadStore>;
  let sseHandlers: Record<string, Function>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup chat thread store mock
    mockChatThreadStore = createMockChatThreadStore({
      messages: [fixtures.mockUserMessage],
    });

    const { useChatThreadStore } = await import(
      '../../../store/useChatThreadStore'
    );
    const mockUseChatThreadStore = vi.mocked(useChatThreadStore);
    const mockStore = createMockZustandStore(mockChatThreadStore);
    mockUseChatThreadStore.mockReturnValue(mockStore);

    // Capture SSE event handlers
    sseHandlers = {};
    const { sseEventBus } = await import('../../../utils/sseEventBus');
    vi.mocked(sseEventBus.subscribe).mockImplementation(
      (event: string, handler: Function) => {
        sseHandlers[event] = handler;
        return vi.fn(); // unsubscribe function
      }
    );

    // Setup type guards
    const { isSSEChunkEvent, isSSEMessageEvent } = await import(
      '../../../types/sseEvents'
    );
    vi.mocked(isSSEChunkEvent).mockImplementation((data: unknown) => {
      if (typeof data === 'object' && data !== null) {
        const obj = data as Record<string, unknown>;
        return 'chunk' in obj && 'messageId' in obj;
      }
      return false;
    });
    vi.mocked(isSSEMessageEvent).mockImplementation((data: unknown) => {
      if (typeof data === 'object' && data !== null) {
        const obj = data as Record<string, unknown>;
        return 'message' in obj;
      }
      return false;
    });

    // Setup other mocks
    const { useThreadsStore } = await import('../../../store/useThreadsStore');
    vi.mocked(useThreadsStore).mockReturnValue(mockThreadsStore);

    const { useResponseValidation } = await import(
      '../../../hooks/useResponseValidation'
    );
    vi.mocked(useResponseValidation).mockReturnValue(mockResponseValidation);

    const { logger } = await import('../../../utils/logger');
    Object.assign(logger, mockLogger);

    const toast = await import('react-hot-toast');
    vi.mocked(toast.default).error = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('content-chunk events', () => {
    it('should append chunks to streaming message', () => {
      mockChatThreadStore.messages = [
        fixtures.mockUserMessage,
        fixtures.mockStreamingMessage,
      ];

      renderHook(() => useChat({ threadId: fixtures.mockThreadId }));

      // Simulate content chunk event
      act(() => {
        sseHandlers['content-chunk']({
          threadId: fixtures.mockThreadId,
          data: fixtures.mockSSEChunkEvent.data,
        });
      });

      expect(mockChatThreadStore.updateMessage).toHaveBeenCalledWith(
        fixtures.mockStreamingMessage.id,
        expect.objectContaining({
          content:
            fixtures.mockStreamingMessage.content +
            fixtures.mockSSEChunkEvent.data.chunk,
        })
      );
    });

    it('should clear loading state on first chunk', () => {
      mockChatThreadStore.messages = [
        fixtures.mockUserMessage,
        fixtures.mockStreamingMessage,
      ];
      mockChatThreadStore.isLoading = true;

      renderHook(() => useChat({ threadId: fixtures.mockThreadId }));

      act(() => {
        sseHandlers['content-chunk']({
          threadId: fixtures.mockThreadId,
          data: fixtures.mockSSEChunkEvent.data,
        });
      });

      expect(mockChatThreadStore.setLoading).toHaveBeenCalledWith(false);
    });

    it('should ignore chunks for different threads', () => {
      renderHook(() => useChat({ threadId: fixtures.mockThreadId }));

      act(() => {
        sseHandlers['content-chunk']({
          threadId: fixtures.mockThreadId2,
          data: fixtures.mockSSEChunkEvent.data,
        });
      });

      expect(mockChatThreadStore.updateMessage).not.toHaveBeenCalled();
    });

    it('should not process invalid chunk events', async () => {
      renderHook(() => useChat({ threadId: fixtures.mockThreadId }));

      const { isSSEChunkEvent } = await import('../../../types/sseEvents');
      vi.mocked(isSSEChunkEvent).mockReturnValueOnce(false);

      act(() => {
        sseHandlers['content-chunk']({
          threadId: fixtures.mockThreadId,
          data: {},
        });
      });

      expect(mockChatThreadStore.updateMessage).not.toHaveBeenCalled();
    });
  });

  describe('message-update events', () => {
    it('should add new assistant message', () => {
      renderHook(() => useChat({ threadId: fixtures.mockThreadId }));

      act(() => {
        sseHandlers['message-update']({
          threadId: fixtures.mockThreadId,
          data: fixtures.mockSSEMessageEvent.data,
        });
      });

      expect(mockChatThreadStore.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          id: fixtures.mockSSEMessageEvent.data.message.id,
          role: 'assistant',
          content: fixtures.mockSSEMessageEvent.data.message.content,
          status: 'processing',
        })
      );
    });

    it('should update existing message', () => {
      mockChatThreadStore.messages = [
        fixtures.mockUserMessage,
        fixtures.mockStreamingMessage,
      ];

      renderHook(() => useChat({ threadId: fixtures.mockThreadId }));

      const updateEvent = {
        ...fixtures.mockSSEMessageEvent,
        data: {
          message: {
            ...fixtures.mockSSEMessageEvent.data.message,
            id: fixtures.mockStreamingMessage.id,
          },
        },
      };

      act(() => {
        sseHandlers['message-update']({
          threadId: fixtures.mockThreadId,
          data: updateEvent.data,
        });
      });

      expect(mockChatThreadStore.updateMessage).toHaveBeenCalledWith(
        fixtures.mockStreamingMessage.id,
        expect.objectContaining({
          content: updateEvent.data.message.content,
        })
      );
      expect(mockChatThreadStore.addMessage).not.toHaveBeenCalled();
    });
  });

  describe('completed events', () => {
    it('should mark message as completed', () => {
      mockChatThreadStore.messages = [
        fixtures.mockUserMessage,
        fixtures.mockStreamingMessage,
      ];

      renderHook(() => useChat({ threadId: fixtures.mockThreadId }));

      act(() => {
        sseHandlers['completed']({
          threadId: fixtures.mockThreadId,
          data: fixtures.mockSSECompletedEvent.data,
        });
      });

      expect(mockChatThreadStore.updateMessage).toHaveBeenCalledWith(
        fixtures.mockStreamingMessage.id,
        expect.objectContaining({
          status: 'completed',
          content: fixtures.mockSSECompletedEvent.data.message.content,
        })
      );
    });

    it('should trigger title generation for first message', async () => {
      mockChatThreadStore.messages = [];
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(fixtures.mockTitleResponse),
      });
      global.fetch = fetchMock;

      // Mock the getState calls that will happen during title generation
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

      // Send first message
      await act(async () => {
        await result.current.sendMessage('Hello world');
      });

      // Simulate completion event
      await act(async () => {
        sseHandlers['completed']({
          threadId: fixtures.mockThreadId,
          data: fixtures.mockSSECompletedEvent.data,
        });
      });

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith('/api/generate-title', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            context: 'User asked: Hello world',
          }),
        });
      });

      expect(mockThreadsStore.renameThread).toHaveBeenCalledWith(
        fixtures.mockThreadId,
        fixtures.mockTitleResponse.title
      );
    });

    it('should handle title generation errors gracefully', async () => {
      mockChatThreadStore.messages = [];
      const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = fetchMock;

      // Mock the getState calls
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

      await act(async () => {
        sseHandlers['completed']({
          threadId: fixtures.mockThreadId,
          data: fixtures.mockSSECompletedEvent.data,
        });
      });

      await waitFor(() => {
        expect(mockLogger.error).toHaveBeenCalledWith(
          '[useChat] Failed to generate thread title:',
          expect.any(Error)
        );
      });

      expect(mockThreadsStore.renameThread).not.toHaveBeenCalled();
    });
  });

  describe('cancelled events', () => {
    it('should mark message as cancelled', () => {
      mockChatThreadStore.messages = [
        fixtures.mockUserMessage,
        fixtures.mockStreamingMessage,
      ];

      renderHook(() => useChat({ threadId: fixtures.mockThreadId }));

      act(() => {
        sseHandlers['cancelled']({
          threadId: fixtures.mockThreadId,
          data: fixtures.mockSSECancelledEvent.data,
        });
      });

      expect(mockChatThreadStore.updateMessage).toHaveBeenCalledWith(
        fixtures.mockStreamingMessage.id,
        { status: 'cancelled' }
      );
    });
  });

  describe('messages-deleted events', () => {
    it('should remove deleted messages', () => {
      mockChatThreadStore.messages = [
        fixtures.mockUserMessage,
        fixtures.mockAssistantMessage,
      ];

      renderHook(() => useChat({ threadId: fixtures.mockThreadId }));

      act(() => {
        sseHandlers['messages-deleted']({
          threadId: fixtures.mockThreadId,
          data: fixtures.mockSSEMessagesDeletedEvent.data,
        });
      });

      expect(mockChatThreadStore.removeMessage).toHaveBeenCalledWith(
        fixtures.mockAssistantMessage.id
      );
      expect(mockChatThreadStore.removeMessage).toHaveBeenCalledWith(
        fixtures.mockUserMessage.id
      );
    });
  });

  describe('SSE subscription lifecycle', () => {
    it('should unsubscribe when thread changes', async () => {
      const unsubscribeFns = {
        'content-chunk': vi.fn(),
        'message-update': vi.fn(),
        completed: vi.fn(),
        cancelled: vi.fn(),
        'messages-deleted': vi.fn(),
      };

      const { sseEventBus } = await import('../../../utils/sseEventBus');
      vi.mocked(sseEventBus.subscribe).mockImplementation((event: string) => {
        return unsubscribeFns[event as keyof typeof unsubscribeFns];
      });

      const { rerender } = renderHook(({ threadId }) => useChat({ threadId }), {
        initialProps: { threadId: fixtures.mockThreadId },
      });

      // Change thread
      rerender({ threadId: fixtures.mockThreadId2 });

      // All unsubscribe functions should be called
      Object.values(unsubscribeFns).forEach(fn => {
        expect(fn).toHaveBeenCalled();
      });
    });

    it('should not subscribe when no thread is active', async () => {
      // Clear any previous mock calls
      mockSSEEventBus.subscribe.mockClear();

      // Mock store to return no active thread
      mockThreadsStore.activeThreadId = null;

      renderHook(() => useChat({ threadId: undefined }));

      // SSE subscriptions should not be set up when there's no thread
      expect(mockSSEEventBus.subscribe).not.toHaveBeenCalled();
    });
  });
});
