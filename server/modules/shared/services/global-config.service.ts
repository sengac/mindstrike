import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  getWorkspaceRoot,
  setWorkspaceRoot,
  getMusicRoot,
  setMusicRoot,
  getHomeDirectory,
} from '../../../shared/utils/settings-directory';

export interface WorkspaceConfig {
  workspaceRoot: string;
  musicRoot: string;
  currentWorkingDirectory: string;
}

@Injectable()
export class GlobalConfigService implements OnModuleInit {
  private readonly logger = new Logger(GlobalConfigService.name);

  // Global singleton config object (like Express global variables)
  private readonly config: WorkspaceConfig = {
    workspaceRoot: process.cwd(),
    musicRoot: process.cwd(),
    currentWorkingDirectory: process.cwd(),
  };

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    // Load workspace and music roots from persistent storage on startup
    await this.loadWorkspaceSettings();
  }

  private async loadWorkspaceSettings(): Promise<void> {
    // Load persisted roots, matching Express loadWorkspaceSettings() pattern
    const persistedWorkspaceRoot = await getWorkspaceRoot();
    const persistedMusicRoot = await getMusicRoot();

    // Use persisted or environment or home directory as fallback
    const defaultWorkspaceRoot =
      this.configService?.get<string>('WORKSPACE_ROOT') || getHomeDirectory();
    const defaultMusicRoot =
      this.configService?.get<string>('MUSIC_ROOT') || getHomeDirectory();

    if (persistedWorkspaceRoot) {
      this.config.workspaceRoot = persistedWorkspaceRoot;
      this.config.currentWorkingDirectory = persistedWorkspaceRoot;
      this.logger.log(
        `Loaded workspace root from settings: ${this.config.workspaceRoot}`
      );
    } else {
      this.config.workspaceRoot = defaultWorkspaceRoot;
      this.config.currentWorkingDirectory = defaultWorkspaceRoot;
      this.logger.log(
        `Using default workspace root: ${this.config.workspaceRoot}`
      );
    }

    if (persistedMusicRoot) {
      this.config.musicRoot = persistedMusicRoot;
      this.logger.log(
        `Loaded music root from settings: ${this.config.musicRoot}`
      );
    } else {
      this.config.musicRoot = defaultMusicRoot;
      this.logger.log(`Using default music root: ${this.config.musicRoot}`);
    }
  }

  // Getters for each config value
  getWorkspaceRoot(): string {
    return this.config.workspaceRoot;
  }

  getMusicRoot(): string {
    return this.config.musicRoot;
  }

  getCurrentWorkingDirectory(): string {
    return this.config.currentWorkingDirectory;
  }

  // Get full config object (for agents that need all values)
  getConfig(): Readonly<WorkspaceConfig> {
    return { ...this.config };
  }

  // Update workspace root globally
  async updateWorkspaceRoot(newRoot: string): Promise<void> {
    if (this.config.workspaceRoot === newRoot) {
      return;
    }

    this.config.workspaceRoot = newRoot;
    this.config.currentWorkingDirectory = newRoot;

    // Persist to storage
    await setWorkspaceRoot(newRoot);

    this.logger.log(`Workspace root updated to: ${newRoot}`);
  }

  // Update music root globally
  async updateMusicRoot(newRoot: string): Promise<void> {
    if (this.config.musicRoot === newRoot) {
      return;
    }

    this.config.musicRoot = newRoot;

    // Persist to storage
    await setMusicRoot(newRoot);

    this.logger.log(`Music root updated to: ${newRoot}`);
  }

  // Update current working directory (without changing workspace root)
  updateCurrentWorkingDirectory(newDir: string): void {
    this.config.currentWorkingDirectory = newDir;
    this.logger.log(`Current working directory updated to: ${newDir}`);
  }
}
