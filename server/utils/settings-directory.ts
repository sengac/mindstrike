import os from 'os';
import path from 'path';
import fs from 'fs/promises';

/**
 * Get the cross-platform directory for Mindstrike settings and data
 * Uses ~/.mindstrike on Unix/Linux/macOS and %APPDATA%/mindstrike on Windows
 */
export function getMindstrikeDirectory(): string {
  const platform = os.platform();

  if (platform === 'win32') {
    // Windows: Use %APPDATA%/mindstrike
    const appData = process.env.APPDATA;
    if (appData) {
      return path.join(appData, 'mindstrike');
    }
    // Fallback to user profile if APPDATA not available
    return path.join(os.homedir(), 'AppData', 'Roaming', 'mindstrike');
  } else {
    // Unix/Linux/macOS: Use ~/.mindstrike
    return path.join(os.homedir(), '.mindstrike');
  }
}

/**
 * Get the directory for LLM configuration files
 */
export function getLLMConfigDirectory(): string {
  return path.join(getMindstrikeDirectory(), 'llm-config');
}

/**
 * Get the directory for local models
 */
export function getLocalModelsDirectory(): string {
  return path.join(getMindstrikeDirectory(), 'local-models');
}

/**
 * Get the directory for local model settings
 */
export function getLocalModelSettingsDirectory(): string {
  return path.join(getMindstrikeDirectory(), 'model-settings');
}

/**
 * Get the home directory for the current user
 * Handles cross-platform differences
 */
export function getHomeDirectory(): string {
  // Use environment variables first (most reliable)
  if (process.env.HOME) {
    return process.env.HOME;
  } // Unix/Linux/macOS
  if (process.env.USERPROFILE) {
    return process.env.USERPROFILE;
  } // Windows
  if (process.env.HOMEDRIVE && process.env.HOMEPATH) {
    return path.join(process.env.HOMEDRIVE, process.env.HOMEPATH); // Windows fallback
  }

  // Use Node.js os module as fallback
  return os.homedir();
}

/**
 * Get the path to the workspace roots configuration file
 */
function getWorkspaceRootsConfigPath(): string {
  return path.join(getMindstrikeDirectory(), 'workspace-roots.json');
}

/**
 * Ensure the Mindstrike directory exists
 */
async function ensureMindstrikeDirectory(): Promise<void> {
  const dir = getMindstrikeDirectory();
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

/**
 * Get the workspace root directory
 */
export async function getWorkspaceRoot(): Promise<string | undefined> {
  try {
    const configPath = getWorkspaceRootsConfigPath();
    const configData = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configData);
    return config.workspaceRoot;
  } catch {
    return undefined;
  }
}

/**
 * Set the workspace root directory
 */
export async function setWorkspaceRoot(
  workspaceRoot: string | undefined
): Promise<void> {
  await ensureMindstrikeDirectory();
  const configPath = getWorkspaceRootsConfigPath();

  let config = {};
  try {
    const configData = await fs.readFile(configPath, 'utf8');
    config = JSON.parse(configData);
  } catch {
    // File doesn't exist or invalid JSON, use empty config
  }

  config = { ...config, workspaceRoot };
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
}

/**
 * Get the music root directory
 */
export async function getMusicRoot(): Promise<string | undefined> {
  try {
    const configPath = getWorkspaceRootsConfigPath();
    const configData = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configData);
    return config.musicRoot;
  } catch {
    return undefined;
  }
}

/**
 * Set the music root directory
 */
export async function setMusicRoot(
  musicRoot: string | undefined
): Promise<void> {
  await ensureMindstrikeDirectory();
  const configPath = getWorkspaceRootsConfigPath();

  let config = {};
  try {
    const configData = await fs.readFile(configPath, 'utf8');
    config = JSON.parse(configData);
  } catch {
    // File doesn't exist or invalid JSON, use empty config
  }

  config = { ...config, musicRoot };
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
}

/**
 * Get the workspace roots array
 */
export async function getWorkspaceRoots(): Promise<string[]> {
  try {
    const configPath = getWorkspaceRootsConfigPath();
    const configData = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configData);
    return config.workspaceRoots || [];
  } catch {
    return [];
  }
}

/**
 * Set the workspace roots array
 */
export async function setWorkspaceRoots(
  workspaceRoots: string[]
): Promise<void> {
  await ensureMindstrikeDirectory();
  const configPath = getWorkspaceRootsConfigPath();

  let config = {};
  try {
    const configData = await fs.readFile(configPath, 'utf8');
    config = JSON.parse(configData);
  } catch {
    // File doesn't exist or invalid JSON, use empty config
  }

  config = { ...config, workspaceRoots };
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
}
