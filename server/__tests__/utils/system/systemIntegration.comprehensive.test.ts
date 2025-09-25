/**
 * Comprehensive integration tests for System Modules
 * Tests interactions between CPU detection, thread calculation, and resource allocation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RealCPUDetector } from '../../../utils/system/cpuDetector.js';
import { LLMThreadCalculator } from '../../../utils/system/llmThreadCalculator.js';
import type { SystemInfo as ThreadCalculatorSystemInfo } from '../../../utils/system/llmThreadCalculator.js';
import { LLMResourceCalculator } from '../../../utils/system/llmResourceCalculator.js';
import type { SystemInfo } from '../../../utils/system/cpuDetector.js';
import type {
  GpuInfo,
  ModelInfo,
} from '../../../utils/system/llmResourceCalculator.js';
import {
  mockSystemConfigurations,
  mockGPUConfigurations,
  mockModelConfigurations,
  SystemMockFactories,
  expectedResults,
  performanceBenchmarks,
} from '../../fixtures/systemTestData.js';

// Mock Node.js modules for integration tests
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock('os', () => ({
  platform: vi.fn(),
  totalmem: vi.fn(),
  cpus: vi.fn(),
  arch: vi.fn(),
}));

describe('System Modules Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('CPU Detection → Thread Calculation Pipeline', () => {
    it('should flow CPU detection results to thread calculator', async () => {
      const childProcess = await import('child_process');
      const os = await import('os');
      const mockExecSync = childProcess.execSync as ReturnType<typeof vi.fn>;
      const mockPlatform = os.platform as ReturnType<typeof vi.fn>;
      const mockTotalmem = os.totalmem as ReturnType<typeof vi.fn>;

      // Setup macOS M2 detection
      const systemMocks = SystemMockFactories.createSystemEnvironmentMock(
        'darwin',
        mockSystemConfigurations.macOS.cpus[0],
        16
      );

      mockPlatform.mockImplementation(systemMocks.os.platform);
      mockTotalmem.mockImplementation(systemMocks.os.totalmem);
      mockExecSync.mockImplementation(systemMocks.execSync);

      // Step 1: Detect CPU
      const systemInfo = await RealCPUDetector.detectCPUInfo();

      expect(systemInfo.platform).toBe('darwin');
      expect(systemInfo.cpus).toHaveLength(1);
      expect(systemInfo.cpus[0].efficiencyCoreCount).toBeGreaterThan(0);

      // Step 2: Convert to thread calculator format and calculate optimal threads
      const threadCalculatorCPUs = systemInfo.cpus.map(cpu => ({
        id: cpu.id,
        vendorId: cpu.vendorId,
        modelName: cpu.modelName,
        coreCount: cpu.coreCount,
        efficiencyCoreCount: cpu.efficiencyCoreCount,
        threadCount: cpu.threadCount,
      }));

      const optimalThreads =
        LLMThreadCalculator.getOptimalThreadCount(threadCalculatorCPUs);

      expect(optimalThreads).toBe(expectedResults.appleM2OptimalThreads);
      expect(optimalThreads).toBe(
        systemInfo.cpus[0].coreCount - systemInfo.cpus[0].efficiencyCoreCount
      );
    });

    it('should provide consistent thread recommendations across different platforms', async () => {
      const childProcess = await import('child_process');
      const os = await import('os');
      const fs = await import('fs');
      const mockExecSync = childProcess.execSync as ReturnType<typeof vi.fn>;
      const mockPlatform = os.platform as ReturnType<typeof vi.fn>;
      const mockTotalmem = os.totalmem as ReturnType<typeof vi.fn>;
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      const mockReaddirSync = fs.readdirSync as ReturnType<typeof vi.fn>;

      const platformTests = [
        { platform: 'darwin', config: mockSystemConfigurations.macOS },
        { platform: 'linux', config: mockSystemConfigurations.linux },
        { platform: 'win32', config: mockSystemConfigurations.windows },
      ];

      for (const { platform, config } of platformTests) {
        // Setup platform-specific mocks
        const systemMocks = SystemMockFactories.createSystemEnvironmentMock(
          platform as NodeJS.Platform,
          config.cpus[0],
          config.totalMemory / (1024 * 1024 * 1024)
        );

        mockPlatform.mockImplementation(systemMocks.os.platform);
        mockTotalmem.mockImplementation(systemMocks.os.totalmem);
        mockExecSync.mockImplementation(systemMocks.execSync);
        mockReadFileSync.mockImplementation(systemMocks.readFileSync);
        mockReaddirSync.mockImplementation(systemMocks.readdirSync);

        const systemInfo = await RealCPUDetector.detectCPUInfo();
        const threadCalculatorCPUs = systemInfo.cpus.map(cpu => ({
          id: cpu.id,
          vendorId: cpu.vendorId,
          modelName: cpu.modelName,
          coreCount: cpu.coreCount,
          efficiencyCoreCount: cpu.efficiencyCoreCount,
          threadCount: cpu.threadCount,
        }));

        const optimalThreads =
          LLMThreadCalculator.getOptimalThreadCount(threadCalculatorCPUs);
        const systemInfoForRecommendations: ThreadCalculatorSystemInfo = {
          platform: platform as 'linux' | 'windows' | 'darwin' | 'unknown',
          cpus: threadCalculatorCPUs,
        };

        // Get recommendations for different use cases
        const inferenceRec = LLMThreadCalculator.getThreadCountRecommendation(
          systemInfoForRecommendations,
          'inference'
        );
        const trainingRec = LLMThreadCalculator.getThreadCountRecommendation(
          systemInfoForRecommendations,
          'training'
        );
        const servingRec = LLMThreadCalculator.getThreadCountRecommendation(
          systemInfoForRecommendations,
          'serving'
        );

        // Validate recommendations make sense
        expect(optimalThreads).toBeGreaterThan(0);
        expect(inferenceRec.recommended).toBe(optimalThreads);
        expect(trainingRec.recommended).toBeGreaterThanOrEqual(optimalThreads);
        expect(servingRec.recommended).toBeLessThanOrEqual(optimalThreads);
        expect(servingRec.recommended).toBeGreaterThan(0);
      }
    });
  });

  describe('CPU Detection → Resource Calculation Pipeline', () => {
    it('should flow CPU detection to resource calculator configuration', async () => {
      const childProcess = await import('child_process');
      const os = await import('os');
      const mockExecSync = childProcess.execSync as ReturnType<typeof vi.fn>;
      const mockPlatform = os.platform as ReturnType<typeof vi.fn>;
      const mockTotalmem = os.totalmem as ReturnType<typeof vi.fn>;

      // Setup Intel 12th gen system
      const systemMocks = SystemMockFactories.createSystemEnvironmentMock(
        'win32',
        mockSystemConfigurations.windows.cpus[0],
        16
      );

      mockPlatform.mockImplementation(systemMocks.os.platform);
      mockTotalmem.mockImplementation(systemMocks.os.totalmem);
      mockExecSync.mockImplementation(systemMocks.execSync);

      // Step 1: Detect CPU
      const systemInfo = await RealCPUDetector.detectCPUInfo();

      // Step 2: Convert to resource calculator format
      const resourceCPUs = systemInfo.cpus.map(cpu => ({
        coreCount: cpu.coreCount,
        efficiencyCoreCount: cpu.efficiencyCoreCount,
      }));

      // Step 3: Calculate optimal configuration
      const gpus = [mockGPUConfigurations.rtx4090];
      const model = mockModelConfigurations.llama7b;

      const config = LLMResourceCalculator.calculateOptimalConfig(
        resourceCPUs,
        gpus,
        model
      );

      expect(config.numThread).toBe(expectedResults.intel12thGenOptimalThreads);
      expect(config.estimate.layers).toBeGreaterThan(0);
      expect(config.estimate.fullyLoaded).toBe(
        expectedResults.llama7bOn24GBGpu.shouldFitCompletely
      );
    });

    it('should optimize differently for different CPU architectures', async () => {
      const childProcess = await import('child_process');
      const os = await import('os');
      const fs = await import('fs');
      const mockExecSync = childProcess.execSync as ReturnType<typeof vi.fn>;
      const mockPlatform = os.platform as ReturnType<typeof vi.fn>;
      const mockTotalmem = os.totalmem as ReturnType<typeof vi.fn>;
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      const mockReaddirSync = fs.readdirSync as ReturnType<typeof vi.fn>;

      const architectureTests = [
        {
          name: 'Intel 12th Gen (P+E cores)',
          platform: 'win32' as const,
          config: mockSystemConfigurations.windows,
          expectedOptimalThreads: expectedResults.intel12thGenOptimalThreads,
        },
        {
          name: 'AMD Ryzen (SMT)',
          platform: 'linux' as const,
          config: mockSystemConfigurations.linux,
          expectedOptimalThreads: expectedResults.amdRyzenOptimalThreads,
        },
        {
          name: 'Apple M2 (P+E cores)',
          platform: 'darwin' as const,
          config: mockSystemConfigurations.macOS,
          expectedOptimalThreads: expectedResults.appleM2OptimalThreads,
        },
      ];

      const gpus = [mockGPUConfigurations.rtx4090];
      const model = mockModelConfigurations.llama7b;

      for (const test of architectureTests) {
        const systemMocks = SystemMockFactories.createSystemEnvironmentMock(
          test.platform,
          test.config.cpus[0],
          test.config.totalMemory / (1024 * 1024 * 1024)
        );

        mockPlatform.mockImplementation(systemMocks.os.platform);
        mockTotalmem.mockImplementation(systemMocks.os.totalmem);
        mockExecSync.mockImplementation(systemMocks.execSync);
        mockReadFileSync.mockImplementation(systemMocks.readFileSync);
        mockReaddirSync.mockImplementation(systemMocks.readdirSync);

        const systemInfo = await RealCPUDetector.detectCPUInfo();
        const resourceCPUs = systemInfo.cpus.map(cpu => ({
          coreCount: cpu.coreCount,
          efficiencyCoreCount: cpu.efficiencyCoreCount,
        }));

        const config = LLMResourceCalculator.calculateOptimalConfig(
          resourceCPUs,
          gpus,
          model
        );

        expect(config.numThread).toBe(test.expectedOptimalThreads);
      }
    });
  });

  describe('Thread Calculation → Resource Calculation Integration', () => {
    it('should use thread calculator results in resource optimization', () => {
      const cpuConfigs = [
        { coreCount: 12, efficiencyCoreCount: 4 }, // Intel 12th gen
        { coreCount: 16, efficiencyCoreCount: 0 }, // AMD Ryzen
        { coreCount: 10, efficiencyCoreCount: 4 }, // Apple M2
      ];

      const gpus = [mockGPUConfigurations.rtx4090];
      const model = mockModelConfigurations.llama7b;

      cpuConfigs.forEach(cpuConfig => {
        // Calculate optimal threads using thread calculator
        const threadCalculatorCPU = {
          id: '0',
          vendorId: 'Test',
          modelName: 'Test CPU',
          threadCount: cpuConfig.coreCount * 2,
          ...cpuConfig,
        };
        const optimalThreads = LLMThreadCalculator.getOptimalThreadCount([
          threadCalculatorCPU,
        ]);

        // Use in resource calculator
        const config = LLMResourceCalculator.calculateOptimalConfig(
          [cpuConfig],
          gpus,
          model
        );

        expect(config.numThread).toBe(optimalThreads);
        expect(config.numThread).toBe(
          cpuConfig.coreCount - cpuConfig.efficiencyCoreCount
        );
      });
    });

    it('should validate thread counts against system capabilities', () => {
      const cpuConfig = { coreCount: 8, efficiencyCoreCount: 0 };
      const threadCalculatorCPU = {
        id: '0',
        vendorId: 'Test',
        modelName: 'Test CPU',
        threadCount: 16,
        ...cpuConfig,
      };

      const systemInfo = {
        platform: 'linux' as const,
        cpus: [threadCalculatorCPU],
      };

      // Test different requested thread counts
      const testCases = [
        { requested: 4, expected: 4 }, // Within limits
        { requested: 12, expected: 8 }, // Above optimal, should be capped
        { requested: 0, expected: 1 }, // Below minimum
        { requested: -5, expected: 1 }, // Negative
      ];

      testCases.forEach(({ requested, expected }) => {
        const validated = LLMThreadCalculator.validateThreadCount(
          requested,
          systemInfo
        );
        expect(validated).toBe(expected);
      });
    });
  });

  describe('Full System Pipeline Integration', () => {
    it('should provide complete system analysis and optimization', async () => {
      const os = await import('os');
      const fs = await import('fs');
      const mockPlatform = os.platform as ReturnType<typeof vi.fn>;
      const mockTotalmem = os.totalmem as ReturnType<typeof vi.fn>;
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      const mockReaddirSync = fs.readdirSync as ReturnType<typeof vi.fn>;

      // Setup complete system environment
      const systemMocks = SystemMockFactories.createSystemEnvironmentMock(
        'linux',
        mockSystemConfigurations.linux.cpus[0],
        32
      );

      mockPlatform.mockImplementation(systemMocks.os.platform);
      mockTotalmem.mockImplementation(systemMocks.os.totalmem);
      mockReadFileSync.mockImplementation(systemMocks.readFileSync);
      mockReaddirSync.mockImplementation(systemMocks.readdirSync);

      // Step 1: Detect system hardware
      const systemInfo = await RealCPUDetector.detectCPUInfo();

      // Step 2: Analyze threading capabilities
      const threadCalculatorCPUs = systemInfo.cpus.map(cpu => ({
        id: cpu.id,
        vendorId: cpu.vendorId,
        modelName: cpu.modelName,
        coreCount: cpu.coreCount,
        efficiencyCoreCount: cpu.efficiencyCoreCount,
        threadCount: cpu.threadCount,
      }));

      const systemInfoForThreads: ThreadCalculatorSystemInfo = {
        platform: systemInfo.platform as
          | 'linux'
          | 'windows'
          | 'darwin'
          | 'unknown',
        cpus: threadCalculatorCPUs,
      };
      const recommendations = {
        inference: LLMThreadCalculator.getThreadCountRecommendation(
          systemInfoForThreads,
          'inference'
        ),
        training: LLMThreadCalculator.getThreadCountRecommendation(
          systemInfoForThreads,
          'training'
        ),
        serving: LLMThreadCalculator.getThreadCountRecommendation(
          systemInfoForThreads,
          'serving'
        ),
      };

      // Step 3: Calculate resource requirements for different models
      const resourceCPUs = systemInfo.cpus.map(cpu => ({
        coreCount: cpu.coreCount,
        efficiencyCoreCount: cpu.efficiencyCoreCount,
      }));

      const models = [
        mockModelConfigurations.llama7b,
        mockModelConfigurations.llama13b,
        mockModelConfigurations.llama70b,
      ];

      const gpus = [mockGPUConfigurations.rtx4090];

      const modelConfigs = models.map(model => ({
        model: model.modelSize
          ? `${Math.round(model.modelSize / 1024 ** 3)}B`
          : 'Unknown',
        config: LLMResourceCalculator.calculateOptimalConfig(
          resourceCPUs,
          gpus,
          model
        ),
      }));

      // Validate complete pipeline results
      expect(systemInfo.platform).toBe('linux');
      expect(systemInfo.cpus).toHaveLength(1);
      expect(systemInfo.cpus[0].vendorId).toBe('AuthenticAMD');

      expect(recommendations.inference.recommended).toBe(
        expectedResults.amdRyzenOptimalThreads
      );
      expect(recommendations.training.recommended).toBeGreaterThan(
        recommendations.inference.recommended
      );
      expect(recommendations.serving.recommended).toBeLessThan(
        recommendations.inference.recommended
      );

      modelConfigs.forEach(({ model, config }) => {
        expect(config.numThread).toBe(expectedResults.amdRyzenOptimalThreads);
        expect(config.estimate.layers).toBeGreaterThanOrEqual(0);
        expect(config.estimate.vramSize).toBeGreaterThan(0);
      });

      // Smaller models should fit more layers
      expect(modelConfigs[0].config.estimate.layers).toBeGreaterThanOrEqual(
        modelConfigs[2].config.estimate.layers
      );
    });

    it('should complete full pipeline within performance benchmarks', async () => {
      const childProcess = await import('child_process');
      const os = await import('os');
      const mockExecSync = childProcess.execSync as ReturnType<typeof vi.fn>;
      const mockPlatform = os.platform as ReturnType<typeof vi.fn>;
      const mockTotalmem = os.totalmem as ReturnType<typeof vi.fn>;

      const startTime = Date.now();

      const systemMocks = SystemMockFactories.createSystemEnvironmentMock(
        'darwin',
        mockSystemConfigurations.macOS.cpus[0],
        16
      );

      mockPlatform.mockImplementation(systemMocks.os.platform);
      mockTotalmem.mockImplementation(systemMocks.os.totalmem);
      mockExecSync.mockImplementation(systemMocks.execSync);

      // Run full pipeline
      const systemInfo = await RealCPUDetector.detectCPUInfo();

      const threadCalculatorCPUs = systemInfo.cpus.map(cpu => ({
        id: cpu.id,
        vendorId: cpu.vendorId,
        modelName: cpu.modelName,
        coreCount: cpu.coreCount,
        efficiencyCoreCount: cpu.efficiencyCoreCount,
        threadCount: cpu.threadCount,
      }));

      const optimalThreads =
        LLMThreadCalculator.getOptimalThreadCount(threadCalculatorCPUs);

      const resourceCPUs = systemInfo.cpus.map(cpu => ({
        coreCount: cpu.coreCount,
        efficiencyCoreCount: cpu.efficiencyCoreCount,
      }));

      LLMResourceCalculator.calculateOptimalConfig(
        resourceCPUs,
        [mockGPUConfigurations.rtx4090],
        mockModelConfigurations.llama13b
      );

      const pipelineTime = Date.now() - startTime;

      // Should complete full pipeline quickly
      expect(pipelineTime).toBeLessThan(
        performanceBenchmarks.cpuDetectionTime.maxMs +
          performanceBenchmarks.threadCalculationTime.maxMs +
          performanceBenchmarks.resourceCalculationTime.maxMs
      );

      expect(optimalThreads).toBe(expectedResults.appleM2OptimalThreads);
    });
  });

  describe('Cross-platform Integration', () => {
    it('should provide consistent results across platforms for similar hardware', async () => {
      const childProcess = await import('child_process');
      const os = await import('os');
      const fs = await import('fs');
      const mockExecSync = childProcess.execSync as ReturnType<typeof vi.fn>;
      const mockPlatform = os.platform as ReturnType<typeof vi.fn>;
      const mockTotalmem = os.totalmem as ReturnType<typeof vi.fn>;
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      const mockReaddirSync = fs.readdirSync as ReturnType<typeof vi.fn>;

      const similarCPUConfig = {
        id: '0',
        vendorId: 'Intel',
        modelName: 'Intel Core i7',
        coreCount: 8,
        efficiencyCoreCount: 0,
        threadCount: 16,
        clockSpeed: 3600000000,
        architecture: 'x64' as const,
      };

      const platforms: Array<{ platform: NodeJS.Platform; name: string }> = [
        { platform: 'darwin', name: 'macOS' },
        { platform: 'linux', name: 'Linux' },
        { platform: 'win32', name: 'Windows' },
      ];

      const results = [];

      for (const { platform, name } of platforms) {
        const systemMocks = SystemMockFactories.createSystemEnvironmentMock(
          platform,
          similarCPUConfig,
          16
        );

        mockPlatform.mockImplementation(systemMocks.os.platform);
        mockTotalmem.mockImplementation(systemMocks.os.totalmem);
        mockExecSync.mockImplementation(systemMocks.execSync);
        mockReadFileSync.mockImplementation(systemMocks.readFileSync);
        mockReaddirSync.mockImplementation(systemMocks.readdirSync);

        const systemInfo = await RealCPUDetector.detectCPUInfo();
        const threadCalculatorCPUs = systemInfo.cpus.map(cpu => ({
          id: cpu.id,
          vendorId: cpu.vendorId,
          modelName: cpu.modelName,
          coreCount: cpu.coreCount,
          efficiencyCoreCount: cpu.efficiencyCoreCount,
          threadCount: cpu.threadCount,
        }));

        const optimalThreads =
          LLMThreadCalculator.getOptimalThreadCount(threadCalculatorCPUs);

        const resourceConfig = LLMResourceCalculator.calculateOptimalConfig(
          systemInfo.cpus.map(cpu => ({
            coreCount: cpu.coreCount,
            efficiencyCoreCount: cpu.efficiencyCoreCount,
          })),
          [mockGPUConfigurations.rtx4090],
          mockModelConfigurations.llama7b
        );

        results.push({
          platform: name,
          detectedCores: systemInfo.cpus[0].coreCount,
          optimalThreads,
          estimatedLayers: resourceConfig.estimate.layers,
          vramUsage: resourceConfig.estimate.vramSize,
        });
      }

      // Results should be similar across platforms for similar hardware
      const threadCounts = results.map(r => r.optimalThreads);
      const layerCounts = results.map(r => r.estimatedLayers);
      const vramUsages = results.map(r => r.vramUsage);

      // Debug: Log what each platform returned
      const uniqueThreads = new Set(threadCounts);
      if (uniqueThreads.size !== 1) {
        throw new Error(
          `Thread counts differ across platforms: ${JSON.stringify(results, null, 2)}`
        );
      }

      expect(new Set(threadCounts).size).toBe(1); // Should be identical
      expect(new Set(layerCounts).size).toBe(1); // Should be identical
      expect(new Set(vramUsages).size).toBe(1); // Should be identical
    });
  });

  describe('Error Handling Integration', () => {
    it('should gracefully handle cascading failures across modules', async () => {
      const os = await import('os');
      const fs = await import('fs');
      const mockPlatform = os.platform as ReturnType<typeof vi.fn>;
      const mockTotalmem = os.totalmem as ReturnType<typeof vi.fn>;
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      const mockCpus = os.cpus as ReturnType<typeof vi.fn>;
      const mockArch = os.arch as ReturnType<typeof vi.fn>;

      // Setup system where CPU detection fails
      mockPlatform.mockReturnValue('linux');
      mockTotalmem.mockReturnValue(8 * 1024 * 1024 * 1024);
      mockReadFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      // Setup fallback
      mockCpus.mockReturnValue(
        Array(4).fill({
          model: 'Unknown CPU',
          speed: 2400,
          times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
        })
      );
      mockArch.mockReturnValue('x64');

      const systemInfo = await RealCPUDetector.detectCPUInfo();

      // Should fallback to generic detection
      expect(systemInfo.cpus[0].vendorId).toBe('Unknown');
      expect(systemInfo.cpus[0].threadCount).toBe(4);

      // Thread calculator should still work with fallback data
      const threadCalculatorCPUs = systemInfo.cpus.map(cpu => ({
        id: cpu.id,
        vendorId: cpu.vendorId,
        modelName: cpu.modelName,
        coreCount: cpu.coreCount,
        efficiencyCoreCount: cpu.efficiencyCoreCount,
        threadCount: cpu.threadCount,
      }));

      const optimalThreads =
        LLMThreadCalculator.getOptimalThreadCount(threadCalculatorCPUs);
      expect(optimalThreads).toBeGreaterThan(0);

      // Resource calculator should handle fallback data
      const resourceCPUs = systemInfo.cpus.map(cpu => ({
        coreCount: cpu.coreCount,
        efficiencyCoreCount: cpu.efficiencyCoreCount,
      }));

      const config = LLMResourceCalculator.calculateOptimalConfig(
        resourceCPUs,
        [mockGPUConfigurations.rtx4090],
        mockModelConfigurations.llama7b
      );

      expect(config.numThread).toBe(optimalThreads);
      expect(config.estimate).toBeDefined();
    });

    it('should handle systems with no GPUs gracefully', async () => {
      const os = await import('os');
      const fs = await import('fs');
      const mockPlatform = os.platform as ReturnType<typeof vi.fn>;
      const mockTotalmem = os.totalmem as ReturnType<typeof vi.fn>;
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      const mockReaddirSync = fs.readdirSync as ReturnType<typeof vi.fn>;

      const systemMocks = SystemMockFactories.createSystemEnvironmentMock(
        'linux',
        mockSystemConfigurations.linux.cpus[0],
        16
      );

      mockPlatform.mockImplementation(systemMocks.os.platform);
      mockTotalmem.mockImplementation(systemMocks.os.totalmem);
      mockReadFileSync.mockImplementation(systemMocks.readFileSync);
      mockReaddirSync.mockImplementation(systemMocks.readdirSync);

      const systemInfo = await RealCPUDetector.detectCPUInfo();

      const resourceCPUs = systemInfo.cpus.map(cpu => ({
        coreCount: cpu.coreCount,
        efficiencyCoreCount: cpu.efficiencyCoreCount,
      }));

      // Test with no GPUs
      const config = LLMResourceCalculator.calculateOptimalConfig(
        resourceCPUs,
        [], // No GPUs
        mockModelConfigurations.llama7b
      );

      expect(config.numThread).toBe(expectedResults.amdRyzenOptimalThreads);
      expect(config.estimate.layers).toBe(0);
      expect(config.estimate.vramSize).toBe(0);
      expect(config.estimate.fullyLoaded).toBe(false);
      expect(config.numGPU).toBe(0);
    });
  });

  describe('Real-world Scenario Integration', () => {
    it('should handle gaming rig scenario (Intel + NVIDIA)', async () => {
      const childProcess = await import('child_process');
      const os = await import('os');
      const mockExecSync = childProcess.execSync as ReturnType<typeof vi.fn>;
      const mockPlatform = os.platform as ReturnType<typeof vi.fn>;
      const mockTotalmem = os.totalmem as ReturnType<typeof vi.fn>;

      const systemMocks = SystemMockFactories.createSystemEnvironmentMock(
        'win32',
        mockSystemConfigurations.windows.cpus[0],
        32
      );

      mockPlatform.mockImplementation(systemMocks.os.platform);
      mockTotalmem.mockImplementation(systemMocks.os.totalmem);
      mockExecSync.mockImplementation(systemMocks.execSync);

      const systemInfo = await RealCPUDetector.detectCPUInfo();
      const resourceCPUs = systemInfo.cpus.map(cpu => ({
        coreCount: cpu.coreCount,
        efficiencyCoreCount: cpu.efficiencyCoreCount,
      }));

      const gamingGPUs = [mockGPUConfigurations.rtx4090];
      const config = LLMResourceCalculator.calculateOptimalConfig(
        resourceCPUs,
        gamingGPUs,
        mockModelConfigurations.llama13b
      );

      expect(systemInfo.platform).toBe('win32');
      expect(systemInfo.cpus[0].vendorId).toBe('GenuineIntel');
      expect(config.numThread).toBe(expectedResults.intel12thGenOptimalThreads);
      expect(config.estimate.fullyLoaded).toBe(true);
    });

    it('should handle workstation scenario (AMD + Multi-GPU)', async () => {
      const os = await import('os');
      const fs = await import('fs');
      const mockPlatform = os.platform as ReturnType<typeof vi.fn>;
      const mockTotalmem = os.totalmem as ReturnType<typeof vi.fn>;
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      const mockReaddirSync = fs.readdirSync as ReturnType<typeof vi.fn>;

      const systemMocks = SystemMockFactories.createSystemEnvironmentMock(
        'linux',
        mockSystemConfigurations.multiCPU.cpus, // Pass both CPUs
        128
      );

      mockPlatform.mockImplementation(systemMocks.os.platform);
      mockTotalmem.mockImplementation(systemMocks.os.totalmem);
      mockReadFileSync.mockImplementation(systemMocks.readFileSync);
      mockReaddirSync.mockImplementation(systemMocks.readdirSync);

      const systemInfo = await RealCPUDetector.detectCPUInfo();

      // Debug: Check if we detected both CPUs
      expect(systemInfo.cpus).toHaveLength(2); // Should detect 2 CPUs
      expect(systemInfo.cpus[0].coreCount).toBe(28);
      expect(systemInfo.cpus[0].efficiencyCoreCount).toBe(0); // 4GHz > 3GHz threshold
      expect(systemInfo.cpus[1].coreCount).toBe(28);
      expect(systemInfo.cpus[1].efficiencyCoreCount).toBe(0); // 4GHz > 3GHz threshold

      const resourceCPUs = systemInfo.cpus.map(cpu => ({
        coreCount: cpu.coreCount,
        efficiencyCoreCount: cpu.efficiencyCoreCount,
      }));

      // Debug: Check what we're passing to resource calculator
      expect(resourceCPUs).toHaveLength(2);
      expect(resourceCPUs[0].coreCount).toBe(28);
      expect(resourceCPUs[0].efficiencyCoreCount).toBe(0);
      expect(resourceCPUs[1].coreCount).toBe(28);
      expect(resourceCPUs[1].efficiencyCoreCount).toBe(0);

      // Calculate expected thread count manually
      const expectedThreads =
        LLMResourceCalculator.getOptimalThreadCount(resourceCPUs);
      expect(expectedThreads).toBe(56);

      const workstationGPUs = mockGPUConfigurations.multiGPU;
      const config = LLMResourceCalculator.calculateOptimalConfig(
        resourceCPUs,
        workstationGPUs,
        mockModelConfigurations.llama70b
      );

      expect(config.numThread).toBe(56); // 2x 28-core Xeon
      expect(config.estimate.layers).toBeGreaterThan(0);
      expect(config.estimate.tensorSplit).toContain(','); // Multi-GPU split
    });

    it('should handle MacBook scenario (Apple Silicon)', async () => {
      const childProcess = await import('child_process');
      const os = await import('os');
      const mockExecSync = childProcess.execSync as ReturnType<typeof vi.fn>;
      const mockPlatform = os.platform as ReturnType<typeof vi.fn>;
      const mockTotalmem = os.totalmem as ReturnType<typeof vi.fn>;

      const systemMocks = SystemMockFactories.createSystemEnvironmentMock(
        'darwin',
        mockSystemConfigurations.macOS.cpus[0],
        16
      );

      mockPlatform.mockImplementation(systemMocks.os.platform);
      mockTotalmem.mockImplementation(systemMocks.os.totalmem);
      mockExecSync.mockImplementation(systemMocks.execSync);

      const systemInfo = await RealCPUDetector.detectCPUInfo();
      const resourceCPUs = systemInfo.cpus.map(cpu => ({
        coreCount: cpu.coreCount,
        efficiencyCoreCount: cpu.efficiencyCoreCount,
      }));

      const macBookGPUs = [mockGPUConfigurations.appleMetalM2];
      const config = LLMResourceCalculator.calculateOptimalConfig(
        resourceCPUs,
        macBookGPUs,
        mockModelConfigurations.llama7b
      );

      expect(systemInfo.platform).toBe('darwin');
      expect(systemInfo.cpus[0].vendorId).toBe('Apple');
      expect(config.numThread).toBe(expectedResults.appleM2OptimalThreads);
      expect(LLMResourceCalculator.flashAttentionSupported(macBookGPUs)).toBe(
        true
      );
    });
  });

  describe('System Display and Analysis Integration', () => {
    it('should provide comprehensive system analysis output', async () => {
      const os = await import('os');
      const fs = await import('fs');
      const mockPlatform = os.platform as ReturnType<typeof vi.fn>;
      const mockTotalmem = os.totalmem as ReturnType<typeof vi.fn>;
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      const mockReaddirSync = fs.readdirSync as ReturnType<typeof vi.fn>;

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const systemMocks = SystemMockFactories.createSystemEnvironmentMock(
        'linux',
        mockSystemConfigurations.linux.cpus[0],
        32
      );

      mockPlatform.mockImplementation(systemMocks.os.platform);
      mockTotalmem.mockImplementation(systemMocks.os.totalmem);
      mockReadFileSync.mockImplementation(systemMocks.readFileSync);
      mockReaddirSync.mockImplementation(systemMocks.readdirSync);

      const systemInfo = await RealCPUDetector.detectCPUInfo();

      // Display system information
      RealCPUDetector.displayCPUInfo(systemInfo);

      const threadCalculatorCPUs = systemInfo.cpus.map(cpu => ({
        id: cpu.id,
        vendorId: cpu.vendorId,
        modelName: cpu.modelName,
        coreCount: cpu.coreCount,
        efficiencyCoreCount: cpu.efficiencyCoreCount,
        threadCount: cpu.threadCount,
      }));

      const systemInfoForThreads: ThreadCalculatorSystemInfo = {
        platform: systemInfo.platform as
          | 'linux'
          | 'windows'
          | 'darwin'
          | 'unknown',
        cpus: threadCalculatorCPUs,
      };
      LLMThreadCalculator.analyzeSystem(systemInfoForThreads);

      expect(consoleSpy).toHaveBeenCalled();

      const loggedOutput = consoleSpy.mock.calls
        .map(call => call.join(' '))
        .join('\n');

      // Should contain comprehensive system analysis
      expect(loggedOutput).toContain('Real CPU Detection Results');
      expect(loggedOutput).toContain('LLM Thread Calculator Analysis');
      expect(loggedOutput).toContain('Platform: linux');
      expect(loggedOutput).toContain('AMD Ryzen 9 7950X');
      expect(loggedOutput).toContain('Optimal Thread Count:');
      expect(loggedOutput).toContain('inference:');
      expect(loggedOutput).toContain('training:');
      expect(loggedOutput).toContain('serving:');

      consoleSpy.mockRestore();
    });
  });
});
