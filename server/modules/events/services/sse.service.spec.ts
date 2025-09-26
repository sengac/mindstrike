import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { Response } from 'express';
import { SseService } from './sse.service';
import { vi } from 'vitest';

describe('SseService', () => {
  let service: SseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SseService],
    }).compile();

    service = module.get<SseService>(SseService);
  });

  afterEach(() => {
    // Clean up all clients after each test - method doesn't exist yet, skip for now
    // service.removeAllClients();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addClient', () => {
    it('should add a client and return a unique ID', () => {
      const mockResponse = createMockResponse();
      const clientId = 'test-client-id';
      service.addClient(clientId, mockResponse as Response, 'test-topic');

      expect(service.getClientCount()).toBe(1);
    });

    it('should set proper SSE headers', () => {
      const mockResponse = createMockResponse();
      const clientId = 'test-client-' + Math.random().toString(36).substr(2, 9);
      service.addClient(clientId, mockResponse as Response, 'test-topic');

      expect(mockResponse.writeHead).toHaveBeenCalledWith(
        200,
        expect.objectContaining({
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        })
      );
    });

    it('should send initial connection message', () => {
      const mockResponse = createMockResponse();
      const clientId = 'test-client-' + Math.random().toString(36).substr(2, 9);
      service.addClient(clientId, mockResponse as Response, 'test-topic');

      expect(mockResponse.write).toHaveBeenCalledWith(
        expect.stringContaining('"type":"connected"')
      );
    });
  });

  describe('removeClient', () => {
    it('should remove a client by ID', () => {
      const mockResponse = createMockResponse();
      const clientId = 'test-client-' + Math.random().toString(36).substr(2, 9);
      service.addClient(clientId, mockResponse as Response, 'test-topic');

      expect(service.getClientCount()).toBe(1);

      service.removeClient(clientId);

      expect(service.getClientCount()).toBe(0);
    });

    it('should handle removing non-existent client', () => {
      expect(() => service.removeClient('non-existent')).not.toThrow();
    });
  });

  describe('broadcast', () => {
    it('should send data to all clients subscribed to a topic', () => {
      const mockResponse1 = createMockResponse();
      const mockResponse2 = createMockResponse();

      const clientId1 = 'test-client-1';
      const clientId2 = 'test-client-2';
      // Clients are automatically subscribed to topic when added
      service.addClient(clientId1, mockResponse1 as Response, 'test-topic');
      service.addClient(clientId2, mockResponse2 as Response, 'test-topic');

      // Reset mock to check only broadcast calls
      mockResponse1.write.mockClear();
      mockResponse2.write.mockClear();

      const testData = { message: 'Hello World' };
      service.broadcast('test-topic', testData);

      // The service base64 encodes strings, so we expect the base64 pattern
      expect(mockResponse1.write).toHaveBeenCalledWith(
        expect.stringContaining('SGVsbG8gV29ybGQ=') // base64 of "Hello World"
      );
      expect(mockResponse2.write).toHaveBeenCalledWith(
        expect.stringContaining('SGVsbG8gV29ybGQ=') // base64 of "Hello World"
      );
    });

    it('should not send data to clients not subscribed to topic', () => {
      const mockResponse1 = createMockResponse();
      const mockResponse2 = createMockResponse();

      const clientId1 = 'test-client-1';
      const clientId2 = 'test-client-2';
      // Client 1 subscribes to 'test-topic', Client 2 subscribes to 'other-topic'
      service.addClient(clientId1, mockResponse1 as Response, 'test-topic');
      service.addClient(clientId2, mockResponse2 as Response, 'other-topic');

      // Clear initial connection messages
      mockResponse1.write.mockClear();
      mockResponse2.write.mockClear();

      const testData = { message: 'Test Message' };
      service.broadcast('test-topic', testData);

      expect(mockResponse1.write).toHaveBeenCalled();
      expect(mockResponse2.write).not.toHaveBeenCalled();
    });
  });

  describe('sendToClient', () => {
    it('should send data to a specific client', () => {
      const mockResponse = createMockResponse();
      const clientId = 'test-client-' + Math.random().toString(36).substr(2, 9);
      service.addClient(clientId, mockResponse as Response, 'test-topic');

      mockResponse.write.mockClear();

      const testData = { message: 'Direct message' };
      service.sendToClient(clientId, testData);

      // The service base64 encodes strings, so we expect the base64 pattern
      expect(mockResponse.write).toHaveBeenCalledWith(
        expect.stringContaining('RGlyZWN0IG1lc3NhZ2U=') // base64 of "Direct message"
      );
    });

    it('should handle sending to non-existent client', () => {
      expect(() => service.sendToClient('non-existent', {})).not.toThrow();
    });
  });

  describe('getClientCount', () => {
    it('should return the correct number of clients', () => {
      const mockResponse1 = createMockResponse();
      const mockResponse2 = createMockResponse();

      expect(service.getClientCount()).toBe(0);

      service.addClient('client1', mockResponse1 as Response, 'test-topic');
      expect(service.getClientCount()).toBe(1);

      service.addClient('client2', mockResponse2 as Response, 'test-topic');
      expect(service.getClientCount()).toBe(2);

      service.removeClient('client1');
      expect(service.getClientCount()).toBe(1);
    });

    it('should return count for specific topic', () => {
      const mockResponse1 = createMockResponse();
      const mockResponse2 = createMockResponse();
      const mockResponse3 = createMockResponse();

      service.addClient('client1', mockResponse1 as Response, 'topic1');
      service.addClient('client2', mockResponse2 as Response, 'topic1');
      service.addClient('client3', mockResponse3 as Response, 'topic2');

      expect(service.getClientCount('topic1')).toBe(2);
      expect(service.getClientCount('topic2')).toBe(1);
    });
  });

  describe('getTopics', () => {
    it('should return all active topics', () => {
      const mockResponse1 = createMockResponse();
      const mockResponse2 = createMockResponse();

      service.addClient('client1', mockResponse1 as Response, 'topic1');
      service.addClient('client2', mockResponse2 as Response, 'topic2');

      const topics = service.getTopics();
      expect(topics).toContain('topic1');
      expect(topics).toContain('topic2');
    });
  });

  describe('large content handling', () => {
    it('should handle large content appropriately', () => {
      const mockResponse = createMockResponse();
      const clientId = 'test-client-' + Math.random().toString(36).substr(2, 9);
      service.addClient(clientId, mockResponse as Response, 'test-topic');

      mockResponse.write.mockClear();

      // Create a large object
      const largeData = {
        data: 'x'.repeat(10000),
      };

      service.broadcast('test-topic', largeData);

      // Should have been called to send the data
      expect(mockResponse.write).toHaveBeenCalled();
    });
  });
});

function createMockResponse() {
  return {
    setHeader: vi.fn(),
    writeHead: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
  };
}
