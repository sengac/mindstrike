/**
 * Mock SSEEventBus implementation for testing with Vitest
 * Provides a controllable mock for SSE event simulation
 */

import { vi } from 'vitest';
import type { SSEEvent } from '../utils/sseEventBus';

type EventHandler = (event: SSEEvent) => void;
type ConnectionStatusHandler = (status: boolean) => void;

export class MockSSEEventBus {
  private subscribers = new Map<string, Set<EventHandler>>();
  private connectionStatusSubscribers = new Set<ConnectionStatusHandler>();
  private _isConnected = false;
  private _reconnectAttempts = 0;
  private _subscriberCount = 0;

  // Mock functions that can be spied on
  initialize = vi.fn();
  connect = vi.fn();
  disconnect = vi.fn();

  /**
   * Subscribe to specific event types
   */
  subscribe(eventType: string, handler: EventHandler): () => void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }

    this.subscribers.get(eventType)!.add(handler);
    this._subscriberCount++;

    // Return unsubscribe function
    return () => {
      const handlers = this.subscribers.get(eventType);
      if (handlers) {
        handlers.delete(handler);
        this._subscriberCount--;
        if (handlers.size === 0) {
          this.subscribers.delete(eventType);
        }
      }
    };
  }

  /**
   * Subscribe to connection status changes
   */
  subscribeToConnectionStatus(callback: ConnectionStatusHandler): () => void {
    this.connectionStatusSubscribers.add(callback);

    // Immediately call with current status
    callback(this._isConnected);

    // Return unsubscribe function
    return () => {
      this.connectionStatusSubscribers.delete(callback);
    };
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): {
    isConnected: boolean;
    reconnectAttempts: number;
    subscriberCount: number;
  } {
    return {
      isConnected: this._isConnected,
      reconnectAttempts: this._reconnectAttempts,
      subscriberCount: this._subscriberCount,
    };
  }

  /**
   * Simulate emitting an event (for testing)
   */
  emit(eventType: string, data: unknown, options?: Partial<SSEEvent>): void {
    const event: SSEEvent = {
      type: eventType,
      data,
      timestamp: Date.now(),
      ...options,
    };

    // Send to specific event type subscribers
    const handlers = this.subscribers.get(eventType);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          console.error(`Error in mock event handler for ${eventType}:`, error);
        }
      });
    }

    // Send to wildcard subscribers
    const wildcardHandlers = this.subscribers.get('*');
    if (wildcardHandlers) {
      wildcardHandlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          console.error(
            `Error in mock wildcard handler for ${eventType}:`,
            error
          );
        }
      });
    }
  }

  /**
   * Simulate connection state change (for testing)
   */
  simulateConnectionChange(isConnected: boolean): void {
    this._isConnected = isConnected;
    this.connectionStatusSubscribers.forEach(callback => {
      try {
        callback(isConnected);
      } catch (error) {
        console.error('Error in connection status callback:', error);
      }
    });
  }

  /**
   * Simulate reconnect attempts (for testing)
   */
  simulateReconnectAttempt(): void {
    this._reconnectAttempts++;
  }

  /**
   * Reset mock state
   */
  reset(): void {
    this.subscribers.clear();
    this.connectionStatusSubscribers.clear();
    this._isConnected = false;
    this._reconnectAttempts = 0;
    this._subscriberCount = 0;
    this.initialize.mockClear();
    this.connect.mockClear();
    this.disconnect.mockClear();
  }

  /**
   * Get subscriber count for a specific event type
   */
  getSubscriberCount(eventType?: string): number {
    if (eventType) {
      return this.subscribers.get(eventType)?.size ?? 0;
    }
    return this._subscriberCount;
  }

  /**
   * Check if there are subscribers for an event type
   */
  hasSubscribers(eventType: string): boolean {
    return (
      this.subscribers.has(eventType) &&
      this.subscribers.get(eventType)!.size > 0
    );
  }

  /**
   * Simulate a series of events with delays
   */
  async simulateEventStream(
    events: Array<{ type: string; data: unknown; delay?: number }>,
    defaultDelay = 50
  ): Promise<void> {
    for (const { type, data, delay } of events) {
      this.emit(type, data);
      await new Promise(resolve => setTimeout(resolve, delay ?? defaultDelay));
    }
  }
}

/**
 * Create a mock SSE event bus instance
 */
export function createMockSSEEventBus(): MockSSEEventBus {
  return new MockSSEEventBus();
}

/**
 * Create a Vitest mock module for sseEventBus
 * Usage: vi.mock('../utils/sseEventBus', () => ({ sseEventBus: createMockSSEEventBus() }))
 */
export function createSSEEventBusMock() {
  return {
    sseEventBus: createMockSSEEventBus(),
  };
}
