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

  addClient(id: string, response: Response, topic: string): void {
    // Set up SSE headers
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Send initial connection message
    response.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`);

    const client: SSEClient = { id, response, topic };
    this.clients.set(id, client);

    // Add to topic mapping
    if (!this.clientsByTopic.has(topic)) {
      this.clientsByTopic.set(topic, new Set());
    }
    this.clientsByTopic.get(topic)!.add(id);

    logger.info(`SSE client ${id} connected to topic ${topic}`);

    // Handle client disconnect
    response.on('close', () => {
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

      logger.info(`SSE client ${id} disconnected from topic ${client.topic}`);
    }
  }

  broadcast(topic: string, data: any): void {
    const topicClients = this.clientsByTopic.get(topic);
    if (!topicClients) {
      return;
    }

    const message = `data: ${JSON.stringify(data)}\n\n`;
    const disconnectedClients: string[] = [];

    for (const clientId of topicClients) {
      const client = this.clients.get(clientId);
      if (client) {
        try {
          client.response.write(message);
        } catch (error) {
          logger.error(`Failed to send SSE message to client ${clientId}:`, error);
          disconnectedClients.push(clientId);
        }
      }
    }

    // Clean up disconnected clients
    disconnectedClients.forEach(clientId => this.removeClient(clientId));

    if (topicClients.size > 0) {
      logger.debug(`Broadcasted to ${topicClients.size} clients on topic ${topic}:`, data);
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
