import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConversationService } from './conversation.service';
import * as fs from 'fs/promises';
import * as path from 'path';

vi.mock('fs/promises');

describe('ConversationService', () => {
  let service: ConversationService;
  let configService: Partial<ConfigService>;
  const mockWorkspaceRoot = '/test/workspace';

  beforeEach(async () => {
    // Reset fs mocks first
    vi.clearAllMocks();

    // Create a mock ConfigService
    configService = {
      get: vi.fn().mockReturnValue(mockWorkspaceRoot),
    };

    // Directly instantiate the service with mocked dependency
    service = new ConversationService(configService as ConfigService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should use workspace root from config', () => {
      expect(configService.get).toHaveBeenCalledWith('WORKSPACE_ROOT');
    });

    it('should fall back to process.cwd() if config is not available', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ConversationService,
          {
            provide: ConfigService,
            useValue: {
              get: vi.fn().mockReturnValue(undefined),
            },
          },
        ],
      }).compile();

      const serviceWithoutConfig =
        module.get<ConversationService>(ConversationService);
      expect(serviceWithoutConfig).toBeDefined();
    });
  });

  describe('load', () => {
    it('should load threads from JSON file', async () => {
      const mockThreads = [
        {
          id: 'thread1',
          name: 'Test Thread 1',
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'thread2',
          name: 'Test Thread 2',
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(
        JSON.stringify(mockThreads)
      );

      await service.load();

      expect(fs.readFile).toHaveBeenCalledWith(
        path.join(mockWorkspaceRoot, 'mindstrike-chats.json'),
        'utf-8'
      );

      // Verify threads were loaded into internal map
      const thread = service.getThread('thread1');
      expect(thread).toBeDefined();
      expect(thread?.name).toBe('Test Thread 1');
    });

    it('should handle file not existing gracefully', async () => {
      (fs.readFile as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('ENOENT')
      );

      await service.load();

      // Should not throw and should have empty conversations
      const threads = service.getThreadList();
      expect(threads).toEqual([]);
    });

    it('should handle invalid JSON gracefully', async () => {
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(
        'invalid json'
      );

      await service.load();

      // Should not throw and should have empty conversations
      const threads = service.getThreadList();
      expect(threads).toEqual([]);
    });
  });

  describe('save', () => {
    it('should save threads to JSON file', async () => {
      // First load some threads
      const mockThreads = [
        {
          id: 'thread1',
          name: 'Test Thread 1',
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(
        JSON.stringify(mockThreads)
      );
      await service.load();

      (fs.writeFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await service.save();

      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(mockWorkspaceRoot, 'mindstrike-chats.json'),
        expect.any(String)
      );
    });

    it('should serialize save operations', async () => {
      (fs.writeFile as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(undefined), 10))
      );

      // Start multiple saves concurrently
      const save1 = service.save();
      const save2 = service.save();
      const save3 = service.save();

      await Promise.all([save1, save2, save3]);

      // Should serialize writes, not write concurrently
      // Exact call count depends on serialization logic
      expect(fs.writeFile).toHaveBeenCalled();
    });
  });

  describe('createThread', () => {
    it('should create a new thread', async () => {
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue('[]');
      await service.load();

      (fs.writeFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const newThread = await service.createThread('New Thread');

      expect(newThread).toHaveProperty('id');
      expect(newThread).toHaveProperty('name', 'New Thread');
      expect(newThread).toHaveProperty('createdAt');
      expect(newThread).toHaveProperty('updatedAt');
      expect(newThread).toHaveProperty('messages', []);
    });

    it('should add thread to existing threads', async () => {
      const existingThread = {
        id: 'existing',
        name: 'Existing',
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(
        JSON.stringify([existingThread])
      );
      await service.load();

      (fs.writeFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const newThread = await service.createThread('New Thread');

      // Should have 2 threads now
      const threads = service.getThreadList();
      expect(threads).toHaveLength(2);

      expect(fs.writeFile).toHaveBeenCalled();
    });
  });

  describe('getThread', () => {
    it('should return thread by id', async () => {
      const mockThreads = [
        {
          id: 'thread1',
          name: 'Test Thread 1',
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'thread2',
          name: 'Test Thread 2',
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(
        JSON.stringify(mockThreads)
      );
      await service.load();

      const thread = service.getThread('thread1');

      expect(thread).toBeDefined();
      expect(thread?.id).toBe('thread1');
      expect(thread?.name).toBe('Test Thread 1');
    });

    it('should return null if thread not found', async () => {
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue('[]');
      await service.load();

      const thread = service.getThread('nonexistent');

      expect(thread).toBeNull();
    });
  });

  describe('renameThread', () => {
    it('should rename existing thread', async () => {
      const mockThreads = [
        {
          id: 'thread1',
          name: 'Old Name',
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(
        JSON.stringify(mockThreads)
      );
      await service.load();

      (fs.writeFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const updated = await service.renameThread('thread1', 'New Name');

      expect(updated).toBeTruthy();
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('New Name')
      );
    });

    it('should return false if thread not found', async () => {
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue('[]');
      await service.load();

      const updated = await service.renameThread('nonexistent', 'New Name');

      expect(updated).toBe(false);
      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('deleteThread', () => {
    it('should delete existing thread', async () => {
      const mockThreads = [
        {
          id: 'thread1',
          name: 'Test Thread 1',
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'thread2',
          name: 'Test Thread 2',
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(
        JSON.stringify(mockThreads)
      );
      await service.load();

      (fs.writeFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const deleted = await service.deleteThread('thread1');

      expect(deleted).toBe(true);

      // Verify thread was deleted
      const thread = service.getThread('thread1');
      expect(thread).toBeNull();

      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should return false if thread not found', async () => {
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue('[]');
      await service.load();

      const deleted = await service.deleteThread('nonexistent');

      expect(deleted).toBe(false);
      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('addMessage', () => {
    it('should add message to existing thread', async () => {
      const mockThreads = [
        {
          id: 'thread1',
          name: 'Test Thread 1',
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(
        JSON.stringify(mockThreads)
      );
      await service.load();

      (fs.writeFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const message = {
        id: 'msg-1',
        content: 'Test message',
        role: 'user' as const,
        timestamp: new Date(),
      };

      await service.addMessage('thread1', message);

      // Verify message was added to thread
      const thread = service.getThread('thread1');
      expect(thread?.messages).toHaveLength(1);
      expect(thread?.messages[0].content).toBe('Test message');

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Test message')
      );
    });

    it('should create thread if it does not exist', async () => {
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue('[]');
      await service.load();

      (fs.writeFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const message = {
        id: 'msg-1',
        content: 'Test message',
        role: 'user' as const,
        timestamp: new Date(),
      };

      await service.addMessage('nonexistent', message);

      // Should have created a new thread
      const threads = service.getThreadList();
      expect(threads).toHaveLength(1);
      expect(fs.writeFile).toHaveBeenCalled();
    });
  });

  describe('deleteMessage', () => {
    it('should delete message from thread', async () => {
      const mockThreads = [
        {
          id: 'thread1',
          name: 'Test Thread 1',
          messages: [
            {
              id: 'msg1',
              content: 'Message 1',
              role: 'user',
              timestamp: new Date().toISOString(),
            },
            {
              id: 'msg2',
              content: 'Message 2',
              role: 'assistant',
              timestamp: new Date().toISOString(),
            },
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(
        JSON.stringify(mockThreads)
      );
      await service.load();

      (fs.writeFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const deleted = await service.deleteMessage('thread1', 'msg1');

      expect(deleted).toBe(true);

      // Verify message was deleted
      const thread = service.getThread('thread1');
      expect(thread?.messages).toHaveLength(1);
      expect(thread?.messages[0].id).toBe('msg2');

      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should return false if message not found', async () => {
      const mockThreads = [
        {
          id: 'thread1',
          name: 'Test Thread 1',
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(
        JSON.stringify(mockThreads)
      );
      await service.load();

      const deleted = await service.deleteMessage('thread1', 'nonexistent');

      expect(deleted).toBe(false);
      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });
});
