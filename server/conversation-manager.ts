import { ConversationMessage, Thread } from '../src/types.js';
import path from 'path';
import fs from 'fs/promises';

export class ConversationManager {
  private conversationsPath: string;
  private conversations: Map<string, Thread> = new Map();
  private isLoaded = false;
  private workspaceRoot: string;
  private savePromise: Promise<void> | null = null;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.conversationsPath = path.join(workspaceRoot, 'mindstrike-chats.json');
  }

  // Update workspace root
  updateWorkspaceRoot(newWorkspaceRoot: string): void {
    // Only reset if the workspace root actually changed
    if (this.workspaceRoot === newWorkspaceRoot) {
      return; // No change, don't reset
    }
    
    this.workspaceRoot = newWorkspaceRoot;
    this.conversationsPath = path.join(
      newWorkspaceRoot,
      'mindstrike-chats.json'
    );
    this.isLoaded = false; // Force reload on next access
    this.conversations.clear();
  }

  async load(): Promise<void> {
    if (this.isLoaded) return;

    try {
      const data = await fs.readFile(this.conversationsPath, 'utf-8');
      const threads: Thread[] = JSON.parse(data);

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
    } catch {
      // File doesn't exist or is invalid - start with empty conversations
      this.conversations.clear();
    }

    this.isLoaded = true;
  }

  async save(): Promise<void> {
    // Serialize save operations to prevent concurrent file writes
    if (this.savePromise) {
      await this.savePromise;
    }
    
    this.savePromise = this._performSave();
    await this.savePromise;
    this.savePromise = null;
  }
  
  private async _performSave(): Promise<void> {
    const threads = Array.from(this.conversations.values());
    await fs.writeFile(
      this.conversationsPath,
      JSON.stringify(threads, null, 2)
    );
  }

  // Thread metadata operations
  getThreadList(): Array<{
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    messageCount: number;
    customRole?: string;
  }> {
    return Array.from(this.conversations.values())
      .map(thread => ({
        id: thread.id,
        name: thread.name,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
        messageCount: thread.messages.length,
        customRole: thread.customRole,
      }))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  getThread(threadId: string): Thread | null {
    return this.conversations.get(threadId) || null;
  }

  getThreadMessages(threadId: string): ConversationMessage[] {
    const thread = this.conversations.get(threadId);
    return thread ? thread.messages : [];
  }

  // Thread management operations
  async createThread(name?: string): Promise<Thread> {
    const thread: Thread = {
      id: Date.now().toString(),
      name: name || `Conversation ${this.conversations.size + 1}`,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.conversations.set(thread.id, thread);
    await this.save(); // Wait for save to complete
    return thread;
  }

  async deleteThread(threadId: string): Promise<boolean> {
    const deleted = this.conversations.delete(threadId);
    if (deleted) {
      await this.save(); // Wait for save to complete
    }
    return deleted;
  }

  async renameThread(threadId: string, newName: string): Promise<boolean> {
    const thread = this.conversations.get(threadId);
    if (thread) {
      thread.name = newName;
      thread.updatedAt = new Date();
      await this.save(); // Auto-save on changes
      return true;
    }
    return false;
  }

  async updateThreadRole(
    threadId: string,
    customRole?: string
  ): Promise<boolean> {
    const thread = this.conversations.get(threadId);
    if (thread) {
      thread.customRole = customRole;
      thread.updatedAt = new Date();
      await this.save(); // Auto-save on changes
      return true;
    }
    return false;
  }

  async clearThread(threadId: string): Promise<boolean> {
    const thread = this.conversations.get(threadId);
    if (thread) {
      thread.messages = [];
      thread.updatedAt = new Date();
      await this.save(); // Auto-save on changes
      return true;
    }
    return false;
  }

  // Message operations - called during streaming
  async addMessage(threadId: string, message: ConversationMessage): Promise<void> {
    let thread = this.conversations.get(threadId);

    // Create thread if it doesn't exist
    if (!thread) {
      thread = await this.createThread();
    }

    thread.messages.push(message);
    thread.updatedAt = new Date();
    await this.save(); // Auto-save on changes
  }

  async updateMessage(
    threadId: string,
    messageId: string,
    updates: Partial<ConversationMessage>
  ): Promise<boolean> {
    const thread = this.conversations.get(threadId);
    if (!thread) return false;

    const messageIndex = thread.messages.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1) return false;

    thread.messages[messageIndex] = {
      ...thread.messages[messageIndex],
      ...updates,
    };
    thread.updatedAt = new Date();
    await this.save(); // Auto-save on changes
    return true;
  }

  async deleteMessage(threadId: string, messageId: string): Promise<boolean> {
    const thread = this.conversations.get(threadId);
    if (!thread) return false;

    const initialLength = thread.messages.length;
    thread.messages = thread.messages.filter(msg => msg.id !== messageId);

    if (thread.messages.length !== initialLength) {
      thread.updatedAt = new Date();
      await this.save(); // Auto-save on changes
      return true;
    }
    return false;
  }

  async deleteMessageFromAllThreads(messageId: string): Promise<string[]> {
    const deletedMessageIds: string[] = [];
    let hasChanges = false;

    for (const thread of this.conversations.values()) {
      const messageIndex = thread.messages.findIndex(
        msg => msg.id === messageId
      );
      if (messageIndex === -1) continue;

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
      }
    }

    if (hasChanges) {
      await this.save(); // Auto-save on changes
    }

    return deletedMessageIds;
  }

  // Get the most recent thread (for auto-selection)
  getMostRecentThread(): Thread | null {
    const threads = Array.from(this.conversations.values());
    if (threads.length === 0) return null;

    return threads.sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    )[0];
  }
}
