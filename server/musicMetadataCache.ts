import { logger } from './logger.js';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { getMindstrikeDirectory } from './utils/settingsDirectory.js';
import { parseFile } from 'music-metadata';

interface CachedMusicMetadata {
  filePath: string;
  mtime: number; // File modification time for cache invalidation
  metadata: any;
  title?: string;
  artist?: string;
  album?: string;
  genre?: string[];
  year?: number;
  duration?: string;
  coverArtHash?: string; // Store image hash instead of full data URL
  cachedAt: number;
}

export class MusicMetadataCache {
  private cache: Map<string, CachedMusicMetadata> = new Map();
  private readonly imageCache: Map<string, string> = new Map(); // hash -> base64
  private readonly cacheDir: string;
  private readonly cacheFile: string;
  private readonly imageCacheDir: string;

  /**
   * Clean metadata object by removing all binary data
   */
  private cleanMetadata(metadata: any): any {
    if (!metadata) {
      return metadata;
    }

    // Deep clone without binary data
    const cleaned = this.deepCleanObject(metadata);
    return cleaned;
  }

  /**
   * Recursively clean an object, removing binary data and large arrays
   */
  private deepCleanObject(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    // Handle primitives
    if (typeof obj !== 'object') {
      return obj;
    }

    // Handle arrays
    if (Array.isArray(obj)) {
      return obj.map(item => this.deepCleanObject(item));
    }

    // Handle Buffer/Uint8Array (binary data)
    if (obj instanceof Buffer || obj instanceof Uint8Array) {
      return `[Binary data: ${obj.length} bytes]`;
    }

    // Handle objects
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Skip known binary data fields
      if (
        key === 'data' &&
        (value instanceof Buffer || value instanceof Uint8Array)
      ) {
        cleaned[key] = `[Binary data: ${value.length} bytes]`;
        continue;
      }

      // Skip picture arrays entirely
      if (key === 'picture' && Array.isArray(value)) {
        cleaned[key] = `[${value.length} pictures removed]`;
        continue;
      }

      // Clean recursively
      cleaned[key] = this.deepCleanObject(value);
    }

    return cleaned;
  }

  constructor() {
    this.cacheDir = path.join(getMindstrikeDirectory(), 'cache');
    this.cacheFile = path.join(this.cacheDir, 'music-metadata.json');
    this.imageCacheDir = path.join(this.cacheDir, 'images');
    this.ensureCacheDirectory();
    this.loadCacheFromFile();
    this.loadImageCache();
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
        const data = JSON.parse(cacheData);

        this.cache = new Map();

        // Check if this is chunked data
        if (data.chunks && data.totalEntries) {
          // Load from chunks
          for (let i = 0; i < data.chunks; i++) {
            const chunkFile = path.join(
              this.cacheDir,
              `music-metadata-chunk-${i}.json`
            );
            if (fs.existsSync(chunkFile)) {
              const chunkData = fs.readFileSync(chunkFile, 'utf-8');
              const chunk = JSON.parse(chunkData);
              chunk.metadata.forEach((item: CachedMusicMetadata) => {
                this.cache.set(item.filePath, item);
              });
            }
          }
          logger.debug(
            `Loaded music metadata cache with ${this.cache.size} entries from ${data.chunks} chunks`
          );
        } else {
          // Legacy format - single file
          const metadataArray = data.metadata || [];
          metadataArray.forEach((item: CachedMusicMetadata) => {
            this.cache.set(item.filePath, item);
          });
          logger.debug(
            `Loaded music metadata cache with ${this.cache.size} entries`
          );
        }
      }
    } catch (error) {
      logger.warn('Failed to load music metadata cache:', error);
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
      logger.debug(`Loaded ${this.imageCache.size} cached images`);
    } catch (error) {
      logger.warn('Failed to load image cache:', error);
    }
  }

  private async saveCacheToFile() {
    try {
      const data = {
        metadata: Array.from(this.cache.values()),
        lastUpdated: new Date().toISOString(),
      };

      // Check if data is too large for JSON.stringify
      const jsonString = JSON.stringify(data);
      if (jsonString.length > 268435456) {
        // 256MB limit
        logger.warn(
          `Cache data too large (${jsonString.length} chars), splitting into chunks`
        );

        // Save in chunks
        const chunks = [];
        const chunkSize = 1000; // entries per chunk
        const entries = Array.from(this.cache.values());

        for (let i = 0; i < entries.length; i += chunkSize) {
          chunks.push(entries.slice(i, i + chunkSize));
        }

        // Save chunk info
        const chunkData = {
          chunks: chunks.length,
          totalEntries: entries.length,
          lastUpdated: new Date().toISOString(),
        };

        await fs.promises.writeFile(
          this.cacheFile,
          JSON.stringify(chunkData, null, 2)
        );

        // Save each chunk
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

        logger.debug(`Saved music metadata cache in ${chunks.length} chunks`);
      } else {
        await fs.promises.writeFile(this.cacheFile, jsonString);
        logger.debug(
          `Saved music metadata cache with ${this.cache.size} entries`
        );
      }
    } catch (error) {
      logger.warn('Failed to save music metadata cache:', error);
    }
  }

  /**
   * Get cached metadata for a file, or extract and cache if not found/outdated
   */
  async getMetadata(filePath: string): Promise<{
    metadata: any;
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

    // Check if we have valid cached data
    if (cached && cached.mtime === mtime) {
      logger.debug(`Using cached metadata for ${filePath}`);

      // Reconstruct coverArtUrl from hash if available
      let coverArtUrl: string | undefined;
      if (cached.coverArtHash) {
        if (this.imageCache.has(cached.coverArtHash)) {
          coverArtUrl = this.imageCache.get(cached.coverArtHash);
        } else {
          // Try to load from disk
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
            logger.warn(
              `Failed to load cached image ${cached.coverArtHash}:`,
              error
            );
          }
        }
      }

      return {
        metadata: cached.metadata,
        title: cached.title || path.basename(filePath, path.extname(filePath)),
        artist: cached.artist || 'Unknown Artist',
        album: cached.album,
        genre: cached.genre,
        year: cached.year,
        duration: cached.duration || '0:00',
        coverArtUrl,
      };
    }

    // Extract metadata from file
    logger.debug(`Extracting metadata for ${filePath}`);

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
    let metadata: any = undefined;

    try {
      const metadataResult = await parseFile(filePath);

      // Store only essential metadata, no binary data
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

      // Extract basic info
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

      // Format duration
      if (metadataResult.format.duration) {
        const mins = Math.floor(metadataResult.format.duration / 60);
        const secs = Math.floor(metadataResult.format.duration % 60);
        duration = `${mins}:${secs.toString().padStart(2, '0')}`;
      }

      // Extract cover art and store efficiently
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

        // Check if we already have this image cached
        if (this.imageCache.has(coverArtHash)) {
          coverArtUrl = this.imageCache.get(coverArtHash);
        } else {
          // Save image to disk and cache the reference
          const ext = picture.format === 'image/jpeg' ? 'jpg' : 'png';
          const imagePath = path.join(
            this.imageCacheDir,
            `${coverArtHash}.${ext}`
          );

          await fs.promises.writeFile(imagePath, imageBuffer);
          const base64 = imageBuffer.toString('base64');
          coverArtUrl = `data:${picture.format};base64,${base64}`;

          // Cache the data URL for quick access
          this.imageCache.set(coverArtHash, coverArtUrl);
        }
      }
    } catch (error) {
      logger.warn(`Failed to extract metadata for ${filePath}:`, error);
    }

    // Cache the result
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
      coverArtHash, // Store only the hash, not the full data URL
      cachedAt: Date.now(),
    };

    this.cache.set(filePath, cacheEntry);
    // Note: Cache is saved periodically, not after each file to avoid excessive I/O

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

  /**
   * Save cache to disk
   */
  async saveCache() {
    await this.saveCacheToFile();
  }

  /**
   * Clear all cached metadata
   */
  async clearCache() {
    this.cache.clear();
    this.imageCache.clear();

    // Remove chunk files
    const files = fs.readdirSync(this.cacheDir);
    for (const file of files) {
      if (file.startsWith('music-metadata-chunk-')) {
        fs.unlinkSync(path.join(this.cacheDir, file));
      }
    }

    // Remove image files
    const imageFiles = fs.readdirSync(this.imageCacheDir);
    for (const file of imageFiles) {
      fs.unlinkSync(path.join(this.imageCacheDir, file));
    }

    await this.saveCacheToFile();
    logger.info('Music metadata cache cleared');
  }

  /**
   * Get cache statistics
   */
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

// Export singleton instance
export const musicMetadataCache = new MusicMetadataCache();
