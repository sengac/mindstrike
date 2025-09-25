import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  MockedFunction,
} from 'vitest';
import { ConversationManager } from '../conversationManager';
import type { ConversationMessage, Thread } from '../../src/types';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Mock fs/promises
vi.mock('fs/promises');

const mockFs = vi.mocked(fs);

describe('ConversationManager', () => {
  let conversationManager: ConversationManager;
  let workspaceRoot: string;
  let conversationsPath: string;

  beforeEach(() => {
    vi.clearAllMocks();
    workspaceRoot = '/test/workspace';
    conversationsPath = path.join(workspaceRoot, 'mindstrike-chats.json');
    conversationManager = new ConversationManager(workspaceRoot);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with correct workspace root and conversations path', () => {
      expect(conversationManager).toBeDefined();
      expect(conversationManager['workspaceRoot']).toBe(workspaceRoot);
      expect(conversationManager['conversationsPath']).toBe(conversationsPath);
      expect(conversationManager['isLoaded']).toBe(false);
      expect(conversationManager['conversations'].size).toBe(0);
    });
  });

  describe('Workspace Root Management', () => {
    it('should update workspace root and reset state', () => {
      const newWorkspaceRoot = '/new/workspace';
      const newConversationsPath = path.join(
        newWorkspaceRoot,
        'mindstrike-chats.json'
      );

      // Add some data first
      conversationManager['conversations'].set('test-id', {
        id: 'test-id',
        name: 'Test Thread',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      conversationManager['isLoaded'] = true;

      conversationManager.updateWorkspaceRoot(newWorkspaceRoot);

      expect(conversationManager['workspaceRoot']).toBe(newWorkspaceRoot);
      expect(conversationManager['conversationsPath']).toBe(
        newConversationsPath
      );
      expect(conversationManager['isLoaded']).toBe(false);
      expect(conversationManager['conversations'].size).toBe(0);
    });

    it('should not reset state when workspace root is the same', () => {
      // Add some data first
      conversationManager['conversations'].set('test-id', {
        id: 'test-id',
        name: 'Test Thread',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      conversationManager['isLoaded'] = true;

      conversationManager.updateWorkspaceRoot(workspaceRoot); // Same workspace root

      expect(conversationManager['isLoaded']).toBe(true);
      expect(conversationManager['conversations'].size).toBe(1);
    });
  });

  describe('Loading Conversations', () => {
    it('should load conversations from file successfully', async () => {
      const mockThreads: Thread[] = [
        {
          id: 'thread1',
          name: 'Test Thread 1',
          messages: [
            {
              id: 'msg1',
              role: 'user',
              content: 'Hello',
              timestamp: new Date('2024-01-01T10:00:00Z'),
            },
          ],
          createdAt: new Date('2024-01-01T09:00:00Z'),
          updatedAt: new Date('2024-01-01T10:00:00Z'),
        },
        {
          id: 'thread2',
          name: 'Test Thread 2',
          messages: [],
          createdAt: new Date('2024-01-01T11:00:00Z'),
          updatedAt: new Date('2024-01-01T11:00:00Z'),
        },
      ];

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(mockThreads));

      await conversationManager.load();

      expect(mockFs.readFile).toHaveBeenCalledWith(conversationsPath, 'utf-8');
      expect(conversationManager['isLoaded']).toBe(true);
      expect(conversationManager['conversations'].size).toBe(2);

      const thread1 = conversationManager.getThread('thread1');
      expect(thread1).toBeDefined();
      expect(thread1?.name).toBe('Test Thread 1');
      expect(thread1?.messages.length).toBe(1);
      expect(thread1?.createdAt).toBeInstanceOf(Date);
      expect(thread1?.updatedAt).toBeInstanceOf(Date);
      expect(thread1?.messages[0].timestamp).toBeInstanceOf(Date);
    });

    it('should handle missing file gracefully', async () => {
      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT: no such file'));

      await conversationManager.load();

      expect(conversationManager['isLoaded']).toBe(true);
      expect(conversationManager['conversations'].size).toBe(0);
    });

    it('should handle invalid JSON gracefully', async () => {
      mockFs.readFile.mockResolvedValueOnce('invalid json');

      await conversationManager.load();

      expect(conversationManager['isLoaded']).toBe(true);
      expect(conversationManager['conversations'].size).toBe(0);
    });

    it('should not reload if already loaded', async () => {
      conversationManager['isLoaded'] = true;

      await conversationManager.load();

      expect(mockFs.readFile).not.toHaveBeenCalled();
    });
  });

  describe('Saving Conversations', () => {
    it('should save conversations to file', async () => {
      const thread: Thread = {
        id: 'test-thread',
        name: 'Test Thread',
        messages: [],
        createdAt: new Date('2024-01-01T10:00:00Z'),
        updatedAt: new Date('2024-01-01T10:00:00Z'),
      };

      conversationManager['conversations'].set('test-thread', thread);
      mockFs.writeFile.mockResolvedValueOnce(undefined);

      await conversationManager.save();

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        conversationsPath,
        JSON.stringify([thread], null, 2)
      );
    });

    it('should handle multiple save operations without corruption', async () => {
      mockFs.writeFile.mockResolvedValue(undefined);

      // Add some data to save
      conversationManager['conversations'].set('test1', {
        id: 'test1',
        name: 'Test 1',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Test that save operations complete successfully
      await conversationManager.save();
      await conversationManager.save();
      await conversationManager.save();

      // Should complete without errors
      expect(mockFs.writeFile).toHaveBeenCalled();
    });
  });

  describe('Thread Management', () => {
    beforeEach(async () => {
      mockFs.readFile.mockResolvedValue('[]');
      await conversationManager.load();
    });

    it('should create a new thread', async () => {
      mockFs.writeFile.mockResolvedValue(undefined);

      const thread = await conversationManager.createThread('New Thread');

      expect(thread).toBeDefined();
      expect(thread.name).toBe('New Thread');
      expect(thread.id).toBeDefined();
      expect(thread.messages).toEqual([]);
      expect(thread.createdAt).toBeInstanceOf(Date);
      expect(thread.updatedAt).toBeInstanceOf(Date);
      expect(mockFs.writeFile).toHaveBeenCalled();

      const retrievedThread = conversationManager.getThread(thread.id);
      expect(retrievedThread).toEqual(thread);
    });

    it('should create thread with default name when none provided', async () => {
      mockFs.writeFile.mockResolvedValue(undefined);

      const thread = await conversationManager.createThread();

      expect(thread.name).toBe('Conversation 1');
    });

    it('should delete an existing thread', async () => {
      mockFs.writeFile.mockResolvedValue(undefined);

      const thread = await conversationManager.createThread('To Delete');
      const deleted = await conversationManager.deleteThread(thread.id);

      expect(deleted).toBe(true);
      expect(conversationManager.getThread(thread.id)).toBeNull();
      expect(mockFs.writeFile).toHaveBeenCalledTimes(2); // Once for create, once for delete
    });

    it('should return false when deleting non-existent thread', async () => {
      const deleted = await conversationManager.deleteThread('non-existent');

      expect(deleted).toBe(false);
      expect(mockFs.writeFile).not.toHaveBeenCalled();
    });

    it('should rename an existing thread', async () => {
      mockFs.writeFile.mockResolvedValue(undefined);

      const thread = await conversationManager.createThread('Original Name');
      const originalUpdatedAt = thread.updatedAt.getTime();

      // Wait a bit to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 1));

      const renamed = await conversationManager.renameThread(
        thread.id,
        'New Name'
      );

      expect(renamed).toBe(true);
      const updatedThread = conversationManager.getThread(thread.id);
      expect(updatedThread?.name).toBe('New Name');
      expect(updatedThread?.updatedAt.getTime()).toBeGreaterThanOrEqual(
        originalUpdatedAt
      );
      expect(mockFs.writeFile).toHaveBeenCalledTimes(2); // Once for create, once for rename
    });

    it('should return false when renaming non-existent thread', async () => {
      const renamed = await conversationManager.renameThread(
        'non-existent',
        'New Name'
      );

      expect(renamed).toBe(false);
      expect(mockFs.writeFile).not.toHaveBeenCalled();
    });

    it('should update thread custom prompt', async () => {
      mockFs.writeFile.mockResolvedValue(undefined);

      const thread = await conversationManager.createThread('Test Thread');
      const updated = await conversationManager.updateThreadPrompt(
        thread.id,
        'Custom prompt'
      );

      expect(updated).toBe(true);
      const updatedThread = conversationManager.getThread(thread.id);
      expect(updatedThread?.customPrompt).toBe('Custom prompt');
      expect(mockFs.writeFile).toHaveBeenCalledTimes(2);
    });

    it('should clear thread custom prompt with null', async () => {
      mockFs.writeFile.mockResolvedValue(undefined);

      const thread = await conversationManager.createThread('Test Thread');
      await conversationManager.updateThreadPrompt(thread.id, 'Custom prompt');
      const updated = await conversationManager.updateThreadPrompt(
        thread.id,
        null
      );

      expect(updated).toBe(true);
      const updatedThread = conversationManager.getThread(thread.id);
      expect(updatedThread?.customPrompt).toBeUndefined();
    });

    it('should clear all messages from a thread', async () => {
      mockFs.writeFile.mockResolvedValue(undefined);

      const thread = await conversationManager.createThread('Test Thread');

      // Add a message first
      const message: ConversationMessage = {
        id: 'msg1',
        role: 'user',
        content: 'Test message',
        timestamp: new Date(),
      };
      await conversationManager.addMessage(thread.id, message);

      const cleared = await conversationManager.clearThread(thread.id);

      expect(cleared).toBe(true);
      const clearedThread = conversationManager.getThread(thread.id);
      expect(clearedThread?.messages).toEqual([]);
      expect(mockFs.writeFile).toHaveBeenCalledTimes(3); // Create, add message, clear
    });
  });

  describe('Message Management', () => {
    let thread: Thread;

    beforeEach(async () => {
      mockFs.readFile.mockResolvedValue('[]');
      mockFs.writeFile.mockResolvedValue(undefined);
      await conversationManager.load();
      thread = await conversationManager.createThread('Test Thread');
    });

    it('should add message to existing thread', async () => {
      const message: ConversationMessage = {
        id: 'msg1',
        role: 'user',
        content: 'Hello world',
        timestamp: new Date(),
      };

      await conversationManager.addMessage(thread.id, message);

      const updatedThread = conversationManager.getThread(thread.id);
      expect(updatedThread?.messages).toHaveLength(1);
      expect(updatedThread?.messages[0]).toEqual(message);
      expect(mockFs.writeFile).toHaveBeenCalledTimes(2); // Create thread + add message
    });

    it('should create thread automatically when adding message to non-existent thread', async () => {
      const message: ConversationMessage = {
        id: 'msg1',
        role: 'user',
        content: 'Hello world',
        timestamp: new Date(),
      };

      await conversationManager.addMessage('non-existent-thread', message);

      // Should have created a new thread with the message
      // Note: addMessage creates a thread with a generated ID, not the provided non-existent ID
      const threads = conversationManager.getThreadList();
      const newThread = threads.find(t => t.messageCount === 1);
      expect(newThread).toBeDefined();
      expect(newThread?.messageCount).toBe(1);
      expect(threads.length).toBeGreaterThanOrEqual(1);
    });

    it('should update an existing message', async () => {
      const message: ConversationMessage = {
        id: 'msg1',
        role: 'user',
        content: 'Original content',
        timestamp: new Date(),
      };

      await conversationManager.addMessage(thread.id, message);

      const updated = await conversationManager.updateMessage(
        thread.id,
        'msg1',
        { content: 'Updated content' }
      );

      expect(updated).toBe(true);
      const updatedThread = conversationManager.getThread(thread.id);
      expect(updatedThread?.messages[0].content).toBe('Updated content');
      expect(mockFs.writeFile).toHaveBeenCalledTimes(3); // Create, add, update
    });

    it('should return false when updating message in non-existent thread', async () => {
      const updated = await conversationManager.updateMessage(
        'non-existent',
        'msg1',
        { content: 'Updated' }
      );

      expect(updated).toBe(false);
    });

    it('should return false when updating non-existent message', async () => {
      const updated = await conversationManager.updateMessage(
        thread.id,
        'non-existent-msg',
        { content: 'Updated' }
      );

      expect(updated).toBe(false);
    });

    it('should delete an existing message', async () => {
      const message: ConversationMessage = {
        id: 'msg1',
        role: 'user',
        content: 'To be deleted',
        timestamp: new Date(),
      };

      await conversationManager.addMessage(thread.id, message);
      const deleted = await conversationManager.deleteMessage(
        thread.id,
        'msg1'
      );

      expect(deleted).toBe(true);
      const updatedThread = conversationManager.getThread(thread.id);
      expect(updatedThread?.messages).toHaveLength(0);
      expect(mockFs.writeFile).toHaveBeenCalledTimes(3); // Create, add, delete
    });

    it('should return false when deleting from non-existent thread', async () => {
      const deleted = await conversationManager.deleteMessage(
        'non-existent',
        'msg1'
      );

      expect(deleted).toBe(false);
    });

    it('should return false when deleting non-existent message', async () => {
      const deleted = await conversationManager.deleteMessage(
        thread.id,
        'non-existent'
      );

      expect(deleted).toBe(false);
    });
  });

  describe('Cross-Thread Message Deletion', () => {
    let thread1: Thread;
    let thread2: Thread;

    beforeEach(async () => {
      mockFs.readFile.mockResolvedValue('[]');
      mockFs.writeFile.mockResolvedValue(undefined);
      await conversationManager.load();

      thread1 = await conversationManager.createThread('Thread 1');
      thread2 = await conversationManager.createThread('Thread 2');

      // Add messages to both threads
      await conversationManager.addMessage(thread1.id, {
        id: 'shared-msg',
        role: 'user',
        content: 'Shared message',
        timestamp: new Date(),
      });

      await conversationManager.addMessage(thread1.id, {
        id: 'assistant-response',
        role: 'assistant',
        content: 'Assistant response',
        timestamp: new Date(),
      });

      await conversationManager.addMessage(thread2.id, {
        id: 'shared-msg-thread2',
        role: 'user',
        content: 'Different message in thread 2',
        timestamp: new Date(),
      });
    });

    it('should delete message from all threads and following assistant response', async () => {
      const result =
        await conversationManager.deleteMessageFromAllThreads('shared-msg');

      expect(result.deletedMessageIds).toContain('shared-msg');
      expect(result.deletedMessageIds).toContain('assistant-response');
      expect(result.affectedThreadIds).toContain(thread1.id);
      expect(result.affectedThreadIds).toHaveLength(1); // Only thread1 affected

      // Verify messages were deleted from thread1
      const updatedThread1 = conversationManager.getThread(thread1.id);
      const updatedThread2 = conversationManager.getThread(thread2.id);

      // Verify deletion worked correctly
      expect(updatedThread1?.messages.length).toBeLessThan(2); // Should have deleted at least the target message
      expect(updatedThread2?.messages).toHaveLength(1); // Thread 2 should still have its message
    });

    it('should not delete assistant response if user message is not followed by assistant', async () => {
      // Add another user message after the assistant response in thread1
      await conversationManager.addMessage(thread1.id, {
        id: 'another-user-msg',
        role: 'user',
        content: 'Another user message',
        timestamp: new Date(),
      });

      const result =
        await conversationManager.deleteMessageFromAllThreads(
          'assistant-response'
        );

      expect(result.deletedMessageIds).toEqual(['assistant-response']);
      expect(result.affectedThreadIds).toEqual([thread1.id]);
    });

    it('should return empty arrays when message not found in any thread', async () => {
      const result =
        await conversationManager.deleteMessageFromAllThreads(
          'non-existent-msg'
        );

      expect(result.deletedMessageIds).toEqual([]);
      expect(result.affectedThreadIds).toEqual([]);
      expect(mockFs.writeFile).toHaveBeenCalledTimes(5); // 2 creates + 3 adds, no delete save
    });
  });

  describe('Thread Retrieval and Listing', () => {
    beforeEach(async () => {
      mockFs.readFile.mockResolvedValue('[]');
      mockFs.writeFile.mockResolvedValue(undefined);
      await conversationManager.load();
    });

    it('should get thread list sorted by update time', async () => {
      const thread1 = await conversationManager.createThread('Thread 1');
      await new Promise(resolve => setTimeout(resolve, 1)); // Ensure different timestamps
      const thread2 = await conversationManager.createThread('Thread 2');

      const threadList = conversationManager.getThreadList();

      expect(threadList).toHaveLength(2);
      expect(threadList[0].id).toBe(thread2.id); // Most recent first
      expect(threadList[1].id).toBe(thread1.id);
      expect(threadList[0]).toMatchObject({
        id: thread2.id,
        name: 'Thread 2',
        messageCount: 0,
      });
    });

    it('should get thread messages', async () => {
      const thread = await conversationManager.createThread('Test Thread');
      const message: ConversationMessage = {
        id: 'msg1',
        role: 'user',
        content: 'Test message',
        timestamp: new Date(),
      };

      await conversationManager.addMessage(thread.id, message);

      const messages = conversationManager.getThreadMessages(thread.id);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual(message);
    });

    it('should return empty array for non-existent thread messages', () => {
      const messages = conversationManager.getThreadMessages('non-existent');
      expect(messages).toEqual([]);
    });

    it('should get most recent thread', async () => {
      const thread1 = await conversationManager.createThread('Thread 1');
      await new Promise(resolve => setTimeout(resolve, 1));
      const thread2 = await conversationManager.createThread('Thread 2');

      const mostRecent = conversationManager.getMostRecentThread();

      expect(mostRecent?.id).toBe(thread2.id);
    });

    it('should return null when no threads exist', () => {
      const mostRecent = conversationManager.getMostRecentThread();
      expect(mostRecent).toBeNull();
    });

    it('should return null for non-existent thread', () => {
      const thread = conversationManager.getThread('non-existent');
      expect(thread).toBeNull();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle filesystem errors during save', async () => {
      mockFs.writeFile.mockRejectedValueOnce(new Error('Filesystem error'));

      await expect(conversationManager.save()).rejects.toThrow(
        'Filesystem error'
      );
    });

    it('should handle multiple sequential operations', async () => {
      mockFs.readFile.mockResolvedValue('[]');
      mockFs.writeFile.mockResolvedValue(undefined);
      await conversationManager.load();

      // Create threads sequentially and verify they're properly stored
      const thread1 = await conversationManager.createThread('Thread 1');
      expect(thread1).toBeDefined();
      expect(thread1.name).toBe('Thread 1');

      const thread2 = await conversationManager.createThread('Thread 2');
      expect(thread2).toBeDefined();
      expect(thread2.name).toBe('Thread 2');

      const thread3 = await conversationManager.createThread('Thread 3');
      expect(thread3).toBeDefined();
      expect(thread3.name).toBe('Thread 3');

      const threads = [thread1, thread2, thread3];
      expect(threads).toHaveLength(3);

      // Verify all threads can be retrieved
      expect(conversationManager.getThread(thread1.id)).toBeDefined();
      expect(conversationManager.getThread(thread2.id)).toBeDefined();
      expect(conversationManager.getThread(thread3.id)).toBeDefined();
    });

    it('should handle date serialization edge cases', async () => {
      const mockData = [
        {
          id: 'test-thread',
          name: 'Test Thread',
          messages: [
            {
              id: 'msg1',
              role: 'user',
              content: 'Test',
              timestamp: '2024-01-01T10:00:00.000Z', // String timestamp
            },
          ],
          createdAt: '2024-01-01T09:00:00.000Z',
          updatedAt: '2024-01-01T10:00:00.000Z',
        },
      ];

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(mockData));

      await conversationManager.load();

      const thread = conversationManager.getThread('test-thread');
      expect(thread?.createdAt).toBeInstanceOf(Date);
      expect(thread?.updatedAt).toBeInstanceOf(Date);
      expect(thread?.messages[0].timestamp).toBeInstanceOf(Date);
    });
  });
});
