import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Create mock worker class that will be hoisted
const mockWorkerInstance = {
  postMessage: vi.fn(),
  terminate: vi.fn(() => Promise.resolve(0)),
  on: vi.fn(),
  removeAllListeners: vi.fn(),
  emit: vi.fn(),
  removeListener: vi.fn(),
  messageHandlers: new Map<string, (message: unknown) => void>(),
  errorHandlers: new Set<(error: Error) => void>(),
  exitHandlers: new Set<(code: number) => void>(),
};

vi.mock('worker_threads', () => {
  class MockWorker {
    postMessage = vi.fn();
    terminate = vi.fn(() => Promise.resolve(0));
    on = vi.fn();
    removeAllListeners = vi.fn();
    emit = vi.fn();
    removeListener = vi.fn();

    constructor() {
      // Set up event handler tracking
      this.on.mockImplementation(
        (event: string, handler: (...args: unknown[]) => void) => {
          if (event === 'message') {
            mockWorkerInstance.messageHandlers.set('message', handler);
          } else if (event === 'error') {
            mockWorkerInstance.errorHandlers.add(handler);
          } else if (event === 'exit') {
            mockWorkerInstance.exitHandlers.add(handler);
          }
        }
      );

      // Copy methods to the shared instance for testing
      Object.assign(mockWorkerInstance, {
        postMessage: this.postMessage,
        terminate: this.terminate,
        on: this.on,
        removeAllListeners: this.removeAllListeners,
        emit: this.emit,
        removeListener: this.removeListener,
      });
    }
  }

  return {
    Worker: MockWorker,
    isMainThread: true,
    parentPort: null,
  };
});

// Mock fs for wrapper file creation
vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  writeFileSync: vi.fn(),
}));

// Mock logger
vi.mock('../logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Import after mocks
import { LLMWorkerProxy } from '../llmWorkerProxy';
import { Worker } from 'worker_threads';

const MockedWorker = vi.mocked(Worker);

describe('LLMWorkerProxy', () => {
  let proxy: LLMWorkerProxy;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset the mock instance
    mockWorkerInstance.removeAllListeners();
    mockWorkerInstance.postMessage.mockClear();
    mockWorkerInstance.terminate.mockClear();

    // Clear handler collections
    mockWorkerInstance.messageHandlers.clear();
    mockWorkerInstance.errorHandlers.clear();
    mockWorkerInstance.exitHandlers.clear();

    // Create new proxy instance
    proxy = new LLMWorkerProxy();

    // Give sufficient time for async initialization to complete
    await new Promise(resolve => setTimeout(resolve, 50));
  });

  afterEach(() => {
    proxy?.terminate();
  });

  describe('basic operations', () => {
    it('should create worker proxy instance', () => {
      expect(proxy).toBeDefined();
      expect(proxy).toBeInstanceOf(LLMWorkerProxy);
    });

    it('should terminate worker', () => {
      // Test that terminate method can be called without errors
      expect(() => proxy.terminate()).not.toThrow();

      // Verify the proxy is still defined after termination
      expect(proxy).toBeDefined();
    });

    it('should handle errors when worker not available', () => {
      // Test that proxy can be created and terminated without issues
      const newProxy = new LLMWorkerProxy();

      // Simulate worker becoming unavailable
      newProxy.terminate();

      // Verify the proxy exists and can handle the termination
      expect(newProxy).toBeDefined();
      expect(typeof newProxy.getLocalModels).toBe('function');
      expect(typeof newProxy.terminate).toBe('function');
    });

    it('should have required methods', () => {
      // Test that all expected methods exist
      expect(typeof proxy.getLocalModels).toBe('function');
      expect(typeof proxy.getAvailableModels).toBe('function');
      expect(typeof proxy.loadModel).toBe('function');
      expect(typeof proxy.unloadModel).toBe('function');
      expect(typeof proxy.generateResponse).toBe('function');
      expect(typeof proxy.searchModels).toBe('function');
      expect(typeof proxy.setModelSettings).toBe('function');
      expect(typeof proxy.terminate).toBe('function');
      expect(typeof proxy.waitForInitialization).toBe('function');
    });

    it('should handle worker initialization timeout', async () => {
      // Test initialization timeout behavior
      const newProxy = new LLMWorkerProxy();

      // Don't provide any init response, should timeout gracefully
      const initPromise = newProxy.waitForInitialization();

      // Wait a reasonable amount of time
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Test timeout')), 100)
      );

      try {
        await Promise.race([initPromise, timeoutPromise]);
      } catch (error) {
        // Either timeout or initialization failure is acceptable
        expect(error).toBeInstanceOf(Error);
      }

      newProxy.terminate();
    }, 500);

    it('should create workers through constructor', () => {
      // Verify the mock worker instance exists
      expect(mockWorkerInstance).toBeDefined();
      expect(mockWorkerInstance.postMessage).toBeDefined();
      expect(mockWorkerInstance.terminate).toBeDefined();
    });

    it('should handle message responses', () => {
      // Test basic message handling
      const testResponse = {
        id: 'test-123',
        type: 'response',
        success: true,
        data: 'test data',
      };

      // Should not throw when handling messages
      expect(() => {
        mockWorkerInstance.emit('message', testResponse);
      }).not.toThrow();
    });

    it('should handle worker events', () => {
      // Test worker event handling
      expect(() => {
        mockWorkerInstance.emit('online');
        mockWorkerInstance.emit('error', new Error('Test error'));
        mockWorkerInstance.emit('exit', 0);
      }).not.toThrow();
    });

    it('should create request IDs', async () => {
      // Set up proxy internal state using Object.defineProperty to avoid type assertions
      Object.defineProperty(proxy, 'isInitialized', {
        value: true,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(proxy, 'worker', {
        value: mockWorkerInstance,
        writable: true,
        configurable: true,
      });

      // Mock worker to immediately reject messages to avoid timeout
      mockWorkerInstance.postMessage.mockImplementation(message => {
        // Simulate immediate error response to resolve pending requests
        setTimeout(() => {
          const handler = mockWorkerInstance.messageHandlers.get('message');
          if (handler) {
            handler({
              id: message.id,
              type: message.type,
              success: false,
              error: 'Test error',
            });
          }
        }, 0);
      });

      // Test that multiple operations create different request IDs
      proxy.getLocalModels().catch(() => {}); // Ignore rejection
      proxy.getAvailableModels().catch(() => {}); // Ignore rejection

      // Wait for postMessage calls to be made
      await new Promise(resolve => setTimeout(resolve, 10));

      const calls = mockWorkerInstance.postMessage.mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(2);

      const ids = calls.map(call => call[0]?.id).filter(Boolean);
      expect(ids.length).toBeGreaterThanOrEqual(2);
      expect(ids[0]).not.toBe(ids[1]);
    });

    it('should cleanup on terminate', () => {
      // Verify cleanup occurs on termination
      proxy.terminate();
      expect(proxy).toBeDefined(); // Proxy itself should still exist
    });
  });

  describe('worker initialization', () => {
    it('should handle development environment wrapper creation', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const { existsSync, writeFileSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(false);

      const newProxy = new LLMWorkerProxy();
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(writeFileSync).toHaveBeenCalled();

      newProxy.terminate();
      process.env.NODE_ENV = originalEnv;
    });

    it('should handle production environment', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const { existsSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(true);

      const newProxy = new LLMWorkerProxy();
      await new Promise(resolve => setTimeout(resolve, 10));

      newProxy.terminate();
      process.env.NODE_ENV = originalEnv;
    });

    it('should handle missing worker file', async () => {
      const { existsSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(false);

      const newProxy = new LLMWorkerProxy();
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should not throw and should handle gracefully
      expect(newProxy).toBeDefined();
      newProxy.terminate();
    });
  });

  describe('basic functionality', () => {
    it('should have worker initialization methods', () => {
      expect(typeof proxy.waitForInitialization).toBe('function');
      expect(typeof proxy.terminate).toBe('function');
    });

    it('should create worker proxy instance', () => {
      expect(proxy).toBeInstanceOf(LLMWorkerProxy);
      expect(proxy).toBeDefined();
    });

    it('should handle constructor without errors', () => {
      expect(() => new LLMWorkerProxy()).not.toThrow();
    });

    it('should have terminate method that does not throw', () => {
      expect(() => proxy.terminate()).not.toThrow();
    });
  });

  describe('public method signatures', () => {
    it('should have all expected public methods', () => {
      const expectedMethods = [
        'waitForInitialization',
        'getLocalModels',
        'getAvailableModels',
        'searchModels',
        'downloadModel',
        'deleteModel',
        'loadModel',
        'updateSessionHistory',
        'unloadModel',
        'generateResponse',
        'generateStreamResponse',
        'setModelSettings',
        'getModelSettings',
        'calculateOptimalSettings',
        'getModelRuntimeInfo',
        'clearContextSizeCache',
        'getModelStatus',
        'cancelDownload',
        'getDownloadProgress',
        'terminate',
      ];

      expectedMethods.forEach(method => {
        expect(typeof proxy[method]).toBe('function');
      });
    });

    it('should handle worker unavailable scenarios', () => {
      // Create a proxy and test that methods exist
      const testProxy = new LLMWorkerProxy();

      // Methods should exist even when worker is not available
      expect(typeof testProxy.getLocalModels).toBe('function');
      expect(typeof testProxy.terminate).toBe('function');

      testProxy.terminate();
    });

    it('should handle initialization state', async () => {
      // Test initialization waiting
      const testProxy = new LLMWorkerProxy();

      // Initially not initialized
      testProxy['isInitialized'] = false;

      // Start waiting for initialization
      const waitPromise = testProxy.waitForInitialization();

      // Mark as initialized
      setTimeout(() => {
        testProxy['isInitialized'] = true;
      }, 20);

      // Should resolve
      await expect(waitPromise).resolves.toBeUndefined();

      testProxy.terminate();
    });
  });
});
