import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Stats } from 'fs';
import { GlobalConfigService } from '../../shared/services/global-config.service';

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

  constructor(private readonly globalConfigService: GlobalConfigService) {
    // Don't initialize currentWorkingDirectory in constructor
    // since GlobalConfigService hasn't loaded settings yet
  }

  /**
   * Get the current workspace root
   */
  getWorkspaceRoot(): string {
    return this.globalConfigService.getWorkspaceRoot();
  }

  /**
   * Set the current working directory
   */
  setCurrentDirectory(directory: string): void {
    const fullPath = path.resolve(
      this.globalConfigService.getWorkspaceRoot(),
      directory
    );
    this.globalConfigService.updateCurrentWorkingDirectory(fullPath);
    this.logger.log(`Updated current directory to: ${fullPath}`);
  }

  /**
   * Get the current working directory
   */
  getCurrentDirectory(): string {
    return this.globalConfigService.getCurrentWorkingDirectory();
  }

  /**
   * List files in a directory
   */
  async listFiles(
    directoryPath?: string,
    recursive = false
  ): Promise<FileInfo[]> {
    let targetDir: string;
    if (directoryPath) {
      // Handle both absolute and relative paths
      if (path.isAbsolute(directoryPath)) {
        targetDir = directoryPath;
      } else {
        targetDir = path.resolve(
          this.globalConfigService.getWorkspaceRoot(),
          directoryPath
        );
      }
    } else {
      targetDir = this.globalConfigService.getCurrentWorkingDirectory();
    }

    try {
      const entries = await fs.readdir(targetDir, { withFileTypes: true });
      const files: FileInfo[] = [];

      for (const entry of entries) {
        const fullPath = path.join(targetDir, entry.name);
        const relativePath = path.relative(
          this.globalConfigService.getWorkspaceRoot(),
          fullPath
        );

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
    // Handle both absolute and relative paths
    let fullPath: string;
    if (path.isAbsolute(filePath)) {
      // If the path is absolute, use it directly
      fullPath = filePath;
    } else {
      // If the path is relative, resolve it relative to workspace root
      fullPath = path.resolve(
        this.globalConfigService.getWorkspaceRoot(),
        filePath
      );
    }

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
    // Handle both absolute and relative paths
    let fullPath: string;
    if (path.isAbsolute(filePath)) {
      // If the path is absolute, use it directly
      fullPath = filePath;
    } else {
      // If the path is relative, resolve it relative to workspace root
      fullPath = path.resolve(
        this.globalConfigService.getWorkspaceRoot(),
        filePath
      );
    }

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
    // Handle both absolute and relative paths
    let fullPath: string;
    if (path.isAbsolute(filePath)) {
      // If the path is absolute, use it directly
      fullPath = filePath;
    } else {
      // If the path is relative, resolve it relative to workspace root
      fullPath = path.resolve(
        this.globalConfigService.getWorkspaceRoot(),
        filePath
      );
    }

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
    const fullPath = path.resolve(
      this.globalConfigService.getWorkspaceRoot(),
      directoryPath
    );

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
    const fullPath = path.resolve(
      this.globalConfigService.getWorkspaceRoot(),
      directoryPath
    );

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
    const fullPath = path.resolve(
      this.globalConfigService.getWorkspaceRoot(),
      filePath
    );

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
    const fullPath = path.resolve(
      this.globalConfigService.getWorkspaceRoot(),
      filePath
    );

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
    const normalizedWorkspace = path.normalize(
      this.globalConfigService.getWorkspaceRoot()
    );
    return normalizedPath.startsWith(normalizedWorkspace);
  }
}
