import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as path from 'path';
import * as fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

// Thread and message interfaces
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  threadId: string;
  model?: string;
  status?: 'processing' | 'completed' | 'cancelled';
  metadata?: Record<string, unknown>;
}

interface Thread {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  messages: Message[];
  customPrompt?: string;
  metadata?: Record<string, unknown>;
}

interface ConversationResult {
  threadId: string;
  messages: Message[];
  metadata: Record<string, unknown>;
  hasMore?: boolean;
}

interface SendMessageResult {
  id: string;
  content: string;
  threadId: string;
  role: string;
  timestamp: Date;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private workspaceRoot: string;
  private chatsPath: string;
  private threads: Map<string, Thread> = new Map();
  private isLoaded = false;
  private savePromise: Promise<void> | null = null;

  constructor(
    private configService: ConfigService,
    private eventEmitter: EventEmitter2
  ) {
    this.workspaceRoot =
      this.configService?.get<string>('WORKSPACE_ROOT') ?? process.cwd();
    this.chatsPath = path.join(this.workspaceRoot, 'mindstrike-chats.json');
    this.loadThreads();
  }

  /**
   * Load threads from file
   */
  private async loadThreads(): Promise<void> {
    if (this.isLoaded) {
      return;
    }

    try {
      const data = await fs.readFile(this.chatsPath, 'utf-8');
      const threads: Thread[] = JSON.parse(data);

      this.threads.clear();
      threads.forEach(thread => {
        this.threads.set(thread.id, {
          ...thread,
          createdAt: new Date(thread.createdAt),
          updatedAt: new Date(thread.updatedAt),
          messages: thread.messages.map(msg => ({
            ...msg,
            timestamp: new Date(msg.timestamp),
          })),
        });
      });

      this.logger.log(`Loaded ${threads.length} threads`);
    } catch (error) {
      // File doesn't exist or is invalid - start with empty threads
      this.logger.debug('No threads file found, starting with empty threads');
      this.threads.clear();
    }

    this.isLoaded = true;
  }

  /**
   * Save threads to file
   */
  private async saveThreads(): Promise<void> {
    // Serialize save operations to prevent concurrent file writes
    if (this.savePromise) {
      await this.savePromise;
    }

    this.savePromise = this._performSave();
    await this.savePromise;
    this.savePromise = null;
  }

  private async _performSave(): Promise<void> {
    const threads = Array.from(this.threads.values());
    await fs.writeFile(
      this.chatsPath,
      JSON.stringify(threads, null, 2),
      'utf-8'
    );
    this.logger.debug(`Saved ${threads.length} threads to file`);
  }

  /**
   * Generate a title from messages using AI
   */
  async generateTitle(
    messages: Array<{ role: string; content: string }>
  ): Promise<string> {
    // For now, create a simple title based on the first user message
    // In production, this would call an LLM service
    const firstUserMessage = messages.find(m => m.role === 'user');
    if (!firstUserMessage) {
      return 'New Conversation';
    }

    // Simple title generation - take first 50 chars of first message
    const title = firstUserMessage.content
      .replace(/[\n\r]/g, ' ')
      .substring(0, 50)
      .trim();

    return title.length > 0 ? title : 'New Conversation';
  }

  /**
   * Generate a prompt based on context
   */
  async generatePrompt(context: string, type?: string): Promise<string> {
    // For now, return a formatted version of the context
    // In production, this would call an LLM service to generate an appropriate prompt
    if (!context) {
      throw new BadRequestException('Context is required');
    }

    const promptType = type || 'general';
    const prompts: Record<string, string> = {
      general: `You are a helpful assistant. ${context}`,
      coding: `You are an expert programmer. ${context}`,
      creative: `You are a creative writer. ${context}`,
      academic: `You are an academic researcher. ${context}`,
    };

    return prompts[promptType] || prompts.general;
  }

  /**
   * Get conversation by thread ID
   */
  async getConversation(
    threadId: string,
    limit?: number,
    offset?: number
  ): Promise<ConversationResult> {
    await this.loadThreads();

    const thread = this.threads.get(threadId);
    if (!thread) {
      throw new NotFoundException(`Thread ${threadId} not found`);
    }

    const start = offset || 0;
    const end = limit ? start + limit : undefined;
    const messages = thread.messages.slice(start, end);
    const hasMore = end ? thread.messages.length > end : false;

    return {
      threadId: thread.id,
      messages,
      metadata: thread.metadata || {},
      hasMore,
    };
  }

  /**
   * Send a message to a thread
   */
  async sendMessage(
    message: string,
    threadId: string
  ): Promise<SendMessageResult> {
    await this.loadThreads();

    let thread = this.threads.get(threadId);
    if (!thread) {
      // Create new thread if it doesn't exist
      thread = {
        id: threadId,
        name: 'New Conversation',
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: [],
        metadata: {},
      };
      this.threads.set(threadId, thread);
    }

    // Create the user message
    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content: message,
      timestamp: new Date(),
      threadId,
      status: 'completed',
    };

    thread.messages.push(userMessage);
    thread.updatedAt = new Date();

    // For now, create a simple response
    // In production, this would call an LLM service
    const assistantMessage: Message = {
      id: uuidv4(),
      role: 'assistant',
      content: `I received your message: "${message}". This is a placeholder response.`,
      timestamp: new Date(),
      threadId,
      status: 'completed',
    };

    thread.messages.push(assistantMessage);
    await this.saveThreads();

    // Emit event for real-time updates
    this.eventEmitter.emit('message.sent', assistantMessage);

    return {
      id: assistantMessage.id,
      content: assistantMessage.content,
      threadId,
      role: assistantMessage.role,
      timestamp: assistantMessage.timestamp,
    };
  }

  /**
   * Stream a message response
   */
  async streamMessage(message: string, threadId: string): Promise<void> {
    // Streaming implementation would integrate with SSE service
    // For now, just send a regular message
    await this.sendMessage(message, threadId);
  }

  /**
   * Cancel a message being processed
   */
  async cancelMessage(
    threadId: string,
    messageId?: string
  ): Promise<{ success: boolean }> {
    await this.loadThreads();

    const thread = this.threads.get(threadId);
    if (!thread) {
      throw new NotFoundException(`Thread ${threadId} not found`);
    }

    if (messageId) {
      const message = thread.messages.find(m => m.id === messageId);
      if (message && message.status === 'processing') {
        message.status = 'cancelled';
        await this.saveThreads();
        this.eventEmitter.emit('message.cancelled', { threadId, messageId });
      }
    }

    return { success: true };
  }

  /**
   * Delete a message from a thread
   */
  async deleteMessage(messageId: string): Promise<{ success: boolean }> {
    await this.loadThreads();

    // Find the thread containing this message
    for (const [threadId, thread] of this.threads.entries()) {
      const messageIndex = thread.messages.findIndex(m => m.id === messageId);
      if (messageIndex !== -1) {
        thread.messages.splice(messageIndex, 1);
        thread.updatedAt = new Date();
        await this.saveThreads();

        this.eventEmitter.emit('message.deleted', { threadId, messageId });
        this.logger.log(`Deleted message ${messageId} from thread ${threadId}`);
        return { success: true };
      }
    }

    throw new NotFoundException(`Message ${messageId} not found`);
  }

  /**
   * Load a thread with messages
   */
  async loadThread(
    threadId: string,
    limit?: number,
    offset?: number
  ): Promise<ConversationResult> {
    return this.getConversation(threadId, limit, offset);
  }

  /**
   * Get all threads
   */
  async getAllThreads(): Promise<
    Array<{
      id: string;
      name: string;
      createdAt: Date;
      updatedAt: Date;
      messageCount: number;
      customPrompt?: string;
    }>
  > {
    await this.loadThreads();

    return Array.from(this.threads.values())
      .map(thread => ({
        id: thread.id,
        name: thread.name,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
        messageCount: thread.messages.length,
        customPrompt: thread.customPrompt,
      }))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  /**
   * Create a new thread
   */
  async createThread(name: string, customPrompt?: string): Promise<Thread> {
    await this.loadThreads();

    const thread: Thread = {
      id: uuidv4(),
      name: name || 'New Conversation',
      createdAt: new Date(),
      updatedAt: new Date(),
      messages: [],
      customPrompt,
      metadata: {},
    };

    this.threads.set(thread.id, thread);
    await this.saveThreads();

    this.logger.log(`Created new thread: ${thread.id}`);
    return thread;
  }

  /**
   * Delete a thread
   */
  async deleteThread(threadId: string): Promise<{ success: boolean }> {
    await this.loadThreads();

    if (!this.threads.has(threadId)) {
      throw new NotFoundException(`Thread ${threadId} not found`);
    }

    this.threads.delete(threadId);
    await this.saveThreads();

    this.eventEmitter.emit('thread.deleted', { threadId });
    this.logger.log(`Deleted thread: ${threadId}`);

    return { success: true };
  }

  /**
   * Update thread metadata
   */
  async updateThread(
    threadId: string,
    updates: { name?: string; customPrompt?: string }
  ): Promise<Thread> {
    await this.loadThreads();

    const thread = this.threads.get(threadId);
    if (!thread) {
      throw new NotFoundException(`Thread ${threadId} not found`);
    }

    if (updates.name !== undefined) {
      thread.name = updates.name;
    }
    if (updates.customPrompt !== undefined) {
      thread.customPrompt = updates.customPrompt;
    }

    thread.updatedAt = new Date();
    await this.saveThreads();

    this.logger.log(`Updated thread: ${threadId}`);
    return thread;
  }

  /**
   * Clear all messages in a thread
   */
  async clearThread(threadId: string): Promise<{ success: boolean }> {
    await this.loadThreads();

    const thread = this.threads.get(threadId);
    if (!thread) {
      throw new NotFoundException(`Thread ${threadId} not found`);
    }

    thread.messages = [];
    thread.updatedAt = new Date();
    await this.saveThreads();

    this.eventEmitter.emit('thread.cleared', { threadId });
    this.logger.log(`Cleared thread: ${threadId}`);

    return { success: true };
  }
}
