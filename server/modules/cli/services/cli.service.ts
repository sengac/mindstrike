/**
 * CLI Service
 *
 * Business logic for CLI operations
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { SseService, SSEEventType } from '../../events/services/sse.service';
import { MindmapService, type MindMapNode, type MindMapEdge } from '../../mindmap/mindmap.service';
import { ChatService } from '../../chat/chat.service';
import type {
  SelectNodeResponseDto,
  CreateNodeResponseDto,
  GetMindmapResponseDto,
  SendMessageResponseDto
} from '../dto/cli.dto';

@Injectable()
export class CliService {
  private readonly logger = new Logger(CliService.name);

  constructor(
    private readonly sseService: SseService,
    private readonly mindmapService: MindmapService,
    private readonly chatService: ChatService
  ) {}

  async selectNode(nodeId: string): Promise<SelectNodeResponseDto> {
    this.logger.log(`Selecting node: ${nodeId}`);

    // Broadcast event to all clients (frontend + CLI)
    this.sseService.broadcast('unified-events', {
      type: 'mindmap_update',
      action: 'node_selected',
      nodeId,
      timestamp: Date.now()
    });

    return {
      success: true,
      nodeId,
      timestamp: Date.now()
    };
  }

  async createNode(label: string, parentId?: string): Promise<CreateNodeResponseDto> {
    this.logger.log(`Creating node: ${label}, parent: ${parentId}`);

    const nodeId = `node-${uuidv4()}`;

    // Get all mindmaps
    const mindmaps = await this.mindmapService.getAllMindmaps();

    if (mindmaps.length === 0) {
      throw new NotFoundException('No mindmaps found. Create a mindmap first.');
    }

    // Use first mindmap (or implement logic to select active mindmap)
    const mindmap = mindmaps[0];

    // Create new node
    const newNode: MindMapNode = {
      id: nodeId,
      type: 'default',
      data: {
        label
      },
      position: {
        x: Math.random() * 500,
        y: Math.random() * 500
      }
    };

    mindmap.nodes.push(newNode);

    // Create edge if parent specified
    if (parentId) {
      const parentExists = mindmap.nodes.some(n => n.id === parentId);
      if (!parentExists) {
        throw new NotFoundException(`Parent node ${parentId} not found`);
      }

      const newEdge: MindMapEdge = {
        id: `edge-${uuidv4()}`,
        source: parentId,
        target: nodeId,
        type: 'default'
      };

      mindmap.edges.push(newEdge);
    }

    // Save mindmap
    await this.mindmapService.saveMindmap(mindmap.id, mindmap);

    // Broadcast event
    this.sseService.broadcast('unified-events', {
      type: 'mindmap_update',
      action: 'node_created',
      nodeId,
      parentId,
      label,
      timestamp: Date.now()
    });

    return {
      success: true,
      nodeId,
      label,
      parentId,
      timestamp: Date.now()
    };
  }

  async getMindmap(): Promise<GetMindmapResponseDto> {
    this.logger.log('Querying mindmap');

    const mindmaps = await this.mindmapService.getAllMindmaps();

    if (mindmaps.length === 0) {
      // Return empty mindmap structure
      return {
        nodes: [],
        edges: [],
        metadata: {
          title: 'Empty Mindmap'
        }
      };
    }

    // Use first mindmap
    const mindmap = mindmaps[0];

    // Transform tree structure to flat nodes/edges arrays
    const nodes: Array<{ id: string; label: string; position: { x: number; y: number }; data?: unknown }> = [];
    const edges: Array<{ id: string; source: string; target: string; label?: string }> = [];

    // Recursively flatten tree structure
    const flattenNode = (node: any, parentId?: string, depth: number = 0, index: number = 0): void => {
      if (!node) {
        return;
      }

      // Add node to array
      nodes.push({
        id: node.id,
        label: node.text || node.id,
        position: { x: depth * 200, y: index * 100 },
        data: { chatId: node.chatId, notes: node.notes }
      });

      // Add edge from parent
      if (parentId) {
        edges.push({
          id: `edge-${parentId}-${node.id}`,
          source: parentId,
          target: node.id
        });
      }

      // Process children
      if (node.children && Array.isArray(node.children)) {
        node.children.forEach((child: any, idx: number) => {
          flattenNode(child, node.id, depth + 1, idx);
        });
      }
    };

    // Start flattening from root
    if (mindmap.mindmapData && mindmap.mindmapData.root) {
      flattenNode(mindmap.mindmapData.root);
    }

    return {
      nodes,
      edges,
      metadata: {
        title: mindmap.name || 'Untitled',
        created: mindmap.createdAt ? (typeof mindmap.createdAt === 'string' ? mindmap.createdAt : mindmap.createdAt.toISOString()) : undefined,
        modified: mindmap.updatedAt ? (typeof mindmap.updatedAt === 'string' ? mindmap.updatedAt : mindmap.updatedAt.toISOString()) : undefined
      }
    };
  }

  async sendMessage(message: string, clientId?: string): Promise<SendMessageResponseDto> {
    this.logger.log(`Sending message: ${message.substring(0, 50)}...`);

    // Get or create active thread
    const threads = await this.chatService.getAllThreads();
    let activeThread = threads.find(t => t.messages.length > 0) || threads[0];

    if (!activeThread) {
      // Create new thread
      activeThread = await this.chatService.createThread('CLI Chat');
    }

    const threadId = activeThread.id;
    const messageId = `msg-${uuidv4()}`;

    // Send message using chat service
    const result = await this.chatService.sendMessage(threadId, message);

    // Broadcast message event
    this.sseService.broadcast('unified-events', {
      type: SSEEventType.MESSAGE,
      data: {
        threadId,
        messageId: result.id,
        content: message,
        role: 'user'
      },
      timestamp: Date.now()
    });

    return {
      success: true,
      messageId: result.id,
      threadId,
      timestamp: Date.now()
    };
  }
}
