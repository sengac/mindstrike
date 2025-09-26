import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Response } from 'express';

export enum SSEEventType {
  CONNECTED = 'connected',
  MESSAGE = 'message',
  ERROR = 'error',
  THREAD_UPDATE = 'thread_update',
  MODEL_UPDATE = 'model_update',
  TASK_UPDATE = 'task_update',
  WORKFLOW_UPDATE = 'workflow_update',
  DEBUG = 'debug',
}

interface SSEClient {
  id: string;
  response: Response;
  topic: string;
  keepaliveInterval?: NodeJS.Timeout;
}

@Injectable()
export class SseService implements OnModuleDestroy {
  private readonly logger = new Logger(SseService.name);
  private readonly clients: Map<string, SSEClient> = new Map();
  private readonly clientsByTopic: Map<string, Set<string>> = new Map();
  private readonly largeContentStore: Map<string, string> = new Map();
  private readonly KEEPALIVE_INTERVAL = 30000; // 30 seconds
  private readonly LARGE_CONTENT_CLEANUP = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_STRING_SIZE = 100000000; // 100MB

  onModuleDestroy() {
    // Clean up all clients and intervals on module destroy
    for (const client of this.clients.values()) {
      if (client.keepaliveInterval) {
        clearInterval(client.keepaliveInterval);
      }
      try {
        client.response.end();
      } catch {
        // Ignore errors during cleanup
      }
    }
    this.clients.clear();
    this.clientsByTopic.clear();
    this.largeContentStore.clear();
  }

  addClient(id: string, response: Response, topic: string): void {
    // Set up SSE headers
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    });

    // Send initial connection message
    response.write(
      `data: ${JSON.stringify({
        type: SSEEventType.CONNECTED,
        timestamp: Date.now(),
      })}\n\n`
    );

    // Setup keepalive interval
    const keepaliveInterval = setInterval(() => {
      if (this.clients.has(id)) {
        try {
          response.write(`: keepalive ${Date.now()}\n\n`);
        } catch {
          this.logger.debug(`Failed to send keepalive to client ${id}`);
          this.removeClient(id);
        }
      } else {
        clearInterval(keepaliveInterval);
      }
    }, this.KEEPALIVE_INTERVAL);

    const client: SSEClient = { id, response, topic, keepaliveInterval };
    this.clients.set(id, client);

    // Add to topic mapping
    if (!this.clientsByTopic.has(topic)) {
      this.clientsByTopic.set(topic, new Set());
    }
    this.clientsByTopic.get(topic)!.add(id);

    // Handle client disconnect
    response.on('close', () => {
      this.removeClient(id);
    });

    response.on('error', error => {
      this.logger.error(`SSE client ${id} error:`, error);
      this.removeClient(id);
    });

    this.logger.log(`SSE client ${id} connected to topic ${topic}`);
  }

  removeClient(id: string): void {
    const client = this.clients.get(id);
    if (client) {
      // Clear keepalive interval
      if (client.keepaliveInterval) {
        clearInterval(client.keepaliveInterval);
      }

      this.clients.delete(id);

      // Remove from topic mapping
      const topicClients = this.clientsByTopic.get(client.topic);
      if (topicClients) {
        topicClients.delete(id);
        if (topicClients.size === 0) {
          this.clientsByTopic.delete(client.topic);
        }
      }

      this.logger.debug(
        `SSE client ${id} disconnected from topic ${client.topic}`
      );
    }
  }

  private safeStringify(data: unknown): string {
    try {
      const sanitized = this.sanitizeData(data);
      const result = JSON.stringify(sanitized);
      // Verify the JSON can be parsed back
      JSON.parse(result);
      return result;
    } catch (error) {
      this.logger.error('Failed to stringify SSE data:', error);

      if (typeof data === 'object' && data !== null) {
        this.logger.error(
          'Problematic data type:',
          data.constructor?.name || 'Unknown'
        );
        this.logger.error('Data keys:', Object.keys(data).slice(0, 10));
      }

      // Return a safe fallback
      return JSON.stringify({
        error: 'Failed to serialize data',
        type: typeof data,
        length: typeof data === 'string' ? data.length : 'unknown',
      });
    }
  }

  private sanitizeData(obj: unknown, depth = 0, maxDepth = 10): unknown {
    if (depth > maxDepth) {
      return '[Max depth reached]';
    }

    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      // For very large strings, store them separately
      if (obj.length > this.MAX_STRING_SIZE) {
        const contentId =
          Date.now().toString(36) + Math.random().toString(36).substr(2);
        this.storeLargeContent(contentId, obj);
        return {
          _large_content: true,
          contentId: contentId,
          length: obj.length,
        };
      }

      // Base64 encode strings to prevent JSON parsing issues
      return {
        _base64: true,
        data: Buffer.from(obj, 'utf8').toString('base64'),
      };
    }

    if (typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeData(item, depth + 1, maxDepth));
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = this.sanitizeData(value, depth + 1, maxDepth);
    }
    return result;
  }

  private storeLargeContent(contentId: string, content: string): void {
    this.largeContentStore.set(contentId, content);
    // Clean up old content after 5 minutes
    setTimeout(() => {
      this.largeContentStore.delete(contentId);
    }, this.LARGE_CONTENT_CLEANUP);
  }

  getLargeContent(contentId: string): string | undefined {
    return this.largeContentStore.get(contentId);
  }

  private sendToClients(topicClients: Set<string>, message: string): void {
    const disconnectedClients: string[] = [];

    for (const clientId of topicClients) {
      const client = this.clients.get(clientId);
      if (client) {
        try {
          client.response.write(message);
        } catch (error) {
          this.logger.error(
            `Failed to send SSE message to client ${clientId}:`,
            error
          );
          disconnectedClients.push(clientId);
        }
      }
    }

    // Clean up disconnected clients
    for (const clientId of disconnectedClients) {
      this.removeClient(clientId);
    }
  }

  broadcast(topic: string, data: unknown): void {
    const topicClients = this.clientsByTopic.get(topic);
    if (!topicClients || topicClients.size === 0) {
      return;
    }

    const jsonString = this.safeStringify(data);
    const message = `data: ${jsonString}\n\n`;
    this.sendToClients(topicClients, message);

    this.logger.debug(
      `Broadcasted to ${topicClients.size} clients on topic ${topic}`
    );
  }

  sendToClient(clientId: string, data: unknown): void {
    const client = this.clients.get(clientId);
    if (client) {
      const jsonString = this.safeStringify(data);
      const message = `data: ${jsonString}\n\n`;
      try {
        client.response.write(message);
      } catch (error) {
        this.logger.error(
          `Failed to send SSE message to client ${clientId}:`,
          error
        );
        this.removeClient(clientId);
      }
    }
  }

  getClientCount(topic?: string): number {
    if (topic) {
      return this.clientsByTopic.get(topic)?.size ?? 0;
    }
    return this.clients.size;
  }

  getTopics(): string[] {
    return Array.from(this.clientsByTopic.keys());
  }

  getClients(topic?: string): string[] {
    if (topic) {
      const topicClients = this.clientsByTopic.get(topic);
      return topicClients ? Array.from(topicClients) : [];
    }
    return Array.from(this.clients.keys());
  }
}
