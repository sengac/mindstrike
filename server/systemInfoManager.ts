import os from 'os';
import fs from 'fs/promises';
import { RealCPUDetector } from './utils/system/cpuDetector';
import { LLMThreadCalculator } from './utils/system/llmThreadCalculator';
import { sharedLlamaInstance } from './sharedLlamaInstance';

interface VramState {
  total: number; // bytes
  used: number; // bytes
  free: number; // bytes
}

export interface SystemInformation {
  hasGpu: boolean;
  gpuType: string | null;
  vramState: VramState | null;
  totalRAM: number; // bytes
  freeRAM: number; // bytes
  cpuThreads: number;
  diskSpace: {
    total: number; // bytes
    free: number; // bytes
    used: number; // bytes
  };
  lastUpdated: number;
}

class SystemInfoManager {
  private static instance: SystemInfoManager;
  private cachedSystemInfo: SystemInformation | null = null;
  private lastUpdate: number = 0;
  private cachedCPUInfo: Awaited<
    ReturnType<typeof RealCPUDetector.detectCPUInfo>
  > | null = null; // Permanent cache - CPU doesn't change during program execution

  public static getInstance(): SystemInfoManager {
    if (!SystemInfoManager.instance) {
      SystemInfoManager.instance = new SystemInfoManager();
    }
    return SystemInfoManager.instance;
  }

  private async getCPUInfo(): Promise<
    Awaited<ReturnType<typeof RealCPUDetector.detectCPUInfo>>
  > {
    if (!this.cachedCPUInfo) {
      this.cachedCPUInfo = await RealCPUDetector.detectCPUInfo();
    }
    return this.cachedCPUInfo;
  }

  public async getSystemInfo(): Promise<SystemInformation> {
    const now = Date.now();

    try {
      const llama = await sharedLlamaInstance.getLlamaForSystemInfo();

      const vramState = await llama.getVramState();
      const hasGpu = !!llama.gpu;
      const totalRAM = os.totalmem(); // bytes
      const freeRAM = os.freemem(); // bytes

      // Use advanced CPU detection for optimal thread count
      let cpuThreads = Math.max(1, Math.floor(os.cpus().length / 2)); // fallback

      try {
        // Get detailed CPU information using cached detection
        const systemInfo = await this.getCPUInfo();

        // Calculate optimal thread count using performance cores only
        const optimalThreads = LLMThreadCalculator.getOptimalThreadCount(
          systemInfo.cpus.map(cpu => ({
            id: cpu.id,
            vendorId: cpu.vendorId,
            modelName: cpu.modelName,
            coreCount: cpu.coreCount,
            efficiencyCoreCount: cpu.efficiencyCoreCount,
            threadCount: cpu.threadCount,
          }))
        );

        if (optimalThreads > 0) {
          cpuThreads = optimalThreads;
        }
      } catch (error) {
        console.warn('Advanced CPU detection failed, using fallback:', error);
      }

      // Get disk space information using Node.js fs.statfs
      let diskSpace = {
        total: 0,
        free: 0,
        used: 0,
      };

      try {
        const stats = await fs.statfs(process.cwd());
        diskSpace = {
          total: stats.blocks * stats.bsize,
          free: stats.bavail * stats.bsize,
          used: (stats.blocks - stats.bavail) * stats.bsize,
        };
      } catch (error) {
        console.warn(
          'Could not get disk space information using statfs:',
          error
        );
        // Fallback: set reasonable defaults
        diskSpace = {
          total: 0,
          free: 0,
          used: 0,
        };
      }

      this.cachedSystemInfo = {
        hasGpu,
        gpuType: typeof llama.gpu === 'string' ? llama.gpu : null,
        vramState: vramState ?? null,
        totalRAM,
        freeRAM,
        cpuThreads,
        diskSpace,
        lastUpdated: now,
      };

      this.lastUpdate = now;
      return this.cachedSystemInfo;
    } catch (error) {
      console.error('Failed to get system information:', error);

      // Return default values on error
      const totalRAM = os.totalmem(); // bytes
      const freeRAM = os.freemem(); // bytes

      // Use advanced CPU detection even in error fallback
      let cpuThreads = Math.max(1, Math.floor(os.cpus().length / 2)); // fallback

      try {
        const systemInfo = await this.getCPUInfo();
        const optimalThreads = LLMThreadCalculator.getOptimalThreadCount(
          systemInfo.cpus.map(cpu => ({
            id: cpu.id,
            vendorId: cpu.vendorId,
            modelName: cpu.modelName,
            coreCount: cpu.coreCount,
            efficiencyCoreCount: cpu.efficiencyCoreCount,
            threadCount: cpu.threadCount,
          }))
        );

        if (optimalThreads > 0) {
          cpuThreads = optimalThreads;
        }
      } catch (cpuError) {
        console.warn('CPU detection failed in error fallback:', cpuError);
      }
      this.cachedSystemInfo = {
        hasGpu: false,
        gpuType: null,
        vramState: null,
        totalRAM,
        freeRAM,
        cpuThreads,
        diskSpace: {
          total: 0,
          free: 0,
          used: 0,
        },
        lastUpdated: now,
      };

      this.lastUpdate = now;
      return this.cachedSystemInfo;
    }
  }

  public invalidateCache(): void {
    this.cachedSystemInfo = null;
    this.lastUpdate = 0;
    // Note: CPU cache is never invalidated as CPU characteristics don't change during program execution
  }
}

export const systemInfoManager = SystemInfoManager.getInstance();
