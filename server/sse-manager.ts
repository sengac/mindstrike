import { Response } from 'express';
import { logger } from './logger.js';

interface SSEClient {
  id: string;
  response: Response;
  topic: string;
}

class SSEManager {
  private clients: Map<string, SSEClient> = new Map();
  private clientsByTopic: Map<string, Set<string>> = new Map();
  private largeContentStore: Map<string, string> = new Map();

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
      `data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`
    );

    const client: SSEClient = { id, response, topic };
    this.clients.set(id, client);

    // Add to topic mapping
    if (!this.clientsByTopic.has(topic)) {
      this.clientsByTopic.set(topic, new Set());
    }
    this.clientsByTopic.get(topic)!.add(id);

    // Send periodic keepalive messages to prevent connection timeout
    const keepaliveInterval = setInterval(() => {
      if (this.clients.has(id)) {
        try {
          response.write(`: keepalive ${Date.now()}\n\n`);
        } catch (error) {
          logger.debug(`Failed to send keepalive to client ${id}:`, error);
          clearInterval(keepaliveInterval);
          this.removeClient(id);
        }
      } else {
        clearInterval(keepaliveInterval);
      }
    }, 30000); // Send keepalive every 30 seconds

    // Handle client disconnect
    response.on('close', () => {
      clearInterval(keepaliveInterval);
      this.removeClient(id);
    });

    response.on('error', error => {
      logger.error(`SSE client ${id} error:`, error);
      clearInterval(keepaliveInterval);
      this.removeClient(id);
    });
  }

  removeClient(id: string): void {
    const client = this.clients.get(id);
    if (client) {
      this.clients.delete(id);

      // Remove from topic mapping
      const topicClients = this.clientsByTopic.get(client.topic);
      if (topicClients) {
        topicClients.delete(id);
        if (topicClients.size === 0) {
          this.clientsByTopic.delete(client.topic);
        }
      }

      // Removed verbose logging - only log errors
    }
  }

  private safeStringify(data: unknown): string {
    try {
      // Clone and sanitize data to avoid circular references and large content
      const sanitized = this.sanitizeData(data);
      const result = JSON.stringify(sanitized);

      // Verify the JSON can be parsed back
      JSON.parse(result);
      return result;
    } catch (error) {
      logger.error('Failed to stringify SSE data:', error);
      logger.error(
        'Problematic data:',
        typeof data === 'object'
          ? JSON.stringify(data).substring(0, 1000)
          : String(data).substring(0, 1000)
      );

      // Return a safe fallback
      return JSON.stringify({
        error: 'Failed to serialize data',
        type: typeof data,
        length: typeof data === 'string' ? data.length : 'unknown',
      });
    }
  }

  private sanitizeData(obj: unknown, depth = 0, maxDepth = 10): unknown {
    // Prevent infinite recursion
    if (depth > maxDepth) {
      return '[Max depth reached]';
    }

    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      // For very large strings, store them separately and reference them
      if (obj.length > 100000000) {
        const contentId =
          Date.now().toString(36) + Math.random().toString(36).substr(2);
        this.storeLargeContent(contentId, obj);
        return {
          _large_content: true,
          contentId: contentId,
          length: obj.length,
        };
      }

      // Base64 encode smaller strings to prevent JSON parsing issues
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
    setTimeout(
      () => {
        this.largeContentStore.delete(contentId);
      },
      5 * 60 * 1000
    );
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
          logger.error(
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
    if (!topicClients) {
      return;
    }

    const jsonString = this.safeStringify(data);
    const message = `data: ${jsonString}\n\n`;
    this.sendToClients(topicClients, message);

    if (topicClients.size > 0) {
      logger.debug(
        `Broadcasted to ${topicClients.size} clients on topic ${topic}:`,
        data
      );
    }
  }

  getClientCount(topic?: string): number {
    if (topic) {
      return this.clientsByTopic.get(topic)?.size || 0;
    }
    return this.clients.size;
  }
}

export const sseManager = new SSEManager();
