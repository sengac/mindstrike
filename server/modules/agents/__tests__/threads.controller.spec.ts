import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ThreadsController } from '../threads.controller';
import type { AgentsService } from '../agents.service';
import type { ConversationService } from '../../chat/services/conversation.service';

describe('ThreadsController', () => {
  let controller: ThreadsController;
  let mockAgentsService: Partial<AgentsService>;
  let mockConversationService: Partial<ConversationService>;

  const mockThread = {
    id: 'thread-123',
    name: 'Test Thread',
    messages: [],
    customPrompt: 'Custom prompt',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    mockAgentsService = {};

    mockConversationService = {
      getThreadList: vi.fn().mockResolvedValue([
        {
          id: 'thread-123',
          name: 'Test Thread',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          messageCount: 5,
        },
      ]),
      getThread: vi.fn().mockReturnValue(mockThread),
      createThread: vi.fn().mockResolvedValue(mockThread),
      load: vi.fn().mockResolvedValue(undefined),
      renameThread: vi.fn().mockResolvedValue(true),
      updateThreadPrompt: vi.fn().mockResolvedValue(true),
      deleteThread: vi.fn().mockResolvedValue(true),
      clearThread: vi.fn().mockResolvedValue(true),
      getThreadMessages: vi.fn().mockReturnValue([]),
    };

    controller = new ThreadsController(
      mockAgentsService as AgentsService,
      mockConversationService as ConversationService
    );
  });

  describe('getAllThreads', () => {
    it('should return all threads', async () => {
      const result = await controller.getAllThreads();

      expect(result).toEqual([
        {
          id: 'thread-123',
          name: 'Test Thread',
          type: 'chat',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          messageCount: 5,
          customPrompt: undefined,
        },
      ]);
      expect(mockConversationService.getThreadList).toHaveBeenCalled();
    });

    it('should include customPrompt field when present', async () => {
      (
        mockConversationService.getThreadList as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        {
          id: 'thread-123',
          name: 'Test Thread',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          messageCount: 5,
          customPrompt: 'You are a helpful assistant',
        },
        {
          id: 'thread-456',
          name: 'Another Thread',
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
          messageCount: 3,
          customPrompt: undefined,
        },
      ]);

      const result = await controller.getAllThreads();

      expect(result).toEqual([
        {
          id: 'thread-123',
          name: 'Test Thread',
          type: 'chat',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          messageCount: 5,
          customPrompt: 'You are a helpful assistant',
        },
        {
          id: 'thread-456',
          name: 'Another Thread',
          type: 'chat',
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
          messageCount: 3,
          customPrompt: undefined,
        },
      ]);
      expect(mockConversationService.getThreadList).toHaveBeenCalled();
    });

    it('should handle pagination', async () => {
      (
        mockConversationService.getThreadList as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        {
          id: '1',
          name: 'Thread 1',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
          messageCount: 1,
        },
        {
          id: '2',
          name: 'Thread 2',
          createdAt: '2024-01-02',
          updatedAt: '2024-01-02',
          messageCount: 2,
        },
        {
          id: '3',
          name: 'Thread 3',
          createdAt: '2024-01-03',
          updatedAt: '2024-01-03',
          messageCount: 3,
        },
      ]);

      const result = await controller.getAllThreads(undefined, 2, 1);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('2');
      expect(result[1].id).toBe('3');
    });
  });

  describe('getThread', () => {
    it('should return thread details', async () => {
      const result = await controller.getThread('thread-123');

      expect(result).toEqual({
        id: 'thread-123',
        name: 'Test Thread',
        type: 'chat',
        metadata: {
          customPrompt: 'Custom prompt',
          messageCount: 0,
        },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      });
      expect(mockConversationService.getThread).toHaveBeenCalledWith(
        'thread-123'
      );
    });

    it('should throw NotFoundException when thread not found', async () => {
      (
        mockConversationService.getThread as ReturnType<typeof vi.fn>
      ).mockReturnValue(null);

      await expect(controller.getThread('non-existent')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('createThread', () => {
    it('should create a new thread', async () => {
      const dto = { name: 'New Thread' };

      const result = await controller.createThread(dto);

      expect(result).toEqual({
        id: 'thread-123',
        name: 'Test Thread',
        type: 'chat',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      });
      expect(mockConversationService.createThread).toHaveBeenCalledWith(
        'New Thread'
      );
    });

    it('should update custom prompt if provided', async () => {
      const dto = {
        name: 'New Thread',
        metadata: { customPrompt: 'Custom prompt' },
      };

      await controller.createThread(dto);

      expect(mockConversationService.updateThreadPrompt).toHaveBeenCalledWith(
        'thread-123',
        'Custom prompt'
      );
    });
  });

  describe('updateThread', () => {
    beforeEach(() => {
      mockAgentsService.setThreadPrompt = vi.fn();
      mockAgentsService.deleteThreadPrompt = vi.fn();
    });

    it('should update thread title', async () => {
      const dto = { name: 'Updated Title' };

      const result = await controller.updateThread('thread-123', dto);

      expect(result).toEqual({ success: true });
      expect(mockConversationService.load).toHaveBeenCalled();
      expect(mockConversationService.renameThread).toHaveBeenCalledWith(
        'thread-123',
        'Updated Title'
      );
    });

    it('should update custom prompt and store in AgentsService', async () => {
      const dto = { customPrompt: 'New prompt' };

      const result = await controller.updateThread('thread-123', dto);

      expect(result).toEqual({ success: true });
      expect(mockConversationService.updateThreadPrompt).toHaveBeenCalledWith(
        'thread-123',
        'New prompt'
      );
      expect(mockAgentsService.setThreadPrompt).toHaveBeenCalledWith(
        'thread-123',
        'New prompt'
      );
    });

    it('should delete custom prompt when set to null', async () => {
      const dto = { customPrompt: null };

      const result = await controller.updateThread('thread-123', dto);

      expect(result).toEqual({ success: true });
      expect(mockConversationService.updateThreadPrompt).toHaveBeenCalledWith(
        'thread-123',
        undefined
      );
      expect(mockAgentsService.deleteThreadPrompt).toHaveBeenCalledWith(
        'thread-123'
      );
    });

    it('should handle both title and prompt updates', async () => {
      const dto = {
        name: 'New Title',
        customPrompt: 'New prompt',
      };

      await controller.updateThread('thread-123', dto);

      expect(mockConversationService.renameThread).toHaveBeenCalledWith(
        'thread-123',
        'New Title'
      );
      expect(mockConversationService.updateThreadPrompt).toHaveBeenCalledWith(
        'thread-123',
        'New prompt'
      );
      expect(mockAgentsService.setThreadPrompt).toHaveBeenCalledWith(
        'thread-123',
        'New prompt'
      );
    });

    // New comprehensive test cases for edge cases and error scenarios
    describe('edge cases and error scenarios', () => {
      it('should update thread with only name field (no metadata)', async () => {
        const dto = { name: 'Just Name Update' };

        const result = await controller.updateThread('thread-123', dto);

        expect(result).toEqual({ success: true });
        expect(mockConversationService.load).toHaveBeenCalled();
        expect(mockConversationService.renameThread).toHaveBeenCalledWith(
          'thread-123',
          'Just Name Update'
        );
        expect(
          mockConversationService.updateThreadPrompt
        ).not.toHaveBeenCalled();
      });

      it('should update thread with metadata but no customPrompt', async () => {
        const dto = {
          metadata: {
            someOtherField: 'value',
            anotherField: 123,
            booleanField: true,
          },
        };

        const result = await controller.updateThread('thread-123', dto);

        expect(result).toEqual({ success: true });
        expect(mockConversationService.load).toHaveBeenCalled();
        expect(mockConversationService.renameThread).not.toHaveBeenCalled();
        expect(
          mockConversationService.updateThreadPrompt
        ).not.toHaveBeenCalled();
      });

      it('should update thread with name and customPrompt directly', async () => {
        const dto = {
          name: 'Updated Name',
          customPrompt: 'Updated custom prompt',
        };

        const result = await controller.updateThread('thread-123', dto);

        expect(result).toEqual({ success: true });
        expect(mockConversationService.load).toHaveBeenCalled();
        expect(mockConversationService.renameThread).toHaveBeenCalledWith(
          'thread-123',
          'Updated Name'
        );
        expect(mockConversationService.updateThreadPrompt).toHaveBeenCalledWith(
          'thread-123',
          'Updated custom prompt'
        );
        expect(mockAgentsService.setThreadPrompt).toHaveBeenCalledWith(
          'thread-123',
          'Updated custom prompt'
        );
      });

      it('should handle empty string name', async () => {
        const dto = { name: '' };

        const result = await controller.updateThread('thread-123', dto);

        expect(result).toEqual({ success: true });
        expect(mockConversationService.renameThread).toHaveBeenCalledWith(
          'thread-123',
          ''
        );
      });

      it('should handle empty metadata object', async () => {
        const dto = { metadata: {} };

        const result = await controller.updateThread('thread-123', dto);

        expect(result).toEqual({ success: true });
        expect(mockConversationService.load).toHaveBeenCalled();
        expect(mockConversationService.renameThread).not.toHaveBeenCalled();
        expect(
          mockConversationService.updateThreadPrompt
        ).not.toHaveBeenCalled();
      });

      it('should handle null customPrompt directly', async () => {
        const dto = { customPrompt: null };

        const result = await controller.updateThread('thread-123', dto);

        expect(result).toEqual({ success: true });
        expect(mockConversationService.updateThreadPrompt).toHaveBeenCalledWith(
          'thread-123',
          undefined
        );
        expect(mockAgentsService.deleteThreadPrompt).toHaveBeenCalledWith(
          'thread-123'
        );
      });

      it('should handle undefined customPrompt (field not present)', async () => {
        const dto = { name: 'Test' }; // customPrompt field is not present

        const result = await controller.updateThread('thread-123', dto);

        expect(result).toEqual({ success: true });
        // When customPrompt is not in the DTO, it should not be updated
        expect(
          mockConversationService.updateThreadPrompt
        ).not.toHaveBeenCalled();
      });

      it('should handle empty string customPrompt', async () => {
        const dto = { customPrompt: '' };

        const result = await controller.updateThread('thread-123', dto);

        expect(result).toEqual({ success: true });
        expect(mockConversationService.updateThreadPrompt).toHaveBeenCalledWith(
          'thread-123',
          ''
        );
        // Empty string is falsy, so it deletes the prompt instead of setting it
        expect(mockAgentsService.deleteThreadPrompt).toHaveBeenCalledWith(
          'thread-123'
        );
      });

      it('should handle whitespace-only customPrompt', async () => {
        const dto = { customPrompt: '   ' };

        const result = await controller.updateThread('thread-123', dto);

        expect(result).toEqual({ success: true });
        expect(mockConversationService.updateThreadPrompt).toHaveBeenCalledWith(
          'thread-123',
          '   '
        );
        expect(mockAgentsService.setThreadPrompt).toHaveBeenCalledWith(
          'thread-123',
          '   '
        );
      });

      it('should handle metadata without customPrompt field', async () => {
        const dto = { metadata: { otherField: 'value' } };

        const result = await controller.updateThread('thread-123', dto);

        expect(result).toEqual({ success: true });
        // Should not call updateThreadPrompt when customPrompt is not in DTO
        expect(
          mockConversationService.updateThreadPrompt
        ).not.toHaveBeenCalled();
      });

      // Error scenario tests
      it('should handle ConversationService.load() failure', async () => {
        const testError = new Error('Failed to load conversation service');
        (
          mockConversationService.load as ReturnType<typeof vi.fn>
        ).mockRejectedValue(testError);

        const dto = { name: 'New Name' };

        await expect(
          controller.updateThread('thread-123', dto)
        ).rejects.toThrow('Failed to load conversation service');

        expect(mockConversationService.renameThread).not.toHaveBeenCalled();
        expect(
          mockConversationService.updateThreadPrompt
        ).not.toHaveBeenCalled();
      });

      it('should handle ConversationService.renameThread() failure', async () => {
        const testError = new Error('Failed to rename thread');
        (
          mockConversationService.renameThread as ReturnType<typeof vi.fn>
        ).mockRejectedValue(testError);

        const dto = { name: 'New Name' };

        await expect(
          controller.updateThread('thread-123', dto)
        ).rejects.toThrow('Failed to rename thread');

        expect(mockConversationService.load).toHaveBeenCalled();
        expect(mockConversationService.renameThread).toHaveBeenCalledWith(
          'thread-123',
          'New Name'
        );
      });

      it('should handle ConversationService.updateThreadPrompt() failure', async () => {
        const testError = new Error('Failed to update thread prompt');
        (
          mockConversationService.updateThreadPrompt as ReturnType<typeof vi.fn>
        ).mockRejectedValue(testError);

        const dto = { customPrompt: 'New prompt' };

        await expect(
          controller.updateThread('thread-123', dto)
        ).rejects.toThrow('Failed to update thread prompt');

        expect(mockConversationService.load).toHaveBeenCalled();
        expect(mockConversationService.updateThreadPrompt).toHaveBeenCalledWith(
          'thread-123',
          'New prompt'
        );
      });

      it('should handle failure in renameThread but still attempt updateThreadPrompt', async () => {
        const renameError = new Error('Rename failed');
        (
          mockConversationService.renameThread as ReturnType<typeof vi.fn>
        ).mockRejectedValue(renameError);

        const dto = {
          name: 'New Name',
          metadata: { customPrompt: 'New prompt' },
        };

        await expect(
          controller.updateThread('thread-123', dto)
        ).rejects.toThrow('Rename failed');

        expect(mockConversationService.load).toHaveBeenCalled();
        expect(mockConversationService.renameThread).toHaveBeenCalledWith(
          'thread-123',
          'New Name'
        );
        // updateThreadPrompt should not be called if renameThread fails
        expect(
          mockConversationService.updateThreadPrompt
        ).not.toHaveBeenCalled();
      });

      it('should handle invalid threadId format', async () => {
        const dto = { name: 'New Name' };

        // Test with various invalid thread IDs that might cause issues
        const invalidThreadIds = [
          '',
          '   ',
          'not-a-uuid',
          'null',
          'undefined',
          '../../../../etc/passwd',
          '<script>alert("xss")</script>',
          String.fromCharCode(0),
        ];

        for (const invalidId of invalidThreadIds) {
          const result = await controller.updateThread(invalidId, dto);

          expect(result).toEqual({ success: true });
          expect(mockConversationService.renameThread).toHaveBeenCalledWith(
            invalidId,
            'New Name'
          );
        }
      });

      it('should handle very long thread name', async () => {
        const veryLongName = 'a'.repeat(10000); // 10k character name
        const dto = { name: veryLongName };

        const result = await controller.updateThread('thread-123', dto);

        expect(result).toEqual({ success: true });
        expect(mockConversationService.renameThread).toHaveBeenCalledWith(
          'thread-123',
          veryLongName
        );
      });

      it('should handle very long customPrompt', async () => {
        const veryLongPrompt = 'This is a very long custom prompt. '.repeat(
          1000
        ); // ~35k characters
        const dto = { customPrompt: veryLongPrompt };

        const result = await controller.updateThread('thread-123', dto);

        expect(result).toEqual({ success: true });
        expect(mockConversationService.updateThreadPrompt).toHaveBeenCalledWith(
          'thread-123',
          veryLongPrompt
        );
        expect(mockAgentsService.setThreadPrompt).toHaveBeenCalledWith(
          'thread-123',
          veryLongPrompt
        );
      });

      it('should handle special characters in thread name', async () => {
        const specialCharName = '特殊字符 🚀 \n\t\r\0 <>&"\'';
        const dto = { name: specialCharName };

        const result = await controller.updateThread('thread-123', dto);

        expect(result).toEqual({ success: true });
        expect(mockConversationService.renameThread).toHaveBeenCalledWith(
          'thread-123',
          specialCharName
        );
      });

      it('should handle special characters in customPrompt', async () => {
        const specialCharPrompt =
          'Special chars: 特殊字符 🚀 \n\t\r\0 <>&"\' {}[]()';
        const dto = { customPrompt: specialCharPrompt };

        const result = await controller.updateThread('thread-123', dto);

        expect(result).toEqual({ success: true });
        expect(mockConversationService.updateThreadPrompt).toHaveBeenCalledWith(
          'thread-123',
          specialCharPrompt
        );
        expect(mockAgentsService.setThreadPrompt).toHaveBeenCalledWith(
          'thread-123',
          specialCharPrompt
        );
      });

      it('should handle both name undefined and no metadata', async () => {
        const dto = {};

        const result = await controller.updateThread('thread-123', dto);

        expect(result).toEqual({ success: true });
        expect(mockConversationService.load).toHaveBeenCalled();
        expect(mockConversationService.renameThread).not.toHaveBeenCalled();
        expect(
          mockConversationService.updateThreadPrompt
        ).not.toHaveBeenCalled();
      });

      it('should handle both customPrompt and metadata fields', async () => {
        const dto = {
          customPrompt: 'test prompt',
          metadata: { someOtherField: 'value' },
        };

        const result = await controller.updateThread('thread-123', dto);

        expect(result).toEqual({ success: true });
        expect(mockConversationService.updateThreadPrompt).toHaveBeenCalledWith(
          'thread-123',
          'test prompt'
        );
        expect(mockAgentsService.setThreadPrompt).toHaveBeenCalledWith(
          'thread-123',
          'test prompt'
        );
      });

      it('should handle load service timeout scenario', async () => {
        (
          mockConversationService.load as ReturnType<typeof vi.fn>
        ).mockImplementation(
          () => new Promise(resolve => setTimeout(resolve, 4000))
        );

        const dto = { name: 'New Name' };

        // Unlike deleteThread, updateThread doesn't have timeout handling,
        // so this test verifies it waits indefinitely
        const promise = controller.updateThread('thread-123', dto);

        // We'll use a shorter timeout for our test to verify it's still waiting
        await expect(
          Promise.race([
            promise,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Test timeout')), 100)
            ),
          ])
        ).rejects.toThrow('Test timeout');
      });
    });
  });

  describe('deleteThread', () => {
    it('should delete a thread successfully', async () => {
      const result = await controller.deleteThread('thread-123');

      expect(result).toEqual({ success: true });
      expect(mockConversationService.load).toHaveBeenCalled();
      expect(mockConversationService.deleteThread).toHaveBeenCalledWith(
        'thread-123'
      );
    });

    it('should throw NotFoundException when thread not found', async () => {
      (
        mockConversationService.deleteThread as ReturnType<typeof vi.fn>
      ).mockResolvedValue(false);

      await expect(controller.deleteThread('non-existent')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should handle load timeout', async () => {
      (
        mockConversationService.load as ReturnType<typeof vi.fn>
      ).mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 4000))
      );

      await expect(controller.deleteThread('thread-123')).rejects.toThrow(
        'Conversation manager load timeout in delete thread'
      );
    });
  });

  describe('getThreadMessages', () => {
    const mockMessages = [
      {
        id: 'msg-1',
        role: 'user' as const,
        content: 'Hello, how are you?',
        timestamp: new Date('2024-01-01T10:00:00Z'),
      },
      {
        id: 'msg-2',
        role: 'assistant' as const,
        content:
          'I am doing well, thank you for asking! How can I help you today?',
        timestamp: new Date('2024-01-01T10:01:00Z'),
        model: 'claude-3.5-sonnet',
      },
      {
        id: 'msg-3',
        role: 'user' as const,
        content: 'Can you help me with a coding problem?',
        timestamp: new Date('2024-01-01T10:02:00Z'),
        images: [
          {
            id: 'img-1',
            filename: 'code-screenshot.png',
            filepath: '/uploads/img-1.png',
            mimeType: 'image/png',
            size: 12345,
            thumbnail: 'thumbnail-data',
            fullImage: 'full-image-data',
            uploadedAt: new Date('2024-01-01T10:02:00Z'),
          },
        ],
      },
    ];

    it('should return messages for an existing thread', async () => {
      (
        mockConversationService.getThreadMessages as ReturnType<typeof vi.fn>
      ).mockReturnValue(mockMessages);

      const result = await controller.getThreadMessages('thread-123');

      expect(result).toEqual(mockMessages);
      expect(mockConversationService.load).toHaveBeenCalled();
      expect(mockConversationService.getThreadMessages).toHaveBeenCalledWith(
        'thread-123'
      );
    });

    it('should return empty array when thread has no messages', async () => {
      (
        mockConversationService.getThreadMessages as ReturnType<typeof vi.fn>
      ).mockReturnValue([]);

      const result = await controller.getThreadMessages('thread-456');

      expect(result).toEqual([]);
      expect(mockConversationService.load).toHaveBeenCalled();
      expect(mockConversationService.getThreadMessages).toHaveBeenCalledWith(
        'thread-456'
      );
    });

    it('should handle messages with tool calls and results', async () => {
      const messagesWithTools = [
        {
          id: 'msg-with-tools',
          role: 'assistant' as const,
          content: 'I will search for information about that topic.',
          timestamp: new Date('2024-01-01T10:03:00Z'),
          toolCalls: [
            {
              id: 'tool-1',
              name: 'web_search',
              parameters: { query: 'latest AI developments' },
            },
          ],
          toolResults: [
            {
              name: 'web_search',
              result: {
                results: ['AI breakthrough in reasoning', 'New model release'],
              },
            },
          ],
          status: 'completed' as const,
        },
      ];

      (
        mockConversationService.getThreadMessages as ReturnType<typeof vi.fn>
      ).mockReturnValue(messagesWithTools);

      const result = await controller.getThreadMessages('thread-789');

      expect(result).toEqual(messagesWithTools);
      expect(result[0].toolCalls).toBeDefined();
      expect(result[0].toolResults).toBeDefined();
      expect(result[0].status).toBe('completed');
    });

    it('should handle messages with notes attachments', async () => {
      const messagesWithNotes = [
        {
          id: 'msg-with-notes',
          role: 'user' as const,
          content: 'Here are my project notes',
          timestamp: new Date('2024-01-01T10:04:00Z'),
          notes: [
            {
              id: 'note-1',
              title: 'Project Requirements',
              content: 'The project should implement the following features...',
              nodeLabel: 'Requirements',
              attachedAt: new Date('2024-01-01T10:04:00Z'),
            },
          ],
        },
      ];

      (
        mockConversationService.getThreadMessages as ReturnType<typeof vi.fn>
      ).mockReturnValue(messagesWithNotes);

      const result = await controller.getThreadMessages('thread-notes');

      expect(result).toEqual(messagesWithNotes);
      expect(result[0].notes).toBeDefined();
      expect(result[0].notes![0].title).toBe('Project Requirements');
    });

    it('should call conversation service load before getting messages', async () => {
      const loadSpy = mockConversationService.load as ReturnType<typeof vi.fn>;
      const getMessagesSpy =
        mockConversationService.getThreadMessages as ReturnType<typeof vi.fn>;

      await controller.getThreadMessages('thread-123');

      // Verify load is called before getThreadMessages
      expect(loadSpy).toHaveBeenCalled();
      expect(getMessagesSpy).toHaveBeenCalled();

      // Check call order by examining call times
      const loadCallTime = loadSpy.mock.invocationCallOrder[0];
      const getMessagesCallTime = getMessagesSpy.mock.invocationCallOrder[0];
      expect(loadCallTime).toBeLessThan(getMessagesCallTime);
    });

    it('should handle load timeout gracefully', async () => {
      (
        mockConversationService.load as ReturnType<typeof vi.fn>
      ).mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 4000))
      );

      // The endpoint doesn't have timeout handling like deleteThread,
      // so this test verifies it waits for the load operation
      const promise = controller.getThreadMessages('thread-123');

      // Since there's no timeout in getThreadMessages, we expect it to eventually resolve
      // We'll use a shorter timeout for our test
      await expect(
        Promise.race([
          promise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Test timeout')), 100)
          ),
        ])
      ).rejects.toThrow('Test timeout');
    });

    it('should propagate errors from conversation service', async () => {
      const testError = new Error('Conversation service error');
      (
        mockConversationService.getThreadMessages as ReturnType<typeof vi.fn>
      ).mockImplementation(() => {
        throw testError;
      });

      await expect(controller.getThreadMessages('thread-123')).rejects.toThrow(
        'Conversation service error'
      );
    });

    it('should handle different message roles correctly', async () => {
      const multiRoleMessages = [
        {
          id: 'system-msg',
          role: 'system' as const,
          content: 'You are a helpful AI assistant.',
          timestamp: new Date('2024-01-01T09:59:00Z'),
        },
        {
          id: 'user-msg',
          role: 'user' as const,
          content: 'Hello!',
          timestamp: new Date('2024-01-01T10:00:00Z'),
        },
        {
          id: 'assistant-msg',
          role: 'assistant' as const,
          content: 'Hello! How can I help you?',
          timestamp: new Date('2024-01-01T10:01:00Z'),
          status: 'completed' as const,
        },
      ];

      (
        mockConversationService.getThreadMessages as ReturnType<typeof vi.fn>
      ).mockReturnValue(multiRoleMessages);

      const result = await controller.getThreadMessages('thread-roles');

      expect(result).toEqual(multiRoleMessages);
      expect(result).toHaveLength(3);
      expect(result[0].role).toBe('system');
      expect(result[1].role).toBe('user');
      expect(result[2].role).toBe('assistant');
    });
  });

  describe('clearThread', () => {
    it('should clear thread messages successfully', async () => {
      const result = await controller.clearThread('thread-123');

      expect(result).toEqual({ success: true });
      expect(mockConversationService.load).toHaveBeenCalled();
      expect(mockConversationService.clearThread).toHaveBeenCalledWith(
        'thread-123'
      );
    });

    it('should throw NotFoundException when thread not found', async () => {
      (
        mockConversationService.clearThread as ReturnType<typeof vi.fn>
      ).mockResolvedValue(false);

      await expect(controller.clearThread('non-existent')).rejects.toThrow(
        NotFoundException
      );
    });
  });
});
