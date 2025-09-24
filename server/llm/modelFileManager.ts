import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { readGgufFileInfo, GgufInsights } from 'node-llama-cpp';
import { getLocalModelsDirectory } from '../utils/settingsDirectory';
import type { LocalModelInfo } from '../localLlmManager';
import { modelFetcher } from '../modelFetcher';
import type { ModelArchitecture } from '../modelFetcher';
import { loadMetadataFromFile } from '../utils/ggufVramCalculator';
import { logger } from '../logger';
import {
  calculateAllVRAMEstimates,
  type ModelArchitectureInfo,
  type VRAMEstimateInfo,
} from '../../src/shared/vramCalculator';
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
   * Check if a filename is part of a multi-part GGUF model
   */
  private isMultiPartFile(filename: string): {
    isMultiPart: boolean;
    partNumber?: number;
    totalParts?: number;
    baseFilename?: string;
  } {
    // Match pattern like: model.Q6_K.gguf-00001-of-00006.gguf
    const multiPartPattern = /^(.+\.gguf)-(\d{5})-of-(\d{5})\.gguf$/;
    const match = filename.match(multiPartPattern);

    if (match) {
      return {
        isMultiPart: true,
        partNumber: parseInt(match[2], 10),
        totalParts: parseInt(match[3], 10),
        baseFilename: match[1],
      };
    }

    return { isMultiPart: false };
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
    const processedMultiParts = new Set<string>();

    for (const filename of ggufFiles) {
      const multiPartInfo = this.isMultiPartFile(filename);

      // Skip non-first parts of multi-part models
      if (multiPartInfo.isMultiPart && multiPartInfo.partNumber !== 1) {
        continue;
      }

      // Skip if we've already processed this multi-part model
      if (multiPartInfo.isMultiPart && multiPartInfo.baseFilename) {
        if (processedMultiParts.has(multiPartInfo.baseFilename)) {
          continue;
        }
        processedMultiParts.add(multiPartInfo.baseFilename);
      }

      const fullPath = path.join(this.modelsDir, filename);
      const stats = fs.statSync(fullPath);

      // Generate a unique ID for this model
      const id = createHash('md5').update(fullPath).digest('hex');

      // Try to extract model info from filename
      const modelInfo = this.parseModelFilename(
        multiPartInfo.isMultiPart && multiPartInfo.baseFilename
          ? multiPartInfo.baseFilename
          : filename
      );

      // For multi-part models, calculate total size and collect all parts
      let totalSize = stats.size;
      let allPartFiles: string[] = [];

      if (multiPartInfo.isMultiPart && multiPartInfo.totalParts) {
        allPartFiles = [];
        totalSize = 0;

        // Check all parts exist and calculate total size
        for (let i = 1; i <= multiPartInfo.totalParts; i++) {
          const partFilename = `${multiPartInfo.baseFilename}-${String(i).padStart(5, '0')}-of-${String(multiPartInfo.totalParts).padStart(5, '0')}.gguf`;
          const partPath = path.join(this.modelsDir, partFilename);

          if (fs.existsSync(partPath)) {
            const partStats = fs.statSync(partPath);
            totalSize += partStats.size;
            allPartFiles.push(partFilename);
          }
        }

        // If not all parts are present, skip this model
        if (allPartFiles.length !== multiPartInfo.totalParts) {
          logger.warn(
            `Multi-part model ${filename} is incomplete: ${allPartFiles.length}/${multiPartInfo.totalParts} parts found`
          );
          continue;
        }
      }

      // Try to get remote model info from cache if available
      // Skip remote model fetching to avoid hanging on API calls
      let matchingRemoteModel = undefined;
      try {
        // Only try to get remote models if they're already cached
        const remoteModels = modelFetcher.getCachedModels();
        matchingRemoteModel = remoteModels.find(rm => rm.filename === filename);
      } catch (fetchError) {
        // Log but continue - remote model info is optional
        logger.debug('Could not fetch remote model info:', fetchError);
      }

      // Try to read GGUF metadata for layer count and context length
      let layerCount: number | undefined;
      let trainedContextLength: number | undefined;
      try {
        const ggufInfo = await readGgufFileInfo(fullPath);
        const ggufMetadata = this.extractGgufMetadata(ggufInfo);
        layerCount = ggufMetadata.layerCount;
        trainedContextLength = ggufMetadata.trainedContextLength;
      } catch (ggufError) {
        // Log but continue - metadata is optional
        logger.debug('Could not read GGUF metadata:', ggufError);
      }

      // Note: We'll calculate context length after loading all metadata sources

      // Calculate VRAM estimates for local models
      let vramEstimates: VRAMEstimateInfo[] | undefined;
      let modelArchitecture: ModelArchitecture | undefined;
      let hasVramData = false;
      let vramError: string | undefined;
      let metadataContextLength: number | undefined;
      let ggufInsights: GgufInsights | undefined;

      try {
        // First try to get GgufInsights for accurate VRAM calculation
        try {
          const ggufFileInfo = await readGgufFileInfo(fullPath);
          ggufInsights = await GgufInsights.from(ggufFileInfo);

          // Store context length from GgufInsights
          metadataContextLength = ggufInsights.trainContextSize;
        } catch (insightsError) {
          // GgufInsights failed, continue with fallback
          logger.debug('GgufInsights failed, using fallback:', insightsError);
        }

        // If GgufInsights didn't work, fall back to metadata loading
        if (!ggufInsights) {
          const metadata = await loadMetadataFromFile(fullPath);
          metadataContextLength = metadata.context_length;

          // Extract architecture info for fallback calculation
          modelArchitecture = {
            layers: metadata.n_layers ?? 0,
            kvHeads: metadata.n_kv_heads ?? 0,
            embeddingDim: metadata.embedding_dim ?? 0,
            contextLength: metadata.context_length ?? undefined,
            feedForwardDim: metadata.feed_forward_dim ?? 0,
            modelSizeMB: metadata.model_size_mb ?? undefined,
          };
        } else {
          // Use GgufInsights data to populate architecture
          modelArchitecture = {
            layers: ggufInsights.totalLayers,
            kvHeads: 0, // Will be populated from metadata if needed
            embeddingDim: ggufInsights.embeddingVectorSize ?? 0,
            contextLength: ggufInsights.trainContextSize,
            feedForwardDim: 0, // Will be populated from metadata if needed
            modelSizeMB: Math.round(ggufInsights.modelSize / (1024 * 1024)),
          };

          // Try to get additional metadata for complete architecture info
          try {
            const metadata = await loadMetadataFromFile(fullPath);
            modelArchitecture.kvHeads = metadata.n_kv_heads ?? 0;
            modelArchitecture.feedForwardDim = metadata.feed_forward_dim ?? 0;
          } catch (metadataError) {
            // Log but continue - we have enough info from GgufInsights
            logger.debug(
              'Could not load additional metadata, using GgufInsights data only:',
              metadataError
            );
          }
        }

        // Prepare architecture info for shared VRAM calculator
        const architectureInfo: ModelArchitectureInfo = {
          layers: modelArchitecture.layers,
          kvHeads: modelArchitecture.kvHeads,
          embeddingDim: modelArchitecture.embeddingDim,
          contextLength: modelArchitecture.contextLength,
          feedForwardDim: modelArchitecture.feedForwardDim,
          modelSizeMB: modelArchitecture.modelSizeMB,
          ggufInsights, // Pass GgufInsights for accurate calculation
        };

        // Calculate VRAM estimates using shared calculator
        vramEstimates = calculateAllVRAMEstimates(architectureInfo);

        hasVramData = true;
      } catch (error) {
        // Silently fail - VRAM data is optional
        vramError =
          error instanceof Error ? error.message : 'Failed to calculate VRAM';
      }

      // Get trained context length from various sources (no fallback)
      // Priority: GGUF metadata > loadMetadataFromFile > remote model
      const trainedContext =
        trainedContextLength ??
        metadataContextLength ??
        matchingRemoteModel?.trainedContextLength;

      // The trained context IS the maximum the model supports
      // The resolver calculates what's practical given memory constraints
      const maxContext = trainedContext;

      models.push({
        id,
        name:
          matchingRemoteModel?.name ??
          modelInfo.name ??
          filename.replace('.gguf', ''),
        filename,
        path: fullPath,
        size: multiPartInfo.isMultiPart ? totalSize : stats.size,
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
        // Add multi-part model info
        isMultiPart: multiPartInfo.isMultiPart,
        totalParts: multiPartInfo.totalParts,
        allPartFiles: multiPartInfo.isMultiPart ? allPartFiles : undefined,
        totalSize: multiPartInfo.isMultiPart ? totalSize : undefined,
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
        // Note: Some models use versioned names like 'qwen2' or 'gemma3'
        const architectures = [
          'llama',
          'mistral',
          'gpt',
          'qwen',
          'qwen2',
          'qwen2.5',
          'gemma',
          'gemma2',
          'gemma3',
          'phi',
          'phi2',
          'phi3',
          'starcoder',
          'codellama',
          'deepseek',
          'yi',
          'falcon',
        ];
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
   * Delete a model file (handles multi-part models)
   */
  async deleteModelFile(modelPath: string): Promise<void> {
    const filename = path.basename(modelPath);
    const multiPartInfo = this.isMultiPartFile(filename);

    if (
      multiPartInfo.isMultiPart &&
      multiPartInfo.baseFilename &&
      multiPartInfo.totalParts
    ) {
      // Delete all parts of a multi-part model
      const dirPath = path.dirname(modelPath);
      for (let i = 1; i <= multiPartInfo.totalParts; i++) {
        const partFilename = `${multiPartInfo.baseFilename}-${String(i).padStart(5, '0')}-of-${String(multiPartInfo.totalParts).padStart(5, '0')}.gguf`;
        const partPath = path.join(dirPath, partFilename);
        if (fs.existsSync(partPath)) {
          fs.unlinkSync(partPath);
          logger.info(
            `Deleted part ${i} of ${multiPartInfo.totalParts}: ${partFilename}`
          );
        }
      }
    } else {
      // Delete single file
      if (fs.existsSync(modelPath)) {
        fs.unlinkSync(modelPath);
      }
    }
  }

  /**
   * Get full path for a model filename
   */
  getModelPath(filename: string): string {
    return path.join(this.modelsDir, filename);
  }

  /**
   * Check if a model file exists (checks all parts for multi-part models)
   */
  modelExists(filename: string): boolean {
    const multiPartInfo = this.isMultiPartFile(filename);

    if (
      multiPartInfo.isMultiPart &&
      multiPartInfo.baseFilename &&
      multiPartInfo.totalParts
    ) {
      // Check if all parts exist for multi-part model
      for (let i = 1; i <= multiPartInfo.totalParts; i++) {
        const partFilename = `${multiPartInfo.baseFilename}-${String(i).padStart(5, '0')}-of-${String(multiPartInfo.totalParts).padStart(5, '0')}.gguf`;
        const partPath = this.getModelPath(partFilename);
        if (!fs.existsSync(partPath)) {
          return false;
        }
      }
      return true;
    } else {
      // Check single file
      return fs.existsSync(this.getModelPath(filename));
    }
  }
}
