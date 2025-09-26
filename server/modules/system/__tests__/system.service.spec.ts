import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { SystemService } from '../system.service';
import type { SystemInformation } from '../../../systemInfoManager';

// Mock the systemInfoManager module
vi.mock('../../../systemInfoManager', () => ({
  systemInfoManager: {
    getSystemInfo: vi.fn(),
  },
}));

import { systemInfoManager } from '../../../systemInfoManager';

describe('SystemService', () => {
  let service: SystemService;

  const mockSystemInfo: SystemInformation = {
    gpuInfo: {
      available: true,
      type: 'NVIDIA',
      name: 'GeForce RTX 3080',
      vram: 10240,
      computeCapability: '8.6',
    },
    gpuAvailable: true,
    totalRAM: 32768,
    availableRAM: 16384,
    cpuModel: 'Intel Core i9-9900K',
    cpuCores: 8,
    platform: 'darwin',
    diskSpace: {
      total: 1000000000000,
      free: 500000000000,
      used: 500000000000,
      percentage: 50,
    },
  };

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [SystemService],
    }).compile();

    service = module.get<SystemService>(SystemService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSystemInfo', () => {
    it('should return system information from systemInfoManager', async () => {
      vi.mocked(systemInfoManager.getSystemInfo).mockReturnValue(
        mockSystemInfo
      );

      const result = await service.getSystemInfo();

      expect(result).toEqual(mockSystemInfo);
      expect(systemInfoManager.getSystemInfo).toHaveBeenCalled();
    });

    it('should handle different platform types', async () => {
      const linuxInfo: SystemInformation = {
        ...mockSystemInfo,
        platform: 'linux',
      };

      vi.mocked(systemInfoManager.getSystemInfo).mockReturnValue(linuxInfo);

      const result = await service.getSystemInfo();

      expect(result.platform).toBe('linux');
    });

    it('should handle missing GPU information', async () => {
      const noGpuInfo: SystemInformation = {
        ...mockSystemInfo,
        gpuAvailable: false,
        gpuInfo: {
          available: false,
          type: 'Unknown',
          name: 'Unknown',
          vram: 0,
          computeCapability: '',
        },
      };

      vi.mocked(systemInfoManager.getSystemInfo).mockReturnValue(noGpuInfo);

      const result = await service.getSystemInfo();

      expect(result.gpuAvailable).toBe(false);
      expect(result.gpuInfo.available).toBe(false);
      expect(result.gpuInfo.vram).toBe(0);
    });

    it('should handle low memory situations', async () => {
      const lowMemInfo: SystemInformation = {
        ...mockSystemInfo,
        totalRAM: 4096,
        availableRAM: 512,
      };

      vi.mocked(systemInfoManager.getSystemInfo).mockReturnValue(lowMemInfo);

      const result = await service.getSystemInfo();

      expect(result.totalRAM).toBe(4096);
      expect(result.availableRAM).toBe(512);
    });

    it('should handle disk space edge cases', async () => {
      const fullDiskInfo: SystemInformation = {
        ...mockSystemInfo,
        diskSpace: {
          total: 1000000000000,
          free: 0,
          used: 1000000000000,
          percentage: 100,
        },
      };

      vi.mocked(systemInfoManager.getSystemInfo).mockReturnValue(fullDiskInfo);

      const result = await service.getSystemInfo();

      expect(result.diskSpace.free).toBe(0);
      expect(result.diskSpace.percentage).toBe(100);
    });

    it('should propagate errors from systemInfoManager', async () => {
      const error = new Error('System info unavailable');
      vi.mocked(systemInfoManager.getSystemInfo).mockImplementation(() => {
        throw error;
      });

      await expect(service.getSystemInfo()).rejects.toThrow(
        'System info unavailable'
      );
    });
  });
});
