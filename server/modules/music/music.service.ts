import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync, createReadStream, statSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import {
  setMusicRoot,
  getMusicRoot,
  getWorkspaceRoot,
  getHomeDirectory,
} from '../../utils/settingsDirectory';

export interface AudioFile {
  name: string;
  path: string;
  size: number;
  duration?: number;
  metadata?: Record<string, unknown>;
}

interface Playlist {
  id: string;
  name: string;
  description?: string;
  tracks: AudioFile[];
  createdAt: Date;
  updatedAt: Date;
}

interface MusicRootInfo {
  root: string;
  exists: boolean;
  writable?: boolean;
}

interface SavePlaylistResult {
  success: boolean;
  id: string;
  name: string;
}

interface DeletePlaylistResult {
  success: boolean;
  deletedId: string;
}

@Injectable()
export class MusicService {
  private readonly logger = new Logger(MusicService.name);
  private musicRoot: string | null = null;
  private workspaceRoot: string | null = null;
  private playlistsPath: string | null = null;
  private supportedExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.flac'];
  private initialized = false;

  constructor(private configService: ConfigService) {
    this.logger.log('MusicService constructor called');
    this.logger.log(`ConfigService injected: ${!!this.configService}`);
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.logger.log('MusicService: Initializing configuration...');

    // Load persisted settings or use defaults
    const persistedMusicRoot = await getMusicRoot();
    const persistedWorkspaceRoot = await getWorkspaceRoot();

    this.musicRoot =
      persistedMusicRoot ??
      this.configService?.get<string>('MUSIC_ROOT') ??
      getHomeDirectory();

    this.workspaceRoot =
      persistedWorkspaceRoot ??
      this.configService?.get<string>('WORKSPACE_ROOT') ??
      getHomeDirectory();

    this.playlistsPath = path.join(this.workspaceRoot, 'playlists.json');

    this.logger.log(
      `MusicService: Initialized with music root: ${this.musicRoot}`
    );
    this.logger.log(
      `MusicService: Initialized with workspace root: ${this.workspaceRoot}`
    );

    this.initialized = true;
  }

  async getMusicRoot(): Promise<MusicRootInfo> {
    await this.ensureInitialized();

    const exists = existsSync(this.musicRoot!);
    let writable = false;

    if (exists) {
      try {
        await fs.access(this.musicRoot!, fs.constants.W_OK);
        writable = true;
      } catch {
        writable = false;
      }
    }

    return {
      root: this.musicRoot!,
      exists,
      writable,
    };
  }

  async setMusicRoot(
    newPath: string
  ): Promise<{ musicRoot: string; message: string }> {
    await this.ensureInitialized();

    // Use the loaded workspace root
    const currentWorkingDirectory = this.workspaceRoot!;

    // Resolve path - can be relative to current working directory or absolute
    let fullPath: string;
    if (path.isAbsolute(newPath)) {
      fullPath = newPath;
    } else {
      fullPath = path.resolve(currentWorkingDirectory, newPath);
    }

    // Check if the path exists and is a directory
    if (!existsSync(fullPath)) {
      throw new NotFoundException('Directory does not exist');
    }

    const stats = statSync(fullPath);
    if (!stats.isDirectory()) {
      throw new BadRequestException('Path is not a directory');
    }

    // Only update and log if music root actually changed
    if (this.musicRoot !== fullPath) {
      // Update music root
      this.musicRoot = fullPath;

      // Save music root to persistent storage
      await setMusicRoot(this.musicRoot);

      this.logger.log(`Music root changed to: ${this.musicRoot}`);
    }

    return {
      musicRoot: this.musicRoot,
      message: 'Music root changed successfully',
    };
  }

  async getAudioFiles(
    searchPath?: string,
    recursive?: boolean
  ): Promise<AudioFile[]> {
    await this.ensureInitialized();

    const targetPath = searchPath
      ? path.join(this.musicRoot!, searchPath)
      : this.musicRoot!;

    // Security check
    if (!targetPath.startsWith(this.musicRoot!)) {
      throw new BadRequestException('Invalid path: outside music root');
    }

    if (!existsSync(targetPath)) {
      return [];
    }

    const audioFiles: AudioFile[] = [];

    const scanDirectory = async (dirPath: string): Promise<void> => {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory() && recursive) {
          await scanDirectory(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (this.supportedExtensions.includes(ext)) {
            const stats = await fs.stat(fullPath);
            const relativePath = path.relative(this.musicRoot!, fullPath);

            audioFiles.push({
              name: entry.name,
              path: relativePath,
              size: stats.size,
              metadata: {
                extension: ext,
                modified: stats.mtime,
              },
            });
          }
        }
      }
    };

    await scanDirectory(targetPath);

    return audioFiles.sort((a, b) => a.name.localeCompare(b.name));
  }

  async streamAudio(audioPath: string): Promise<NodeJS.ReadableStream> {
    await this.ensureInitialized();

    const fullPath = path.join(this.musicRoot!, audioPath);

    // Security check
    if (!fullPath.startsWith(this.musicRoot!)) {
      throw new BadRequestException('Invalid path: outside music root');
    }

    if (!existsSync(fullPath)) {
      throw new NotFoundException(`Audio file not found: ${audioPath}`);
    }

    return createReadStream(fullPath);
  }

  async savePlaylist(
    name: string,
    tracks: AudioFile[],
    description?: string
  ): Promise<SavePlaylistResult> {
    const playlists = await this.loadPlaylists();

    const newPlaylist: Playlist = {
      id: uuidv4(),
      name,
      description,
      tracks,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    playlists.push(newPlaylist);
    await this.savePlaylistsToFile(playlists);

    this.logger.log(`Created playlist: ${name} with ${tracks.length} tracks`);

    return {
      success: true,
      id: newPlaylist.id,
      name: newPlaylist.name,
    };
  }

  async loadPlaylists(): Promise<Playlist[]> {
    await this.ensureInitialized();

    try {
      const data = await fs.readFile(this.playlistsPath!, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      // File doesn't exist or is invalid
      this.logger.debug('No playlists file found, returning empty array');
      return [];
    }
  }

  async getPlaylist(id: string): Promise<Playlist> {
    const playlists = await this.loadPlaylists();
    const playlist = playlists.find(p => p.id === id);

    if (!playlist) {
      throw new NotFoundException(`Playlist with ID ${id} not found`);
    }

    return playlist;
  }

  async deletePlaylist(id: string): Promise<DeletePlaylistResult> {
    const playlists = await this.loadPlaylists();
    const index = playlists.findIndex(p => p.id === id);

    if (index === -1) {
      throw new NotFoundException(`Playlist with ID ${id} not found`);
    }

    playlists.splice(index, 1);
    await this.savePlaylistsToFile(playlists);

    this.logger.log(`Deleted playlist: ${id}`);

    return {
      success: true,
      deletedId: id,
    };
  }

  private async savePlaylistsToFile(playlists: Playlist[]): Promise<void> {
    await this.ensureInitialized();

    try {
      await fs.writeFile(
        this.playlistsPath!,
        JSON.stringify(playlists, null, 2),
        'utf-8'
      );
      this.logger.debug(`Saved ${playlists.length} playlists to file`);
    } catch (error) {
      this.logger.error('Failed to save playlists to file', error);
      throw error;
    }
  }
}
