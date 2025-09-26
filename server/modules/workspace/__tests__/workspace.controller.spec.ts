import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { WorkspaceController } from '../workspace.controller';
import type { WorkspaceService } from '../workspace.service';
import type { WorkspaceFileService } from '../services/workspace-file.service';
import type { AgentPoolService } from '../../agents/services/agent-pool.service';
import type { ConversationService } from '../../chat/services/conversation.service';
import * as path from 'path';
import * as fs from 'fs';

// Mock the settings-directory module
vi.mock('../../../shared/utils/settings-directory', () => ({
  setWorkspaceRoot: vi.fn().mockResolvedValue(undefined),
}));

// Mock the fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
}));

describe('WorkspaceController', () => {
  let controller: WorkspaceController;
  let mockWorkspaceService: Partial<WorkspaceService>;
  let mockWorkspaceFileService: Partial<WorkspaceFileService>;
  let mockAgentPoolService: Partial<AgentPoolService>;
  let mockConversationService: Partial<ConversationService>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockWorkspaceService = {};

    mockWorkspaceFileService = {
      getCurrentDirectory: vi.fn().mockReturnValue('/test/workspace'),
      setCurrentDirectory: vi.fn(),
      getWorkspaceRoot: vi.fn().mockReturnValue('/test'),
      setWorkspaceRoot: vi.fn(),
    };

    mockAgentPoolService = {
      updateAllAgentsWorkspace: vi.fn(),
    };

    mockConversationService = {
      updateWorkspaceRoot: vi.fn(),
    };

    controller = new WorkspaceController(
      mockWorkspaceService as WorkspaceService,
      mockWorkspaceFileService as WorkspaceFileService,
      mockAgentPoolService as AgentPoolService,
      mockConversationService as ConversationService
    );
  });

  describe('GET /api/workspace/directory', () => {
    it('should return current directory and absolute path', async () => {
      const result = await controller.getWorkspaceDirectory();

      expect(result).toEqual({
        currentDirectory: expect.any(String),
        absolutePath: expect.any(String),
      });
      expect(result.currentDirectory).toBe(result.absolutePath);
    });
  });

  describe('POST /api/workspace/directory', () => {
    it('should set directory with absolute path', async () => {
      const newPath = '/new/absolute/path';
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.statSync as ReturnType<typeof vi.fn>).mockReturnValue({
        isDirectory: () => true,
      });

      const result = await controller.setWorkspaceDirectory({
        path: newPath,
      });

      expect(result).toEqual({
        currentDirectory: newPath,
        absolutePath: newPath,
      });
    });

    it('should set directory with relative path', async () => {
      const relativePath = './subfolder';
      const resolvedPath = path.resolve(process.cwd(), relativePath);
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.statSync as ReturnType<typeof vi.fn>).mockReturnValue({
        isDirectory: () => true,
      });

      const result = await controller.setWorkspaceDirectory({
        path: relativePath,
      });

      expect(result.currentDirectory).toBeTruthy();
      expect(result.absolutePath).toBeTruthy();
    });

    it('should throw BadRequestException when path is missing', async () => {
      await expect(
        controller.setWorkspaceDirectory({ path: '' })
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.setWorkspaceDirectory({ path: '' })
      ).rejects.toThrow('Path is required');
    });

    it('should throw NotFoundException when directory does not exist', async () => {
      const nonExistentPath = '/non/existent/path';
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

      await expect(
        controller.setWorkspaceDirectory({ path: nonExistentPath })
      ).rejects.toThrow(NotFoundException);
      await expect(
        controller.setWorkspaceDirectory({ path: nonExistentPath })
      ).rejects.toThrow('Directory does not exist');
    });

    it('should throw BadRequestException when path is not a directory', async () => {
      const filePath = '/path/to/file.txt';
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.statSync as ReturnType<typeof vi.fn>).mockReturnValue({
        isDirectory: () => false,
      });

      await expect(
        controller.setWorkspaceDirectory({ path: filePath })
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.setWorkspaceDirectory({ path: filePath })
      ).rejects.toThrow('Path is not a directory');
    });
  });

  describe('GET /api/workspace/root', () => {
    it('should return workspace root and current directory', async () => {
      const result = await controller.getWorkspaceRoot();

      expect(result).toEqual({
        workspaceRoot: expect.any(String),
        currentDirectory: expect.any(String),
      });
    });
  });

  describe('POST /api/workspace/root', () => {
    it('should set workspace root with absolute path', async () => {
      const newRoot = '/new/workspace/root';
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.statSync as ReturnType<typeof vi.fn>).mockReturnValue({
        isDirectory: () => true,
      });

      const result = await controller.setWorkspaceRoot({ path: newRoot });

      expect(result).toEqual({
        workspaceRoot: newRoot,
        currentDirectory: newRoot,
        message: 'Workspace root changed successfully',
      });
      expect(
        mockAgentPoolService.updateAllAgentsWorkspace
      ).toHaveBeenCalledWith(newRoot);
      expect(mockConversationService.updateWorkspaceRoot).toHaveBeenCalledWith(
        newRoot
      );
    });

    it('should set workspace root with relative path', async () => {
      const relativePath = '../parent';
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.statSync as ReturnType<typeof vi.fn>).mockReturnValue({
        isDirectory: () => true,
      });

      const result = await controller.setWorkspaceRoot({ path: relativePath });

      expect(result.workspaceRoot).toBeTruthy();
      expect(result.currentDirectory).toBe(result.workspaceRoot);
      expect(result.message).toBe('Workspace root changed successfully');
    });

    it('should not update if workspace root is the same', async () => {
      const currentRoot = controller['workspaceRoot'];
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.statSync as ReturnType<typeof vi.fn>).mockReturnValue({
        isDirectory: () => true,
      });

      const result = await controller.setWorkspaceRoot({ path: currentRoot });

      expect(result.workspaceRoot).toBe(currentRoot);
      expect(
        mockAgentPoolService.updateAllAgentsWorkspace
      ).not.toHaveBeenCalled();
      expect(
        mockConversationService.updateWorkspaceRoot
      ).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when path is missing', async () => {
      await expect(controller.setWorkspaceRoot({ path: '' })).rejects.toThrow(
        BadRequestException
      );
      await expect(controller.setWorkspaceRoot({ path: '' })).rejects.toThrow(
        'Path is required'
      );
    });

    it('should throw NotFoundException when directory does not exist', async () => {
      const nonExistentPath = '/non/existent/root';
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

      await expect(
        controller.setWorkspaceRoot({ path: nonExistentPath })
      ).rejects.toThrow(NotFoundException);
      await expect(
        controller.setWorkspaceRoot({ path: nonExistentPath })
      ).rejects.toThrow('Directory does not exist');
    });

    it('should throw BadRequestException when path is not a directory', async () => {
      const filePath = '/path/to/file.txt';
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.statSync as ReturnType<typeof vi.fn>).mockReturnValue({
        isDirectory: () => false,
      });

      await expect(
        controller.setWorkspaceRoot({ path: filePath })
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.setWorkspaceRoot({ path: filePath })
      ).rejects.toThrow('Path is not a directory');
    });

    it('should handle errors during workspace update', async () => {
      const newRoot = '/new/root';
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.statSync as ReturnType<typeof vi.fn>).mockReturnValue({
        isDirectory: () => true,
      });

      // Force an error by throwing in updateAllAgentsWorkspace
      const error = new Error('Update failed');
      (
        mockAgentPoolService.updateAllAgentsWorkspace as ReturnType<
          typeof vi.fn
        >
      ).mockImplementation(() => {
        throw error;
      });

      await expect(
        controller.setWorkspaceRoot({ path: newRoot })
      ).rejects.toThrow(InternalServerErrorException);
    });
  });
});
