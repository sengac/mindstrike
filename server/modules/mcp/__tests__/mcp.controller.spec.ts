import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InternalServerErrorException } from '@nestjs/common';
import { McpController } from '../mcp.controller';
import type { McpService } from '../mcp.service';
import type { McpManagerService } from '../services/mcp-manager.service';

describe('McpController', () => {
  let controller: McpController;
  let mockMcpService: Partial<McpService>;
  let mockMcpManager: Partial<McpManagerService>;

  beforeEach(() => {
    mockMcpService = {};

    mockMcpManager = {
      getLogs: vi.fn(),
      getServerLogs: vi.fn(),
      getServerStatus: vi.fn(),
      getServers: vi.fn(),
      getTools: vi.fn(),
      addServer: vi.fn(),
      updateServer: vi.fn(),
      removeServer: vi.fn(),
      initializeServers: vi.fn(),
      getLoadedTools: vi.fn(),
      refreshCache: vi.fn(),
      getProcesses: vi.fn(),
      refreshServers: vi.fn(),
    };

    controller = new McpController(
      mockMcpService as McpService,
      mockMcpManager as McpManagerService
    );
  });

  describe('getServerLogs', () => {
    it('should return server logs without filtering', async () => {
      const mockLogs = [
        'Log line 1',
        'Error: Something went wrong',
        'Log line 2',
      ];
      (
        mockMcpManager.getServerLogs as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockLogs);

      const result = await controller.getServerLogs();

      expect(result).toEqual({ logs: mockLogs });
      expect(mockMcpManager.getServerLogs).toHaveBeenCalledWith(
        undefined,
        false
      );
    });

    it('should return server logs for specific server', async () => {
      const serverId = 'test-server-123';
      const mockLogs = ['Server log 1', 'Server log 2'];
      (
        mockMcpManager.getServerLogs as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockLogs);

      const result = await controller.getServerLogs(serverId);

      expect(result).toEqual({ logs: mockLogs });
      expect(mockMcpManager.getServerLogs).toHaveBeenCalledWith(
        serverId,
        false
      );
    });

    it('should filter stderr logs when stderrOnly is true', async () => {
      const serverId = 'test-server-123';
      const stderrOnly = 'true';
      const mockLogs = ['Error: Failed to connect', 'Error: Invalid config'];
      (
        mockMcpManager.getServerLogs as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockLogs);

      const result = await controller.getServerLogs(serverId, stderrOnly);

      expect(result).toEqual({ logs: mockLogs });
      expect(mockMcpManager.getServerLogs).toHaveBeenCalledWith(serverId, true);
    });

    it('should handle stderrOnly as false when not "true"', async () => {
      const serverId = 'test-server-123';
      const stderrOnly = 'false';
      const mockLogs = ['All logs'];
      (
        mockMcpManager.getServerLogs as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockLogs);

      const result = await controller.getServerLogs(serverId, stderrOnly);

      expect(result).toEqual({ logs: mockLogs });
      expect(mockMcpManager.getServerLogs).toHaveBeenCalledWith(
        serverId,
        false
      );
    });

    it('should handle empty logs', async () => {
      (
        mockMcpManager.getServerLogs as ReturnType<typeof vi.fn>
      ).mockResolvedValue([]);

      const result = await controller.getServerLogs();

      expect(result).toEqual({ logs: [] });
    });

    it('should throw InternalServerErrorException on error', async () => {
      const error = new Error('Failed to get logs');
      (
        mockMcpManager.getServerLogs as ReturnType<typeof vi.fn>
      ).mockRejectedValue(error);

      await expect(controller.getServerLogs()).rejects.toThrow(
        InternalServerErrorException
      );
      await expect(controller.getServerLogs()).rejects.toThrow(
        'Failed to get logs'
      );
    });

    it('should handle unknown error types', async () => {
      const error = 'Unknown error string';
      (
        mockMcpManager.getServerLogs as ReturnType<typeof vi.fn>
      ).mockRejectedValue(error);

      await expect(controller.getServerLogs()).rejects.toThrow(
        InternalServerErrorException
      );
      await expect(controller.getServerLogs()).rejects.toThrow('Unknown error');
    });
  });
});
