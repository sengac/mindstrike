/**
 * Unit tests for SSE Decoder
 * Tests base64 decoding, large content handling, and type safety
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  decodeSseData,
  decodeSseDataSync,
  decodeSseEventData,
  isSseObject,
  isSseCompletedData,
  isSseLocalModelNotLoadedData,
  isSseMessageUpdateData,
  isSseContentChunkData,
  isSseDebugEntryData,
  isSseTokenStatsData,
  isSseMcpLogData,
  isSseMindmapChangeData,
  isSseWorkflowStartedData,
  isSseTasksPlannedData,
  isSseTaskProgressData,
  isSseTaskCompletedData,
  type SseObjectData,
  type SseDataWithBase64,
  type SseDataWithLargeContent,
} from '../sseDecoder';
import { SSE_CONFIG } from '../../constants/sse.constants';

// Mock dependencies
vi.mock('../logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock fetch for large content tests
vi.stubGlobal('fetch', vi.fn());

describe('SSE Decoder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('decodeSseDataSync', () => {
    it('should return primitive values as-is', () => {
      expect(decodeSseDataSync('string')).toBe('string');
      expect(decodeSseDataSync(123)).toBe(123);
      expect(decodeSseDataSync(true)).toBe(true);
      expect(decodeSseDataSync(null)).toBe(null);
    });

    it('should decode base64 encoded data', () => {
      const originalText = 'Hello, World! 👋';
      const base64Encoded = btoa(
        encodeURIComponent(originalText).replace(
          /%([0-9A-F]{2})/g,
          (_: string, p1: string) => String.fromCharCode(parseInt(p1, 16))
        )
      );

      const encodedData = {
        _base64: true,
        data: base64Encoded,
      };

      const result = decodeSseDataSync(encodedData);
      expect(result).toBe(originalText);
    });

    it('should handle large content placeholder', () => {
      const largeContentData = {
        _large_content: true,
        contentId: 'content-123',
        length: 5000,
      };

      const result = decodeSseDataSync(largeContentData);
      expect(result).toBe('[Large content - 5000 characters]');
    });

    it('should decode nested objects', () => {
      const nestedData = {
        message: {
          content: 'Hello',
          metadata: {
            timestamp: 1234567890,
            author: 'user',
          },
        },
        status: 'completed',
      };

      const result = decodeSseDataSync(nestedData);
      expect(result).toEqual(nestedData);
    });

    it('should decode arrays', () => {
      const arrayData = [
        'string',
        123,
        { nested: true },
        {
          _base64: true,
          data: btoa('encoded'),
        },
      ];

      const result = decodeSseDataSync(arrayData);
      expect(result).toEqual(['string', 123, { nested: true }, 'encoded']);
    });

    it('should handle objects with base64 fields', () => {
      const complexData = {
        id: 'msg-123',
        content: {
          _base64: true,
          data: btoa('Long message content'),
        },
        metadata: {
          timestamp: 1234567890,
        },
      };

      const result = decodeSseDataSync(complexData);
      expect(result).toEqual({
        id: 'msg-123',
        content: 'Long message content',
        metadata: {
          timestamp: 1234567890,
        },
      });
    });
  });

  describe('decodeSseData (async)', () => {
    it('should fetch large content successfully', async () => {
      const largeContent = 'This is a very large content string...';
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: largeContent }),
      } as Response);

      const largeContentData = {
        _large_content: true,
        contentId: 'content-123',
        length: largeContent.length,
      };

      const result = await decodeSseData(largeContentData);
      expect(result).toBe(largeContent);
      expect(global.fetch).toHaveBeenCalledWith(
        `${SSE_CONFIG.LARGE_CONTENT_ENDPOINT}/content-123`
      );
    });

    it('should handle large content fetch failure', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as Response);

      const largeContentData = {
        _large_content: true,
        contentId: 'content-404',
        length: 1000,
      };

      const result = await decodeSseData(largeContentData);
      expect(result).toBe('[Large content not available - 1000 characters]');
    });

    it('should handle large content fetch error', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'));

      const largeContentData = {
        _large_content: true,
        contentId: 'content-error',
        length: 2000,
      };

      const result = await decodeSseData(largeContentData);
      expect(result).toBe('[Large content error - 2000 characters]');
    });

    it('should decode complex nested structures with async content', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: 'Fetched content' }),
      } as Response);

      const complexData = {
        messages: [
          {
            id: 'msg-1',
            content: 'Normal content',
          },
          {
            id: 'msg-2',
            content: {
              _large_content: true,
              contentId: 'large-1',
              length: 5000,
            },
          },
        ],
        metadata: {
          encoded: {
            _base64: true,
            data: btoa('Encoded metadata'),
          },
        },
      };

      const result = await decodeSseData(complexData);
      expect(result).toEqual({
        messages: [
          {
            id: 'msg-1',
            content: 'Normal content',
          },
          {
            id: 'msg-2',
            content: 'Fetched content',
          },
        ],
        metadata: {
          encoded: 'Encoded metadata',
        },
      });
    });
  });

  describe('decodeSseEventData', () => {
    it('should always return an object', async () => {
      const result1 = await decodeSseEventData('string');
      expect(result1).toEqual({ rawData: 'string' });

      const result2 = await decodeSseEventData(123);
      expect(result2).toEqual({ rawData: 123 });

      const result3 = await decodeSseEventData({ type: 'test', data: 'value' });
      expect(result3).toEqual({ type: 'test', data: 'value' });
    });
  });

  describe('Type Guards', () => {
    describe('isSseObject', () => {
      it('should identify objects correctly', () => {
        expect(isSseObject({})).toBe(true);
        expect(isSseObject({ key: 'value' })).toBe(true);
        expect(isSseObject('string')).toBe(false);
        expect(isSseObject(123)).toBe(false);
        expect(isSseObject(null)).toBe(false);
        expect(isSseObject([])).toBe(false);
      });
    });

    describe('isSseCompletedData', () => {
      it('should identify completed data', () => {
        const validCompleted: SseObjectData = {
          type: 'completed',
          message: {
            id: 'msg-123',
            content: 'Hello',
            role: 'assistant',
            timestamp: '2024-01-01T00:00:00Z',
          },
        };

        expect(isSseCompletedData(validCompleted)).toBe(true);
        expect(isSseCompletedData({ type: 'completed' })).toBe(false);
        expect(isSseCompletedData({ type: 'other', message: {} })).toBe(false);
      });
    });

    describe('isSseLocalModelNotLoadedData', () => {
      it('should identify local model not loaded data', () => {
        const validData: SseObjectData = {
          type: 'local-model-not-loaded',
          modelId: 'llama-2',
          error: 'Model not loaded',
        };

        expect(isSseLocalModelNotLoadedData(validData)).toBe(true);
        expect(
          isSseLocalModelNotLoadedData({ type: 'local-model-not-loaded' })
        ).toBe(false);
        expect(
          isSseLocalModelNotLoadedData({
            type: 'local-model-not-loaded',
            modelId: 'test',
          })
        ).toBe(false);
      });
    });

    describe('isSseMessageUpdateData', () => {
      it('should identify message update data', () => {
        const validData: SseObjectData = {
          type: 'message-update',
          message: {
            id: 'msg-123',
            content: 'Hello',
            role: 'assistant',
            timestamp: '2024-01-01T00:00:00Z',
          },
        };

        expect(isSseMessageUpdateData(validData)).toBe(true);
        expect(isSseMessageUpdateData({ type: 'message-update' })).toBe(false);
      });
    });

    describe('isSseContentChunkData', () => {
      it('should identify content chunk data', () => {
        const validData: SseObjectData = {
          type: 'content-chunk',
          chunk: 'Hello',
          messageId: 'msg-123',
        };

        expect(isSseContentChunkData(validData)).toBe(true);
        expect(isSseContentChunkData({ type: 'content-chunk' })).toBe(true);
        expect(isSseContentChunkData({ type: 'other' })).toBe(false);
      });
    });

    describe('isSseDebugEntryData', () => {
      it('should identify debug entry data', () => {
        const validData: SseObjectData = {
          type: 'debug-entry',
          entryType: 'error',
          title: 'Error occurred',
          content: 'Stack trace...',
        };

        expect(isSseDebugEntryData(validData)).toBe(true);
        expect(isSseDebugEntryData({ type: 'debug-entry' })).toBe(false);
        expect(
          isSseDebugEntryData({
            type: 'debug-entry',
            entryType: 'error',
            title: 'Test',
          })
        ).toBe(false);
      });
    });

    describe('isSseTokenStatsData', () => {
      it('should identify token stats data', () => {
        const validData: SseObjectData = {
          type: 'token-stats',
          tokensPerSecond: 25.5,
          totalTokens: 150,
          isGenerating: true,
        };

        expect(isSseTokenStatsData(validData)).toBe(true);
        expect(isSseTokenStatsData({ type: 'token-stats' })).toBe(false);
        expect(
          isSseTokenStatsData({
            type: 'token-stats',
            tokensPerSecond: 25.5,
            totalTokens: 150,
          })
        ).toBe(false);
      });
    });

    describe('isSseMcpLogData', () => {
      it('should identify MCP log data', () => {
        const validData: SseObjectData = {
          type: 'mcp-log',
          id: 'log-123',
          timestamp: 1234567890,
          serverId: 'server-1',
          level: 'error',
          message: 'Error message',
        };

        expect(isSseMcpLogData(validData)).toBe(true);
        expect(isSseMcpLogData({ type: 'mcp-log' })).toBe(false);
      });
    });

    describe('isSseMindmapChangeData', () => {
      it('should identify mindmap change data', () => {
        const validData: SseObjectData = {
          type: 'mindmap_change',
          action: 'create',
          text: 'New node',
        };

        expect(isSseMindmapChangeData(validData)).toBe(true);
        expect(isSseMindmapChangeData({ type: 'mindmap_change' })).toBe(false);
      });
    });

    describe('isSseWorkflowStartedData', () => {
      it('should identify workflow started data', () => {
        const validData: SseObjectData = {
          type: 'workflow_started',
          workflowId: 'wf-123',
          originalQuery: 'Test query',
        };

        expect(isSseWorkflowStartedData(validData)).toBe(true);
        expect(isSseWorkflowStartedData({ type: 'workflow_started' })).toBe(
          false
        );
      });
    });

    describe('isSseTasksPlannedData', () => {
      it('should identify tasks planned data', () => {
        const validData: SseObjectData = {
          type: 'tasks_planned',
          tasks: [
            { id: 'task-1', description: 'Task 1' },
            { id: 'task-2', description: 'Task 2' },
          ],
        };

        expect(isSseTasksPlannedData(validData)).toBe(true);
        expect(isSseTasksPlannedData({ type: 'tasks_planned' })).toBe(false);
        expect(
          isSseTasksPlannedData({ type: 'tasks_planned', tasks: ['invalid'] })
        ).toBe(false);
      });
    });

    describe('isSseTaskProgressData', () => {
      it('should identify task progress data', () => {
        const validData: SseObjectData = {
          type: 'task_progress',
          task: {
            id: 'task-1',
            status: 'in-progress',
          },
        };

        expect(isSseTaskProgressData(validData)).toBe(true);
        expect(isSseTaskProgressData({ type: 'task_progress' })).toBe(false);
      });
    });

    describe('isSseTaskCompletedData', () => {
      it('should identify task completed data', () => {
        const validData: SseObjectData = {
          type: 'task_completed',
          task: {
            id: 'task-1',
            result: { success: true },
          },
        };

        expect(isSseTaskCompletedData(validData)).toBe(true);
        expect(isSseTaskCompletedData({ type: 'task_completed' })).toBe(false);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in base64 encoding', () => {
      const specialChars = '🚀 Émojis & spëcial çhars ñ 中文';
      const encoded = btoa(
        encodeURIComponent(specialChars).replace(
          /%([0-9A-F]{2})/g,
          (_: string, p1: string) => String.fromCharCode(parseInt(p1, 16))
        )
      );

      const result = decodeSseDataSync({
        _base64: true,
        data: encoded,
      });

      expect(result).toBe(specialChars);
    });

    it('should handle empty base64 data', () => {
      const result = decodeSseDataSync({
        _base64: true,
        data: '',
      });

      expect(result).toBe('');
    });

    it('should handle deeply nested structures', () => {
      const deeplyNested = {
        level1: {
          level2: {
            level3: {
              level4: {
                value: {
                  _base64: true,
                  data: btoa('Deep value'),
                },
              },
            },
          },
        },
      };

      const result = decodeSseDataSync(deeplyNested);
      expect(result).toEqual({
        level1: {
          level2: {
            level3: {
              level4: {
                value: 'Deep value',
              },
            },
          },
        },
      });
    });

    it('should handle mixed array of encoded and normal data', () => {
      // Using object property syntax to satisfy linter while maintaining protocol structure
      const base64Item = {} as SseDataWithBase64;
      Object.assign(base64Item, { ['_base64']: true, data: btoa('First') });

      const largeContentItem = {} as SseDataWithLargeContent;
      Object.assign(largeContentItem, {
        ['_large_content']: true,
        contentId: 'id-1',
        length: 100,
      });

      const nestedBase64Item = {} as SseDataWithBase64;
      Object.assign(nestedBase64Item, {
        ['_base64']: true,
        data: btoa('Nested'),
      });

      const mixedArray = [
        base64Item,
        'Normal string',
        largeContentItem,
        { nested: nestedBase64Item },
      ];

      const result = decodeSseDataSync(mixedArray);
      expect(result).toEqual([
        'First',
        'Normal string',
        '[Large content - 100 characters]',
        { nested: 'Nested' },
      ]);
    });
  });
});
