import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { WorkspaceFileController } from '../workspace-file.controller';
import type { WorkspaceService } from '../workspace.service';
import type { WorkspaceFileService } from '../services/workspace-file.service';
import type { SaveFileDto, DeleteFileDto } from '../dto/workspace.dto';

describe('WorkspaceFileController', () => {
  let controller: WorkspaceFileController;
  let mockWorkspaceService: Partial<WorkspaceService>;
  let mockWorkspaceFileService: Partial<WorkspaceFileService>;

  beforeEach(() => {
    mockWorkspaceService = {};

    mockWorkspaceFileService = {
      listFiles: vi.fn(),
      readFile: vi.fn(),
      saveFile: vi.fn(),
      deleteFile: vi.fn(),
    };

    controller = new WorkspaceFileController(
      mockWorkspaceService as WorkspaceService,
      mockWorkspaceFileService as WorkspaceFileService
    );
  });

  describe('GET /api/workspace/files', () => {
    it('should return simple string array with directories having trailing slash', async () => {
      const mockFiles = [
        {
          name: 'src',
          isDirectory: true,
          path: 'src',
          lastModified: new Date(),
        },
        {
          name: 'package.json',
          isDirectory: false,
          path: 'package.json',
          lastModified: new Date(),
        },
        {
          name: 'node_modules',
          isDirectory: true,
          path: 'node_modules',
          lastModified: new Date(),
        },
        {
          name: 'README.md',
          isDirectory: false,
          path: 'README.md',
          lastModified: new Date(),
        },
      ];

      (
        mockWorkspaceFileService.listFiles as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockFiles);

      const result = await controller.getWorkspaceFiles();

      expect(result).toEqual([
        'src/',
        'package.json',
        'node_modules/',
        'README.md',
      ]);
      expect(mockWorkspaceFileService.listFiles).toHaveBeenCalledWith();
    });

    it('should handle empty directory', async () => {
      (
        mockWorkspaceFileService.listFiles as ReturnType<typeof vi.fn>
      ).mockResolvedValue([]);

      const result = await controller.getWorkspaceFiles();

      expect(result).toEqual([]);
    });

    it('should handle file service errors', async () => {
      (
        mockWorkspaceFileService.listFiles as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new NotFoundException('Directory not found'));

      await expect(controller.getWorkspaceFiles()).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('GET /api/workspace/file/:path', () => {
    it('should return only content field', async () => {
      const mockContent = {
        path: 'test.txt',
        content: 'Hello World',
        encoding: 'utf-8',
        size: 11,
      };

      (
        mockWorkspaceFileService.readFile as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockContent);

      const result = await controller.getFile('test.txt');

      expect(result).toEqual({ content: 'Hello World' });
      expect(mockWorkspaceFileService.readFile).toHaveBeenCalledWith(
        'test.txt'
      );
    });

    it('should handle file not found', async () => {
      (
        mockWorkspaceFileService.readFile as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new NotFoundException('File not found'));

      await expect(controller.getFile('nonexistent.txt')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should handle nested file paths', async () => {
      const mockContent = {
        path: 'src/components/App.tsx',
        content: 'export default App;',
        encoding: 'utf-8',
        size: 19,
      };

      (
        mockWorkspaceFileService.readFile as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockContent);

      const result = await controller.getFile('src/components/App.tsx');

      expect(result).toEqual({ content: 'export default App;' });
      expect(mockWorkspaceFileService.readFile).toHaveBeenCalledWith(
        'src/components/App.tsx'
      );
    });
  });

  describe('POST /api/workspace/save', () => {
    it('should return only success: true', async () => {
      const dto: SaveFileDto = {
        path: 'test.txt',
        content: 'New content',
      };

      const mockFileInfo = {
        name: 'test.txt',
        path: 'test.txt',
        isDirectory: false,
        size: 11,
        lastModified: new Date(),
      };

      (
        mockWorkspaceFileService.saveFile as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockFileInfo);

      const result = await controller.saveFile(dto);

      expect(result).toEqual({ success: true });
      expect(mockWorkspaceFileService.saveFile).toHaveBeenCalledWith(
        'test.txt',
        'New content'
      );
    });

    it('should handle save errors', async () => {
      const dto: SaveFileDto = {
        path: 'invalid/\0/path.txt',
        content: 'content',
      };

      (
        mockWorkspaceFileService.saveFile as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new BadRequestException('Invalid path'));

      await expect(controller.saveFile(dto)).rejects.toThrow(
        BadRequestException
      );
    });

    it('should handle creating new files in nested directories', async () => {
      const dto: SaveFileDto = {
        path: 'src/new/deep/file.ts',
        content: 'export const test = true;',
      };

      const mockFileInfo = {
        name: 'file.ts',
        path: 'src/new/deep/file.ts',
        isDirectory: false,
        size: 25,
        lastModified: new Date(),
      };

      (
        mockWorkspaceFileService.saveFile as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockFileInfo);

      const result = await controller.saveFile(dto);

      expect(result).toEqual({ success: true });
      expect(mockWorkspaceFileService.saveFile).toHaveBeenCalledWith(
        'src/new/deep/file.ts',
        'export const test = true;'
      );
    });
  });

  describe('POST /api/workspace/delete', () => {
    it('should return success with message', async () => {
      const dto: DeleteFileDto = {
        path: 'test.txt',
      };

      (
        mockWorkspaceFileService.deleteFile as ReturnType<typeof vi.fn>
      ).mockResolvedValue(undefined);

      const result = await controller.deleteFile(dto);

      expect(result).toEqual({
        success: true,
        message: 'Successfully deleted file: test.txt',
      });
      expect(mockWorkspaceFileService.deleteFile).toHaveBeenCalledWith(
        'test.txt'
      );
    });

    it('should handle file not found', async () => {
      const dto: DeleteFileDto = {
        path: 'nonexistent.txt',
      };

      (
        mockWorkspaceFileService.deleteFile as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new NotFoundException('File not found'));

      await expect(controller.deleteFile(dto)).rejects.toThrow(
        NotFoundException
      );
    });

    it('should handle nested file deletion', async () => {
      const dto: DeleteFileDto = {
        path: 'src/components/OldComponent.tsx',
      };

      (
        mockWorkspaceFileService.deleteFile as ReturnType<typeof vi.fn>
      ).mockResolvedValue(undefined);

      const result = await controller.deleteFile(dto);

      expect(result).toEqual({
        success: true,
        message: 'Successfully deleted file: src/components/OldComponent.tsx',
      });
      expect(mockWorkspaceFileService.deleteFile).toHaveBeenCalledWith(
        'src/components/OldComponent.tsx'
      );
    });

    it('should handle permission errors', async () => {
      const dto: DeleteFileDto = {
        path: 'protected.txt',
      };

      (
        mockWorkspaceFileService.deleteFile as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new BadRequestException('Permission denied'));

      await expect(controller.deleteFile(dto)).rejects.toThrow(
        BadRequestException
      );
    });
  });
});
