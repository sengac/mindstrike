import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { McpController } from './mcp.controller';
import type { McpService } from './mcp.service';
import type { McpManagerService } from './services/mcp-manager.service';
import { SseService } from '../events/services/sse.service';
import type { MCPServerConfig, MCPTool } from '../../mcpManager.js';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock fs/promises and path modules
vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
  },
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

vi.mock('path', () => ({
  default: {
    join: vi.fn((...args: string[]) => args.join('/')),
  },
  join: vi.fn((...args: string[]) => args.join('/')),
}));

vi.mock('../../../server/utils/settingsDirectory', () => ({
  getMindstrikeDirectory: vi.fn(() => '/mock/mindstrike'),
}));

describe('McpController', () => {
  let controller: McpController;
  let mcpManagerMock: McpManagerService;
  let mcpServiceMock: McpService;
  let fs: typeof import('fs/promises');

  const mockServerConfig: MCPServerConfig = {
    id: 'test-server',
    name: 'Test Server',
    command: 'node',
    args: ['test.js'],
    env: { NODE_ENV: 'test' },
    enabled: true,
  };

  const mockTool: MCPTool = {
    name: 'test-tool',
    description: 'Test tool description',
    inputSchema: { type: 'object' },
    serverId: 'test-server',
  };

  beforeEach(async () => {
    // Create fully typed mock services that match the service interfaces
    mcpServiceMock = {
      getServers: vi.fn(),
      createServer: vi.fn(),
      updateServer: vi.fn(),
      deleteServer: vi.fn(),
      getTools: vi.fn(),
      getStatus: vi.fn(),
      getLogs: vi.fn(),
      getDiagnostics: vi.fn(),
      refreshCache: vi.fn(),
      getProcesses: vi.fn(),
      getServerLogs: vi.fn(),
      getConfig: vi.fn(),
      updateConfig: vi.fn(),
      refreshServers: vi.fn(),
    } as McpService;

    mcpManagerMock = {
      getServerConfigs: vi.fn().mockResolvedValue([]),
      addServerConfig: vi.fn().mockResolvedValue(undefined),
      updateServer: vi
        .fn()
        .mockResolvedValue({ success: true, message: 'Updated' }),
      removeServer: vi
        .fn()
        .mockResolvedValue({ success: true, message: 'Removed' }),
      getAvailableTools: vi.fn().mockResolvedValue([]),
      getServerLogs: vi.fn().mockResolvedValue({ logs: [] }),
      refreshAll: vi
        .fn()
        .mockResolvedValue({ success: true, message: 'Refreshed' }),
      getServers: vi.fn().mockResolvedValue([]),
      getServer: vi.fn(),
      startServer: vi.fn(),
      stopServer: vi.fn(),
      restartServer: vi.fn(),
      executeTool: vi.fn(),
      getConfig: vi.fn(),
      updateConfig: vi.fn(),
      addServer: vi.fn(),
    } as McpManagerService;

    // Create the controller with properly typed mocks
    controller = new McpController(mcpServiceMock, mcpManagerMock);

    fs = await import('fs/promises');

    // Verify the controller is defined
    expect(controller).toBeDefined();
  });

  describe('GET /api/mcp/servers', () => {
    it('should return list of servers', async () => {
      // Setup the mock to return our test data
      (
        mcpManagerMock.getServerConfigs as ReturnType<typeof vi.fn>
      ).mockResolvedValue([mockServerConfig]);

      const result = await controller.getServers();

      expect(result).toEqual({ servers: [mockServerConfig] });
      expect(mcpManagerMock.getServerConfigs).toHaveBeenCalled();
    });

    it('should handle errors', async () => {
      (
        mcpManagerMock.getServerConfigs as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('Failed to get servers'));

      await expect(controller.getServers()).rejects.toThrow(
        InternalServerErrorException
      );
    });
  });

  describe('POST /api/mcp/servers', () => {
    it('should add a new server', async () => {
      const result = await controller.createServer(mockServerConfig);

      expect(result).toEqual({ success: true });
      expect(mcpManagerMock.addServerConfig).toHaveBeenCalledWith(
        mockServerConfig
      );
    });

    it('should validate required fields', async () => {
      // Create a config with explicitly undefined required fields
      const invalidConfig: MCPServerConfig = {
        id: '', // Empty string instead of proper ID
        name: 'Test',
        command: '', // Empty string instead of proper command
        args: [],
        env: {},
        enabled: true,
      };

      await expect(controller.createServer(invalidConfig)).rejects.toThrow(
        BadRequestException
      );
    });

    it('should handle errors', async () => {
      (
        mcpManagerMock.addServerConfig as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('Failed to add server'));

      await expect(controller.createServer(mockServerConfig)).rejects.toThrow(
        InternalServerErrorException
      );
    });
  });

  describe('PUT /api/mcp/servers/:id', () => {
    it('should update a server', async () => {
      (
        mcpManagerMock.updateServer as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ success: true, message: 'Updated' });

      const updates = { name: 'Updated Name' };
      const result = await controller.updateServer('test-server', updates);

      expect(result).toEqual({ success: true });
      expect(mcpManagerMock.updateServer).toHaveBeenCalledWith(
        'test-server',
        updates
      );
    });

    it('should handle errors', async () => {
      (
        mcpManagerMock.updateServer as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('Server not found'));

      await expect(
        controller.updateServer('test-server', { name: 'New' })
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('DELETE /api/mcp/servers/:id', () => {
    it('should delete a server', async () => {
      (
        mcpManagerMock.removeServer as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ success: true, message: 'Removed' });

      const result = await controller.deleteServer('test-server');

      expect(result).toEqual({ success: true });
      expect(mcpManagerMock.removeServer).toHaveBeenCalledWith('test-server');
    });

    it('should handle errors', async () => {
      (
        mcpManagerMock.removeServer as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('Server not found'));

      await expect(controller.deleteServer('test-server')).rejects.toThrow(
        InternalServerErrorException
      );
    });
  });

  describe('GET /api/mcp/tools', () => {
    it('should return available tools', async () => {
      (
        mcpManagerMock.getAvailableTools as ReturnType<typeof vi.fn>
      ).mockResolvedValue([mockTool]);

      const result = await controller.getTools();

      expect(result).toEqual({ tools: [mockTool] });
      expect(mcpManagerMock.getAvailableTools).toHaveBeenCalled();
    });

    it('should handle errors', async () => {
      (
        mcpManagerMock.getAvailableTools as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('Failed to get tools'));

      await expect(controller.getTools()).rejects.toThrow(
        InternalServerErrorException
      );
    });
  });

  describe('GET /api/mcp/status', () => {
    it('should return MCP status', async () => {
      (
        mcpManagerMock.getServerConfigs as ReturnType<typeof vi.fn>
      ).mockResolvedValue([mockServerConfig]);
      (
        mcpManagerMock.getAvailableTools as ReturnType<typeof vi.fn>
      ).mockResolvedValue([mockTool]);

      const result = await controller.getStatus();

      expect(result).toEqual({
        connectedServers: 1,
        totalServers: 1,
        totalTools: 1,
        servers: [mockServerConfig],
      });
    });

    it('should handle errors', async () => {
      (
        mcpManagerMock.getServerConfigs as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('Failed to get status'));

      await expect(controller.getStatus()).rejects.toThrow(
        InternalServerErrorException
      );
    });
  });

  describe('GET /api/mcp/config', () => {
    it('should return config from file', async () => {
      const mockConfig = { mcpServers: { test: mockServerConfig } };
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify(mockConfig, null, 2)
      );

      const result = await controller.getConfig();

      expect(result).toEqual({ config: JSON.stringify(mockConfig, null, 2) });
      expect(fs.readFile).toHaveBeenCalledWith(
        '/mock/mindstrike/mcp-config.json',
        'utf-8'
      );
    });

    it('should return default config if file does not exist', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValue(error);

      const result = await controller.getConfig();
      const defaultConfig = { mcpServers: {} };

      expect(result).toEqual({
        config: JSON.stringify(defaultConfig, null, 2),
      });
    });

    it('should handle other errors', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('Read error'));

      await expect(controller.getConfig()).rejects.toThrow(
        InternalServerErrorException
      );
    });
  });

  describe('POST /api/mcp/config', () => {
    it('should update config file', async () => {
      const config = JSON.stringify({ mcpServers: {} });
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      (mcpManagerMock.refreshAll as ReturnType<typeof vi.fn>).mockResolvedValue(
        { success: true, message: 'Refreshed' }
      );

      const result = await controller.updateConfig({ config });

      expect(result).toEqual({ success: true });
      expect(fs.mkdir).toHaveBeenCalledWith('/mock/mindstrike', {
        recursive: true,
      });
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/mock/mindstrike/mcp-config.json',
        config,
        'utf-8'
      );
      expect(mcpManagerMock.refreshAll).toHaveBeenCalled();
    });

    it('should validate config is a string', async () => {
      // Test with a config that looks like an object stringified incorrectly
      // This simulates what would happen if an object was passed from the client
      const invalidConfig = '[object Object]';

      // This string won't parse as valid JSON
      await expect(
        controller.updateConfig({ config: invalidConfig })
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate JSON format', async () => {
      await expect(
        controller.updateConfig({ config: 'invalid json' })
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate mcpServers property', async () => {
      await expect(
        controller.updateConfig({ config: JSON.stringify({}) })
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle write errors', async () => {
      const config = JSON.stringify({ mcpServers: {} });
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('Write error'));

      await expect(controller.updateConfig({ config })).rejects.toThrow(
        InternalServerErrorException
      );
    });
  });

  describe('POST /api/mcp/refresh', () => {
    it('should refresh all servers', async () => {
      (mcpManagerMock.refreshAll as ReturnType<typeof vi.fn>).mockResolvedValue(
        { success: true, message: 'Refreshed' }
      );

      const result = await controller.refreshServers();

      expect(result).toEqual({ success: true });
      expect(mcpManagerMock.refreshAll).toHaveBeenCalled();
    });

    it('should handle errors', async () => {
      (mcpManagerMock.refreshAll as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Refresh failed')
      );

      await expect(controller.refreshServers()).rejects.toThrow(
        InternalServerErrorException
      );
    });
  });

  describe('GET /api/mcp/server-logs', () => {
    it('should get server logs with query parameters', async () => {
      (
        mcpManagerMock.getServerLogs as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ logs: ['log1', 'log2'] });

      const result = await controller.getServerLogs('test-server', 'true');

      expect(result).toEqual({ logs: [] }); // Currently returns empty array
    });

    it('should handle missing query parameters', async () => {
      const result = await controller.getServerLogs();

      expect(result).toEqual({ logs: [] });
    });

    it('should handle errors', async () => {
      (
        mcpManagerMock.getServerLogs as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('Failed to get logs'));

      await expect(controller.getServerLogs()).rejects.toThrow(
        InternalServerErrorException
      );
    });
  });

  describe('GET /api/mcp/diagnostics', () => {
    it('should return diagnostics', async () => {
      const mockDiagnostics = {
        servers: [mockServerConfig],
        tools: [mockTool],
        errors: [],
      };
      (
        mcpManagerMock.getServerLogs as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockDiagnostics);

      const result = await controller.getDiagnostics();

      expect(result).toEqual(mockDiagnostics);
      expect(mcpManagerMock.getServerLogs).toHaveBeenCalled();
    });

    it('should handle errors', async () => {
      (
        mcpManagerMock.getServerLogs as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('Failed to get diagnostics'));

      await expect(controller.getDiagnostics()).rejects.toThrow(
        InternalServerErrorException
      );
    });
  });

  describe('POST /api/mcp/refresh-cache', () => {
    it('should refresh cache', async () => {
      const result = await controller.refreshCache();

      expect(result).toEqual({
        success: true,
        message: 'Command cache refreshed',
      });
    });
  });

  describe('GET /api/mcp/processes', () => {
    it('should return processes', async () => {
      const result = await controller.getProcesses();

      expect(result).toEqual({ processes: [] });
    });
  });

  describe('GET /api/mcp/logs', () => {
    it('should return logs', async () => {
      (
        mcpManagerMock.getServerLogs as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ logs: [] });

      const result = await controller.getLogs();

      expect(result).toEqual({ logs: [] });
    });

    it('should handle errors', async () => {
      (
        mcpManagerMock.getServerLogs as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('Failed to get logs'));

      await expect(controller.getLogs()).rejects.toThrow(
        InternalServerErrorException
      );
    });
  });
});
