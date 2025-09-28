import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DownloadModelDto } from '../dto/llm.dto';
import { SseService } from '../../events/services/sse.service';

@Injectable()
export class ModelDownloadService {
  private readonly logger = new Logger(ModelDownloadService.name);
  private activeDownloads = new Map<string, AbortController>();

  constructor(
    private configService: ConfigService,
    private readonly sseService: SseService
  ) {}

  async downloadModel(dto: DownloadModelDto) {
    // Match Express implementation field names
    const {
      modelUrl,
      modelName,
      filename,
      size,
      description,
      contextLength,
      trainedContextLength,
      maxContextLength,
      parameterCount,
      quantization,
      isMultiPart,
      totalParts,
      allPartFiles,
      totalSize,
    } = dto;

    // Validate required fields like Express does
    if (!modelUrl || !filename) {
      throw new Error('Model URL and filename are required');
    }

    // Create model info matching Express structure
    // Express uses contextLength directly, ignoring trainedContextLength and maxContextLength
    const modelInfo = {
      name: modelName ?? filename,
      url: modelUrl,
      filename,
      size: size ?? 0,
      description: description ?? '',
      contextLength: contextLength ?? trainedContextLength ?? maxContextLength,
      parameterCount,
      quantization,
      isMultiPart,
      totalParts,
      allPartFiles,
      totalSize,
    };

    const downloadId = `${modelInfo.name}-${Date.now()}`;

    // Use the llmManager like Express does
    const { getLocalLLMManager } = await import('../../../localLlmSingleton');
    const llmManager = getLocalLLMManager();

    // Start download with progress callback
    llmManager
      .downloadModel(modelInfo, (progress, speed) => {
        // Broadcast progress via SSE like Express
        this.sseService.broadcast('unified-events', {
          type: 'download-progress',
          data: {
            filename,
            progress,
            speed,
            isDownloading: true,
          },
        });
      })
      .then(() => {
        // Download completed
        this.sseService.broadcast('unified-events', {
          type: 'download-progress',
          data: {
            filename,
            progress: 100,
            speed: '0 B/s',
            isDownloading: false,
            completed: true,
          },
        });

        // Broadcast models updated after delay
        setTimeout(() => {
          this.sseService.broadcast('unified-events', {
            type: 'models-updated',
            timestamp: Date.now(),
          });
        }, 2000);
      })
      .catch(error => {
        // Download failed or cancelled
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        const isCancelled = errorMessage === 'Download cancelled';

        this.sseService.broadcast('unified-events', {
          type: 'download-progress',
          data: {
            filename,
            progress: 0,
            speed: '0 B/s',
            isDownloading: false,
            error: isCancelled ? 'cancelled' : errorMessage,
          },
        });
      });

    return {
      success: true,
      message: 'Model download started',
      downloadId,
      name: modelInfo.name,
      filename,
    };
  }

  async cancelDownload(filename: string) {
    // Use llmManager to cancel download like Express does
    const { getLocalLLMManager } = await import('../../../localLlmSingleton');
    const llmManager = getLocalLLMManager();

    const cancelled = await llmManager.cancelDownload(filename);
    if (cancelled) {
      // Broadcast download cancelled via unified events
      this.sseService.broadcast('unified-events', {
        type: 'download-progress',
        data: {
          filename,
          progress: 0,
          speed: '0 B/s',
          isDownloading: false,
          error: 'cancelled',
        },
      });

      return {
        success: true,
        message: 'Download cancelled',
        filename,
      };
    }

    return {
      success: false,
      message: 'Download not found or not in progress',
    };
  }

  private async saveModelMetadata(modelPath: string) {
    // Stub implementation - metadata parameter will be added when implemented
    this.logger.log(`Saving metadata for ${modelPath}`);
  }
}
