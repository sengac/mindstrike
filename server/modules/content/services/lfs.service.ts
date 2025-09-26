import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { getMindstrikeDirectory } from '../../../shared/utils/settings-directory';

interface ContentSummary {
  summary: string;
  originalSize: number;
  keyPoints?: string[];
}

@Injectable()
export class LfsService {
  private readonly logger = new Logger(LfsService.name);
  private readonly storageDir: string;
  private readonly contentMap: Map<string, string> = new Map();
  private readonly summaryMap: Map<string, ContentSummary> = new Map();
  private readonly refCounter: Map<string, number> = new Map();
  private readonly maxMemorySize = 10 * 1024 * 1024; // 10MB in memory
  private currentMemoryUsage = 0;

  constructor() {
    this.storageDir = path.join(getMindstrikeDirectory(), 'lfs');
    this.ensureStorageDir();
  }

  private ensureStorageDir(): void {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  isLFSReference(content: string): boolean {
    return content.startsWith('lfs://');
  }

  storeContent(content: string): string {
    const contentId = this.generateContentId(content);
    const reference = `lfs://${contentId}`;

    // Store in memory if small enough
    if (content.length < this.maxMemorySize - this.currentMemoryUsage) {
      this.contentMap.set(contentId, content);
      this.currentMemoryUsage += content.length;
    } else {
      // Store to disk for large content
      const filePath = path.join(this.storageDir, `${contentId}.lfs`);
      fs.writeFileSync(filePath, content, 'utf-8');
    }

    // Update reference counter
    this.refCounter.set(contentId, (this.refCounter.get(contentId) || 0) + 1);

    return reference;
  }

  retrieveContent(reference: string): string | null {
    if (!this.isLFSReference(reference)) {
      return null;
    }

    const contentId = reference.replace('lfs://', '');

    // Check memory first
    if (this.contentMap.has(contentId)) {
      return this.contentMap.get(contentId) || null;
    }

    // Check disk
    const filePath = path.join(this.storageDir, `${contentId}.lfs`);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }

    return null;
  }

  storeSummary(reference: string, summary: ContentSummary): void {
    const contentId = reference.replace('lfs://', '');
    this.summaryMap.set(contentId, summary);
  }

  getSummaryByReference(reference: string): ContentSummary | null {
    const contentId = reference.replace('lfs://', '');
    return this.summaryMap.get(contentId) || null;
  }

  deleteContent(reference: string): boolean {
    if (!this.isLFSReference(reference)) {
      return false;
    }

    const contentId = reference.replace('lfs://', '');

    // Update reference counter
    const count = this.refCounter.get(contentId) || 0;
    if (count > 1) {
      this.refCounter.set(contentId, count - 1);
      return false; // Don't delete if still referenced
    }

    // Remove from memory
    if (this.contentMap.has(contentId)) {
      const content = this.contentMap.get(contentId);
      if (content) {
        this.currentMemoryUsage -= content.length;
      }
      this.contentMap.delete(contentId);
    }

    // Remove from disk
    const filePath = path.join(this.storageDir, `${contentId}.lfs`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Clean up metadata
    this.summaryMap.delete(contentId);
    this.refCounter.delete(contentId);

    return true;
  }

  getStats(): {
    totalItems: number;
    memoryItems: number;
    diskItems: number;
    memoryUsage: number;
    totalReferences: number;
  } {
    const diskFiles = fs
      .readdirSync(this.storageDir)
      .filter(file => file.endsWith('.lfs'));

    let totalReferences = 0;
    for (const count of this.refCounter.values()) {
      totalReferences += count;
    }

    return {
      totalItems: this.contentMap.size + diskFiles.length,
      memoryItems: this.contentMap.size,
      diskItems: diskFiles.length,
      memoryUsage: this.currentMemoryUsage,
      totalReferences,
    };
  }

  private generateContentId(content: string): string {
    // Generate a unique ID based on content hash and timestamp
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    return `${hash.substring(0, 16)}_${Date.now()}`;
  }

  clearCache(): void {
    // Clear memory cache
    this.contentMap.clear();
    this.summaryMap.clear();
    this.refCounter.clear();
    this.currentMemoryUsage = 0;

    // Clear disk cache
    const files = fs.readdirSync(this.storageDir);
    for (const file of files) {
      if (file.endsWith('.lfs')) {
        fs.unlinkSync(path.join(this.storageDir, file));
      }
    }
  }
}
