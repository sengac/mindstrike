import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getLocalLLMManager, cleanup } from '../localLlmSingleton';
import { LLMWorkerProxy } from '../llmWorkerProxy';
import { logger } from '../logger';
import { ErrorFactory } from './fixtures/testData';

// Mock dependencies
vi.mock('../llmWorkerProxy');
vi.mock('../logger');

// Create a proper mock interface
interface MockLLMWorkerProxy {
  terminate: () => void | Promise<void>;
}

describe('LocalLlmSingleton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the singleton instance by calling cleanup
    cleanup();

    // Reset the LLMWorkerProxy mock to return fresh instances
    vi.mocked(LLMWorkerProxy).mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });

  describe('getLocalLLMManager', () => {
    it('should create and return a new LLMWorkerProxy instance', () => {
      const mockTerminate = vi.fn();
      const mockInstance: MockLLMWorkerProxy = { terminate: mockTerminate };
      vi.mocked(LLMWorkerProxy).mockImplementation(
        () => mockInstance as LLMWorkerProxy
      );

      const manager = getLocalLLMManager();

      expect(LLMWorkerProxy).toHaveBeenCalledTimes(1);
      expect(manager).toBe(mockInstance);
      expect(logger.info).toHaveBeenCalledWith('LLM Worker Proxy initialized');
    });

    it('should return the same instance on subsequent calls', () => {
      const mockTerminate = vi.fn();
      const mockInstance: MockLLMWorkerProxy = { terminate: mockTerminate };
      vi.mocked(LLMWorkerProxy).mockImplementation(
        () => mockInstance as LLMWorkerProxy
      );

      const manager1 = getLocalLLMManager();
      const manager2 = getLocalLLMManager();

      expect(manager1).toBe(manager2);
      expect(LLMWorkerProxy).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledTimes(1);
    });

    it('should handle initialization errors', () => {
      const initError = ErrorFactory.connectionRefused();
      vi.mocked(LLMWorkerProxy).mockImplementation(() => {
        throw initError;
      });

      expect(() => getLocalLLMManager()).toThrow();
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to initialize LLM Worker Proxy:',
        initError
      );
    });

    it('should create new instance after cleanup', () => {
      const mockTerminate1 = vi.fn();
      const mockTerminate2 = vi.fn();
      const mockInstance1: MockLLMWorkerProxy = { terminate: mockTerminate1 };
      const mockInstance2: MockLLMWorkerProxy = { terminate: mockTerminate2 };

      vi.mocked(LLMWorkerProxy)
        .mockImplementationOnce(() => mockInstance1 as LLMWorkerProxy)
        .mockImplementationOnce(() => mockInstance2 as LLMWorkerProxy);

      const manager1 = getLocalLLMManager();

      cleanup();

      const manager2 = getLocalLLMManager();

      expect(manager1).not.toBe(manager2);
      expect(LLMWorkerProxy).toHaveBeenCalledTimes(2);
    });

    it('should handle multiple rapid calls safely', () => {
      const mockTerminate = vi.fn();
      const mockInstance: MockLLMWorkerProxy = { terminate: mockTerminate };
      vi.mocked(LLMWorkerProxy).mockImplementation(
        () => mockInstance as LLMWorkerProxy
      );

      const managers = Array.from({ length: 10 }, () => getLocalLLMManager());

      // All should be the same instance
      for (let i = 1; i < managers.length; i++) {
        expect(managers[i]).toBe(managers[0]);
      }

      expect(LLMWorkerProxy).toHaveBeenCalledTimes(1);
    });

    it('should handle constructor throwing different error types', () => {
      const testErrors = [
        ErrorFactory.networkTimeout(),
        ErrorFactory.permissionDenied('worker'),
        ErrorFactory.connectionRefused(),
        ErrorFactory.abortError(),
      ];

      for (const error of testErrors) {
        vi.mocked(LLMWorkerProxy).mockImplementation(() => {
          throw error;
        });

        expect(() => getLocalLLMManager()).toThrow();
        expect(logger.error).toHaveBeenCalledWith(
          'Failed to initialize LLM Worker Proxy:',
          error
        );

        cleanup(); // Reset for next iteration
      }
    });
  });

  describe('cleanup', () => {
    it('should terminate existing instance', () => {
      const mockTerminate = vi.fn();
      const mockProxy: MockLLMWorkerProxy = {
        terminate: mockTerminate,
      };

      vi.mocked(LLMWorkerProxy).mockImplementation(
        () => mockProxy as LLMWorkerProxy
      );

      const manager = getLocalLLMManager();
      expect(manager).toBeDefined();

      cleanup();

      expect(mockTerminate).toHaveBeenCalledTimes(1);
    });

    it('should allow new instance creation after cleanup', () => {
      const mockTerminate1 = vi.fn();
      const mockTerminate2 = vi.fn();
      const mockProxy1: MockLLMWorkerProxy = { terminate: mockTerminate1 };
      const mockProxy2: MockLLMWorkerProxy = { terminate: mockTerminate2 };

      vi.mocked(LLMWorkerProxy)
        .mockImplementationOnce(() => mockProxy1 as LLMWorkerProxy)
        .mockImplementationOnce(() => mockProxy2 as LLMWorkerProxy);

      const manager1 = getLocalLLMManager();
      cleanup();
      const manager2 = getLocalLLMManager();

      expect(manager1).not.toBe(manager2);
      expect(mockTerminate1).toHaveBeenCalledTimes(1);
      expect(LLMWorkerProxy).toHaveBeenCalledTimes(2);
    });

    it('should handle cleanup when no instance exists', () => {
      expect(() => cleanup()).not.toThrow();
    });

    it('should handle multiple cleanup calls safely', () => {
      const mockTerminate = vi.fn();
      const mockProxy: MockLLMWorkerProxy = {
        terminate: mockTerminate,
      };

      vi.mocked(LLMWorkerProxy).mockImplementation(
        () => mockProxy as LLMWorkerProxy
      );

      getLocalLLMManager();

      cleanup();
      cleanup();
      cleanup();

      expect(mockTerminate).toHaveBeenCalledTimes(1);
    });

    it('should handle terminate method throwing errors', () => {
      const terminateError = ErrorFactory.permissionDenied('worker');
      const mockTerminate = vi.fn().mockImplementation(() => {
        throw terminateError;
      });
      const mockProxy: MockLLMWorkerProxy = {
        terminate: mockTerminate,
      };

      vi.mocked(LLMWorkerProxy).mockImplementation(
        () => mockProxy as LLMWorkerProxy
      );

      getLocalLLMManager();

      // Cleanup should not throw even if terminate throws
      expect(() => cleanup()).not.toThrow();
      expect(mockTerminate).toHaveBeenCalledTimes(1);
    });
  });

  describe('singleton behavior', () => {
    it('should maintain singleton pattern across different modules', () => {
      // Simulate getting instance from different parts of the application
      const manager1 = getLocalLLMManager();
      const manager2 = getLocalLLMManager();
      const manager3 = getLocalLLMManager();

      expect(manager1).toBe(manager2);
      expect(manager2).toBe(manager3);
      expect(LLMWorkerProxy).toHaveBeenCalledTimes(1);
    });

    it('should handle concurrent access safely', async () => {
      // Simulate concurrent access to the singleton
      const promises = Array.from({ length: 10 }, () =>
        Promise.resolve(getLocalLLMManager())
      );

      const managers = await Promise.all(promises);

      // All should be the same instance
      for (let i = 1; i < managers.length; i++) {
        expect(managers[i]).toBe(managers[0]);
      }

      expect(LLMWorkerProxy).toHaveBeenCalledTimes(1);
    });

    it('should properly reset state after cleanup and recreation cycle', () => {
      const mockTerminate1 = vi.fn();
      const mockTerminate2 = vi.fn();
      const mockProxy1: MockLLMWorkerProxy = { terminate: mockTerminate1 };
      const mockProxy2: MockLLMWorkerProxy = { terminate: mockTerminate2 };

      // First instance
      vi.mocked(LLMWorkerProxy).mockImplementationOnce(
        () => mockProxy1 as LLMWorkerProxy
      );

      const manager1 = getLocalLLMManager();
      cleanup();

      // Second instance
      vi.mocked(LLMWorkerProxy).mockImplementationOnce(
        () => mockProxy2 as LLMWorkerProxy
      );

      const manager2 = getLocalLLMManager();
      const manager3 = getLocalLLMManager(); // Should be same as manager2

      expect(manager1).not.toBe(manager2);
      expect(manager2).toBe(manager3);
      expect(mockTerminate1).toHaveBeenCalledTimes(1);
      expect(mockTerminate2).not.toHaveBeenCalled();

      cleanup();
      expect(mockTerminate2).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle worker proxy creation with partial constructor failure', () => {
      const mockTerminate = vi.fn();
      const mockInstance: MockLLMWorkerProxy = { terminate: mockTerminate };
      const initError = ErrorFactory.connectionRefused();

      let callCount = 0;
      vi.mocked(LLMWorkerProxy).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw initError;
        }
        return mockInstance as LLMWorkerProxy;
      });

      // First call should throw
      expect(() => getLocalLLMManager()).toThrow();

      cleanup();

      // Second call should succeed
      const manager = getLocalLLMManager();
      expect(manager).toBe(mockInstance);
    });

    it('should handle memory pressure scenarios', () => {
      const mockTerminate = vi.fn();
      const mockProxy: MockLLMWorkerProxy = { terminate: mockTerminate };

      vi.mocked(LLMWorkerProxy).mockImplementation(
        () => mockProxy as LLMWorkerProxy
      );

      // Create and cleanup multiple times to simulate memory pressure
      for (let i = 0; i < 100; i++) {
        getLocalLLMManager();
        cleanup();
      }

      expect(mockTerminate).toHaveBeenCalledTimes(100);
      expect(LLMWorkerProxy).toHaveBeenCalledTimes(100);
    });

    it('should handle process exit scenarios', () => {
      const mockTerminate = vi.fn();
      const mockProxy: MockLLMWorkerProxy = { terminate: mockTerminate };

      vi.mocked(LLMWorkerProxy).mockImplementation(
        () => mockProxy as LLMWorkerProxy
      );

      getLocalLLMManager();

      // Simulate process exit cleanup
      cleanup();

      expect(mockTerminate).toHaveBeenCalledTimes(1);

      // Ensure no further operations on terminated instance
      cleanup();
      expect(mockTerminate).toHaveBeenCalledTimes(1);
    });

    it('should handle async terminate methods', async () => {
      const mockTerminate = vi.fn().mockResolvedValue(undefined);
      const mockProxy: MockLLMWorkerProxy = { terminate: mockTerminate };

      vi.mocked(LLMWorkerProxy).mockImplementation(
        () => mockProxy as LLMWorkerProxy
      );

      getLocalLLMManager();
      cleanup();

      expect(mockTerminate).toHaveBeenCalledTimes(1);
    });

    it('should handle terminate method returning promises', () => {
      const mockTerminate = vi.fn().mockReturnValue(Promise.resolve());
      const mockProxy: MockLLMWorkerProxy = { terminate: mockTerminate };

      vi.mocked(LLMWorkerProxy).mockImplementation(
        () => mockProxy as LLMWorkerProxy
      );

      getLocalLLMManager();

      expect(() => cleanup()).not.toThrow();
      expect(mockTerminate).toHaveBeenCalledTimes(1);
    });
  });

  describe('logging behavior', () => {
    it('should log initialization success', () => {
      getLocalLLMManager();

      expect(logger.info).toHaveBeenCalledWith('LLM Worker Proxy initialized');
    });

    it('should log initialization errors with context', () => {
      const error = new Error('Init failed');
      error.stack = 'Error: Init failed\n    at test';

      vi.mocked(LLMWorkerProxy).mockImplementation(() => {
        throw error;
      });

      expect(() => getLocalLLMManager()).toThrow();
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to initialize LLM Worker Proxy:',
        error
      );
    });

    it('should not log on subsequent calls to already initialized instance', () => {
      getLocalLLMManager();
      vi.mocked(logger.info).mockClear();

      getLocalLLMManager();
      getLocalLLMManager();

      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should log each re-initialization after cleanup', () => {
      getLocalLLMManager();
      cleanup();
      getLocalLLMManager();
      cleanup();
      getLocalLLMManager();

      expect(logger.info).toHaveBeenCalledTimes(3);
      expect(logger.info).toHaveBeenCalledWith('LLM Worker Proxy initialized');
    });
  });

  describe('integration scenarios', () => {
    it('should work correctly in HTTP route handler context', () => {
      const mockTerminate = vi.fn();
      const mockInstance: MockLLMWorkerProxy = { terminate: mockTerminate };
      vi.mocked(LLMWorkerProxy).mockImplementation(
        () => mockInstance as LLMWorkerProxy
      );

      // Simulate multiple HTTP requests accessing the singleton
      const routeHandlers = Array.from({ length: 5 }, (_, i) => {
        return () => {
          const manager = getLocalLLMManager();
          return { requestId: i, manager };
        };
      });

      const results = routeHandlers.map(handler => handler());

      // All should get the same manager instance
      for (let i = 1; i < results.length; i++) {
        expect(results[i].manager).toBe(results[0].manager);
      }
    });

    it('should handle server restart simulation', () => {
      const mockTerminate1 = vi.fn();
      const mockTerminate2 = vi.fn();
      const mockProxy1: MockLLMWorkerProxy = { terminate: mockTerminate1 };
      const mockProxy2: MockLLMWorkerProxy = { terminate: mockTerminate2 };

      vi.mocked(LLMWorkerProxy)
        .mockImplementationOnce(() => mockProxy1 as LLMWorkerProxy)
        .mockImplementationOnce(() => mockProxy2 as LLMWorkerProxy);

      // Initial server start
      const manager1 = getLocalLLMManager();

      // Simulate server shutdown
      cleanup();

      // Simulate server restart
      const manager2 = getLocalLLMManager();

      expect(manager1).not.toBe(manager2);
      expect(mockTerminate1).toHaveBeenCalledTimes(1);
    });

    it('should handle error recovery in long-running process', () => {
      const mockTerminate = vi.fn();
      const mockInstance: MockLLMWorkerProxy = { terminate: mockTerminate };
      const tempError = ErrorFactory.networkTimeout();

      let shouldFail = true;
      vi.mocked(LLMWorkerProxy).mockImplementation(() => {
        if (shouldFail) {
          shouldFail = false;
          throw tempError;
        }
        return mockInstance as LLMWorkerProxy;
      });

      // First attempt fails
      expect(() => getLocalLLMManager()).toThrow();

      cleanup();

      // Second attempt succeeds
      const manager = getLocalLLMManager();
      expect(manager).toBe(mockInstance);
    });
  });

  describe('cleanup edge cases', () => {
    it('should handle cleanup with multiple different instances', () => {
      const terminateFns = [vi.fn(), vi.fn(), vi.fn()];
      const mockProxies = terminateFns.map(terminate => ({ terminate }));

      // Create multiple instances through cleanup cycles
      for (let i = 0; i < mockProxies.length; i++) {
        vi.mocked(LLMWorkerProxy).mockImplementationOnce(
          () => mockProxies[i] as LLMWorkerProxy
        );
        getLocalLLMManager();
        cleanup();
      }

      // Each terminate should have been called once
      terminateFns.forEach(fn => expect(fn).toHaveBeenCalledTimes(1));
    });

    it('should handle rapid initialization and cleanup', () => {
      const mockTerminate = vi.fn();
      const mockProxy: MockLLMWorkerProxy = { terminate: mockTerminate };

      vi.mocked(LLMWorkerProxy).mockImplementation(
        () => mockProxy as LLMWorkerProxy
      );

      // Rapid init/cleanup cycles
      for (let i = 0; i < 10; i++) {
        getLocalLLMManager();
        cleanup();
      }

      expect(mockTerminate).toHaveBeenCalledTimes(10);
    });

    it('should maintain state consistency during concurrent operations', async () => {
      const mockTerminate = vi.fn();
      const mockProxy: MockLLMWorkerProxy = { terminate: mockTerminate };

      vi.mocked(LLMWorkerProxy).mockImplementation(
        () => mockProxy as LLMWorkerProxy
      );

      // Start multiple concurrent operations
      const initPromises = Array.from({ length: 5 }, () =>
        Promise.resolve(getLocalLLMManager())
      );

      const managers = await Promise.all(initPromises);

      // All should be the same instance
      for (let i = 1; i < managers.length; i++) {
        expect(managers[i]).toBe(managers[0]);
      }

      // Only one instance should be created
      expect(LLMWorkerProxy).toHaveBeenCalledTimes(1);

      cleanup();
      expect(mockTerminate).toHaveBeenCalledTimes(1);
    });
  });
});
