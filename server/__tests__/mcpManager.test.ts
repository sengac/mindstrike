import type { MockedFunction } from 'vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MCPServerConfig } from '../mcpManager';
import { MCPManager, MCPTool } from '../mcpManager';
import fs from 'fs/promises';
import { EventEmitter, Readable } from 'stream';
import { logger } from '../logger';
import { sseManager } from '../sseManager';
import { CommandResolver } from '../utils/commandResolver';
import { lfsManager } from '../lfsManager';
import { getMindstrikeDirectory } from '../utils/settingsDirectory';
import { SSEEventType } from '../../src/types';

// Mock dependencies
vi.mock('fs/promises');
vi.mock('../logger');
vi.mock('../sseManager');
vi.mock('../utils/commandResolver');
vi.mock('../utils/settingsDirectory', () => ({
  getMindstrikeDirectory: vi.fn(() => '/test/mindstrike'),
}));
vi.mock('../utils/llmConfigDirectory', () => ({
  getLLMConfigDirectory: vi.fn(() => '/test/llm-config'),
}));
vi.mock('../documentIngestionService', () => ({
  documentIngestionService: {
    ingestDocument: vi.fn(),
  },
}));
vi.mock('../lfsManager', () => ({
  lfsManager: {
    storeContent: vi.fn(async (content: string) => content),
    isLFSReference: vi.fn(() => false),
    retrieveContent: vi.fn((ref: string) => ref),
  },
}));

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    stdin: { write: vi.fn(), end: vi.fn() },
    on: vi.fn(),
    kill: vi.fn(),
    pid: 12345,
  })),
  execSync: vi.fn((cmd: string) => {
    if (cmd.includes('node')) {
      return 'v18.0.0';
    }
    if (cmd.includes('npm')) {
      return '9.0.0';
    }
    return '';
  }),
}));

// Mock MCP SDK modules using factory functions
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  const EventEmitter = vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    emit: vi.fn(),
    removeListener: vi.fn(),
  }));

  const Client = vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({ tools: [] }),
    listPrompts: vi.fn().mockResolvedValue({ prompts: [] }),
    listResources: vi.fn().mockResolvedValue({ resources: [] }),
    callTool: vi.fn().mockResolvedValue({ content: 'tool result' }),
  }));

  return { Client };
});

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => {
  const StdioClientTransport = vi.fn().mockImplementation(() => ({
    stderr: new Readable(),
    pid: 12345,
    onmessage: undefined,
    start: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  }));

  return { StdioClientTransport };
});

vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => {
  const SSEClientTransport = vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  }));

  return { SSEClientTransport };
});

describe('MCPManager', () => {
  let manager: MCPManager;
  let mockBroadcast: MockedFunction<typeof sseManager.broadcast>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mocks
    vi.mocked(getMindstrikeDirectory).mockReturnValue('/test/mindstrike');
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        mcpServers: {
          'test-server': {
            command: 'test-command',
            args: ['arg1'],
            enabled: true,
          },
        },
      })
    );
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.access).mockResolvedValue(undefined);

    // Setup sseManager mock
    mockBroadcast = vi.fn();
    vi.mocked(sseManager).broadcast = mockBroadcast;

    // Setup CommandResolver mocks
    vi.mocked(CommandResolver.resolveCommand).mockResolvedValue({
      available: true,
      command: 'resolved-command',
      args: ['resolved-arg'],
      resolvedPath: '/usr/bin/resolved-command',
    });
    vi.mocked(CommandResolver.getBundledServers).mockReturnValue(new Map());
    vi.mocked(CommandResolver.getCachedResolutions).mockReturnValue(new Map());
    vi.mocked(CommandResolver.getInstallationInstructions).mockReturnValue({
      message: 'Install via npm',
      commands: ['npm install -g test-command'],
    });
    // clearCache is already a mock from the module mock

    // Setup lfsManager mocks
    vi.mocked(lfsManager.storeContent).mockImplementation(
      async content => content
    );
    vi.mocked(lfsManager.isLFSReference).mockReturnValue(false);
    vi.mocked(lfsManager.retrieveContent).mockImplementation(ref => ref);

    manager = new MCPManager('/test/config.json', '/test/workspace');
  });

  afterEach(async () => {
    await manager.shutdown();
    vi.resetAllMocks();
    vi.clearAllTimers();
  });

  describe('initialization', () => {
    it('should create manager instance', () => {
      expect(manager).toBeDefined();
      expect(manager).toBeInstanceOf(MCPManager);
    });

    it('should initialize and load config', async () => {
      await manager.initialize();

      expect(fs.mkdir).toHaveBeenCalledWith('/test/mindstrike', {
        recursive: true,
      });
      expect(fs.readFile).toHaveBeenCalledWith('/test/config.json', 'utf-8');
    });

    it('should handle missing config file and create default', async () => {
      const error = { code: 'ENOENT' };
      vi.mocked(fs.access).mockRejectedValueOnce(error);
      vi.mocked(fs.readFile).mockRejectedValueOnce(error);

      await manager.initialize();

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/test/config.json',
        expect.stringContaining('filesystem')
      );
    });

    it('should handle invalid config JSON', async () => {
      vi.mocked(fs.readFile).mockResolvedValueOnce('invalid json');

      await manager.initialize();

      expect(manager).toBeDefined();
      expect(logger.error).toHaveBeenCalled();
    });

    it('should load config with multiple servers', async () => {
      vi.mocked(fs.readFile).mockResolvedValueOnce(
        JSON.stringify({
          mcpServers: {
            server1: {
              command: 'cmd1',
              args: ['arg1'],
              enabled: true,
              transport: 'stdio',
            },
            server2: {
              command: 'cmd2',
              args: ['arg2'],
              enabled: false,
              transport: 'sse',
              url: 'http://localhost:3000',
            },
          },
        })
      );

      await manager.initialize();

      const configs = manager.getServerConfigs();
      expect(configs).toHaveLength(2);
      expect(configs[0].id).toBe('server1');
      expect(configs[1].id).toBe('server2');
    });

    it('should handle config with missing command field', async () => {
      vi.mocked(fs.readFile).mockResolvedValueOnce(
        JSON.stringify({
          mcpServers: {
            'invalid-server': {
              args: ['arg1'],
            },
          },
        })
      );

      await manager.initialize();

      const configs = manager.getServerConfigs();
      expect(configs).toHaveLength(0);
    });
  });

  describe('workspace management', () => {
    it('should set workspace root', () => {
      manager.setWorkspaceRoot('/new/workspace');
      expect(mockBroadcast).toHaveBeenCalledWith(
        'unified-events',
        expect.objectContaining({
          type: SSEEventType.MCP_LOG,
          message: expect.stringContaining('Workspace root updated'),
        })
      );
    });

    it('should handle workspace root change and reconnect', async () => {
      await manager.initialize();

      manager.setWorkspaceRoot('/different/workspace');

      expect(mockBroadcast).toHaveBeenCalledWith(
        'unified-events',
        expect.objectContaining({
          type: SSEEventType.MCP_LOG,
          message: expect.stringContaining('Workspace root updated'),
        })
      );
    });

    it('should not reconnect if workspace root unchanged', () => {
      manager.setWorkspaceRoot('/test/workspace');

      // Should not broadcast since workspace unchanged
      expect(mockBroadcast).not.toHaveBeenCalledWith(
        'unified-events',
        expect.objectContaining({
          type: SSEEventType.MCP_LOG,
          message: expect.stringContaining('Workspace root updated'),
        })
      );
    });
  });

  describe('server configuration', () => {
    it('should add server config', async () => {
      const config: MCPServerConfig = {
        id: 'test-server-2',
        name: 'Test Server 2',
        command: 'node',
        args: ['server.js'],
        enabled: false,
      };

      await manager.addServerConfig(config);

      expect(fs.writeFile).toHaveBeenCalled();
      const configs = manager.getServerConfigs();
      expect(configs.find(c => c.id === 'test-server-2')).toBeDefined();
    });

    it('should update server config', async () => {
      await manager.initialize();

      await manager.addServerConfig({
        id: 'test-server',
        name: 'Test Server',
        command: 'node',
        args: ['server.js'],
        enabled: false,
      });

      await manager.updateServerConfig('test-server', {
        enabled: false,
        description: 'Updated description',
      });

      expect(fs.writeFile).toHaveBeenCalled();
      const configs = manager.getServerConfigs();
      const updated = configs.find(c => c.id === 'test-server');
      expect(updated?.description).toBe('Updated description');
    });

    it('should throw error when updating non-existent server', async () => {
      await expect(
        manager.updateServerConfig('non-existent', { enabled: true })
      ).rejects.toThrow('Server non-existent not found');
    });

    it('should remove server config', async () => {
      await manager.initialize();

      await manager.removeServerConfig('test-server');

      expect(fs.writeFile).toHaveBeenCalled();
      const configs = manager.getServerConfigs();
      expect(configs.find(c => c.id === 'test-server')).toBeUndefined();
    });

    it('should get server configs', async () => {
      await manager.initialize();

      const configs = manager.getServerConfigs();

      expect(Array.isArray(configs)).toBe(true);
      expect(configs.length).toBeGreaterThan(0);
    });

    it('should get connected servers', async () => {
      await manager.initialize();

      const servers = manager.getConnectedServers();

      expect(Array.isArray(servers)).toBe(true);
    });
  });

  describe('tool operations', () => {
    it('should get available tools', async () => {
      await manager.initialize();

      const tools = manager.getAvailableTools();

      expect(Array.isArray(tools)).toBe(true);
    });

    it('should handle tool execution errors', async () => {
      await manager.initialize();

      await expect(
        manager.executeTool('non-existent', 'tool', {})
      ).rejects.toThrow('No client connected for server non-existent');
    });

    it('should get LangChain tools', async () => {
      const tools = manager.getLangChainTools();

      expect(Array.isArray(tools)).toBe(true);
    });
  });

  describe('server operations', () => {
    it('should handle disconnect from non-existent server', async () => {
      await manager.disconnectFromServer('non-existent');

      expect(manager).toBeDefined();
    });
  });

  describe('diagnostics', () => {
    it('should get diagnostics with system info', async () => {
      vi.mocked(CommandResolver.getBundledServers).mockReturnValue(
        new Map([
          ['server1', { bundledPath: '/path/to/server1' }],
          ['server2', { bundledPath: undefined }],
        ])
      );

      vi.mocked(CommandResolver.getCachedResolutions).mockReturnValue(
        new Map([
          [
            'cmd1',
            {
              available: true,
              resolvedPath: '/usr/bin/cmd1',
              command: 'cmd1',
              args: [],
            },
          ],
          [
            'cmd2',
            {
              available: false,
              command: 'cmd2',
              args: [],
              fallbackUsed: 'npx',
            },
          ],
        ])
      );

      const diagnostics = await manager.getDiagnostics();

      expect(diagnostics).toBeDefined();
      expect(diagnostics.bundledServers).toHaveLength(2);
      expect(diagnostics.bundledServers[0]).toEqual({
        name: 'server1',
        available: true,
        path: '/path/to/server1',
      });
      expect(diagnostics.commandResolutions).toHaveLength(2);
      expect(diagnostics.systemInfo.platform).toBe(process.platform);
      expect(diagnostics.systemInfo.nodeVersion).toBe('v18.0.0');
      expect(diagnostics.systemInfo.npmVersion).toBe('9.0.0');
    });

    it('should get logs', () => {
      const logs = manager.getLogs();

      expect(Array.isArray(logs)).toBe(true);
    });

    it('should get server logs', () => {
      const logs = manager.getServerLogs('test-server');

      expect(Array.isArray(logs)).toBe(true);
    });

    it('should get server process info', () => {
      const info = manager.getServerProcessInfo();

      expect(Array.isArray(info)).toBe(true);
    });
  });

  describe('reload functionality', () => {
    it('should reload configuration', async () => {
      await manager.initialize();

      vi.mocked(fs.readFile).mockResolvedValueOnce(
        JSON.stringify({
          mcpServers: {
            'new-server': {
              command: 'new-command',
              args: [],
              enabled: true,
            },
          },
        })
      );

      await manager.reload();

      expect(fs.readFile).toHaveBeenCalled();
    });

    it('should handle reload errors', async () => {
      await manager.initialize();

      vi.mocked(fs.readFile).mockRejectedValueOnce(new Error('Read failed'));

      // The reload method might catch errors internally
      await manager.reload();

      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should shutdown manager and cleanup connections', async () => {
      await manager.initialize();

      await manager.shutdown();

      expect(mockBroadcast).toHaveBeenCalledWith(
        'unified-events',
        expect.objectContaining({
          type: SSEEventType.MCP_LOG,
          message: 'Shutdown complete',
        })
      );
    });

    it('should handle shutdown when not initialized', async () => {
      const freshManager = new MCPManager(
        '/test/config.json',
        '/test/workspace'
      );
      await freshManager.shutdown();

      expect(freshManager).toBeDefined();
    });
  });

  describe('command cache', () => {
    it('should refresh command cache', () => {
      const clearCacheSpy = vi.spyOn(CommandResolver, 'clearCache');

      manager.refreshCommandCache();

      expect(clearCacheSpy).toHaveBeenCalled();
      expect(mockBroadcast).toHaveBeenCalledWith(
        'unified-events',
        expect.objectContaining({
          type: SSEEventType.MCP_LOG,
          message: 'Command cache refreshed',
        })
      );
    });
  });

  describe('error handling', () => {
    it('should handle file system errors during initialization', async () => {
      const errorManager = new MCPManager(
        '/test/config.json',
        '/test/workspace'
      );
      vi.mocked(fs.mkdir).mockRejectedValueOnce(new Error('Permission denied'));

      await errorManager.initialize();

      expect(errorManager).toBeDefined();
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('[MCPManager] Failed to initialize:'),
        expect.any(Error)
      );
    });

    it('should handle invalid server configurations', async () => {
      const invalidConfig: MCPServerConfig = {
        id: 'invalid-server',
        name: 'Invalid Server',
        command: '',
        args: [],
        enabled: false,
      };

      await manager.addServerConfig(invalidConfig);

      expect(manager).toBeDefined();
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should handle JSON parse errors in config', async () => {
      const errorManager = new MCPManager(
        '/test/config.json',
        '/test/workspace'
      );
      vi.mocked(fs.readFile).mockResolvedValueOnce('{ invalid json }');

      await errorManager.initialize();

      expect(logger.error).toHaveBeenCalled();
    });
  });
});
