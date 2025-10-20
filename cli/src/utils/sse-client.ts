/**
 * SSE Client for MindStrike Event Bus
 *
 * Subscribes to Server-Sent Events for real-time streaming updates.
 */

import EventSource from 'eventsource';

const SSE_URL = 'http://localhost:3001/api/events/stream';

export interface SSEEvent {
  type: string;
  data: unknown;
  timestamp: number;
  streamId?: string;
  workflowId?: string;
  threadId?: string;
}

export type EventHandler = (event: SSEEvent) => void;

export class SSEClient {
  private eventSource: EventSource | null = null;
  private handlers: Map<string, EventHandler[]> = new Map();

  connect(clientId?: string): void {
    const url = clientId ? `${SSE_URL}?clientId=${clientId}` : SSE_URL;

    this.eventSource = new EventSource(url);

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as SSEEvent;
        this.broadcast(data);
      } catch (error) {
        console.error('Failed to parse SSE event:', error);
      }
    };

    this.eventSource.onerror = () => {
      console.error('SSE connection error');
    };
  }

  subscribe(eventType: string, handler: EventHandler): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }

    const handlers = this.handlers.get(eventType);
    if (handlers) {
      handlers.push(handler);
    }

    // Return unsubscribe function
    return () => {
      const handlers = this.handlers.get(eventType);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index !== -1) {
          handlers.splice(index, 1);
        }
      }
    };
  }

  private broadcast(event: SSEEvent): void {
    const handlers = this.handlers.get(event.type);
    if (handlers) {
      handlers.forEach((handler) => handler(event));
    }
  }

  close(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.handlers.clear();
  }

  isConnected(): boolean {
    return this.eventSource !== null && this.eventSource.readyState === EventSource.OPEN;
  }
}

export const sseClient = new SSEClient();
