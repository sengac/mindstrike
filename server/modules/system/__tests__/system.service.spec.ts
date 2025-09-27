import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SystemService } from '../system.service';
import type { GlobalConfigService } from '../../shared/services/global-config.service';
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
  let mockGlobalConfigService: Partial<GlobalConfigService>;

  const mockSystemInfo: SystemInformation = {
    hasGpu: true,
    gpuType: 'NVIDIA',
    vramState: {
      total: 10737418240,
      used: 5368709120,
      free: 5368709120,
    },
    totalRAM: 34359738368,
    freeRAM: 17179869184,
    cpuThreads: 16,
    diskSpace: {
      total: 1000000000000,
      free: 500000000000,
      used: 500000000000,
    },
    lastUpdated: Date.now(),
  };

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();

    // Create mock GlobalConfigService
    mockGlobalConfigService = {
      getWorkspaceRoot: vi.fn().mockReturnValue('/test/workspace'),
      getMusicRoot: vi.fn().mockReturnValue('/test/music'),
      getCurrentWorkingDirectory: vi.fn().mockReturnValue('/test/workspace'),
      updateWorkspaceRoot: vi.fn(),
      updateMusicRoot: vi.fn(),
      updateCurrentWorkingDirectory: vi.fn(),
    };

    // Directly instantiate the service with mocked dependency
    service = new SystemService(mockGlobalConfigService as GlobalConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSystemInfo', () => {
    it('should return system information from systemInfoManager', async () => {
      vi.mocked(systemInfoManager.getSystemInfo).mockResolvedValue(
        mockSystemInfo
      );

      const result = await service.getSystemInfo();

      expect(result).toEqual({
        ...mockSystemInfo,
        workspaceRoot: '/test/workspace',
      });
      expect(systemInfoManager.getSystemInfo).toHaveBeenCalled();
    });

    it('should handle different platform types', async () => {
      const linuxInfo: SystemInformation = {
        ...mockSystemInfo,
        lastUpdated: Date.now(),
      };

      vi.mocked(systemInfoManager.getSystemInfo).mockResolvedValue(linuxInfo);

      const result = await service.getSystemInfo();

      expect(result.hasGpu).toBe(true);
      expect(result.workspaceRoot).toBe('/test/workspace');
    });

    it('should handle missing GPU information', async () => {
      const noGpuInfo: SystemInformation = {
        ...mockSystemInfo,
        hasGpu: false,
        gpuType: null,
        vramState: null,
      };

      vi.mocked(systemInfoManager.getSystemInfo).mockResolvedValue(noGpuInfo);

      const result = await service.getSystemInfo();

      expect(result.hasGpu).toBe(false);
      expect(result.gpuType).toBeNull();
      expect(result.vramState).toBeNull();
      expect(result.workspaceRoot).toBe('/test/workspace');
    });

    it('should handle low memory situations', async () => {
      const lowMemInfo: SystemInformation = {
        ...mockSystemInfo,
        totalRAM: 4294967296, // 4GB
        freeRAM: 536870912, // 512MB
      };

      vi.mocked(systemInfoManager.getSystemInfo).mockResolvedValue(lowMemInfo);

      const result = await service.getSystemInfo();

      expect(result.totalRAM).toBe(4294967296);
      expect(result.freeRAM).toBe(536870912);
      expect(result.workspaceRoot).toBe('/test/workspace');
    });

    it('should handle disk space edge cases', async () => {
      const fullDiskInfo: SystemInformation = {
        ...mockSystemInfo,
        diskSpace: {
          total: 1000000000000,
          free: 0,
          used: 1000000000000,
        },
      };

      vi.mocked(systemInfoManager.getSystemInfo).mockResolvedValue(
        fullDiskInfo
      );

      const result = await service.getSystemInfo();

      expect(result.diskSpace.free).toBe(0);
      expect(result.diskSpace.used).toBe(1000000000000);
      expect(result.workspaceRoot).toBe('/test/workspace');
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
