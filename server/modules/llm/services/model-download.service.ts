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
    const { name, url, filename, size } = dto;
    const downloadId = `${name}-${Date.now()}`;

    // Stub implementation
    this.logger.log(`Starting download of ${filename} from ${url}`);

    // Broadcast download started
    this.sseService.broadcast('model-download', {
      type: 'started',
      downloadId,
      name,
      filename,
      size,
    });

    // Simulate download progress
    setTimeout(() => {
      this.sseService.broadcast('model-download', {
        type: 'progress',
        downloadId,
        progress: 50,
        downloadedBytes: size / 2,
        totalBytes: size,
      });
    }, 100);

    setTimeout(() => {
      this.sseService.broadcast('model-download', {
        type: 'completed',
        downloadId,
        path: `/models/${filename}`,
      });
    }, 200);

    return {
      success: true,
      message: 'Model download started (stub)',
      path: `/models/${filename}`,
    };
  }

  async cancelDownload(downloadId: string) {
    const controller = this.activeDownloads.get(downloadId);
    if (controller) {
      controller.abort();
      this.activeDownloads.delete(downloadId);

      // Broadcast download cancelled
      this.sseService.broadcast('model-download', {
        type: 'cancelled',
        downloadId,
      });

      return {
        success: true,
        message: 'Download cancelled',
      };
    }

    return {
      success: false,
      message: 'Download not found',
    };
  }

  private async saveModelMetadata(modelPath: string) {
    // Stub implementation - metadata parameter will be added when implemented
    this.logger.log(`Saving metadata for ${modelPath}`);
  }
}
