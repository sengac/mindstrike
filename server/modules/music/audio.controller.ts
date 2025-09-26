import {
  Controller,
  Get,
  Param,
  Req,
  Res,
  Headers,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { MusicService } from './music.service';
import { MusicMetadataCacheService } from './music-metadata-cache.service';
import * as path from 'path';
import * as fs from 'fs/promises';
import { stat, createReadStream, statSync } from 'fs';
import type { Stats } from 'fs';

@ApiTags('audio')
@Controller()
export class AudioController {
  private readonly logger = new Logger(AudioController.name);

  constructor(
    private readonly musicService: MusicService,
    private readonly musicMetadataCache: MusicMetadataCacheService
  ) {
    this.logger.log('AudioController initialized');
    this.logger.log(`MusicService injected: ${!!this.musicService}`);
    this.logger.log(
      `MusicMetadataCache injected: ${!!this.musicMetadataCache}`
    );
  }

  @Get('api/audio/files')
  @ApiOperation({ summary: 'List audio files' })
  @ApiResponse({
    status: 200,
    description: 'List of audio files',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          title: { type: 'string' },
          artist: { type: 'string' },
          album: { type: 'string' },
          genre: { type: 'array', items: { type: 'string' } },
          year: { type: 'number' },
          duration: { type: 'string' },
          url: { type: 'string' },
          path: { type: 'string' },
          size: { type: 'number' },
          metadata: { type: 'object' },
          coverArtUrl: { type: 'string' },
          isActive: { type: 'boolean' },
        },
      },
    },
  })
  async getAudioFiles() {
    try {
      this.logger.log('getAudioFiles called');
      this.logger.log(`this.musicService is: ${this.musicService}`);
      this.logger.log(`typeof this.musicService: ${typeof this.musicService}`);
      const supportedExtensions = [
        'mp3',
        'mpeg',
        'opus',
        'ogg',
        'oga',
        'wav',
        'aac',
        'caf',
        'm4a',
        'mp4',
        'weba',
        'webm',
        'flac',
      ];

      const audioFiles: Array<{
        id: number;
        title: string;
        artist: string;
        album?: string;
        genre?: string[];
        year?: number;
        duration: string;
        url: string;
        path: string;
        size: number;
        metadata?: {
          common: {
            title?: string;
            artist?: string;
            album?: string;
            genre?: string[];
            year?: number;
            [key: string]: unknown;
          };
          format: {
            duration?: number;
            bitrate?: number;
            sampleRate?: number;
            numberOfChannels?: number;
            [key: string]: unknown;
          };
        };
        coverArtUrl?: string;
        isActive: boolean;
      }> = [];

      const musicRootInfo = await this.musicService.getMusicRoot();
      const musicRoot = musicRootInfo.root;

      const scanDirectory = async (dirPath: string): Promise<void> => {
        try {
          const entries = await fs.readdir(dirPath, { withFileTypes: true });

          for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);

            if (entry.isDirectory()) {
              const skipDirs = [
                'node_modules',
                '.git',
                'dist',
                '.vscode',
                'electron',
                'AppData',
                '.cache',
                '.npm',
                '.config',
                'System Volume Information',
                '$Recycle.Bin',
                'Recovery',
                'ProgramData',
                'Windows',
                'Program Files',
                'Program Files (x86)',
                '.ssh',
                '.aws',
                '.docker',
              ];

              const shouldSkip = skipDirs.some(
                skipDir =>
                  entry.name === skipDir || entry.name.startsWith(skipDir)
              );

              if (!shouldSkip) {
                try {
                  await scanDirectory(fullPath);
                } catch {
                  // Silently skip directories we can't access
                }
              }
            } else if (entry.isFile()) {
              const ext = path.extname(entry.name).toLowerCase().slice(1);
              if (supportedExtensions.includes(ext)) {
                try {
                  const stats = statSync(fullPath);
                  const relativePath = path.relative(musicRoot, fullPath);
                  const fileName = path.basename(
                    entry.name,
                    path.extname(entry.name)
                  );
                  const normalizedPath = relativePath.replace(/\\/g, '/');
                  const fileUrl = `/audio/${normalizedPath}`;

                  let metadata: (typeof audioFiles)[0]['metadata'] = undefined;
                  let title: string;
                  let artist: string;
                  let album: string | undefined;
                  let genre: string[] | undefined;
                  let year: number | undefined;
                  let coverArtUrl: string | undefined;
                  let duration: string;

                  try {
                    const cachedMetadata =
                      await this.musicMetadataCache.getMetadata(fullPath);
                    metadata = cachedMetadata.metadata as typeof metadata;
                    title = cachedMetadata.title;
                    artist = cachedMetadata.artist;
                    album = cachedMetadata.album;
                    genre = cachedMetadata.genre;
                    year = cachedMetadata.year;
                    duration = cachedMetadata.duration;
                    coverArtUrl = cachedMetadata.coverArtUrl;
                  } catch (error) {
                    this.logger.warn(
                      `Failed to extract metadata for ${fullPath}:`,
                      error
                    );
                    title = fileName
                      .replace(/[-_]/g, ' ')
                      .replace(/\b\w/g, l => l.toUpperCase());
                    artist = 'Unknown Artist';
                    duration = '0:00';
                  }

                  audioFiles.push({
                    id: audioFiles.length + 1,
                    title,
                    artist,
                    album,
                    genre,
                    year,
                    duration,
                    url: fileUrl,
                    path: relativePath,
                    size: stats.size,
                    metadata,
                    coverArtUrl,
                    isActive: false,
                  });
                } catch (error) {
                  this.logger.warn(
                    `Error processing audio file ${fullPath}:`,
                    error
                  );
                }
              }
            }
          }
        } catch (error) {
          this.logger.warn(`Error scanning directory ${dirPath}:`, error);
        }
      };

      await scanDirectory(musicRoot);
      audioFiles.sort((a, b) => a.title.localeCompare(b.title));

      await this.musicMetadataCache.saveCache();

      return audioFiles;
    } catch (error) {
      this.logger.error('Error scanning for audio files:', error);
      throw error;
    }
  }

  @Get('audio/*')
  @ApiOperation({ summary: 'Stream audio file' })
  @ApiParam({ name: 'path', type: 'string', description: 'Audio file path' })
  @ApiResponse({
    status: 200,
    description: 'Audio stream',
    content: {
      'audio/mpeg': {
        schema: { type: 'string', format: 'binary' },
      },
      'audio/ogg': {
        schema: { type: 'string', format: 'binary' },
      },
      'audio/wav': {
        schema: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Audio file not found' })
  @ApiResponse({ status: 206, description: 'Partial content (range request)' })
  async streamAudio(
    @Req() req: Request,
    @Headers('range') range: string | undefined,
    @Res() res: Response
  ): Promise<void> {
    // Extract the path from the URL after /audio/
    const fullUrl = req.url || req.originalUrl || '';
    const audioPath = fullUrl.replace(/^\/audio\//, '');

    // Decode the URL-encoded path
    const decodedPath = decodeURIComponent(audioPath);

    this.logger.log(`streamAudio called with URL: "${fullUrl}"`);
    this.logger.log(`Extracted path: "${audioPath}"`);
    this.logger.log(`Decoded audioPath: "${decodedPath}"`);

    if (!decodedPath) {
      this.logger.error('audioPath is undefined or empty');
      res.status(400).json({ error: 'Invalid audio path' });
      return;
    }

    const musicRootInfo = await this.musicService.getMusicRoot();
    this.logger.log(`musicRootInfo: ${JSON.stringify(musicRootInfo)}`);
    const fullPath = path.resolve(musicRootInfo.root, decodedPath);

    // Security check - ensure the path is within music root
    if (!fullPath.startsWith(path.resolve(musicRootInfo.root))) {
      res.status(HttpStatus.FORBIDDEN).json({ error: 'Access denied' });
      return;
    }

    // Check if file exists
    stat(fullPath, (err: NodeJS.ErrnoException | null, stats: Stats) => {
      if (err) {
        this.logger.error('Audio file not found:', fullPath);
        res
          .status(HttpStatus.NOT_FOUND)
          .json({ error: 'Audio file not found' });
        return;
      }

      const fileSize = stats.size;

      // Set proper MIME type based on file extension
      const ext = path.extname(fullPath).toLowerCase();
      const mimeTypes: { [key: string]: string } = {
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg',
        '.m4a': 'audio/mp4',
        '.aac': 'audio/aac',
        '.flac': 'audio/flac',
        '.webm': 'audio/webm',
      };
      const contentType = mimeTypes[ext] || 'audio/mpeg';

      if (range) {
        // Parse range header
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = end - start + 1;

        // Validate range
        if (start >= fileSize || end >= fileSize) {
          res.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE).set({
            'Content-Range': `bytes */${fileSize}`,
          });
          res.end();
          return;
        }

        const headers = {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize.toString(),
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=3600',
        };

        res.writeHead(HttpStatus.PARTIAL_CONTENT, headers);
        const stream = createReadStream(fullPath, { start, end });
        stream.pipe(res);
      } else {
        // No range requested, serve entire file
        const headers = {
          'Content-Length': fileSize.toString(),
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=3600',
        };

        res.writeHead(HttpStatus.OK, headers);
        createReadStream(fullPath).pipe(res);
      }
    });
  }
}
