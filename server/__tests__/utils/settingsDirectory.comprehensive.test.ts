import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  getMindstrikeDirectory,
  getLLMConfigDirectory,
  getLocalModelsDirectory,
  getLocalModelSettingsDirectory,
  getHomeDirectory,
  getWorkspaceRoot,
  setWorkspaceRoot,
  getMusicRoot,
  setMusicRoot,
  getWorkspaceRoots,
  setWorkspaceRoots,
} from '../../utils/settingsDirectory.js';
import {
  ErrorFactory,
  MockFactories,
  TestUtils,
} from '../fixtures/testData.js';

// Mock the modules
vi.mock('os');
vi.mock('path');
vi.mock('fs/promises');

// Type the mocked modules
const mockOs = vi.mocked(os);
const mockPath = vi.mocked(path);
const mockFs = vi.mocked(fs);

describe('settingsDirectory utilities', () => {
  // Store original environment variables
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.clearAllMocks();

    // Store and clear environment variables
    originalEnv = { ...process.env };

    // Setup default mocks
    mockPath.join.mockImplementation((...args) => args.join('/'));
    mockOs.homedir.mockReturnValue('/home/user');
  });

  afterEach(() => {
    // Restore environment variables
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('getMindstrikeDirectory', () => {
    describe('Windows platform (win32)', () => {
      beforeEach(() => {
        mockOs.platform.mockReturnValue('win32');
      });

      it('should use APPDATA environment variable when available', () => {
        process.env.APPDATA = 'C:\\Users\\User\\AppData\\Roaming';

        const result = getMindstrikeDirectory();

        expect(mockPath.join).toHaveBeenCalledWith(
          'C:\\Users\\User\\AppData\\Roaming',
          'mindstrike'
        );
        expect(result).toBe('C:\\Users\\User\\AppData\\Roaming/mindstrike');
      });

      it('should fall back to user profile when APPDATA is not available', () => {
        delete process.env.APPDATA;
        mockOs.homedir.mockReturnValue('C:\\Users\\User');

        const result = getMindstrikeDirectory();

        expect(mockPath.join).toHaveBeenCalledWith(
          'C:\\Users\\User',
          'AppData',
          'Roaming',
          'mindstrike'
        );
        expect(result).toBe('C:\\Users\\User/AppData/Roaming/mindstrike');
      });

      it('should handle empty APPDATA environment variable', () => {
        process.env.APPDATA = '';
        mockOs.homedir.mockReturnValue('C:\\Users\\User');

        const result = getMindstrikeDirectory();

        expect(mockPath.join).toHaveBeenCalledWith(
          'C:\\Users\\User',
          'AppData',
          'Roaming',
          'mindstrike'
        );
        expect(result).toBe('C:\\Users\\User/AppData/Roaming/mindstrike');
      });

      it('should handle spaces in Windows paths', () => {
        process.env.APPDATA = 'C:\\Users\\User Name\\AppData\\Roaming';

        const result = getMindstrikeDirectory();

        expect(mockPath.join).toHaveBeenCalledWith(
          'C:\\Users\\User Name\\AppData\\Roaming',
          'mindstrike'
        );
        expect(result).toBe(
          'C:\\Users\\User Name\\AppData\\Roaming/mindstrike'
        );
      });
    });

    describe('Unix/Linux/macOS platforms', () => {
      const unixPlatforms = [
        'darwin',
        'linux',
        'freebsd',
        'openbsd',
        'sunos',
        'aix',
      ] as const;

      unixPlatforms.forEach(platform => {
        it(`should use ~/.mindstrike on ${platform}`, () => {
          mockOs.platform.mockReturnValue(platform);
          mockOs.homedir.mockReturnValue('/Users/testuser');

          const result = getMindstrikeDirectory();

          expect(mockPath.join).toHaveBeenCalledWith(
            '/Users/testuser',
            '.mindstrike'
          );
          expect(result).toBe('/Users/testuser/.mindstrike');
        });
      });

      it('should handle paths with spaces on Unix systems', () => {
        mockOs.platform.mockReturnValue('darwin');
        mockOs.homedir.mockReturnValue('/Users/Test User');

        const result = getMindstrikeDirectory();

        expect(mockPath.join).toHaveBeenCalledWith(
          '/Users/Test User',
          '.mindstrike'
        );
        expect(result).toBe('/Users/Test User/.mindstrike');
      });

      it('should handle root user home directory', () => {
        mockOs.platform.mockReturnValue('linux');
        mockOs.homedir.mockReturnValue('/root');

        const result = getMindstrikeDirectory();

        expect(mockPath.join).toHaveBeenCalledWith('/root', '.mindstrike');
        expect(result).toBe('/root/.mindstrike');
      });
    });

    describe('edge cases', () => {
      it('should handle unknown platform as Unix-like', () => {
        mockOs.platform.mockReturnValue('unknown' as NodeJS.Platform);
        mockOs.homedir.mockReturnValue('/home/user');

        const result = getMindstrikeDirectory();

        expect(mockPath.join).toHaveBeenCalledWith('/home/user', '.mindstrike');
        expect(result).toBe('/home/user/.mindstrike');
      });

      it('should handle empty home directory', () => {
        mockOs.platform.mockReturnValue('linux');
        mockOs.homedir.mockReturnValue('');

        const result = getMindstrikeDirectory();

        expect(mockPath.join).toHaveBeenCalledWith('', '.mindstrike');
        expect(result).toBe('/.mindstrike');
      });
    });
  });

  describe('directory-specific functions', () => {
    beforeEach(() => {
      mockOs.platform.mockReturnValue('linux');
      mockOs.homedir.mockReturnValue('/home/user');
    });

    describe('getLLMConfigDirectory', () => {
      it('should return llm-config subdirectory within mindstrike directory', () => {
        const result = getLLMConfigDirectory();

        expect(mockPath.join).toHaveBeenCalledWith(
          '/home/user/.mindstrike',
          'llm-config'
        );
        expect(result).toBe('/home/user/.mindstrike/llm-config');
      });
    });

    describe('getLocalModelsDirectory', () => {
      it('should return local-models subdirectory within mindstrike directory', () => {
        const result = getLocalModelsDirectory();

        expect(mockPath.join).toHaveBeenCalledWith(
          '/home/user/.mindstrike',
          'local-models'
        );
        expect(result).toBe('/home/user/.mindstrike/local-models');
      });
    });

    describe('getLocalModelSettingsDirectory', () => {
      it('should return model-settings subdirectory within mindstrike directory', () => {
        const result = getLocalModelSettingsDirectory();

        expect(mockPath.join).toHaveBeenCalledWith(
          '/home/user/.mindstrike',
          'model-settings'
        );
        expect(result).toBe('/home/user/.mindstrike/model-settings');
      });
    });
  });

  describe('getHomeDirectory', () => {
    beforeEach(() => {
      // Clear all environment variables
      delete process.env.HOME;
      delete process.env.USERPROFILE;
      delete process.env.HOMEDRIVE;
      delete process.env.HOMEPATH;
    });

    it('should use HOME environment variable first (Unix/Linux/macOS)', () => {
      process.env.HOME = '/Users/testuser';

      const result = getHomeDirectory();

      expect(result).toBe('/Users/testuser');
      expect(mockOs.homedir).not.toHaveBeenCalled();
    });

    it('should use USERPROFILE environment variable (Windows)', () => {
      process.env.USERPROFILE = 'C:\\Users\\TestUser';

      const result = getHomeDirectory();

      expect(result).toBe('C:\\Users\\TestUser');
      expect(mockOs.homedir).not.toHaveBeenCalled();
    });

    it('should use HOMEDRIVE + HOMEPATH combination (Windows fallback)', () => {
      process.env.HOMEDRIVE = 'C:';
      process.env.HOMEPATH = '\\Users\\TestUser';

      const result = getHomeDirectory();

      expect(mockPath.join).toHaveBeenCalledWith('C:', '\\Users\\TestUser');
      expect(result).toBe('C:/\\Users\\TestUser');
      expect(mockOs.homedir).not.toHaveBeenCalled();
    });

    it('should fall back to os.homedir() when no environment variables are set', () => {
      mockOs.homedir.mockReturnValue('/fallback/home');

      const result = getHomeDirectory();

      expect(result).toBe('/fallback/home');
      expect(mockOs.homedir).toHaveBeenCalled();
    });

    it('should prefer HOME over USERPROFILE when both are set', () => {
      process.env.HOME = '/unix/home';
      process.env.USERPROFILE = 'C:\\Windows\\Home';

      const result = getHomeDirectory();

      expect(result).toBe('/unix/home');
    });

    it('should prefer USERPROFILE over HOMEDRIVE+HOMEPATH when both are set', () => {
      process.env.USERPROFILE = 'C:\\Users\\Profile';
      process.env.HOMEDRIVE = 'D:';
      process.env.HOMEPATH = '\\Users\\Path';

      const result = getHomeDirectory();

      expect(result).toBe('C:\\Users\\Profile');
    });

    it('should skip HOMEDRIVE+HOMEPATH if only one is set', () => {
      process.env.HOMEDRIVE = 'C:';
      // HOMEPATH is not set
      mockOs.homedir.mockReturnValue('/fallback');

      const result = getHomeDirectory();

      expect(result).toBe('/fallback');
      expect(mockPath.join).not.toHaveBeenCalled();
    });

    it('should handle empty environment variables', () => {
      process.env.HOME = '';
      process.env.USERPROFILE = '';
      process.env.HOMEDRIVE = '';
      process.env.HOMEPATH = '';
      mockOs.homedir.mockReturnValue('/empty/fallback');

      const result = getHomeDirectory();

      expect(result).toBe('/empty/fallback');
    });

    it('should handle paths with spaces and special characters', () => {
      process.env.HOME = '/Users/Test User/Documents & Settings';

      const result = getHomeDirectory();

      expect(result).toBe('/Users/Test User/Documents & Settings');
    });
  });

  describe('workspace configuration management', () => {
    let mockConfigPath: string;

    beforeEach(() => {
      mockOs.platform.mockReturnValue('linux');
      mockOs.homedir.mockReturnValue('/home/user');
      mockConfigPath = '/home/user/.mindstrike/workspace-roots.json';
    });

    describe('getWorkspaceRoot', () => {
      it('should return workspace root from configuration file', async () => {
        const mockConfig = JSON.stringify({ workspaceRoot: '/workspace/path' });
        mockFs.readFile.mockResolvedValue(mockConfig);

        const result = await getWorkspaceRoot();

        expect(mockFs.readFile).toHaveBeenCalledWith(mockConfigPath, 'utf8');
        expect(result).toBe('/workspace/path');
      });

      it('should return undefined when workspace root is not set', async () => {
        const mockConfig = JSON.stringify({ otherSetting: 'value' });
        mockFs.readFile.mockResolvedValue(mockConfig);

        const result = await getWorkspaceRoot();

        expect(result).toBeUndefined();
      });

      it('should return undefined when config file does not exist', async () => {
        mockFs.readFile.mockRejectedValue(
          ErrorFactory.fileNotFound(mockConfigPath)
        );

        const result = await getWorkspaceRoot();

        expect(result).toBeUndefined();
      });

      it('should return undefined when config file has invalid JSON', async () => {
        mockFs.readFile.mockResolvedValue('invalid json{');

        const result = await getWorkspaceRoot();

        expect(result).toBeUndefined();
      });

      it('should handle permission denied errors gracefully', async () => {
        mockFs.readFile.mockRejectedValue(
          ErrorFactory.permissionDenied(mockConfigPath)
        );

        const result = await getWorkspaceRoot();

        expect(result).toBeUndefined();
      });

      it('should handle empty configuration file', async () => {
        mockFs.readFile.mockResolvedValue('{}');

        const result = await getWorkspaceRoot();

        expect(result).toBeUndefined();
      });

      it('should handle null workspace root value', async () => {
        const mockConfig = JSON.stringify({ workspaceRoot: null });
        mockFs.readFile.mockResolvedValue(mockConfig);

        const result = await getWorkspaceRoot();

        expect(result).toBeNull();
      });
    });

    describe('setWorkspaceRoot', () => {
      beforeEach(() => {
        mockFs.access.mockRejectedValue(new Error('Directory does not exist'));
        mockFs.mkdir.mockResolvedValue(undefined);
        mockFs.writeFile.mockResolvedValue(undefined);
      });

      it('should create mindstrike directory and save workspace root', async () => {
        const workspaceRoot = '/new/workspace';
        mockFs.readFile.mockRejectedValue(
          ErrorFactory.fileNotFound(mockConfigPath)
        );

        await setWorkspaceRoot(workspaceRoot);

        expect(mockFs.mkdir).toHaveBeenCalledWith('/home/user/.mindstrike', {
          recursive: true,
        });
        expect(mockFs.writeFile).toHaveBeenCalledWith(
          mockConfigPath,
          JSON.stringify({ workspaceRoot }, null, 2)
        );
      });

      it('should merge with existing configuration', async () => {
        const existingConfig = JSON.stringify({
          otherSetting: 'value',
          oldWorkspaceRoot: '/old',
        });
        mockFs.readFile.mockResolvedValue(existingConfig);

        await setWorkspaceRoot('/new/workspace');

        expect(mockFs.writeFile).toHaveBeenCalledWith(
          mockConfigPath,
          JSON.stringify(
            {
              otherSetting: 'value',
              oldWorkspaceRoot: '/old',
              workspaceRoot: '/new/workspace',
            },
            null,
            2
          )
        );
      });

      it('should handle invalid JSON in existing config gracefully', async () => {
        mockFs.readFile.mockResolvedValue('invalid json{');

        await setWorkspaceRoot('/workspace');

        expect(mockFs.writeFile).toHaveBeenCalledWith(
          mockConfigPath,
          JSON.stringify({ workspaceRoot: '/workspace' }, null, 2)
        );
      });

      it('should set undefined workspace root', async () => {
        mockFs.readFile.mockRejectedValue(
          ErrorFactory.fileNotFound(mockConfigPath)
        );

        await setWorkspaceRoot(undefined);

        expect(mockFs.writeFile).toHaveBeenCalledWith(
          mockConfigPath,
          JSON.stringify({ workspaceRoot: undefined }, null, 2)
        );
      });

      it('should handle directory creation errors', async () => {
        mockFs.mkdir.mockRejectedValue(
          ErrorFactory.permissionDenied('/home/user/.mindstrike')
        );

        await expect(setWorkspaceRoot('/workspace')).rejects.toThrow(
          'permission denied'
        );
      });

      it('should handle write file errors', async () => {
        mockFs.readFile.mockRejectedValue(
          ErrorFactory.fileNotFound(mockConfigPath)
        );
        mockFs.writeFile.mockRejectedValue(
          ErrorFactory.permissionDenied(mockConfigPath)
        );

        await expect(setWorkspaceRoot('/workspace')).rejects.toThrow(
          'permission denied'
        );
      });

      it('should skip directory creation if directory already exists', async () => {
        mockFs.access.mockResolvedValue(undefined); // Directory exists
        mockFs.readFile.mockRejectedValue(
          ErrorFactory.fileNotFound(mockConfigPath)
        );

        await setWorkspaceRoot('/workspace');

        expect(mockFs.mkdir).not.toHaveBeenCalled();
        expect(mockFs.writeFile).toHaveBeenCalled();
      });
    });

    describe('getMusicRoot', () => {
      it('should return music root from configuration file', async () => {
        const mockConfig = JSON.stringify({ musicRoot: '/music/path' });
        mockFs.readFile.mockResolvedValue(mockConfig);

        const result = await getMusicRoot();

        expect(mockFs.readFile).toHaveBeenCalledWith(mockConfigPath, 'utf8');
        expect(result).toBe('/music/path');
      });

      it('should return undefined when music root is not set', async () => {
        const mockConfig = JSON.stringify({ workspaceRoot: '/workspace' });
        mockFs.readFile.mockResolvedValue(mockConfig);

        const result = await getMusicRoot();

        expect(result).toBeUndefined();
      });

      it('should return undefined when config file does not exist', async () => {
        mockFs.readFile.mockRejectedValue(
          ErrorFactory.fileNotFound(mockConfigPath)
        );

        const result = await getMusicRoot();

        expect(result).toBeUndefined();
      });

      it('should handle invalid JSON gracefully', async () => {
        mockFs.readFile.mockResolvedValue('invalid json{');

        const result = await getMusicRoot();

        expect(result).toBeUndefined();
      });
    });

    describe('setMusicRoot', () => {
      beforeEach(() => {
        mockFs.access.mockRejectedValue(new Error('Directory does not exist'));
        mockFs.mkdir.mockResolvedValue(undefined);
        mockFs.writeFile.mockResolvedValue(undefined);
      });

      it('should create mindstrike directory and save music root', async () => {
        const musicRoot = '/new/music';
        mockFs.readFile.mockRejectedValue(
          ErrorFactory.fileNotFound(mockConfigPath)
        );

        await setMusicRoot(musicRoot);

        expect(mockFs.mkdir).toHaveBeenCalledWith('/home/user/.mindstrike', {
          recursive: true,
        });
        expect(mockFs.writeFile).toHaveBeenCalledWith(
          mockConfigPath,
          JSON.stringify({ musicRoot }, null, 2)
        );
      });

      it('should merge with existing configuration', async () => {
        const existingConfig = JSON.stringify({ workspaceRoot: '/workspace' });
        mockFs.readFile.mockResolvedValue(existingConfig);

        await setMusicRoot('/music');

        expect(mockFs.writeFile).toHaveBeenCalledWith(
          mockConfigPath,
          JSON.stringify(
            {
              workspaceRoot: '/workspace',
              musicRoot: '/music',
            },
            null,
            2
          )
        );
      });

      it('should set undefined music root', async () => {
        const existingConfig = JSON.stringify({ musicRoot: '/old/music' });
        mockFs.readFile.mockResolvedValue(existingConfig);

        await setMusicRoot(undefined);

        expect(mockFs.writeFile).toHaveBeenCalledWith(
          mockConfigPath,
          JSON.stringify({ musicRoot: undefined }, null, 2)
        );
      });
    });

    describe('getWorkspaceRoots', () => {
      it('should return workspace roots array from configuration file', async () => {
        const mockConfig = JSON.stringify({
          workspaceRoots: ['/workspace1', '/workspace2'],
        });
        mockFs.readFile.mockResolvedValue(mockConfig);

        const result = await getWorkspaceRoots();

        expect(mockFs.readFile).toHaveBeenCalledWith(mockConfigPath, 'utf8');
        expect(result).toEqual(['/workspace1', '/workspace2']);
      });

      it('should return empty array when workspace roots is not set', async () => {
        const mockConfig = JSON.stringify({ workspaceRoot: '/workspace' });
        mockFs.readFile.mockResolvedValue(mockConfig);

        const result = await getWorkspaceRoots();

        expect(result).toEqual([]);
      });

      it('should return empty array when workspace roots is null', async () => {
        const mockConfig = JSON.stringify({ workspaceRoots: null });
        mockFs.readFile.mockResolvedValue(mockConfig);

        const result = await getWorkspaceRoots();

        expect(result).toEqual([]);
      });

      it('should return empty array when config file does not exist', async () => {
        mockFs.readFile.mockRejectedValue(
          ErrorFactory.fileNotFound(mockConfigPath)
        );

        const result = await getWorkspaceRoots();

        expect(result).toEqual([]);
      });

      it('should handle invalid JSON gracefully', async () => {
        mockFs.readFile.mockResolvedValue('invalid json{');

        const result = await getWorkspaceRoots();

        expect(result).toEqual([]);
      });

      it('should handle empty workspace roots array', async () => {
        const mockConfig = JSON.stringify({ workspaceRoots: [] });
        mockFs.readFile.mockResolvedValue(mockConfig);

        const result = await getWorkspaceRoots();

        expect(result).toEqual([]);
      });
    });

    describe('setWorkspaceRoots', () => {
      beforeEach(() => {
        mockFs.access.mockRejectedValue(new Error('Directory does not exist'));
        mockFs.mkdir.mockResolvedValue(undefined);
        mockFs.writeFile.mockResolvedValue(undefined);
      });

      it('should create mindstrike directory and save workspace roots', async () => {
        const workspaceRoots = ['/workspace1', '/workspace2'];
        mockFs.readFile.mockRejectedValue(
          ErrorFactory.fileNotFound(mockConfigPath)
        );

        await setWorkspaceRoots(workspaceRoots);

        expect(mockFs.mkdir).toHaveBeenCalledWith('/home/user/.mindstrike', {
          recursive: true,
        });
        expect(mockFs.writeFile).toHaveBeenCalledWith(
          mockConfigPath,
          JSON.stringify({ workspaceRoots }, null, 2)
        );
      });

      it('should merge with existing configuration', async () => {
        const existingConfig = JSON.stringify({
          workspaceRoot: '/main',
          musicRoot: '/music',
        });
        mockFs.readFile.mockResolvedValue(existingConfig);

        await setWorkspaceRoots(['/workspace1', '/workspace2']);

        expect(mockFs.writeFile).toHaveBeenCalledWith(
          mockConfigPath,
          JSON.stringify(
            {
              workspaceRoot: '/main',
              musicRoot: '/music',
              workspaceRoots: ['/workspace1', '/workspace2'],
            },
            null,
            2
          )
        );
      });

      it('should handle empty workspace roots array', async () => {
        mockFs.readFile.mockRejectedValue(
          ErrorFactory.fileNotFound(mockConfigPath)
        );

        await setWorkspaceRoots([]);

        expect(mockFs.writeFile).toHaveBeenCalledWith(
          mockConfigPath,
          JSON.stringify({ workspaceRoots: [] }, null, 2)
        );
      });

      it('should handle workspace roots with special characters', async () => {
        const specialRoots = [
          '/workspace with spaces',
          '/workspace-with-dashes',
          '/workspace_with_underscores',
        ];
        mockFs.readFile.mockRejectedValue(
          ErrorFactory.fileNotFound(mockConfigPath)
        );

        await setWorkspaceRoots(specialRoots);

        expect(mockFs.writeFile).toHaveBeenCalledWith(
          mockConfigPath,
          JSON.stringify({ workspaceRoots: specialRoots }, null, 2)
        );
      });

      it('should replace existing workspace roots array', async () => {
        const existingConfig = JSON.stringify({
          workspaceRoots: ['/old1', '/old2'],
        });
        mockFs.readFile.mockResolvedValue(existingConfig);

        await setWorkspaceRoots(['/new1', '/new2', '/new3']);

        expect(mockFs.writeFile).toHaveBeenCalledWith(
          mockConfigPath,
          JSON.stringify(
            { workspaceRoots: ['/new1', '/new2', '/new3'] },
            null,
            2
          )
        );
      });
    });

    describe('directory creation and error handling', () => {
      it('should handle mkdir permission errors during ensureMindstrikeDirectory', async () => {
        mockFs.access.mockRejectedValue(new Error('Directory does not exist'));
        mockFs.mkdir.mockRejectedValue(
          ErrorFactory.permissionDenied('/home/user/.mindstrike')
        );

        await expect(setWorkspaceRoot('/workspace')).rejects.toThrow(
          'permission denied'
        );
        expect(mockFs.mkdir).toHaveBeenCalledWith('/home/user/.mindstrike', {
          recursive: true,
        });
      });

      it('should handle filesystem errors during directory check', async () => {
        mockFs.access.mockRejectedValue(
          ErrorFactory.permissionDenied('/home/user/.mindstrike')
        );
        mockFs.mkdir.mockResolvedValue(undefined);

        await setWorkspaceRoot('/workspace');

        // Should still try to create directory since access failed
        expect(mockFs.mkdir).toHaveBeenCalled();
      });

      it('should handle concurrent directory creation', async () => {
        let accessCallCount = 0;
        mockFs.access.mockImplementation(() => {
          accessCallCount++;
          if (accessCallCount === 1) {
            return Promise.reject(new Error('Directory does not exist'));
          }
          return Promise.resolve(undefined);
        });

        mockFs.mkdir.mockResolvedValue(undefined);
        mockFs.readFile.mockRejectedValue(
          ErrorFactory.fileNotFound(mockConfigPath)
        );

        await setWorkspaceRoot('/workspace');

        expect(mockFs.mkdir).toHaveBeenCalledTimes(1);
      });
    });

    describe('JSON handling edge cases', () => {
      it('should handle extremely large configuration files', async () => {
        const largeConfig = {
          workspaceRoots: Array(10000)
            .fill(0)
            .map((_, i) => `/workspace${i}`),
          otherData: 'x'.repeat(100000),
        };
        mockFs.readFile.mockResolvedValue(JSON.stringify(largeConfig));

        const result = await getWorkspaceRoots();

        expect(result).toHaveLength(10000);
        expect(result[0]).toBe('/workspace0');
        expect(result[9999]).toBe('/workspace9999');
      });

      it('should handle configuration with null values', async () => {
        const config = {
          workspaceRoot: null,
          musicRoot: null,
          workspaceRoots: null,
          someOtherField: 'value',
        };
        mockFs.readFile.mockResolvedValue(JSON.stringify(config));

        const workspaceRoot = await getWorkspaceRoot();
        const musicRoot = await getMusicRoot();
        const workspaceRoots = await getWorkspaceRoots();

        expect(workspaceRoot).toBeNull();
        expect(musicRoot).toBeNull();
        expect(workspaceRoots).toEqual([]);
      });

      it('should handle configuration with undefined values serialized as null', async () => {
        const config = JSON.stringify({
          workspaceRoot: undefined,
          musicRoot: undefined,
        }); // JSON.stringify converts undefined to null/omits the key

        mockFs.readFile.mockResolvedValue(
          '{"workspaceRoot":null,"musicRoot":null}'
        );

        const workspaceRoot = await getWorkspaceRoot();
        const musicRoot = await getMusicRoot();

        expect(workspaceRoot).toBeNull();
        expect(musicRoot).toBeNull();
      });

      it('should handle malformed JSON with syntax errors', async () => {
        const malformedConfigs = [
          '{"workspaceRoot": /invalid/path}', // Invalid path syntax
          '{"workspaceRoot": "path"', // Missing closing brace
          '{workspaceRoot: "path"}', // Missing quotes on key
          '{"workspaceRoot": "path",}', // Trailing comma
        ];

        for (const config of malformedConfigs) {
          mockFs.readFile.mockResolvedValue(config);

          const result = await getWorkspaceRoot();
          expect(result).toBeUndefined();
        }
      });
    });
  });

  describe('cross-platform integration tests', () => {
    const testPlatforms = [
      {
        name: 'Windows with APPDATA',
        platform: 'win32' as NodeJS.Platform,
        env: { APPDATA: 'C:\\Users\\User\\AppData\\Roaming' },
        expectedBase: 'C:\\Users\\User\\AppData\\Roaming/mindstrike',
      },
      {
        name: 'Windows fallback',
        platform: 'win32' as NodeJS.Platform,
        env: {},
        homedir: 'C:\\Users\\User',
        expectedBase: 'C:\\Users\\User/AppData/Roaming/mindstrike',
      },
      {
        name: 'macOS',
        platform: 'darwin' as NodeJS.Platform,
        env: {},
        homedir: '/Users/user',
        expectedBase: '/Users/user/.mindstrike',
      },
      {
        name: 'Linux',
        platform: 'linux' as NodeJS.Platform,
        env: {},
        homedir: '/home/user',
        expectedBase: '/home/user/.mindstrike',
      },
    ];

    testPlatforms.forEach(({ name, platform, env, homedir, expectedBase }) => {
      describe(name, () => {
        beforeEach(() => {
          mockOs.platform.mockReturnValue(platform);
          if (homedir) {
            mockOs.homedir.mockReturnValue(homedir);
          }
          Object.assign(process.env, env);
        });

        it('should return correct base directory', () => {
          const result = getMindstrikeDirectory();
          expect(result).toBe(expectedBase);
        });

        it('should return correct subdirectories', () => {
          expect(getLLMConfigDirectory()).toBe(`${expectedBase}/llm-config`);
          expect(getLocalModelsDirectory()).toBe(
            `${expectedBase}/local-models`
          );
          expect(getLocalModelSettingsDirectory()).toBe(
            `${expectedBase}/model-settings`
          );
        });

        it('should handle workspace configuration correctly', async () => {
          const workspaceRoot = '/test/workspace';
          const configPath = `${expectedBase}/workspace-roots.json`;

          mockFs.access.mockRejectedValue(
            new Error('Directory does not exist')
          );
          mockFs.mkdir.mockResolvedValue(undefined);
          mockFs.writeFile.mockResolvedValue(undefined);
          mockFs.readFile.mockRejectedValue(
            ErrorFactory.fileNotFound(configPath)
          );

          await setWorkspaceRoot(workspaceRoot);

          expect(mockFs.mkdir).toHaveBeenCalledWith(expectedBase, {
            recursive: true,
          });
          expect(mockFs.writeFile).toHaveBeenCalledWith(
            configPath,
            JSON.stringify({ workspaceRoot }, null, 2)
          );
        });
      });
    });
  });

  describe('performance and stress tests', () => {
    beforeEach(() => {
      mockOs.platform.mockReturnValue('linux');
      mockOs.homedir.mockReturnValue('/home/user');
    });

    it('should handle multiple concurrent configuration reads', async () => {
      const mockConfig = JSON.stringify({
        workspaceRoot: '/workspace',
        musicRoot: '/music',
        workspaceRoots: ['/ws1', '/ws2'],
      });
      mockFs.readFile.mockResolvedValue(mockConfig);

      const promises = await Promise.allSettled([
        getWorkspaceRoot(),
        getMusicRoot(),
        getWorkspaceRoots(),
        getWorkspaceRoot(),
        getMusicRoot(),
      ]);

      // All should succeed
      promises.forEach(result => {
        expect(result.status).toBe('fulfilled');
      });

      // Verify results
      expect(promises[0].status === 'fulfilled' && promises[0].value).toBe(
        '/workspace'
      );
      expect(promises[1].status === 'fulfilled' && promises[1].value).toBe(
        '/music'
      );
      expect(promises[2].status === 'fulfilled' && promises[2].value).toEqual([
        '/ws1',
        '/ws2',
      ]);
    });

    it('should handle rapid sequential writes without corruption', async () => {
      mockFs.access.mockRejectedValue(new Error('Directory does not exist'));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readFile.mockRejectedValue(ErrorFactory.fileNotFound());

      let writeCallCount = 0;
      const writeCalls: Array<{ path: string; content: string }> = [];

      mockFs.writeFile.mockImplementation(
        async (path: string, content: string) => {
          writeCallCount++;
          writeCalls.push({ path: path as string, content: content as string });
          // Simulate some async delay
          await TestUtils.delay(1);
          return undefined;
        }
      );

      // Perform rapid sequential writes
      await Promise.all([
        setWorkspaceRoot('/workspace1'),
        setMusicRoot('/music1'),
        setWorkspaceRoots(['/ws1', '/ws2']),
      ]);

      expect(writeCallCount).toBe(3);
      expect(writeCalls).toHaveLength(3);

      // Each write should be to the same config file but with different content
      writeCalls.forEach(call => {
        expect(call.path).toBe('/home/user/.mindstrike/workspace-roots.json');
        expect(() => JSON.parse(call.content)).not.toThrow();
      });
    });

    it('should handle very long path names', async () => {
      const longPath = '/very/long/path/'.repeat(50) + 'workspace';
      mockFs.access.mockRejectedValue(new Error('Directory does not exist'));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readFile.mockRejectedValue(ErrorFactory.fileNotFound());

      await setWorkspaceRoot(longPath);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '/home/user/.mindstrike/workspace-roots.json',
        JSON.stringify({ workspaceRoot: longPath }, null, 2)
      );
    });
  });

  describe('error recovery and resilience', () => {
    beforeEach(() => {
      mockOs.platform.mockReturnValue('linux');
      mockOs.homedir.mockReturnValue('/home/user');
    });

    it('should recover from temporary filesystem errors', async () => {
      // First call fails, second succeeds
      let readCallCount = 0;
      mockFs.readFile.mockImplementation(async () => {
        readCallCount++;
        if (readCallCount === 1) {
          throw ErrorFactory.permissionDenied();
        }
        return JSON.stringify({ workspaceRoot: '/workspace' });
      });

      // First call should fail gracefully
      const result1 = await getWorkspaceRoot();
      expect(result1).toBeUndefined();

      // Second call should succeed
      const result2 = await getWorkspaceRoot();
      expect(result2).toBe('/workspace');
    });

    it('should handle partial writes and cleanup', async () => {
      mockFs.access.mockRejectedValue(new Error('Directory does not exist'));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readFile.mockRejectedValue(ErrorFactory.fileNotFound());
      mockFs.writeFile.mockRejectedValue(ErrorFactory.permissionDenied());

      await expect(setWorkspaceRoot('/workspace')).rejects.toThrow(
        'permission denied'
      );

      // Should have attempted to create directory
      expect(mockFs.mkdir).toHaveBeenCalled();
    });

    it('should handle corrupted configuration files', async () => {
      const corruptedConfigs = [
        '', // Empty file
        '   ', // Whitespace only
        '\0\0\0', // Binary data
        '{"key": "value"'.repeat(1000), // Repeated partial JSON
      ];

      for (const config of corruptedConfigs) {
        mockFs.readFile.mockResolvedValue(config);

        const result = await getWorkspaceRoot();
        expect(result).toBeUndefined();
      }
    });
  });
});
