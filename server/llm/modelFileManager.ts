import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { readGgufFileInfo } from 'node-llama-cpp';
import { getLocalModelsDirectory } from '../utils/settingsDirectory.js';
import type { LocalModelInfo } from '../localLlmManager.js';
import { modelFetcher } from '../modelFetcher.js';
import { DEFAULT_MODEL_PARAMS, MEMORY } from './constants.js';

export interface ModelMetadata {
  name?: string;
  contextLength?: number;
  parameterCount?: string;
  quantization?: string;
}

export class ModelFileManager {
  private readonly modelsDir: string;

  constructor() {
    this.modelsDir = getLocalModelsDirectory();
    this.ensureModelsDirectory();
  }

  private ensureModelsDirectory(): void {
    if (!fs.existsSync(this.modelsDir)) {
      fs.mkdirSync(this.modelsDir, { recursive: true });
    }
  }

  /**
   * Get all locally available models
   */
  async getLocalModels(
    contextSizeResolver?: (
      size: number,
      requestedSize: number,
      filename: string
    ) => Promise<number>
  ): Promise<LocalModelInfo[]> {
    const models: LocalModelInfo[] = [];

    if (!fs.existsSync(this.modelsDir)) {
      return models;
    }

    const files = fs.readdirSync(this.modelsDir);
    const ggufFiles = files.filter(file => file.endsWith('.gguf'));

    for (const filename of ggufFiles) {
      const fullPath = path.join(this.modelsDir, filename);
      const stats = fs.statSync(fullPath);

      // Generate a unique ID for this model
      const id = createHash('md5').update(fullPath).digest('hex');

      // Try to extract model info from filename
      const modelInfo = this.parseModelFilename(filename);

      // Try to get remote model info from cache if available
      const remoteModels = await modelFetcher.getAvailableModels();
      const matchingRemoteModel = remoteModels.find(
        rm => rm.filename === filename
      );

      // Try to read GGUF metadata for layer count and context length
      let layerCount: number | undefined;
      let maxContextLength: number | undefined;
      try {
        const ggufInfo = await readGgufFileInfo(fullPath);
        const ggufMetadata = this.extractGgufMetadata(ggufInfo);
        layerCount = ggufMetadata.layerCount;
        maxContextLength = ggufMetadata.maxContextLength;
      } catch {
        // Silently fail - metadata is optional
      }

      // Calculate context length
      const requestedContextSize =
        maxContextLength ??
        matchingRemoteModel?.contextLength ??
        modelInfo.contextLength ??
        DEFAULT_MODEL_PARAMS.CONTEXT_SIZE;

      const actualContextLength = contextSizeResolver
        ? await contextSizeResolver(stats.size, requestedContextSize, filename)
        : requestedContextSize;

      models.push({
        id,
        name:
          matchingRemoteModel?.name ??
          modelInfo.name ??
          filename.replace('.gguf', ''),
        filename,
        path: fullPath,
        size: stats.size,
        downloaded: true,
        downloading: false,
        contextLength: actualContextLength,
        parameterCount:
          matchingRemoteModel?.parameterCount ?? modelInfo.parameterCount,
        quantization:
          matchingRemoteModel?.quantization ?? modelInfo.quantization,
        layerCount,
        maxContextLength,
      });
    }

    return models;
  }

  /**
   * Extract metadata from GGUF file info
   */
  private extractGgufMetadata(ggufInfo: {
    metadata?: Record<string, unknown>;
  }): {
    layerCount?: number;
    maxContextLength?: number;
  } {
    let layerCount: number | undefined;
    let maxContextLength: number | undefined;

    if (ggufInfo.metadata) {
      const metadata = ggufInfo.metadata as {
        llama?: { block_count?: number; context_length?: number };
        [key: string]: unknown;
      };

      if (metadata.llama) {
        layerCount = metadata.llama.block_count;
        maxContextLength = metadata.llama.context_length;
      } else {
        // Try other common architecture names
        const architectures = ['llama', 'mistral', 'gpt', 'qwen'];
        for (const arch of architectures) {
          const archData = metadata[arch] as
            | { block_count?: number; context_length?: number }
            | undefined;
          if (archData) {
            if (archData.block_count) {
              layerCount = archData.block_count;
            }
            if (archData.context_length) {
              maxContextLength = archData.context_length;
            }
            if (layerCount || maxContextLength) {
              break;
            }
          }
        }
      }
    }

    return { layerCount, maxContextLength };
  }

  /**
   * Parse model filename to extract metadata
   */
  parseModelFilename(filename: string): ModelMetadata {
    const lower = filename.toLowerCase();

    const name = filename.replace('.gguf', '');
    let contextLength: number | undefined;
    let parameterCount: string | undefined;
    let quantization: string | undefined;

    // Extract parameter count
    const paramMatch = filename.match(/(\d+\.?\d*)B/i);
    if (paramMatch) {
      parameterCount = paramMatch[1] + 'B';
    }

    // Enhanced quantization extraction
    const quantPatterns = [
      /(IQ\d+_[A-Z]+_?[A-Z]*)/i, // Match IQ patterns first
      /(Q\d+_[A-Z]+_?[A-Z]*)/i, // Then Q patterns
      /(IQ\d+)/i, // IQ without suffix
      /(Q\d+)/i, // Q without suffix
      /(f16|f32|fp16|fp32)/i,
    ];

    for (const pattern of quantPatterns) {
      const match = filename.match(pattern);
      if (match) {
        quantization = match[1].toUpperCase();
        break;
      }
    }

    // Default quantization for GGUF files if none detected
    if (!quantization && lower.includes('.gguf')) {
      quantization = 'F16';
    }

    // Extract context length (if specified)
    const contextMatch = filename.match(/(\d+)k/i);
    if (contextMatch) {
      contextLength = parseInt(contextMatch[1]) * MEMORY.BYTES_TO_KB;
    }

    return {
      name,
      contextLength,
      parameterCount,
      quantization,
    };
  }

  /**
   * Delete a model file
   */
  async deleteModelFile(modelPath: string): Promise<void> {
    if (fs.existsSync(modelPath)) {
      fs.unlinkSync(modelPath);
    }
  }

  /**
   * Get full path for a model filename
   */
  getModelPath(filename: string): string {
    return path.join(this.modelsDir, filename);
  }

  /**
   * Check if a model file exists
   */
  modelExists(filename: string): boolean {
    return fs.existsSync(this.getModelPath(filename));
  }
}
