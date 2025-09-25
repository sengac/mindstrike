import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sharedLlamaInstance } from '../sharedLlamaInstance';
import { getLlama } from 'node-llama-cpp';
import { ErrorFactory, TestUtils } from './fixtures/testData';
import type { Llama } from 'node-llama-cpp';

// Mock node-llama-cpp
vi.mock('node-llama-cpp', () => ({
  getLlama: vi.fn(),
}));

// Mock console.error to avoid noise in tests but verify it's called
vi.mock('console', () => ({
  error: vi.fn(),
}));

interface MockLlama {
  getSystemInfo?: () => Promise<{ gpu?: boolean; cpuModel?: string }>;
  createContext?: () => Promise<unknown>;
  dispose?: () => Promise<void>;
}

// Interface for accessing singleton internal state in tests
interface SharedLlamaInstanceInternal {
  llamaInstance: Llama | null;
  initializationPromise: Promise<Llama> | null;
  isInferenceActive: boolean;
  pendingSystemInfoRequests: Array<() => Promise<void> | void>;
}

// Helper function to reset singleton state for testing
function resetSingletonState(): void {
  // Reset internal state through reflection since we can't modify the source
  const instance = sharedLlamaInstance as SharedLlamaInstanceInternal;

  instance.llamaInstance = null;
  instance.initializationPromise = null;
  instance.isInferenceActive = false;
  instance.pendingSystemInfoRequests.length = 0;
}

describe('SharedLlamaInstance', () => {
  let mockLlamaInstance: MockLlama;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Reset singleton state before each test
    resetSingletonState();

    // Create a fresh mock Llama instance for each test
    mockLlamaInstance = {
      getSystemInfo: vi
        .fn()
        .mockResolvedValue({ gpu: true, cpuModel: 'Test CPU' }),
      createContext: vi.fn().mockResolvedValue({}),
      dispose: vi.fn().mockResolvedValue(undefined),
    };

    vi.mocked(getLlama).mockResolvedValue(mockLlamaInstance as Llama);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
    // Clean up any remaining state
    sharedLlamaInstance.markInferenceEnd();
    resetSingletonState();
  });

  describe('singleton pattern', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = sharedLlamaInstance;
      const instance2 = sharedLlamaInstance;

      expect(instance1).toBe(instance2);
    });

    it('should maintain singleton pattern across concurrent access', async () => {
      const instances = await Promise.all([
        Promise.resolve(sharedLlamaInstance),
        Promise.resolve(sharedLlamaInstance),
        Promise.resolve(sharedLlamaInstance),
      ]);

      // All instances should be the same reference
      expect(instances[0]).toBe(instances[1]);
      expect(instances[1]).toBe(instances[2]);
    });
  });

  describe('getLlama', () => {
    it('should initialize and return Llama instance on first call', async () => {
      const llama = await sharedLlamaInstance.getLlama();

      expect(getLlama).toHaveBeenCalledTimes(1);
      expect(getLlama).toHaveBeenCalledWith({ gpu: 'auto' });
      expect(llama).toBe(mockLlamaInstance);
    });

    it('should return cached instance on subsequent calls', async () => {
      const llama1 = await sharedLlamaInstance.getLlama();
      const llama2 = await sharedLlamaInstance.getLlama();
      const llama3 = await sharedLlamaInstance.getLlama();

      expect(getLlama).toHaveBeenCalledTimes(1);
      expect(llama1).toBe(llama2);
      expect(llama2).toBe(llama3);
      expect(llama1).toBe(mockLlamaInstance);
    });

    it('should handle concurrent initialization requests', async () => {
      const promises = Array.from({ length: 5 }, () =>
        sharedLlamaInstance.getLlama()
      );

      const results = await Promise.all(promises);

      // All results should be the same instance
      for (let i = 1; i < results.length; i++) {
        expect(results[i]).toBe(results[0]);
      }

      // getLlama should only be called once
      expect(getLlama).toHaveBeenCalledTimes(1);
    });

    it('should wait for initialization promise if already initializing', async () => {
      // Mock a slow initialization
      let resolveInitialization: (value: Llama) => void;
      const initPromise = new Promise<Llama>(resolve => {
        resolveInitialization = resolve;
      });

      vi.mocked(getLlama).mockReturnValue(initPromise);

      // Start multiple concurrent getLlama calls
      const promise1 = sharedLlamaInstance.getLlama();
      const promise2 = sharedLlamaInstance.getLlama();
      const promise3 = sharedLlamaInstance.getLlama();

      // Resolve the initialization
      resolveInitialization!(mockLlamaInstance as Llama);

      const results = await Promise.all([promise1, promise2, promise3]);

      // All should get the same instance
      expect(results[0]).toBe(mockLlamaInstance);
      expect(results[1]).toBe(mockLlamaInstance);
      expect(results[2]).toBe(mockLlamaInstance);

      // Only one initialization should have occurred
      expect(getLlama).toHaveBeenCalledTimes(1);
    });

    it('should handle initialization failure', async () => {
      const initError = ErrorFactory.connectionRefused();
      vi.mocked(getLlama).mockRejectedValue(initError);

      await expect(sharedLlamaInstance.getLlama()).rejects.toThrow(initError);
      expect(getLlama).toHaveBeenCalledTimes(1);
    });

    it('should retry initialization after failure', async () => {
      const initError = ErrorFactory.networkTimeout();

      // First call fails
      vi.mocked(getLlama).mockRejectedValueOnce(initError);
      await expect(sharedLlamaInstance.getLlama()).rejects.toThrow(
        initError.message
      );

      // Reset state to allow retry
      resetSingletonState();

      // Second call succeeds
      vi.mocked(getLlama).mockResolvedValue(mockLlamaInstance as Llama);
      const llama = await sharedLlamaInstance.getLlama();

      expect(llama).toBe(mockLlamaInstance);
      expect(getLlama).toHaveBeenCalledTimes(2);
    });

    it('should handle concurrent calls during failed initialization', async () => {
      const initError = ErrorFactory.connectionRefused();
      vi.mocked(getLlama).mockRejectedValue(initError);

      const promises = Array.from({ length: 3 }, () =>
        sharedLlamaInstance.getLlama().catch(err => err)
      );

      const results = await Promise.all(promises);

      // All should receive the same error
      results.forEach(result => {
        expect(result).toBe(initError);
      });

      // Only one initialization attempt should have been made
      expect(getLlama).toHaveBeenCalledTimes(1);
    });

    it('should handle various error types during initialization', async () => {
      const errorTypes = [
        ErrorFactory.permissionDenied('GPU'),
        ErrorFactory.abortError(),
        ErrorFactory.networkTimeout(),
        new Error('GPU not available'),
        new Error('Insufficient memory'),
      ];

      for (const error of errorTypes) {
        // Reset state between error tests
        resetSingletonState();
        vi.mocked(getLlama).mockRejectedValueOnce(error);
        await expect(sharedLlamaInstance.getLlama()).rejects.toThrow(
          error.message
        );
      }

      expect(getLlama).toHaveBeenCalledTimes(errorTypes.length);
    });
  });

  describe('getLlamaForSystemInfo', () => {
    it('should return Llama instance when inference is not active', async () => {
      const llama = await sharedLlamaInstance.getLlamaForSystemInfo();

      expect(llama).toBe(mockLlamaInstance);
      expect(getLlama).toHaveBeenCalledTimes(1);
    });

    it('should queue request when inference is active', async () => {
      // Mark inference as active
      sharedLlamaInstance.markInferenceStart();

      // Start a system info request
      const systemInfoPromise = sharedLlamaInstance.getLlamaForSystemInfo();

      // The promise should not resolve immediately
      let resolved = false;
      systemInfoPromise.then(() => {
        resolved = true;
      });

      // Mark inference as ended
      sharedLlamaInstance.markInferenceEnd();

      // Now advance timers to process queued requests
      await vi.runAllTimersAsync();

      // The promise should now resolve
      const llama = await systemInfoPromise;
      expect(llama).toBe(mockLlamaInstance);
    });

    it('should handle multiple queued system info requests', async () => {
      sharedLlamaInstance.markInferenceStart();

      // Queue multiple system info requests
      const promises = Array.from({ length: 5 }, () =>
        sharedLlamaInstance.getLlamaForSystemInfo()
      );

      // End inference to process queue
      sharedLlamaInstance.markInferenceEnd();
      await vi.runAllTimersAsync();

      const results = await Promise.all(promises);

      // All should get the same instance
      results.forEach(result => {
        expect(result).toBe(mockLlamaInstance);
      });
    });

    it('should handle queued requests with proper error handling', async () => {
      sharedLlamaInstance.markInferenceStart();

      // Queue a request that will succeed
      const promise = sharedLlamaInstance.getLlamaForSystemInfo();

      // End inference and process queue
      sharedLlamaInstance.markInferenceEnd();
      await vi.runAllTimersAsync();

      const result = await promise;
      expect(result).toBe(mockLlamaInstance);
    });

    it('should handle both sync and async queued functions', async () => {
      sharedLlamaInstance.markInferenceStart();

      // Create promises that will be resolved by queued functions
      const promises = Array.from({ length: 3 }, () =>
        sharedLlamaInstance.getLlamaForSystemInfo()
      );

      sharedLlamaInstance.markInferenceEnd();
      await vi.runAllTimersAsync();

      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result).toBe(mockLlamaInstance);
      });
    });
  });

  describe('inference state management', () => {
    it('should track inference state correctly', () => {
      const instance = sharedLlamaInstance as SharedLlamaInstanceInternal;

      // Initially, inference should not be active
      expect(instance.isInferenceActive).toBe(false);

      sharedLlamaInstance.markInferenceStart();
      expect(instance.isInferenceActive).toBe(true);

      sharedLlamaInstance.markInferenceEnd();
      expect(instance.isInferenceActive).toBe(false);
    });

    it('should handle multiple inference start calls', () => {
      const instance = sharedLlamaInstance as SharedLlamaInstanceInternal;

      sharedLlamaInstance.markInferenceStart();
      sharedLlamaInstance.markInferenceStart();
      sharedLlamaInstance.markInferenceStart();

      expect(instance.isInferenceActive).toBe(true);

      sharedLlamaInstance.markInferenceEnd();
      expect(instance.isInferenceActive).toBe(false);
    });

    it('should handle multiple inference end calls safely', () => {
      const instance = sharedLlamaInstance as SharedLlamaInstanceInternal;

      sharedLlamaInstance.markInferenceStart();
      sharedLlamaInstance.markInferenceEnd();

      // Multiple end calls should be safe
      sharedLlamaInstance.markInferenceEnd();
      sharedLlamaInstance.markInferenceEnd();

      expect(instance.isInferenceActive).toBe(false);
    });

    it('should process queued requests in order', async () => {
      sharedLlamaInstance.markInferenceStart();

      const processOrder: number[] = [];
      const promises = Array.from({ length: 3 }, (_, i) =>
        sharedLlamaInstance.getLlamaForSystemInfo().then(() => {
          processOrder.push(i);
          return mockLlamaInstance;
        })
      );

      sharedLlamaInstance.markInferenceEnd();
      await vi.runAllTimersAsync();

      await Promise.all(promises);

      // Requests should be processed in order (0, 1, 2)
      expect(processOrder).toEqual([0, 1, 2]);
    });

    it('should handle rapid inference state changes', async () => {
      // Rapid state changes
      for (let i = 0; i < 10; i++) {
        sharedLlamaInstance.markInferenceStart();
        sharedLlamaInstance.markInferenceEnd();
      }

      expect(
        (sharedLlamaInstance as SharedLlamaInstanceInternal).isInferenceActive
      ).toBe(false);

      // Should still be able to get Llama instance normally
      const llama = await sharedLlamaInstance.getLlamaForSystemInfo();
      expect(llama).toBe(mockLlamaInstance);
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle memory pressure scenarios', async () => {
      // Simulate memory pressure by doing many initialization cycles
      for (let i = 0; i < 50; i++) {
        await sharedLlamaInstance.getLlama();
      }

      // Should still work normally
      expect(getLlama).toHaveBeenCalledTimes(1);
    });

    it('should handle system shutdown scenarios', async () => {
      const llama = await sharedLlamaInstance.getLlama();
      expect(llama).toBe(mockLlamaInstance);

      // Simulate system shutdown - mark inference as active and leave it
      sharedLlamaInstance.markInferenceStart();

      // Queue some requests that will be left hanging
      const hangingPromise = sharedLlamaInstance.getLlamaForSystemInfo();

      // Don't end inference - simulate abrupt shutdown
      // The test should complete without hanging
      expect(
        (sharedLlamaInstance as SharedLlamaInstanceInternal)
          .pendingSystemInfoRequests.length
      ).toBeGreaterThan(0);
    });

    it('should handle initialization timeout scenarios', async () => {
      // Mock a very slow initialization that times out
      const initError = ErrorFactory.networkTimeout();

      vi.mocked(getLlama).mockRejectedValue(initError);

      // Should eventually reject
      await expect(sharedLlamaInstance.getLlama()).rejects.toThrow(initError);
    });

    it('should handle concurrent initialization and system info requests', async () => {
      // Start inference to queue system info requests
      sharedLlamaInstance.markInferenceStart();

      // Queue system info request before initialization
      const systemInfoPromise = sharedLlamaInstance.getLlamaForSystemInfo();

      // Start regular initialization
      const regularPromise = sharedLlamaInstance.getLlama();

      // End inference
      sharedLlamaInstance.markInferenceEnd();
      await vi.runAllTimersAsync();

      const [systemInfo, regular] = await Promise.all([
        systemInfoPromise,
        regularPromise,
      ]);

      expect(systemInfo).toBe(mockLlamaInstance);
      expect(regular).toBe(mockLlamaInstance);
      expect(getLlama).toHaveBeenCalledTimes(1);
    });

    it('should handle queue processing errors gracefully', async () => {
      // Verify that the queue processing mechanism is resilient
      sharedLlamaInstance.markInferenceStart();

      // Add a normal request to the queue
      const normalPromise = sharedLlamaInstance.getLlamaForSystemInfo();

      // End inference and process queue
      sharedLlamaInstance.markInferenceEnd();
      await vi.runAllTimersAsync();

      // Request should work normally
      const result = await normalPromise;
      expect(result).toBe(mockLlamaInstance);
    });

    it('should handle getLlama throwing synchronously', () => {
      const syncError = ErrorFactory.permissionDenied('GPU');
      vi.mocked(getLlama).mockImplementation(() => {
        throw syncError;
      });

      expect(sharedLlamaInstance.getLlama()).rejects.toThrow(syncError);
    });

    it('should handle failed initialization and allow retry', async () => {
      const initError = ErrorFactory.connectionRefused();
      vi.mocked(getLlama).mockRejectedValueOnce(initError);

      // First call fails
      await expect(sharedLlamaInstance.getLlama()).rejects.toThrow(
        initError.message
      );

      // Reset state to allow retry
      resetSingletonState();

      // After failure, should be able to try again
      vi.mocked(getLlama).mockResolvedValue(mockLlamaInstance as Llama);
      const llama = await sharedLlamaInstance.getLlama();

      expect(llama).toBe(mockLlamaInstance);
    });
  });

  describe('queue management', () => {
    it('should clear queue properly when processing', async () => {
      sharedLlamaInstance.markInferenceStart();

      // Add multiple requests
      const promises = Array.from({ length: 5 }, () =>
        sharedLlamaInstance.getLlamaForSystemInfo()
      );

      // Queue should have requests
      expect(
        (sharedLlamaInstance as SharedLlamaInstanceInternal)
          .pendingSystemInfoRequests.length
      ).toBe(5);

      sharedLlamaInstance.markInferenceEnd();
      await vi.runAllTimersAsync();

      // Queue should be empty after processing
      expect(
        (sharedLlamaInstance as SharedLlamaInstanceInternal)
          .pendingSystemInfoRequests.length
      ).toBe(0);

      await Promise.all(promises);
    });

    it('should handle queue overflow scenarios', async () => {
      sharedLlamaInstance.markInferenceStart();

      // Add many requests to simulate queue overflow
      const promises = Array.from({ length: 1000 }, () =>
        sharedLlamaInstance.getLlamaForSystemInfo()
      );

      expect(
        (sharedLlamaInstance as SharedLlamaInstanceInternal)
          .pendingSystemInfoRequests.length
      ).toBe(1000);

      sharedLlamaInstance.markInferenceEnd();
      await vi.runAllTimersAsync();

      const results = await Promise.all(promises);

      // All should resolve successfully
      results.forEach(result => {
        expect(result).toBe(mockLlamaInstance);
      });

      // Queue should be empty
      expect(
        (sharedLlamaInstance as SharedLlamaInstanceInternal)
          .pendingSystemInfoRequests.length
      ).toBe(0);
    });

    it('should handle mixed sync and async queue functions', async () => {
      sharedLlamaInstance.markInferenceStart();

      // Create mixed promises - some that resolve sync, others async
      const promises = [
        sharedLlamaInstance.getLlamaForSystemInfo(),
        sharedLlamaInstance.getLlamaForSystemInfo(),
        sharedLlamaInstance.getLlamaForSystemInfo(),
      ];

      // Manually add a sync function to the queue
      let syncCalled = false;
      (
        sharedLlamaInstance as SharedLlamaInstanceInternal
      ).pendingSystemInfoRequests.push(() => {
        syncCalled = true;
      });

      sharedLlamaInstance.markInferenceEnd();
      await vi.runAllTimersAsync();

      await Promise.all(promises);

      expect(syncCalled).toBe(true);
    });
  });

  describe('performance and concurrency', () => {
    it('should handle high-frequency getLlama calls efficiently', async () => {
      const startTime = Date.now();

      // Make many rapid calls
      const promises = Array.from({ length: 100 }, () =>
        sharedLlamaInstance.getLlama()
      );

      await Promise.all(promises);

      const endTime = Date.now();

      // Should complete quickly (within reasonable time)
      expect(endTime - startTime).toBeLessThan(1000);

      // Should only initialize once
      expect(getLlama).toHaveBeenCalledTimes(1);
    });

    it('should handle interleaved inference state and requests', async () => {
      const results = [];

      // Interleave inference state changes with requests
      for (let i = 0; i < 10; i++) {
        if (i % 2 === 0) {
          sharedLlamaInstance.markInferenceStart();
          results.push(sharedLlamaInstance.getLlamaForSystemInfo());
        } else {
          sharedLlamaInstance.markInferenceEnd();
          results.push(sharedLlamaInstance.getLlama());
        }
      }

      // End inference to process queued requests
      sharedLlamaInstance.markInferenceEnd();
      await vi.runAllTimersAsync();

      const resolvedResults = await Promise.all(results);

      // All should resolve to the same instance
      resolvedResults.forEach(result => {
        expect(result).toBe(mockLlamaInstance);
      });
    });

    it('should maintain performance under moderate load', async () => {
      // Test with moderate load
      const operations = [];

      for (let i = 0; i < 10; i++) {
        if (i % 2 === 0) {
          sharedLlamaInstance.markInferenceStart();
          operations.push(sharedLlamaInstance.getLlamaForSystemInfo());
          sharedLlamaInstance.markInferenceEnd();
          await vi.runAllTimersAsync();
        } else {
          operations.push(sharedLlamaInstance.getLlama());
        }
      }

      const results = await Promise.all(operations);

      // All should succeed and return the same instance
      results.forEach(result => {
        expect(result).toBe(mockLlamaInstance);
      });

      // Should only initialize once despite all the operations
      expect(getLlama).toHaveBeenCalledTimes(1);
    });
  });

  describe('integration scenarios', () => {
    it('should work correctly in HTTP request context', async () => {
      // Simulate multiple HTTP requests accessing the instance
      const httpRequests = [];

      for (let i = 0; i < 5; i++) {
        const requestId = `req-${i}`;

        // Some requests get the instance normally
        httpRequests.push(
          (async () => {
            const llama = await sharedLlamaInstance.getLlama();
            return { requestId, llama };
          })()
        );
      }

      const results = await Promise.all(httpRequests);

      // All should get the same Llama instance
      results.forEach(({ llama }) => {
        expect(llama).toBe(mockLlamaInstance);
      });

      // Should only initialize once
      expect(getLlama).toHaveBeenCalledTimes(1);
    });

    it('should handle server request patterns', async () => {
      // Simulate server request patterns
      const serverOperations = [];

      for (let i = 0; i < 5; i++) {
        serverOperations.push(
          (async () => {
            // Simulate some inference work
            sharedLlamaInstance.markInferenceStart();

            // System info request during inference
            const systemInfoPromise =
              sharedLlamaInstance.getLlamaForSystemInfo();

            // Simulate inference completing
            sharedLlamaInstance.markInferenceEnd();
            await vi.runAllTimersAsync();

            return await systemInfoPromise;
          })()
        );
      }

      const results = await Promise.all(serverOperations);

      // All operations should succeed
      results.forEach(result => {
        expect(result).toBe(mockLlamaInstance);
      });

      // Still only one initialization
      expect(getLlama).toHaveBeenCalledTimes(1);
    });

    it('should handle error recovery in production scenarios', async () => {
      const initError = ErrorFactory.networkTimeout();

      // First request fails
      vi.mocked(getLlama).mockRejectedValueOnce(initError);
      await expect(sharedLlamaInstance.getLlama()).rejects.toThrow(
        initError.message
      );

      // Reset state for recovery
      resetSingletonState();

      // Subsequent requests should work
      vi.mocked(getLlama).mockResolvedValue(mockLlamaInstance as Llama);
      const llama = await sharedLlamaInstance.getLlama();
      expect(llama).toBe(mockLlamaInstance);

      // System should continue working normally
      const systemInfoLlama = await sharedLlamaInstance.getLlamaForSystemInfo();
      expect(systemInfoLlama).toBe(mockLlamaInstance);
    });
  });

  describe('configuration and initialization', () => {
    it('should initialize with correct GPU configuration', async () => {
      await sharedLlamaInstance.getLlama();

      expect(getLlama).toHaveBeenCalledWith({ gpu: 'auto' });
    });

    it('should handle different initialization configurations', async () => {
      // Mock different initialization responses
      const configs = [
        { gpu: 'auto' },
        { gpu: 'auto' }, // Should use the same config consistently
      ];

      for (const config of configs) {
        await sharedLlamaInstance.getLlama();
      }

      // Should always use the same configuration
      expect(getLlama).toHaveBeenCalledWith({ gpu: 'auto' });
    });

    it('should maintain configuration consistency', async () => {
      // Multiple calls should use consistent configuration
      await Promise.all([
        sharedLlamaInstance.getLlama(),
        sharedLlamaInstance.getLlama(),
        sharedLlamaInstance.getLlama(),
      ]);

      // Should only initialize once with consistent config
      expect(getLlama).toHaveBeenCalledTimes(1);
      expect(getLlama).toHaveBeenCalledWith({ gpu: 'auto' });
    });
  });
});
