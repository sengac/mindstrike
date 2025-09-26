import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpStatus,
  HttpCode,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import {
  CreateMcpServerDto,
  UpdateMcpServerDto,
  McpConfigDto,
} from './dto/mcp.dto';
import { McpService } from './mcp.service';
import { McpManagerService } from './services/mcp-manager.service';

@ApiTags('mcp')
@Controller('api/mcp')
export class McpController {
  constructor(
    private readonly mcpService: McpService,
    private readonly mcpManager: McpManagerService
  ) {}

  @Get('servers')
  @ApiOperation({ summary: 'Get all MCP servers' })
  @ApiResponse({
    status: 200,
    description: 'List of MCP servers',
    schema: {
      type: 'object',
      properties: {
        servers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              command: { type: 'string' },
              args: { type: 'array', items: { type: 'string' } },
              env: { type: 'object' },
              enabled: { type: 'boolean' },
            },
          },
        },
      },
    },
  })
  async getServers() {
    try {
      const servers = await this.mcpManager.getServerConfigs();
      return { servers };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(errorMessage);
    }
  }

  @Post('servers')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add MCP server' })
  @ApiBody({ type: CreateMcpServerDto })
  @ApiResponse({
    status: 200,
    description: 'Server added successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid configuration' })
  async createServer(@Body() config: CreateMcpServerDto) {
    try {
      if (!config.id || !config.name || !config.command) {
        throw new BadRequestException(
          'Missing required fields: id, name, command'
        );
      }

      await this.mcpManager.addServerConfig(config);
      return { success: true };
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(errorMessage);
    }
  }

  @Put('servers/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update an MCP server' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiBody({ type: UpdateMcpServerDto })
  @ApiResponse({ status: 200, description: 'Server updated successfully' })
  @ApiResponse({ status: 404, description: 'Server not found' })
  async updateServer(
    @Param('id') id: string,
    @Body() updates: UpdateMcpServerDto
  ) {
    try {
      await this.mcpManager.updateServer(id, updates);
      return { success: true };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(errorMessage);
    }
  }

  @Delete('servers/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an MCP server' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 200, description: 'Server deleted successfully' })
  @ApiResponse({ status: 404, description: 'Server not found' })
  async deleteServer(@Param('id') id: string) {
    try {
      await this.mcpManager.removeServer(id);
      return { success: true };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(errorMessage);
    }
  }

  @Get('tools')
  @ApiOperation({ summary: 'Get available MCP tools' })
  @ApiResponse({
    status: 200,
    description: 'List of available tools',
    schema: {
      type: 'object',
      properties: {
        tools: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              inputSchema: { type: 'object' },
              serverId: { type: 'string' },
            },
          },
        },
      },
    },
  })
  async getTools() {
    try {
      const tools = await this.mcpManager.getAvailableTools();
      return { tools };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(errorMessage);
    }
  }

  @Get('status')
  @ApiOperation({ summary: 'Get MCP system status' })
  @ApiResponse({
    status: 200,
    description: 'MCP status',
    schema: {
      type: 'object',
      properties: {
        connectedServers: { type: 'number' },
        totalServers: { type: 'number' },
        totalTools: { type: 'number' },
        servers: { type: 'array', items: { type: 'object' } },
      },
    },
  })
  async getStatus() {
    try {
      const connectedServers = await this.mcpManager.getServerConfigs();
      const tools = await this.mcpManager.getAvailableTools();

      return {
        connectedServers: connectedServers.filter(s => s.enabled).length,
        totalServers: connectedServers.length,
        totalTools: tools.length,
        servers: connectedServers,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(errorMessage);
    }
  }

  @Get('logs')
  @ApiOperation({ summary: 'Get MCP logs' })
  @ApiResponse({
    status: 200,
    description: 'MCP logs',
    schema: {
      type: 'object',
      properties: {
        logs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              timestamp: { type: 'number' },
              serverId: { type: 'string' },
              level: { type: 'string', enum: ['info', 'error', 'warn'] },
              message: { type: 'string' },
            },
          },
        },
      },
    },
  })
  async getLogs() {
    try {
      const logs = await this.mcpManager.getLogs();
      return { logs };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(errorMessage);
    }
  }

  @Get('diagnostics')
  @ApiOperation({ summary: 'Get MCP diagnostics' })
  @ApiResponse({
    status: 200,
    description: 'Diagnostic information',
    schema: {
      type: 'object',
      additionalProperties: true,
    },
  })
  async getDiagnostics() {
    try {
      const diagnostics = await this.mcpManager.getServerLogs();
      return diagnostics;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(errorMessage);
    }
  }

  @Post('refresh-cache')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh MCP cache' })
  @ApiResponse({
    status: 200,
    description: 'Cache refreshed',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  async refreshCache() {
    try {
      // MCPManager has refreshCommandCache method
      await this.mcpManager.refreshAll();
      return { success: true, message: 'Command cache refreshed' };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(errorMessage);
    }
  }

  @Get('processes')
  @ApiOperation({ summary: 'Get MCP processes' })
  @ApiResponse({
    status: 200,
    description: 'List of processes',
    schema: {
      type: 'object',
      properties: {
        processes: { type: 'array', items: { type: 'object' } },
      },
    },
  })
  async getProcesses() {
    try {
      // MCPManager should have getServerProcessInfo method
      const servers = await this.mcpManager.getServerConfigs();
      const processes = servers.map(server => ({
        id: server.id,
        name: server.name,
        enabled: server.enabled,
        status: 'unknown', // Will be populated when process info is available
      }));
      return { processes };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(errorMessage);
    }
  }

  @Get('server-logs')
  @ApiOperation({ summary: 'Get server-specific logs' })
  @ApiResponse({
    status: 200,
    description: 'Server logs',
    schema: {
      type: 'object',
      properties: {
        logs: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  async getServerLogs(
    @Query('serverId') serverId?: string,
    @Query('stderrOnly') stderrOnly?: string
  ) {
    try {
      const stderrOnlyBool = stderrOnly === 'true';
      const logs = await this.mcpManager.getServerLogs(
        serverId,
        stderrOnlyBool
      );
      return { logs };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(errorMessage);
    }
  }

  @Get('config')
  @ApiOperation({ summary: 'Get MCP configuration' })
  @ApiResponse({
    status: 200,
    description: 'Current configuration',
    schema: {
      type: 'object',
      properties: {
        config: { type: 'string' },
      },
    },
  })
  async getConfig() {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const { getMindstrikeDirectory } = await import(
        '../../../server/utils/settingsDirectory'
      );
      const configPath = path.join(getMindstrikeDirectory(), 'mcp-config.json');
      try {
        const configData = await fs.readFile(configPath, 'utf-8');
        return { config: configData };
      } catch (error: unknown) {
        if ((error as { code?: string }).code === 'ENOENT') {
          // Return default config if file doesn't exist
          const defaultConfig = {
            mcpServers: {},
          };
          return { config: JSON.stringify(defaultConfig, null, 2) };
        }
        throw error;
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(errorMessage);
    }
  }

  @Post('config')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update MCP configuration' })
  @ApiBody({ type: McpConfigDto })
  @ApiResponse({
    status: 200,
    description: 'Configuration updated',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid configuration' })
  async updateConfig(@Body() body: { config: string }) {
    try {
      const { config } = body;
      if (typeof config !== 'string') {
        throw new BadRequestException('Config must be a string');
      }

      // Validate JSON
      try {
        const parsed: { mcpServers?: Record<string, unknown> } = JSON.parse(
          config
        ) as { mcpServers?: Record<string, unknown> };
        if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object') {
          throw new BadRequestException(
            'Config must contain mcpServers object'
          );
        }
      } catch {
        throw new BadRequestException('Invalid JSON format');
      }

      const fs = await import('fs/promises');
      const path = await import('path');
      const { getMindstrikeDirectory } = await import(
        '../../../server/utils/settingsDirectory'
      );
      const configPath = path.join(getMindstrikeDirectory(), 'mcp-config.json');

      // Ensure directory exists
      await fs.mkdir(getMindstrikeDirectory(), { recursive: true });
      await fs.writeFile(configPath, config, 'utf-8');

      // Reload MCP manager with new config
      await this.mcpManager.refreshAll();

      return { success: true };
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(errorMessage);
    }
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh MCP servers' })
  @ApiResponse({
    status: 200,
    description: 'Servers refreshed',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  })
  async refreshServers() {
    try {
      await this.mcpManager.refreshAll();
      return { success: true };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(errorMessage);
    }
  }
}
