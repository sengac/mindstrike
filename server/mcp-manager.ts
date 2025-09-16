import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import EventEmitter from 'events';
import { logger } from './logger.js';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getMindstrikeDirectory } from './utils/settings-directory.js';

export interface MCPServerConfig {
  id: string;
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  transport?: 'stdio' | 'sse';
  url?: string; // for SSE transport
  enabled?: boolean; // Optional for UI purposes
  description?: string; // Optional for UI purposes
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
  serverId: string;
}

export class MCPManager extends EventEmitter {
  private clients: Map<string, Client> = new Map();
  private servers: Map<string, MCPServerConfig> = new Map();
  private tools: Map<string, MCPTool> = new Map();
  private configPath: string;
  private workspaceRoot: string;

  constructor(configPath?: string, workspaceRoot?: string) {
    super();
    this.configPath = configPath || path.join(getMindstrikeDirectory(), 'mcp-config.json');
    this.workspaceRoot = workspaceRoot || process.cwd();
  }

  async initialize(): Promise<void> {
    try {
      // Ensure the mindstrike directory exists
      const mindstrikeDir = getMindstrikeDirectory();
      await fs.mkdir(mindstrikeDir, { recursive: true });
      
      await this.loadConfig();
      await this.connectToEnabledServers();
      logger.info('[MCPManager] Initialized successfully');
    } catch (error: any) {
      logger.error('[MCPManager] Failed to initialize:', error);
    }
  }

  setWorkspaceRoot(workspaceRoot: string): void {
    if (this.workspaceRoot !== workspaceRoot) {
      this.workspaceRoot = workspaceRoot;
      logger.info(`[MCPManager] Workspace root updated to: ${workspaceRoot}`);
      // Reconnect to all servers with updated workspace root
      this.reconnectAllServers();
    }
  }

  private async reconnectAllServers(): Promise<void> {
    // Disconnect all current connections
    for (const [serverId] of this.clients.entries()) {
      await this.disconnectFromServer(serverId);
    }
    
    // Reconnect with updated configurations
    await this.connectToEnabledServers();
    this.emit('toolsChanged'); 
  }

  private async loadConfig(): Promise<void> {
    try {
      logger.info(`[MCPManager] Loading config from: ${this.configPath}`);
      const configData = await fs.readFile(this.configPath, 'utf-8');
      const config = JSON.parse(configData);
      
      // Clear existing servers before loading new ones
      this.servers.clear();
      
      if (config.mcpServers && typeof config.mcpServers === 'object') {
        for (const [serverId, serverConfig] of Object.entries(config.mcpServers)) {
          const fullConfig: MCPServerConfig = {
            id: serverId,
            name: serverId, // Use ID as name by default
            ...(serverConfig as any),
            enabled: true // Default to enabled for MCP spec format
          };
          
          if (this.isValidServerConfig(fullConfig)) {
            this.servers.set(serverId, fullConfig);
          } else {
            logger.warn(`[MCPManager] Invalid server config for ${serverId}:`, serverConfig);
          }
        }
      }
      
      logger.info(`[MCPManager] Loaded ${this.servers.size} server configurations from ${this.configPath}`);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        logger.info(`[MCPManager] No config file found at ${this.configPath}, creating default`);
        await this.createDefaultConfig();
      } else {
        logger.error(`[MCPManager] Failed to load config from ${this.configPath}:`, error);
      }
    }
  }

  private isValidServerConfig(config: any): config is MCPServerConfig {
    return (
      typeof config === 'object' &&
      typeof config.id === 'string' &&
      typeof config.command === 'string'
    );
  }

  private async createDefaultConfig(): Promise<void> {
    const defaultConfig = {
      mcpServers: {
        filesystem: {
          command: 'npx',
          args: ['@modelcontextprotocol/server-filesystem', '[[WORKSPACE_ROOT]]']
        }
      }
    };

    await fs.writeFile(this.configPath, JSON.stringify(defaultConfig, null, 2));
    logger.info('[MCPManager] Created default config file');
  }

  private async connectToEnabledServers(): Promise<void> {
    const enabledServers = Array.from(this.servers.values()).filter(s => s.enabled !== false);
    
    for (const server of enabledServers) {
      try {
        await this.connectToServer(server);
      } catch (error: any) {
        logger.error(`[MCPManager] Failed to connect to server ${server.id}:`, error);
      }
    }
  }

  private replaceWorkspaceRoot(config: MCPServerConfig): MCPServerConfig {
    const replacedConfig = { ...config };
    
    // Replace [[WORKSPACE_ROOT]] in command
    if (replacedConfig.command) {
      replacedConfig.command = replacedConfig.command.replace(/\[\[WORKSPACE_ROOT\]\]/g, this.workspaceRoot);
    }
    
    // Replace [[WORKSPACE_ROOT]] in args
    if (replacedConfig.args) {
      replacedConfig.args = replacedConfig.args.map(arg => 
        arg.replace(/\[\[WORKSPACE_ROOT\]\]/g, this.workspaceRoot)
      );
    }
    
    // Replace [[WORKSPACE_ROOT]] in env variables
    if (replacedConfig.env) {
      const replacedEnv: Record<string, string> = {};
      for (const [key, value] of Object.entries(replacedConfig.env)) {
        if (value !== undefined) {
          replacedEnv[key] = value.replace(/\[\[WORKSPACE_ROOT\]\]/g, this.workspaceRoot);
        }
      }
      replacedConfig.env = replacedEnv;
    }
    
    // Replace [[WORKSPACE_ROOT]] in URL for SSE transport
    if (replacedConfig.url) {
      replacedConfig.url = replacedConfig.url.replace(/\[\[WORKSPACE_ROOT\]\]/g, this.workspaceRoot);
    }
    
    return replacedConfig;
  }

  private async connectToServer(serverConfig: MCPServerConfig): Promise<void> {
    // Replace workspace root placeholders in configuration
    const processedConfig = this.replaceWorkspaceRoot(serverConfig);
    
    const client = new Client(
      {
        name: 'mindstrike-client',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    try {
      if (processedConfig.transport === 'sse' && processedConfig.url) {
        // SSE transport
        const transport = new SSEClientTransport(new URL(processedConfig.url));
        await client.connect(transport);
      } else {
        // Default to stdio transport
        const filteredEnv = Object.fromEntries(
          Object.entries(process.env).filter(([_, value]) => value !== undefined)
        ) as Record<string, string>;
        
        const transport = new StdioClientTransport({
          command: processedConfig.command,
          args: processedConfig.args || [],
          env: { ...filteredEnv, ...processedConfig.env }
        });

        await client.connect(transport);
      }

      // Get available tools from the server
      const listResult = await client.listTools({});
      
      if (listResult.tools) {
        for (const tool of listResult.tools) {
          const mcpTool: MCPTool = {
            name: tool.name,
            description: tool.description || '',
            inputSchema: tool.inputSchema || {},
            serverId: serverConfig.id
          };
          
          this.tools.set(`${serverConfig.id}:${tool.name}`, mcpTool);
        }
      }

      this.clients.set(serverConfig.id, client);
      logger.info(`[MCPManager] Connected to server ${serverConfig.id} with ${listResult.tools?.length || 0} tools`);
      
      this.emit('serverConnected', serverConfig.id);
      this.emit('toolsChanged');
      
    } catch (error: any) {
      logger.error(`[MCPManager] Failed to connect to server ${serverConfig.id}:`, error);
      throw error;
    }
  }

  async disconnectFromServer(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (client) {
      try {
        await client.close();
        this.clients.delete(serverId);
        
        // Remove tools from this server
        const toolsToRemove = Array.from(this.tools.keys()).filter(key => key.startsWith(`${serverId}:`));
        for (const toolKey of toolsToRemove) {
          this.tools.delete(toolKey);
        }
        
        logger.info(`[MCPManager] Disconnected from server ${serverId}`);
        this.emit('serverDisconnected', serverId);
        this.emit('toolsChanged');
      } catch (error: any) {
        logger.error(`[MCPManager] Error disconnecting from server ${serverId}:`, error);
      }
    }
  }

  async executeTool(serverId: string, toolName: string, args: any): Promise<any> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`No client connected for server ${serverId}`);
    }

    try {
      const result = await client.callTool({
        name: toolName,
        arguments: args || {}
      });

      return result.content;
    } catch (error: any) {
      logger.error(`[MCPManager] Tool execution failed for ${serverId}:${toolName}:`, error);
      throw error;
    }
  }

  getLangChainTools(): DynamicStructuredTool[] {
    const tools: DynamicStructuredTool[] = [];

    for (const [toolKey, mcpTool] of this.tools.entries()) {
      const [serverId, toolName] = toolKey.split(':');
      
      try {
        // Convert MCP input schema to Zod schema
        const zodSchema = this.convertToZodSchema(mcpTool.inputSchema);
        
        const tool = new DynamicStructuredTool({
          name: `mcp_${serverId}_${toolName}`,
          description: `[MCP:${serverId}] ${mcpTool.description}`,
          schema: zodSchema,
          func: async (input: any) => {
            try {
              const result = await this.executeTool(serverId, toolName, input);
              return typeof result === 'string' ? result : JSON.stringify(result);
            } catch (error: any) {
              return `Error executing MCP tool: ${error.message}`;
            }
          }
        });

        tools.push(tool);
      } catch (error: any) {
        logger.error(`[MCPManager] Failed to create LangChain tool for ${toolKey}:`, error);
      }
    }

    return tools;
  }

  private convertToZodSchema(inputSchema: any): z.ZodType<any> {
    if (!inputSchema || typeof inputSchema !== 'object') {
      return z.object({}).optional();
    }

    try {
      // Basic JSON Schema to Zod conversion
      if (inputSchema.type === 'object' && inputSchema.properties) {
        const zodObj: Record<string, z.ZodType<any>> = {};
        
        for (const [key, prop] of Object.entries(inputSchema.properties)) {
          const propSchema = prop as any;
          
          switch (propSchema.type) {
            case 'string':
              zodObj[key] = z.string();
              break;
            case 'number':
              zodObj[key] = z.number();
              break;
            case 'boolean':
              zodObj[key] = z.boolean();
              break;
            case 'array':
              zodObj[key] = z.array(z.any());
              break;
            default:
              zodObj[key] = z.any();
          }
          
          // Make nullable if not required (OpenAI structured outputs requirement)
          if (!inputSchema.required?.includes(key)) {
            zodObj[key] = zodObj[key].nullable().default(null);
          }
        }
        
        return z.object(zodObj);
      }
      
      return z.any();
    } catch (error: any) {
      logger.warn(`[MCPManager] Failed to convert schema to Zod:`, error);
      return z.object({}).optional();
    }
  }

  getServerConfigs(): MCPServerConfig[] {
    return Array.from(this.servers.values());
  }

  getConnectedServers(): string[] {
    return Array.from(this.clients.keys());
  }

  getAvailableTools(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  async updateServerConfig(serverId: string, updates: Partial<MCPServerConfig>): Promise<void> {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }

    const updatedServer = { ...server, ...updates };
    this.servers.set(serverId, updatedServer);

    // Reconnect if enabled status changed
    if (updates.enabled !== undefined) {
      if (updates.enabled !== false && !this.clients.has(serverId)) {
        await this.connectToServer(updatedServer);
      } else if (updates.enabled === false && this.clients.has(serverId)) {
        await this.disconnectFromServer(serverId);
      }
    }

    await this.saveConfig();
  }

  async addServerConfig(config: MCPServerConfig): Promise<void> {
    this.servers.set(config.id, config);
    
    if (config.enabled !== false) {
      await this.connectToServer(config);
    }

    await this.saveConfig();
  }

  async removeServerConfig(serverId: string): Promise<void> {
    if (this.clients.has(serverId)) {
      await this.disconnectFromServer(serverId);
    }
    
    this.servers.delete(serverId);
    await this.saveConfig();
  }

  private async saveConfig(): Promise<void> {
    const mcpServers: Record<string, any> = {};
    
    for (const [id, server] of this.servers.entries()) {
      mcpServers[id] = {
        command: server.command,
        args: server.args || []
      };
      if (server.env) {
        mcpServers[id].env = server.env;
      }
      if (server.transport && server.transport !== 'stdio') {
        mcpServers[id].transport = server.transport;
      }
      if (server.url) {
        mcpServers[id].url = server.url;
      }
    }
    
    const config = { mcpServers };
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
    logger.info('[MCPManager] Saved configuration');
  }

  async reload(): Promise<void> {
    try {
      logger.info('[MCPManager] Reloading configuration...');
      
      // Disconnect all current clients
      for (const [serverId] of this.clients) {
        await this.disconnectFromServer(serverId);
      }
      
      // Reload config and reconnect
      await this.loadConfig();
      await this.connectToEnabledServers();
      
      logger.info('[MCPManager] Configuration reloaded successfully');
      this.emit('configReloaded');
    } catch (error: any) {
      logger.error('[MCPManager] Failed to reload configuration:', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    for (const [serverId] of this.clients) {
      await this.disconnectFromServer(serverId);
    }
    logger.info('[MCPManager] Shutdown complete');
  }
}

// Singleton instance - will be updated with workspace root from server/index.ts
export const mcpManager = new MCPManager();
