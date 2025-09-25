import { describe, it, expect, vi, beforeEach } from 'vitest';
import { systemInfoManager } from '../systemInfoManager';
import * as os from 'os';

// Mock dependencies
vi.mock('os');
vi.mock('fs/promises', () => ({
  statfs: vi.fn(() =>
    Promise.resolve({
      blocks: 1000000,
      bsize: 4096,
      bavail: 500000,
    })
  ),
}));

vi.mock('../utils/system/cpuDetector', () => ({
  RealCPUDetector: {
    detectCPUInfo: vi.fn(() =>
      Promise.resolve({
        cpus: [
          {
            id: 'cpu-0',
            vendorId: 'GenuineIntel',
            modelName: 'Intel Core i7',
            coreCount: 8,
            efficiencyCoreCount: 4,
            threadCount: 16,
          },
        ],
        summary: {
          totalCores: 8,
          totalThreads: 16,
          performanceCores: 8,
          efficiencyCores: 4,
        },
      })
    ),
  },
}));

vi.mock('../utils/system/llmThreadCalculator', () => ({
  LLMThreadCalculator: {
    getOptimalThreadCount: vi.fn(() => 8),
  },
}));

vi.mock('../sharedLlamaInstance', () => ({
  sharedLlamaInstance: {
    getLlamaForSystemInfo: vi.fn(() =>
      Promise.resolve({
        gpu: 'NVIDIA RTX 4090',
        getVramState: vi.fn(() =>
          Promise.resolve({
            total: 24 * 1024 * 1024 * 1024,
            used: 8 * 1024 * 1024 * 1024,
            free: 16 * 1024 * 1024 * 1024,
          })
        ),
      })
    ),
  },
}));

describe('SystemInfoManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup OS mocks
    vi.mocked(os.totalmem).mockReturnValue(32 * 1024 * 1024 * 1024);
    vi.mocked(os.freemem).mockReturnValue(16 * 1024 * 1024 * 1024);
    vi.mocked(os.cpus).mockReturnValue(
      Array(16).fill({
        model: 'Intel(R) Core(TM) i7',
        speed: 3600,
        times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
      })
    );

    // Clear cache for fresh tests
    systemInfoManager.invalidateCache();
  });

  describe('basic functionality', () => {
    it('should get system information', async () => {
      const info = await systemInfoManager.getSystemInfo();

      expect(info).toHaveProperty('hasGpu');
      expect(info).toHaveProperty('gpuType');
      expect(info).toHaveProperty('vramState');
      expect(info).toHaveProperty('totalRAM');
      expect(info).toHaveProperty('freeRAM');
      expect(info).toHaveProperty('cpuThreads');
      expect(info).toHaveProperty('diskSpace');
      expect(info).toHaveProperty('lastUpdated');
    });

    it('should detect GPU correctly', async () => {
      const info = await systemInfoManager.getSystemInfo();

      expect(info.hasGpu).toBe(true);
      expect(info.gpuType).toBe('NVIDIA RTX 4090');
      expect(info.vramState).toBeTruthy();
    });

    it('should calculate CPU threads', async () => {
      const info = await systemInfoManager.getSystemInfo();

      expect(info.cpuThreads).toBe(8);
    });

    it('should get memory information', async () => {
      const info = await systemInfoManager.getSystemInfo();

      expect(info.totalRAM).toBe(32 * 1024 * 1024 * 1024);
      expect(info.freeRAM).toBe(16 * 1024 * 1024 * 1024);
    });

    it('should get disk space information', async () => {
      const info = await systemInfoManager.getSystemInfo();

      expect(info.diskSpace).toEqual({
        total: 1000000 * 4096,
        free: 500000 * 4096,
        used: 500000 * 4096,
      });
    });

    it('should handle no GPU scenario', async () => {
      const { sharedLlamaInstance } = await import('../sharedLlamaInstance');
      vi.mocked(
        sharedLlamaInstance.getLlamaForSystemInfo
      ).mockResolvedValueOnce({
        gpu: false,
        getVramState: vi.fn(() => Promise.resolve(null)),
        onDispose: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
          hasListeners: vi.fn(() => false),
          clearListeners: vi.fn(),
          dispose: vi.fn(),
        },
        dispose: vi.fn(),
        disposed: false,
        classes: {},
        supportsGpuOffloading: false,
        supportsMmap: true,
        gpuSupportsMmap: false,
        supportsMlock: true,
        cpuMathCores: 8,
        maxThreads: 0,
        logLevel: 'disabled',
        logger: vi.fn(),
        buildType: 'prebuilt',
        cmakeOptions: {},
        llamaCppRelease: { repo: 'test', release: 'test' },
        systemInfo: 'test system info',
        vramPaddingSize: 0,
        getSwapState: vi.fn(),
        getGpuDeviceNames: vi.fn(),
        loadModel: vi.fn(),
        createGrammarForJsonSchema: vi.fn(),
        getGrammarFor: vi.fn(),
        createGrammar: vi.fn(),
      } as const);

      systemInfoManager.invalidateCache();
      const info = await systemInfoManager.getSystemInfo();

      expect(info.hasGpu).toBe(false);
      expect(info.gpuType).toBeNull();
      expect(info.vramState).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      const { sharedLlamaInstance } = await import('../sharedLlamaInstance');
      vi.mocked(
        sharedLlamaInstance.getLlamaForSystemInfo
      ).mockRejectedValueOnce(new Error('Failed to initialize'));

      systemInfoManager.invalidateCache();
      const info = await systemInfoManager.getSystemInfo();

      // Should still return system info without GPU
      expect(info.hasGpu).toBe(false);
      expect(info.totalRAM).toBe(32 * 1024 * 1024 * 1024);
      expect(info.cpuThreads).toBe(8);
    });

    it('should invalidate cache', async () => {
      const info1 = await systemInfoManager.getSystemInfo();
      const timestamp1 = info1.lastUpdated;

      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));

      systemInfoManager.invalidateCache();
      const info2 = await systemInfoManager.getSystemInfo();
      const timestamp2 = info2.lastUpdated;

      expect(timestamp2).toBeGreaterThan(timestamp1);
    });

    it('should handle zero memory values', async () => {
      vi.mocked(os.totalmem).mockReturnValue(0);
      vi.mocked(os.freemem).mockReturnValue(0);

      systemInfoManager.invalidateCache();
      const info = await systemInfoManager.getSystemInfo();

      expect(info.totalRAM).toBe(0);
      expect(info.freeRAM).toBe(0);
    });

    it('should handle empty CPU array', async () => {
      vi.mocked(os.cpus).mockReturnValue([]);

      systemInfoManager.invalidateCache();
      const info = await systemInfoManager.getSystemInfo();

      expect(info.cpuThreads).toBe(8); // Should use optimal calculation
    });
  });
});
