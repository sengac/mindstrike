import fs from 'fs/promises';
import path from 'path';
import { getLocalModelSettingsDirectory } from './settings-directory.js';

export interface ModelLoadingSettings {
  gpuLayers?: number; // -1 for auto, 0 for CPU only, positive number for specific layers
  contextSize?: number;
  batchSize?: number;
  threads?: number;
  temperature?: number; // 0.0 to 2.0, controls randomness of generation
}

export class ModelSettingsManager {
  private readonly settingsDir: string;

  constructor() {
    this.settingsDir = getLocalModelSettingsDirectory();
  }

  /**
   * Ensure the settings directory exists
   */
  private async ensureSettingsDirectory(): Promise<void> {
    try {
      await fs.access(this.settingsDir);
    } catch {
      await fs.mkdir(this.settingsDir, { recursive: true });
    }
  }

  /**
   * Get the settings file path for a model
   */
  private getSettingsFilePath(modelId: string): string {
    return path.join(this.settingsDir, `${modelId}.json`);
  }

  /**
   * Save model settings to disk
   */
  async saveModelSettings(
    modelId: string,
    settings: ModelLoadingSettings
  ): Promise<void> {
    try {
      await this.ensureSettingsDirectory();
      const filePath = this.getSettingsFilePath(modelId);
      await fs.writeFile(filePath, JSON.stringify(settings, null, 2));
    } catch (error) {
      console.error(`Error saving settings for model ${modelId}:`, error);
      throw error;
    }
  }

  /**
   * Load model settings from disk
   */
  async loadModelSettings(
    modelId: string
  ): Promise<ModelLoadingSettings | null> {
    try {
      const filePath = this.getSettingsFilePath(modelId);
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null; // Settings file doesn't exist
      }
      console.error(`Error loading settings for model ${modelId}:`, error);
      throw error;
    }
  }

  /**
   * Load all model settings from disk
   */
  async loadAllModelSettings(): Promise<Record<string, ModelLoadingSettings>> {
    try {
      await this.ensureSettingsDirectory();
      const files = await fs.readdir(this.settingsDir);
      const settings: Record<string, ModelLoadingSettings> = {};

      for (const file of files) {
        if (file.endsWith('.json')) {
          const modelId = path.basename(file, '.json');
          try {
            const modelSettings = await this.loadModelSettings(modelId);
            if (modelSettings) {
              settings[modelId] = modelSettings;
            }
          } catch (error) {
            console.error(
              `Error loading settings for model ${modelId}:`,
              error
            );
          }
        }
      }

      return settings;
    } catch (error) {
      console.error('Error loading all model settings:', error);
      return {};
    }
  }

  /**
   * Delete model settings from disk
   */
  async deleteModelSettings(modelId: string): Promise<void> {
    try {
      const filePath = this.getSettingsFilePath(modelId);
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return; // Settings file doesn't exist, nothing to delete
      }
      console.error(`Error deleting settings for model ${modelId}:`, error);
      throw error;
    }
  }

  /**
   * Clean up settings files for models that no longer exist
   */
  async cleanupModelSettings(existingModelIds: string[]): Promise<void> {
    try {
      await this.ensureSettingsDirectory();
      const files = await fs.readdir(this.settingsDir);

      for (const file of files) {
        if (file.endsWith('.json')) {
          const modelId = path.basename(file, '.json');
          if (!existingModelIds.includes(modelId)) {
            await this.deleteModelSettings(modelId);
          }
        }
      }
    } catch (error) {
      console.error('Error cleaning up model settings:', error);
    }
  }
}

// Singleton instance
export const modelSettingsManager = new ModelSettingsManager();
