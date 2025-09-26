import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Stats } from 'fs';
import { getWorkspaceRoot } from '../../../utils/settingsDirectory';

export interface FileInfo {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  lastModified: Date;
  extension?: string;
}

export interface FileContent {
  path: string;
  content: string;
  encoding: string;
  size: number;
}

@Injectable()
export class WorkspaceFileService {
  private readonly logger = new Logger(WorkspaceFileService.name);
  private workspaceRoot: string;
  private currentWorkingDirectory: string;
  private initialized = false;

  constructor(private configService: ConfigService) {
    // Initialize immediately with synchronous call for constructor logging
    this.initializeSync();
  }

  private initializeSync(): void {
    // Use fallback values initially - will be replaced with persisted values in ensureInitialized
    // Get the project root - if we're in server directory, go up one level
    const cwd = process.cwd();
    const defaultRoot = cwd.endsWith('/server') ? path.dirname(cwd) : cwd;

    this.workspaceRoot =
      this.configService?.get<string>('WORKSPACE_ROOT') ?? defaultRoot;
    this.currentWorkingDirectory = this.workspaceRoot;
    this.logger.log(`Workspace root: ${this.workspaceRoot}`);
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Load persisted workspace root
    const persistedWorkspaceRoot = await getWorkspaceRoot();

    if (persistedWorkspaceRoot) {
      this.workspaceRoot = persistedWorkspaceRoot;
      this.currentWorkingDirectory = persistedWorkspaceRoot;
      this.logger.log(`Using persisted workspace root: ${this.workspaceRoot}`);
    }

    this.initialized = true;
  }

  /**
   * Update the workspace root directory
   */
  setWorkspaceRoot(newRoot: string): void {
    this.workspaceRoot = newRoot;
    this.currentWorkingDirectory = newRoot;
    this.logger.log(`Updated workspace root to: ${newRoot}`);
  }

  /**
   * Get the current workspace root
   */
  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  /**
   * Set the current working directory
   */
  setCurrentDirectory(directory: string): void {
    const fullPath = path.resolve(this.workspaceRoot, directory);
    this.currentWorkingDirectory = fullPath;
    this.logger.log(`Updated current directory to: ${fullPath}`);
  }

  /**
   * Get the current working directory
   */
  getCurrentDirectory(): string {
    return this.currentWorkingDirectory;
  }

  /**
   * List files in a directory
   */
  async listFiles(
    directoryPath?: string,
    recursive = false
  ): Promise<FileInfo[]> {
    await this.ensureInitialized();

    const targetDir = directoryPath
      ? path.resolve(this.workspaceRoot, directoryPath)
      : this.currentWorkingDirectory;

    try {
      const entries = await fs.readdir(targetDir, { withFileTypes: true });
      const files: FileInfo[] = [];

      for (const entry of entries) {
        const fullPath = path.join(targetDir, entry.name);
        const relativePath = path.relative(this.workspaceRoot, fullPath);

        try {
          const stats = await fs.stat(fullPath);

          const fileInfo: FileInfo = {
            name: entry.name,
            path: relativePath,
            isDirectory: entry.isDirectory(),
            lastModified: stats.mtime,
          };

          if (!entry.isDirectory()) {
            fileInfo.size = stats.size;
            fileInfo.extension = path.extname(entry.name);
          }

          files.push(fileInfo);

          // Recursively list subdirectories if requested
          if (recursive && entry.isDirectory()) {
            const subFiles = await this.listFiles(relativePath, true);
            files.push(...subFiles);
          }
        } catch (error) {
          this.logger.warn(`Failed to stat file ${fullPath}: ${error}`);
        }
      }

      // Sort: directories first, then alphabetically
      files.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) {
          return -1;
        }
        if (!a.isDirectory && b.isDirectory) {
          return 1;
        }
        return a.name.localeCompare(b.name);
      });

      return files;
    } catch (error) {
      this.logger.error(`Failed to list files in ${targetDir}:`, error);
      throw new NotFoundException(`Directory not found: ${targetDir}`);
    }
  }

  /**
   * Read file content
   */
  async readFile(filePath: string): Promise<FileContent> {
    await this.ensureInitialized();

    // Ensure workspace root is defined
    if (!this.workspaceRoot) {
      throw new BadRequestException('Workspace root not configured');
    }

    const fullPath = path.resolve(this.workspaceRoot, filePath);

    // Security check: ensure path is within workspace
    if (!this.isPathWithinWorkspace(fullPath)) {
      throw new BadRequestException('Access denied: Path outside workspace');
    }

    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const stats = await fs.stat(fullPath);

      return {
        path: filePath,
        content,
        encoding: 'utf-8',
        size: stats.size,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException(`File not found: ${filePath}`);
      }
      throw error;
    }
  }

  /**
   * Save file content
   */
  async saveFile(filePath: string, content: string): Promise<FileInfo> {
    await this.ensureInitialized();

    const fullPath = path.resolve(this.workspaceRoot, filePath);

    // Security check
    if (!this.isPathWithinWorkspace(fullPath)) {
      throw new BadRequestException('Access denied: Path outside workspace');
    }

    try {
      // Create directory if it doesn't exist
      const directory = path.dirname(fullPath);
      await fs.mkdir(directory, { recursive: true });

      // Write file
      await fs.writeFile(fullPath, content, 'utf-8');

      // Get file info
      const stats = await fs.stat(fullPath);

      this.logger.log(`Saved file: ${filePath}`);

      return {
        name: path.basename(filePath),
        path: filePath,
        isDirectory: false,
        size: stats.size,
        lastModified: stats.mtime,
        extension: path.extname(filePath),
      };
    } catch (error) {
      this.logger.error(`Failed to save file ${filePath}:`, error);
      throw new BadRequestException(`Failed to save file: ${error}`);
    }
  }

  /**
   * Delete a file
   */
  async deleteFile(filePath: string): Promise<void> {
    await this.ensureInitialized();

    const fullPath = path.resolve(this.workspaceRoot, filePath);

    // Security check
    if (!this.isPathWithinWorkspace(fullPath)) {
      throw new BadRequestException('Access denied: Path outside workspace');
    }

    try {
      await fs.unlink(fullPath);
      this.logger.log(`Deleted file: ${filePath}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException(`File not found: ${filePath}`);
      }
      throw new BadRequestException(`Failed to delete file: ${error}`);
    }
  }

  /**
   * Create a directory
   */
  async createDirectory(directoryPath: string): Promise<void> {
    await this.ensureInitialized();

    const fullPath = path.resolve(this.workspaceRoot, directoryPath);

    // Security check
    if (!this.isPathWithinWorkspace(fullPath)) {
      throw new BadRequestException('Access denied: Path outside workspace');
    }

    try {
      await fs.mkdir(fullPath, { recursive: true });
      this.logger.log(`Created directory: ${directoryPath}`);
    } catch (error) {
      throw new BadRequestException(`Failed to create directory: ${error}`);
    }
  }

  /**
   * Delete a directory
   */
  async deleteDirectory(directoryPath: string): Promise<void> {
    await this.ensureInitialized();

    const fullPath = path.resolve(this.workspaceRoot, directoryPath);

    // Security check
    if (!this.isPathWithinWorkspace(fullPath)) {
      throw new BadRequestException('Access denied: Path outside workspace');
    }

    try {
      await fs.rmdir(fullPath, { recursive: true });
      this.logger.log(`Deleted directory: ${directoryPath}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException(`Directory not found: ${directoryPath}`);
      }
      throw new BadRequestException(`Failed to delete directory: ${error}`);
    }
  }

  /**
   * Check if a path exists
   */
  async exists(filePath: string): Promise<boolean> {
    const fullPath = path.resolve(this.workspaceRoot, filePath);

    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file or directory stats
   */
  async getStats(filePath: string): Promise<Stats> {
    const fullPath = path.resolve(this.workspaceRoot, filePath);

    if (!this.isPathWithinWorkspace(fullPath)) {
      throw new BadRequestException('Access denied: Path outside workspace');
    }

    try {
      return await fs.stat(fullPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException(`Path not found: ${filePath}`);
      }
      throw error;
    }
  }

  /**
   * Security check: ensure path is within workspace
   */
  private isPathWithinWorkspace(fullPath: string): boolean {
    const normalizedPath = path.normalize(fullPath);
    const normalizedWorkspace = path.normalize(this.workspaceRoot);
    return normalizedPath.startsWith(normalizedWorkspace);
  }
}
