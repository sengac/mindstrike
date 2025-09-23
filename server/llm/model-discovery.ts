import type {
  LocalModelInfo,
  ModelDownloadInfo,
} from '../local-llm-manager.js';
import type { DynamicModelInfo } from '../model-fetcher.js';
import type { ModelFileManager } from './model-file-manager.js';
import type { ModelDownloader } from './model-downloader.js';
import type { ContextCalculator } from './context-calculator.js';
import { logger } from '../logger.js';

/**
 * Handles model discovery, searching, and downloading
 */
export class ModelDiscovery {
  constructor(
    private fileManager: ModelFileManager,
    private downloader: ModelDownloader,
    private contextCalculator: ContextCalculator
  ) {}

  /**
   * Get all local models
   */
  async getLocalModels(): Promise<LocalModelInfo[]> {
    return this.fileManager.getLocalModels(
      this.contextCalculator.calculateSafeContextSize.bind(
        this.contextCalculator
      )
    );
  }

  /**
   * Get both local and available remote models
   */
  async getAvailableModels() {
    const [localModels, remoteModels] = await Promise.all([
      this.getLocalModels(),
      this.downloader.getAvailableModels(),
    ]);

    return {
      local: localModels,
      remote: remoteModels,
    };
  }

  /**
   * Search for models by query
   */
  async searchModels(query: string) {
    const [localModels, remoteModels] = await Promise.all([
      this.getLocalModels(),
      this.downloader.searchModels(query),
    ]);

    const filteredLocal = localModels.filter(
      model =>
        model.name.toLowerCase().includes(query.toLowerCase()) ||
        model.filename.toLowerCase().includes(query.toLowerCase())
    );

    return {
      local: filteredLocal,
      remote: remoteModels,
    };
  }

  /**
   * Download a model
   */
  async downloadModel(
    modelInfo: ModelDownloadInfo | DynamicModelInfo,
    onProgress?: (progress: number, speed?: string) => void
  ): Promise<void> {
    const outputPath = this.fileManager.getModelPath(modelInfo.filename);

    await this.downloader.downloadModel(
      modelInfo as DynamicModelInfo,
      outputPath,
      {
        onProgress,
      }
    );
  }

  /**
   * Cancel a download
   */
  cancelDownload(filename: string): boolean {
    return this.downloader.cancelDownload(filename);
  }

  /**
   * Get download progress
   */
  getDownloadProgress(filename: string) {
    return this.downloader.getDownloadProgress(filename);
  }

  /**
   * Delete a model file
   */
  async deleteModel(modelId: string): Promise<void> {
    const models = await this.getLocalModels();
    const model = models.find(m => m.id === modelId);

    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    await this.fileManager.deleteModelFile(model.path);
    logger.info(`Deleted model ${modelId}`);
  }
}
