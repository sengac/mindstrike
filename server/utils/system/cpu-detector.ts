/**
 * Real CPU Detection Implementation
 * Queries actual system information to detect CPU details
 */

import { execSync } from 'child_process';
import * as os from 'os';
import * as fs from 'fs';

interface CPUInfo {
  id: string;
  vendorId: string;
  modelName: string;
  coreCount: number;
  efficiencyCoreCount: number;
  threadCount: number;
  clockSpeed: number;
  architecture: string;
}

interface SystemInfo {
  platform: NodeJS.Platform;
  cpus: CPUInfo[];
  totalMemory: number;
  environment: 'node';
}

class RealCPUDetector {
  /**
   * Main entry point - detects CPU information on current platform
   */
  static async detectCPUInfo(): Promise<SystemInfo> {
    return this.detectNodeCPU();
  }

  /**
   * Node.js-based CPU detection (full system access)
   */
  private static detectNodeCPU(): SystemInfo {
    const platform = os.platform();
    const totalMemory = os.totalmem();

    let cpus: CPUInfo[];

    try {
      switch (platform) {
        case 'darwin':
          cpus = this.detectDarwinCPU();
          break;
        case 'linux':
          cpus = this.detectLinuxCPU();
          break;
        case 'win32':
          cpus = this.detectWindowsCPU();
          break;
        default:
          cpus = this.detectGenericNodeCPU();
      }
    } catch (error) {
      console.warn(
        'Failed to detect CPU details, falling back to generic detection:',
        error
      );
      cpus = this.detectGenericNodeCPU();
    }

    return {
      platform,
      cpus,
      totalMemory,
      environment: 'node',
    };
  }

  /**
   * macOS CPU detection using system calls
   */
  private static detectDarwinCPU(): CPUInfo[] {
    try {
      // Use sysctl to get detailed CPU information
      const perfCores = this.execSysctl('hw.perflevel0.physicalcpu');
      const efficiencyCores = this.execSysctl('hw.perflevel1.physicalcpu');
      const logicalCores =
        this.execSysctl('machdep.cpu.thread_count') ||
        this.execSysctl('hw.logicalcpu');
      const cpuBrand = this.execSysctl('machdep.cpu.brand_string');
      const cpuFreq =
        this.execSysctl('hw.cpufrequency_max') ||
        this.execSysctl('hw.cpufrequency');

      // Get architecture
      const arch = execSync('uname -m', { encoding: 'utf8' }).trim();

      // Determine vendor based on CPU brand string and architecture
      let vendorId = 'Apple';
      const brandStr = String(cpuBrand || '');
      if (brandStr.includes('Intel')) {
        vendorId = 'Intel';
      } else if (brandStr.includes('AMD')) {
        vendorId = 'AMD';
      } else if (arch === 'arm64' || brandStr.includes('Apple')) {
        vendorId = 'Apple';
      }

      const totalCores = Number(perfCores || 0) + Number(efficiencyCores || 0);
      const threads = Number(logicalCores || os.cpus().length);

      return [
        {
          id: '0',
          vendorId,
          modelName: String(cpuBrand || `${vendorId} ${arch.toUpperCase()}`),
          coreCount: totalCores || Math.ceil(threads / 2), // Fallback estimation
          efficiencyCoreCount: Number(efficiencyCores || 0),
          threadCount: threads,
          clockSpeed: Number(cpuFreq || 0),
          architecture: arch,
        },
      ];
    } catch (error) {
      console.warn('Failed to detect macOS CPU details:', error);
      return this.detectGenericNodeCPU();
    }
  }

  /**
   * Linux CPU detection using /proc/cpuinfo and topology
   */
  private static detectLinuxCPU(): CPUInfo[] {
    try {
      const cpuinfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
      const cpuData = this.parseCPUInfo(cpuinfo);

      // Get CPU topology for core/thread detection
      const topology = this.detectLinuxTopology();

      // Group by physical processor
      const processors = new Map<string, CPUInfo>();

      for (const cpu of cpuData) {
        const physicalId = cpu.physicalId || '0';

        if (!processors.has(physicalId)) {
          processors.set(physicalId, {
            id: physicalId,
            vendorId: cpu.vendorId,
            modelName: cpu.modelName,
            coreCount: 0,
            efficiencyCoreCount: 0,
            threadCount: 0,
            clockSpeed: cpu.clockSpeed,
            architecture: cpu.architecture,
          });
        }

        const proc = processors.get(physicalId)!;
        proc.threadCount++;

        // Count unique cores
        const coreId = cpu.coreId || '0';
        if (!proc.coreCount || proc.coreCount < parseInt(coreId) + 1) {
          proc.coreCount = parseInt(coreId) + 1;
        }
      }

      // Apply topology information
      for (const [id, proc] of processors) {
        const topoInfo = topology.get(id);
        if (topoInfo) {
          proc.coreCount = topoInfo.coreCount;
          proc.efficiencyCoreCount = topoInfo.efficiencyCoreCount;
        }
      }

      return Array.from(processors.values());
    } catch (error) {
      console.warn('Failed to detect Linux CPU details:', error);
      return this.detectGenericNodeCPU();
    }
  }

  /**
   * Windows CPU detection using wmic
   */
  private static detectWindowsCPU(): CPUInfo[] {
    try {
      // Use wmic to get CPU information
      const cpuInfo = execSync(
        'wmic cpu get Name,Manufacturer,NumberOfCores,NumberOfLogicalProcessors,MaxClockSpeed /format:csv',
        { encoding: 'utf8' }
      );

      const lines = cpuInfo
        .split('\n')
        .filter(line => line.trim() && !line.startsWith('Node'));
      const cpus: CPUInfo[] = [];

      for (let i = 0; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts.length >= 5) {
          const [
            ,
            manufacturer,
            maxClockSpeed,
            name,
            numberOfCores,
            numberOfLogicalProcessors,
          ] = parts;

          // Try to detect efficiency cores (Intel 12th gen+)
          const efficiencyCores = this.detectWindowsEfficiencyCores(name);

          cpus.push({
            id: i.toString(),
            vendorId: manufacturer?.trim() || 'Unknown',
            modelName: name?.trim() || 'Unknown CPU',
            coreCount: parseInt(numberOfCores) || 0,
            efficiencyCoreCount: efficiencyCores,
            threadCount: parseInt(numberOfLogicalProcessors) || 0,
            clockSpeed: parseInt(maxClockSpeed) * 1000000 || 0, // MHz to Hz
            architecture: process.arch,
          });
        }
      }

      return cpus.length > 0 ? cpus : this.detectGenericNodeCPU();
    } catch (error) {
      console.warn('Failed to detect Windows CPU details:', error);
      return this.detectGenericNodeCPU();
    }
  }

  /**
   * Generic Node.js CPU detection fallback
   */
  private static detectGenericNodeCPU(): CPUInfo[] {
    const cpus = os.cpus();
    const uniqueModels = new Map<string, CPUInfo>();

    for (const cpu of cpus) {
      const key = `${cpu.model}-${cpu.speed}`;

      if (!uniqueModels.has(key)) {
        uniqueModels.set(key, {
          id: uniqueModels.size.toString(),
          vendorId: this.extractVendorFromModel(cpu.model),
          modelName: cpu.model,
          coreCount: 0,
          efficiencyCoreCount: 0,
          threadCount: 0,
          clockSpeed: cpu.speed * 1000000, // MHz to Hz
          architecture: os.arch(),
        });
      }

      uniqueModels.get(key)!.threadCount++;
    }

    // Estimate core count (assuming 2 threads per core for most modern CPUs)
    for (const cpu of uniqueModels.values()) {
      cpu.coreCount = Math.ceil(cpu.threadCount / 2);
      cpu.efficiencyCoreCount = this.estimateEfficiencyCores(
        cpu.threadCount,
        os.platform()
      );
    }

    return Array.from(uniqueModels.values());
  }

  private static execSysctl(key: string): number | string | null {
    try {
      const result = execSync(`sysctl -n ${key}`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'], // Suppress stderr to avoid "unknown oid" messages
      });
      const value = result.trim();
      return isNaN(Number(value)) ? value : Number(value);
    } catch {
      return null;
    }
  }

  private static parseCPUInfo(cpuinfo: string): any[] {
    const processors = [];
    const lines = cpuinfo.split('\n');
    let currentProcessor: any = {};

    for (const line of lines) {
      if (line.trim() === '') {
        if (Object.keys(currentProcessor).length > 0) {
          processors.push(currentProcessor);
          currentProcessor = {};
        }
        continue;
      }

      const [key, value] = line.split(':').map(s => s.trim());
      if (key && value) {
        switch (key) {
          case 'processor':
            currentProcessor.processor = value;
            break;
          case 'vendor_id':
            currentProcessor.vendorId = value;
            break;
          case 'model name':
            currentProcessor.modelName = value;
            break;
          case 'physical id':
            currentProcessor.physicalId = value;
            break;
          case 'core id':
            currentProcessor.coreId = value;
            break;
          case 'cpu MHz':
            currentProcessor.clockSpeed = parseFloat(value) * 1000000;
            break;
          case 'flags':
            currentProcessor.flags = value.split(' ');
            break;
        }
      }
    }

    if (Object.keys(currentProcessor).length > 0) {
      processors.push(currentProcessor);
    }

    return processors;
  }

  private static detectLinuxTopology(): Map<
    string,
    { coreCount: number; efficiencyCoreCount: number }
  > {
    const topology = new Map();

    try {
      // Try to read CPU topology
      const cpuDirs = fs
        .readdirSync('/sys/devices/system/cpu')
        .filter(name => name.startsWith('cpu'))
        .filter(name => /^cpu\d+$/.test(name));

      for (const cpuDir of cpuDirs) {
        try {
          const physicalPackageId = fs
            .readFileSync(
              `/sys/devices/system/cpu/${cpuDir}/topology/physical_package_id`,
              'utf8'
            )
            .trim();

          const coreId = fs
            .readFileSync(
              `/sys/devices/system/cpu/${cpuDir}/topology/core_id`,
              'utf8'
            )
            .trim();

          // Try to detect efficiency cores by looking at max frequency
          let isEfficiencyCore = false;
          try {
            const maxFreq = parseInt(
              fs
                .readFileSync(
                  `/sys/devices/system/cpu/${cpuDir}/cpufreq/cpuinfo_max_freq`,
                  'utf8'
                )
                .trim()
            );

            // This is a heuristic - efficiency cores typically have lower max frequency
            if (maxFreq < 3000000) {
              // Less than 3GHz
              isEfficiencyCore = true;
            }
          } catch {
            // cpufreq info not available
          }

          if (!topology.has(physicalPackageId)) {
            topology.set(physicalPackageId, {
              coreCount: 0,
              efficiencyCoreCount: 0,
              cores: new Set(),
            });
          }

          const pkg = topology.get(physicalPackageId);
          if (!pkg.cores.has(coreId)) {
            pkg.cores.add(coreId);
            pkg.coreCount++;
            if (isEfficiencyCore) {
              pkg.efficiencyCoreCount++;
            }
          }
        } catch {
          // Skip this CPU if we can't read its topology
        }
      }
    } catch {
      // Topology detection failed
    }

    return topology;
  }

  private static detectWindowsEfficiencyCores(modelName: string): number {
    // Intel 12th gen and newer have efficiency cores
    const intelGen12Plus = /Intel.*Core.*i[3579]-1[2-9]\d{2,3}/.test(modelName);

    if (intelGen12Plus) {
      // Rough estimation based on common Intel configurations
      if (modelName.includes('i3')) return 0;
      if (modelName.includes('i5')) return 4;
      if (modelName.includes('i7')) return 4;
      if (modelName.includes('i9')) return 8;
    }

    return 0;
  }

  private static estimateEfficiencyCores(
    logicalCores: number,
    platform: NodeJS.Platform
  ): number {
    // Rough estimation for unknown CPUs
    if (platform === 'darwin' && logicalCores >= 8) {
      return Math.floor(logicalCores / 3); // Apple Silicon typically has ~1/3 efficiency cores
    }

    if (logicalCores >= 16) {
      return Math.floor(logicalCores / 4); // Intel 12th gen estimation
    }

    return 0;
  }

  private static guessCPUVendor(userAgent: string): string {
    if (userAgent.includes('Intel')) return 'Intel';
    if (userAgent.includes('AMD')) return 'AMD';
    if (userAgent.includes('Mac')) return 'Apple';
    if (userAgent.includes('ARM')) return 'ARM';
    return 'Unknown';
  }

  private static guessCPUModel(userAgent: string): string {
    if (userAgent.includes('Mac')) {
      if (userAgent.includes('Intel')) return 'Intel-based Mac';
      return 'Apple Silicon Mac';
    }
    return 'Unknown CPU';
  }

  private static detectArchitecture(userAgent: string): string {
    if (userAgent.includes('x86_64') || userAgent.includes('x64')) return 'x64';
    if (userAgent.includes('arm64') || userAgent.includes('aarch64'))
      return 'arm64';
    if (userAgent.includes('x86')) return 'x86';
    return 'unknown';
  }

  private static extractVendorFromModel(model: string): string {
    if (model.includes('Intel')) return 'Intel';
    if (model.includes('AMD')) return 'AMD';
    if (model.includes('Apple')) return 'Apple';
    if (model.includes('ARM')) return 'ARM';
    return 'Unknown';
  }

  /**
   * Display detailed CPU information
   */
  static displayCPUInfo(systemInfo: SystemInfo): void {
    console.log('\n=== Real CPU Detection Results ===');
    console.log(`Environment: ${systemInfo.environment}`);
    console.log(`Platform: ${systemInfo.platform}`);
    console.log(
      `Total Memory: ${Math.round(systemInfo.totalMemory / 1024 / 1024 / 1024)}GB`
    );
    console.log(`CPU Packages: ${systemInfo.cpus.length}`);

    systemInfo.cpus.forEach((cpu, index) => {
      console.log(`\nCPU ${index}:`);
      console.log(`  ID: ${cpu.id}`);
      console.log(`  Vendor: ${cpu.vendorId}`);
      console.log(`  Model: ${cpu.modelName}`);
      console.log(`  Architecture: ${cpu.architecture}`);
      console.log(`  Total Cores: ${cpu.coreCount}`);
      console.log(
        `  Performance Cores: ${cpu.coreCount - cpu.efficiencyCoreCount}`
      );
      console.log(`  Efficiency Cores: ${cpu.efficiencyCoreCount}`);
      console.log(`  Logical Threads: ${cpu.threadCount}`);
      console.log(
        `  Clock Speed: ${cpu.clockSpeed ? Math.round(cpu.clockSpeed / 1000000) + 'MHz' : 'Unknown'}`
      );
    });

    // Calculate optimal thread count using detected info
    const performanceCores = systemInfo.cpus.reduce(
      (sum, cpu) => sum + (cpu.coreCount - cpu.efficiencyCoreCount),
      0
    );

    console.log(`\n=== LLM Thread Calculation ===`);
    console.log(`Optimal Thread Count: ${performanceCores}`);
    console.log(
      `Reasoning: Using only performance cores for optimal inference`
    );
  }
}

// Example usage
async function demonstrateRealCPUDetection() {
  console.log('=== Real CPU Detection Demo ===');

  try {
    const systemInfo = await RealCPUDetector.detectCPUInfo();
    RealCPUDetector.displayCPUInfo(systemInfo);

    // Test in different scenarios
    console.log('\n=== Performance Comparison ===');
    const logicalCores = systemInfo.cpus.reduce(
      (sum, cpu) => sum + cpu.threadCount,
      0
    );
    const performanceCores = systemInfo.cpus.reduce(
      (sum, cpu) => sum + (cpu.coreCount - cpu.efficiencyCoreCount),
      0
    );

    console.log(`Using all logical cores: ${logicalCores} threads`);
    console.log(`Using optimized method: ${performanceCores} threads`);
    console.log(
      `Efficiency gain: ${Math.round(((logicalCores - performanceCores) / logicalCores) * 100)}% fewer threads for better performance`
    );
  } catch (error) {
    console.error('Failed to detect CPU information:', error);
  }
}

export {
  RealCPUDetector,
  demonstrateRealCPUDetection,
  type CPUInfo,
  type SystemInfo,
};
