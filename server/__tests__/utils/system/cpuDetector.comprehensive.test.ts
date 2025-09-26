/**
 * Comprehensive tests for CPU Detection System
 * Tests system hardware detection across different platforms
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mockSystemCalls,
  SystemMockFactories,
  expectedResults,
  performanceBenchmarks,
} from '../../fixtures/systemTestData.js';

// Mock Node.js modules
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

describe('RealCPUDetector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('detectCPUInfo', () => {
    it('should detect CPU information and return SystemInfo', async () => {
      const childProcess = await import('child_process');
      const os = await import('os');
      const execSync = childProcess.execSync as ReturnType<typeof vi.fn>;
      const platform = os.platform as ReturnType<typeof vi.fn>;
      const totalmem = os.totalmem as ReturnType<typeof vi.fn>;

      // Setup mocks for macOS
      platform.mockReturnValue('darwin');
      totalmem.mockReturnValue(16 * 1024 * 1024 * 1024);
      execSync.mockImplementation((command: string) => {
        if (command.includes('sysctl -n')) {
          const key = command.replace('sysctl -n ', '');
          return (
            mockSystemCalls.darwinSysctl[
              key as keyof typeof mockSystemCalls.darwinSysctl
            ] || ''
          );
        }
        if (command === 'uname -m') {
          return 'arm64';
        }
        return '';
      });

      const { RealCPUDetector } = await import(
        '../../../utils/system/cpuDetector.js'
      );
      const systemInfo = await RealCPUDetector.detectCPUInfo();

      expect(systemInfo).toHaveProperty('platform', 'darwin');
      expect(systemInfo).toHaveProperty('environment', 'node');
      expect(systemInfo.cpus).toHaveLength(1);
      expect(systemInfo.cpus[0]).toMatchObject({
        vendorId: 'Apple',
        modelName: expect.stringContaining('Apple'),
        architecture: 'arm64',
        efficiencyCoreCount: expect.any(Number),
      });
      expect(systemInfo.totalMemory).toBe(16 * 1024 * 1024 * 1024);
    });

    it('should handle errors gracefully and fall back to generic detection', async () => {
      const childProcess = await import('child_process');
      const os = await import('os');
      const execSync = childProcess.execSync as ReturnType<typeof vi.fn>;
      const platform = os.platform as ReturnType<typeof vi.fn>;
      const totalmem = os.totalmem as ReturnType<typeof vi.fn>;
      const cpus = os.cpus as ReturnType<typeof vi.fn>;
      const arch = os.arch as ReturnType<typeof vi.fn>;

      platform.mockReturnValue('darwin');
      totalmem.mockReturnValue(8 * 1024 * 1024 * 1024);
      execSync.mockImplementation(() => {
        throw new Error('sysctl: unknown oid');
      });

      // Setup fallback generic detection
      const mockCpuData = Array(8).fill({
        model: 'Generic CPU',
        speed: 2400,
        times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
      });
      cpus.mockReturnValue(mockCpuData);
      arch.mockReturnValue('x64');

      const { RealCPUDetector } = await import(
        '../../../utils/system/cpuDetector.js'
      );
      const systemInfo = await RealCPUDetector.detectCPUInfo();

      expect(systemInfo.platform).toBe('darwin');
      expect(systemInfo.cpus).toHaveLength(1);
      expect(systemInfo.cpus[0].vendorId).toBe('Unknown'); // Generic detection
      expect(systemInfo.cpus[0].threadCount).toBe(8);
    });

    it('should complete detection within performance benchmark', async () => {
      const os = await import('os');
      const fs = await import('fs');
      const platform = os.platform as ReturnType<typeof vi.fn>;
      const totalmem = os.totalmem as ReturnType<typeof vi.fn>;
      const readFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      const readdirSync = fs.readdirSync as ReturnType<typeof vi.fn>;

      const startTime = Date.now();

      platform.mockReturnValue('linux');
      totalmem.mockReturnValue(16 * 1024 * 1024 * 1024);
      readFileSync.mockReturnValue(mockSystemCalls.linuxCpuInfo);
      readdirSync.mockReturnValue(['cpu0', 'cpu1', 'cpu2', 'cpu3']);

      const { RealCPUDetector } = await import(
        '../../../utils/system/cpuDetector.js'
      );
      await RealCPUDetector.detectCPUInfo();

      const detectionTime = Date.now() - startTime;
      expect(detectionTime).toBeLessThan(
        performanceBenchmarks.cpuDetectionTime.maxMs
      );
    });
  });

  describe('Platform-specific detection', () => {
    describe('macOS (Darwin)', () => {
      it('should detect Apple Silicon M2 correctly', async () => {
        const childProcess = await import('child_process');
        const os = await import('os');
        const execSync = childProcess.execSync as ReturnType<typeof vi.fn>;
        const platform = os.platform as ReturnType<typeof vi.fn>;
        const totalmem = os.totalmem as ReturnType<typeof vi.fn>;

        platform.mockReturnValue('darwin');
        totalmem.mockReturnValue(16 * 1024 * 1024 * 1024);

        const mockSysctl = SystemMockFactories.createMockExecSync({
          'hw.perflevel0.physicalcpu': '6',
          'hw.perflevel1.physicalcpu': '4',
          'hw.logicalcpu': '10',
          'machdep.cpu.brand_string': 'Apple M2',
          'hw.cpufrequency_max': '3200000000',
          'uname -m': 'arm64',
        });
        execSync.mockImplementation(mockSysctl);

        const { RealCPUDetector } = await import(
          '../../../utils/system/cpuDetector.js'
        );
        const systemInfo = await RealCPUDetector.detectCPUInfo();

        expect(systemInfo.cpus[0]).toMatchObject({
          vendorId: 'Apple',
          modelName: expect.stringContaining('Apple M2'),
          coreCount: 10, // 6 performance + 4 efficiency
          efficiencyCoreCount: 4,
          threadCount: 10,
          architecture: 'arm64',
        });
      });

      it('should handle missing sysctl properties gracefully', async () => {
        const childProcess = await import('child_process');
        const os = await import('os');
        const execSync = childProcess.execSync as ReturnType<typeof vi.fn>;
        const platform = os.platform as ReturnType<typeof vi.fn>;
        const totalmem = os.totalmem as ReturnType<typeof vi.fn>;

        platform.mockReturnValue('darwin');
        totalmem.mockReturnValue(16 * 1024 * 1024 * 1024);

        execSync.mockImplementation((command: string) => {
          if (command.includes('sysctl -n')) {
            const key = command.replace('sysctl -n ', '');
            if (key === 'hw.perflevel0.physicalcpu') {
              throw new Error('unknown oid');
            }
            if (key === 'hw.perflevel1.physicalcpu') {
              throw new Error('unknown oid');
            }
            if (key === 'hw.logicalcpu') {
              return '8';
            }
            if (key === 'machdep.cpu.brand_string') {
              return 'Apple M1';
            }
            return '';
          }
          if (command === 'uname -m') {
            return 'arm64';
          }
          return '';
        });

        const { RealCPUDetector } = await import(
          '../../../utils/system/cpuDetector.js'
        );
        const systemInfo = await RealCPUDetector.detectCPUInfo();

        expect(systemInfo.cpus[0].vendorId).toBe('Apple');
        expect(systemInfo.cpus[0].threadCount).toBe(8);
        expect(systemInfo.cpus[0].coreCount).toBeGreaterThan(0);
      });
    });

    describe('Linux', () => {
      it('should parse /proc/cpuinfo correctly for AMD Ryzen', async () => {
        const os = await import('os');
        const fs = await import('fs');
        const platform = os.platform as ReturnType<typeof vi.fn>;
        const totalmem = os.totalmem as ReturnType<typeof vi.fn>;
        const readFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
        const readdirSync = fs.readdirSync as ReturnType<typeof vi.fn>;

        platform.mockReturnValue('linux');
        totalmem.mockReturnValue(32 * 1024 * 1024 * 1024);

        readFileSync.mockImplementation((path: string) => {
          if (path === '/proc/cpuinfo') {
            return mockSystemCalls.linuxCpuInfo;
          }
          throw new Error('ENOENT: no such file or directory');
        });
        readdirSync.mockReturnValue([
          'cpu0',
          'cpu1',
          'cpu2',
          'cpu3',
          'cpu4',
          'cpu5',
          'cpu6',
          'cpu7',
        ]);

        const { RealCPUDetector } = await import(
          '../../../utils/system/cpuDetector.js'
        );
        const systemInfo = await RealCPUDetector.detectCPUInfo();

        expect(systemInfo.cpus).toHaveLength(1); // Single physical processor
        expect(systemInfo.cpus[0]).toMatchObject({
          vendorId: 'AuthenticAMD',
          modelName: expect.stringContaining('AMD Ryzen 9 7950X'),
          efficiencyCoreCount: 0, // AMD doesn't have efficiency cores
        });
      });

      it('should handle /proc/cpuinfo read failure by falling back to generic detection', async () => {
        const os = await import('os');
        const fs = await import('fs');
        const platform = os.platform as ReturnType<typeof vi.fn>;
        const totalmem = os.totalmem as ReturnType<typeof vi.fn>;
        const cpus = os.cpus as ReturnType<typeof vi.fn>;
        const arch = os.arch as ReturnType<typeof vi.fn>;
        const readFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;

        platform.mockReturnValue('linux');
        totalmem.mockReturnValue(16 * 1024 * 1024 * 1024);
        readFileSync.mockImplementation(() => {
          throw new Error('EACCES: permission denied');
        });

        const mockCpuData = Array(16).fill({
          model: 'AMD Ryzen 9 7950X 16-Core Processor',
          speed: 4500,
          times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
        });
        cpus.mockReturnValue(mockCpuData);
        arch.mockReturnValue('x64');

        const { RealCPUDetector } = await import(
          '../../../utils/system/cpuDetector.js'
        );
        const systemInfo = await RealCPUDetector.detectCPUInfo();

        expect(systemInfo.cpus[0].vendorId).toBe('AMD');
        expect(systemInfo.cpus[0].threadCount).toBe(16);
      });
    });

    describe('Windows', () => {
      it('should parse wmic output correctly for Intel CPU', async () => {
        const childProcess = await import('child_process');
        const os = await import('os');
        const execSync = childProcess.execSync as ReturnType<typeof vi.fn>;
        const platform = os.platform as ReturnType<typeof vi.fn>;
        const totalmem = os.totalmem as ReturnType<typeof vi.fn>;

        platform.mockReturnValue('win32');
        totalmem.mockReturnValue(16 * 1024 * 1024 * 1024);
        execSync.mockReturnValue(mockSystemCalls.windowsWmic);

        // Mock process.arch
        Object.defineProperty(process, 'arch', {
          value: 'x64',
          writable: true,
        });

        const { RealCPUDetector } = await import(
          '../../../utils/system/cpuDetector.js'
        );
        const systemInfo = await RealCPUDetector.detectCPUInfo();

        expect(systemInfo.cpus).toHaveLength(1);
        expect(systemInfo.cpus[0]).toMatchObject({
          vendorId: 'GenuineIntel',
          modelName: expect.stringContaining('Intel(R) Core(TM) i7-12700K'),
          coreCount: 12,
          threadCount: 20,
          architecture: 'x64',
        });
      });

      it('should handle wmic command failure by falling back to generic detection', async () => {
        const childProcess = await import('child_process');
        const os = await import('os');
        const execSync = childProcess.execSync as ReturnType<typeof vi.fn>;
        const platform = os.platform as ReturnType<typeof vi.fn>;
        const totalmem = os.totalmem as ReturnType<typeof vi.fn>;
        const cpus = os.cpus as ReturnType<typeof vi.fn>;
        const arch = os.arch as ReturnType<typeof vi.fn>;

        platform.mockReturnValue('win32');
        totalmem.mockReturnValue(16 * 1024 * 1024 * 1024);
        execSync.mockImplementation(() => {
          throw new Error('wmic is not recognized');
        });

        const mockCpuData = Array(8).fill({
          model: 'Intel(R) Core(TM) i5-10400 CPU @ 2.90GHz',
          speed: 2900,
          times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
        });
        cpus.mockReturnValue(mockCpuData);
        arch.mockReturnValue('x64');

        const { RealCPUDetector } = await import(
          '../../../utils/system/cpuDetector.js'
        );
        const systemInfo = await RealCPUDetector.detectCPUInfo();

        expect(systemInfo.cpus[0].vendorId).toBe('Intel');
        expect(systemInfo.cpus[0].threadCount).toBe(8);
      });
    });
  });

  describe('displayCPUInfo utility', () => {
    it('should display system information without errors', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const { RealCPUDetector } = await import(
        '../../../utils/system/cpuDetector.js'
      );

      const systemInfo = {
        platform: 'darwin' as const,
        cpus: [
          {
            id: '0',
            vendorId: 'Apple',
            modelName: 'Apple M2',
            coreCount: 10,
            efficiencyCoreCount: 4,
            threadCount: 10,
            clockSpeed: 3200000000,
            architecture: 'arm64',
          },
        ],
        totalMemory: 16 * 1024 * 1024 * 1024,
        environment: 'node' as const,
      };

      RealCPUDetector.displayCPUInfo(systemInfo);

      expect(consoleSpy).toHaveBeenCalled();
      const loggedOutput = consoleSpy.mock.calls
        .map(call => call.join(' '))
        .join('\n');

      expect(loggedOutput).toContain('Real CPU Detection Results');
      expect(loggedOutput).toContain('Platform: darwin');
      expect(loggedOutput).toContain('Total Memory:');
      expect(loggedOutput).toContain('CPU Packages:');
      expect(loggedOutput).toContain('LLM Thread Calculation');
      expect(loggedOutput).toContain('Optimal Thread Count:');

      consoleSpy.mockRestore();
    });

    it('should calculate optimal thread count correctly', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const { RealCPUDetector } = await import(
        '../../../utils/system/cpuDetector.js'
      );

      const systemInfo = {
        platform: 'linux' as const,
        cpus: [
          {
            id: '0',
            vendorId: 'GenuineIntel',
            modelName: 'Intel(R) Core(TM) i7-12700K CPU @ 3.60GHz',
            coreCount: 12,
            efficiencyCoreCount: 4,
            threadCount: 20,
            clockSpeed: 3600000000,
            architecture: 'x64',
          },
        ],
        totalMemory: 16 * 1024 * 1024 * 1024,
        environment: 'node' as const,
      };

      RealCPUDetector.displayCPUInfo(systemInfo);

      const loggedOutput = consoleSpy.mock.calls
        .map(call => call.join(' '))
        .join('\n');
      expect(loggedOutput).toContain(
        `Optimal Thread Count: ${expectedResults.intel12thGenOptimalThreads}`
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle zero CPU configuration gracefully', async () => {
      const os = await import('os');
      const fs = await import('fs');
      const platform = os.platform as ReturnType<typeof vi.fn>;
      const totalmem = os.totalmem as ReturnType<typeof vi.fn>;
      const cpus = os.cpus as ReturnType<typeof vi.fn>;
      const readFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;

      platform.mockReturnValue('linux');
      totalmem.mockReturnValue(1024 * 1024 * 1024);
      cpus.mockReturnValue([]); // No CPUs returned

      readFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const { RealCPUDetector } = await import(
        '../../../utils/system/cpuDetector.js'
      );
      const systemInfo = await RealCPUDetector.detectCPUInfo();

      expect(systemInfo.cpus).toHaveLength(0);
      expect(systemInfo.platform).toBe('linux');
    });

    it('should validate system information structure', async () => {
      const childProcess = await import('child_process');
      const os = await import('os');
      const execSync = childProcess.execSync as ReturnType<typeof vi.fn>;
      const platform = os.platform as ReturnType<typeof vi.fn>;
      const totalmem = os.totalmem as ReturnType<typeof vi.fn>;

      platform.mockReturnValue('darwin');
      totalmem.mockReturnValue(16 * 1024 * 1024 * 1024);
      execSync.mockImplementation(
        SystemMockFactories.createMockExecSync(mockSystemCalls.darwinSysctl)
      );

      const { RealCPUDetector } = await import(
        '../../../utils/system/cpuDetector.js'
      );
      const systemInfo = await RealCPUDetector.detectCPUInfo();

      // Validate required properties exist and have correct types
      expect(systemInfo).toHaveProperty('platform');
      expect(systemInfo).toHaveProperty('cpus');
      expect(systemInfo).toHaveProperty('totalMemory');
      expect(systemInfo).toHaveProperty('environment', 'node');

      expect(Array.isArray(systemInfo.cpus)).toBe(true);
      expect(typeof systemInfo.totalMemory).toBe('number');
      expect(systemInfo.totalMemory).toBeGreaterThan(0);

      // Validate CPU structure
      systemInfo.cpus.forEach(cpu => {
        expect(cpu).toHaveProperty('id');
        expect(cpu).toHaveProperty('vendorId');
        expect(cpu).toHaveProperty('modelName');
        expect(cpu).toHaveProperty('coreCount');
        expect(cpu).toHaveProperty('efficiencyCoreCount');
        expect(cpu).toHaveProperty('threadCount');
        expect(cpu).toHaveProperty('clockSpeed');
        expect(cpu).toHaveProperty('architecture');

        expect(typeof cpu.coreCount).toBe('number');
        expect(typeof cpu.efficiencyCoreCount).toBe('number');
        expect(typeof cpu.threadCount).toBe('number');
        expect(typeof cpu.clockSpeed).toBe('number');

        expect(cpu.coreCount).toBeGreaterThanOrEqual(0);
        expect(cpu.efficiencyCoreCount).toBeGreaterThanOrEqual(0);
        expect(cpu.threadCount).toBeGreaterThanOrEqual(0);
        expect(cpu.clockSpeed).toBeGreaterThanOrEqual(0);
        expect(cpu.efficiencyCoreCount).toBeLessThanOrEqual(cpu.coreCount);
      });
    });
  });
});
