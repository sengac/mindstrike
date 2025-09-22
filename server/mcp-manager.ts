import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  StdioClientTransport,
  type StdioServerParameters,
} from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

import path from 'path';
import fs from 'fs/promises';
import EventEmitter from 'events';
import { logger } from './logger.js';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getMindstrikeDirectory } from './utils/settings-directory.js';
import { sseManager } from './sse-manager.js';
import { CommandResolver } from './utils/command-resolver.js';
import { lfsManager } from './lfs-manager.js';
import { SSEEventType } from '../src/types.js';

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
  private transports: Map<string, StdioClientTransport> = new Map();
  private processInfoInterval: NodeJS.Timeout | null = null;
  private configPath: string;
  private workspaceRoot: string;
  private logs: Array<{
    id: string;
    timestamp: number;
    serverId: string;
    level: 'info' | 'error' | 'warn';
    message: string;
  }> = [];

  constructor(configPath?: string, workspaceRoot?: string) {
    super();
    const mindstrikeDir = getMindstrikeDirectory();
    this.configPath = configPath || path.join(mindstrikeDir, 'mcp-config.json');
    this.workspaceRoot = workspaceRoot || process.cwd();

    // Set up periodic process info broadcasting
    this.startProcessInfoBroadcasting();
  }

  private logMCP(
    serverId: string,
    level: 'info' | 'error' | 'warn',
    message: string,
    logToConsole: boolean = true
  ): void {
    const logEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      serverId,
      level,
      message,
    };

    // Keep only the last 1000 logs
    this.logs.unshift(logEntry);
    if (this.logs.length > 1000) {
      this.logs = this.logs.slice(0, 1000);
    }

    // Broadcast to clients via SSE
    sseManager.broadcast('unified-events', {
      type: SSEEventType.MCP_LOG,
      ...logEntry,
    });

    // Optionally log to console
    if (logToConsole) {
      logger[level](`[MCP:${serverId}] ${message}`);
    }
  }

  async initialize(): Promise<void> {
    try {
      // Ensure the mindstrike directory exists
      const mindstrikeDir = getMindstrikeDirectory();
      await fs.mkdir(mindstrikeDir, { recursive: true });

      await this.loadConfig();
      await this.connectToEnabledServers();
      this.logMCP('manager', 'info', 'Initialized successfully');
    } catch (error: any) {
      logger.error('[MCPManager] Failed to initialize:', error);
    }
  }

  setWorkspaceRoot(workspaceRoot: string): void {
    if (this.workspaceRoot !== workspaceRoot) {
      this.workspaceRoot = workspaceRoot;
      this.logMCP(
        'manager',
        'info',
        `Workspace root updated to: ${workspaceRoot}`
      );
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
      this.logMCP('manager', 'info', `Loading config from: ${this.configPath}`);

      // Check if config file exists
      try {
        await fs.access(this.configPath, fs.constants.F_OK);
        this.logMCP(
          'manager',
          'info',
          `Config file exists at ${this.configPath}`
        );
      } catch {
        this.logMCP(
          'manager',
          'warn',
          `Config file does not exist at ${this.configPath}`
        );
        throw { code: 'ENOENT' };
      }

      const configData = await fs.readFile(this.configPath, 'utf-8');
      this.logMCP(
        'manager',
        'info',
        `Config file size: ${configData.length} bytes`
      );

      const config = JSON.parse(configData);
      this.logMCP(
        'manager',
        'info',
        `Parsed config with keys: ${Object.keys(config).join(', ')}`
      );

      // Clear existing servers before loading new ones
      this.servers.clear();

      if (config.mcpServers && typeof config.mcpServers === 'object') {
        const serverIds = Object.keys(config.mcpServers);
        this.logMCP(
          'manager',
          'info',
          `Found ${serverIds.length} server configs: ${serverIds.join(', ')}`
        );

        for (const [serverId, serverConfig] of Object.entries(
          config.mcpServers
        )) {
          const configData = serverConfig as Partial<MCPServerConfig>;

          // Ensure required fields are present
          if (!configData.command) {
            this.logMCP(
              'manager',
              'warn',
              `Server config for ${serverId} missing required 'command' field`
            );
            continue;
          }

          const fullConfig: MCPServerConfig = {
            id: serverId,
            name: serverId, // Use ID as name by default
            command: configData.command,
            args: configData.args,
            env: configData.env,
            transport: configData.transport,
            url: configData.url,
            description: configData.description,
            enabled:
              configData.enabled !== undefined ? configData.enabled : true, // Default to enabled for MCP spec format
          };

          if (this.isValidServerConfig(fullConfig)) {
            this.servers.set(serverId, fullConfig);
            this.logMCP('manager', 'info', `Added server config: ${serverId}`);
          } else {
            this.logMCP(
              'manager',
              'warn',
              `Invalid server config for ${serverId}: ${JSON.stringify(serverConfig)}`
            );
          }
        }
      } else {
        this.logMCP('manager', 'warn', `No mcpServers section found in config`);
      }

      this.logMCP(
        'manager',
        'info',
        `Loaded ${this.servers.size} server configurations from ${this.configPath}`
      );
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        this.logMCP(
          'manager',
          'info',
          `No config file found at ${this.configPath}, creating default`
        );
        await this.createDefaultConfig();
      } else {
        this.logMCP(
          'manager',
          'error',
          `Failed to load config from ${this.configPath}: ${error.message}`
        );
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
          args: [
            '@modelcontextprotocol/server-filesystem',
            '[[WORKSPACE_ROOT]]',
          ],
          description: 'File system operations - read, write, and list files',
        },
      },
    };

    await fs.writeFile(this.configPath, JSON.stringify(defaultConfig, null, 2));
    this.logMCP('manager', 'info', 'Created default config file');
  }

  private async connectToEnabledServers(): Promise<void> {
    const enabledServers = Array.from(this.servers.values()).filter(
      s => s.enabled !== false
    );

    for (const server of enabledServers) {
      try {
        await this.connectToServer(server);
      } catch (error: any) {
        this.logMCP(server.id, 'error', `Failed to connect: ${error.message}`);
      }
    }
  }

  private replaceWorkspaceRoot(config: MCPServerConfig): MCPServerConfig {
    const replacedConfig = { ...config };

    // Replace [[WORKSPACE_ROOT]] in command
    if (replacedConfig.command) {
      replacedConfig.command = replacedConfig.command.replace(
        /\[\[WORKSPACE_ROOT\]\]/g,
        this.workspaceRoot
      );
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
          replacedEnv[key] = value.replace(
            /\[\[WORKSPACE_ROOT\]\]/g,
            this.workspaceRoot
          );
        }
      }
      replacedConfig.env = replacedEnv;
    }

    // Replace [[WORKSPACE_ROOT]] in URL for SSE transport
    if (replacedConfig.url) {
      replacedConfig.url = replacedConfig.url.replace(
        /\[\[WORKSPACE_ROOT\]\]/g,
        this.workspaceRoot
      );
    }

    return replacedConfig;
  }

  private async connectToServer(serverConfig: MCPServerConfig): Promise<void> {
    this.logMCP(serverConfig.id, 'info', `Attempting to connect to server`);

    // Replace workspace root placeholders in configuration
    const processedConfig = this.replaceWorkspaceRoot(serverConfig);

    const client = new Client(
      {
        name: 'mindstrike-client',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    let transport: StdioClientTransport | SSEClientTransport | null = null;

    try {
      if (processedConfig.transport === 'sse' && processedConfig.url) {
        // SSE transport
        this.logMCP(
          serverConfig.id,
          'info',
          `Using SSE transport: ${processedConfig.url}`
        );
        transport = new SSEClientTransport(new URL(processedConfig.url));
        await client.connect(transport);
      } else {
        // Default to stdio transport - resolve command first
        const commandResolution = await CommandResolver.resolveCommand(
          processedConfig.command,
          processedConfig.args || []
        );

        if (!commandResolution.available) {
          const instructions = CommandResolver.getInstallationInstructions(
            processedConfig.command
          );
          this.logMCP(
            serverConfig.id,
            'error',
            `Command '${processedConfig.command}' not available. ${instructions.message}`
          );

          // Broadcast installation instructions via SSE
          sseManager.broadcast('unified-events', {
            type: 'command-missing',
            serverId: serverConfig.id,
            command: processedConfig.command,
            instructions,
          });

          throw new Error(
            `Command '${processedConfig.command}' not available. Please install ${processedConfig.command} and ensure it's in your PATH.`
          );
        }

        this.logMCP(
          serverConfig.id,
          'info',
          `Using stdio transport: ${commandResolution.command} ${commandResolution.args.join(' ')}` +
            (commandResolution.fallbackUsed
              ? ` (using ${commandResolution.fallbackUsed})`
              : '')
        );

        const filteredEnv = Object.fromEntries(
          Object.entries(process.env).filter(
            ([_, value]) => value !== undefined
          )
        ) as Record<string, string>;

        const transportParams: StdioServerParameters = {
          command: commandResolution.command,
          args: commandResolution.args,
          env: { ...filteredEnv, ...processedConfig.env },
          stderr: 'pipe', // Pipe stderr so we can monitor it
        };

        transport = new StdioClientTransport(transportParams);

        // Set up stderr monitoring before connecting
        const stderrStream = transport.stderr;
        if (stderrStream) {
          stderrStream.on('data', (chunk: Buffer) => {
            const output = chunk.toString('utf-8').trim();
            if (output) {
              this.logMCP(
                serverConfig.id,
                'info',
                `[stderr] ${output}`,
                false // Don't log to console, only to MCP logs
              );

              // Broadcast stderr log via SSE
              sseManager.broadcast('unified-events', {
                type: SSEEventType.MCP_STDERR_LOG,
                id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                timestamp: Date.now(),
                serverId: serverConfig.id,
                message: output,
              });
            }
          });

          stderrStream.on('error', (error: Error) => {
            this.logMCP(
              serverConfig.id,
              'error',
              `[stderr error] ${error.message}`
            );
          });
        }

        // Set up protocol message monitoring (intercept MCP messages)
        const originalOnMessage = transport.onmessage;
        transport.onmessage = message => {
          // Only log non-routine messages to avoid spam
          const shouldLog =
            message &&
            typeof message === 'object' &&
            ('error' in message ||
              ('method' in message && message.method !== 'ping') ||
              ('result' in message &&
                Object.keys(message.result || {}).length > 0));

          if (shouldLog) {
            const messageStr = JSON.stringify(message, null, 2);
            this.logMCP(
              serverConfig.id,
              'info',
              `[protocol] ${messageStr}`,
              false // Don't log to console, only to MCP logs
            );

            // Broadcast protocol message via SSE
            sseManager.broadcast('unified-events', {
              type: SSEEventType.MCP_STDOUT_LOG,
              id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              timestamp: Date.now(),
              serverId: serverConfig.id,
              message: `Protocol: ${messageStr}`,
            });
          }

          // Call original handler
          if (originalOnMessage) {
            originalOnMessage.call(transport, message);
          }
        };

        await client.connect(transport);

        // Store the transport for process monitoring if it's stdio
        if (transport instanceof StdioClientTransport) {
          this.transports.set(serverConfig.id, transport);
        }
      }

      // Get available tools from the server
      const listResult = await client.listTools({});

      if (listResult.tools) {
        for (const tool of listResult.tools) {
          const mcpTool: MCPTool = {
            name: tool.name,
            description: tool.description || '',
            inputSchema: tool.inputSchema || {},
            serverId: serverConfig.id,
          };

          this.tools.set(`${serverConfig.id}:${tool.name}`, mcpTool);
        }
      }

      this.clients.set(serverConfig.id, client);
      this.logMCP(
        serverConfig.id,
        'info',
        `Connected successfully with ${listResult.tools?.length || 0} tools`
      );

      // Broadcast server connected event via SSE
      sseManager.broadcast('unified-events', {
        type: SSEEventType.MCP_SERVER_CONNECTED,
        serverId: serverConfig.id,
        pid: transport instanceof StdioClientTransport ? transport.pid : null,
        toolsCount: listResult.tools?.length || 0,
        timestamp: Date.now(),
      });

      this.emit('serverConnected', serverConfig.id);
      this.emit('toolsChanged');
    } catch (error: any) {
      this.logMCP(
        serverConfig.id,
        'error',
        `Failed to connect: ${error.message}`
      );
      throw error;
    }
  }

  async disconnectFromServer(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (client) {
      try {
        await client.close();
        this.clients.delete(serverId);

        // Remove transport if it exists
        this.transports.delete(serverId);

        // Remove tools from this server
        const toolsToRemove = Array.from(this.tools.keys()).filter(key =>
          key.startsWith(`${serverId}:`)
        );
        for (const toolKey of toolsToRemove) {
          this.tools.delete(toolKey);
        }

        this.logMCP(serverId, 'info', 'Disconnected from server');

        // Broadcast server disconnected event via SSE
        sseManager.broadcast('unified-events', {
          type: SSEEventType.MCP_SERVER_DISCONNECTED,
          serverId,
          timestamp: Date.now(),
        });

        this.emit('serverDisconnected', serverId);
        this.emit('toolsChanged');
      } catch (error: any) {
        this.logMCP(serverId, 'error', `Error disconnecting: ${error.message}`);
      }
    }
  }

  async executeTool(
    serverId: string,
    toolName: string,
    args: any
  ): Promise<any> {
    const client = this.clients.get(serverId);
    if (!client) {
      this.logMCP(
        serverId,
        'error',
        `No client connected for server ${serverId} when trying to execute tool ${toolName}`
      );
      throw new Error(`No client connected for server ${serverId}`);
    }

    try {
      // Log the tool execution request (only to MCP logs, not console)
      const argsStr =
        args && Object.keys(args).length > 0 ? JSON.stringify(args) : '{}';
      this.logMCP(
        serverId,
        'info',
        `🔧 Executing tool ${toolName} with args: ${argsStr}`,
        false
      );

      const result = await client.callTool({
        name: toolName,
        arguments: args || {},
      });

      // Process result content and potentially store in LFS
      let resultContent: string;
      if (typeof result.content === 'string') {
        resultContent = result.content;
      } else {
        resultContent = JSON.stringify(result.content);
      }

      // Store in LFS if content is over 1024 bytes
      const processedContent = await lfsManager.storeContent(resultContent);

      // Log successful execution with processed result (only to MCP logs, not console)
      const logContent = lfsManager.isLFSReference(processedContent)
        ? `${processedContent} (stored in LFS, original size: ${Buffer.byteLength(resultContent, 'utf8')} bytes)`
        : processedContent;

      this.logMCP(
        serverId,
        'info',
        `✅ Tool ${toolName} completed successfully. Result: ${logContent}`,
        false
      );

      return processedContent;
    } catch (error: any) {
      this.logMCP(
        serverId,
        'error',
        `❌ Tool ${toolName} execution failed: ${error.message}`
      );
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
              this.logMCP(
                serverId,
                'info',
                `LangChain tool wrapper calling ${toolName} with input: ${JSON.stringify(input)}`,
                false
              );
              const result = await this.executeTool(serverId, toolName, input);
              this.logMCP(
                serverId,
                'info',
                `LangChain tool wrapper received result from ${toolName}`,
                false
              );

              // Retrieve content from LFS if needed
              if (
                typeof result === 'string' &&
                lfsManager.isLFSReference(result)
              ) {
                const retrievedContent = lfsManager.retrieveContent(result);
                return retrievedContent || result;
              }

              return typeof result === 'string'
                ? result
                : JSON.stringify(result);
            } catch (error: any) {
              this.logMCP(
                serverId,
                'error',
                `LangChain tool wrapper error for ${toolName}: ${error.message}`
              );
              return `Error executing MCP tool: ${error.message}`;
            }
          },
        });

        tools.push(tool);
      } catch (error: any) {
        logger.error(
          `[MCPManager] Failed to create LangChain tool for ${toolKey}:`,
          error
        );
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

  async updateServerConfig(
    serverId: string,
    updates: Partial<MCPServerConfig>
  ): Promise<void> {
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
    try {
      this.logMCP('manager', 'info', `Saving config to: ${this.configPath}`);

      // Ensure the directory exists
      const configDir = path.dirname(this.configPath);
      await fs.mkdir(configDir, { recursive: true });
      this.logMCP(
        'manager',
        'info',
        `Ensured config directory exists: ${configDir}`
      );

      const mcpServers: Record<string, any> = {};

      this.logMCP(
        'manager',
        'info',
        `Preparing to save ${this.servers.size} server configs`
      );

      for (const [id, server] of this.servers.entries()) {
        mcpServers[id] = {
          command: server.command,
          args: server.args || [],
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
        if (server.enabled !== undefined) {
          mcpServers[id].enabled = server.enabled;
        }

        this.logMCP('manager', 'info', `Prepared config for server: ${id}`);
      }

      const config = { mcpServers };
      const configJson = JSON.stringify(config, null, 2);

      this.logMCP(
        'manager',
        'info',
        `Writing config: ${configJson.length} bytes`
      );
      await fs.writeFile(this.configPath, configJson);

      // Verify the file was written
      try {
        const verifyData = await fs.readFile(this.configPath, 'utf-8');
        this.logMCP(
          'manager',
          'info',
          `Verified config file written: ${verifyData.length} bytes`
        );
      } catch (verifyError) {
        this.logMCP(
          'manager',
          'error',
          `Failed to verify config file: ${verifyError}`
        );
      }

      this.logMCP('manager', 'info', 'Successfully saved configuration');
    } catch (error: any) {
      this.logMCP(
        'manager',
        'error',
        `Failed to save config: ${error.message}`
      );
      throw error;
    }
  }

  async reload(): Promise<void> {
    try {
      this.logMCP('manager', 'info', 'Reloading configuration...');

      // Disconnect all current clients
      for (const [serverId] of this.clients) {
        await this.disconnectFromServer(serverId);
      }

      // Reload config and reconnect
      await this.loadConfig();
      await this.connectToEnabledServers();

      this.logMCP('manager', 'info', 'Configuration reloaded successfully');
      this.emit('configReloaded');
    } catch (error: any) {
      this.logMCP(
        'manager',
        'error',
        `Failed to reload configuration: ${error.message}`
      );
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    // Stop process info broadcasting
    this.stopProcessInfoBroadcasting();

    for (const [serverId] of this.clients) {
      await this.disconnectFromServer(serverId);
    }
    this.logMCP('manager', 'info', 'Shutdown complete');
  }

  getLogs(): Array<{
    id: string;
    timestamp: number;
    serverId: string;
    level: 'info' | 'error' | 'warn';
    message: string;
  }> {
    return [...this.logs];
  }

  /**
   * Get diagnostic information about command availability
   */
  async getDiagnostics(): Promise<{
    bundledServers: Array<{ name: string; available: boolean; path?: string }>;
    commandResolutions: Array<{
      command: string;
      available: boolean;
      resolvedPath?: string;
      fallbackUsed?: string;
    }>;
    systemInfo: {
      platform: string;
      nodeVersion?: string;
      npmVersion?: string;
    };
  }> {
    const bundledServers = Array.from(
      CommandResolver.getBundledServers().entries()
    ).map(([key, info]) => ({
      name: key,
      available: !!info.bundledPath,
      path: info.bundledPath,
    }));

    const commandResolutions = Array.from(
      CommandResolver.getCachedResolutions().entries()
    ).map(([key, resolution]) => ({
      command: key,
      available: resolution.available,
      resolvedPath: resolution.resolvedPath,
      fallbackUsed: resolution.fallbackUsed,
    }));

    let nodeVersion: string | undefined;
    let npmVersion: string | undefined;

    try {
      const { execSync } = await import('child_process');
      nodeVersion = execSync('node --version', {
        encoding: 'utf8',
        timeout: 5000,
      }).trim();
    } catch {
      // Ignore error - nodeVersion will remain as default empty string
    }

    try {
      const { execSync } = await import('child_process');
      npmVersion = execSync('npm --version', {
        encoding: 'utf8',
        timeout: 5000,
      }).trim();
    } catch {
      // Ignore error - npmVersion will remain as default empty string
    }

    return {
      bundledServers,
      commandResolutions,
      systemInfo: {
        platform: process.platform,
        nodeVersion,
        npmVersion,
      },
    };
  }

  /**
   * Force refresh of command resolver cache
   */
  refreshCommandCache(): void {
    CommandResolver.clearCache();
    this.logMCP('manager', 'info', 'Command cache refreshed');
  }

  /**
   * Start periodic broadcasting of process information
   */
  private startProcessInfoBroadcasting(): void {
    // Broadcast immediately
    this.broadcastProcessInfo();

    // Then broadcast every 10 seconds
    this.processInfoInterval = setInterval(() => {
      this.broadcastProcessInfo();
    }, 10000);
  }

  /**
   * Broadcast current process information via SSE
   */
  private broadcastProcessInfo(): void {
    const processInfo = this.getServerProcessInfo();

    sseManager.broadcast('unified-events', {
      type: SSEEventType.MCP_PROCESS_INFO,
      processes: processInfo,
      timestamp: Date.now(),
    });
  }

  /**
   * Stop process info broadcasting
   */
  private stopProcessInfoBroadcasting(): void {
    if (this.processInfoInterval) {
      clearInterval(this.processInfoInterval);
      this.processInfoInterval = null;
    }
  }

  /**
   * Get information about running MCP server processes
   */
  getServerProcessInfo(): Array<{
    serverId: string;
    pid: number | null;
    hasStderr: boolean;
    isConnected: boolean;
  }> {
    const processInfo: Array<{
      serverId: string;
      pid: number | null;
      hasStderr: boolean;
      isConnected: boolean;
    }> = [];

    for (const [serverId, transport] of this.transports.entries()) {
      processInfo.push({
        serverId,
        pid: transport.pid,
        hasStderr: transport.stderr !== null,
        isConnected: this.clients.has(serverId),
      });
    }

    return processInfo;
  }

  /**
   * Get filtered logs for a specific server, optionally filtering by stderr messages
   */
  getServerLogs(
    serverId?: string,
    stderrOnly: boolean = false
  ): Array<{
    id: string;
    timestamp: number;
    serverId: string;
    level: 'info' | 'error' | 'warn';
    message: string;
  }> {
    let filteredLogs = this.logs;

    if (serverId) {
      filteredLogs = filteredLogs.filter(log => log.serverId === serverId);
    }

    if (stderrOnly) {
      filteredLogs = filteredLogs.filter(log =>
        log.message.includes('[stderr]')
      );
    }

    return filteredLogs;
  }
}

// Singleton instance - will be updated with workspace root from server/index.ts
export const mcpManager = new MCPManager();
