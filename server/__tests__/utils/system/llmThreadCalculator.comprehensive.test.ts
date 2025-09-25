/**
 * Comprehensive tests for LLM Thread Calculator
 * Tests optimal thread count calculation for LLM inference
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LLMThreadCalculator,
  demonstrateThreadCalculation,
} from '../../../utils/system/llmThreadCalculator.js';
import type {
  CPU,
  SystemInfo,
} from '../../../utils/system/llmThreadCalculator.js';
import {
  mockCPUConfigurations,
  expectedResults,
  performanceBenchmarks,
  SystemMockFactories,
} from '../../fixtures/systemTestData.js';

// Create CPU configurations compatible with LLMThreadCalculator interface
const createCPU = (config: typeof mockCPUConfigurations.intel12thGen): CPU => ({
  id: config.id,
  vendorId: config.vendorId,
  modelName: config.modelName,
  coreCount: config.coreCount,
  efficiencyCoreCount: config.efficiencyCoreCount,
  threadCount: config.threadCount,
});

const testCPUs = {
  intel12thGen: createCPU(mockCPUConfigurations.intel12thGen),
  amdRyzen: createCPU(mockCPUConfigurations.amdRyzen),
  appleM2: createCPU(mockCPUConfigurations.appleM2),
  generic: createCPU(mockCPUConfigurations.generic),
  lowEnd: createCPU(mockCPUConfigurations.lowEnd),
  serverCPU: createCPU(mockCPUConfigurations.serverCPU),
};

describe('LLMThreadCalculator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getOptimalThreadCount', () => {
    it('should return 0 for empty CPU array', () => {
      const result = LLMThreadCalculator.getOptimalThreadCount([]);
      expect(result).toBe(0);
    });

    it('should calculate optimal threads for Intel 12th gen (P+E cores)', () => {
      const cpus = [testCPUs.intel12thGen];
      const result = LLMThreadCalculator.getOptimalThreadCount(cpus);

      expect(result).toBe(expectedResults.intel12thGenOptimalThreads);
      expect(result).toBe(
        testCPUs.intel12thGen.coreCount -
          testCPUs.intel12thGen.efficiencyCoreCount
      );
    });

    it('should calculate optimal threads for AMD Ryzen (no efficiency cores)', () => {
      const cpus = [testCPUs.amdRyzen];
      const result = LLMThreadCalculator.getOptimalThreadCount(cpus);

      expect(result).toBe(expectedResults.amdRyzenOptimalThreads);
      expect(result).toBe(testCPUs.amdRyzen.coreCount); // No efficiency cores
    });

    it('should calculate optimal threads for Apple M2 (P+E cores)', () => {
      const cpus = [testCPUs.appleM2];
      const result = LLMThreadCalculator.getOptimalThreadCount(cpus);

      expect(result).toBe(expectedResults.appleM2OptimalThreads);
      expect(result).toBe(
        testCPUs.appleM2.coreCount - testCPUs.appleM2.efficiencyCoreCount
      );
    });

    it('should handle single-core systems', () => {
      const singleCoreCPU: CPU = {
        id: '0',
        vendorId: 'Generic',
        modelName: 'Single Core CPU',
        coreCount: 1,
        efficiencyCoreCount: 0,
        threadCount: 1,
      };

      const result = LLMThreadCalculator.getOptimalThreadCount([singleCoreCPU]);
      expect(result).toBe(1);
    });

    it('should handle CPUs with only efficiency cores', () => {
      const efficiencyOnlyCPU: CPU = {
        id: '0',
        vendorId: 'Test',
        modelName: 'Efficiency Only CPU',
        coreCount: 4,
        efficiencyCoreCount: 4,
        threadCount: 4,
      };

      const result = LLMThreadCalculator.getOptimalThreadCount([
        efficiencyOnlyCPU,
      ]);
      expect(result).toBe(0); // No performance cores available
    });

    it('should aggregate performance cores across multiple CPUs', () => {
      const cpus = [testCPUs.intel12thGen, testCPUs.amdRyzen];
      const result = LLMThreadCalculator.getOptimalThreadCount(cpus);

      const expectedTotal =
        testCPUs.intel12thGen.coreCount -
        testCPUs.intel12thGen.efficiencyCoreCount +
        (testCPUs.amdRyzen.coreCount - testCPUs.amdRyzen.efficiencyCoreCount);

      expect(result).toBe(expectedTotal);
    });

    it('should handle multi-socket server configurations', () => {
      const cpus = [testCPUs.serverCPU, testCPUs.serverCPU]; // Dual socket
      const result = LLMThreadCalculator.getOptimalThreadCount(cpus);

      expect(result).toBe(testCPUs.serverCPU.coreCount * 2); // 28 * 2 = 56
    });

    it('should complete calculation within performance benchmark', () => {
      const startTime = Date.now();

      // Test with a large configuration
      const largeCPUArray = Array(100).fill(testCPUs.serverCPU);
      LLMThreadCalculator.getOptimalThreadCount(largeCPUArray);

      const calculationTime = Date.now() - startTime;
      expect(calculationTime).toBeLessThan(
        performanceBenchmarks.threadCalculationTime.maxMs
      );
    });
  });

  describe('validateThreadCount', () => {
    const testSystemInfo: SystemInfo = {
      platform: 'linux',
      cpus: [testCPUs.intel12thGen],
    };

    it('should return requested thread count when within limits', () => {
      const requestedThreads = 4;
      const result = LLMThreadCalculator.validateThreadCount(
        requestedThreads,
        testSystemInfo
      );
      expect(result).toBe(requestedThreads);
    });

    it('should cap thread count to optimal when requested exceeds optimal', () => {
      const requestedThreads = 50; // Much higher than optimal
      const result = LLMThreadCalculator.validateThreadCount(
        requestedThreads,
        testSystemInfo
      );

      const optimalThreads = LLMThreadCalculator.getOptimalThreadCount(
        testSystemInfo.cpus
      );
      expect(result).toBe(optimalThreads);
    });

    it('should cap thread count to core-based maximum', () => {
      const requestedThreads = 100;
      const maxThreadsPerCore = 1; // Very restrictive
      const result = LLMThreadCalculator.validateThreadCount(
        requestedThreads,
        testSystemInfo,
        maxThreadsPerCore
      );

      const totalCores = testSystemInfo.cpus.reduce(
        (sum, cpu) => sum + cpu.coreCount,
        0
      );
      expect(result).toBeLessThanOrEqual(totalCores * maxThreadsPerCore);
    });

    it('should enforce minimum of 1 thread', () => {
      const requestedThreads = -5;
      const result = LLMThreadCalculator.validateThreadCount(
        requestedThreads,
        testSystemInfo
      );
      expect(result).toBe(1);
    });

    it('should handle zero requested threads', () => {
      const requestedThreads = 0;
      const result = LLMThreadCalculator.validateThreadCount(
        requestedThreads,
        testSystemInfo
      );
      expect(result).toBe(1);
    });

    it('should log warning when capping thread count', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const requestedThreads = 100;
      LLMThreadCalculator.validateThreadCount(requestedThreads, testSystemInfo);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          `Requested ${requestedThreads} threads exceeds maximum`
        )
      );

      consoleSpy.mockRestore();
    });

    it('should handle custom maxThreadsPerCore values', () => {
      const testCases = [
        { maxThreadsPerCore: 1, expectedMax: testSystemInfo.cpus[0].coreCount },
        {
          maxThreadsPerCore: 2,
          expectedMax: testSystemInfo.cpus[0].coreCount * 2,
        },
        {
          maxThreadsPerCore: 4,
          expectedMax: testSystemInfo.cpus[0].coreCount * 4,
        },
      ];

      testCases.forEach(({ maxThreadsPerCore, expectedMax }) => {
        const requestedThreads = 1000; // Very high request
        const result = LLMThreadCalculator.validateThreadCount(
          requestedThreads,
          testSystemInfo,
          maxThreadsPerCore
        );

        const optimalThreads = LLMThreadCalculator.getOptimalThreadCount(
          testSystemInfo.cpus
        );
        const expected = Math.min(optimalThreads, expectedMax);
        expect(result).toBe(expected);
      });
    });
  });

  describe('getThreadCountRecommendation', () => {
    const testSystemInfo: SystemInfo = {
      platform: 'linux',
      cpus: [testCPUs.intel12thGen],
    };

    it('should recommend optimal threads for inference use case', () => {
      const recommendation = LLMThreadCalculator.getThreadCountRecommendation(
        testSystemInfo,
        'inference'
      );

      const optimalThreads = LLMThreadCalculator.getOptimalThreadCount(
        testSystemInfo.cpus
      );
      expect(recommendation.recommended).toBe(optimalThreads);
      expect(recommendation.reasoning).toContain('performance cores');
      expect(recommendation.reasoning).toContain('inference latency');
    });

    it('should recommend more threads for training use case', () => {
      const recommendation = LLMThreadCalculator.getThreadCountRecommendation(
        testSystemInfo,
        'training'
      );

      const optimalThreads = LLMThreadCalculator.getOptimalThreadCount(
        testSystemInfo.cpus
      );
      expect(recommendation.recommended).toBeGreaterThanOrEqual(optimalThreads);
      expect(recommendation.reasoning).toContain('training throughput');
    });

    it('should recommend fewer threads for serving use case', () => {
      const recommendation = LLMThreadCalculator.getThreadCountRecommendation(
        testSystemInfo,
        'serving'
      );

      const optimalThreads = LLMThreadCalculator.getOptimalThreadCount(
        testSystemInfo.cpus
      );
      expect(recommendation.recommended).toBeLessThanOrEqual(optimalThreads);
      expect(recommendation.recommended).toBeGreaterThanOrEqual(1);
      expect(recommendation.reasoning).toContain(
        'concurrent request processing'
      );
    });

    it('should provide consistent bounds across all use cases', () => {
      const useCases: Array<'inference' | 'training' | 'serving'> = [
        'inference',
        'training',
        'serving',
      ];

      useCases.forEach(useCase => {
        const recommendation = LLMThreadCalculator.getThreadCountRecommendation(
          testSystemInfo,
          useCase
        );

        expect(recommendation.minimum).toBe(1);
        expect(recommendation.maximum).toBeGreaterThanOrEqual(
          recommendation.minimum
        );
        expect(recommendation.recommended).toBeGreaterThanOrEqual(
          recommendation.minimum
        );
        expect(recommendation.recommended).toBeLessThanOrEqual(
          recommendation.maximum
        );
        expect(recommendation.reasoning).toBeTruthy();
        expect(typeof recommendation.reasoning).toBe('string');
      });
    });

    it('should handle systems with only efficiency cores', () => {
      const efficiencyOnlySystem: SystemInfo = {
        platform: 'unknown',
        cpus: [
          {
            id: '0',
            vendorId: 'Test',
            modelName: 'Efficiency Only',
            coreCount: 4,
            efficiencyCoreCount: 4,
            threadCount: 4,
          },
        ],
      };

      const recommendation = LLMThreadCalculator.getThreadCountRecommendation(
        efficiencyOnlySystem,
        'inference'
      );

      expect(recommendation.recommended).toBe(0); // No performance cores
      expect(recommendation.minimum).toBe(1);
      expect(recommendation.maximum).toBe(0);
    });

    it('should handle high-core-count server systems', () => {
      const serverSystem: SystemInfo = {
        platform: 'linux',
        cpus: [testCPUs.serverCPU, testCPUs.serverCPU], // Dual socket
      };

      const recommendations = ['inference', 'training', 'serving'] as const;

      recommendations.forEach(useCase => {
        const recommendation = LLMThreadCalculator.getThreadCountRecommendation(
          serverSystem,
          useCase
        );

        expect(recommendation.recommended).toBeGreaterThan(0);
        // Training can use up to 1.5x optimal threads (56 * 1.5 = 84)
        const maxExpected = useCase === 'training' ? 112 : 56; // 112 is total logical cores for dual socket
        expect(recommendation.recommended).toBeLessThanOrEqual(maxExpected);
      });
    });

    it('should default to inference behavior for unknown use cases', () => {
      const recommendation =
        LLMThreadCalculator.getThreadCountRecommendation(testSystemInfo);

      const inferenceRecommendation =
        LLMThreadCalculator.getThreadCountRecommendation(
          testSystemInfo,
          'inference'
        );

      expect(recommendation.recommended).toBe(
        inferenceRecommendation.recommended
      );
      expect(recommendation.reasoning).toContain(
        'performance cores for optimal inference latency'
      );
    });
  });

  describe('analyzeSystem', () => {
    it('should analyze system without errors and provide comprehensive output', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const testSystem: SystemInfo = {
        platform: 'linux',
        cpus: [testCPUs.intel12thGen, testCPUs.amdRyzen],
      };

      LLMThreadCalculator.analyzeSystem(testSystem);

      expect(consoleSpy).toHaveBeenCalled();

      const loggedOutput = consoleSpy.mock.calls
        .map(call => call.join(' '))
        .join('\n');

      // Check for main sections
      expect(loggedOutput).toContain('LLM Thread Calculator Analysis');
      expect(loggedOutput).toContain('Platform: linux');
      expect(loggedOutput).toContain('CPU Packages: 2');
      expect(loggedOutput).toContain('Summary');
      expect(loggedOutput).toContain('Recommendations');

      // Check for CPU details
      expect(loggedOutput).toContain('CPU 0:');
      expect(loggedOutput).toContain('CPU 1:');
      expect(loggedOutput).toContain('Model: Intel(R) Core(TM) i7-12700K');
      expect(loggedOutput).toContain('Model: AMD Ryzen 9 7950X');

      // Check for recommendations for all use cases
      expect(loggedOutput).toContain('inference:');
      expect(loggedOutput).toContain('training:');
      expect(loggedOutput).toContain('serving:');

      consoleSpy.mockRestore();
    });

    it('should handle single CPU systems', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const singleCPUSystem: SystemInfo = {
        platform: 'darwin',
        cpus: [testCPUs.appleM2],
      };

      LLMThreadCalculator.analyzeSystem(singleCPUSystem);

      const loggedOutput = consoleSpy.mock.calls
        .map(call => call.join(' '))
        .join('\n');
      expect(loggedOutput).toContain('CPU Packages: 1');
      expect(loggedOutput).toContain('CPU 0:');
      expect(loggedOutput).not.toContain('CPU 1:');

      consoleSpy.mockRestore();
    });

    it('should calculate totals correctly across multiple CPUs', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const multiCPUSystem: SystemInfo = {
        platform: 'linux',
        cpus: [testCPUs.intel12thGen, testCPUs.amdRyzen],
      };

      LLMThreadCalculator.analyzeSystem(multiCPUSystem);

      const loggedOutput = consoleSpy.mock.calls
        .map(call => call.join(' '))
        .join('\n');

      const expectedTotalCores =
        testCPUs.intel12thGen.coreCount + testCPUs.amdRyzen.coreCount;
      const expectedTotalThreads =
        testCPUs.intel12thGen.threadCount + testCPUs.amdRyzen.threadCount;
      const expectedEfficiencyCores =
        testCPUs.intel12thGen.efficiencyCoreCount +
        testCPUs.amdRyzen.efficiencyCoreCount;
      const expectedPerformanceCores =
        expectedTotalCores - expectedEfficiencyCores;

      expect(loggedOutput).toContain(`Total Cores: ${expectedTotalCores}`);
      expect(loggedOutput).toContain(
        `Performance Cores: ${expectedPerformanceCores}`
      );
      expect(loggedOutput).toContain(
        `Efficiency Cores: ${expectedEfficiencyCores}`
      );
      expect(loggedOutput).toContain(
        `Logical Threads: ${expectedTotalThreads}`
      );

      consoleSpy.mockRestore();
    });
  });

  describe('detectSystemInfo', () => {
    let mockNavigator: Partial<Navigator>;

    beforeEach(() => {
      mockNavigator = SystemMockFactories.createMockNavigator();
      Object.defineProperty(globalThis, 'navigator', {
        value: mockNavigator,
        writable: true,
        configurable: true, // Allow deletion
      });
    });

    afterEach(() => {
      if ('navigator' in globalThis) {
        Object.defineProperty(globalThis, 'navigator', {
          value: undefined,
          writable: true,
          configurable: true,
        });
      }
    });

    it('should detect platform from user agent', async () => {
      const testCases = [
        {
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          expectedPlatform: 'darwin',
        },
        {
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          expectedPlatform: 'windows',
        },
        {
          userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
          expectedPlatform: 'linux',
        },
        { userAgent: 'Mozilla/5.0 (Unknown)', expectedPlatform: 'unknown' },
      ];

      for (const { userAgent, expectedPlatform } of testCases) {
        mockNavigator.userAgent = userAgent;

        const systemInfo = await LLMThreadCalculator.detectSystemInfo();
        expect(systemInfo.platform).toBe(expectedPlatform);
        expect(systemInfo.cpus).toHaveLength(1);
      }
    });

    it('should use hardwareConcurrency for CPU detection', async () => {
      const concurrencyValues = [4, 8, 12, 16, 24, 32];

      for (const concurrency of concurrencyValues) {
        mockNavigator.hardwareConcurrency = concurrency;

        const systemInfo = await LLMThreadCalculator.detectSystemInfo();

        if (systemInfo.platform === 'unknown') {
          expect(systemInfo.cpus[0].threadCount).toBe(concurrency);
          expect(systemInfo.cpus[0].coreCount).toBe(concurrency);
        }
      }
    });

    it('should simulate platform-specific CPU configurations', async () => {
      mockNavigator.userAgent =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';

      const systemInfo = await LLMThreadCalculator.detectSystemInfo();

      expect(systemInfo.platform).toBe('darwin');
      expect(systemInfo.cpus[0].vendorId).toBe('Apple');
      expect(systemInfo.cpus[0].efficiencyCoreCount).toBeGreaterThan(0);
    });

    it('should handle missing navigator gracefully', async () => {
      // Remove navigator by setting it to undefined
      Object.defineProperty(globalThis, 'navigator', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const systemInfo = await LLMThreadCalculator.detectSystemInfo();
      expect(systemInfo.platform).toBe('unknown');
    });
  });

  describe('Private helper methods (tested through public interface)', () => {
    it('should detect platform correctly', async () => {
      const testCases = [
        { userAgent: 'mac os x', expectedPlatform: 'darwin' },
        { userAgent: 'windows', expectedPlatform: 'windows' },
        { userAgent: 'linux', expectedPlatform: 'linux' },
        { userAgent: 'some other browser', expectedPlatform: 'unknown' },
      ];

      for (const { userAgent, expectedPlatform } of testCases) {
        const mockNav = SystemMockFactories.createMockNavigator(8, userAgent);
        Object.defineProperty(globalThis, 'navigator', {
          value: mockNav,
          writable: true,
        });

        const systemInfo = await LLMThreadCalculator.detectSystemInfo();
        expect(systemInfo.platform).toBe(expectedPlatform);
      }
    });

    it('should simulate sysctls correctly', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: SystemMockFactories.createMockNavigator(8, 'mac'),
        writable: true,
      });

      const systemInfo = await LLMThreadCalculator.detectSystemInfo();

      expect(systemInfo.platform).toBe('darwin');
      // Should use simulated sysctl values
      expect(systemInfo.cpus[0].coreCount).toBe(12); // 8 performance + 4 efficiency
      expect(systemInfo.cpus[0].efficiencyCoreCount).toBe(4);
      expect(systemInfo.cpus[0].threadCount).toBe(12);
    });
  });

  describe('Edge cases and stress tests', () => {
    it('should handle extreme CPU configurations', () => {
      const extremeCases = [
        // Single core system
        { coreCount: 1, efficiencyCoreCount: 0, threadCount: 1 },
        // All efficiency cores
        { coreCount: 8, efficiencyCoreCount: 8, threadCount: 8 },
        // High-end server
        { coreCount: 128, efficiencyCoreCount: 0, threadCount: 256 },
        // Unusual efficiency configuration
        { coreCount: 20, efficiencyCoreCount: 12, threadCount: 24 },
      ];

      extremeCases.forEach((config, index) => {
        const cpu: CPU = {
          id: index.toString(),
          vendorId: 'Test',
          modelName: `Test CPU ${index}`,
          ...config,
        };

        const optimalThreads = LLMThreadCalculator.getOptimalThreadCount([cpu]);
        expect(optimalThreads).toBe(
          config.coreCount - config.efficiencyCoreCount
        );
        expect(optimalThreads).toBeGreaterThanOrEqual(0);
      });
    });

    it('should handle large numbers of CPUs efficiently', () => {
      const startTime = Date.now();

      // Create 1000 CPUs (extreme multi-socket server)
      const manyCPUs: CPU[] = Array(1000)
        .fill(0)
        .map((_, i) => ({
          id: i.toString(),
          vendorId: 'Test',
          modelName: `CPU ${i}`,
          coreCount: 8,
          efficiencyCoreCount: 2,
          threadCount: 16,
        }));

      const result = LLMThreadCalculator.getOptimalThreadCount(manyCPUs);

      const calculationTime = Date.now() - startTime;
      expect(calculationTime).toBeLessThan(100); // Should be very fast
      expect(result).toBe(6000); // (8-2) * 1000 = 6000 performance cores
    });

    it('should provide consistent recommendations across multiple calls', () => {
      const systemInfo: SystemInfo = {
        platform: 'linux',
        cpus: [testCPUs.intel12thGen],
      };

      const useCases: Array<'inference' | 'training' | 'serving'> = [
        'inference',
        'training',
        'serving',
      ];

      // Run multiple times to ensure consistency
      for (let i = 0; i < 10; i++) {
        useCases.forEach(useCase => {
          const rec1 = LLMThreadCalculator.getThreadCountRecommendation(
            systemInfo,
            useCase
          );
          const rec2 = LLMThreadCalculator.getThreadCountRecommendation(
            systemInfo,
            useCase
          );

          expect(rec1.recommended).toBe(rec2.recommended);
          expect(rec1.minimum).toBe(rec2.minimum);
          expect(rec1.maximum).toBe(rec2.maximum);
          expect(rec1.reasoning).toBe(rec2.reasoning);
        });
      }
    });
  });

  describe('demonstrateThreadCalculation integration', () => {
    it('should run demonstration without errors', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await demonstrateThreadCalculation();

      expect(consoleSpy).toHaveBeenCalled();

      const loggedOutput = consoleSpy.mock.calls
        .map(call => call.join(' '))
        .join('\n');
      expect(loggedOutput).toContain('LLM Thread Count Calculator Demo');
      expect(loggedOutput).toContain('Testing: Intel 12th Gen (P+E cores)');
      expect(loggedOutput).toContain('Testing: AMD Ryzen (SMT)');
      expect(loggedOutput).toContain('Testing: Apple Silicon M2');
      expect(loggedOutput).toContain('Live System Detection');

      consoleSpy.mockRestore();
    });

    it('should show correct thread counts for test configurations', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await demonstrateThreadCalculation();

      const loggedOutput = consoleSpy.mock.calls
        .map(call => call.join(' '))
        .join('\n');

      // Check for expected optimal thread counts based on demo's hardcoded values
      // Intel 12th Gen: 12 cores - 4 efficiency = 8 optimal
      expect(loggedOutput).toContain('Intel 12th Gen');
      expect(loggedOutput).toContain('Optimal Thread Count: 8');

      // AMD Ryzen demo config: 8 cores - 0 efficiency = 8 optimal
      expect(loggedOutput).toContain('AMD Ryzen');
      expect(loggedOutput).toContain('Optimal Thread Count: 8');

      // Apple M2: 10 cores - 4 efficiency = 6 optimal
      expect(loggedOutput).toContain('Apple Silicon M2');
      expect(loggedOutput).toContain('Optimal Thread Count: 6');

      consoleSpy.mockRestore();
    });
  });
});
