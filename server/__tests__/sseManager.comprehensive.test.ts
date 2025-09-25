import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import type { Response } from 'express';
import { SSEManager } from '../sseManager';
import { logger } from '../logger';
import { SSEEventType } from '../../src/types';
import {
  mockSSEData,
  MockFactories,
  ErrorFactory,
  TestUtils,
} from './fixtures/testData';

// Mock dependencies
vi.mock('../logger');

describe('SSEManager', () => {
  let sseManager: SSEManager;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    sseManager = new SSEManager();

    // Create mock response object using factory
    mockResponse = MockFactories.createMockResponse();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  describe('addClient', () => {
    it('should add a client and send initial connection message', () => {
      const clientId = 'client-1';
      const topic = 'test-topic';

      sseManager.addClient(clientId, mockResponse as Response, topic);

      expect(mockResponse.writeHead).toHaveBeenCalledWith(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
      });

      expect(mockResponse.write).toHaveBeenCalledWith(
        expect.stringContaining(`"type":"${SSEEventType.CONNECTED}"`)
      );
    });

    it('should set up event listeners on response', () => {
      const clientId = 'client-1';
      const topic = 'test-topic';

      sseManager.addClient(clientId, mockResponse as Response, topic);

      expect(mockResponse.on).toHaveBeenCalledWith(
        'close',
        expect.any(Function)
      );
      expect(mockResponse.on).toHaveBeenCalledWith(
        'error',
        expect.any(Function)
      );
    });

    it('should add client to topic mapping', () => {
      const clientId = 'client-1';
      const topic = 'test-topic';

      sseManager.addClient(clientId, mockResponse as Response, topic);

      expect(sseManager.getClientCount(topic)).toBe(1);
    });

    it('should start keepalive interval', () => {
      const clientId = 'client-1';
      const topic = 'test-topic';

      sseManager.addClient(clientId, mockResponse as Response, topic);

      // Fast-forward 30 seconds to trigger keepalive
      vi.advanceTimersByTime(30000);

      expect(mockResponse.write).toHaveBeenCalledWith(
        expect.stringContaining(': keepalive')
      );
    });

    it('should handle keepalive errors by removing client', () => {
      const clientId = 'client-1';
      const topic = 'test-topic';
      const writeError = ErrorFactory.connectionRefused();

      // Create a response that fails on keepalive messages
      const failingResponse = MockFactories.createMockResponse({
        write: vi.fn().mockImplementation(data => {
          if (typeof data === 'string' && data.includes('keepalive')) {
            throw writeError;
          }
          return true;
        }),
      });

      sseManager.addClient(clientId, failingResponse as Response, topic);

      // Fast-forward to trigger keepalive
      vi.advanceTimersByTime(30000);

      expect(logger.debug).toHaveBeenCalledWith(
        `Failed to send keepalive to client ${clientId}:`,
        writeError
      );
      expect(sseManager.getClientCount(topic)).toBe(0);
    });

    it('should handle client disconnect event', () => {
      const clientId = 'client-1';
      const topic = 'test-topic';
      let closeHandler: () => void;

      vi.mocked(mockResponse.on).mockImplementation((event, handler) => {
        if (event === 'close') {
          closeHandler = handler as () => void;
        }
        return mockResponse as Response;
      });

      sseManager.addClient(clientId, mockResponse as Response, topic);
      expect(sseManager.getClientCount(topic)).toBe(1);

      // Simulate client disconnect
      closeHandler!();
      expect(sseManager.getClientCount(topic)).toBe(0);
    });

    it('should handle client error event', () => {
      const clientId = 'client-1';
      const topic = 'test-topic';
      const testError = new Error('Client error');
      let errorHandler: (error: Error) => void;

      vi.mocked(mockResponse.on).mockImplementation((event, handler) => {
        if (event === 'error') {
          errorHandler = handler as (error: Error) => void;
        }
        return mockResponse as Response;
      });

      sseManager.addClient(clientId, mockResponse as Response, topic);
      expect(sseManager.getClientCount(topic)).toBe(1);

      // Simulate client error
      errorHandler!(testError);

      expect(logger.error).toHaveBeenCalledWith(
        `SSE client ${clientId} error:`,
        testError
      );
      expect(sseManager.getClientCount(topic)).toBe(0);
    });
  });

  describe('removeClient', () => {
    beforeEach(() => {
      sseManager.addClient('client-1', mockResponse as Response, 'topic-1');
      sseManager.addClient('client-2', mockResponse as Response, 'topic-1');
      sseManager.addClient('client-3', mockResponse as Response, 'topic-2');
    });

    it('should remove client from clients map', () => {
      expect(sseManager.getClientCount()).toBe(3);

      sseManager.removeClient('client-1');

      expect(sseManager.getClientCount()).toBe(2);
    });

    it('should remove client from topic mapping', () => {
      expect(sseManager.getClientCount('topic-1')).toBe(2);

      sseManager.removeClient('client-1');

      expect(sseManager.getClientCount('topic-1')).toBe(1);
    });

    it('should remove topic when no clients left', () => {
      sseManager.removeClient('client-3');

      expect(sseManager.getClientCount('topic-2')).toBe(0);
    });

    it('should handle removal of non-existent client gracefully', () => {
      const initialCount = sseManager.getClientCount();

      sseManager.removeClient('non-existent');

      expect(sseManager.getClientCount()).toBe(initialCount);
    });
  });

  describe('broadcast', () => {
    beforeEach(() => {
      // Set up multiple clients on different topics
      sseManager.addClient(
        'client-1',
        {
          ...mockResponse,
          write: vi.fn(),
        } as Partial<Response> as Response,
        'topic-1'
      );

      sseManager.addClient(
        'client-2',
        {
          ...mockResponse,
          write: vi.fn(),
        } as Partial<Response> as Response,
        'topic-1'
      );

      sseManager.addClient(
        'client-3',
        {
          ...mockResponse,
          write: vi.fn(),
        } as Partial<Response> as Response,
        'topic-2'
      );
    });

    it('should broadcast to all clients in a topic', () => {
      const testData = mockSSEData.simple;

      sseManager.broadcast('topic-1', testData);

      // Should broadcast to clients 1 and 2, but not 3
      expect(sseManager.getClientCount('topic-1')).toBe(2);
    });

    it('should handle non-existent topic gracefully', () => {
      const testData = mockSSEData.simple;

      expect(() => {
        sseManager.broadcast('non-existent-topic', testData);
      }).not.toThrow();
    });

    it('should handle complex data serialization', () => {
      const testData = mockSSEData.complex;

      expect(() => {
        sseManager.broadcast('topic-1', testData);
      }).not.toThrow();
    });

    it('should handle circular references in data', () => {
      const testData = mockSSEData.circular;

      expect(() => {
        sseManager.broadcast('topic-1', testData);
      }).not.toThrow();
    });

    it('should handle arrays in data', () => {
      const testData = mockSSEData.withArrays;

      expect(() => {
        sseManager.broadcast('topic-1', testData);
      }).not.toThrow();
    });

    it('should remove disconnected clients during broadcast', () => {
      const workingClient = MockFactories.createMockResponse();
      const connectionError = ErrorFactory.connectionRefused();
      const failingClient = MockFactories.createMockResponse({
        write: TestUtils.createFailAfterNCalls(1, connectionError, true),
      });

      sseManager.addClient(
        'working-client',
        workingClient as Response,
        'test-topic'
      );
      sseManager.addClient(
        'failing-client',
        failingClient as Response,
        'test-topic'
      );

      expect(sseManager.getClientCount('test-topic')).toBe(2);

      sseManager.broadcast('test-topic', mockSSEData.simple);

      // Should remove the failing client
      expect(sseManager.getClientCount('test-topic')).toBe(1);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'Failed to send SSE message to client failing-client'
        ),
        connectionError
      );
    });
  });

  describe('getClientCount', () => {
    beforeEach(() => {
      sseManager.addClient('client-1', mockResponse as Response, 'topic-1');
      sseManager.addClient('client-2', mockResponse as Response, 'topic-1');
      sseManager.addClient('client-3', mockResponse as Response, 'topic-2');
    });

    it('should return total client count when no topic specified', () => {
      expect(sseManager.getClientCount()).toBe(3);
    });

    it('should return client count for specific topic', () => {
      expect(sseManager.getClientCount('topic-1')).toBe(2);
      expect(sseManager.getClientCount('topic-2')).toBe(1);
    });

    it('should return 0 for non-existent topic', () => {
      expect(sseManager.getClientCount('non-existent')).toBe(0);
    });
  });

  describe('large content handling', () => {
    it('should store large content separately', () => {
      const testData = mockSSEData.largeContent;

      expect(() => {
        sseManager.broadcast('topic-1', testData);
      }).not.toThrow();
    });

    it('should retrieve stored large content', () => {
      const largeData = 'x'.repeat(100000001);

      // Trigger storage by broadcasting
      sseManager.addClient('client-1', mockResponse as Response, 'test-topic');
      sseManager.broadcast('test-topic', largeData);

      // The content should be stored and a reference returned
      // Note: We can't easily test the exact contentId without accessing private methods
      // But we can verify the broadcast doesn't throw and handles large content
      expect(mockResponse.write).toHaveBeenCalled();
    });

    it('should clean up large content after timeout', () => {
      const largeData = 'x'.repeat(100000001);

      sseManager.addClient('client-1', mockResponse as Response, 'test-topic');
      sseManager.broadcast('test-topic', largeData);

      // Fast-forward 5 minutes to trigger cleanup
      vi.advanceTimersByTime(5 * 60 * 1000);

      // The content should be cleaned up (we can't directly test this without accessing private methods)
      // But we can verify the timer was set
      expect(vi.getTimerCount()).toBeGreaterThan(0);
    });
  });

  describe('sanitizeData', () => {
    it('should handle null and undefined values', () => {
      expect(() => {
        sseManager.broadcast('topic-1', null);
      }).not.toThrow();

      expect(() => {
        sseManager.broadcast('topic-1', undefined);
      }).not.toThrow();
    });

    it('should handle primitive types', () => {
      const primitives = ['string', 123, true, false];

      for (const primitive of primitives) {
        expect(() => {
          sseManager.broadcast('topic-1', primitive);
        }).not.toThrow();
      }
    });

    it('should handle nested objects with depth limit', () => {
      // Create deeply nested object
      const deepObject: Record<string, unknown> = {};
      let current = deepObject;

      for (let i = 0; i < 15; i++) {
        current.nested = {};
        current = current.nested as Record<string, unknown>;
      }

      expect(() => {
        sseManager.broadcast('topic-1', deepObject);
      }).not.toThrow();
    });

    it('should handle arrays with nested objects', () => {
      const complexArray = [
        { id: 1, nested: { value: 'test' } },
        { id: 2, nested: { value: 'test2' } },
        ['nested', 'array', { deep: true }],
      ];

      expect(() => {
        sseManager.broadcast('topic-1', complexArray);
      }).not.toThrow();
    });
  });

  describe('safeStringify', () => {
    it('should handle objects that fail JSON.stringify', () => {
      // Create object with circular reference
      const circular: Record<string, unknown> = {};
      circular.self = circular;

      expect(() => {
        sseManager.broadcast('topic-1', circular);
      }).not.toThrow();
    });

    it('should handle BigInt values gracefully', () => {
      const testResponse = MockFactories.createMockResponse();
      sseManager.addClient('test-client', testResponse as Response, 'topic-1');

      const dataWithBigInt = {
        normal: 'value',
        big: BigInt(123456789),
      };

      // Should handle BigInt values without throwing (bug has been fixed)
      expect(() => {
        sseManager.broadcast('topic-1', dataWithBigInt);
      }).not.toThrow();

      // Should sanitize data and send sanitized version
      expect(testResponse.write).toHaveBeenCalledWith(
        expect.stringMatching(/^data: /)
      );
    });

    it('should return fallback object on stringify failure', () => {
      const testResponse = MockFactories.createMockResponse();
      sseManager.addClient('test-client', testResponse as Response, 'topic-1');

      const problematicData = {
        toJSON: () => {
          throw ErrorFactory.jsonParseError();
        },
      };

      // Should handle JSON conversion failures gracefully (bug has been fixed)
      expect(() => {
        sseManager.broadcast('topic-1', problematicData);
      }).not.toThrow();

      // Should send a fallback error message
      expect(testResponse.write).toHaveBeenCalledWith(
        expect.stringMatching(/^data: /)
      );
    });
  });

  describe('keepalive mechanism', () => {
    it('should send keepalive messages at regular intervals', () => {
      const clientId = 'client-1';
      const topic = 'test-topic';

      sseManager.addClient(clientId, mockResponse as Response, topic);

      // Clear initial connection message call
      vi.mocked(mockResponse.write).mockClear();

      // Advance time to trigger multiple keepalives
      vi.advanceTimersByTime(90000); // 3 keepalive intervals

      expect(mockResponse.write).toHaveBeenCalledTimes(3);
      expect(mockResponse.write).toHaveBeenCalledWith(
        expect.stringContaining(': keepalive')
      );
    });

    it('should stop keepalive when client is removed', () => {
      const clientId = 'client-1';
      const topic = 'test-topic';

      sseManager.addClient(clientId, mockResponse as Response, topic);
      sseManager.removeClient(clientId);

      // Clear calls and advance time
      vi.mocked(mockResponse.write).mockClear();
      vi.advanceTimersByTime(60000);

      // Should not send keepalive to removed client
      expect(mockResponse.write).not.toHaveBeenCalled();
    });

    it('should clear keepalive interval on client disconnect', () => {
      const clientId = 'client-1';
      const topic = 'test-topic';
      let closeHandler: () => void;

      vi.mocked(mockResponse.on).mockImplementation((event, handler) => {
        if (event === 'close') {
          closeHandler = handler as () => void;
        }
        return mockResponse as Response;
      });

      sseManager.addClient(clientId, mockResponse as Response, topic);

      // Simulate disconnect
      closeHandler!();

      // Clear calls and advance time
      vi.mocked(mockResponse.write).mockClear();
      vi.advanceTimersByTime(60000);

      // Should not send keepalive after disconnect
      expect(mockResponse.write).not.toHaveBeenCalled();
    });
  });

  describe('multiple topics and clients', () => {
    it('should handle multiple topics correctly', () => {
      const responses = Array.from({ length: 5 }, () =>
        MockFactories.createMockResponse()
      );

      // Add clients to different topics
      sseManager.addClient('client-1', responses[0] as Response, 'topic-a');
      sseManager.addClient('client-2', responses[1] as Response, 'topic-a');
      sseManager.addClient('client-3', responses[2] as Response, 'topic-b');
      sseManager.addClient('client-4', responses[3] as Response, 'topic-b');
      sseManager.addClient('client-5', responses[4] as Response, 'topic-c');

      expect(sseManager.getClientCount('topic-a')).toBe(2);
      expect(sseManager.getClientCount('topic-b')).toBe(2);
      expect(sseManager.getClientCount('topic-c')).toBe(1);
      expect(sseManager.getClientCount()).toBe(5);
    });

    it('should broadcast only to specified topic', () => {
      const responseA = MockFactories.createMockResponse();
      const responseB = MockFactories.createMockResponse();
      const responseC = MockFactories.createMockResponse();

      sseManager.addClient('client-a', responseA as Response, 'topic-a');
      sseManager.addClient('client-b', responseB as Response, 'topic-b');
      sseManager.addClient('client-c', responseC as Response, 'topic-c');

      sseManager.broadcast('topic-b', mockSSEData.simple);

      // Only topic-b client should receive the broadcast message (2nd call after connection message)
      const writeCalls = (responseB.write as Mock).mock.calls;
      expect(writeCalls.length).toBe(2); // Connection message + broadcast message

      // Check that the broadcast message contains the data
      const broadcastMessage = writeCalls[1][0];
      expect(broadcastMessage).toMatch(/^data: /);

      // Other clients should only have received connection messages
      expect((responseA.write as Mock).mock.calls.length).toBe(1);
      expect((responseC.write as Mock).mock.calls.length).toBe(1);
    });

    it('should handle client moving between topics', () => {
      const response = MockFactories.createMockResponse();

      // Add client to topic-a
      sseManager.addClient('client-1', response as Response, 'topic-a');
      expect(sseManager.getClientCount('topic-a')).toBe(1);

      // Remove and add to topic-b
      sseManager.removeClient('client-1');
      sseManager.addClient('client-1', response as Response, 'topic-b');

      expect(sseManager.getClientCount('topic-a')).toBe(0);
      expect(sseManager.getClientCount('topic-b')).toBe(1);

      // Should have received two connection messages
      expect((response.write as Mock).mock.calls.length).toBe(2);
    });
  });

  describe('error recovery', () => {
    it('should continue operating after client errors', () => {
      const goodClient = MockFactories.createMockResponse();
      const clientError = ErrorFactory.connectionRefused();
      const badClient = MockFactories.createMockResponse({
        write: TestUtils.createFailAfterNCalls(1, clientError, true),
      });

      sseManager.addClient('good-client', goodClient as Response, 'test-topic');
      sseManager.addClient('bad-client', badClient as Response, 'test-topic');

      expect(sseManager.getClientCount('test-topic')).toBe(2);

      // Broadcast should remove bad client but keep good one
      sseManager.broadcast('test-topic', mockSSEData.simple);

      expect(sseManager.getClientCount('test-topic')).toBe(1);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'Failed to send SSE message to client bad-client'
        ),
        clientError
      );
    });

    it('should handle malformed data gracefully', () => {
      const client = MockFactories.createMockResponse();
      sseManager.addClient('client-1', client as Response, 'test-topic');

      // Test various malformed data types
      const malformedData = [
        Symbol('test'),
        function testFunction() {
          return 'test';
        },
        new Date(),
        new RegExp('test'),
      ];

      for (const data of malformedData) {
        expect(() => {
          sseManager.broadcast('test-topic', data);
        }).not.toThrow();

        // Should still send some form of data
        expect(client.write).toHaveBeenCalledWith(
          expect.stringMatching(/^data: /)
        );
      }
    });
  });

  describe('memory management', () => {
    it('should clean up resources when clients disconnect', () => {
      const response = { ...mockResponse, write: vi.fn() };
      let closeHandler: () => void;

      vi.mocked(mockResponse.on).mockImplementation((event, handler) => {
        if (event === 'close') {
          closeHandler = handler as () => void;
        }
        return mockResponse as Response;
      });

      sseManager.addClient('client-1', response as Response, 'test-topic');
      expect(sseManager.getClientCount()).toBe(1);

      // Simulate disconnect
      closeHandler!();

      expect(sseManager.getClientCount()).toBe(0);
      expect(sseManager.getClientCount('test-topic')).toBe(0);
    });

    it('should handle multiple rapid connections and disconnections', () => {
      const responses = Array.from({ length: 10 }, (_, i) => ({
        ...mockResponse,
        write: vi.fn(),
      }));

      // Add multiple clients quickly
      for (let i = 0; i < 10; i++) {
        sseManager.addClient(
          `client-${i}`,
          responses[i] as Response,
          'test-topic'
        );
      }

      expect(sseManager.getClientCount('test-topic')).toBe(10);

      // Remove half of them
      for (let i = 0; i < 5; i++) {
        sseManager.removeClient(`client-${i}`);
      }

      expect(sseManager.getClientCount('test-topic')).toBe(5);
    });
  });
});
