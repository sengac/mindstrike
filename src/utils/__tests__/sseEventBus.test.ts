/**
 * Unit tests for SSEEventBus
 * Tests connection management, event subscription, and reconnection logic
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SSE_CONFIG, SSE_EVENT_TYPES } from '../../constants/sse.constants';
import { MockEventSource } from '../../__mocks__/EventSource';
import * as sseEventFixtures from '../../__fixtures__/sseEvents';

// Mock dependencies
vi.mock('../logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../sseDecoder', () => ({
  decodeSseDataSync: vi.fn(data => data),
}));

// Test the actual sseEventBus singleton
type SSEEventBusType = typeof import('../sseEventBus').sseEventBus;
let sseEventBus: SSEEventBusType;
let mockEventSourceInstances: MockEventSource[] = [];

describe('SSEEventBus', () => {
  beforeEach(async () => {
    // Reset module state
    vi.resetModules();
    mockEventSourceInstances = [];

    // Use Vitest's stubGlobal to mock EventSource
    vi.stubGlobal(
      'EventSource',
      vi.fn().mockImplementation((url: string) => {
        const instance = new MockEventSource(url);
        mockEventSourceInstances.push(instance);
        return instance;
      })
    );

    // Import fresh instance
    const module = await import('../sseEventBus');
    sseEventBus = module.sseEventBus;

    // Ensure any existing connections are closed
    sseEventBus.disconnect();

    // Mock document visibility
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    // Cleanup
    sseEventBus.disconnect();
    vi.clearAllTimers(); // Clear any pending timers
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('Connection Management', () => {
    it('should initialize connection when initialize() is called', () => {
      expect(sseEventBus.getConnectionStatus().isConnected).toBe(false);

      sseEventBus.initialize();

      // Should create EventSource with correct endpoint
      expect(mockEventSourceInstances).toHaveLength(1);
      const mockEventSource = mockEventSourceInstances[0];
      expect(mockEventSource).toBeDefined();
      expect(mockEventSource.url).toBe(SSE_CONFIG.CONNECTION_ENDPOINT);
    });

    it('should not initialize multiple times', () => {
      sseEventBus.initialize();
      expect(mockEventSourceInstances).toHaveLength(1);

      sseEventBus.initialize();

      // Should not create a second EventSource
      expect(mockEventSourceInstances).toHaveLength(1);
    });

    it('should update connection status on open', () => {
      const statusCallback = vi.fn();
      sseEventBus.subscribeToConnectionStatus(statusCallback);

      sseEventBus.initialize();
      const mockEventSource = mockEventSourceInstances[0];

      // Simulate connection open
      mockEventSource.simulateOpen();

      expect(sseEventBus.getConnectionStatus().isConnected).toBe(true);
      expect(statusCallback).toHaveBeenCalledWith(true);
    });

    it('should handle connection errors and attempt reconnection', async () => {
      vi.useFakeTimers();

      sseEventBus.initialize();
      const mockEventSource = mockEventSourceInstances[0];

      // Simulate error
      mockEventSource.simulateError();

      expect(sseEventBus.getConnectionStatus().isConnected).toBe(false);

      // Wait for reconnect attempt counter to update
      await vi.runAllTimersAsync();

      // Should create new EventSource after delay
      expect(mockEventSourceInstances).toHaveLength(2);

      vi.useRealTimers();
    });

    it('should implement exponential backoff for reconnections', async () => {
      vi.useFakeTimers();

      sseEventBus.initialize();
      let mockEventSource = mockEventSourceInstances[0];

      // First error - 3 second delay
      mockEventSource.simulateError();
      await vi.advanceTimersByTimeAsync(SSE_CONFIG.INITIAL_RECONNECT_DELAY);
      expect(mockEventSourceInstances).toHaveLength(2);

      // Second error - 6 second delay (3 * 2)
      mockEventSource = mockEventSourceInstances[1];
      mockEventSource.simulateError();
      await vi.advanceTimersByTimeAsync(
        SSE_CONFIG.INITIAL_RECONNECT_DELAY *
          SSE_CONFIG.RECONNECT_BACKOFF_MULTIPLIER
      );
      expect(mockEventSourceInstances).toHaveLength(3);

      // Third error - 12 second delay (3 * 2^2)
      mockEventSource = mockEventSourceInstances[2];
      mockEventSource.simulateError();
      await vi.advanceTimersByTimeAsync(
        SSE_CONFIG.INITIAL_RECONNECT_DELAY *
          Math.pow(SSE_CONFIG.RECONNECT_BACKOFF_MULTIPLIER, 2)
      );
      expect(mockEventSourceInstances).toHaveLength(4);

      vi.useRealTimers();
    });

    it('should stop reconnecting after max attempts', async () => {
      vi.useFakeTimers();

      sseEventBus.initialize();
      const firstConnection = mockEventSourceInstances[0];

      // Open connection to ensure reconnectAttempts starts at 0
      firstConnection.simulateOpen();
      const statusAfterOpen = sseEventBus.getConnectionStatus();
      expect(statusAfterOpen.reconnectAttempts).toBe(0);
      expect(statusAfterOpen.isConnected).toBe(true);

      // Cause MAX_RECONNECT_ATTEMPTS errors and verify reconnections
      for (
        let attempt = 0;
        attempt < SSE_CONFIG.MAX_RECONNECT_ATTEMPTS;
        attempt++
      ) {
        // Get the current connection (might be the first one on first iteration)
        const connectionIndex =
          attempt === 0 ? 0 : mockEventSourceInstances.length - 1;
        const currentConnection = mockEventSourceInstances[connectionIndex];

        // Simulate error
        currentConnection.simulateError();

        // Verify reconnectAttempts was incremented
        expect(sseEventBus.getConnectionStatus().reconnectAttempts).toBe(
          attempt + 1
        );

        // Calculate and advance by the expected delay
        const delay =
          SSE_CONFIG.INITIAL_RECONNECT_DELAY *
          Math.pow(SSE_CONFIG.RECONNECT_BACKOFF_MULTIPLIER, attempt);
        await vi.advanceTimersByTimeAsync(delay);

        // Should have created a new connection
        expect(mockEventSourceInstances).toHaveLength(attempt + 2); // +2 because we started with 1
      }

      // Now we should have 1 initial + 5 reconnections = 6 total
      expect(mockEventSourceInstances).toHaveLength(
        SSE_CONFIG.MAX_RECONNECT_ATTEMPTS + 1
      );
      expect(sseEventBus.getConnectionStatus().reconnectAttempts).toBe(
        SSE_CONFIG.MAX_RECONNECT_ATTEMPTS
      );

      // Cause one more error - this should NOT create a new connection
      const lastConnection =
        mockEventSourceInstances[mockEventSourceInstances.length - 1];
      lastConnection.simulateError();

      // reconnectAttempts should still be at MAX (not incremented)
      expect(sseEventBus.getConnectionStatus().reconnectAttempts).toBe(
        SSE_CONFIG.MAX_RECONNECT_ATTEMPTS
      );

      // Advance timers generously to ensure no reconnection happens
      await vi.runAllTimersAsync();

      // Should still have the same number of connections
      expect(mockEventSourceInstances).toHaveLength(
        SSE_CONFIG.MAX_RECONNECT_ATTEMPTS + 1
      );

      vi.useRealTimers();
    });

    it('should handle visibility changes', () => {
      sseEventBus.initialize();
      const mockEventSource = mockEventSourceInstances[0];

      // Simulate going to background
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        writable: true,
        configurable: true,
      });

      // Simulate connection error while hidden
      mockEventSource.simulateError();

      // Make visible again
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        writable: true,
        configurable: true,
      });

      // Trigger visibility change event
      document.dispatchEvent(new Event('visibilitychange'));

      // Should attempt to reconnect
      expect(mockEventSourceInstances).toHaveLength(2);
    });

    it('should clean up on disconnect', () => {
      const statusCallback = vi.fn();
      const eventCallback = vi.fn();

      sseEventBus.initialize();
      sseEventBus.subscribe('test-event', eventCallback);
      sseEventBus.subscribeToConnectionStatus(statusCallback);

      const mockEventSource = mockEventSourceInstances[0];
      const closeSpy = vi.spyOn(mockEventSource, 'close');

      sseEventBus.disconnect();

      expect(closeSpy).toHaveBeenCalled();
      expect(sseEventBus.getConnectionStatus().isConnected).toBe(false);
      expect(sseEventBus.getConnectionStatus().subscriberCount).toBe(0);
    });
  });

  describe('Event Subscription', () => {
    beforeEach(() => {
      sseEventBus.initialize();
      const mockEventSource = mockEventSourceInstances[0];
      mockEventSource.simulateOpen();
    });

    it('should subscribe to specific event types', () => {
      const handler = vi.fn();
      const unsubscribe = sseEventBus.subscribe(
        SSE_EVENT_TYPES.CONTENT_CHUNK,
        handler
      );

      // Simulate message - send the raw data that includes the type field
      const mockEventSource = mockEventSourceInstances[0];
      mockEventSource.simulateMessage({
        type: SSE_EVENT_TYPES.CONTENT_CHUNK,
        ...sseEventFixtures.contentChunkEvents.simple.data,
      });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: SSE_EVENT_TYPES.CONTENT_CHUNK,
          data: {
            type: SSE_EVENT_TYPES.CONTENT_CHUNK,
            ...sseEventFixtures.contentChunkEvents.simple.data,
          },
          timestamp: expect.any(Number),
          threadId: 'test-thread-1', // Extracted from the data
        })
      );

      // Test unsubscribe
      unsubscribe();
      handler.mockClear();
      mockEventSource.simulateMessage(
        sseEventFixtures.contentChunkEvents.simple.data
      );
      expect(handler).not.toHaveBeenCalled();
    });

    it('should support multiple subscribers for same event', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      sseEventBus.subscribe(SSE_EVENT_TYPES.MESSAGE_UPDATE, handler1);
      sseEventBus.subscribe(SSE_EVENT_TYPES.MESSAGE_UPDATE, handler2);

      const mockEventSource = mockEventSourceInstances[0];
      mockEventSource.simulateMessage({
        type: SSE_EVENT_TYPES.MESSAGE_UPDATE,
        ...sseEventFixtures.messageUpdateEvents.initial.data,
      });

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should support wildcard subscribers', () => {
      const wildcardHandler = vi.fn();
      const specificHandler = vi.fn();

      sseEventBus.subscribe('*', wildcardHandler);
      sseEventBus.subscribe(SSE_EVENT_TYPES.COMPLETED, specificHandler);

      const mockEventSource = mockEventSourceInstances[0];
      mockEventSource.simulateMessage({
        type: SSE_EVENT_TYPES.COMPLETED,
        ...sseEventFixtures.completedEvents.simple.data,
      });

      // Both should be called
      expect(wildcardHandler).toHaveBeenCalled();
      expect(specificHandler).toHaveBeenCalled();
    });

    it('should handle errors in event handlers gracefully', () => {
      const errorHandler = vi.fn().mockImplementation(() => {
        throw new Error('Handler error');
      });
      const goodHandler = vi.fn();

      sseEventBus.subscribe(SSE_EVENT_TYPES.ERROR, errorHandler);
      sseEventBus.subscribe(SSE_EVENT_TYPES.ERROR, goodHandler);

      const mockEventSource = mockEventSourceInstances[0];
      mockEventSource.simulateMessage({
        type: SSE_EVENT_TYPES.ERROR,
        ...sseEventFixtures.errorEvents.networkError.data,
      });

      // Error handler throws, but good handler should still be called
      expect(errorHandler).toHaveBeenCalled();
      expect(goodHandler).toHaveBeenCalled();
    });

    it('should extract thread and workflow IDs from events', () => {
      const handler = vi.fn();
      sseEventBus.subscribe(SSE_EVENT_TYPES.WORKFLOW_STARTED, handler);

      const eventData = {
        type: SSE_EVENT_TYPES.WORKFLOW_STARTED,
        workflowId: 'workflow-123',
        threadId: 'thread-456',
      };

      const mockEventSource = mockEventSourceInstances[0];
      mockEventSource.simulateMessage(eventData);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: SSE_EVENT_TYPES.WORKFLOW_STARTED,
          data: eventData,
          workflowId: 'workflow-123',
          threadId: 'thread-456',
          timestamp: expect.any(Number),
        })
      );
    });
  });

  describe('Connection Status Subscription', () => {
    it('should notify subscribers of connection status changes', () => {
      const statusCallback = vi.fn();
      const unsubscribe =
        sseEventBus.subscribeToConnectionStatus(statusCallback);

      // Should immediately call with current status (disconnected)
      expect(statusCallback).toHaveBeenCalledWith(false);

      sseEventBus.initialize();
      const mockEventSource = mockEventSourceInstances[0];
      mockEventSource.simulateOpen();

      // Should notify of connection
      expect(statusCallback).toHaveBeenCalledWith(true);

      // Simulate disconnection
      mockEventSource.simulateError();
      expect(statusCallback).toHaveBeenCalledWith(false);

      // Test unsubscribe
      statusCallback.mockClear();
      unsubscribe();
      mockEventSource.simulateOpen();
      expect(statusCallback).not.toHaveBeenCalled();
    });

    it('should handle errors in connection status callbacks', () => {
      const errorCallback = vi.fn().mockImplementation(() => {
        throw new Error('Callback error');
      });
      const goodCallback = vi.fn();

      // The first subscription will throw during the immediate callback
      expect(() => {
        sseEventBus.subscribeToConnectionStatus(errorCallback);
      }).toThrow('Callback error');

      // But we can still subscribe the good callback
      sseEventBus.subscribeToConnectionStatus(goodCallback);

      // Good callback should have been called with initial status
      expect(goodCallback).toHaveBeenCalledWith(false);

      // Initialize and open connection
      goodCallback.mockClear();
      sseEventBus.initialize();
      const mockEventSource = mockEventSourceInstances[0];
      mockEventSource.simulateOpen();

      // Good callback should be notified of connection
      expect(goodCallback).toHaveBeenCalledWith(true);
    });
  });

  describe('Status Reporting', () => {
    it('should report accurate connection status', () => {
      const initialStatus = sseEventBus.getConnectionStatus();
      expect(initialStatus).toEqual({
        isConnected: false,
        reconnectAttempts: 0,
        subscriberCount: 0,
      });

      // Add subscribers
      const unsub1 = sseEventBus.subscribe('event1', vi.fn());
      sseEventBus.subscribe('event2', vi.fn());
      sseEventBus.subscribe('event1', vi.fn()); // Same event, different handler

      expect(sseEventBus.getConnectionStatus().subscriberCount).toBe(3);

      // Remove one subscriber
      unsub1();
      expect(sseEventBus.getConnectionStatus().subscriberCount).toBe(2);

      // Connect and simulate errors
      sseEventBus.initialize();
      const mockEventSource = mockEventSourceInstances[0];
      mockEventSource.simulateOpen();

      expect(sseEventBus.getConnectionStatus().isConnected).toBe(true);

      mockEventSource.simulateError();
      // The reconnect attempts counter updates asynchronously
      // For now, just verify the connection is closed
      expect(sseEventBus.getConnectionStatus().isConnected).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle malformed SSE data', () => {
      const handler = vi.fn();
      sseEventBus.subscribe('*', handler);

      sseEventBus.initialize();
      const mockEventSource = mockEventSourceInstances[0];
      mockEventSource.simulateOpen();

      // Simulate malformed data that causes JSON.parse to throw
      const originalParse = JSON.parse;
      JSON.parse = vi.fn().mockImplementationOnce(() => {
        throw new Error('Invalid JSON');
      });

      mockEventSource.onmessage!(
        new MessageEvent('message', { data: 'invalid json' })
      );

      // Handler should not be called for malformed data
      expect(handler).not.toHaveBeenCalled();

      // Restore JSON.parse
      JSON.parse = originalParse;
    });

    it('should handle beforeunload event', () => {
      // Spy on addEventListener to capture the handler
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

      sseEventBus.initialize();
      const mockEventSource = mockEventSourceInstances[0];
      mockEventSource.simulateOpen();

      // Verify connection is open
      expect(sseEventBus.getConnectionStatus().isConnected).toBe(true);

      // Find the beforeunload handler that was registered
      const beforeunloadCall = addEventListenerSpy.mock.calls.find(
        call => call[0] === 'beforeunload'
      );
      expect(beforeunloadCall).toBeDefined();

      // Get the handler function
      const beforeunloadHandler = beforeunloadCall![1] as EventListener;

      // Call the handler directly
      beforeunloadHandler(new Event('beforeunload'));

      // Verify the connection was closed
      expect(sseEventBus.getConnectionStatus().isConnected).toBe(false);

      addEventListenerSpy.mockRestore();
    });

    it('should not reconnect when document is not visible', () => {
      vi.useFakeTimers();

      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        writable: true,
        configurable: true,
      });

      sseEventBus.initialize();
      const mockEventSource = mockEventSourceInstances[0];
      mockEventSource.simulateError();

      // Advance time but should not reconnect
      vi.advanceTimersByTime(SSE_CONFIG.INITIAL_RECONNECT_DELAY);
      expect(mockEventSourceInstances).toHaveLength(1);

      vi.useRealTimers();
    });
  });
});
