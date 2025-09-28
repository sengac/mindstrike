import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConversationService } from '../conversation.service';
import type { GlobalConfigService } from '../../../shared/services/global-config.service';
import type {
  ConversationMessage,
  Thread,
} from '../../types/conversation.types';
import * as fs from 'fs/promises';
import path from 'path';

// Mock fs/promises
vi.mock('fs/promises');

const mockFs = vi.mocked(fs);

describe('ConversationService', () => {
  let service: ConversationService;
  let mockGlobalConfigService: Partial<GlobalConfigService>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup default mock implementations
    mockFs.readFile.mockResolvedValue('[]');
    mockFs.writeFile.mockResolvedValue(undefined);

    mockGlobalConfigService = {
      getWorkspaceRoot: vi.fn().mockReturnValue('/test/workspace'),
    };

    // Directly instantiate the service with mocked dependencies
    service = new ConversationService(
      mockGlobalConfigService as GlobalConfigService
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('addMessage', () => {
    it('should add a new message to a thread', async () => {
      await service.load();
      const thread = await service.createThread('Test Thread');

      const message: ConversationMessage = {
        id: 'msg1',
        role: 'user',
        content: 'Hello world',
        timestamp: new Date(),
        status: 'completed',
        images: [],
        notes: [],
      };

      await service.addMessage(thread.id, message);

      const updatedThread = service.getThread(thread.id);
      expect(updatedThread?.messages).toHaveLength(1);
      expect(updatedThread?.messages[0]).toMatchObject(message);
    });

    it('should update existing message when adding message with duplicate ID', async () => {
      await service.load();
      const thread = await service.createThread('Test Thread');

      // First add a message with partial content (simulating streaming)
      const partialMessage: ConversationMessage = {
        id: 'assistant-msg-1',
        role: 'assistant',
        content: '**',
        timestamp: new Date(),
        status: 'processing',
        model: 'sonar | Perplexity',
        images: [],
        notes: [],
      };

      await service.addMessage(thread.id, partialMessage);

      let updatedThread = service.getThread(thread.id);
      expect(updatedThread?.messages).toHaveLength(1);
      expect(updatedThread?.messages[0].content).toBe('**');
      expect(updatedThread?.messages[0].status).toBe('processing');

      // Now add the same message ID with more content (simulating streaming update)
      const moreContentMessage: ConversationMessage = {
        id: 'assistant-msg-1',
        role: 'assistant',
        content: '**React**',
        timestamp: new Date(),
        status: 'processing',
        model: 'sonar | Perplexity',
        images: [],
        notes: [],
      };

      await service.addMessage(thread.id, moreContentMessage);

      updatedThread = service.getThread(thread.id);
      expect(updatedThread?.messages).toHaveLength(1); // Should still be 1, not 2
      expect(updatedThread?.messages[0].content).toBe('**React**');
      expect(updatedThread?.messages[0].status).toBe('processing');

      // Finally add the complete message
      const completeMessage: ConversationMessage = {
        id: 'assistant-msg-1',
        role: 'assistant',
        content:
          '**React** is a JavaScript library for building user interfaces.',
        timestamp: new Date(),
        status: 'completed',
        model: 'sonar | Perplexity',
        toolCalls: [],
        images: [],
        notes: [],
      };

      await service.addMessage(thread.id, completeMessage);

      updatedThread = service.getThread(thread.id);
      expect(updatedThread?.messages).toHaveLength(1); // Should still be 1, not 3
      expect(updatedThread?.messages[0].content).toBe(
        '**React** is a JavaScript library for building user interfaces.'
      );
      expect(updatedThread?.messages[0].status).toBe('completed');
      expect(mockFs.writeFile).toHaveBeenCalledTimes(4); // initial load + create thread + 3 saves
    });

    it('should handle multiple messages with different IDs correctly', async () => {
      await service.load();
      const thread = await service.createThread('Test Thread');

      const message1: ConversationMessage = {
        id: 'user-msg-1',
        role: 'user',
        content: 'What is React?',
        timestamp: new Date(),
        status: 'completed',
        images: [],
        notes: [],
      };

      const message2: ConversationMessage = {
        id: 'assistant-msg-1',
        role: 'assistant',
        content: 'React is a library',
        timestamp: new Date(),
        status: 'completed',
        model: 'test-model',
        images: [],
        notes: [],
      };

      const message3: ConversationMessage = {
        id: 'user-msg-2',
        role: 'user',
        content: 'Tell me more',
        timestamp: new Date(),
        status: 'completed',
        images: [],
        notes: [],
      };

      await service.addMessage(thread.id, message1);
      await service.addMessage(thread.id, message2);
      await service.addMessage(thread.id, message3);

      const updatedThread = service.getThread(thread.id);
      expect(updatedThread?.messages).toHaveLength(3);
      expect(updatedThread?.messages[0].id).toBe('user-msg-1');
      expect(updatedThread?.messages[1].id).toBe('assistant-msg-1');
      expect(updatedThread?.messages[2].id).toBe('user-msg-2');
    });

    it('should preserve other message properties when updating duplicate ID', async () => {
      await service.load();
      const thread = await service.createThread('Test Thread');

      const timestamp1 = new Date('2024-01-01T10:00:00Z');
      const timestamp2 = new Date('2024-01-01T10:00:01Z');

      // First message with some properties
      const firstMessage: ConversationMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: 'Initial',
        timestamp: timestamp1,
        status: 'processing',
        model: 'model-1',
        images: [],
        notes: [],
      };

      await service.addMessage(thread.id, firstMessage);

      // Update with new content and timestamp
      const updatedMessage: ConversationMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: 'Updated content',
        timestamp: timestamp2,
        status: 'completed',
        model: 'model-1',
        toolCalls: [{ id: 'tool1', name: 'test', parameters: {} }],
        images: [],
        notes: [],
      };

      await service.addMessage(thread.id, updatedMessage);

      const updatedThread = service.getThread(thread.id);
      expect(updatedThread?.messages).toHaveLength(1);

      const finalMessage = updatedThread?.messages[0];
      expect(finalMessage?.content).toBe('Updated content');
      expect(finalMessage?.timestamp).toEqual(timestamp2);
      expect(finalMessage?.status).toBe('completed');
      expect(finalMessage?.toolCalls).toHaveLength(1);
      expect(finalMessage?.model).toBe('model-1');
    });
  });

  describe('updateMessage', () => {
    it('should update an existing message', async () => {
      await service.load();
      const thread = await service.createThread('Test Thread');

      const message: ConversationMessage = {
        id: 'msg1',
        role: 'user',
        content: 'Original content',
        timestamp: new Date(),
        status: 'completed',
        images: [],
        notes: [],
      };

      await service.addMessage(thread.id, message);

      const updated = await service.updateMessage(thread.id, 'msg1', {
        content: 'Updated content',
      });

      expect(updated).toBe(true);
      const updatedThread = service.getThread(thread.id);
      expect(updatedThread?.messages[0].content).toBe('Updated content');
    });

    it('should return false when updating non-existent message', async () => {
      await service.load();
      const thread = await service.createThread('Test Thread');

      const updated = await service.updateMessage(thread.id, 'non-existent', {
        content: 'Updated',
      });

      expect(updated).toBe(false);
    });
  });

  describe('Thread management', () => {
    it('should create thread automatically when adding message to non-existent thread', async () => {
      await service.load();

      const message: ConversationMessage = {
        id: 'msg1',
        role: 'user',
        content: 'Hello world',
        timestamp: new Date(),
        status: 'completed',
        images: [],
        notes: [],
      };

      await service.addMessage('non-existent-thread', message);

      // Should have created a new thread
      const threads = await service.getThreadList();
      expect(threads.length).toBeGreaterThanOrEqual(1);
      const newThread = threads.find(t => t.messageCount === 1);
      expect(newThread).toBeDefined();
    });
  });
});
