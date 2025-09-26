import { Test, TestingModule } from '@nestjs/testing';
import type { ConfigService } from '@nestjs/config';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkspaceFileService } from './workspace-file.service';
import * as fs from 'fs/promises';
import * as path from 'path';

vi.mock('fs/promises');

describe('WorkspaceFileService', () => {
  let service: WorkspaceFileService;
  let configService: Partial<ConfigService>;
  const mockWorkspaceRoot = '/test/workspace';

  beforeEach(async () => {
    // Create mock ConfigService
    configService = {
      get: vi.fn().mockReturnValue(mockWorkspaceRoot),
    };

    // Directly instantiate the service
    service = new WorkspaceFileService(configService as ConfigService);

    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should use workspace root from config', () => {
      // Service constructor calls get('WORKSPACE_ROOT')
      // Create a new service instance to test the constructor
      const newConfigService = {
        get: vi.fn().mockReturnValue('/new/workspace'),
      };
      const newService = new WorkspaceFileService(
        newConfigService as ConfigService
      );

      expect(newConfigService.get).toHaveBeenCalledWith('WORKSPACE_ROOT');
      expect(newService).toBeDefined();
    });
  });

  describe('listFiles', () => {
    it('should list files in directory', async () => {
      const mockDirents = [
        {
          name: 'file1.txt',
          isDirectory: () => false,
          isFile: () => true,
          isBlockDevice: () => false,
          isCharacterDevice: () => false,
          isFIFO: () => false,
          isSocket: () => false,
          isSymbolicLink: () => false,
        },
        {
          name: 'file2.js',
          isDirectory: () => false,
          isFile: () => true,
          isBlockDevice: () => false,
          isCharacterDevice: () => false,
          isFIFO: () => false,
          isSocket: () => false,
          isSymbolicLink: () => false,
        },
        {
          name: 'folder',
          isDirectory: () => true,
          isFile: () => false,
          isBlockDevice: () => false,
          isCharacterDevice: () => false,
          isFIFO: () => false,
          isSocket: () => false,
          isSymbolicLink: () => false,
        },
      ];
      const mockStats = [
        { isDirectory: () => false, size: 100, mtime: new Date() },
        { isDirectory: () => false, size: 200, mtime: new Date() },
        { isDirectory: () => true, size: 0, mtime: new Date() },
      ];

      (fs.readdir as ReturnType<typeof vi.fn>).mockResolvedValue(mockDirents);
      (fs.stat as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockStats[0])
        .mockResolvedValueOnce(mockStats[1])
        .mockResolvedValueOnce(mockStats[2]);

      const files = await service.listFiles('');

      expect(fs.readdir).toHaveBeenCalledWith(mockWorkspaceRoot, {
        withFileTypes: true,
      });
      expect(files).toHaveLength(3);
      // Files are sorted with directories first, then alphabetically
      expect(files[0]).toMatchObject({
        name: 'folder',
        path: 'folder',
        isDirectory: true,
        lastModified: mockStats[2].mtime,
      });
      expect(files[1]).toMatchObject({
        name: 'file1.txt',
        path: 'file1.txt',
        isDirectory: false,
        size: 100,
        lastModified: mockStats[0].mtime,
        extension: '.txt',
      });
      expect(files[2]).toMatchObject({
        name: 'file2.js',
        path: 'file2.js',
        isDirectory: false,
        size: 200,
        lastModified: mockStats[1].mtime,
        extension: '.js',
      });
    });

    it('should handle subdirectory paths', async () => {
      (fs.readdir as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await service.listFiles('subdir');

      expect(fs.readdir).toHaveBeenCalledWith(
        path.resolve(mockWorkspaceRoot, 'subdir'),
        { withFileTypes: true }
      );
    });

    it('should handle paths outside workspace', async () => {
      // listFiles doesn't validate paths, it just resolves them
      (fs.readdir as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await service.listFiles('../outside');

      expect(fs.readdir).toHaveBeenCalledWith(
        path.resolve(mockWorkspaceRoot, '../outside'),
        { withFileTypes: true }
      );
    });

    it('should handle file listing errors', async () => {
      (fs.readdir as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Permission denied')
      );

      await expect(service.listFiles('')).rejects.toThrow(
        'Directory not found'
      );
    });
  });

  describe('readFile', () => {
    it('should read file contents', async () => {
      const mockContent = 'File content';
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(mockContent);
      const mockStat = { size: 12 };
      (fs.stat as ReturnType<typeof vi.fn>).mockResolvedValue(mockStat);

      const result = await service.readFile('test.txt');

      expect(fs.readFile).toHaveBeenCalledWith(
        path.resolve(mockWorkspaceRoot, 'test.txt'),
        'utf-8'
      );
      expect(result).toMatchObject({
        path: 'test.txt',
        content: mockContent,
        encoding: 'utf-8',
        size: 12,
      });
    });

    it('should throw error for paths outside workspace', async () => {
      await expect(service.readFile('../../../etc/passwd')).rejects.toThrow(
        'Access denied: Path outside workspace'
      );
    });

    it('should handle file read errors', async () => {
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      (fs.readFile as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(service.readFile('nonexistent.txt')).rejects.toThrow(
        'File not found'
      );
    });
  });

  describe('deleteFile', () => {
    it('should delete a file', async () => {
      (fs.unlink as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await service.deleteFile('test.txt');

      expect(fs.unlink).toHaveBeenCalledWith(
        path.resolve(mockWorkspaceRoot, 'test.txt')
      );
    });

    it('should handle file not found', async () => {
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      (fs.unlink as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(service.deleteFile('nonexistent.txt')).rejects.toThrow(
        'File not found'
      );
    });

    it('should throw error for paths outside workspace', async () => {
      await expect(service.deleteFile('../outside.txt')).rejects.toThrow(
        'Access denied: Path outside workspace'
      );
    });

    it('should handle deletion errors', async () => {
      (fs.unlink as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Permission denied')
      );

      await expect(service.deleteFile('protected.txt')).rejects.toThrow(
        'Failed to delete file: Error: Permission denied'
      );
    });
  });

  describe('createDirectory', () => {
    it('should create a directory', async () => {
      (fs.mkdir as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await service.createDirectory('newdir');

      expect(fs.mkdir).toHaveBeenCalledWith(
        path.resolve(mockWorkspaceRoot, 'newdir'),
        { recursive: true }
      );
    });

    it('should create nested directories', async () => {
      (fs.mkdir as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await service.createDirectory('deep/nested/dir');

      expect(fs.mkdir).toHaveBeenCalledWith(
        path.resolve(mockWorkspaceRoot, 'deep/nested/dir'),
        { recursive: true }
      );
    });

    it('should throw error for paths outside workspace', async () => {
      await expect(service.createDirectory('../outside')).rejects.toThrow(
        'Access denied: Path outside workspace'
      );
    });

    it('should handle creation errors', async () => {
      (fs.mkdir as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Permission denied')
      );

      await expect(service.createDirectory('protected')).rejects.toThrow(
        'Permission denied'
      );
    });
  });

  describe('deleteDirectory', () => {
    it('should delete a directory', async () => {
      (fs.rmdir as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await service.deleteDirectory('testdir');

      expect(fs.rmdir).toHaveBeenCalledWith(
        path.resolve(mockWorkspaceRoot, 'testdir'),
        { recursive: true }
      );
    });

    it('should throw error for paths outside workspace', async () => {
      await expect(service.deleteDirectory('../outside')).rejects.toThrow(
        'Access denied: Path outside workspace'
      );
    });

    it('should handle directory not found', async () => {
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      (fs.rmdir as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(service.deleteDirectory('nonexistent')).rejects.toThrow(
        'Directory not found'
      );
    });

    it('should handle deletion errors', async () => {
      (fs.rmdir as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Permission denied')
      );

      await expect(service.deleteDirectory('protected')).rejects.toThrow(
        'Failed to delete directory: Error: Permission denied'
      );
    });
  });

  describe('exists', () => {
    it('should return true if file exists', async () => {
      (fs.access as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const result = await service.exists('test.txt');

      expect(result).toBe(true);
      expect(fs.access).toHaveBeenCalledWith(
        path.resolve(mockWorkspaceRoot, 'test.txt')
      );
    });

    it('should return false if file does not exist', async () => {
      (fs.access as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('ENOENT')
      );

      const result = await service.exists('nonexistent.txt');

      expect(result).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return file stats', async () => {
      const mockStat = {
        isDirectory: () => false,
        isFile: () => true,
        size: 1024,
        mtime: new Date('2024-01-01'),
        atime: new Date('2024-01-02'),
        ctime: new Date('2024-01-03'),
      };

      (fs.stat as ReturnType<typeof vi.fn>).mockResolvedValue(mockStat);

      const stats = await service.getStats('test.txt');

      expect(stats).toEqual(mockStat);
      expect(fs.stat).toHaveBeenCalledWith(
        path.resolve(mockWorkspaceRoot, 'test.txt')
      );
    });

    it('should throw error for paths outside workspace', async () => {
      await expect(service.getStats('../outside.txt')).rejects.toThrow(
        'Access denied: Path outside workspace'
      );
    });

    it('should handle file not found', async () => {
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      (fs.stat as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(service.getStats('nonexistent.txt')).rejects.toThrow(
        'Path not found'
      );
    });
  });

  describe('saveFile', () => {
    it('should save file content', async () => {
      (fs.mkdir as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (fs.writeFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      const mockStat = {
        size: 1024,
        mtime: new Date('2024-01-01'),
      };
      (fs.stat as ReturnType<typeof vi.fn>).mockResolvedValue(mockStat);

      const result = await service.saveFile('test.txt', 'content');

      expect(fs.writeFile).toHaveBeenCalledWith(
        path.resolve(mockWorkspaceRoot, 'test.txt'),
        'content',
        'utf-8'
      );
      expect(result).toMatchObject({
        name: 'test.txt',
        path: 'test.txt',
        isDirectory: false,
        size: 1024,
        lastModified: mockStat.mtime,
        extension: '.txt',
      });
    });

    it('should throw error for paths outside workspace', async () => {
      await expect(
        service.saveFile('../outside.txt', 'content')
      ).rejects.toThrow('Access denied: Path outside workspace');
    });

    it('should handle save errors', async () => {
      (fs.mkdir as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (fs.writeFile as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Disk full')
      );

      await expect(service.saveFile('test.txt', 'content')).rejects.toThrow(
        'Failed to save file: Error: Disk full'
      );
    });
  });
});
