import * as fs from 'fs';
import * as path from 'path';
import type { DynamicModelInfo } from '../modelFetcher';
import { modelFetcher } from '../modelFetcher';
import { logger } from '../logger';
import { getMindstrikeDirectory } from '../utils/settingsDirectory';
import {
  HTTP_STATUS,
  USER_AGENT,
  PROGRESS,
  TIMING,
  MEMORY,
  SPEED_FORMAT,
  CALCULATION,
} from './constants';

export interface DownloadProgress {
  progress: number;
  speed: string;
}

export interface DownloadOptions {
  onProgress?: (progress: number, speed?: string) => void;
  signal?: AbortSignal;
}

export class ModelDownloader {
  private readonly downloadingModels = new Set<string>();
  private readonly downloadControllers = new Map<string, AbortController>();
  private readonly downloadProgress = new Map<string, DownloadProgress>();

  /**
   * Check if a model is currently being downloaded
   */
  isDownloading(filename: string): boolean {
    return this.downloadingModels.has(filename);
  }

  /**
   * Get download progress for a model
   */
  getDownloadProgress(filename: string): DownloadProgress | undefined {
    return this.downloadProgress.get(filename);
  }

  /**
   * Cancel a download
   */
  cancelDownload(filename: string): boolean {
    const controller = this.downloadControllers.get(filename);
    if (controller) {
      controller.abort();
      return true;
    }
    return false;
  }

  /**
   * Download a model
   */
  async downloadModel(
    modelInfo: DynamicModelInfo,
    outputPath: string,
    options?: DownloadOptions
  ): Promise<void> {
    const filename = modelInfo.filename;

    // Check if already exists
    if (fs.existsSync(outputPath)) {
      throw new Error('Model already exists');
    }

    // Check if already downloading
    if (this.downloadingModels.has(filename)) {
      throw new Error('Model is already being downloaded');
    }

    this.downloadingModels.add(filename);

    // Create abort controller for this download
    const abortController = new AbortController();
    this.downloadControllers.set(filename, abortController);

    // Combine abort signals if provided
    if (options?.signal) {
      options.signal.addEventListener('abort', () => abortController.abort());
    }

    try {
      console.log(`Starting download of ${modelInfo.name}...`);

      // Get headers with HF token if available
      const headers = await this.getDownloadHeaders();

      const response = await fetch(modelInfo.url, {
        signal: abortController.signal,
        headers,
      });

      if (!response.ok) {
        if (response.status === HTTP_STATUS.UNAUTHORIZED) {
          throw new Error('UNAUTHORIZED_HF_TOKEN_REQUIRED');
        } else if (response.status === HTTP_STATUS.FORBIDDEN) {
          throw new Error('FORBIDDEN_MODEL_ACCESS_REQUIRED');
        } else {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
      }

      const contentLength = response.headers.get('Content-Length');
      const totalSize = contentLength
        ? parseInt(contentLength, 10)
        : PROGRESS.INITIAL;

      await this.streamDownloadToFile(
        response.body!,
        outputPath,
        totalSize,
        filename,
        abortController.signal,
        options?.onProgress
      );

      console.log(`Successfully downloaded ${modelInfo.name} to ${outputPath}`);
    } catch (error) {
      // Clean up partial download
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }

      if (error instanceof Error && error.message === 'Download cancelled') {
        console.log(`Download cancelled: ${filename}`);
      } else {
        console.error(`Download failed: ${filename}`, error);
      }

      throw error;
    } finally {
      this.downloadingModels.delete(filename);
      this.downloadControllers.delete(filename);
      this.downloadProgress.delete(filename);
    }
  }

  /**
   * Get headers for download including HF token if available
   */
  private async getDownloadHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'User-Agent': `${USER_AGENT.NAME}/${USER_AGENT.VERSION}`,
    };

    try {
      if (modelFetcher.hasHuggingFaceToken()) {
        const tokenFile = path.join(getMindstrikeDirectory(), 'hf-token');
        const token = await fs.promises.readFile(tokenFile, 'utf-8');
        headers['Authorization'] = `Bearer ${token.trim()}`;
      }
    } catch {
      logger.debug('No Hugging Face token available for download');
    }

    return headers;
  }

  /**
   * Stream download to file with progress tracking
   */
  private async streamDownloadToFile(
    body: ReadableStream<Uint8Array>,
    outputPath: string,
    totalSize: number,
    filename: string,
    signal: AbortSignal,
    onProgress?: (progress: number, speed?: string) => void
  ): Promise<void> {
    const fileStream = fs.createWriteStream(outputPath);
    const reader = body.getReader();

    let downloadedBytes: number = PROGRESS.INITIAL;
    let lastUpdate = Date.now();
    let lastBytes: number = PROGRESS.INITIAL;

    try {
      while (true) {
        if (signal.aborted) {
          fileStream.destroy();
          throw new Error('Download cancelled');
        }

        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        fileStream.write(value);
        downloadedBytes += value.length;

        const now = Date.now();
        const timeDiff = now - lastUpdate;

        if (
          totalSize > PROGRESS.INITIAL &&
          timeDiff >= TIMING.SPEED_CALCULATION_INTERVAL
        ) {
          // Update every second
          const progress = (downloadedBytes / totalSize) * PROGRESS.COMPLETE;
          const bytesDiff = downloadedBytes - lastBytes;
          const speed = this.formatSpeed(
            bytesDiff / (timeDiff / TIMING.SPEED_CALCULATION_INTERVAL)
          );

          this.downloadProgress.set(filename, {
            progress: Math.round(progress),
            speed,
          });

          if (onProgress) {
            onProgress(Math.round(progress), speed);
          }

          lastUpdate = now;
          lastBytes = downloadedBytes;
        }
      }

      fileStream.end();

      // Final progress update
      if (totalSize > PROGRESS.INITIAL) {
        this.downloadProgress.set(filename, {
          progress: PROGRESS.COMPLETE,
          speed: '0 B/s',
        });
        if (onProgress) {
          onProgress(PROGRESS.COMPLETE, '0 B/s');
        }
      }

      // Wait for file write to complete
      await new Promise<void>((resolve, reject) => {
        fileStream.on('finish', resolve);
        fileStream.on('error', reject);
      });
    } catch (error) {
      fileStream.destroy();
      throw error;
    }
  }

  /**
   * Format download speed
   */
  private formatSpeed(bytesPerSecond: number): string {
    const units = SPEED_FORMAT.UNITS;
    let speed = bytesPerSecond;
    let unitIndex = PROGRESS.INITIAL;

    while (
      speed >= MEMORY.BYTES_TO_KB &&
      unitIndex < units.length - CALCULATION.INCREMENT
    ) {
      speed /= MEMORY.BYTES_TO_KB;
      unitIndex++;
    }

    return `${speed.toFixed(SPEED_FORMAT.PRECISION)} ${units[unitIndex]}`;
  }

  /**
   * Get available models for download
   */
  async getAvailableModels(): Promise<DynamicModelInfo[]> {
    try {
      return await modelFetcher.getAvailableModels();
    } catch (error) {
      logger.error('Failed to fetch available models:', error);
      throw error;
    }
  }

  /**
   * Search for models by query
   */
  async searchModels(query: string): Promise<DynamicModelInfo[]> {
    try {
      return await modelFetcher.searchModels(query);
    } catch (error) {
      logger.error('Failed to search models:', error);
      throw error;
    }
  }
}
