import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { SseService } from '../events/services/sse.service';
import { v4 as uuidv4 } from 'uuid';
import type { Response } from 'express';
import { modelFetcher } from '../../modelFetcher';
import { SSEEventType } from '../../../src/types';
import type { ScanProgress } from '../../../src/store/useModelScanStore';
import {
  ModelSearchDto,
  StartScanDto,
  ScanStatusDto,
} from './dto/model-scan.dto';

interface ScanSession {
  id: string;
  controller: AbortController;
  status: 'running' | 'completed' | 'cancelled' | 'error';
  startTime: number;
}

@Injectable()
export class ModelScanService implements OnModuleDestroy {
  private readonly logger = new Logger(ModelScanService.name);
  private readonly activeScanSessions = new Map<string, ScanSession>();

  constructor(private readonly sseService: SseService) {}

  onModuleDestroy() {
    // Clean up all active scan sessions
    for (const [scanId, session] of this.activeScanSessions) {
      if (session.status === 'running') {
        session.controller.abort();
        session.status = 'cancelled';
        this.broadcastProgress(scanId, {
          stage: 'cancelled',
          message: 'Scan cancelled due to server shutdown',
        });
      }
    }
    this.activeScanSessions.clear();
  }

  addProgressClient(clientId: string, response: Response): void {
    this.sseService.addClient(clientId, response, 'model-scan');
  }

  async startSearch(searchParams: ModelSearchDto): Promise<string> {
    const searchId = uuidv4();
    const controller = new AbortController();

    // Register the search session
    this.activeScanSessions.set(searchId, {
      id: searchId,
      controller,
      status: 'running',
      startTime: Date.now(),
    });

    this.logger.log(`Starting model search session: ${searchId}`);

    // Start the search process asynchronously
    this.performModelSearch(searchId, searchParams, controller.signal).catch(
      error => {
        this.logger.error(`Model search ${searchId} failed:`, error);
        const session = this.activeScanSessions.get(searchId);
        if (session && session.status === 'running') {
          session.status = 'error';
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          this.broadcastProgress(searchId, {
            stage: 'error',
            message: 'Search failed',
            error: errorMessage,
            operationType: 'search',
          });
        }
      }
    );

    return searchId;
  }

  async startScan(scanParams: StartScanDto): Promise<string> {
    // Log scan params for debugging - will be used for configuration in future
    this.logger.debug('Starting scan with params:', scanParams);
    const scanId = uuidv4();
    const controller = new AbortController();

    // Register the scan session
    this.activeScanSessions.set(scanId, {
      id: scanId,
      controller,
      status: 'running',
      startTime: Date.now(),
    });

    this.logger.log(`Starting model scan session: ${scanId}`);

    // Start the scan process asynchronously
    this.performModelScan(scanId, controller.signal).catch(error => {
      this.logger.error(`Model scan ${scanId} failed:`, error);
      const session = this.activeScanSessions.get(scanId);
      if (session && session.status === 'running') {
        session.status = 'error';
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.broadcastProgress(scanId, {
          stage: 'error',
          message: 'Scan failed',
          error: errorMessage,
          operationType: 'scan',
        });
      }
    });

    return scanId;
  }

  async cancelScan(scanId: string): Promise<boolean> {
    const session = this.activeScanSessions.get(scanId);

    if (!session) {
      return false;
    }

    if (session.status !== 'running') {
      throw new Error('Scan is not currently running');
    }

    this.logger.log(`Cancelling model scan session: ${scanId}`);

    // Cancel the scan
    session.controller.abort();
    session.status = 'cancelled';

    this.broadcastProgress(scanId, {
      stage: 'cancelled',
      message: 'Scan cancelled by user',
    });

    // Clean up the session after a delay
    setTimeout(() => {
      this.activeScanSessions.delete(scanId);
    }, 5000);

    return true;
  }

  async getScanStatus(scanId: string): Promise<ScanStatusDto | null> {
    const session = this.activeScanSessions.get(scanId);

    if (!session) {
      return null;
    }

    return {
      scanId: session.id,
      status: session.status,
      startTime: session.startTime,
      duration: Date.now() - session.startTime,
    };
  }

  private broadcastProgress(
    scanId: string,
    progress: Partial<ScanProgress> & {
      operationType?: 'scan' | 'search';
      error?: string;
    }
  ): void {
    this.sseService.broadcast('unified-events', {
      type: SSEEventType.SCAN_PROGRESS,
      scanId,
      progress,
      timestamp: Date.now(),
    });
  }

  private async performModelSearch(
    searchId: string,
    searchParams: ModelSearchDto,
    signal: AbortSignal
  ): Promise<void> {
    const session = this.activeScanSessions.get(searchId);
    if (!session) {
      return;
    }

    try {
      // Stage 1: Initialize
      if (signal.aborted) {
        return;
      }
      this.broadcastProgress(searchId, {
        stage: 'searching',
        message: 'Starting search...',
        progress: 0,
        operationType: 'search',
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      // Stage 2: Perform search
      if (signal.aborted) {
        return;
      }
      this.broadcastProgress(searchId, {
        stage: 'searching',
        message: `Searching for "${searchParams.query}"...`,
        progress: 20,
        operationType: 'search',
      });

      // Use the model fetcher search functionality with progress updates
      const results = await modelFetcher.searchModelsWithProgress(
        searchParams.query,
        searchParams.searchType,
        progress => {
          if (signal.aborted) {
            return;
          }

          let stage: 'searching' | 'checking-models' = 'searching';
          let message = progress.message;
          let progressPercent = 20;

          switch (progress.type) {
            case 'started':
              stage = 'searching';
              message = 'Initializing search...';
              progressPercent = 25;
              break;
            case 'fetching-models':
              stage = 'searching';
              message = progress.message;
              progressPercent = 40;
              break;
            case 'checking-model':
              stage = 'checking-models';
              message = progress.modelName
                ? `Checking model: ${progress.modelName}`
                : progress.message;
              progressPercent =
                50 +
                (progress.current && progress.total
                  ? Math.floor((progress.current / progress.total) * 30)
                  : 0);
              break;
            case 'model-checked':
              stage = 'checking-models';
              message = progress.modelName
                ? `✓ Verified: ${progress.modelName}`
                : progress.message;
              progressPercent =
                50 +
                (progress.current && progress.total
                  ? Math.floor((progress.current / progress.total) * 30)
                  : 0);
              break;
            case 'completed':
              stage = 'searching';
              message = 'Processing search results...';
              progressPercent = 80;
              break;
            case 'error':
              return;
          }

          this.broadcastProgress(searchId, {
            stage,
            message,
            progress: progressPercent,
            currentItem: progress.modelName,
            totalItems: progress.total,
            completedItems: progress.current,
            operationType: 'search',
          });
        }
      );

      if (signal.aborted) {
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 300));

      // Stage 3: Completed
      if (signal.aborted) {
        return;
      }
      session.status = 'completed';
      this.broadcastProgress(searchId, {
        stage: 'completed',
        message: `Search completed! Found ${results.length} models.`,
        progress: 100,
        totalItems: results.length,
        operationType: 'search',
        results: results,
      });

      this.logger.log(
        `Model search ${searchId} completed successfully. Found ${results.length} models.`
      );

      // Clean up the session after a delay
      setTimeout(() => {
        this.activeScanSessions.delete(searchId);
      }, 10000);
    } catch (error) {
      if (signal.aborted) {
        this.logger.log(`Model search ${searchId} was cancelled`);
        return;
      }

      this.logger.error(`Model search ${searchId} failed:`, error);

      if (session) {
        session.status = 'error';
        this.broadcastProgress(searchId, {
          stage: 'error',
          message: 'Search failed due to an error',
          error: error instanceof Error ? error.message : 'Unknown error',
          operationType: 'search',
        });

        // Clean up the session after a delay
        setTimeout(() => {
          this.activeScanSessions.delete(searchId);
        }, 5000);
      }
    }
  }

  private async performModelScan(
    scanId: string,
    signal: AbortSignal
  ): Promise<void> {
    const session = this.activeScanSessions.get(scanId);
    if (!session) {
      return;
    }

    try {
      // Stage 1: Initialize
      if (signal.aborted) {
        return;
      }
      this.broadcastProgress(scanId, {
        stage: 'initializing',
        message: 'Preparing to fetch model list...',
        progress: 0,
        operationType: 'scan',
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      // Stage 2: Fetch from HuggingFace
      if (signal.aborted) {
        return;
      }
      this.broadcastProgress(scanId, {
        stage: 'fetching-huggingface',
        message: 'Fetching popular models from HuggingFace...',
        progress: 10,
        operationType: 'scan',
      });

      // Fetch popular models with progress tracking
      await modelFetcher.fetchPopularModels(
        (current: number, total: number, modelId?: string) => {
          if (signal.aborted) {
            return;
          }

          const progress = 10 + Math.round((current / total) * 40);
          this.broadcastProgress(scanId, {
            stage: 'fetching-huggingface',
            message: `Fetching model details from HuggingFace (${current}/${total})...`,
            progress,
            currentItem: modelId ?? `Model ${current}`,
            totalItems: total,
            completedItems: current,
            operationType: 'scan',
          });
        },
        signal
      );

      // Stage 3: Check model availability
      if (signal.aborted) {
        return;
      }
      this.broadcastProgress(scanId, {
        stage: 'checking-models',
        message: 'Checking model availability and metadata...',
        progress: 50,
        operationType: 'scan',
      });

      const models = await modelFetcher.getAvailableModels();
      const totalModels = models.length;
      let checkedModels = 0;

      // Check each model
      for (let i = 0; i < totalModels && !signal.aborted; i++) {
        const model = models[i];
        await new Promise(resolve => setTimeout(resolve, 50));

        checkedModels++;
        const progress = 50 + Math.round((checkedModels / totalModels) * 40);

        this.broadcastProgress(scanId, {
          stage: 'checking-models',
          message: `Checking model: ${model.name}`,
          progress,
          currentItem: model.name,
          totalItems: totalModels,
          completedItems: checkedModels,
          operationType: 'scan',
        });
      }

      // Stage 4: Completing
      if (signal.aborted) {
        return;
      }
      this.broadcastProgress(scanId, {
        stage: 'completing',
        message: 'Finalizing scan results...',
        progress: 90,
        operationType: 'scan',
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      // Stage 5: Completed
      if (signal.aborted) {
        return;
      }
      session.status = 'completed';
      this.broadcastProgress(scanId, {
        stage: 'completed',
        message: `Scan completed! Found ${models.length} models available for download.`,
        progress: 100,
        totalItems: models.length,
        operationType: 'scan',
      });

      this.logger.log(
        `Model scan ${scanId} completed successfully. Found ${models.length} models.`
      );

      // Clean up the session after a delay
      setTimeout(() => {
        this.activeScanSessions.delete(scanId);
      }, 10000);
    } catch (error) {
      if (signal.aborted) {
        this.logger.log(`Model scan ${scanId} was cancelled`);
        return;
      }

      this.logger.error(`Model scan ${scanId} failed:`, error);

      if (session) {
        session.status = 'error';

        // Provide specific error messages for common scenarios
        let errorMessage = 'Scan failed due to an error';
        let userFriendlyMessage = errorMessage;

        if (error instanceof Error) {
          errorMessage = error.message;

          if (errorMessage.includes('Rate limit exceeded')) {
            userFriendlyMessage =
              'HuggingFace API rate limit reached. Please wait a few minutes before trying again.';
          } else if (errorMessage.includes('HTTP 400')) {
            if (errorMessage.includes('All fallback URLs failed')) {
              userFriendlyMessage =
                'HuggingFace API is currently unavailable. Multiple request formats were tried but all failed. Please try again later.';
            } else {
              userFriendlyMessage =
                'HuggingFace API request failed. The service may be temporarily unavailable.';
            }
          } else if (errorMessage.includes('Failed to fetch')) {
            userFriendlyMessage =
              'Unable to connect to HuggingFace. Please check your internet connection.';
          } else if (errorMessage.includes('AbortError')) {
            userFriendlyMessage = 'Scan was cancelled by user.';
          } else {
            userFriendlyMessage = errorMessage;
          }
        }

        this.broadcastProgress(scanId, {
          stage: 'error',
          message: userFriendlyMessage,
          error: errorMessage,
          operationType: 'scan',
        });

        // Clean up the session after a delay
        setTimeout(() => {
          this.activeScanSessions.delete(scanId);
        }, 5000);
      }
    }
  }
}
