import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MCPManager,
  type MCPServerConfig,
  type MCPTool,
} from '../../../mcpManager';
import { SseService } from '../../events/services/sse.service';
import { SSEEventType } from '../../../../src/types';

// Re-export interfaces from MCPManager for compatibility
export type { MCPServerConfig as McpServer } from '../../../mcpManager';
export type { MCPTool as McpTool } from '../../../mcpManager';

@Injectable()
export class McpManagerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(McpManagerService.name);
  private mcpManager: MCPManager;

  constructor(
    private configService: ConfigService,
    private sseService: SseService
  ) {
    // MCPManager will be initialized in onModuleInit
  }

  async onModuleInit() {
    try {
      this.mcpManager = new MCPManager();

      await this.mcpManager.initialize();
      this.logger.log('MCP Manager initialized successfully');

      // Set up event listeners to forward MCP events to SSE
      this.mcpManager.on('tools-changed', (data: unknown) => {
        this.sseService.broadcast('unified-events', {
          type: SSEEventType.MCP_TOOLS_UPDATED,
          data,
          timestamp: Date.now(),
        });
      });

      this.mcpManager.on('server-started', (server: MCPServerConfig) => {
        this.logger.log(`MCP Server started: ${server.name}`);
        this.sseService.broadcast('unified-events', {
          type: SSEEventType.MCP_SERVER_STARTED,
          server,
          timestamp: Date.now(),
        });
      });

      this.mcpManager.on('server-stopped', (server: MCPServerConfig) => {
        this.sseService.broadcast('unified-events', {
          type: SSEEventType.MCP_SERVER_STOPPED,
          server,
          timestamp: Date.now(),
        });
      });

      this.mcpManager.on(
        'server-error',
        ({ server, error }: { server: MCPServerConfig; error: unknown }) => {
          this.logger.error(`MCP Server error: ${server.name}`, error);
          this.sseService.broadcast('unified-events', {
            type: SSEEventType.MCP_SERVER_ERROR,
            server,
            error: error instanceof Error ? error.message : String(error),
            timestamp: Date.now(),
          });
        }
      );
    } catch (error) {
      this.logger.error('Failed to initialize MCP Manager:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    try {
      if (this.mcpManager) {
        await this.mcpManager.shutdown();
        this.logger.log('MCP Manager cleaned up');
      }
    } catch (error) {
      this.logger.error('Error cleaning up MCP Manager:', error);
    }
  }

  async getServerConfigs() {
    try {
      return await this.mcpManager.getServerConfigs();
    } catch (error) {
      this.logger.error('Error getting server configs:', error);
      throw error;
    }
  }

  async addServerConfig(config: MCPServerConfig) {
    try {
      await this.mcpManager.addServerConfig(config);
      this.logger.log(`Added MCP server config: ${config.name}`);
      return { success: true, message: 'Server config added successfully' };
    } catch (error) {
      this.logger.error('Error adding server config:', error);
      throw error;
    }
  }

  async getAvailableTools(): Promise<MCPTool[]> {
    try {
      return await this.mcpManager.getAvailableTools();
    } catch (error) {
      this.logger.error('Error getting available tools:', error);
      throw error;
    }
  }

  async startServer(serverId: string) {
    try {
      const serverConfig = await this.mcpManager
        .getServerConfigs()
        .then((configs: MCPServerConfig[]) =>
          configs.find((c: MCPServerConfig) => c.id === serverId)
        );
      if (serverConfig) {
        await this.mcpManager.connectToServer(serverConfig);
        this.logger.log(`Started MCP server: ${serverId}`);
      }
      return { success: true, message: 'Server started successfully' };
    } catch (error) {
      this.logger.error(`Error starting server ${serverId}:`, error);
      throw error;
    }
  }

  async stopServer(serverId: string) {
    try {
      await this.mcpManager.disconnectFromServer(serverId);
      this.logger.log(`Stopped MCP server: ${serverId}`);
      return { success: true, message: 'Server stopped successfully' };
    } catch (error) {
      this.logger.error(`Error stopping server ${serverId}:`, error);
      throw error;
    }
  }

  async restartServer(serverId: string) {
    try {
      await this.mcpManager.disconnectFromServer(serverId);
      const serverConfig = await this.mcpManager
        .getServerConfigs()
        .then((configs: MCPServerConfig[]) =>
          configs.find((c: MCPServerConfig) => c.id === serverId)
        );
      if (serverConfig) {
        await this.mcpManager.connectToServer(serverConfig);
      }
      this.logger.log(`Restarted MCP server: ${serverId}`);
      return { success: true, message: 'Server restarted successfully' };
    } catch (error) {
      this.logger.error(`Error restarting server ${serverId}:`, error);
      throw error;
    }
  }

  async executeTool(serverId: string, toolName: string, params: unknown) {
    try {
      const result = await this.mcpManager.executeTool(
        serverId,
        toolName,
        params
      );
      this.logger.log(`Executed tool ${toolName} on server ${serverId}`);
      return result;
    } catch (error) {
      this.logger.error(
        `Error executing tool ${toolName} on server ${serverId}:`,
        error
      );
      throw error;
    }
  }

  async refreshAll() {
    try {
      await this.mcpManager.reload();
      this.logger.log('Refreshed all MCP servers');
      return { success: true, message: 'All servers refreshed successfully' };
    } catch (error) {
      this.logger.error('Error refreshing all servers:', error);
      throw error;
    }
  }

  async getServerLogs(serverId?: string) {
    try {
      return await this.mcpManager.getDiagnostics();
    } catch (error) {
      this.logger.error('Error getting server logs:', error);
      throw error;
    }
  }

  async getConfig() {
    try {
      return await this.mcpManager.getServerConfigs();
    } catch (error) {
      this.logger.error('Error getting MCP config:', error);
      throw error;
    }
  }

  async updateConfig(config: unknown) {
    try {
      // MCPManager doesn't have updateConfig, so we'll handle this at a higher level
      this.logger.warn(
        'updateConfig not fully implemented - individual server configs should be updated'
      );
      return {
        success: false,
        message: 'Use individual server config updates instead',
      };
    } catch (error) {
      this.logger.error('Error updating MCP config:', error);
      throw error;
    }
  }

  // Legacy compatibility methods
  async getServers() {
    return this.getServerConfigs();
  }

  async getServer(id: string) {
    const configs = await this.getServerConfigs();
    return configs.find(c => c.id === id);
  }

  async removeServer(serverId: string) {
    try {
      await this.mcpManager.removeServerConfig(serverId);
      this.logger.log(`Removed MCP server: ${serverId}`);
      return { success: true, message: 'Server removed successfully' };
    } catch (error) {
      this.logger.error(`Error removing server ${serverId}:`, error);
      throw error;
    }
  }

  async updateServer(serverId: string, updates: Partial<MCPServerConfig>) {
    try {
      await this.mcpManager.updateServerConfig(serverId, updates);
      this.logger.log(`Updated MCP server: ${serverId}`);
      return { success: true, message: 'Server updated successfully' };
    } catch (error) {
      this.logger.error(`Error updating server ${serverId}:`, error);
      throw error;
    }
  }

  // Alias for addServerConfig for compatibility
  async addServer(config: MCPServerConfig) {
    return this.addServerConfig(config);
  }
}
