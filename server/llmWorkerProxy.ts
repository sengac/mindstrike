import { Worker } from 'worker_threads';
import { EventEmitter } from 'events';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { logger } from './logger.js';
import type {
  LocalModelInfo,
  ModelDownloadInfo,
  ModelLoadingSettings,
  ModelRuntimeInfo,
} from './localLlmManager.js';
import type { DynamicModelInfo } from './modelFetcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface WorkerResponse {
  id: string;
  type: string;
  success?: boolean;
  data?: unknown;
  error?: string;
  progress?: number;
  speed?: string;
}

interface PendingRequest<T = unknown> {
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

interface StreamingRequest {
  resolve: (value: string[]) => void;
  reject: (reason?: unknown) => void;
  chunks: string[];
}

interface MCPToolsRequest {
  id: string;
  type: 'mcpToolsRequest';
}

interface MCPToolExecutionRequest {
  id: string;
  type: 'executeMCPTool';
  data: {
    serverId: string;
    toolName: string;
    params: Record<string, unknown>;
  };
}

export class LLMWorkerProxy extends EventEmitter {
  private worker: Worker | null = null;
  private readonly pendingRequests = new Map<string, PendingRequest<unknown>>();
  private readonly streamingRequests = new Map<string, StreamingRequest>();
  private requestId = 0;
  private isInitialized = false;
  private restartCount = 0;
  private readonly maxRestarts = 3;

  constructor() {
    super();
    // Initialize worker asynchronously to not block server startup
    setTimeout(() => this.initializeWorker(), 0);
  }

  private initializeWorker() {
    try {
      // Workers need JavaScript files, not TypeScript
      // In development, we'll use the compiled version from dist if available
      // Otherwise, skip worker initialization (local LLM features won't work)

      // Try development path first (when running via tsx)
      let workerPath = join(__dirname, '../dist/server/server/llmWorker.js');

      // If that doesn't exist, try the production path (when running compiled)
      if (!existsSync(workerPath)) {
        workerPath = join(__dirname, 'llmWorker.js');
      }

      // Check if compiled worker exists
      if (!existsSync(workerPath)) {
        logger.warn(
          'LLM worker not found, local LLM features disabled. Run "npm run build:server" to enable.'
        );
        return;
      }

      this.worker = new Worker(workerPath);

      this.worker.on('message', (response: WorkerResponse) => {
        if (response.type === 'streamChunk') {
          this.handleStreamChunk(response);
        } else if (response.type === 'downloadProgress') {
          // Progress messages are handled by individual request handlers via event listeners
          // Don't process these as regular responses to avoid false errors
          return;
        } else if (response.type === 'mcpToolsRequest') {
          this.handleMCPToolsRequest(response as MCPToolsRequest);
        } else if (response.type === 'executeMCPTool') {
          this.handleMCPToolRequest(response as MCPToolExecutionRequest);
        } else if (response.type === 'error') {
          logger.error('Worker reported error:', response.error);
          // Just log it, don't crash
        } else {
          this.handleResponse(response);
        }
      });

      this.worker.on('error', error => {
        logger.error('Worker error:', error);
        // Don't crash the server if worker has errors
        this.worker = null;
        this.isInitialized = false;
      });

      this.worker.on('exit', code => {
        logger.info(`Worker exited with code ${code}`);
        this.worker = null;
        this.isInitialized = false;
        // Don't crash the server if worker exits
        logger.error(`Worker exited with code ${code}`);
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

  private handleStreamChunk(response: WorkerResponse) {
    const streamRequest = this.streamingRequests.get(response.id);
    if (streamRequest && response.data && typeof response.data === 'string') {
      streamRequest.chunks.push(response.data);
    }
  }

  private handleResponse(response: WorkerResponse) {
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

  private async handleMCPToolsRequest(request: MCPToolsRequest): Promise<void> {
    try {
      const { mcpManager } = await import('./mcpManager.js');
      const tools = mcpManager.getAvailableTools();

      this.worker?.postMessage({
        id: request.id,
        type: 'mcpToolsResponse',
        data: tools,
      });
    } catch (error) {
      this.worker?.postMessage({
        id: request.id,
        type: 'mcpToolsResponse',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async handleMCPToolRequest(
    request: MCPToolExecutionRequest
  ): Promise<void> {
    try {
      const { mcpManager } = await import('./mcpManager.js');

      const result = await mcpManager.executeTool(
        request.data.serverId,
        request.data.toolName,
        request.data.params
      );

      this.worker?.postMessage({
        id: request.id,
        type: 'mcpToolExecutionResponse',
        data: result,
      });
    } catch (error) {
      this.worker?.postMessage({
        id: request.id,
        type: 'mcpToolExecutionResponse',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
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

  private async sendMessage<T = unknown>(
    type: string,
    data?: unknown
  ): Promise<T> {
    if (!this.worker) {
      throw new Error('Worker not available');
    }

    const id = (++this.requestId).toString();
    const message = { id, type, data };

    return new Promise<T>((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: (result: unknown) => resolve(result as T),
        reject,
      });

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
        resolve: (result: unknown) => {
          clearTimeout(timeout);
          originalResolve(result as T);
        },
        reject: (error: unknown) => {
          clearTimeout(timeout);
          originalReject(error);
        },
      });

      this.worker!.postMessage(message);
    });
  }

  private async sendStreamMessage(
    type: string,
    data?: unknown
  ): Promise<AsyncGenerator<string>> {
    if (!this.worker) {
      throw new Error('Worker not available');
    }

    const id = (++this.requestId).toString();
    const message = { id, type, data };

    return new Promise<AsyncGenerator<string>>((resolve, reject) => {
      this.streamingRequests.set(id, {
        resolve: (chunks: string[]) =>
          resolve(this.createAsyncGenerator(chunks)),
        reject,
        chunks: [],
      });
      this.pendingRequests.set(id, {
        resolve: (result: unknown) => resolve(result as AsyncGenerator<string>),
        reject,
      });

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
        resolve: (result: unknown) => {
          clearTimeout(timeout);
          originalResolve(result as AsyncGenerator<string>);
        },
        reject: (error: unknown) => {
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
    return this.sendMessage<LocalModelInfo[]>('getLocalModels');
  }

  async getAvailableModels(): Promise<
    (ModelDownloadInfo | DynamicModelInfo)[]
  > {
    await this.waitForInitialization();
    return this.sendMessage<(ModelDownloadInfo | DynamicModelInfo)[]>(
      'getAvailableModels'
    );
  }

  async searchModels(
    query: string
  ): Promise<(ModelDownloadInfo | DynamicModelInfo)[]> {
    await this.waitForInitialization();
    return this.sendMessage<(ModelDownloadInfo | DynamicModelInfo)[]>(
      'searchModels',
      { query }
    );
  }

  async downloadModel(
    modelInfo: ModelDownloadInfo | DynamicModelInfo,
    onProgress?: (progress: number, speed?: string) => void
  ): Promise<string> {
    await this.waitForInitialization();

    // Store the callback and pass only the request ID to worker
    const id = (++this.requestId).toString();
    const progressCallbacks = new Map<
      string,
      (progress: number, speed?: string) => void
    >();

    if (onProgress) {
      progressCallbacks.set(id, onProgress);
    }

    const message = { id, type: 'downloadModel', data: { modelInfo } };

    return new Promise<string>((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: (result: unknown) => resolve(result as string),
        reject,
      });

      // Set timeout for requests
      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          progressCallbacks.delete(id);
          reject(new Error('Worker request timeout'));
        }
      }, 600000); // 10 minute timeout for downloads

      const originalResolve = resolve;
      const originalReject = reject;

      this.pendingRequests.set(id, {
        resolve: (result: unknown) => {
          clearTimeout(timeout);
          progressCallbacks.delete(id);
          originalResolve(result as string);
        },
        reject: (error: unknown) => {
          clearTimeout(timeout);
          progressCallbacks.delete(id);
          originalReject(error);
        },
      });

      // Handle progress messages from worker
      const progressHandler = (response: WorkerResponse) => {
        if (response.id === id && response.type === 'downloadProgress') {
          const callback = progressCallbacks.get(id);
          if (callback && typeof response.progress === 'number') {
            callback(response.progress, response.speed);
          }
        }
      };

      this.worker!.on('message', progressHandler);

      // Clean up the progress handler when done
      const cleanup = () => {
        this.worker?.removeListener('message', progressHandler);
        progressCallbacks.delete(id);
      };

      this.pendingRequests.set(id, {
        resolve: (result: unknown) => {
          clearTimeout(timeout);
          cleanup();
          originalResolve(result as string);
        },
        reject: (error: unknown) => {
          clearTimeout(timeout);
          cleanup();
          originalReject(error);
        },
      });

      this.worker!.postMessage(message);
    });
  }

  async deleteModel(modelId: string): Promise<void> {
    await this.waitForInitialization();
    return this.sendMessage<void>('deleteModel', { modelId });
  }

  async loadModel(modelIdOrName: string, threadId?: string): Promise<void> {
    await this.waitForInitialization();
    return this.sendMessage<void>('loadModel', { modelIdOrName, threadId });
  }

  async updateSessionHistory(
    modelIdOrName: string,
    threadId: string
  ): Promise<void> {
    await this.waitForInitialization();
    return this.sendMessage<void>('updateSessionHistory', {
      modelIdOrName,
      threadId,
    });
  }

  async unloadModel(modelId: string): Promise<void> {
    await this.waitForInitialization();
    return this.sendMessage<void>('unloadModel', { modelId });
  }

  async generateResponse(
    modelIdOrName: string,
    messages: Array<{ role: string; content: string }>,
    options?: {
      temperature?: number;
      maxTokens?: number;
      threadId?: string;
      disableFunctions?: boolean;
      disableChatHistory?: boolean;
    }
  ): Promise<string> {
    await this.waitForInitialization();
    return this.sendMessage<string>('generateResponse', {
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
      threadId?: string;
      disableFunctions?: boolean;
      disableChatHistory?: boolean;
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
      reject: (error: unknown) => {
        streamError = error instanceof Error ? error : new Error(String(error));
        streamComplete = true;
      },
      chunks,
    });

    this.pendingRequests.set(id, {
      resolve: () => {
        streamComplete = true;
      },
      reject: (error: unknown) => {
        streamError = error instanceof Error ? error : new Error(String(error));
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
    return this.sendMessage<void>('setModelSettings', { modelId, settings });
  }

  async getModelSettings(modelId: string): Promise<ModelLoadingSettings> {
    await this.waitForInitialization();
    return this.sendMessage<ModelLoadingSettings>('getModelSettings', {
      modelId,
    });
  }

  async calculateOptimalSettings(
    modelId: string
  ): Promise<ModelLoadingSettings> {
    await this.waitForInitialization();
    return this.sendMessage<ModelLoadingSettings>('calculateOptimalSettings', {
      modelId,
    });
  }

  getModelRuntimeInfo(modelId: string): Promise<ModelRuntimeInfo | undefined> {
    return this.sendMessage<ModelRuntimeInfo | undefined>(
      'getModelRuntimeInfo',
      { modelId }
    );
  }

  clearContextSizeCache(): Promise<void> {
    return this.sendMessage<void>('clearContextSizeCache');
  }

  async getModelStatus(modelId: string): Promise<{
    loaded: boolean;
    info?: LocalModelInfo;
  }> {
    await this.waitForInitialization();
    return this.sendMessage<{ loaded: boolean; info?: LocalModelInfo }>(
      'getModelStatus',
      { modelId }
    );
  }

  cancelDownload(filename: string): Promise<boolean> {
    return this.sendMessage<boolean>('cancelDownload', { filename });
  }

  getDownloadProgress(filename: string): Promise<{
    isDownloading: boolean;
    progress: number;
    speed?: string;
  }> {
    return this.sendMessage<{
      isDownloading: boolean;
      progress: number;
      speed?: string;
    }>('getDownloadProgress', { filename });
  }

  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.isInitialized = false;
    }
  }
}
