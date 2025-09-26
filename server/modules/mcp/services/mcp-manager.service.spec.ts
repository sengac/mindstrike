import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { McpManagerService } from './mcp-manager.service';
import { SseService } from '../../events/services/sse.service';
import * as fs from 'fs/promises';
import * as child_process from 'child_process';
import type { EventEmitter } from 'events';

vi.mock('fs/promises');
vi.mock('child_process');

// Type for mock process
interface MockProcess extends EventEmitter {
  pid: number;
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
}

describe('McpManagerService', () => {
  let service: McpManagerService;
  let configService: ConfigService;
  let sseService: SseService;
  const mockConfigPath = '/test/config/mcp.json';

  // Mock MCPManager instance
  const mockMcpManager = {
    initialize: vi.fn().mockResolvedValue(undefined),
    getServerConfigs: vi.fn().mockResolvedValue([]),
    addServerConfig: vi.fn().mockResolvedValue({ success: true }),
    updateServerConfig: vi.fn().mockResolvedValue({ success: true }),
    deleteServerConfig: vi.fn().mockResolvedValue({ success: true }),
    connectToServer: vi.fn().mockResolvedValue(undefined),
    disconnectFromServer: vi.fn().mockResolvedValue(undefined),
    getAvailableTools: vi.fn().mockResolvedValue([]),
    getDiagnostics: vi.fn().mockResolvedValue([]),
    getStats: vi.fn().mockResolvedValue({}),
    refreshConnections: vi.fn().mockResolvedValue(undefined),
    executeTool: vi.fn().mockResolvedValue({ success: true }),
    reload: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    off: vi.fn(),
    removeAllListeners: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        McpManagerService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockReturnValue(mockConfigPath),
          },
        },
        {
          provide: SseService,
          useValue: {
            broadcast: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<McpManagerService>(McpManagerService);
    configService = module.get<ConfigService>(ConfigService);
    sseService = module.get<SseService>(SseService);

    // Manually set the mcpManager using proper typing
    Object.defineProperty(service, 'mcpManager', {
      value: mockMcpManager,
      writable: true,
    });

    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up any running processes
    if (service.stopAllServers) {
      service.stopAllServers();
    }
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('getServerConfigs', () => {
    it('should get server configurations from MCPManager', async () => {
      const mockConfigs = [
        {
          id: 'test-server-1',
          name: 'Test Server 1',
          command: 'node',
          args: ['server1.js'],
        },
        {
          id: 'test-server-2',
          name: 'Test Server 2',
          command: 'node',
          args: ['server2.js'],
        },
      ];

      mockMcpManager.getServerConfigs.mockResolvedValue(mockConfigs);

      const configs = await service.getServerConfigs();

      expect(mockMcpManager.getServerConfigs).toHaveBeenCalled();
      expect(configs).toEqual(mockConfigs);
    });

    it('should handle errors when getting server configs', async () => {
      const error = new Error('Failed to get configs');
      mockMcpManager.getServerConfigs.mockRejectedValue(error);

      await expect(service.getServerConfigs()).rejects.toThrow(
        'Failed to get configs'
      );
    });
  });

  describe('addServerConfig', () => {
    it('should add a server configuration', async () => {
      const mockConfig = {
        id: 'test-server',
        name: 'Test Server',
        command: 'node',
        args: ['server.js'],
      };

      mockMcpManager.addServerConfig.mockResolvedValue(undefined);

      const result = await service.addServerConfig(mockConfig);

      expect(mockMcpManager.addServerConfig).toHaveBeenCalledWith(mockConfig);
      expect(result).toEqual({
        success: true,
        message: 'Server config added successfully',
      });
    });

    it('should handle errors when adding server config', async () => {
      const mockConfig = {
        id: 'test-server',
        name: 'Test Server',
        command: 'node',
        args: ['server.js'],
      };
      const error = new Error('Failed to add config');
      mockMcpManager.addServerConfig.mockRejectedValue(error);

      await expect(service.addServerConfig(mockConfig)).rejects.toThrow(
        'Failed to add config'
      );
    });
  });

  describe('getAvailableTools', () => {
    it('should get available tools from MCPManager', async () => {
      const mockTools = [
        { name: 'tool1', description: 'Test tool 1' },
        { name: 'tool2', description: 'Test tool 2' },
      ];

      mockMcpManager.getAvailableTools.mockResolvedValue(mockTools);

      const tools = await service.getAvailableTools();

      expect(mockMcpManager.getAvailableTools).toHaveBeenCalled();
      expect(tools).toEqual(mockTools);
    });

    it('should handle errors when getting available tools', async () => {
      const error = new Error('Failed to get tools');
      mockMcpManager.getAvailableTools.mockRejectedValue(error);

      await expect(service.getAvailableTools()).rejects.toThrow(
        'Failed to get tools'
      );
    });
  });

  describe('startServer', () => {
    it('should start a server by ID', async () => {
      const serverId = 'test-server';
      const mockConfig = {
        id: serverId,
        name: 'Test Server',
        command: 'node',
        args: ['server.js'],
      };

      mockMcpManager.getServerConfigs.mockResolvedValue([mockConfig]);
      mockMcpManager.connectToServer.mockResolvedValue(undefined);

      const result = await service.startServer(serverId);

      expect(mockMcpManager.getServerConfigs).toHaveBeenCalled();
      expect(mockMcpManager.connectToServer).toHaveBeenCalledWith(mockConfig);
      expect(result).toEqual({
        success: true,
        message: 'Server started successfully',
      });
    });

    it('should handle server not found', async () => {
      const serverId = 'non-existent-server';

      mockMcpManager.getServerConfigs.mockResolvedValue([]);

      const result = await service.startServer(serverId);

      expect(result).toEqual({
        success: true,
        message: 'Server started successfully',
      });
    });

    it('should handle errors when starting server', async () => {
      const serverId = 'test-server';
      const error = new Error('Failed to start server');
      mockMcpManager.getServerConfigs.mockRejectedValue(error);

      await expect(service.startServer(serverId)).rejects.toThrow(
        'Failed to start server'
      );
    });
  });

  describe('stopServer', () => {
    it('should stop a server by ID', async () => {
      const serverId = 'test-server';

      mockMcpManager.disconnectFromServer.mockResolvedValue(undefined);

      const result = await service.stopServer(serverId);

      expect(mockMcpManager.disconnectFromServer).toHaveBeenCalledWith(
        serverId
      );
      expect(result).toEqual({
        success: true,
        message: 'Server stopped successfully',
      });
    });

    it('should handle errors when stopping server', async () => {
      const serverId = 'test-server';
      const error = new Error('Failed to stop server');
      mockMcpManager.disconnectFromServer.mockRejectedValue(error);

      await expect(service.stopServer(serverId)).rejects.toThrow(
        'Failed to stop server'
      );
    });
  });

  describe('restartServer', () => {
    it('should restart a server by ID', async () => {
      const serverId = 'test-server';
      const mockConfig = {
        id: serverId,
        name: 'Test Server',
        command: 'node',
        args: ['server.js'],
      };

      mockMcpManager.disconnectFromServer.mockResolvedValue(undefined);
      mockMcpManager.getServerConfigs.mockResolvedValue([mockConfig]);
      mockMcpManager.connectToServer.mockResolvedValue(undefined);

      const result = await service.restartServer(serverId);

      expect(mockMcpManager.disconnectFromServer).toHaveBeenCalledWith(
        serverId
      );
      expect(mockMcpManager.getServerConfigs).toHaveBeenCalled();
      expect(mockMcpManager.connectToServer).toHaveBeenCalledWith(mockConfig);
      expect(result).toEqual({
        success: true,
        message: 'Server restarted successfully',
      });
    });

    it('should handle errors when restarting server', async () => {
      const serverId = 'test-server';
      const error = new Error('Failed to restart server');
      mockMcpManager.disconnectFromServer.mockRejectedValue(error);

      await expect(service.restartServer(serverId)).rejects.toThrow(
        'Failed to restart server'
      );
    });
  });

  describe('executeTool', () => {
    it('should execute a tool on a server', async () => {
      const serverId = 'test-server';
      const toolName = 'test-tool';
      const params = { param1: 'value1' };
      const mockResult = { success: true, data: 'tool result' };

      mockMcpManager.executeTool.mockResolvedValue(mockResult);

      const result = await service.executeTool(serverId, toolName, params);

      expect(mockMcpManager.executeTool).toHaveBeenCalledWith(
        serverId,
        toolName,
        params
      );
      expect(result).toEqual(mockResult);
    });

    it('should handle errors when executing tool', async () => {
      const serverId = 'test-server';
      const toolName = 'test-tool';
      const params = { param1: 'value1' };
      const error = new Error('Failed to execute tool');
      mockMcpManager.executeTool.mockRejectedValue(error);

      await expect(
        service.executeTool(serverId, toolName, params)
      ).rejects.toThrow('Failed to execute tool');
    });
  });

  describe('refreshAll', () => {
    it('should refresh all servers', async () => {
      mockMcpManager.reload.mockResolvedValue(undefined);

      const result = await service.refreshAll();

      expect(mockMcpManager.reload).toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        message: 'All servers refreshed successfully',
      });
    });

    it('should handle errors when refreshing servers', async () => {
      const error = new Error('Failed to refresh servers');
      mockMcpManager.reload.mockRejectedValue(error);

      await expect(service.refreshAll()).rejects.toThrow(
        'Failed to refresh servers'
      );
    });
  });

  describe('getServerLogs', () => {
    it('should get server logs', async () => {
      const mockLogs = ['log1', 'log2', 'log3'];

      mockMcpManager.getDiagnostics.mockResolvedValue(mockLogs);

      const result = await service.getServerLogs();

      expect(mockMcpManager.getDiagnostics).toHaveBeenCalled();
      expect(result).toEqual(mockLogs);
    });

    it('should handle errors when getting server logs', async () => {
      const error = new Error('Failed to get logs');
      mockMcpManager.getDiagnostics.mockRejectedValue(error);

      await expect(service.getServerLogs()).rejects.toThrow(
        'Failed to get logs'
      );
    });
  });
});
