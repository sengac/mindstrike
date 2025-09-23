import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { logger } from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CommandResolution {
  command: string;
  args: string[];
  available: boolean;
  resolvedPath?: string;
  fallbackUsed?: string;
}

export interface BundledServerInfo {
  command: string;
  args: string[];
  packageName: string;
  bundledPath?: string;
}

/**
 * Utility class for resolving commands in Electron environments
 * Handles npx detection, fallback paths, and bundled MCP servers
 */
export class CommandResolver {
  private static readonly commandCache = new Map<string, CommandResolution>();
  private static readonly bundledServers = new Map<string, BundledServerInfo>();

  // Common installation paths for Node.js/npm on different platforms
  private static readonly NODE_PATHS = {
    win32: [
      'C:\\Program Files\\nodejs\\node.exe',
      'C:\\Program Files (x86)\\nodejs\\node.exe',
      path.join(process.env.APPDATA || '', 'npm', 'node.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'npm', 'node.exe'),
      // nvm-windows paths (Local AppData)
      path.join(process.env.LOCALAPPDATA || '', 'nvm', 'current', 'node.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'nvm', '*', 'node.exe'),
      path.join(process.env.APPDATA || '', 'nvm', 'current', 'node.exe'),
      path.join(process.env.APPDATA || '', 'nvm', '*', 'node.exe'),
      path.join(process.env.NVM_HOME || '', 'current', 'node.exe'),
      path.join(process.env.NVM_HOME || '', '*', 'node.exe'),
    ],
    darwin: [
      '/usr/local/bin/node',
      '/opt/homebrew/bin/node',
      '/usr/bin/node',
      path.join(process.env.HOME || '', '.nvm/current/bin/node'),
      path.join(process.env.HOME || '', '.volta/bin/node'),
    ],
    linux: [
      '/usr/local/bin/node',
      '/usr/bin/node',
      '/opt/node/bin/node',
      path.join(process.env.HOME || '', '.nvm/current/bin/node'),
      path.join(process.env.HOME || '', '.volta/bin/node'),
      path.join(process.env.HOME || '', '.local/bin/node'),
    ],
  };

  private static readonly NPX_PATHS = {
    win32: [
      'C:\\Program Files\\nodejs\\npx.cmd',
      'C:\\Program Files (x86)\\nodejs\\npx.cmd',
      path.join(process.env.APPDATA || '', 'npm', 'npx.cmd'),
      path.join(process.env.LOCALAPPDATA || '', 'npm', 'npx.cmd'),
      path.join(
        process.env.USERPROFILE || '',
        'AppData',
        'Roaming',
        'npm',
        'npx.cmd'
      ),
      // nvm-windows paths (Local AppData)
      path.join(process.env.LOCALAPPDATA || '', 'nvm', 'current', 'npx.cmd'),
      path.join(process.env.LOCALAPPDATA || '', 'nvm', '*', 'npx.cmd'),
      path.join(process.env.APPDATA || '', 'nvm', 'current', 'npx.cmd'),
      path.join(process.env.APPDATA || '', 'nvm', '*', 'npx.cmd'),
      path.join(process.env.NVM_HOME || '', 'current', 'npx.cmd'),
      path.join(process.env.NVM_HOME || '', '*', 'npx.cmd'),
    ],
    darwin: [
      '/usr/local/bin/npx',
      '/opt/homebrew/bin/npx',
      '/usr/bin/npx',
      path.join(process.env.HOME || '', '.nvm/current/bin/npx'),
      path.join(process.env.HOME || '', '.volta/bin/npx'),
      path.join(process.env.HOME || '', '.nvm/versions/node/*/bin/npx'),
      '/usr/local/lib/node_modules/npm/bin/npx-cli.js',
      '/opt/homebrew/lib/node_modules/npm/bin/npx-cli.js',
    ],
    linux: [
      '/usr/local/bin/npx',
      '/usr/bin/npx',
      '/opt/node/bin/npx',
      path.join(process.env.HOME || '', '.nvm/current/bin/npx'),
      path.join(process.env.HOME || '', '.volta/bin/npx'),
      path.join(process.env.HOME || '', '.local/bin/npx'),
      path.join(process.env.HOME || '', '.nvm/versions/node/*/bin/npx'),
    ],
  };

  static {
    // Initialize bundled servers
    this.initializeBundledServers();
  }

  private static initializeBundledServers(): void {
    // Define popular MCP servers that we have bundled
    const bundledServerConfigs: BundledServerInfo[] = [
      {
        command: 'npx',
        args: ['@modelcontextprotocol/server-filesystem'],
        packageName: '@modelcontextprotocol/server-filesystem',
      },
      {
        command: 'npx',
        args: ['@modelcontextprotocol/server-github'],
        packageName: '@modelcontextprotocol/server-github',
      },
    ];

    for (const config of bundledServerConfigs) {
      const key = `${config.command} ${config.args[0]}`;

      // Check if the package is bundled in node_modules
      const bundledPath = this.findBundledPackage(config.packageName);
      if (bundledPath) {
        config.bundledPath = bundledPath;
      }

      this.bundledServers.set(key, config);
    }
  }

  private static findBundledPackage(packageName: string): string | undefined {
    const possiblePaths = [
      // Standard node_modules location relative to server directory
      path.join(__dirname, '../../node_modules', packageName),
      // If running from built app
      path.join(process.cwd(), 'node_modules', packageName),
      // If in development
      path.join(__dirname, '../../../node_modules', packageName),
      // Electron app.asar path
      path.join(__dirname, '../node_modules', packageName),
      // Electron resources path (when packaged)
      ...((process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
        ? [
            path.join(
              (process as NodeJS.Process & { resourcesPath: string })
                .resourcesPath,
              'app',
              'node_modules',
              packageName
            ),
            path.join(
              (process as NodeJS.Process & { resourcesPath: string })
                .resourcesPath,
              'node_modules',
              packageName
            ),
          ]
        : []),
      // Try from the app root in Electron
      path.join(path.dirname(process.execPath), 'node_modules', packageName),
      // Additional common Electron paths
      path.join(path.dirname(__dirname), 'node_modules', packageName),
      path.join(
        path.dirname(path.dirname(__dirname)),
        'node_modules',
        packageName
      ),
      // Windows Electron packaged app paths
      path.join(
        path.dirname(process.execPath),
        'resources',
        'app',
        'node_modules',
        packageName
      ),
      path.join(
        path.dirname(process.execPath),
        'resources',
        'node_modules',
        packageName
      ),
      // Try relative to main executable on Windows
      path.join(
        path.dirname(path.dirname(process.execPath)),
        'node_modules',
        packageName
      ),
    ];

    logger.debug(
      `[CommandResolver] Searching for bundled package: ${packageName}`
    );
    logger.debug(
      `[CommandResolver] Process info - execPath: ${process.execPath}, cwd: ${process.cwd()}, __dirname: ${__dirname}`
    );

    for (const pkgPath of possiblePaths) {
      logger.debug(`[CommandResolver] Checking path: ${pkgPath}`);

      const entryPoints = [
        path.join(pkgPath, 'dist/index.js'),
        path.join(pkgPath, 'index.js'),
        path.join(pkgPath, 'lib/index.js'),
        path.join(pkgPath, 'src/index.js'),
      ];

      for (const entryPoint of entryPoints) {
        logger.debug(`[CommandResolver] Checking entry point: ${entryPoint}`);
        if (fs.existsSync(entryPoint)) {
          logger.info(
            `[CommandResolver] Found bundled MCP server: ${packageName} at ${entryPoint}`
          );
          return entryPoint;
        }
      }
    }

    return undefined;
  }

  /**
   * Resolve a command for MCP server execution
   * @param command Original command from MCP config
   * @param args Original arguments from MCP config
   * @returns CommandResolution with availability and fallback info
   */
  static async resolveCommand(
    command: string,
    args: string[]
  ): Promise<CommandResolution> {
    const cacheKey = `${command} ${args.join(' ')}`;

    // Check cache first
    if (this.commandCache.has(cacheKey)) {
      return this.commandCache.get(cacheKey)!;
    }

    let resolution: CommandResolution = {
      command,
      args,
      available: false,
    };

    try {
      // First, try the command as-is (might be in PATH)
      const isAvailable = await this.isCommandAvailable(command);
      if (isAvailable) {
        resolution = {
          command,
          args,
          available: true,
          resolvedPath: await this.which(command),
        };
        logger.info(`[CommandResolver] Command '${command}' found in PATH`);
        this.commandCache.set(cacheKey, resolution);
        return resolution;
      }

      // Try bundled server if this is an npx MCP server call
      if (command === 'npx' && args.length > 0) {
        const bundledKey = `${command} ${args[0]}`;
        const bundledServer = this.bundledServers.get(bundledKey);

        if (bundledServer?.bundledPath) {
          const nodePath = await this.findNodeExecutable();
          if (nodePath) {
            resolution = {
              command: nodePath,
              args: [bundledServer.bundledPath, ...args.slice(1)],
              available: true,
              resolvedPath: bundledServer.bundledPath,
              fallbackUsed: 'bundled-server',
            };
            logger.info(
              `[CommandResolver] Using bundled MCP server: ${bundledServer.packageName}`
            );
            this.commandCache.set(cacheKey, resolution);
            return resolution;
          }
        }
      }

      // Try platform-specific fallback paths
      const fallbackPath = await this.findCommandInFallbackPaths(command);
      if (fallbackPath) {
        resolution = {
          command: fallbackPath,
          args,
          available: true,
          resolvedPath: fallbackPath,
          fallbackUsed: 'system-path',
        };
        logger.info(
          `[CommandResolver] Command '${command}' found at fallback path: ${fallbackPath}`
        );
        this.commandCache.set(cacheKey, resolution);
        return resolution;
      }

      // Command not found anywhere
      logger.warn(
        `[CommandResolver] Command '${command}' not found in PATH or fallback locations`
      );
    } catch (error: unknown) {
      logger.error(
        `[CommandResolver] Error resolving command '${command}':`,
        error instanceof Error ? error.message : String(error)
      );
    }

    this.commandCache.set(cacheKey, resolution);
    return resolution;
  }

  /**
   * Check if a command is available in the system PATH
   */
  private static async isCommandAvailable(command: string): Promise<boolean> {
    return new Promise(resolve => {
      const child = spawn(command, ['--version'], {
        stdio: 'ignore',
        timeout: 5000,
      });

      child.on('close', code => {
        resolve(code === 0);
      });

      child.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Get the path of a command using 'which' (Unix) or 'where' (Windows)
   */
  private static async which(command: string): Promise<string | undefined> {
    try {
      const whichCommand = process.platform === 'win32' ? 'where' : 'which';
      const result = execSync(`${whichCommand} ${command}`, {
        encoding: 'utf8',
        timeout: 5000,
      });
      return result.trim().split('\n')[0];
    } catch {
      return undefined;
    }
  }

  /**
   * Find Node.js executable in common installation paths
   */
  private static async findNodeExecutable(): Promise<string | undefined> {
    // Try PATH first
    const pathNode = await this.which('node');
    if (pathNode) {
      return pathNode;
    }

    // Try platform-specific paths
    const platform = process.platform as keyof typeof this.NODE_PATHS;
    const paths = this.NODE_PATHS[platform] || this.NODE_PATHS.linux;

    for (const nodePath of paths) {
      if (fs.existsSync(nodePath)) {
        try {
          // Verify it's actually Node.js
          execSync(`"${nodePath}" --version`, {
            encoding: 'utf8',
            timeout: 5000,
            stdio: 'ignore',
          });
          return nodePath;
        } catch {
          continue;
        }
      }
    }

    return undefined;
  }

  /**
   * Expand glob-like patterns in paths
   */
  private static expandGlobPath(pattern: string): string[] {
    if (!pattern.includes('*')) {
      return [pattern];
    }

    const parts = pattern.split('*');
    if (parts.length !== 2) {
      return [pattern]; // Only handle simple * patterns
    }

    const [prefix, suffix] = parts;
    const parentDir = path.dirname(prefix);

    try {
      if (fs.existsSync(parentDir)) {
        const entries = fs.readdirSync(parentDir);
        return entries
          .filter(entry => {
            const fullPath = path.join(parentDir, entry, suffix.substring(1)); // Remove leading /
            return fs.existsSync(fullPath);
          })
          .map(entry => path.join(parentDir, entry, suffix.substring(1)));
      }
    } catch {
      // Ignore errors
    }

    return [];
  }

  /**
   * Find a command by checking all directories in PATH environment variable
   */
  private static async findCommandInPath(
    command: string
  ): Promise<string | undefined> {
    const pathEnv = process.env.PATH || '';
    const pathSeparator = process.platform === 'win32' ? ';' : ':';
    const pathDirs = pathEnv
      .split(pathSeparator)
      .filter(dir => dir.trim() !== '');

    const extensions =
      process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];

    for (const dir of pathDirs) {
      for (const ext of extensions) {
        const fullPath = path.join(dir.trim(), command + ext);
        if (fs.existsSync(fullPath)) {
          try {
            // Test if it's executable
            await this.isCommandAvailable(fullPath);
            logger.info(
              `[CommandResolver] Found '${command}' in PATH at: ${fullPath}`
            );
            return fullPath;
          } catch {
            continue;
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Find a command in platform-specific fallback paths
   */
  private static async findCommandInFallbackPaths(
    command: string
  ): Promise<string | undefined> {
    const platform = process.platform as keyof typeof this.NPX_PATHS;

    // First, check all directories in PATH environment variable
    const pathCheck = await this.findCommandInPath(command);
    if (pathCheck) {
      return pathCheck;
    }

    // For npx specifically, use NPX_PATHS
    if (command === 'npx') {
      const paths = this.NPX_PATHS[platform] || this.NPX_PATHS.linux;

      for (const npxPattern of paths) {
        // Expand glob patterns
        const expandedPaths = this.expandGlobPath(npxPattern);

        for (const npxPath of expandedPaths) {
          if (fs.existsSync(npxPath)) {
            try {
              execSync(`"${npxPath}" --version`, {
                encoding: 'utf8',
                timeout: 5000,
                stdio: 'ignore',
              });
              return npxPath;
            } catch {
              continue;
            }
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Get installation instructions for missing dependencies
   */
  static getInstallationInstructions(command: string): {
    title: string;
    message: string;
    actions: Array<{ label: string; url?: string; command?: string }>;
  } {
    if (command === 'npx' || command === 'npm' || command === 'node') {
      return {
        title: 'Node.js Required',
        message:
          'MCP servers require Node.js and npm to be installed on your system. Node.js includes npx which is used to run MCP servers.',
        actions: [
          {
            label: 'Download Node.js',
            url: 'https://nodejs.org/en/download/',
          },
          {
            label: 'Install via Homebrew (macOS)',
            command: 'brew install node',
          },
          {
            label: 'Install via package manager (Linux)',
            command: 'sudo apt install nodejs npm',
          },
        ],
      };
    }

    return {
      title: `${command} Not Found`,
      message: `The command '${command}' was not found on your system. Please install it and ensure it's available in your PATH.`,
      actions: [],
    };
  }

  /**
   * Clear the command resolution cache
   */
  static clearCache(): void {
    this.commandCache.clear();
    logger.info('[CommandResolver] Command cache cleared');
  }

  /**
   * Get all cached command resolutions (for debugging)
   */
  static getCachedResolutions(): Map<string, CommandResolution> {
    return new Map(this.commandCache);
  }

  /**
   * Get information about bundled servers
   */
  static getBundledServers(): Map<string, BundledServerInfo> {
    return new Map(this.bundledServers);
  }
}
