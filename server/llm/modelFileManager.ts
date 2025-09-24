import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { readGgufFileInfo } from 'node-llama-cpp';
import { getLocalModelsDirectory } from '../utils/settingsDirectory';
import type { LocalModelInfo } from '../localLlmManager';
import { modelFetcher } from '../modelFetcher';
import type {
  VRAMEstimateInfo,
  ModelArchitecture,
  VRAMConfiguration,
} from '../modelFetcher';
import {
  loadMetadataFromFile,
  calculateVRAMEstimate,
  type CacheType,
} from '../utils/ggufVramCalculator';
// import { MEMORY } from './constants'; // Not needed anymore since we use 1000 instead of 1024

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
  async getLocalModels(): Promise<LocalModelInfo[]> {
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
      let trainedContextLength: number | undefined;
      try {
        const ggufInfo = await readGgufFileInfo(fullPath);
        const ggufMetadata = this.extractGgufMetadata(ggufInfo);
        layerCount = ggufMetadata.layerCount;
        trainedContextLength = ggufMetadata.trainedContextLength;
      } catch {
        // Silently fail - metadata is optional
      }

      // Get trained context length from various sources (no fallback)
      const trainedContext =
        trainedContextLength ??
        matchingRemoteModel?.contextLength ??
        modelInfo.contextLength;

      // The trained context IS the maximum the model supports
      // The resolver calculates what's practical given memory constraints
      const maxContext = trainedContext;

      // Note: contextSizeResolver calculates recommended context based on available memory
      // but we're not using it for display purposes anymore

      // Calculate VRAM estimates for local models
      let vramEstimates: VRAMEstimateInfo[] | undefined;
      let modelArchitecture: ModelArchitecture | undefined;
      let hasVramData = false;
      let vramError: string | undefined;

      try {
        const metadata = await loadMetadataFromFile(fullPath);

        // Extract architecture info
        modelArchitecture = {
          layers: metadata.n_layers ?? 0,
          kvHeads: metadata.n_kv_heads ?? 0,
          embeddingDim: metadata.embedding_dim ?? 0,
          contextLength: metadata.context_length ?? undefined,
          feedForwardDim: metadata.feed_forward_dim ?? 0,
        };

        // Calculate VRAM for different context sizes
        const vramConfigs: VRAMConfiguration[] = [
          {
            gpuLayers: 999,
            contextSize: 2048,
            cacheType: 'fp16' as CacheType,
            label: '2K context',
          },
          {
            gpuLayers: 999,
            contextSize: 4096,
            cacheType: 'fp16' as CacheType,
            label: '4K context',
          },
          {
            gpuLayers: 999,
            contextSize: 8192,
            cacheType: 'fp16' as CacheType,
            label: '8K context',
          },
          {
            gpuLayers: 999,
            contextSize: 16384,
            cacheType: 'fp16' as CacheType,
            label: '16K context',
          },
        ];

        vramEstimates = vramConfigs.map(config => {
          const estimate = calculateVRAMEstimate(
            metadata,
            config.gpuLayers,
            config.contextSize,
            config.cacheType
          );
          return {
            ...estimate,
            config,
          };
        });

        hasVramData = true;
      } catch (error) {
        // Silently fail - VRAM data is optional
        vramError =
          error instanceof Error ? error.message : 'Failed to calculate VRAM';
      }

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
        trainedContextLength: trainedContext,
        maxContextLength: maxContext,
        parameterCount:
          matchingRemoteModel?.parameterCount ?? modelInfo.parameterCount,
        quantization:
          matchingRemoteModel?.quantization ?? modelInfo.quantization,
        layerCount,
        vramEstimates,
        modelArchitecture,
        hasVramData,
        vramError,
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
    trainedContextLength?: number;
  } {
    let layerCount: number | undefined;
    let trainedContextLength: number | undefined;

    if (ggufInfo.metadata) {
      const metadata = ggufInfo.metadata as {
        llama?: { block_count?: number; context_length?: number };
        [key: string]: unknown;
      };

      if (metadata.llama) {
        layerCount = metadata.llama.block_count;
        trainedContextLength = metadata.llama.context_length;
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
              trainedContextLength = archData.context_length;
            }
            if (layerCount || trainedContextLength) {
              break;
            }
          }
        }
      }
    }

    return { layerCount, trainedContextLength };
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

    // Extract context length (if specified in filename like "32k" = 32,000 tokens)
    const contextMatch = filename.match(/(\d+)k/i);
    if (contextMatch) {
      contextLength = parseInt(contextMatch[1]) * 1000; // k = 1000 tokens, not 1024
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
