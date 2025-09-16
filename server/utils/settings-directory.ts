import os from 'os';
import path from 'path';

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
 * Get the home directory for the current user
 * Handles cross-platform differences
 */
export function getHomeDirectory(): string {
  // Use environment variables first (most reliable)
  if (process.env.HOME) return process.env.HOME; // Unix/Linux/macOS
  if (process.env.USERPROFILE) return process.env.USERPROFILE; // Windows
  if (process.env.HOMEDRIVE && process.env.HOMEPATH) {
    return path.join(process.env.HOMEDRIVE, process.env.HOMEPATH); // Windows fallback
  }

  // Use Node.js os module as fallback
  return os.homedir();
}
