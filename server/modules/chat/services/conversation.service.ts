import { Injectable, Logger } from '@nestjs/common';
import { GlobalConfigService } from '../../shared/services/global-config.service';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  ConversationMessage,
  Thread,
  ThreadMetadata,
} from '../types/conversation.types';

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);
  private readonly conversations: Map<string, Thread> = new Map();
  private isLoaded = false;
  private savePromise: Promise<void> | null = null;

  constructor(private readonly globalConfigService: GlobalConfigService) {}

  private getConversationsPath(): string {
    return path.join(
      this.globalConfigService.getWorkspaceRoot(),
      'mindstrike-chats.json'
    );
  }

  updateWorkspaceRoot(newWorkspaceRoot: string): void {
    // GlobalConfigService now handles the workspace root centrally
    // Just clear the cache since the path changed
    this.logger.log(`Workspace root updated, clearing conversation cache`);
    this.isLoaded = false;
    this.conversations.clear();
  }

  async load(): Promise<void> {
    if (this.isLoaded) {
      return;
    }

    try {
      const conversationsPath = this.getConversationsPath();
      const data = await fs.readFile(conversationsPath, 'utf-8');
      const threads: Thread[] = JSON.parse(data) as Thread[];

      this.conversations.clear();
      threads.forEach(thread => {
        this.conversations.set(thread.id, {
          ...thread,
          createdAt: new Date(thread.createdAt),
          updatedAt: new Date(thread.updatedAt),
          messages: thread.messages.map(msg => ({
            ...msg,
            timestamp: new Date(msg.timestamp),
          })),
        });
      });

      this.logger.log(`Loaded ${threads.length} conversations`);
    } catch (error) {
      // File doesn't exist or is invalid - start with empty conversations
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.logger.log('No existing conversations file, starting fresh');
      } else {
        this.logger.warn(
          'Failed to load conversations, starting fresh:',
          error
        );
      }
      this.conversations.clear();
    }

    this.isLoaded = true;
  }

  async save(): Promise<void> {
    // Ensure we've loaded before saving to prevent overwriting with empty data
    if (!this.isLoaded) {
      await this.load();
    }

    if (this.savePromise) {
      await this.savePromise;
    }

    this.savePromise = this._performSave();
    await this.savePromise;
    this.savePromise = null;
  }

  private async _performSave(): Promise<void> {
    const threads = Array.from(this.conversations.values());
    const conversationsPath = this.getConversationsPath();
    await fs.writeFile(conversationsPath, JSON.stringify(threads, null, 2));
  }

  async getThreadList(): Promise<ThreadMetadata[]> {
    // Ensure conversations are loaded
    if (!this.isLoaded) {
      await this.load();
    }

    return Array.from(this.conversations.values())
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

  getConversations(): Thread[] {
    return Array.from(this.conversations.values());
  }

  getThread(threadId: string): Thread | null {
    return this.conversations.get(threadId) ?? null;
  }

  getThreadMessages(threadId: string): ConversationMessage[] {
    const thread = this.conversations.get(threadId);
    return thread ? thread.messages : [];
  }

  async createThread(name?: string): Promise<Thread> {
    const thread: Thread = {
      id: Date.now().toString(),
      name: name ?? `Conversation ${this.conversations.size + 1}`,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.conversations.set(thread.id, thread);
    await this.save();
    this.logger.log(`Created new thread: ${thread.id}`);
    return thread;
  }

  async deleteThread(threadId: string): Promise<boolean> {
    const deleted = this.conversations.delete(threadId);
    if (deleted) {
      await this.save();
      this.logger.log(`Deleted thread: ${threadId}`);
    }
    return deleted;
  }

  async renameThread(threadId: string, newName: string): Promise<boolean> {
    const thread = this.conversations.get(threadId);
    if (thread) {
      thread.name = newName;
      thread.updatedAt = new Date();
      await this.save();
      this.logger.log(`Renamed thread ${threadId} to: ${newName}`);
      return true;
    }
    return false;
  }

  async updateThreadPrompt(
    threadId: string,
    customPrompt?: string | null
  ): Promise<boolean> {
    const thread = this.conversations.get(threadId);
    if (thread) {
      thread.customPrompt = customPrompt ?? undefined;
      thread.updatedAt = new Date();
      await this.save();
      this.logger.log(`Updated custom prompt for thread: ${threadId}`);
      return true;
    }
    return false;
  }

  async clearThread(threadId: string): Promise<boolean> {
    const thread = this.conversations.get(threadId);
    if (thread) {
      thread.messages = [];
      thread.updatedAt = new Date();
      await this.save();
      this.logger.log(`Cleared messages in thread: ${threadId}`);
      return true;
    }
    return false;
  }

  async addMessage(
    threadId: string,
    message: ConversationMessage
  ): Promise<void> {
    let thread = this.conversations.get(threadId);

    thread ??= await this.createThread();

    // Check if message with this ID already exists and update it instead
    const existingIndex = thread.messages.findIndex(m => m.id === message.id);
    if (existingIndex !== -1) {
      // Update existing message instead of adding duplicate
      thread.messages[existingIndex] = {
        ...thread.messages[existingIndex],
        ...message,
      };
    } else {
      // Add new message
      thread.messages.push(message);
    }

    thread.updatedAt = new Date();
    await this.save();
  }

  async updateMessage(
    threadId: string,
    messageId: string,
    updates: Partial<ConversationMessage>
  ): Promise<boolean> {
    const thread = this.conversations.get(threadId);
    if (!thread) {
      return false;
    }

    const messageIndex = thread.messages.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1) {
      return false;
    }

    thread.messages[messageIndex] = {
      ...thread.messages[messageIndex],
      ...updates,
    };
    thread.updatedAt = new Date();
    await this.save();
    return true;
  }

  async deleteMessage(threadId: string, messageId: string): Promise<boolean> {
    const thread = this.conversations.get(threadId);
    if (!thread) {
      return false;
    }

    const initialLength = thread.messages.length;
    thread.messages = thread.messages.filter(msg => msg.id !== messageId);

    if (thread.messages.length < initialLength) {
      thread.updatedAt = new Date();
      await this.save();
      this.logger.log(`Deleted message ${messageId} from thread ${threadId}`);
      return true;
    }

    return false;
  }

  async getOrCreateThread(threadId?: string): Promise<Thread> {
    if (threadId) {
      const thread = this.getThread(threadId);
      if (thread) {
        return thread;
      }
    }
    return this.createThread();
  }

  async deleteMessageFromAllThreads(
    messageId: string
  ): Promise<{ deletedMessageIds: string[]; affectedThreadIds: string[] }> {
    const deletedMessageIds: string[] = [];
    const affectedThreadIds: string[] = [];
    let hasChanges = false;

    for (const thread of this.conversations.values()) {
      const messageIndex = thread.messages.findIndex(
        msg => msg.id === messageId
      );
      if (messageIndex === -1) {
        continue;
      }

      const messageToDelete = thread.messages[messageIndex];
      const messagesToRemove: Array<{ index: number; id: string }> = [
        { index: messageIndex, id: messageToDelete.id },
      ];

      // If deleting a user message, also delete the following assistant response
      if (
        messageToDelete.role === 'user' &&
        messageIndex + 1 < thread.messages.length
      ) {
        const nextMessage = thread.messages[messageIndex + 1];
        if (nextMessage.role === 'assistant') {
          messagesToRemove.push({
            index: messageIndex + 1,
            id: nextMessage.id,
          });
        }
      }

      // Collect the IDs of messages to be deleted
      messagesToRemove.forEach(msg => {
        if (!deletedMessageIds.includes(msg.id)) {
          deletedMessageIds.push(msg.id);
        }
      });

      // Remove messages in reverse order to maintain indices
      for (let i = messagesToRemove.length - 1; i >= 0; i--) {
        thread.messages.splice(messagesToRemove[i].index, 1);
      }

      if (messagesToRemove.length > 0) {
        thread.updatedAt = new Date();
        hasChanges = true;
        affectedThreadIds.push(thread.id);
      }
    }

    if (hasChanges) {
      await this.save();
    }

    return { deletedMessageIds, affectedThreadIds };
  }
}
