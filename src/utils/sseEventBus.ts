import { decodeSseDataSync } from './sseDecoder';

export interface SSEEvent {
  type: string;
  data: any;
  timestamp: number;
  streamId?: string;
  workflowId?: string;
}

type EventHandler = (event: SSEEvent) => void;

class SSEEventBus {
  private eventSource: EventSource | null = null;
  private subscribers: Map<string, Set<EventHandler>> = new Map();
  private connectionStatusSubscribers: Set<(status: boolean) => void> = new Set();
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;

  constructor() {
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.handleBeforeUnload = this.handleBeforeUnload.bind(this);
  }

  /**
   * Initialize the single SSE connection
   */
  initialize(): void {
    if (this.eventSource || typeof window === 'undefined') {
      return; // Already initialized or not in browser
    }

    console.log('[SSEEventBus] Initializing single SSE connection');
    this.connect();

    // Handle page visibility changes
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('beforeunload', this.handleBeforeUnload);
  }

  /**
   * Connect to the SSE endpoint
   */
  private connect(): void {
    if (this.eventSource) {
      this.eventSource.close();
    }

    this.eventSource = new EventSource('/api/events/stream');

    this.eventSource.onopen = () => {
      console.log('[SSEEventBus] Connection established');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.notifyConnectionStatusChange(true);
    };

    this.eventSource.onmessage = (event) => {
      try {
        const rawData = JSON.parse(event.data);
        const data = decodeSseDataSync(rawData);
        
        const sseEvent: SSEEvent = {
          type: (data && typeof data === 'object' && 'type' in data && typeof data.type === 'string') ? data.type : 'unknown',
          data: data,
          timestamp: Date.now(),
          streamId: (data && typeof data === 'object' && 'streamId' in data && typeof data.streamId === 'string') ? data.streamId : undefined,
          workflowId: (data && typeof data === 'object' && 'workflowId' in data && typeof data.workflowId === 'string') ? data.workflowId : undefined
        };

        console.log('[SSEEventBus] Received event:', sseEvent.type, 'streamId:', sseEvent.streamId, 'data:', sseEvent.data);
        this.broadcast(sseEvent);
      } catch (error) {
        console.error('[SSEEventBus] Error parsing event:', error);
      }
    };

    this.eventSource.onerror = (error) => {
      console.error('[SSEEventBus] Connection error:', error);
      this.isConnected = false;
      this.notifyConnectionStatusChange(false);

      if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = null;
      }

      this.scheduleReconnect();
    };
  }

  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[SSEEventBus] Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff

    console.log(`[SSEEventBus] Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);
    
    setTimeout(() => {
      if (!this.isConnected && document.visibilityState === 'visible') {
        console.log('[SSEEventBus] Attempting to reconnect...');
        this.connect();
      }
    }, delay);
  }

  /**
   * Subscribe to specific event types
   */
  subscribe(eventType: string, handler: EventHandler): () => void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }
    
    this.subscribers.get(eventType)!.add(handler);
    console.log(`[SSEEventBus] Subscribed to ${eventType} (${this.subscribers.get(eventType)!.size} total subscribers)`);

    // Return unsubscribe function
    return () => {
      const handlers = this.subscribers.get(eventType);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.subscribers.delete(eventType);
        }
        console.log(`[SSEEventBus] Unsubscribed from ${eventType}`);
      }
    };
  }

  /**
   * Broadcast event to all subscribers of that event type
   */
  private broadcast(event: SSEEvent): void {
    const handlers = this.subscribers.get(event.type);
    if (handlers && handlers.size > 0) {
      console.log(`[SSEEventBus] Broadcasting ${event.type} to ${handlers.size} subscribers`);
      handlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          console.error(`[SSEEventBus] Error in event handler for ${event.type}:`, error);
        }
      });
    }
  }

  /**
   * Handle browser visibility changes
   */
  private handleVisibilityChange(): void {
    if (document.visibilityState === 'visible') {
      if (!this.isConnected && this.eventSource?.readyState !== EventSource.CONNECTING) {
        console.log('[SSEEventBus] Page became visible, reconnecting...');
        this.connect();
      }
    } else {
      console.log('[SSEEventBus] Page became hidden');
    }
  }

  /**
   * Handle page unload
   */
  private handleBeforeUnload(): void {
    this.disconnect();
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    console.log('[SSEEventBus] Disconnecting');
    
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    
    this.isConnected = false;
    this.subscribers.clear();
    
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
  }

  /**
   * Notify connection status subscribers
   */
  private notifyConnectionStatusChange(isConnected: boolean): void {
    this.connectionStatusSubscribers.forEach(callback => {
      try {
        callback(isConnected);
      } catch (error) {
        console.error('[SSEEventBus] Error in connection status callback:', error);
      }
    });
  }

  /**
   * Subscribe to connection status changes
   */
  subscribeToConnectionStatus(callback: (isConnected: boolean) => void): () => void {
    this.connectionStatusSubscribers.add(callback);
    
    // Immediately call with current status
    callback(this.isConnected);
    
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
    const subscriberCount = Array.from(this.subscribers.values())
      .reduce((total, handlers) => total + handlers.size, 0);
    
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      subscriberCount
    };
  }
}

// Export singleton instance
export const sseEventBus = new SSEEventBus();
