/**
 * Mock EventSource implementation for testing with Vitest
 * Simulates browser EventSource API behavior
 */

import { EVENT_SOURCE_STATE } from '../constants/sse.constants';
import { vi } from 'vitest';

export class MockEventSource implements EventSource {
  static readonly CONNECTING = EVENT_SOURCE_STATE.CONNECTING;
  static readonly OPEN = EVENT_SOURCE_STATE.OPEN;
  static readonly CLOSED = EVENT_SOURCE_STATE.CLOSED;

  readonly url: string;
  readyState: number = MockEventSource.CONNECTING;
  readonly withCredentials = false;

  // Event handlers
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  // Track event listeners with their options for proper cleanup
  private eventListeners: Map<
    string,
    Map<
      EventListenerOrEventListenerObject,
      { capture?: boolean; once?: boolean; passive?: boolean }
    >
  > = new Map();

  // Connection simulation controls
  private connectionTimer: NodeJS.Timeout | null = null;
  private isManuallyControlled = false;

  constructor(url: string, eventSourceInitDict?: EventSourceInit) {
    this.url = url;
    this.withCredentials = eventSourceInitDict?.withCredentials ?? false;

    // Simulate async connection unless manually controlled
    if (!this.isManuallyControlled) {
      this.connectionTimer = setTimeout(() => this.simulateOpen(), 0);
    }
  }

  /**
   * Simulate successful connection
   */
  simulateOpen(): void {
    if (this.readyState === MockEventSource.CLOSED) {
      return; // Cannot open a closed connection
    }

    this.readyState = MockEventSource.OPEN;
    const event = new Event('open');
    // Only dispatch the event - dispatchEvent will call onopen
    this.dispatchEvent(event);
  }

  /**
   * Simulate receiving a message
   */
  simulateMessage(data: unknown): void {
    if (this.readyState !== MockEventSource.OPEN) {
      throw new Error('Cannot send message on a connection that is not open');
    }

    // Handle relative URLs for testing
    let origin = '';
    try {
      origin = new URL(this.url, 'http://localhost').origin;
    } catch {
      origin = 'http://localhost';
    }

    const messageEvent = new MessageEvent('message', {
      data: typeof data === 'string' ? data : JSON.stringify(data),
      origin,
      lastEventId: '',
    });

    // Only dispatch the event - dispatchEvent will call onmessage
    this.dispatchEvent(messageEvent);
  }

  /**
   * Simulate an error
   */
  simulateError(closeConnection = true): void {
    const event = new Event('error');

    if (closeConnection) {
      this.readyState = MockEventSource.CLOSED;
    }

    // Only dispatch the event - dispatchEvent will call onerror
    this.dispatchEvent(event);
  }

  /**
   * Close the connection
   */
  close(): void {
    if (this.connectionTimer) {
      clearTimeout(this.connectionTimer);
      this.connectionTimer = null;
    }

    this.readyState = MockEventSource.CLOSED;
    this.eventListeners.clear();
  }

  /**
   * Enable manual control (disable auto-connection)
   */
  enableManualControl(): void {
    this.isManuallyControlled = true;
    if (this.connectionTimer) {
      clearTimeout(this.connectionTimer);
      this.connectionTimer = null;
    }
  }

  /**
   * addEventListener implementation
   */
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions
  ): void {
    if (!listener) {
      return;
    }

    // Extract capture option for proper event listener tracking
    const capture =
      typeof options === 'boolean' ? options : (options?.capture ?? false);

    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, new Map());
    }

    // Store listener with its options
    this.eventListeners.get(type)!.set(listener, { capture });
  }

  /**
   * removeEventListener implementation
   */
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions
  ): void {
    if (!listener) {
      return;
    }

    // Extract capture option to match listener removal correctly
    const capture =
      typeof options === 'boolean' ? options : (options?.capture ?? false);

    const listeners = this.eventListeners.get(type);
    if (listeners) {
      // Find and remove listener with matching capture option
      for (const [storedListener, storedOptions] of listeners.entries()) {
        if (storedListener === listener && storedOptions.capture === capture) {
          listeners.delete(storedListener);
          break;
        }
      }
      if (listeners.size === 0) {
        this.eventListeners.delete(type);
      }
    }
  }

  /**
   * dispatchEvent implementation
   */
  dispatchEvent(event: Event): boolean {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      // Dispatch to all registered listeners regardless of capture phase
      // (EventSource doesn't support capture phase, but we track it for API compatibility)
      listeners.forEach((options, listener) => {
        if (typeof listener === 'function') {
          listener(event);
        } else if (listener && typeof listener.handleEvent === 'function') {
          listener.handleEvent(event);
        }
      });
    }

    // Also call direct event handlers
    switch (event.type) {
      case 'open':
        this.onopen?.(event);
        break;
      case 'message':
        this.onmessage?.(event as MessageEvent);
        break;
      case 'error':
        this.onerror?.(event);
        break;
    }

    return !event.defaultPrevented;
  }

  /**
   * Helper to simulate a series of messages with delays
   */
  async simulateMessageStream(
    messages: unknown[],
    delayMs = 50
  ): Promise<void> {
    for (const message of messages) {
      this.simulateMessage(message);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  /**
   * Helper to get current event listener count
   */
  getEventListenerCount(type?: string): number {
    if (type) {
      return this.eventListeners.get(type)?.size ?? 0;
    }

    let total = 0;
    this.eventListeners.forEach(listeners => {
      total += listeners.size;
    });
    return total;
  }
}

/**
 * Factory function to create controlled mock EventSource
 */
export function createMockEventSource(url: string): MockEventSource {
  const mock = new MockEventSource(url);
  mock.enableManualControl();
  return mock;
}

/**
 * Create a Vitest mock for EventSource
 */
export function createEventSourceMock() {
  return vi.fn().mockImplementation((url: string) => new MockEventSource(url));
}

/**
 * Setup global EventSource mock for Vitest
 * Usage: vi.stubGlobal('EventSource', MockEventSource)
 */
export function getEventSourceMockClass() {
  return MockEventSource;
}
