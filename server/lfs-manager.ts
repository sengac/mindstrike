import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  documentIngestionService,
  DocumentSummary,
  ProcessedDocument,
  DocumentIngestionService,
} from './document-ingestion-service.js';

interface LFSEntry {
  id: string;
  content: string; // base64 encoded
  timestamp: number;
  originalSize: number;
  compressedSize: number;
  summary?: DocumentSummary;
  contentType?: string;
  processedAt?: number;
}

class LFSManager {
  private entries: Record<string, LFSEntry> = {};
  private filePath: string;
  private readonly maxSizeBytes = 1024;

  constructor() {
    this.filePath = path.join(process.cwd(), 'mindstrike-lfs.json');
    this.loadFromFile();
  }

  /**
   * Store content if it's over the size threshold
   * @param content - The content to potentially store
   * @returns Either the original content (if under threshold) or an LFS reference
   */
  async storeContent(content: string): Promise<string> {
    const contentSize = Buffer.byteLength(content, 'utf8');

    // Only store if content is over threshold
    if (contentSize <= this.maxSizeBytes) {
      return content; // Return original content if under threshold
    }

    const id = uuidv4();
    const base64Content = Buffer.from(content, 'utf8').toString('base64');
    const compressedSize = Buffer.byteLength(base64Content, 'utf8');
    const contentType = DocumentIngestionService.detectContentType(content);

    const entry: LFSEntry = {
      id,
      content: base64Content,
      timestamp: Date.now(),
      originalSize: contentSize,
      compressedSize,
      contentType,
    };

    this.entries[id] = entry;
    await this.saveToFile();

    // Generate summary asynchronously
    this.generateSummaryAsync(id, content, contentType);

    console.log(
      `[LFS] Stored large content: ${contentSize} bytes -> ${compressedSize} bytes (${id})`
    );
    return `[LFS:${id}]`; // Return reference token
  }

  /**
   * Retrieve content by ID or LFS reference
   * @param idOrReference - Either an LFS reference like "[LFS:uuid]" or raw content
   * @returns The decoded content or null if not found
   */
  retrieveContent(idOrReference: string): string | null {
    // Check if this is an LFS reference
    const lfsMatch = idOrReference.match(/^\[LFS:([^\]]+)\]$/);
    if (!lfsMatch) {
      return idOrReference; // Return as-is if not an LFS reference
    }

    const lfsId = lfsMatch[1];
    const entry = this.entries[lfsId];

    if (!entry) {
      console.warn(`[LFS] Entry not found: ${lfsId}`);
      return null;
    }

    try {
      return Buffer.from(entry.content, 'base64').toString('utf8');
    } catch (error) {
      console.error(`[LFS] Failed to decode entry ${lfsId}:`, error);
      return null;
    }
  }

  /**
   * Remove an entry by ID
   */
  async removeEntry(id: string): Promise<void> {
    delete this.entries[id];
    await this.saveToFile();
  }

  /**
   * Clear all entries
   */
  async clearAll(): Promise<void> {
    this.entries = {};
    await this.saveToFile();
  }

  /**
   * Generate summary for content asynchronously
   */
  private async generateSummaryAsync(
    id: string,
    content: string,
    contentType: string
  ): Promise<void> {
    try {
      console.log(`[LFS] Generating summary for ${id}...`);
      const processedDoc = await documentIngestionService.processDocument(
        id,
        content,
        contentType
      );

      const entry = this.entries[id];
      if (entry) {
        entry.summary = processedDoc.summary;
        entry.processedAt = Date.now();
        await this.saveToFile();
        console.log(`[LFS] Generated summary for ${id}`);
      }
    } catch (error) {
      console.error(`[LFS] Failed to generate summary for ${id}:`, error);
    }
  }

  /**
   * Get summary for an LFS entry
   */
  getSummary(id: string): DocumentSummary | null {
    const entry = this.entries[id];
    return entry?.summary || null;
  }

  /**
   * Get summary by LFS reference
   */
  getSummaryByReference(reference: string): DocumentSummary | null {
    const lfsMatch = reference.match(/^\[LFS:([^\]]+)\]$/);
    if (!lfsMatch) return null;

    const lfsId = lfsMatch[1];
    return this.getSummary(lfsId);
  }

  /**
   * Check if entry has summary
   */
  hasSummary(id: string): boolean {
    return !!this.entries[id]?.summary;
  }

  /**
   * Get storage statistics
   */
  getStats(): {
    totalEntries: number;
    totalSize: number;
    totalCompressedSize: number;
    entriesWithSummaries: number;
  } {
    const entries = Object.values(this.entries);
    return {
      totalEntries: entries.length,
      totalSize: entries.reduce((sum, entry) => sum + entry.originalSize, 0),
      totalCompressedSize: entries.reduce(
        (sum, entry) => sum + entry.compressedSize,
        0
      ),
      entriesWithSummaries: entries.filter(entry => entry.summary).length,
    };
  }

  /**
   * Check if a string is an LFS reference
   */
  isLFSReference(content: string): boolean {
    return /^\[LFS:[^\]]+\]$/.test(content);
  }

  /**
   * Save entries to file
   */
  private async saveToFile(): Promise<void> {
    try {
      await fs.promises.writeFile(
        this.filePath,
        JSON.stringify(this.entries, null, 2)
      );
    } catch (error) {
      console.error('[LFS] Failed to save entries to file:', error);
    }
  }

  /**
   * Load entries from file
   */
  private loadFromFile(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf8');
        this.entries = JSON.parse(data);
        console.log(
          `[LFS] Loaded ${Object.keys(this.entries).length} entries from file`
        );
      }
    } catch (error) {
      console.error('[LFS] Failed to load entries from file:', error);
      this.entries = {};
    }
  }
}

// Singleton instance
export const lfsManager = new LFSManager();
