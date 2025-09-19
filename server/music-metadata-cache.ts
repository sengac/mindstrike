import { logger } from './logger.js';
import * as fs from 'fs';
import * as path from 'path';
import { getMindstrikeDirectory } from './utils/settings-directory.js';
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
  coverArtUrl?: string;
  cachedAt: number;
}

export class MusicMetadataCache {
  private cache: Map<string, CachedMusicMetadata> = new Map();
  private cacheDir: string;
  private cacheFile: string;

  /**
   * Clean metadata object by removing all binary data
   */
  private cleanMetadata(metadata: any): any {
    if (!metadata) return metadata;

    const cleaned = JSON.parse(JSON.stringify(metadata));

    // Remove picture data from common
    if (cleaned.common?.picture) {
      cleaned.common.picture = undefined;
    }

    // Remove binary data from native tags
    if (cleaned.native) {
      Object.keys(cleaned.native).forEach(format => {
        if (Array.isArray(cleaned.native[format])) {
          cleaned.native[format] = cleaned.native[format].map((tag: any) => {
            if (
              tag.id === 'APIC' ||
              tag.id === 'PIC' ||
              tag.id === 'coverart'
            ) {
              // Remove binary data but keep metadata about the image
              return {
                ...tag,
                value: tag.value
                  ? {
                      format: tag.value.format,
                      type: tag.value.type,
                      description: tag.value.description,
                      // Remove the actual binary data
                      data: undefined,
                    }
                  : undefined,
              };
            }
            return tag;
          });
        }
      });
    }

    return cleaned;
  }

  constructor() {
    this.cacheDir = path.join(getMindstrikeDirectory(), 'cache');
    this.cacheFile = path.join(this.cacheDir, 'music-metadata.json');
    this.ensureCacheDirectory();
    this.loadCacheFromFile();
  }

  private ensureCacheDirectory() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  private loadCacheFromFile() {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const cacheData = fs.readFileSync(this.cacheFile, 'utf-8');
        const data = JSON.parse(cacheData);

        // Convert array to Map for faster lookups
        const metadataArray = data.metadata || [];
        this.cache = new Map();
        metadataArray.forEach((item: CachedMusicMetadata) => {
          this.cache.set(item.filePath, item);
        });

        logger.debug(
          `Loaded music metadata cache with ${this.cache.size} entries`
        );
      }
    } catch (error) {
      logger.warn('Failed to load music metadata cache:', error);
    }
  }

  private async saveCacheToFile() {
    try {
      const data = {
        metadata: Array.from(this.cache.values()),
        lastUpdated: new Date().toISOString(),
      };

      await fs.promises.writeFile(
        this.cacheFile,
        JSON.stringify(data, null, 2)
      );
      logger.debug(
        `Saved music metadata cache with ${this.cache.size} entries`
      );
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
      return {
        metadata: cached.metadata,
        title: cached.title || path.basename(filePath, path.extname(filePath)),
        artist: cached.artist || 'Unknown Artist',
        album: cached.album,
        genre: cached.genre,
        year: cached.year,
        duration: cached.duration || '0:00',
        coverArtUrl: cached.coverArtUrl,
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
    let duration = '0:00';
    let metadata: any = undefined;

    try {
      const metadataResult = await parseFile(filePath);

      // Clean metadata to remove all binary data
      metadata = this.cleanMetadata(metadataResult);

      // Extract basic info
      if (metadataResult.common.title) title = metadataResult.common.title;
      if (metadataResult.common.artist) artist = metadataResult.common.artist;
      if (metadataResult.common.album) album = metadataResult.common.album;
      if (metadataResult.common.genre) genre = metadataResult.common.genre;
      if (metadataResult.common.year) year = metadataResult.common.year;

      // Format duration
      if (metadataResult.format.duration) {
        const mins = Math.floor(metadataResult.format.duration / 60);
        const secs = Math.floor(metadataResult.format.duration % 60);
        duration = `${mins}:${secs.toString().padStart(2, '0')}`;
      }

      // Extract cover art and store as base64 string
      if (
        metadataResult.common.picture &&
        metadataResult.common.picture.length > 0
      ) {
        const picture = metadataResult.common.picture[0];
        const base64 = Buffer.from(picture.data).toString('base64');
        coverArtUrl = `data:${picture.format};base64,${base64}`;
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
      coverArtUrl,
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
    await this.saveCacheToFile();
    logger.info('Music metadata cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      totalEntries: this.cache.size,
      cacheFile: this.cacheFile,
      lastUpdated: new Date().toISOString(),
    };
  }
}

// Export singleton instance
export const musicMetadataCache = new MusicMetadataCache();
