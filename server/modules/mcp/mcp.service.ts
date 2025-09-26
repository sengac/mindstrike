import { Injectable } from '@nestjs/common';
import { McpManagerService } from './services/mcp-manager.service';
import { CreateMcpServerDto, UpdateMcpServerDto } from './dto/mcp.dto';

@Injectable()
export class McpService {
  constructor(private readonly mcpManager: McpManagerService) {}

  async getServers() {
    return this.mcpManager.getServers();
  }

  async createServer(dto: CreateMcpServerDto) {
    return this.mcpManager.createServer({
      name: dto.name,
      command: dto.command,
      args: dto.args,
      env: dto.env,
      enabled: dto.enabled ?? true,
    });
  }

  async updateServer(id: string, dto: UpdateMcpServerDto) {
    const updated = await this.mcpManager.updateServer(id, dto);
    if (!updated) {
      throw new Error(`Server ${id} not found`);
    }
    return updated;
  }

  async deleteServer(id: string) {
    const deleted = await this.mcpManager.deleteServer(id);
    return { success: deleted };
  }

  async getTools() {
    return this.mcpManager.getAvailableTools();
  }

  async executeTool(
    serverId: string,
    toolName: string,
    params: Record<string, unknown>
  ) {
    return this.mcpManager.executeTool(serverId, toolName, params);
  }

  async getResources() {
    return this.mcpManager.getAvailableResources();
  }

  async readResource(serverId: string, uri: string) {
    return this.mcpManager.readResource(serverId, uri);
  }

  async startServer(id: string) {
    await this.mcpManager.startServer(id);
    return { success: true };
  }

  async stopServer(id: string) {
    await this.mcpManager.stopServer(id);
    return { success: true };
  }

  async restartServer(id: string) {
    await this.mcpManager.restartServer(id);
    return { success: true };
  }

  async getStatus() {
    const servers = await this.mcpManager.getServers();
    const tools = this.mcpManager.getAvailableTools();
    const activeServers = servers.filter(s => s.status === 'running').length;

    return {
      running: true,
      serversCount: servers.length,
      activeServers,
      toolsCount: tools.length,
    };
  }

  async getLogs() {
    // Stub - would return actual logs
    return [];
  }

  async getDiagnostics() {
    const servers = await this.mcpManager.getServers();
    const errorServers = servers.filter(s => s.status === 'error');

    return {
      version: '1.0.0',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      errors: errorServers.map(s => ({
        serverId: s.id,
        name: s.name,
        error: s.lastError,
      })),
    };
  }

  async refreshCache() {
    // Stub - would refresh any cached data
    return {
      success: true,
      refreshedAt: new Date().toISOString(),
    };
  }

  async getProcesses() {
    const servers = await this.mcpManager.getServers();
    return servers
      .filter(s => s.status === 'running')
      .map(s => ({
        serverId: s.id,
        name: s.name,
        startedAt: s.startedAt,
        status: s.status,
      }));
  }

  async getServerLogs(serverId?: string) {
    // Stub - would return actual server logs
    return serverId ? { [serverId]: [] } : {};
  }

  async getConfig() {
    const servers = await this.mcpManager.getServers();
    return {
      servers: Object.fromEntries(
        servers.map(s => [
          s.id,
          {
            name: s.name,
            command: s.command,
            args: s.args,
            env: s.env,
            enabled: s.enabled,
          },
        ])
      ),
    };
  }

  async updateConfig(config: Record<string, unknown>) {
    // Stub - would update configuration
    return {
      success: true,
      config,
    };
  }

  async refreshServers() {
    const servers = await this.mcpManager.getServers();
    let refreshedCount = 0;

    for (const server of servers) {
      if (server.status === 'running') {
        await this.mcpManager.restartServer(server.id);
        refreshedCount++;
      }
    }

    return {
      success: true,
      refreshedCount,
    };
  }
}
