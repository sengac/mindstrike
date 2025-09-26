import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { getMindstrikeDirectory } from '../../utils/settingsDirectory';
import { parseFile } from 'music-metadata';

interface CachedMusicMetadata {
  filePath: string;
  mtime: number;
  metadata: unknown;
  title?: string;
  artist?: string;
  album?: string;
  genre?: string[];
  year?: number;
  duration?: string;
  coverArtHash?: string;
  cachedAt: number;
}

@Injectable()
export class MusicMetadataCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(MusicMetadataCacheService.name);
  private cache: Map<string, CachedMusicMetadata> = new Map();
  private readonly imageCache: Map<string, string> = new Map();
  private readonly cacheDir: string;
  private readonly cacheFile: string;
  private readonly imageCacheDir: string;

  constructor() {
    this.cacheDir = path.join(getMindstrikeDirectory(), 'cache');
    this.cacheFile = path.join(this.cacheDir, 'music-metadata.json');
    this.imageCacheDir = path.join(this.cacheDir, 'images');
    this.ensureCacheDirectory();
    this.loadCacheFromFile();
    this.loadImageCache();
  }

  async onModuleDestroy() {
    await this.saveCache();
  }

  private cleanMetadata(metadata: unknown): unknown {
    if (!metadata) {
      return metadata;
    }
    const cleaned = this.deepCleanObject(metadata);
    return cleaned;
  }

  private deepCleanObject(obj: unknown): unknown {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.deepCleanObject(item));
    }

    if (obj instanceof Buffer || obj instanceof Uint8Array) {
      return `[Binary data: ${obj.length} bytes]`;
    }

    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (
        key === 'data' &&
        (value instanceof Buffer || value instanceof Uint8Array)
      ) {
        cleaned[key] = `[Binary data: ${value.length} bytes]`;
        continue;
      }

      if (key === 'picture' && Array.isArray(value)) {
        cleaned[key] = `[${value.length} pictures removed]`;
        continue;
      }

      cleaned[key] = this.deepCleanObject(value);
    }

    return cleaned;
  }

  private ensureCacheDirectory() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    if (!fs.existsSync(this.imageCacheDir)) {
      fs.mkdirSync(this.imageCacheDir, { recursive: true });
    }
  }

  private loadCacheFromFile() {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const cacheData = fs.readFileSync(this.cacheFile, 'utf-8');
        const data = JSON.parse(cacheData) as {
          chunks?: number;
          totalEntries?: number;
          metadata?: CachedMusicMetadata[];
        };

        this.cache = new Map();

        if (data.chunks && data.totalEntries) {
          for (let i = 0; i < data.chunks; i++) {
            const chunkFile = path.join(
              this.cacheDir,
              `music-metadata-chunk-${i}.json`
            );
            if (fs.existsSync(chunkFile)) {
              const chunkData = fs.readFileSync(chunkFile, 'utf-8');
              const chunk = JSON.parse(chunkData) as {
                metadata: CachedMusicMetadata[];
              };
              chunk.metadata.forEach((item: CachedMusicMetadata) => {
                this.cache.set(item.filePath, item);
              });
            }
          }
          this.logger.debug(
            `Loaded music metadata cache with ${this.cache.size} entries from ${data.chunks} chunks`
          );
        } else {
          const metadataArray = data.metadata ?? [];
          metadataArray.forEach(item => {
            this.cache.set(item.filePath, item);
          });
          this.logger.debug(
            `Loaded music metadata cache with ${this.cache.size} entries`
          );
        }
      }
    } catch (error) {
      this.logger.warn('Failed to load music metadata cache:', error);
    }
  }

  private loadImageCache() {
    try {
      const files = fs.readdirSync(this.imageCacheDir);
      for (const file of files) {
        if (file.endsWith('.jpg') || file.endsWith('.png')) {
          const hash = path.basename(file, path.extname(file));
          const imagePath = path.join(this.imageCacheDir, file);
          const imageData = fs.readFileSync(imagePath);
          const base64 = imageData.toString('base64');
          const format = file.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
          this.imageCache.set(hash, `data:${format};base64,${base64}`);
        }
      }
      this.logger.debug(`Loaded ${this.imageCache.size} cached images`);
    } catch (error) {
      this.logger.warn('Failed to load image cache:', error);
    }
  }

  private async saveCacheToFile() {
    try {
      const data = {
        metadata: Array.from(this.cache.values()),
        lastUpdated: new Date().toISOString(),
      };

      const jsonString = JSON.stringify(data);
      if (jsonString.length > 268435456) {
        this.logger.warn(
          `Cache data too large (${jsonString.length} chars), splitting into chunks`
        );

        const chunks = [];
        const chunkSize = 1000;
        const entries = Array.from(this.cache.values());

        for (let i = 0; i < entries.length; i += chunkSize) {
          chunks.push(entries.slice(i, i + chunkSize));
        }

        const chunkData = {
          chunks: chunks.length,
          totalEntries: entries.length,
          lastUpdated: new Date().toISOString(),
        };

        await fs.promises.writeFile(
          this.cacheFile,
          JSON.stringify(chunkData, null, 2)
        );

        for (let i = 0; i < chunks.length; i++) {
          const chunkFile = path.join(
            this.cacheDir,
            `music-metadata-chunk-${i}.json`
          );
          await fs.promises.writeFile(
            chunkFile,
            JSON.stringify({ metadata: chunks[i] }, null, 2)
          );
        }

        this.logger.debug(
          `Saved music metadata cache in ${chunks.length} chunks`
        );
      } else {
        await fs.promises.writeFile(this.cacheFile, jsonString);
        this.logger.debug(
          `Saved music metadata cache with ${this.cache.size} entries`
        );
      }
    } catch (error) {
      this.logger.warn('Failed to save music metadata cache:', error);
    }
  }

  async getMetadata(filePath: string): Promise<{
    metadata: unknown;
    title: string;
    artist: string;
    album?: string;
    genre?: string[];
    year?: number;
    duration: string;
    coverArtUrl?: string;
  }> {
    const stats = fs.statSync(filePath);
    const mtime = stats.mtime.getTime();
    const cached = this.cache.get(filePath);

    if (cached && cached.mtime === mtime) {
      this.logger.debug(`Using cached metadata for ${filePath}`);

      let coverArtUrl: string | undefined;
      if (cached.coverArtHash) {
        if (this.imageCache.has(cached.coverArtHash)) {
          coverArtUrl = this.imageCache.get(cached.coverArtHash);
        } else {
          const jpgPath = path.join(
            this.imageCacheDir,
            `${cached.coverArtHash}.jpg`
          );
          const pngPath = path.join(
            this.imageCacheDir,
            `${cached.coverArtHash}.png`
          );

          try {
            if (fs.existsSync(jpgPath)) {
              const imageData = fs.readFileSync(jpgPath);
              const base64 = imageData.toString('base64');
              coverArtUrl = `data:image/jpeg;base64,${base64}`;
              this.imageCache.set(cached.coverArtHash, coverArtUrl);
            } else if (fs.existsSync(pngPath)) {
              const imageData = fs.readFileSync(pngPath);
              const base64 = imageData.toString('base64');
              coverArtUrl = `data:image/png;base64,${base64}`;
              this.imageCache.set(cached.coverArtHash, coverArtUrl);
            }
          } catch (error) {
            this.logger.warn(
              `Failed to load cached image ${cached.coverArtHash}:`,
              error
            );
          }
        }
      }

      return {
        metadata: cached.metadata,
        title: cached.title || path.basename(filePath, path.extname(filePath)),
        artist: cached.artist ?? 'Unknown Artist',
        album: cached.album,
        genre: cached.genre,
        year: cached.year,
        duration: cached.duration ?? '0:00',
        coverArtUrl,
      };
    }

    this.logger.debug(`Extracting metadata for ${filePath}`);

    const fileName = path.basename(filePath, path.extname(filePath));
    let title = fileName
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
    let artist = 'Unknown Artist';
    let album: string | undefined;
    let genre: string[] | undefined;
    let year: number | undefined;
    let coverArtUrl: string | undefined;
    let coverArtHash: string | undefined;
    let duration = '0:00';
    let metadata: unknown = undefined;

    try {
      const metadataResult = await parseFile(filePath);

      metadata = {
        format: {
          duration: metadataResult.format?.duration,
          bitrate: metadataResult.format?.bitrate,
          sampleRate: metadataResult.format?.sampleRate,
          numberOfChannels: metadataResult.format?.numberOfChannels,
          codec: metadataResult.format?.codec,
          container: metadataResult.format?.container,
        },
        common: {
          title: metadataResult.common?.title,
          artist: metadataResult.common?.artist,
          album: metadataResult.common?.album,
          year: metadataResult.common?.year,
          genre: metadataResult.common?.genre,
          track: metadataResult.common?.track,
          disk: metadataResult.common?.disk,
        },
      };

      if (metadataResult.common.title) {
        title = metadataResult.common.title;
      }
      if (metadataResult.common.artist) {
        artist = metadataResult.common.artist;
      }
      if (metadataResult.common.album) {
        album = metadataResult.common.album;
      }
      if (metadataResult.common.genre) {
        genre = metadataResult.common.genre;
      }
      if (metadataResult.common.year) {
        year = metadataResult.common.year;
      }

      if (metadataResult.format.duration) {
        const mins = Math.floor(metadataResult.format.duration / 60);
        const secs = Math.floor(metadataResult.format.duration % 60);
        duration = `${mins}:${secs.toString().padStart(2, '0')}`;
      }

      if (
        metadataResult.common.picture &&
        metadataResult.common.picture.length > 0
      ) {
        const picture = metadataResult.common.picture[0];
        const imageBuffer = Buffer.from(picture.data);
        coverArtHash = crypto
          .createHash('md5')
          .update(imageBuffer)
          .digest('hex');

        if (this.imageCache.has(coverArtHash)) {
          coverArtUrl = this.imageCache.get(coverArtHash);
        } else {
          const ext = picture.format === 'image/jpeg' ? 'jpg' : 'png';
          const imagePath = path.join(
            this.imageCacheDir,
            `${coverArtHash}.${ext}`
          );

          await fs.promises.writeFile(imagePath, imageBuffer);
          const base64 = imageBuffer.toString('base64');
          coverArtUrl = `data:${picture.format};base64,${base64}`;

          this.imageCache.set(coverArtHash, coverArtUrl);
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to extract metadata for ${filePath}:`, error);
    }

    const cacheEntry: CachedMusicMetadata = {
      filePath,
      mtime,
      metadata,
      title,
      artist,
      album,
      genre,
      year,
      duration,
      coverArtHash,
      cachedAt: Date.now(),
    };

    this.cache.set(filePath, cacheEntry);

    return {
      metadata,
      title,
      artist,
      album,
      genre,
      year,
      duration,
      coverArtUrl,
    };
  }

  async saveCache() {
    await this.saveCacheToFile();
  }

  async clearCache() {
    this.cache.clear();
    this.imageCache.clear();

    const files = fs.readdirSync(this.cacheDir);
    for (const file of files) {
      if (file.startsWith('music-metadata-chunk-')) {
        fs.unlinkSync(path.join(this.cacheDir, file));
      }
    }

    const imageFiles = fs.readdirSync(this.imageCacheDir);
    for (const file of imageFiles) {
      fs.unlinkSync(path.join(this.imageCacheDir, file));
    }

    await this.saveCacheToFile();
    this.logger.log('Music metadata cache cleared');
  }

  getCacheStats() {
    return {
      totalEntries: this.cache.size,
      cachedImages: this.imageCache.size,
      cacheFile: this.cacheFile,
      imageCacheDir: this.imageCacheDir,
      lastUpdated: new Date().toISOString(),
    };
  }
}
