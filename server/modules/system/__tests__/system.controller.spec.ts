import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SystemController } from '../system.controller';
import type { SystemService } from '../system.service';
import type { SystemInformation } from '../../../systemInfoManager';

describe('SystemController', () => {
  let controller: SystemController;
  let mockSystemService: Partial<SystemService>;

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

  beforeEach(() => {
    // Create mock service with proper typing
    mockSystemService = {
      getSystemInfo: vi.fn().mockResolvedValue(mockSystemInfo),
    };

    // Directly instantiate controller with mock service
    controller = new SystemController(mockSystemService as SystemService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getSystemInfo', () => {
    it('should return system information', async () => {
      const result = await controller.getSystemInfo();

      expect(result).toEqual(mockSystemInfo);
      expect(mockSystemService.getSystemInfo).toHaveBeenCalled();
    });

    it('should handle GPU not available', async () => {
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

      vi.mocked(
        mockSystemService.getSystemInfo as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce(noGpuInfo);

      const result = await controller.getSystemInfo();

      expect(result).toEqual(noGpuInfo);
      expect(result.gpuAvailable).toBe(false);
    });

    it('should handle service errors gracefully', async () => {
      const error = new Error('Failed to get system info');
      vi.mocked(
        mockSystemService.getSystemInfo as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce(error);

      await expect(controller.getSystemInfo()).rejects.toThrow(
        'Failed to get system info'
      );
    });

    it('should return correct data structure', async () => {
      const result = await controller.getSystemInfo();

      // Check structure
      expect(result).toHaveProperty('gpuInfo');
      expect(result).toHaveProperty('gpuAvailable');
      expect(result).toHaveProperty('totalRAM');
      expect(result).toHaveProperty('availableRAM');
      expect(result).toHaveProperty('cpuModel');
      expect(result).toHaveProperty('cpuCores');
      expect(result).toHaveProperty('platform');
      expect(result).toHaveProperty('diskSpace');

      // Check disk space structure
      expect(result.diskSpace).toHaveProperty('total');
      expect(result.diskSpace).toHaveProperty('free');
      expect(result.diskSpace).toHaveProperty('used');
      expect(result.diskSpace).toHaveProperty('percentage');
    });

    it('should handle partial system information', async () => {
      const partialInfo: Partial<SystemInformation> = {
        gpuAvailable: false,
        totalRAM: 16384,
        availableRAM: 8192,
        cpuModel: 'Unknown',
        cpuCores: 4,
        platform: 'linux',
      };

      vi.mocked(
        mockSystemService.getSystemInfo as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce(partialInfo as SystemInformation);

      const result = await controller.getSystemInfo();

      expect(result.totalRAM).toBe(16384);
      expect(result.cpuCores).toBe(4);
      expect(result.platform).toBe('linux');
    });
  });
});
