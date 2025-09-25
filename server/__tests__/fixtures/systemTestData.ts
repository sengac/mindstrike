/**
 * System Module Test Data
 * Mock data and factories for testing system detection and resource calculation
 */
import { vi } from 'vitest';
import type { CPUInfo, SystemInfo } from '../../utils/system/cpuDetector.js';
import type { CPU } from '../../utils/system/llmThreadCalculator.js';
import type {
  CPUInfo as ResourceCPUInfo,
  GpuInfo,
  ModelInfo,
  Options,
  MemoryEstimate,
} from '../../utils/system/llmResourceCalculator.js';

// CPU Detection Test Data
export const mockCPUConfigurations = {
  // Intel 12th Gen with P+E cores
  intel12thGen: {
    id: '0',
    vendorId: 'GenuineIntel',
    modelName: 'Intel(R) Core(TM) i7-12700K CPU @ 3.60GHz',
    coreCount: 12,
    efficiencyCoreCount: 4,
    threadCount: 20,
    clockSpeed: 3600000000,
    architecture: 'x64',
  } as CPUInfo,

  // AMD Ryzen with SMT
  amdRyzen: {
    id: '0',
    vendorId: 'AuthenticAMD',
    modelName: 'AMD Ryzen 9 7950X 16-Core Processor',
    coreCount: 16,
    efficiencyCoreCount: 0,
    threadCount: 32,
    clockSpeed: 4500000000,
    architecture: 'x64',
  } as CPUInfo,

  // Apple Silicon M2
  appleM2: {
    id: '0',
    vendorId: 'Apple',
    modelName: 'Apple M2',
    coreCount: 10,
    efficiencyCoreCount: 4,
    threadCount: 10,
    clockSpeed: 3200000000,
    architecture: 'arm64',
  } as CPUInfo,

  // Generic fallback CPU
  generic: {
    id: '0',
    vendorId: 'Unknown',
    modelName: 'Generic CPU',
    coreCount: 8,
    efficiencyCoreCount: 0,
    threadCount: 16,
    clockSpeed: 2400000000,
    architecture: 'x64',
  } as CPUInfo,

  // Low-end CPU
  lowEnd: {
    id: '0',
    vendorId: 'GenuineIntel',
    modelName: 'Intel(R) Core(TM) i3-10100 CPU @ 3.60GHz',
    coreCount: 4,
    efficiencyCoreCount: 0,
    threadCount: 8,
    clockSpeed: 3600000000,
    architecture: 'x64',
  } as CPUInfo,

  // High-end server CPU (boost to 4GHz to avoid efficiency core detection)
  serverCPU: {
    id: '0',
    vendorId: 'GenuineIntel',
    modelName: 'Intel(R) Xeon(R) Platinum 8280 CPU @ 4.00GHz',
    coreCount: 28,
    efficiencyCoreCount: 0,
    threadCount: 56,
    clockSpeed: 4000000000, // 4GHz to avoid being detected as efficiency cores
    architecture: 'x64',
  } as CPUInfo,
};

export const mockSystemConfigurations = {
  macOS: {
    platform: 'darwin' as const,
    cpus: [mockCPUConfigurations.appleM2],
    totalMemory: 16 * 1024 * 1024 * 1024, // 16GB
    environment: 'node' as const,
  } as SystemInfo,

  linux: {
    platform: 'linux' as const,
    cpus: [mockCPUConfigurations.amdRyzen],
    totalMemory: 32 * 1024 * 1024 * 1024, // 32GB
    environment: 'node' as const,
  } as SystemInfo,

  windows: {
    platform: 'win32' as const,
    cpus: [mockCPUConfigurations.intel12thGen],
    totalMemory: 16 * 1024 * 1024 * 1024, // 16GB
    environment: 'node' as const,
  } as SystemInfo,

  multiCPU: {
    platform: 'linux' as const,
    cpus: [mockCPUConfigurations.serverCPU, mockCPUConfigurations.serverCPU],
    totalMemory: 128 * 1024 * 1024 * 1024, // 128GB
    environment: 'node' as const,
  } as SystemInfo,
};

// GPU Configurations
export const mockGPUConfigurations = {
  rtx4090: {
    id: '0',
    library: 'cuda',
    totalMemory: 24 * 1024 * 1024 * 1024, // 24GB
    freeMemory: 22 * 1024 * 1024 * 1024, // 22GB free
    minimumMemory: 1024 * 1024 * 1024, // 1GB minimum
    driverMajor: 12,
    driverMinor: 2,
    compute: '8.9',
    name: 'NVIDIA GeForce RTX 4090',
    variant: '',
  } as GpuInfo,

  rtx3080: {
    id: '0',
    library: 'cuda',
    totalMemory: 10 * 1024 * 1024 * 1024, // 10GB
    freeMemory: 8 * 1024 * 1024 * 1024, // 8GB free
    minimumMemory: 1024 * 1024 * 1024, // 1GB minimum
    driverMajor: 11,
    driverMinor: 8,
    compute: '8.6',
    name: 'NVIDIA GeForce RTX 3080',
    variant: '',
  } as GpuInfo,

  appleMetalM2: {
    id: '0',
    library: 'metal',
    totalMemory: 16 * 1024 * 1024 * 1024, // 16GB unified memory
    freeMemory: 12 * 1024 * 1024 * 1024, // 12GB free
    minimumMemory: 512 * 1024 * 1024, // 512MB minimum
    driverMajor: 3,
    driverMinor: 0,
    compute: 'metal3',
    name: 'Apple M2',
    variant: 'integrated',
  } as GpuInfo,

  amdRX6800XT: {
    id: '0',
    library: 'rocm',
    totalMemory: 16 * 1024 * 1024 * 1024, // 16GB
    freeMemory: 14 * 1024 * 1024 * 1024, // 14GB free
    minimumMemory: 1024 * 1024 * 1024, // 1GB minimum
    driverMajor: 5,
    driverMinor: 4,
    compute: 'gfx1030',
    name: 'AMD Radeon RX 6800 XT',
    variant: '',
  } as GpuInfo,

  lowMemoryGPU: {
    id: '0',
    library: 'cuda',
    totalMemory: 4 * 1024 * 1024 * 1024, // 4GB
    freeMemory: 3 * 1024 * 1024 * 1024, // 3GB free
    minimumMemory: 1024 * 1024 * 1024, // 1GB minimum
    driverMajor: 11,
    driverMinor: 0,
    compute: '7.5',
    name: 'NVIDIA GeForce GTX 1650',
    variant: '',
  } as GpuInfo,

  multiGPU: [
    {
      id: '0',
      library: 'cuda',
      totalMemory: 12 * 1024 * 1024 * 1024, // 12GB
      freeMemory: 10 * 1024 * 1024 * 1024, // 10GB free
      minimumMemory: 1024 * 1024 * 1024, // 1GB minimum
      driverMajor: 12,
      driverMinor: 0,
      compute: '8.6',
      name: 'NVIDIA GeForce RTX 3080 Ti',
      variant: '',
    },
    {
      id: '1',
      library: 'cuda',
      totalMemory: 12 * 1024 * 1024 * 1024, // 12GB
      freeMemory: 10 * 1024 * 1024 * 1024, // 10GB free
      minimumMemory: 1024 * 1024 * 1024, // 1GB minimum
      driverMajor: 12,
      driverMinor: 0,
      compute: '8.6',
      name: 'NVIDIA GeForce RTX 3080 Ti',
      variant: '',
    },
  ] as GpuInfo[],
};

// Model Configurations
export const mockModelConfigurations = {
  llama7b: {
    blockCount: 32,
    trainCtx: 4096,
    headCountMax: 32,
    headCountKVMin: 32,
    supportsFlashAttention: true,
    supportsKVCacheType: (type: string) => type === 'f16',
    modelSize: 7 * 1024 * 1024 * 1024, // 7GB
  } as ModelInfo,

  llama13b: {
    blockCount: 40,
    trainCtx: 4096,
    headCountMax: 40,
    headCountKVMin: 40,
    supportsFlashAttention: true,
    supportsKVCacheType: (type: string) => type === 'f16' || type === 'q8_0',
    modelSize: 13 * 1024 * 1024 * 1024, // 13GB
  } as ModelInfo,

  llama70b: {
    blockCount: 80,
    trainCtx: 4096,
    headCountMax: 64,
    headCountKVMin: 8, // Grouped query attention
    supportsFlashAttention: true,
    supportsKVCacheType: (type: string) => type === 'f16',
    modelSize: 70 * 1024 * 1024 * 1024, // 70GB
  } as ModelInfo,

  codellama34b: {
    blockCount: 48,
    trainCtx: 16384,
    headCountMax: 64,
    headCountKVMin: 8,
    supportsFlashAttention: true,
    supportsKVCacheType: (type: string) => type === 'f16' || type === 'q4_0',
    modelSize: 34 * 1024 * 1024 * 1024, // 34GB
  } as ModelInfo,

  mixtral8x7b: {
    blockCount: 32,
    trainCtx: 32768,
    headCountMax: 32,
    headCountKVMin: 8,
    supportsFlashAttention: true,
    supportsKVCacheType: (type: string) => type === 'f16',
    modelSize: 46 * 1024 * 1024 * 1024, // 46GB (sparse)
  } as ModelInfo,

  smallModel: {
    blockCount: 12,
    trainCtx: 2048,
    headCountMax: 12,
    headCountKVMin: 12,
    supportsFlashAttention: false,
    supportsKVCacheType: (type: string) => type === 'q8_0',
    modelSize: 1 * 1024 * 1024 * 1024, // 1GB
  } as ModelInfo,
};

// Mock System Calls and File System
export const mockSystemCalls = {
  // macOS sysctl responses
  darwinSysctl: {
    'hw.perflevel0.physicalcpu': '6', // Performance cores
    'hw.perflevel1.physicalcpu': '4', // Efficiency cores
    'hw.logicalcpu': '10',
    'machdep.cpu.thread_count': '10',
    'machdep.cpu.brand_string': 'Apple M2',
    'hw.cpufrequency_max': '3200000000',
    'hw.cpufrequency': '3200000000',
  },

  // Linux /proc/cpuinfo content (simplified - showing all 16 cores with 2 threads each)
  linuxCpuInfo:
    Array.from({ length: 32 }, (_, i) => {
      const coreId = Math.floor(i / 2); // 2 threads per core
      return `processor	: ${i}
vendor_id	: AuthenticAMD
cpu family	: 25
model		: 33
model name	: AMD Ryzen 9 7950X 16-Core Processor
cpu MHz		: 4500.000
physical id	: 0
siblings	: 32
core id		: ${coreId}
cpu cores	: 16`;
    }).join('\n\n') + '\n', // Double newline between processors, single at end

  // Windows wmic output
  windowsWmic: `Node,Manufacturer,MaxClockSpeed,Name,NumberOfCores,NumberOfLogicalProcessors
DESKTOP-TEST,GenuineIntel,3600,Intel(R) Core(TM) i7-12700K CPU @ 3.60GHz,12,20`,

  // Linux topology files - create entries for all 32 CPUs (16 cores with 2 threads each)
  linuxTopology: Object.fromEntries(
    Array.from({ length: 32 }, (_, i) => {
      const coreId = Math.floor(i / 2); // 2 threads per core
      return [
        [`/sys/devices/system/cpu/cpu${i}/topology/physical_package_id`, '0'],
        [`/sys/devices/system/cpu/cpu${i}/topology/core_id`, String(coreId)],
        [`/sys/devices/system/cpu/cpu${i}/cpufreq/cpuinfo_max_freq`, '4500000'],
      ];
    }).flat()
  ),
};

// System Test Factories
export class SystemMockFactories {
  /**
   * Creates a mock execSync function with configurable responses
   */
  static createMockExecSync(
    responses: Record<string, string> = {},
    cpuConfig?: CPUInfo | CPUInfo[]
  ) {
    const cpuConfigs = cpuConfig
      ? Array.isArray(cpuConfig)
        ? cpuConfig
        : [cpuConfig]
      : undefined;
    const firstCpu = cpuConfigs?.[0];

    return vi.fn().mockImplementation((command: string) => {
      // Handle sysctl commands
      if (command.startsWith('sysctl -n ')) {
        const key = command.replace('sysctl -n ', '');

        // If custom response provided, use it
        if (key in responses) {
          return responses[key];
        }

        // Generate sysctl values based on CPU config
        if (firstCpu) {
          switch (key) {
            case 'hw.perflevel0.physicalcpu':
              return String(firstCpu.coreCount - firstCpu.efficiencyCoreCount);
            case 'hw.perflevel1.physicalcpu':
              return String(firstCpu.efficiencyCoreCount);
            case 'hw.logicalcpu':
            case 'machdep.cpu.thread_count':
              return String(firstCpu.threadCount);
            case 'machdep.cpu.brand_string':
              return firstCpu.modelName;
            case 'hw.cpufrequency_max':
            case 'hw.cpufrequency':
              return String(firstCpu.clockSpeed);
          }
        }

        // Fall back to default mock if available
        if (key in mockSystemCalls.darwinSysctl) {
          return mockSystemCalls.darwinSysctl[
            key as keyof typeof mockSystemCalls.darwinSysctl
          ];
        }
        throw new Error(`unknown oid '${key}'`);
      }

      // Handle uname commands
      if (command === 'uname -m') {
        return responses['uname -m'] || firstCpu?.architecture || 'arm64';
      }

      // Handle Windows wmic commands
      if (command.includes('wmic cpu get')) {
        if (responses['wmic']) {
          return responses['wmic'];
        }

        // Generate wmic output based on CPU config
        if (firstCpu) {
          return `Node,Manufacturer,MaxClockSpeed,Name,NumberOfCores,NumberOfLogicalProcessors
DESKTOP-TEST,${firstCpu.vendorId},${firstCpu.clockSpeed / 1000000},${firstCpu.modelName},${firstCpu.coreCount},${firstCpu.threadCount}`;
        }

        return mockSystemCalls.windowsWmic;
      }

      return responses[command] || '';
    });
  }

  /**
   * Creates a mock fs.readFileSync function
   */
  static createMockReadFileSync(
    responses: Record<string, string> = {},
    cpuConfig?: CPUInfo | CPUInfo[]
  ) {
    const cpuConfigs = cpuConfig
      ? Array.isArray(cpuConfig)
        ? cpuConfig
        : [cpuConfig]
      : undefined;

    return vi.fn().mockImplementation((path: string) => {
      if (path === '/proc/cpuinfo') {
        // If a custom response is provided, use it
        if (responses['/proc/cpuinfo']) {
          return responses['/proc/cpuinfo'];
        }

        // If cpuConfig is provided, generate dynamic cpuinfo
        if (cpuConfigs) {
          return this.generateLinuxCpuInfoMulti(cpuConfigs);
        }

        // Otherwise use the default mock
        return mockSystemCalls.linuxCpuInfo;
      }

      // Handle Linux topology files
      if (path in responses) {
        return responses[path];
      }

      // Handle topology files dynamically if cpuConfig provided
      if (cpuConfigs && path.startsWith('/sys/devices/system/cpu/cpu')) {
        const match = path.match(
          /cpu(\d+)\/topology\/(physical_package_id|core_id)|cpu(\d+)\/cpufreq\/cpuinfo_max_freq/
        );
        if (match) {
          const cpuIndex = parseInt(match[1] || match[3]);

          // Determine which physical CPU this logical CPU belongs to
          let physicalId = 0;
          let coreOffset = 0;
          let currentThreadIndex = cpuIndex;

          for (let i = 0; i < cpuConfigs.length; i++) {
            if (currentThreadIndex < cpuConfigs[i].threadCount) {
              physicalId = i;
              break;
            }
            currentThreadIndex -= cpuConfigs[i].threadCount;
            coreOffset += cpuConfigs[i].coreCount;
          }

          if (match[2] === 'physical_package_id') return String(physicalId);
          if (match[2] === 'core_id') {
            const threadsPerCore =
              cpuConfigs[physicalId].threadCount /
              cpuConfigs[physicalId].coreCount;
            return String(
              coreOffset + Math.floor(currentThreadIndex / threadsPerCore)
            );
          }
          if (path.includes('cpuinfo_max_freq'))
            return String(cpuConfigs[physicalId].clockSpeed / 1000); // Hz to KHz
        }
      }

      if (path in mockSystemCalls.linuxTopology) {
        return mockSystemCalls.linuxTopology[
          path as keyof typeof mockSystemCalls.linuxTopology
        ];
      }

      throw Object.assign(
        new Error(`ENOENT: no such file or directory, open '${path}'`),
        {
          code: 'ENOENT',
          errno: -2,
          path,
        }
      );
    });
  }

  /**
   * Generates Linux /proc/cpuinfo content based on CPU configuration
   */
  static generateLinuxCpuInfo(config: CPUInfo): string {
    const processors = [];
    for (let i = 0; i < config.threadCount; i++) {
      const coreId = Math.floor(i / (config.threadCount / config.coreCount));
      processors.push(`processor	: ${i}
vendor_id	: ${config.vendorId}
model name	: ${config.modelName}
cpu MHz		: ${config.clockSpeed / 1000000}
physical id	: 0
siblings	: ${config.threadCount}
core id		: ${coreId}
cpu cores	: ${config.coreCount}`);
    }
    return processors.join('\n\n') + '\n';
  }

  /**
   * Generates Linux /proc/cpuinfo content for multiple CPUs
   */
  static generateLinuxCpuInfoMulti(configs: CPUInfo[]): string {
    const processors = [];
    let processorIndex = 0;

    for (let cpuIndex = 0; cpuIndex < configs.length; cpuIndex++) {
      const config = configs[cpuIndex];
      const threadsPerCore = config.threadCount / config.coreCount;

      for (
        let threadIndex = 0;
        threadIndex < config.threadCount;
        threadIndex++
      ) {
        const coreId = Math.floor(threadIndex / threadsPerCore);
        processors.push(`processor	: ${processorIndex}
vendor_id	: ${config.vendorId}
model name	: ${config.modelName}
cpu MHz		: ${config.clockSpeed / 1000000}
physical id	: ${cpuIndex}
siblings	: ${config.threadCount}
core id		: ${coreId}
cpu cores	: ${config.coreCount}`);
        processorIndex++;
      }
    }
    return processors.join('\n\n') + '\n';
  }

  /**
   * Creates a mock fs.readdirSync function
   */
  static createMockReaddirSync(
    responses: Record<string, string[]> = {},
    cpuCount: number = 32
  ) {
    return vi.fn().mockImplementation((path: string) => {
      if (path === '/sys/devices/system/cpu') {
        // Return CPU directories based on the provided count
        const cpuDirs = Array.from({ length: cpuCount }, (_, i) => `cpu${i}`);
        return responses[path] || [...cpuDirs, 'cpuidle', 'cpufreq'];
      }

      if (path in responses) {
        return responses[path];
      }

      return [];
    });
  }

  /**
   * Creates a mock os.cpus() function
   */
  static createMockOsCpus(config: CPUInfo) {
    const cpus = [];
    for (let i = 0; i < config.threadCount; i++) {
      cpus.push({
        model: config.modelName,
        speed: Math.floor(config.clockSpeed / 1000000), // Convert Hz to MHz
        times: {
          user: 252020,
          nice: 0,
          sys: 30340,
          idle: 1070356870,
          irq: 0,
        },
      });
    }
    return vi.fn().mockReturnValue(cpus);
  }

  /**
   * Creates a mock os object with platform-specific responses
   */
  static createMockOs(
    platform: NodeJS.Platform,
    totalMemory: number,
    cpuConfig: CPUInfo
  ) {
    return {
      platform: vi.fn().mockReturnValue(platform),
      totalmem: vi.fn().mockReturnValue(totalMemory),
      cpus: this.createMockOsCpus(cpuConfig),
      arch: vi.fn().mockReturnValue(cpuConfig.architecture),
    };
  }

  /**
   * Creates a mock navigator object for browser environment testing
   */
  static createMockNavigator(
    hardwareConcurrency = 8,
    userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
  ) {
    return {
      hardwareConcurrency,
      userAgent,
    };
  }

  /**
   * Creates comprehensive system environment mock
   */
  static createSystemEnvironmentMock(
    platform: NodeJS.Platform,
    cpuConfig: CPUInfo | CPUInfo[],
    memoryGB: number,
    customResponses: {
      execSync?: Record<string, string>;
      readFileSync?: Record<string, string>;
      readdirSync?: Record<string, string[]>;
    } = {}
  ) {
    const totalMemory = memoryGB * 1024 * 1024 * 1024;
    const cpuConfigs = Array.isArray(cpuConfig) ? cpuConfig : [cpuConfig];
    const firstCpu = cpuConfigs[0];
    const totalThreads = cpuConfigs.reduce(
      (sum, cpu) => sum + cpu.threadCount,
      0
    );

    return {
      os: this.createMockOs(platform, totalMemory, firstCpu),
      execSync: this.createMockExecSync(customResponses.execSync, cpuConfigs),
      readFileSync: this.createMockReadFileSync(
        customResponses.readFileSync,
        cpuConfigs
      ),
      readdirSync: this.createMockReaddirSync(
        customResponses.readdirSync,
        totalThreads
      ),
    };
  }
}

// Error scenarios for system detection
export const systemErrorScenarios = {
  sysctlFailure: new Error('sysctl: unknown oid'),
  fileNotFound: Object.assign(new Error('ENOENT: no such file or directory'), {
    code: 'ENOENT',
  }),
  permissionDenied: Object.assign(new Error('EACCES: permission denied'), {
    code: 'EACCES',
  }),
  wmicFailure: new Error(
    'wmic is not recognized as an internal or external command'
  ),
  topologyNotAvailable: Object.assign(
    new Error('ENOENT: no such file or directory'),
    { code: 'ENOENT' }
  ),
  malformedCpuInfo: 'invalid\ncpu\ninfo\nformat',
  emptyWmicOutput:
    'Node,Manufacturer,MaxClockSpeed,Name,NumberOfCores,NumberOfLogicalProcessors\n',
};

// Expected test results for validation
export const expectedResults = {
  intel12thGenOptimalThreads: 8, // 12 total - 4 efficiency = 8 performance cores
  amdRyzenOptimalThreads: 16, // 16 cores - 0 efficiency = 16 performance cores
  appleM2OptimalThreads: 6, // 10 total - 4 efficiency = 6 performance cores

  // Resource calculation expectations
  llama7bOn24GBGpu: {
    shouldFitCompletely: true,
    expectedLayers: 32,
    approximateVramUsage: 8 * 1024 * 1024 * 1024, // ~8GB including KV cache
  },

  llama70bOn24GBGpu: {
    shouldFitPartially: true,
    expectedLayers: 15, // Partial loading
    approximateVramUsage: 22 * 1024 * 1024 * 1024, // ~22GB
  },
};

// Performance benchmark expectations
export const performanceBenchmarks = {
  cpuDetectionTime: {
    maxMs: 1000, // CPU detection should complete within 1 second
  },

  resourceCalculationTime: {
    maxMs: 100, // Resource calculation should be very fast
  },

  threadCalculationTime: {
    maxMs: 10, // Thread calculation should be nearly instantaneous
  },
};
