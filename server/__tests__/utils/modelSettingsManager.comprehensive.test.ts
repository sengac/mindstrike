import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
} from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import {
  ModelSettingsManager,
  type ModelLoadingSettings,
} from '../../utils/modelSettingsManager.js';
import { getLocalModelSettingsDirectory } from '../../utils/settingsDirectory.js';
import { ErrorFactory, TestUtils } from '../fixtures/testData.js';

// Mock the dependencies
vi.mock('fs/promises');
vi.mock('../../utils/settingsDirectory.js');

const mockFs = fs as {
  access: Mock;
  mkdir: Mock;
  writeFile: Mock;
  readFile: Mock;
  unlink: Mock;
  readdir: Mock;
};

const mockGetLocalModelSettingsDirectory =
  getLocalModelSettingsDirectory as Mock;

describe('ModelSettingsManager', () => {
  const mockSettingsDir = '/test/settings/directory';
  let manager: ModelSettingsManager;
  let consoleSpy: Mock;

  const validSettings: ModelLoadingSettings = {
    gpuLayers: 32,
    contextSize: 4096,
    batchSize: 512,
    threads: 8,
    temperature: 0.7,
  };

  const minimalSettings: ModelLoadingSettings = {
    temperature: 0.5,
  };

  const emptySettings: ModelLoadingSettings = {};

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLocalModelSettingsDirectory.mockReturnValue(mockSettingsDir);
    manager = new ModelSettingsManager();
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('Constructor', () => {
    it('should initialize with settings directory from utility function', () => {
      expect(mockGetLocalModelSettingsDirectory).toHaveBeenCalledTimes(1);
      expect(manager).toBeInstanceOf(ModelSettingsManager);
    });
  });

  describe('Directory Management', () => {
    describe('ensureSettingsDirectory', () => {
      it('should not create directory if it already exists', async () => {
        mockFs.access.mockResolvedValue(undefined);

        await manager.saveModelSettings('test-model', validSettings);

        expect(mockFs.access).toHaveBeenCalledWith(mockSettingsDir);
        expect(mockFs.mkdir).not.toHaveBeenCalled();
      });

      it('should create directory if it does not exist', async () => {
        mockFs.access.mockRejectedValue(ErrorFactory.fileNotFound());
        mockFs.mkdir.mockResolvedValue(undefined);

        await manager.saveModelSettings('test-model', validSettings);

        expect(mockFs.access).toHaveBeenCalledWith(mockSettingsDir);
        expect(mockFs.mkdir).toHaveBeenCalledWith(mockSettingsDir, {
          recursive: true,
        });
      });

      it('should create nested directories recursively', async () => {
        const nestedDir = '/deep/nested/path';
        mockGetLocalModelSettingsDirectory.mockReturnValue(nestedDir);
        manager = new ModelSettingsManager();

        mockFs.access.mockRejectedValue(ErrorFactory.fileNotFound());
        mockFs.mkdir.mockResolvedValue(undefined);

        await manager.saveModelSettings('test-model', validSettings);

        expect(mockFs.mkdir).toHaveBeenCalledWith(nestedDir, {
          recursive: true,
        });
      });

      it('should handle directory creation errors gracefully', async () => {
        mockFs.access.mockRejectedValue(ErrorFactory.fileNotFound());
        const creationError = ErrorFactory.permissionDenied();
        mockFs.mkdir.mockRejectedValue(creationError);

        await expect(
          manager.saveModelSettings('test-model', validSettings)
        ).rejects.toThrow(creationError);
      });
    });
  });

  describe('Settings File Path Generation', () => {
    it('should generate correct file paths for various model IDs', async () => {
      const testCases = [
        {
          modelId: 'llama2',
          expected: path.join(mockSettingsDir, 'llama2.json'),
        },
        {
          modelId: 'gpt-4-turbo',
          expected: path.join(mockSettingsDir, 'gpt-4-turbo.json'),
        },
        {
          modelId: 'claude-3-opus',
          expected: path.join(mockSettingsDir, 'claude-3-opus.json'),
        },
        {
          modelId: 'model_with_underscores',
          expected: path.join(mockSettingsDir, 'model_with_underscores.json'),
        },
        {
          modelId: '123numeric',
          expected: path.join(mockSettingsDir, '123numeric.json'),
        },
      ];

      for (const { modelId, expected } of testCases) {
        // We test this indirectly through saveModelSettings since getSettingsFilePath is private
        mockFs.access.mockResolvedValue(undefined);
        mockFs.writeFile.mockResolvedValue(undefined);

        await manager.saveModelSettings(modelId, validSettings);

        expect(mockFs.writeFile).toHaveBeenCalledWith(
          expected,
          expect.any(String)
        );

        vi.clearAllMocks();
      }
    });
  });

  describe('saveModelSettings', () => {
    beforeEach(() => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
    });

    it('should save valid settings to correct file path', async () => {
      const modelId = 'test-model';
      const expectedPath = path.join(mockSettingsDir, 'test-model.json');
      const expectedContent = JSON.stringify(validSettings, null, 2);

      await manager.saveModelSettings(modelId, validSettings);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expectedPath,
        expectedContent
      );
    });

    it('should save minimal settings with only temperature', async () => {
      const modelId = 'minimal-model';
      const expectedContent = JSON.stringify(minimalSettings, null, 2);

      await manager.saveModelSettings(modelId, minimalSettings);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('minimal-model.json'),
        expectedContent
      );
    });

    it('should save empty settings object', async () => {
      const modelId = 'empty-model';
      const expectedContent = JSON.stringify(emptySettings, null, 2);

      await manager.saveModelSettings(modelId, emptySettings);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('empty-model.json'),
        expectedContent
      );
    });

    it('should handle settings with all optional properties undefined', async () => {
      const undefinedSettings: ModelLoadingSettings = {
        gpuLayers: undefined,
        contextSize: undefined,
        batchSize: undefined,
        threads: undefined,
        temperature: undefined,
      };

      await manager.saveModelSettings('undefined-model', undefinedSettings);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('undefined-model.json'),
        JSON.stringify(undefinedSettings, null, 2)
      );
    });

    it('should handle boundary values correctly', async () => {
      const boundarySettings: ModelLoadingSettings = {
        gpuLayers: -1, // Auto GPU layers
        contextSize: 1, // Minimum context
        batchSize: 1, // Minimum batch
        threads: 1, // Single thread
        temperature: 0.0, // Minimum temperature
      };

      await manager.saveModelSettings('boundary-model', boundarySettings);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('boundary-model.json'),
        JSON.stringify(boundarySettings, null, 2)
      );
    });

    it('should handle maximum boundary values', async () => {
      const maxSettings: ModelLoadingSettings = {
        gpuLayers: 999,
        contextSize: 100000,
        batchSize: 10000,
        threads: 64,
        temperature: 2.0,
      };

      await manager.saveModelSettings('max-model', maxSettings);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('max-model.json'),
        JSON.stringify(maxSettings, null, 2)
      );
    });

    it('should ensure directory exists before saving', async () => {
      mockFs.access.mockRejectedValue(ErrorFactory.fileNotFound());
      mockFs.mkdir.mockResolvedValue(undefined);

      await manager.saveModelSettings('test-model', validSettings);

      expect(mockFs.access).toHaveBeenCalledWith(mockSettingsDir);
      expect(mockFs.mkdir).toHaveBeenCalledWith(mockSettingsDir, {
        recursive: true,
      });
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should handle file write permission errors', async () => {
      const permissionError = ErrorFactory.permissionDenied(
        '/settings/file.json'
      );
      mockFs.writeFile.mockRejectedValue(permissionError);

      await expect(
        manager.saveModelSettings('test-model', validSettings)
      ).rejects.toThrow(permissionError);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error saving settings for model test-model:',
        permissionError
      );
    });

    it('should handle disk full errors', async () => {
      const diskFullError = new Error(
        'ENOSPC: no space left on device'
      ) as NodeJS.ErrnoException;
      diskFullError.code = 'ENOSPC';
      mockFs.writeFile.mockRejectedValue(diskFullError);

      await expect(
        manager.saveModelSettings('test-model', validSettings)
      ).rejects.toThrow(diskFullError);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error saving settings for model test-model:',
        diskFullError
      );
    });

    it('should handle very long model IDs', async () => {
      const longModelId = 'a'.repeat(255);

      await manager.saveModelSettings(longModelId, validSettings);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining(`${longModelId}.json`),
        JSON.stringify(validSettings, null, 2)
      );
    });

    it('should handle model IDs with special characters', async () => {
      const specialModelId = 'model-with@special#characters$and%spaces';

      await manager.saveModelSettings(specialModelId, validSettings);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining(`${specialModelId}.json`),
        JSON.stringify(validSettings, null, 2)
      );
    });
  });

  describe('loadModelSettings', () => {
    it('should load existing settings successfully', async () => {
      const modelId = 'test-model';
      const settingsJson = JSON.stringify(validSettings);
      mockFs.readFile.mockResolvedValue(settingsJson);

      const result = await manager.loadModelSettings(modelId);

      expect(mockFs.readFile).toHaveBeenCalledWith(
        path.join(mockSettingsDir, 'test-model.json'),
        'utf-8'
      );
      expect(result).toEqual(validSettings);
    });

    it('should return null when settings file does not exist', async () => {
      const fileNotFoundError = ErrorFactory.fileNotFound();
      mockFs.readFile.mockRejectedValue(fileNotFoundError);

      const result = await manager.loadModelSettings('non-existent-model');

      expect(result).toBeNull();
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should load minimal settings correctly', async () => {
      const settingsJson = JSON.stringify(minimalSettings);
      mockFs.readFile.mockResolvedValue(settingsJson);

      const result = await manager.loadModelSettings('minimal-model');

      expect(result).toEqual(minimalSettings);
    });

    it('should load empty settings object', async () => {
      const settingsJson = JSON.stringify(emptySettings);
      mockFs.readFile.mockResolvedValue(settingsJson);

      const result = await manager.loadModelSettings('empty-model');

      expect(result).toEqual(emptySettings);
    });

    it('should handle corrupt JSON files gracefully', async () => {
      const corruptJson = '{ invalid json content }';
      mockFs.readFile.mockResolvedValue(corruptJson);

      await expect(
        manager.loadModelSettings('corrupt-model')
      ).rejects.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error loading settings for model corrupt-model:',
        expect.any(Error)
      );
    });

    it('should handle partially corrupt JSON', async () => {
      const partialJson = '{ "temperature": 0.7, "invalid": }';
      mockFs.readFile.mockResolvedValue(partialJson);

      await expect(
        manager.loadModelSettings('partial-model')
      ).rejects.toThrow();
    });

    it('should handle empty file content', async () => {
      mockFs.readFile.mockResolvedValue('');

      await expect(
        manager.loadModelSettings('empty-file-model')
      ).rejects.toThrow();
    });

    it('should handle whitespace-only file content', async () => {
      mockFs.readFile.mockResolvedValue('   \n\t  ');

      await expect(
        manager.loadModelSettings('whitespace-model')
      ).rejects.toThrow();
    });

    it('should handle file permission errors', async () => {
      const permissionError = ErrorFactory.permissionDenied();
      mockFs.readFile.mockRejectedValue(permissionError);

      await expect(
        manager.loadModelSettings('permission-model')
      ).rejects.toThrow(permissionError);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error loading settings for model permission-model:',
        permissionError
      );
    });

    it('should handle file system errors other than ENOENT', async () => {
      const systemError = new Error('EIO: i/o error') as NodeJS.ErrnoException;
      systemError.code = 'EIO';
      mockFs.readFile.mockRejectedValue(systemError);

      await expect(manager.loadModelSettings('io-error-model')).rejects.toThrow(
        systemError
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error loading settings for model io-error-model:',
        systemError
      );
    });

    it('should handle network drive timeout errors', async () => {
      const timeoutError = new Error(
        'ETIMEDOUT: connection timed out'
      ) as NodeJS.ErrnoException;
      timeoutError.code = 'ETIMEDOUT';
      mockFs.readFile.mockRejectedValue(timeoutError);

      await expect(manager.loadModelSettings('timeout-model')).rejects.toThrow(
        timeoutError
      );
    });

    it('should parse JSON with extra properties gracefully', async () => {
      const extendedSettings = {
        ...validSettings,
        unknownProperty: 'value',
        anotherUnknown: 123,
      };
      const settingsJson = JSON.stringify(extendedSettings);
      mockFs.readFile.mockResolvedValue(settingsJson);

      const result = await manager.loadModelSettings('extended-model');

      expect(result).toEqual(extendedSettings);
    });
  });

  describe('loadAllModelSettings', () => {
    it('should load all settings from multiple files', async () => {
      const files = ['model1.json', 'model2.json', 'model3.json'];
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue(files);

      // Mock individual file reads
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(validSettings))
        .mockResolvedValueOnce(JSON.stringify(minimalSettings))
        .mockResolvedValueOnce(JSON.stringify(emptySettings));

      const result = await manager.loadAllModelSettings();

      expect(mockFs.readdir).toHaveBeenCalledWith(mockSettingsDir);
      expect(result).toEqual({
        model1: validSettings,
        model2: minimalSettings,
        model3: emptySettings,
      });
    });

    it('should return empty object when no settings files exist', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([]);

      const result = await manager.loadAllModelSettings();

      expect(result).toEqual({});
    });

    it('should ignore non-JSON files in settings directory', async () => {
      const files = [
        'model1.json',
        'readme.txt',
        'model2.json',
        '.DS_Store',
        'backup.bak',
      ];
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue(files);

      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(validSettings))
        .mockResolvedValueOnce(JSON.stringify(minimalSettings));

      const result = await manager.loadAllModelSettings();

      expect(result).toEqual({
        model1: validSettings,
        model2: minimalSettings,
      });
      expect(mockFs.readFile).toHaveBeenCalledTimes(2);
    });

    it('should handle mixed file types and extensions', async () => {
      const files = [
        'valid.json',
        'invalid.json.bak',
        'test.JSON', // Different case
        'model.json',
        '.hidden.json',
      ];
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue(files);

      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(validSettings))
        .mockResolvedValueOnce(JSON.stringify(minimalSettings))
        .mockResolvedValueOnce(JSON.stringify(emptySettings));

      const result = await manager.loadAllModelSettings();

      expect(result).toEqual({
        valid: validSettings,
        model: minimalSettings,
        '.hidden': emptySettings,
      });
    });

    it('should continue loading other files when one file fails', async () => {
      const files = ['good1.json', 'corrupt.json', 'good2.json'];
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue(files);

      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(validSettings))
        .mockRejectedValueOnce(ErrorFactory.jsonParseError())
        .mockResolvedValueOnce(JSON.stringify(minimalSettings));

      const result = await manager.loadAllModelSettings();

      expect(result).toEqual({
        good1: validSettings,
        good2: minimalSettings,
      });
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error loading settings for model corrupt:',
        expect.any(Error)
      );
    });

    it('should handle directory access permission errors', async () => {
      const permissionError = ErrorFactory.permissionDenied();
      mockFs.access.mockRejectedValue(permissionError);
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([]);

      const result = await manager.loadAllModelSettings();

      expect(mockFs.mkdir).toHaveBeenCalledWith(mockSettingsDir, {
        recursive: true,
      });
      expect(result).toEqual({});
    });

    it('should return empty object when directory read fails', async () => {
      const readError = ErrorFactory.permissionDenied();
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockRejectedValue(readError);

      const result = await manager.loadAllModelSettings();

      expect(result).toEqual({});
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error loading all model settings:',
        readError
      );
    });

    it('should handle directory that becomes inaccessible during operation', async () => {
      const files = ['model1.json'];
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue(files);
      mockFs.readFile.mockRejectedValue(ErrorFactory.permissionDenied());

      const result = await manager.loadAllModelSettings();

      expect(result).toEqual({});
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error loading settings for model model1:',
        expect.any(Error)
      );
    });

    it('should handle very large numbers of files', async () => {
      const files = Array.from({ length: 1000 }, (_, i) => `model${i}.json`);
      const expectedSettings = Array.from(
        { length: 1000 },
        () => validSettings
      );

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue(files);

      // Mock all file reads to return valid settings
      for (let i = 0; i < 1000; i++) {
        mockFs.readFile.mockResolvedValueOnce(JSON.stringify(validSettings));
      }

      const result = await manager.loadAllModelSettings();

      expect(Object.keys(result)).toHaveLength(1000);
      expect(mockFs.readFile).toHaveBeenCalledTimes(1000);
    });
  });

  describe('deleteModelSettings', () => {
    it('should delete existing settings file', async () => {
      mockFs.unlink.mockResolvedValue(undefined);

      await manager.deleteModelSettings('test-model');

      expect(mockFs.unlink).toHaveBeenCalledWith(
        path.join(mockSettingsDir, 'test-model.json')
      );
    });

    it('should silently succeed when file does not exist', async () => {
      const fileNotFoundError = ErrorFactory.fileNotFound();
      mockFs.unlink.mockRejectedValue(fileNotFoundError);

      await expect(
        manager.deleteModelSettings('non-existent-model')
      ).resolves.toBeUndefined();

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should handle permission denied errors', async () => {
      const permissionError = ErrorFactory.permissionDenied();
      mockFs.unlink.mockRejectedValue(permissionError);

      await expect(
        manager.deleteModelSettings('protected-model')
      ).rejects.toThrow(permissionError);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error deleting settings for model protected-model:',
        permissionError
      );
    });

    it('should handle file system errors other than ENOENT', async () => {
      const systemError = new Error('EIO: i/o error') as NodeJS.ErrnoException;
      systemError.code = 'EIO';
      mockFs.unlink.mockRejectedValue(systemError);

      await expect(
        manager.deleteModelSettings('io-error-model')
      ).rejects.toThrow(systemError);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error deleting settings for model io-error-model:',
        systemError
      );
    });

    it('should handle file in use errors', async () => {
      const fileInUseError = new Error(
        'EBUSY: resource busy or locked'
      ) as NodeJS.ErrnoException;
      fileInUseError.code = 'EBUSY';
      mockFs.unlink.mockRejectedValue(fileInUseError);

      await expect(manager.deleteModelSettings('busy-model')).rejects.toThrow(
        fileInUseError
      );
    });

    it('should delete files with special character model IDs', async () => {
      const specialModelId = 'model@with#special$characters';
      mockFs.unlink.mockResolvedValue(undefined);

      await manager.deleteModelSettings(specialModelId);

      expect(mockFs.unlink).toHaveBeenCalledWith(
        path.join(mockSettingsDir, `${specialModelId}.json`)
      );
    });
  });

  describe('cleanupModelSettings', () => {
    it('should delete settings for models not in the existing list', async () => {
      const existingFiles = [
        'model1.json',
        'model2.json',
        'model3.json',
        'readme.txt',
      ];
      const existingModelIds = ['model1', 'model3']; // model2 should be deleted

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue(existingFiles);
      mockFs.unlink.mockResolvedValue(undefined);

      await manager.cleanupModelSettings(existingModelIds);

      expect(mockFs.readdir).toHaveBeenCalledWith(mockSettingsDir);
      expect(mockFs.unlink).toHaveBeenCalledTimes(1);
      expect(mockFs.unlink).toHaveBeenCalledWith(
        path.join(mockSettingsDir, 'model2.json')
      );
    });

    it('should handle empty existing models list', async () => {
      const existingFiles = ['model1.json', 'model2.json'];
      const existingModelIds: string[] = [];

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue(existingFiles);
      mockFs.unlink.mockResolvedValue(undefined);

      await manager.cleanupModelSettings(existingModelIds);

      expect(mockFs.unlink).toHaveBeenCalledTimes(2);
      expect(mockFs.unlink).toHaveBeenCalledWith(
        path.join(mockSettingsDir, 'model1.json')
      );
      expect(mockFs.unlink).toHaveBeenCalledWith(
        path.join(mockSettingsDir, 'model2.json')
      );
    });

    it('should not delete any files when all models exist', async () => {
      const existingFiles = ['model1.json', 'model2.json'];
      const existingModelIds = ['model1', 'model2'];

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue(existingFiles);

      await manager.cleanupModelSettings(existingModelIds);

      expect(mockFs.unlink).not.toHaveBeenCalled();
    });

    it('should ignore non-JSON files during cleanup', async () => {
      const existingFiles = [
        'model1.json',
        'readme.txt',
        'model2.json',
        '.DS_Store',
      ];
      const existingModelIds = ['model1']; // Only model2.json should be deleted

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue(existingFiles);
      mockFs.unlink.mockResolvedValue(undefined);

      await manager.cleanupModelSettings(existingModelIds);

      expect(mockFs.unlink).toHaveBeenCalledTimes(1);
      expect(mockFs.unlink).toHaveBeenCalledWith(
        path.join(mockSettingsDir, 'model2.json')
      );
    });

    it('should handle directory creation if needed', async () => {
      const existingModelIds = ['model1'];

      mockFs.access.mockRejectedValue(ErrorFactory.fileNotFound());
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([]);

      await manager.cleanupModelSettings(existingModelIds);

      expect(mockFs.mkdir).toHaveBeenCalledWith(mockSettingsDir, {
        recursive: true,
      });
      expect(mockFs.readdir).toHaveBeenCalledWith(mockSettingsDir);
    });

    it('should handle cleanup failure by stopping operation', async () => {
      const existingFiles = ['model1.json', 'model2.json', 'model3.json'];
      const existingModelIds: string[] = []; // Delete all

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue(existingFiles);
      mockFs.unlink
        .mockResolvedValueOnce(undefined) // model1.json succeeds
        .mockRejectedValueOnce(ErrorFactory.permissionDenied()); // model2.json fails, should stop here

      await manager.cleanupModelSettings(existingModelIds);

      expect(mockFs.unlink).toHaveBeenCalledTimes(2);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error cleaning up model settings:',
        expect.any(Error)
      );
    });

    it('should handle directory read errors gracefully', async () => {
      const existingModelIds = ['model1'];
      const readError = ErrorFactory.permissionDenied();

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockRejectedValue(readError);

      await expect(
        manager.cleanupModelSettings(existingModelIds)
      ).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error cleaning up model settings:',
        readError
      );
    });

    it('should handle very large cleanup operations', async () => {
      const files = Array.from({ length: 1000 }, (_, i) => `model${i}.json`);
      const existingModelIds = ['model0', 'model500']; // Keep only 2 out of 1000

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue(files);
      mockFs.unlink.mockResolvedValue(undefined);

      await manager.cleanupModelSettings(existingModelIds);

      expect(mockFs.unlink).toHaveBeenCalledTimes(998); // 1000 - 2 kept
    });

    it('should handle case-sensitive model ID matching', async () => {
      const existingFiles = ['Model1.json', 'model1.json', 'MODEL1.json'];
      const existingModelIds = ['model1']; // Only exact match should be kept

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue(existingFiles);
      mockFs.unlink.mockResolvedValue(undefined);

      await manager.cleanupModelSettings(existingModelIds);

      expect(mockFs.unlink).toHaveBeenCalledTimes(2);
      expect(mockFs.unlink).toHaveBeenCalledWith(
        path.join(mockSettingsDir, 'Model1.json')
      );
      expect(mockFs.unlink).toHaveBeenCalledWith(
        path.join(mockSettingsDir, 'MODEL1.json')
      );
      expect(mockFs.unlink).not.toHaveBeenCalledWith(
        path.join(mockSettingsDir, 'model1.json')
      );
    });

    it('should handle model IDs with special characters in cleanup', async () => {
      const existingFiles = [
        'model@special.json',
        'model#hash.json',
        'normal-model.json',
      ];
      const existingModelIds = ['model@special'];

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue(existingFiles);
      mockFs.unlink.mockResolvedValue(undefined);

      await manager.cleanupModelSettings(existingModelIds);

      expect(mockFs.unlink).toHaveBeenCalledTimes(2);
      expect(mockFs.unlink).toHaveBeenCalledWith(
        path.join(mockSettingsDir, 'model#hash.json')
      );
      expect(mockFs.unlink).toHaveBeenCalledWith(
        path.join(mockSettingsDir, 'normal-model.json')
      );
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete CRUD lifecycle', async () => {
      const modelId = 'lifecycle-model';

      // Setup mocks for save operation
      mockFs.access.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      // Save settings
      await manager.saveModelSettings(modelId, validSettings);
      expect(mockFs.writeFile).toHaveBeenCalled();

      // Setup mocks for load operation
      mockFs.readFile.mockResolvedValue(JSON.stringify(validSettings));

      // Load settings
      const loaded = await manager.loadModelSettings(modelId);
      expect(loaded).toEqual(validSettings);

      // Setup mocks for delete operation
      mockFs.unlink.mockResolvedValue(undefined);

      // Delete settings
      await manager.deleteModelSettings(modelId);
      expect(mockFs.unlink).toHaveBeenCalled();

      // Verify deletion
      mockFs.readFile.mockRejectedValue(ErrorFactory.fileNotFound());
      const afterDelete = await manager.loadModelSettings(modelId);
      expect(afterDelete).toBeNull();
    });

    it('should handle concurrent operations on different models', async () => {
      const models = ['model1', 'model2', 'model3'];
      const settings = [validSettings, minimalSettings, emptySettings];

      mockFs.access.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      // Simulate concurrent saves
      const savePromises = models.map((modelId, index) =>
        manager.saveModelSettings(modelId, settings[index])
      );

      await Promise.all(savePromises);

      expect(mockFs.writeFile).toHaveBeenCalledTimes(3);
    });

    it('should handle recovery from corrupted directory state', async () => {
      // Simulate directory corruption/recreation scenario
      mockFs.access
        .mockRejectedValueOnce(ErrorFactory.fileNotFound()) // First call fails
        .mockResolvedValue(undefined); // Subsequent calls succeed

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      await manager.saveModelSettings('recovery-model', validSettings);

      expect(mockFs.mkdir).toHaveBeenCalledWith(mockSettingsDir, {
        recursive: true,
      });
      expect(mockFs.writeFile).toHaveBeenCalled();
    });
  });

  describe('Error Resilience', () => {
    it('should handle intermittent network drive failures', async () => {
      const networkError = new Error(
        'Network path not found'
      ) as NodeJS.ErrnoException;
      networkError.code = 'ENONET';

      mockFs.writeFile.mockRejectedValue(networkError);

      await expect(
        manager.saveModelSettings('network-model', validSettings)
      ).rejects.toThrow(networkError);
    });

    it('should handle system shutdown during file operations', async () => {
      const shutdownError = new Error(
        'System shutdown in progress'
      ) as NodeJS.ErrnoException;
      shutdownError.code = 'ESHUTDOWN';

      mockFs.readFile.mockRejectedValue(shutdownError);

      await expect(manager.loadModelSettings('shutdown-model')).rejects.toThrow(
        shutdownError
      );
    });

    it('should handle unicode and international characters in model IDs', async () => {
      const unicodeModelId = 'модель-中文-🚀-émoji';

      mockFs.access.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      await manager.saveModelSettings(unicodeModelId, validSettings);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join(mockSettingsDir, `${unicodeModelId}.json`),
        JSON.stringify(validSettings, null, 2)
      );
    });
  });

  describe('Performance Scenarios', () => {
    it('should handle rapid successive operations', async () => {
      const operations = 100;
      const promises: Promise<void>[] = [];

      mockFs.access.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(validSettings));

      // Create rapid save/load operations
      for (let i = 0; i < operations; i++) {
        promises.push(
          manager
            .saveModelSettings(`rapid-model-${i}`, validSettings)
            .then(() => manager.loadModelSettings(`rapid-model-${i}`))
            .then(() => {})
        );
      }

      await Promise.all(promises);

      expect(mockFs.writeFile).toHaveBeenCalledTimes(operations);
      expect(mockFs.readFile).toHaveBeenCalledTimes(operations);
    });
  });

  describe('Singleton Export', () => {
    it('should export a singleton instance', async () => {
      const { modelSettingsManager } = await import(
        '../../utils/modelSettingsManager.js'
      );

      expect(modelSettingsManager).toBeInstanceOf(ModelSettingsManager);

      // Verify it's the same instance on repeated imports
      const { modelSettingsManager: secondImport } = await import(
        '../../utils/modelSettingsManager.js'
      );
      expect(modelSettingsManager).toBe(secondImport);
    });
  });
});
