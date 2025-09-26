import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

interface LFSEntry {
  id: string;
  content: string; // base64 encoded
  timestamp: number;
  originalSize: number;
  compressedSize: number;
  contentType?: string;
  processedAt?: number;
  hash: string;
  metadata?: Record<string, unknown>;
}

interface LFSStats {
  totalSize: number;
  fileCount: number;
  cacheHits: number;
  cacheMisses: number;
  oldestEntry?: Date;
  newestEntry?: Date;
}

@Injectable()
export class ContentService implements OnModuleInit {
  private readonly logger = new Logger(ContentService.name);
  private entries: Map<string, LFSEntry> = new Map();
  private readonly filePath: string;
  private readonly maxSizeBytes = 1024; // 1KB threshold for LFS storage
  private stats: LFSStats = {
    totalSize: 0,
    fileCount: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };
  private workspaceRoot: string;
  private isLoaded = false;

  constructor(private configService: ConfigService) {
    this.workspaceRoot =
      this.configService?.get<string>('WORKSPACE_ROOT') ?? process.cwd();
    this.filePath = path.join(this.workspaceRoot, 'mindstrike-lfs.json');
  }

  async onModuleInit(): Promise<void> {
    await this.loadFromFile();
  }

  /**
   * Load LFS entries from file
   */
  private async loadFromFile(): Promise<void> {
    if (this.isLoaded) {
      return;
    }

    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      const entries = JSON.parse(data) as Record<string, LFSEntry>;

      this.entries.clear();
      let totalSize = 0;
      let oldestTimestamp = Date.now();
      let newestTimestamp = 0;

      for (const [id, entry] of Object.entries(entries)) {
        this.entries.set(id, entry);
        totalSize += entry.compressedSize;
        oldestTimestamp = Math.min(oldestTimestamp, entry.timestamp);
        newestTimestamp = Math.max(newestTimestamp, entry.timestamp);
      }

      this.stats = {
        totalSize,
        fileCount: this.entries.size,
        cacheHits: 0,
        cacheMisses: 0,
        oldestEntry: oldestTimestamp ? new Date(oldestTimestamp) : undefined,
        newestEntry: newestTimestamp ? new Date(newestTimestamp) : undefined,
      };

      this.logger.log(`Loaded ${this.entries.size} LFS entries`);
    } catch (error) {
      this.logger.debug('No LFS file found, starting fresh');
      this.entries.clear();
    }

    this.isLoaded = true;
  }

  /**
   * Save LFS entries to file
   */
  private async saveToFile(): Promise<void> {
    const entriesObj: Record<string, LFSEntry> = {};
    for (const [id, entry] of this.entries.entries()) {
      entriesObj[id] = entry;
    }

    await fs.writeFile(
      this.filePath,
      JSON.stringify(entriesObj, null, 2),
      'utf-8'
    );
    this.logger.debug(`Saved ${this.entries.size} LFS entries to file`);
  }

  /**
   * Store content if it's over the size threshold
   */
  async storeLargeContent(content: string): Promise<{
    id: string;
    size: number;
    stored: boolean;
    reference?: string;
  }> {
    const contentSize = Buffer.byteLength(content, 'utf8');

    // Only store if content is over threshold
    if (contentSize <= this.maxSizeBytes) {
      return {
        id: '',
        size: contentSize,
        stored: false,
      };
    }

    const id = uuidv4();
    const base64Content = Buffer.from(content, 'utf8').toString('base64');
    const compressedSize = Buffer.byteLength(base64Content, 'utf8');
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    const contentType = this.detectContentType(content);

    const entry: LFSEntry = {
      id,
      content: base64Content,
      timestamp: Date.now(),
      originalSize: contentSize,
      compressedSize,
      contentType,
      hash,
      metadata: {},
    };

    this.entries.set(id, entry);
    this.stats.fileCount++;
    this.stats.totalSize += compressedSize;
    await this.saveToFile();

    this.logger.log(
      `Stored large content: ${contentSize} bytes -> ${compressedSize} bytes (${id})`
    );

    return {
      id,
      size: contentSize,
      stored: true,
      reference: `[LFS:${id}]`,
    };
  }

  /**
   * Get large content by ID
   */
  async getLargeContent(contentId: string): Promise<{
    id: string;
    type: string;
    size: number;
    content?: string;
    metadata: Record<string, unknown>;
  }> {
    // Handle LFS reference format
    const lfsMatch = contentId.match(/^\[LFS:([^\]]+)\]$/);
    const actualId = lfsMatch ? lfsMatch[1] : contentId;

    const entry = this.entries.get(actualId);
    if (!entry) {
      this.stats.cacheMisses++;
      throw new NotFoundException(`Content not found: ${actualId}`);
    }

    this.stats.cacheHits++;

    // Decode the content
    const content = Buffer.from(entry.content, 'base64').toString('utf8');

    return {
      id: actualId,
      type: entry.contentType || 'text',
      size: entry.originalSize,
      content,
      metadata: entry.metadata || {},
    };
  }

  /**
   * Get LFS content directly
   */
  async getLfsContent(lfsId: string): Promise<{
    id: string;
    content: string;
    size: number;
    hash: string;
  }> {
    const entry = this.entries.get(lfsId);
    if (!entry) {
      this.stats.cacheMisses++;
      throw new NotFoundException(`LFS entry not found: ${lfsId}`);
    }

    this.stats.cacheHits++;
    const content = Buffer.from(entry.content, 'base64').toString('utf8');

    return {
      id: lfsId,
      content,
      size: entry.originalSize,
      hash: entry.hash,
    };
  }

  /**
   * Get LFS statistics
   */
  async getLfsStats(): Promise<LFSStats> {
    return { ...this.stats };
  }

  /**
   * Get LFS entry summary
   */
  async getLfsSummary(lfsId: string): Promise<{
    id: string;
    type: string;
    preview: string;
    metadata: Record<string, unknown>;
    size: number;
    hash: string;
    timestamp: Date;
  }> {
    const entry = this.entries.get(lfsId);
    if (!entry) {
      throw new NotFoundException(`LFS entry not found: ${lfsId}`);
    }

    // Get a preview of the content
    const content = Buffer.from(entry.content, 'base64').toString('utf8');
    const preview =
      content.substring(0, 200) + (content.length > 200 ? '...' : '');

    return {
      id: lfsId,
      type: entry.contentType || 'text',
      preview,
      metadata: entry.metadata || {},
      size: entry.originalSize,
      hash: entry.hash,
      timestamp: new Date(entry.timestamp),
    };
  }

  /**
   * Remove an LFS entry
   */
  async removeEntry(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (entry) {
      this.stats.fileCount--;
      this.stats.totalSize -= entry.compressedSize;
      this.entries.delete(id);
      await this.saveToFile();
      this.logger.log(`Removed LFS entry: ${id}`);
    }
  }

  /**
   * Clear all LFS entries
   */
  async clearAll(): Promise<void> {
    this.entries.clear();
    this.stats = {
      totalSize: 0,
      fileCount: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };
    await this.saveToFile();
    this.logger.log('Cleared all LFS entries');
  }

  /**
   * Detect content type from content
   */
  private detectContentType(content: string): string {
    // Simple content type detection
    if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
      return 'application/json';
    }
    if (content.trim().startsWith('<?xml') || content.trim().startsWith('<')) {
      return 'application/xml';
    }
    if (
      content.includes('\n') &&
      content
        .split('\n')
        .every(line => line === '' || line.includes(':') || line.includes('='))
    ) {
      return 'text/plain';
    }
    return 'text/plain';
  }

  /**
   * Get all LFS entry IDs
   */
  async getAllEntryIds(): Promise<string[]> {
    return Array.from(this.entries.keys());
  }

  /**
   * Check if content is an LFS reference
   */
  isLfsReference(content: string): boolean {
    return /^\[LFS:[^\]]+\]$/.test(content);
  }

  /**
   * Retrieve content by ID or return as-is if not LFS
   */
  async retrieveContent(idOrContent: string): Promise<string> {
    if (this.isLfsReference(idOrContent)) {
      const result = await this.getLargeContent(idOrContent);
      return result.content || '';
    }
    return idOrContent;
  }
}
