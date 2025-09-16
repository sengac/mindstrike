import { ConversationMessage, Thread } from '../src/types.js';
import path from 'path';
import fs from 'fs/promises';

export class ConversationManager {
  private conversationsPath: string;
  private conversations: Map<string, Thread> = new Map();
  private isLoaded = false;
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.conversationsPath = path.join(workspaceRoot, 'mindstrike-chats.json');
  }

  // Update workspace root
  updateWorkspaceRoot(newWorkspaceRoot: string): void {
    this.workspaceRoot = newWorkspaceRoot;
    this.conversationsPath = path.join(newWorkspaceRoot, 'mindstrike-chats.json');
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
            timestamp: new Date(msg.timestamp)
          }))
        });
      });
    } catch (error) {
      // File doesn't exist or is invalid - start with empty conversations
      this.conversations.clear();
    }
    
    this.isLoaded = true;
  }

  async save(): Promise<void> {
    const threads = Array.from(this.conversations.values());
    await fs.writeFile(this.conversationsPath, JSON.stringify(threads, null, 2));
  }

  // Thread metadata operations
  getThreadList(): Array<{id: string, name: string, createdAt: Date, updatedAt: Date, messageCount: number, customRole?: string}> {
    return Array.from(this.conversations.values()).map(thread => ({
      id: thread.id,
      name: thread.name,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      messageCount: thread.messages.length,
      customRole: thread.customRole
    })).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  getThread(threadId: string): Thread | null {
    return this.conversations.get(threadId) || null;
  }

  getThreadMessages(threadId: string): ConversationMessage[] {
    const thread = this.conversations.get(threadId);
    return thread ? thread.messages : [];
  }

  // Thread management operations
  createThread(name?: string): Thread {
    const thread: Thread = {
      id: Date.now().toString(),
      name: name || `Conversation ${this.conversations.size + 1}`,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    this.conversations.set(thread.id, thread);
    this.save(); // Auto-save on changes
    return thread;
  }

  deleteThread(threadId: string): boolean {
    const deleted = this.conversations.delete(threadId);
    if (deleted) {
      this.save(); // Auto-save on changes
    }
    return deleted;
  }

  renameThread(threadId: string, newName: string): boolean {
    const thread = this.conversations.get(threadId);
    if (thread) {
      thread.name = newName;
      thread.updatedAt = new Date();
      this.save(); // Auto-save on changes
      return true;
    }
    return false;
  }

  updateThreadRole(threadId: string, customRole?: string): boolean {
    const thread = this.conversations.get(threadId);
    if (thread) {
      thread.customRole = customRole;
      thread.updatedAt = new Date();
      this.save(); // Auto-save on changes
      return true;
    }
    return false;
  }

  clearThread(threadId: string): boolean {
    const thread = this.conversations.get(threadId);
    if (thread) {
      thread.messages = [];
      thread.updatedAt = new Date();
      this.save(); // Auto-save on changes
      return true;
    }
    return false;
  }

  // Message operations - called during streaming
  addMessage(threadId: string, message: ConversationMessage): void {
    let thread = this.conversations.get(threadId);
    
    // Create thread if it doesn't exist
    if (!thread) {
      thread = this.createThread();
    }
    
    thread.messages.push(message);
    thread.updatedAt = new Date();
    this.save(); // Auto-save on changes
  }

  updateMessage(threadId: string, messageId: string, updates: Partial<ConversationMessage>): boolean {
    const thread = this.conversations.get(threadId);
    if (!thread) return false;

    const messageIndex = thread.messages.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1) return false;

    thread.messages[messageIndex] = { ...thread.messages[messageIndex], ...updates };
    thread.updatedAt = new Date();
    this.save(); // Auto-save on changes
    return true;
  }

  deleteMessage(threadId: string, messageId: string): boolean {
    const thread = this.conversations.get(threadId);
    if (!thread) return false;

    const initialLength = thread.messages.length;
    thread.messages = thread.messages.filter(msg => msg.id !== messageId);
    
    if (thread.messages.length !== initialLength) {
      thread.updatedAt = new Date();
      this.save(); // Auto-save on changes
      return true;
    }
    return false;
  }

  // Get the most recent thread (for auto-selection)
  getMostRecentThread(): Thread | null {
    const threads = Array.from(this.conversations.values());
    if (threads.length === 0) return null;
    
    return threads.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
  }
}
