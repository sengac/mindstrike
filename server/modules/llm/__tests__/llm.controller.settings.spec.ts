import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { InternalServerErrorException } from '@nestjs/common';
import { LlmController } from '../llm.controller';
import type { LocalLlmService } from '../services/local-llm.service';
import type { LlmService } from '../services/llm.service';
import type { ModelDiscoveryService } from '../services/model-discovery.service';
import type { ModelDownloadService } from '../services/model-download.service';
import { modelSettingsManager } from '../../../utils/modelSettingsManager';

vi.mock('../../../utils/modelSettingsManager', () => ({
  modelSettingsManager: {
    loadAllModelSettings: vi.fn(),
  },
}));

describe('LlmController - Settings Routes', () => {
  let controller: LlmController;
  let mockLocalLlmService: Partial<LocalLlmService>;
  let mockLlmService: Partial<LlmService>;
  let mockDiscoveryService: Partial<ModelDiscoveryService>;
  let mockDownloadService: Partial<ModelDownloadService>;

  beforeEach(() => {
    mockLocalLlmService = {};
    mockLlmService = {};
    mockDiscoveryService = {};
    mockDownloadService = {};

    controller = new LlmController(
      mockLlmService as LlmService,
      mockDiscoveryService as ModelDiscoveryService,
      mockDownloadService as ModelDownloadService,
      mockLocalLlmService as LocalLlmService
    );

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getSettings', () => {
    it('should return all model settings successfully', async () => {
      const mockSettings = {
        'model-1': {
          gpuLayers: 32,
          contextSize: 4096,
          batchSize: 512,
        },
        'model-2': {
          gpuLayers: 16,
          contextSize: 2048,
          temperature: 0.7,
        },
      };

      vi.mocked(modelSettingsManager.loadAllModelSettings).mockResolvedValue(
        mockSettings
      );

      const result = await controller.getSettings();

      expect(result).toEqual(mockSettings);
      expect(modelSettingsManager.loadAllModelSettings).toHaveBeenCalledOnce();
    });

    it('should return empty object when no settings exist', async () => {
      vi.mocked(modelSettingsManager.loadAllModelSettings).mockResolvedValue(
        {}
      );

      const result = await controller.getSettings();

      expect(result).toEqual({});
      expect(modelSettingsManager.loadAllModelSettings).toHaveBeenCalledOnce();
    });

    it('should throw InternalServerErrorException when loading settings fails', async () => {
      const error = new Error('Failed to read settings directory');

      vi.mocked(modelSettingsManager.loadAllModelSettings).mockRejectedValue(
        error
      );

      await expect(controller.getSettings()).rejects.toThrow(
        InternalServerErrorException
      );

      await expect(controller.getSettings()).rejects.toThrow(
        'Failed to read settings directory'
      );

      expect(modelSettingsManager.loadAllModelSettings).toHaveBeenCalled();
    });

    it('should handle non-Error exceptions properly', async () => {
      const error = 'String error';

      vi.mocked(modelSettingsManager.loadAllModelSettings).mockRejectedValue(
        error
      );

      await expect(controller.getSettings()).rejects.toThrow(
        InternalServerErrorException
      );

      await expect(controller.getSettings()).rejects.toThrow(
        'Failed to get all model settings'
      );

      expect(modelSettingsManager.loadAllModelSettings).toHaveBeenCalled();
    });

    it('should handle settings with various configurations', async () => {
      const mockSettings = {
        'minimal-config': {
          gpuLayers: 0,
        },
        'full-config': {
          gpuLayers: 48,
          contextSize: 8192,
          batchSize: 1024,
          threads: 8,
          temperature: 0.9,
        },
        'auto-gpu': {
          gpuLayers: -1,
          contextSize: 4096,
        },
      };

      vi.mocked(modelSettingsManager.loadAllModelSettings).mockResolvedValue(
        mockSettings
      );

      const result = await controller.getSettings();

      expect(result).toEqual(mockSettings);
      expect(result['minimal-config'].gpuLayers).toBe(0);
      expect(result['full-config'].temperature).toBe(0.9);
      expect(result['auto-gpu'].gpuLayers).toBe(-1);
    });
  });
});
