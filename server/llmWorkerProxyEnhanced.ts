import { Worker } from 'worker_threads';
import { EventEmitter } from 'events';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { logger } from './logger';
import type {
  LocalModelInfo,
  ModelDownloadInfo,
  ModelLoadingSettings,
  ModelRuntimeInfo,
} from './localLlmManager';
import type { DynamicModelInfo } from './modelFetcher';

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
  abortController?: AbortController;
}

interface StreamingRequest {
  resolve: (value: string[]) => void;
  reject: (reason?: unknown) => void;
  chunks: string[];
  abortController?: AbortController;
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

export class LLMWorkerProxyEnhanced extends EventEmitter {
  private worker: Worker | null = null;
  private readonly pendingRequests = new Map<string, PendingRequest<unknown>>();
  private readonly streamingRequests = new Map<string, StreamingRequest>();
  private requestId = 0;
  private isInitialized = false;
  private restartCount = 0;
  private readonly maxRestarts = 3;
  private isRestarting = false;

  constructor() {
    super();
    // Initialize worker asynchronously to not block server startup
    setTimeout(() => this.initializeWorker(), 0);
  }

  private initializeWorker() {
    if (this.isRestarting) {
      logger.info(
        'Worker restart already in progress, skipping duplicate initialization'
      );
      return;
    }

    try {
      let workerPath: string;
      const workerOptions: Record<string, unknown> = {};

      // Use the enhanced worker
      if (process.env.NODE_ENV === 'development') {
        const wrapperPath = join(__dirname, 'llmWorkerEnhanced.wrapper.mjs');
        const wrapperLines = [
          "import { register } from 'tsx/esm/api';",
          'const unregister = register();',
          "await import('./llmWorkerEnhanced.ts');",
        ];
        const wrapperContent = wrapperLines.join('\n');

        if (!existsSync(wrapperPath)) {
          import('fs').then(({ writeFileSync }) => {
            writeFileSync(wrapperPath, wrapperContent, 'utf-8');
          });
        }

        workerPath = wrapperPath;
      } else {
        workerPath = join(__dirname, 'llmWorkerEnhanced.js');
      }

      if (!existsSync(workerPath)) {
        logger.warn(`Enhanced LLM worker not found at ${workerPath}`);
        return;
      }

      this.worker = new Worker(workerPath, workerOptions);

      this.worker.on('message', (response: WorkerResponse) => {
        if (response.type === 'streamChunk') {
          this.handleStreamChunk(response);
        } else if (response.type === 'downloadProgress') {
          // Progress messages are handled by individual request handlers
          return;
        } else if (response.type === 'mcpToolsRequest') {
          this.handleMCPToolsRequest(response as MCPToolsRequest);
        } else if (response.type === 'executeMCPTool') {
          this.handleMCPToolRequest(response as MCPToolExecutionRequest);
        } else if (response.type === 'error') {
          logger.error('Worker reported error:', response.error);
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

        if (code !== 0 && !this.isRestarting) {
          this.handleWorkerCrash(new Error(`Worker exited with code ${code}`));
        }
      });

      // Initialize the worker
      this.sendMessage('init')
        .then(() => {
          this.isInitialized = true;
          this.restartCount = 0; // Reset on successful init
          logger.info('Enhanced LLM Worker initialized');
        })
        .catch(error => {
          logger.error('Failed to initialize Enhanced LLM Worker:', error);
        });
    } catch (error) {
      logger.error('Failed to create Enhanced LLM Worker:', error);
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
          new Error(response.error ?? 'Unknown worker error')
        );
      }
    }
  }

  private async handleMCPToolsRequest(request: MCPToolsRequest): Promise<void> {
    try {
      const { mcpManager } = await import('./mcpManager');
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
      const { mcpManager } = await import('./mcpManager');

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
      // Abort any active operations
      if (request.abortController) {
        request.abortController.abort();
      }
      request.reject(error);
    }
    this.pendingRequests.clear();

    for (const [id, request] of this.streamingRequests) {
      // Abort any active streaming operations
      if (request.abortController) {
        request.abortController.abort();
      }
      request.reject(error);
    }
    this.streamingRequests.clear();
  }

  private handleWorkerCrash(error: Error) {
    logger.error('Worker crashed:', error);
    this.rejectAllPending(error);
    this.emit('error', error);

    // Try to restart if we haven't exceeded the limit
    if (this.restartCount < this.maxRestarts && !this.isRestarting) {
      this.restartCount++;
      this.isRestarting = true;

      logger.info(
        `Attempting to restart worker (attempt ${this.restartCount}/${this.maxRestarts})`
      );

      setTimeout(() => {
        try {
          this.initializeWorker();
        } catch (restartError) {
          logger.error('Failed to restart worker:', restartError);
        } finally {
          this.isRestarting = false;
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
      const abortController = new AbortController();

      this.pendingRequests.set(id, {
        resolve: (result: unknown) => resolve(result as T),
        reject,
        abortController,
      });

      // Set timeout for requests
      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          abortController.abort();
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
        abortController,
      });

      this.worker!.postMessage(message);
    });
  }

  async waitForInitialization(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    return new Promise(resolve => {
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
      const abortController = new AbortController();

      this.pendingRequests.set(id, {
        resolve: (result: unknown) => resolve(result as string),
        reject,
        abortController,
      });

      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          progressCallbacks.delete(id);
          abortController.abort();
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
        abortController,
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
        abortController,
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
    let abortSent = false;

    // Create abort controller for this stream
    const abortController = new AbortController();

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
      abortController,
    });

    this.pendingRequests.set(id, {
      resolve: () => {
        streamComplete = true;
      },
      reject: (error: unknown) => {
        streamError = error instanceof Error ? error : new Error(String(error));
        streamComplete = true;
      },
      abortController,
    });

    // Listen for external abort signal
    if (options?.signal) {
      options.signal.addEventListener('abort', () => {
        if (!abortSent && !streamComplete) {
          abortSent = true;
          // Send abort message to worker
          this.worker?.postMessage({
            type: 'abortGeneration',
            id: (++this.requestId).toString(),
            data: { requestId: id },
          });

          // Mark as complete
          streamError = new Error('AbortError: Generation aborted');
          streamComplete = true;
        }
      });
    }

    // Set timeout for streaming requests
    const timeout = setTimeout(() => {
      if (this.pendingRequests.has(id)) {
        this.pendingRequests.delete(id);
        this.streamingRequests.delete(id);
        streamError = new Error('Worker streaming request timeout');
        streamComplete = true;

        // Send abort to worker
        if (!abortSent) {
          this.worker?.postMessage({
            type: 'abortGeneration',
            id: (++this.requestId).toString(),
            data: { requestId: id },
          });
        }
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

        // Check for external abort
        if (options?.signal?.aborted && !abortSent) {
          abortSent = true;
          // Send abort message to worker
          this.worker?.postMessage({
            type: 'abortGeneration',
            id: (++this.requestId).toString(),
            data: { requestId: id },
          });
          throw new Error('AbortError: Generation aborted');
        }
      }

      // Yield any remaining chunks
      while (chunkIndex < chunks.length) {
        yield chunks[chunkIndex];
        chunkIndex++;
      }

      // Check for final error
      if (streamError) {
        throw streamError;
      }
    } finally {
      clearTimeout(timeout);
      this.pendingRequests.delete(id);
      this.streamingRequests.delete(id);
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
      // Send abort to all active generations before terminating
      for (const [id, request] of this.streamingRequests) {
        if (request.abortController) {
          request.abortController.abort();
        }
      }

      for (const [id, request] of this.pendingRequests) {
        if (request.abortController) {
          request.abortController.abort();
        }
      }

      this.worker.terminate();
      this.worker = null;
      this.isInitialized = false;
    }
  }
}

// Export as default for compatibility
export default LLMWorkerProxyEnhanced;
