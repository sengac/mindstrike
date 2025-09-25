/**
 * LLM Thread Count Calculator - TypeScript Implementation
 * Optimized thread calculation algorithms for LLM inference
 */

interface CPU {
  id: string;
  vendorId: string;
  modelName: string;
  coreCount: number;
  efficiencyCoreCount: number;
  threadCount: number;
}

interface SystemInfo {
  cpus: CPU[];
  platform: 'linux' | 'windows' | 'darwin' | 'unknown';
}

/**
 * Platform-specific CPU detection and thread calculation
 * Optimized algorithms for LLM inference performance
 */
class LLMThreadCalculator {
  /**
   * Get optimal thread count for inference
   * Uses only performance cores for optimal inference latency
   *
   * Key algorithm: Use only performance cores (CoreCount - EfficiencyCoreCount)
   * This avoids scheduling inference on slower efficiency cores
   */
  static getOptimalThreadCount(cpus: CPU[]): number {
    if (cpus.length === 0) {
      return 0;
    }

    let performanceCoreCount = 0;

    for (const cpu of cpus) {
      // Calculate performance cores: Total cores - Efficiency cores
      const performanceCores = cpu.coreCount - cpu.efficiencyCoreCount;
      performanceCoreCount += performanceCores;
    }

    return performanceCoreCount;
  }

  /**
   * Detect CPU information (simulated for different platforms)
   * Platform-specific CPU detection algorithms
   */
  static async detectSystemInfo(): Promise<SystemInfo> {
    const platform = this.detectPlatform();

    switch (platform) {
      case 'darwin':
        return this.detectDarwinCPUs();
      case 'linux':
        return this.detectLinuxCPUs();
      case 'windows':
        return this.detectWindowsCPUs();
      default:
        return this.detectGenericCPUs();
    }
  }

  /**
   * macOS CPU detection using syscalls
   * Uses sysctl to detect performance and efficiency cores
   */
  private static detectDarwinCPUs(): SystemInfo {
    // Simulate syscall queries for macOS CPU detection
    const perfCores = this.simulateSysctl('hw.perflevel0.physicalcpu', 8);
    const efficiencyCores = this.simulateSysctl('hw.perflevel1.physicalcpu', 4);
    const logicalCores = this.simulateSysctl('hw.logicalcpu', 12);

    return {
      platform: 'darwin',
      cpus: [
        {
          id: '0',
          vendorId: 'Apple',
          modelName: 'Apple Silicon',
          coreCount: perfCores + efficiencyCores,
          efficiencyCoreCount: efficiencyCores,
          threadCount: logicalCores,
        },
      ],
    };
  }

  /**
   * Linux CPU detection with efficiency core handling
   * Parses CPU topology and detects efficiency cores by thread count
   */
  private static detectLinuxCPUs(): SystemInfo {
    // Simulate parsing /proc/cpuinfo and topology
    const cpus: CPU[] = [];

    // Example: Intel 12th gen with P-cores and E-cores
    const mockCpuInfo = {
      sockets: 1,
      coresPerSocket: 12,
      threadsPerCore: 2,
      efficiencyCores: 4, // E-cores typically have 1 thread per core
    };

    for (let socket = 0; socket < mockCpuInfo.sockets; socket++) {
      // Linux detection logic: cores with 1 thread are efficiency cores
      let efficiencyCoreCount = 0;
      let totalThreads = 0;

      for (let core = 0; core < mockCpuInfo.coresPerSocket; core++) {
        if (core >= mockCpuInfo.coresPerSocket - mockCpuInfo.efficiencyCores) {
          // E-cores: 1 thread per core
          totalThreads += 1;
          efficiencyCoreCount++;
        } else {
          // P-cores: 2 threads per core (hyperthreading)
          totalThreads += mockCpuInfo.threadsPerCore;
        }
      }

      cpus.push({
        id: socket.toString(),
        vendorId: 'GenuineIntel',
        modelName: 'Intel Core i7-12700K',
        coreCount: mockCpuInfo.coresPerSocket,
        efficiencyCoreCount: efficiencyCoreCount,
        threadCount: totalThreads,
      });
    }

    return {
      platform: 'linux',
      cpus,
    };
  }

  /**
   * Windows CPU detection with hyperthreading logic
   * Uses processor flags to detect hyperthreading and efficiency classes
   */
  private static detectWindowsCPUs(): SystemInfo {
    // Simulate Windows GetLogicalProcessorInformationEx API
    const cpus: CPU[] = [];

    // Example: AMD Ryzen with SMT
    const mockProcessorInfo = {
      packages: 1,
      coresPerPackage: 8,
      threadsPerCore: 2,
      efficiencyCores: 0, // AMD doesn't have efficiency cores
    };

    for (let pkg = 0; pkg < mockProcessorInfo.packages; pkg++) {
      let totalThreads = 0;

      for (let core = 0; core < mockProcessorInfo.coresPerPackage; core++) {
        // Windows logic: check processor flags for hyperthreading
        const hasHyperthreading = mockProcessorInfo.threadsPerCore > 1;

        if (hasHyperthreading) {
          totalThreads += 2; // SMT enabled
        } else {
          totalThreads += 1; // SMT disabled
        }
      }

      cpus.push({
        id: pkg.toString(),
        vendorId: 'AuthenticAMD',
        modelName: 'AMD Ryzen 7 5800X',
        coreCount: mockProcessorInfo.coresPerPackage,
        efficiencyCoreCount: mockProcessorInfo.efficiencyCores,
        threadCount: totalThreads,
      });
    }

    return {
      platform: 'windows',
      cpus,
    };
  }

  /**
   * Generic CPU detection fallback
   */
  private static detectGenericCPUs(): SystemInfo {
    // Fallback to logical CPU count
    const logicalCores =
      (typeof navigator !== 'undefined' && navigator?.hardwareConcurrency) || 4;

    return {
      platform: 'unknown',
      cpus: [
        {
          id: '0',
          vendorId: 'Unknown',
          modelName: 'Generic CPU',
          coreCount: logicalCores,
          efficiencyCoreCount: 0,
          threadCount: logicalCores,
        },
      ],
    };
  }

  /**
   * Validate and adjust thread count based on system constraints
   */
  static validateThreadCount(
    requestedThreads: number,
    systemInfo: SystemInfo,
    maxThreadsPerCore: number = 2
  ): number {
    const optimalThreads = this.getOptimalThreadCount(systemInfo.cpus);
    const totalCores = systemInfo.cpus.reduce(
      (sum, cpu) => sum + cpu.coreCount,
      0
    );
    const maxThreadsByCore = totalCores * maxThreadsPerCore;
    const finalMaxThreads = Math.min(optimalThreads, maxThreadsByCore);

    // Don't exceed final maximum thread count
    if (requestedThreads > finalMaxThreads) {
      console.warn(
        `Requested ${requestedThreads} threads exceeds maximum ${finalMaxThreads} (optimal: ${optimalThreads}, core-based: ${maxThreadsByCore}), capping to ${finalMaxThreads}`
      );
      return finalMaxThreads;
    }

    // Ensure minimum of 1 thread
    if (requestedThreads < 1) {
      return 1;
    }

    return requestedThreads;
  }

  /**
   * Get thread count recommendation based on use case
   */
  static getThreadCountRecommendation(
    systemInfo: SystemInfo,
    useCase: 'inference' | 'training' | 'serving' = 'inference'
  ): {
    recommended: number;
    minimum: number;
    maximum: number;
    reasoning: string;
  } {
    const optimalThreads = this.getOptimalThreadCount(systemInfo.cpus);
    const totalLogicalCores = systemInfo.cpus.reduce(
      (sum, cpu) => sum + cpu.threadCount,
      0
    );

    let recommended: number;
    let maximum: number;
    let reasoning: string;

    switch (useCase) {
      case 'inference':
        // For inference, use performance cores only
        recommended = optimalThreads;
        maximum = optimalThreads;
        reasoning = `Using ${optimalThreads} performance cores for optimal inference latency`;
        break;

      case 'training':
        // For training, can use more threads but still prefer performance cores
        recommended = Math.min(
          Math.floor(optimalThreads * 1.5),
          totalLogicalCores
        );
        maximum = Math.min(totalLogicalCores, optimalThreads * 2);
        reasoning = `Using up to ${recommended} threads for training throughput`;
        break;

      case 'serving':
        // For serving multiple requests, use fewer threads to allow parallelism
        recommended = Math.max(1, Math.floor(optimalThreads / 2));
        maximum = optimalThreads;
        reasoning = `Using ${recommended} threads to allow concurrent request processing`;
        break;

      default:
        recommended = optimalThreads;
        maximum = optimalThreads;
        reasoning = `Using ${optimalThreads} performance cores for optimal inference latency`;
    }

    return {
      recommended,
      minimum: 1,
      maximum,
      reasoning,
    };
  }

  /**
   * Display detailed system information
   */
  static analyzeSystem(systemInfo: SystemInfo): void {
    console.log('\n=== LLM Thread Calculator Analysis ===');
    console.log(`Platform: ${systemInfo.platform}`);
    console.log(`CPU Packages: ${systemInfo.cpus.length}`);

    let totalCores = 0;
    let totalEfficiencyCores = 0;
    let totalThreads = 0;

    systemInfo.cpus.forEach((cpu, index) => {
      console.log(`\nCPU ${index}:`);
      console.log(`  Model: ${cpu.modelName}`);
      console.log(`  Vendor: ${cpu.vendorId}`);
      console.log(`  Total Cores: ${cpu.coreCount}`);
      console.log(
        `  Performance Cores: ${cpu.coreCount - cpu.efficiencyCoreCount}`
      );
      console.log(`  Efficiency Cores: ${cpu.efficiencyCoreCount}`);
      console.log(`  Logical Threads: ${cpu.threadCount}`);

      totalCores += cpu.coreCount;
      totalEfficiencyCores += cpu.efficiencyCoreCount;
      totalThreads += cpu.threadCount;
    });

    const performanceCores = totalCores - totalEfficiencyCores;
    const optimalThreads = this.getOptimalThreadCount(systemInfo.cpus);

    console.log(`\n=== Summary ===`);
    console.log(`Total Cores: ${totalCores}`);
    console.log(`Performance Cores: ${performanceCores}`);
    console.log(`Efficiency Cores: ${totalEfficiencyCores}`);
    console.log(`Logical Threads: ${totalThreads}`);
    console.log(`Optimal Thread Count: ${optimalThreads}`);

    // Show recommendations for different use cases
    console.log(`\n=== Recommendations ===`);
    (['inference', 'training', 'serving'] as const).forEach(useCase => {
      const rec = this.getThreadCountRecommendation(systemInfo, useCase);
      console.log(`${useCase}: ${rec.recommended} threads - ${rec.reasoning}`);
    });
  }

  // Helper methods
  private static detectPlatform(): 'linux' | 'windows' | 'darwin' | 'unknown' {
    if (typeof navigator !== 'undefined') {
      const userAgent = navigator.userAgent.toLowerCase();
      if (userAgent.includes('mac')) {
        return 'darwin';
      }
      if (userAgent.includes('win')) {
        return 'windows';
      }
      if (userAgent.includes('linux')) {
        return 'linux';
      }
    }
    return 'unknown';
  }

  private static simulateSysctl(query: string, defaultValue: number): number {
    // In a real implementation, this would call actual sysctls
    // For demo purposes, return realistic values
    const mockValues: Record<string, number> = {
      'hw.perflevel0.physicalcpu': 8, // Performance cores
      'hw.perflevel1.physicalcpu': 4, // Efficiency cores
      'hw.logicalcpu': 12, // Total logical cores
    };
    return mockValues[query] || defaultValue;
  }
}

// Example usage and testing
async function demonstrateThreadCalculation() {
  console.log('=== LLM Thread Count Calculator Demo ===\n');

  // Test different CPU configurations
  const testConfigurations = [
    {
      name: 'Intel 12th Gen (P+E cores)',
      cpus: [
        {
          id: '0',
          vendorId: 'GenuineIntel',
          modelName: 'Intel Core i7-12700K',
          coreCount: 12,
          efficiencyCoreCount: 4,
          threadCount: 20,
        },
      ],
    },
    {
      name: 'AMD Ryzen (SMT)',
      cpus: [
        {
          id: '0',
          vendorId: 'AuthenticAMD',
          modelName: 'AMD Ryzen 7 5800X',
          coreCount: 8,
          efficiencyCoreCount: 0,
          threadCount: 16,
        },
      ],
    },
    {
      name: 'Apple Silicon M2',
      cpus: [
        {
          id: '0',
          vendorId: 'Apple',
          modelName: 'Apple M2',
          coreCount: 10,
          efficiencyCoreCount: 4,
          threadCount: 10,
        },
      ],
    },
  ];

  testConfigurations.forEach(config => {
    console.log(`\n=== Testing: ${config.name} ===`);

    const systemInfo: SystemInfo = {
      platform: 'unknown',
      cpus: config.cpus,
    };

    const optimalThreads = LLMThreadCalculator.getOptimalThreadCount(
      config.cpus
    );
    console.log(`Optimal Thread Count: ${optimalThreads}`);

    // Test different use cases
    (['inference', 'training', 'serving'] as const).forEach(useCase => {
      const rec = LLMThreadCalculator.getThreadCountRecommendation(
        systemInfo,
        useCase
      );
      console.log(`${useCase}: ${rec.recommended} threads`);
    });
  });

  // Test live system detection
  console.log('\n=== Live System Detection ===');
  const liveSystemInfo = await LLMThreadCalculator.detectSystemInfo();
  LLMThreadCalculator.analyzeSystem(liveSystemInfo);
}

export {
  LLMThreadCalculator,
  demonstrateThreadCalculation,
  type CPU,
  type SystemInfo,
};
