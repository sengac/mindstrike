import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs/promises';
import { getMindstrikeDirectory } from '../../utils/settingsDirectory';

@Injectable()
export class PlaylistService {
  private readonly logger = new Logger(PlaylistService.name);

  constructor(private configService: ConfigService) {}

  async savePlaylists(playlists: unknown[]): Promise<{ success: boolean }> {
    const playlistsDir = path.join(getMindstrikeDirectory(), 'playlists');
    await fs.mkdir(playlistsDir, { recursive: true });

    const playlistsFile = path.join(playlistsDir, 'playlists.json');
    await fs.writeFile(playlistsFile, JSON.stringify(playlists, null, 2));

    this.logger.log(`Saved ${playlists.length} playlists`);
    return { success: true };
  }

  async loadPlaylists(): Promise<unknown[]> {
    const playlistsDir = path.join(getMindstrikeDirectory(), 'playlists');
    const playlistsFile = path.join(playlistsDir, 'playlists.json');

    try {
      const data = await fs.readFile(playlistsFile, 'utf8');
      try {
        const playlists = JSON.parse(data);
        return playlists;
      } catch {
        // Invalid JSON, create empty playlists file and return empty array
        this.logger.warn(
          'Invalid JSON in playlists file, creating new empty playlists file'
        );
        await fs.mkdir(playlistsDir, { recursive: true });
        await fs.writeFile(playlistsFile, JSON.stringify([], null, 2));
        return [];
      }
    } catch {
      // File doesn't exist, create empty playlists file and return empty array
      this.logger.log(
        'Playlists file does not exist, creating new empty playlists file'
      );
      await fs.mkdir(playlistsDir, { recursive: true });
      await fs.writeFile(playlistsFile, JSON.stringify([], null, 2));
      return [];
    }
  }

  async getPlaylistById(id: string): Promise<unknown> {
    const playlistsDir = path.join(getMindstrikeDirectory(), 'playlists');
    const playlistsFile = path.join(playlistsDir, 'playlists.json');

    const data = await fs.readFile(playlistsFile, 'utf8');
    let playlists;
    try {
      playlists = JSON.parse(data);
    } catch {
      this.logger.warn('Invalid JSON in playlists file');
      throw new BadRequestException('Invalid playlists file format');
    }

    const playlist = playlists.find((p: { id: string }) => p.id === id);

    if (!playlist) {
      throw new BadRequestException('Playlist not found');
    }

    return playlist;
  }

  async deletePlaylistById(id: string): Promise<{ success: boolean }> {
    const playlistsDir = path.join(getMindstrikeDirectory(), 'playlists');
    const playlistsFile = path.join(playlistsDir, 'playlists.json');

    const data = await fs.readFile(playlistsFile, 'utf8');
    let playlists;
    try {
      playlists = JSON.parse(data);
    } catch {
      this.logger.warn('Invalid JSON in playlists file');
      throw new BadRequestException('Invalid playlists file format');
    }

    const filteredPlaylists = playlists.filter(
      (p: { id: string }) => p.id !== id
    );

    await fs.writeFile(
      playlistsFile,
      JSON.stringify(filteredPlaylists, null, 2)
    );

    this.logger.log(`Deleted playlist: ${id}`);
    return { success: true };
  }
}
