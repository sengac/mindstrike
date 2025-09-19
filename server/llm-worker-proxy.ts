import { Worker } from 'worker_threads';
import { EventEmitter } from 'events';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { logger } from './logger.js';
import {
  LocalModelInfo,
  ModelDownloadInfo,
  ModelLoadingSettings,
  ModelRuntimeInfo,
} from './local-llm-manager.js';
import { DynamicModelInfo } from './model-fetcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class LLMWorkerProxy extends EventEmitter {
  private worker: Worker | null = null;
  private pendingRequests = new Map<
    string,
    { resolve: Function; reject: Function }
  >();
  private streamingRequests = new Map<
    string,
    { resolve: Function; reject: Function; chunks: string[] }
  >();
  private requestId = 0;
  private isInitialized = false;
  private restartCount = 0;
  private maxRestarts = 3;

  constructor() {
    super();
    this.initializeWorker();
  }

  private initializeWorker() {
    try {
      const workerPath = join(__dirname, 'llm-worker.js');
      this.worker = new Worker(workerPath);

      this.worker.on('message', (response: any) => {
        if (response.type === 'streamChunk') {
          this.handleStreamChunk(response);
        } else if (response.type === 'error') {
          logger.error('Worker reported error:', response.error);
          // Just log it, don't crash
        } else {
          this.handleResponse(response);
        }
      });

      this.worker.on('error', error => {
        logger.error('Worker error:', error);
        this.handleWorkerCrash(error);
      });

      this.worker.on('exit', code => {
        logger.info(`Worker exited with code ${code}`);
        this.worker = null;
        this.isInitialized = false;
        this.handleWorkerCrash(new Error(`Worker exited with code ${code}`));
      });

      // Initialize the worker
      this.sendMessage('init')
        .then(() => {
          this.isInitialized = true;
          logger.info('LLM Worker initialized');
        })
        .catch(error => {
          logger.error('Failed to initialize LLM Worker:', error);
        });
    } catch (error) {
      logger.error('Failed to create LLM Worker:', error);
      throw error;
    }
  }

  private handleStreamChunk(response: any) {
    const streamRequest = this.streamingRequests.get(response.id);
    if (streamRequest) {
      streamRequest.chunks.push(response.data);
    }
  }

  private handleResponse(response: any) {
    const pendingRequest = this.pendingRequests.get(response.id);
    if (pendingRequest) {
      this.pendingRequests.delete(response.id);

      if (response.success) {
        if (response.data === 'STREAM_COMPLETE') {
          // Handle streaming completion
          const streamRequest = this.streamingRequests.get(response.id);
          if (streamRequest) {
            this.streamingRequests.delete(response.id);
            streamRequest.resolve(streamRequest.chunks);
          }
        } else {
          pendingRequest.resolve(response.data);
        }
      } else {
        pendingRequest.reject(
          new Error(response.error || 'Unknown worker error')
        );
      }
    }
  }

  private rejectAllPending(error: Error) {
    for (const [id, request] of this.pendingRequests) {
      request.reject(error);
    }
    this.pendingRequests.clear();

    for (const [id, request] of this.streamingRequests) {
      request.reject(error);
    }
    this.streamingRequests.clear();
  }

  private handleWorkerCrash(error: Error) {
    logger.error('Worker crashed:', error);
    this.rejectAllPending(error);
    this.emit('error', error);

    // Try to restart if we haven't exceeded the limit
    if (this.restartCount < this.maxRestarts) {
      this.restartCount++;
      logger.info(
        `Attempting to restart worker (attempt ${this.restartCount}/${this.maxRestarts})`
      );

      setTimeout(() => {
        try {
          this.initializeWorker();
        } catch (restartError) {
          logger.error('Failed to restart worker:', restartError);
        }
      }, 2000); // Wait 2 seconds before restarting
    } else {
      logger.error(
        `Worker has crashed ${this.maxRestarts} times. Not restarting.`
      );
    }
  }

  private async sendMessage(type: string, data?: any): Promise<any> {
    if (!this.worker) {
      throw new Error('Worker not available');
    }

    const id = (++this.requestId).toString();
    const message = { id, type, data };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      // Set timeout for requests
      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Worker request timeout'));
        }
      }, 60000); // 60 second timeout

      const originalResolve = resolve;
      const originalReject = reject;

      this.pendingRequests.set(id, {
        resolve: (result: any) => {
          clearTimeout(timeout);
          originalResolve(result);
        },
        reject: (error: any) => {
          clearTimeout(timeout);
          originalReject(error);
        },
      });

      this.worker!.postMessage(message);
    });
  }

  private async sendStreamMessage(
    type: string,
    data?: any
  ): Promise<AsyncGenerator<string>> {
    if (!this.worker) {
      throw new Error('Worker not available');
    }

    const id = (++this.requestId).toString();
    const message = { id, type, data };

    return new Promise((resolve, reject) => {
      this.streamingRequests.set(id, { resolve, reject, chunks: [] });
      this.pendingRequests.set(id, { resolve, reject });

      // Set timeout for requests
      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          this.streamingRequests.delete(id);
          reject(new Error('Worker streaming request timeout'));
        }
      }, 300000); // 5 minute timeout for streaming

      const originalResolve = resolve;
      const originalReject = reject;

      this.pendingRequests.set(id, {
        resolve: (result: any) => {
          clearTimeout(timeout);
          originalResolve(result);
        },
        reject: (error: any) => {
          clearTimeout(timeout);
          originalReject(error);
        },
      });

      this.worker!.postMessage(message);
    });
  }

  async waitForInitialization(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    return new Promise((resolve, reject) => {
      const checkInit = () => {
        if (this.isInitialized) {
          resolve();
        } else {
          setTimeout(checkInit, 100);
        }
      };
      checkInit();
    });
  }

  async getLocalModels(): Promise<LocalModelInfo[]> {
    await this.waitForInitialization();
    return this.sendMessage('getLocalModels');
  }

  async getAvailableModels(): Promise<
    (ModelDownloadInfo | DynamicModelInfo)[]
  > {
    await this.waitForInitialization();
    return this.sendMessage('getAvailableModels');
  }

  async searchModels(
    query: string
  ): Promise<(ModelDownloadInfo | DynamicModelInfo)[]> {
    await this.waitForInitialization();
    return this.sendMessage('searchModels', { query });
  }

  async downloadModel(
    modelInfo: ModelDownloadInfo | DynamicModelInfo,
    onProgress?: (progress: number, speed?: string) => void
  ): Promise<string> {
    await this.waitForInitialization();
    return this.sendMessage('downloadModel', { modelInfo, onProgress });
  }

  async deleteModel(modelId: string): Promise<void> {
    await this.waitForInitialization();
    return this.sendMessage('deleteModel', { modelId });
  }

  async loadModel(modelIdOrName: string): Promise<void> {
    await this.waitForInitialization();
    return this.sendMessage('loadModel', { modelIdOrName });
  }

  async unloadModel(modelId: string): Promise<void> {
    await this.waitForInitialization();
    return this.sendMessage('unloadModel', { modelId });
  }

  async generateResponse(
    modelIdOrName: string,
    messages: Array<{ role: string; content: string }>,
    options?: {
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<string> {
    await this.waitForInitialization();
    return this.sendMessage('generateResponse', {
      modelIdOrName,
      messages,
      options,
    });
  }

  async *generateStreamResponse(
    modelIdOrName: string,
    messages: Array<{ role: string; content: string }>,
    options?: {
      temperature?: number;
      maxTokens?: number;
      signal?: AbortSignal;
    }
  ): AsyncGenerator<string> {
    await this.waitForInitialization();

    const id = (++this.requestId).toString();
    const message = {
      id,
      type: 'generateStreamResponse',
      data: { modelIdOrName, messages, options },
    };

    const chunks: string[] = [];
    let streamComplete = false;
    let streamError: Error | null = null;

    // Set up streaming request tracking
    this.streamingRequests.set(id, {
      resolve: () => {
        streamComplete = true;
      },
      reject: (error: Error) => {
        streamError = error;
        streamComplete = true;
      },
      chunks,
    });

    this.pendingRequests.set(id, {
      resolve: () => {
        streamComplete = true;
      },
      reject: (error: Error) => {
        streamError = error;
        streamComplete = true;
      },
    });

    // Set timeout for requests
    const timeout = setTimeout(() => {
      if (this.pendingRequests.has(id)) {
        this.pendingRequests.delete(id);
        this.streamingRequests.delete(id);
        streamError = new Error('Worker streaming request timeout');
        streamComplete = true;
      }
    }, 300000); // 5 minute timeout for streaming

    // Send the message to start streaming
    this.worker!.postMessage(message);

    // Generator that yields chunks as they arrive
    try {
      let chunkIndex = 0;
      while (!streamComplete) {
        // Check if we have new chunks
        if (chunkIndex < chunks.length) {
          yield chunks[chunkIndex];
          chunkIndex++;
        } else {
          // Wait a bit before checking again
          await new Promise(resolve => setTimeout(resolve, 10));
        }

        // Check for errors
        if (streamError) {
          throw streamError;
        }
      }

      // Yield any remaining chunks
      while (chunkIndex < chunks.length) {
        yield chunks[chunkIndex];
        chunkIndex++;
      }
    } finally {
      clearTimeout(timeout);
      this.pendingRequests.delete(id);
      this.streamingRequests.delete(id);
    }
  }

  private async *createAsyncGenerator(
    chunks: string[]
  ): AsyncGenerator<string> {
    for (const chunk of chunks) {
      yield chunk;
    }
  }

  async setModelSettings(
    modelId: string,
    settings: ModelLoadingSettings
  ): Promise<void> {
    await this.waitForInitialization();
    return this.sendMessage('setModelSettings', { modelId, settings });
  }

  async getModelSettings(modelId: string): Promise<ModelLoadingSettings> {
    await this.waitForInitialization();
    return this.sendMessage('getModelSettings', { modelId });
  }

  getModelRuntimeInfo(modelId: string): Promise<ModelRuntimeInfo | undefined> {
    return this.sendMessage('getModelRuntimeInfo', { modelId });
  }

  clearContextSizeCache(): Promise<void> {
    return this.sendMessage('clearContextSizeCache');
  }

  async getModelStatus(modelId: string): Promise<{
    loaded: boolean;
    info?: LocalModelInfo;
  }> {
    await this.waitForInitialization();
    return this.sendMessage('getModelStatus', { modelId });
  }

  cancelDownload(filename: string): Promise<boolean> {
    return this.sendMessage('cancelDownload', { filename });
  }

  getDownloadProgress(filename: string): Promise<{
    isDownloading: boolean;
    progress: number;
    speed?: string;
  }> {
    return this.sendMessage('getDownloadProgress', { filename });
  }

  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.isInitialized = false;
    }
  }
}
