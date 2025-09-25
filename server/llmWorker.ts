import { parentPort } from 'worker_threads';
import {
  LocalLLMManager,
  type ModelLoadingSettings,
  type StreamResponseOptions,
} from './localLlmManager';
import { logger } from './logger';
import { SSEEventType } from '../src/types';

// Worker thread for local LLM operations with enhanced abort handling
let llmManager: LocalLLMManager;

// Track active generation tasks for proper abort handling
const activeGenerations = new Map<string, AbortController>();

interface WorkerMessage {
  id: string;
  type: string;
  data?: unknown;
}

// Type guards and interfaces for specific message data types
interface SearchModelsData {
  query: string;
}

interface DownloadModelData {
  modelInfo: unknown; // This should match the expected type from LocalLLMManager
}

interface DeleteModelData {
  modelId: string;
}

interface LoadModelData {
  modelIdOrName: string;
  threadId?: string;
}

interface UpdateSessionHistoryData {
  modelIdOrName: string;
  threadId: string;
}

interface UnloadModelData {
  modelId: string;
}

interface GenerateResponseData {
  modelIdOrName: string;
  messages: unknown; // Should be Message[] but using unknown for flexibility
  options?: {
    temperature?: number;
    maxTokens?: number;
    threadId?: string;
    disableFunctions?: boolean;
    disableChatHistory?: boolean;
    signal?: AbortSignal;
  };
}

interface GenerateStreamResponseData {
  modelIdOrName: string;
  messages: unknown;
  options?: StreamResponseOptions;
}

interface AbortGenerationData {
  requestId: string;
}

interface SetModelSettingsData {
  modelId: string;
  settings: ModelLoadingSettings;
}

interface GetModelSettingsData {
  modelId: string;
}

interface CalculateOptimalSettingsData {
  modelId: string;
}

interface GetModelRuntimeInfoData {
  modelId: string;
}

interface GetModelStatusData {
  modelId: string;
}

interface CancelDownloadData {
  filename: string;
}

interface GetDownloadProgressData {
  filename: string;
}

// Type guard functions
function isSearchModelsData(data: unknown): data is SearchModelsData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'query' in data &&
    typeof (data as SearchModelsData).query === 'string'
  );
}

function isDownloadModelData(data: unknown): data is DownloadModelData {
  return typeof data === 'object' && data !== null && 'modelInfo' in data;
}

function isDeleteModelData(data: unknown): data is DeleteModelData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'modelId' in data &&
    typeof (data as DeleteModelData).modelId === 'string'
  );
}

function isLoadModelData(data: unknown): data is LoadModelData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'modelIdOrName' in data &&
    typeof (data as LoadModelData).modelIdOrName === 'string' &&
    (typeof (data as LoadModelData).threadId === 'string' ||
      (data as LoadModelData).threadId === undefined)
  );
}

function isUpdateSessionHistoryData(
  data: unknown
): data is UpdateSessionHistoryData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'modelIdOrName' in data &&
    'threadId' in data &&
    typeof (data as UpdateSessionHistoryData).modelIdOrName === 'string' &&
    typeof (data as UpdateSessionHistoryData).threadId === 'string'
  );
}

function isUnloadModelData(data: unknown): data is UnloadModelData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'modelId' in data &&
    typeof (data as UnloadModelData).modelId === 'string'
  );
}

function isGenerateResponseData(data: unknown): data is GenerateResponseData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'modelIdOrName' in data &&
    'messages' in data &&
    'options' in data &&
    typeof (data as GenerateResponseData).modelIdOrName === 'string'
  );
}

function isGenerateStreamResponseData(
  data: unknown
): data is GenerateStreamResponseData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'modelIdOrName' in data &&
    'messages' in data &&
    'options' in data &&
    typeof (data as GenerateStreamResponseData).modelIdOrName === 'string'
  );
}

function isAbortGenerationData(data: unknown): data is AbortGenerationData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'requestId' in data &&
    typeof (data as AbortGenerationData).requestId === 'string'
  );
}

function isSetModelSettingsData(data: unknown): data is SetModelSettingsData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'modelId' in data &&
    'settings' in data &&
    typeof (data as SetModelSettingsData).modelId === 'string'
  );
}

function isGetModelSettingsData(data: unknown): data is GetModelSettingsData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'modelId' in data &&
    typeof (data as GetModelSettingsData).modelId === 'string'
  );
}

function isCalculateOptimalSettingsData(
  data: unknown
): data is CalculateOptimalSettingsData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'modelId' in data &&
    typeof (data as CalculateOptimalSettingsData).modelId === 'string'
  );
}

function isGetModelRuntimeInfoData(
  data: unknown
): data is GetModelRuntimeInfoData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'modelId' in data &&
    typeof (data as GetModelRuntimeInfoData).modelId === 'string'
  );
}

function isGetModelStatusData(data: unknown): data is GetModelStatusData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'modelId' in data &&
    typeof (data as GetModelStatusData).modelId === 'string'
  );
}

function isCancelDownloadData(data: unknown): data is CancelDownloadData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'filename' in data &&
    typeof (data as CancelDownloadData).filename === 'string'
  );
}

function isGetDownloadProgressData(
  data: unknown
): data is GetDownloadProgressData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'filename' in data &&
    typeof (data as GetDownloadProgressData).filename === 'string'
  );
}

interface WorkerResponse {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

async function handleMessage(message: WorkerMessage): Promise<WorkerResponse> {
  try {
    switch (message.type) {
      case 'init':
        llmManager = new LocalLLMManager();
        return { id: message.id, success: true };

      case 'getLocalModels': {
        const models = await llmManager.getLocalModels();
        return { id: message.id, success: true, data: models };
      }

      case 'getAvailableModels': {
        const availableModels = await llmManager.getAvailableModels();
        return { id: message.id, success: true, data: availableModels };
      }

      case 'searchModels': {
        if (!isSearchModelsData(message.data)) {
          throw new Error('Invalid searchModels data');
        }
        const searchResults = await llmManager.searchModels(message.data.query);
        return { id: message.id, success: true, data: searchResults };
      }

      case 'downloadModel': {
        if (!isDownloadModelData(message.data)) {
          throw new Error('Invalid downloadModel data');
        }
        const downloadPath = await llmManager.downloadModel(
          message.data.modelInfo as Parameters<
            typeof llmManager.downloadModel
          >[0],
          (progress: number, speed?: string) => {
            // Send progress updates back to proxy
            parentPort?.postMessage({
              id: message.id,
              type: 'downloadProgress',
              progress,
              speed,
            });
          }
        );
        return { id: message.id, success: true, data: downloadPath };
      }

      case 'deleteModel':
        if (!isDeleteModelData(message.data)) {
          throw new Error('Invalid deleteModel data');
        }
        await llmManager.deleteModel(message.data.modelId);
        return { id: message.id, success: true };

      case 'loadModel':
        if (!isLoadModelData(message.data)) {
          throw new Error('Invalid loadModel data');
        }
        await llmManager.loadModel(
          message.data.modelIdOrName,
          message.data.threadId
        );
        return { id: message.id, success: true };

      case 'updateSessionHistory':
        if (!isUpdateSessionHistoryData(message.data)) {
          throw new Error('Invalid updateSessionHistory data');
        }
        await llmManager.updateSessionHistory(
          message.data.modelIdOrName,
          message.data.threadId
        );
        return { id: message.id, success: true };

      case 'unloadModel':
        if (!isUnloadModelData(message.data)) {
          throw new Error('Invalid unloadModel data');
        }
        await llmManager.unloadModel(message.data.modelId);
        return { id: message.id, success: true };

      case 'generateResponse':
        try {
          if (!isGenerateResponseData(message.data)) {
            throw new Error('Invalid generateResponse data');
          }

          // Create abort controller for this generation
          const abortController = new AbortController();
          activeGenerations.set(message.id, abortController);

          try {
            const response = await llmManager.generateResponse(
              message.data.modelIdOrName,
              message.data.messages as Parameters<
                typeof llmManager.generateResponse
              >[1],
              {
                ...message.data.options,
                signal: abortController.signal,
              } as
                | {
                    temperature?: number;
                    maxTokens?: number;
                    threadId?: string;
                    disableFunctions?: boolean;
                    disableChatHistory?: boolean;
                    signal?: AbortSignal;
                  }
                | undefined
            );
            return { id: message.id, success: true, data: response };
          } finally {
            // Clean up
            activeGenerations.delete(message.id);
          }
        } catch (error) {
          // Clean up on error
          activeGenerations.delete(message.id);
          logger.error('Generate response error:', error);
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error occurred';

          // Check if it was an abort
          if (
            errorMessage.includes('AbortError') ||
            errorMessage.includes('abort')
          ) {
            return {
              id: message.id,
              success: false,
              error: 'AbortError: Generation aborted',
            };
          }

          let userFriendlyMessage = errorMessage;
          if (errorMessage.includes('KV slot')) {
            userFriendlyMessage =
              'Model memory is full. Try reducing conversation length or restart the model.';
          }

          return {
            id: message.id,
            success: true,
            data: `❌ Error: ${userFriendlyMessage}`,
          };
        }

      case 'generateStreamResponse':
        try {
          if (!isGenerateStreamResponseData(message.data)) {
            throw new Error('Invalid generateStreamResponse data');
          }

          // Create abort controller for this generation
          const abortController = new AbortController();
          activeGenerations.set(message.id, abortController);

          try {
            // For streaming, we need to handle this differently
            const generator = llmManager.generateStreamResponse(
              message.data.modelIdOrName,
              message.data.messages as Parameters<
                typeof llmManager.generateStreamResponse
              >[1],
              {
                ...message.data.options,
                signal: abortController.signal,
              }
            );

            // Send chunks as they come
            for await (const chunk of generator) {
              // Check if aborted
              if (abortController.signal.aborted) {
                break;
              }

              if (parentPort) {
                parentPort.postMessage({
                  id: message.id,
                  type: 'streamChunk',
                  data: chunk,
                });
              }
            }

            // Check if we completed or were aborted
            if (abortController.signal.aborted) {
              return {
                id: message.id,
                success: false,
                error: 'AbortError: Stream aborted',
              };
            }

            // Send completion signal
            return { id: message.id, success: true, data: 'STREAM_COMPLETE' };
          } finally {
            // Clean up
            activeGenerations.delete(message.id);
          }
        } catch (error) {
          // Clean up on error
          activeGenerations.delete(message.id);
          logger.error('Generate stream response error:', error);
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error occurred';

          // Check if it was an abort
          if (
            errorMessage.includes('AbortError') ||
            errorMessage.includes('abort')
          ) {
            return {
              id: message.id,
              success: false,
              error: 'AbortError: Stream aborted',
            };
          }

          let userFriendlyMessage = errorMessage;
          if (errorMessage.includes('KV slot')) {
            userFriendlyMessage =
              'Model memory is full. Try reducing conversation length or restart the model.';
          }

          // Send error as a final chunk
          if (parentPort) {
            parentPort.postMessage({
              id: message.id,
              type: 'streamChunk',
              data: `❌ Error: ${userFriendlyMessage}`,
            });
          }

          return {
            id: message.id,
            success: false,
            error: userFriendlyMessage,
          };
        }

      case 'setModelSettings':
        if (!isSetModelSettingsData(message.data)) {
          throw new Error('Invalid setModelSettings data');
        }
        await llmManager.setModelSettings(
          message.data.modelId,
          message.data.settings
        );
        return { id: message.id, success: true };

      case 'getModelSettings': {
        if (!isGetModelSettingsData(message.data)) {
          throw new Error('Invalid getModelSettings data');
        }
        const settings = await llmManager.getModelSettings(
          message.data.modelId
        );
        return { id: message.id, success: true, data: settings };
      }

      case 'calculateOptimalSettings': {
        if (!isCalculateOptimalSettingsData(message.data)) {
          throw new Error('Invalid calculateOptimalSettings data');
        }
        const optimalSettings = await llmManager.calculateOptimalSettings(
          message.data.modelId
        );
        return { id: message.id, success: true, data: optimalSettings };
      }

      case 'getModelRuntimeInfo': {
        if (!isGetModelRuntimeInfoData(message.data)) {
          throw new Error('Invalid getModelRuntimeInfo data');
        }
        const runtimeInfo = llmManager.getModelRuntimeInfo(
          message.data.modelId
        );
        return { id: message.id, success: true, data: runtimeInfo };
      }

      case 'clearContextSizeCache':
        llmManager.clearContextSizeCache();
        return { id: message.id, success: true };

      case 'getModelStatus': {
        if (!isGetModelStatusData(message.data)) {
          throw new Error('Invalid getModelStatus data');
        }
        const modelStatus = await llmManager.getModelStatus(
          message.data.modelId
        );
        return { id: message.id, success: true, data: modelStatus };
      }

      case 'cancelDownload': {
        if (!isCancelDownloadData(message.data)) {
          throw new Error('Invalid cancelDownload data');
        }
        const cancelled = llmManager.cancelDownload(message.data.filename);
        return { id: message.id, success: true, data: cancelled };
      }

      case 'getDownloadProgress': {
        if (!isGetDownloadProgressData(message.data)) {
          throw new Error('Invalid getDownloadProgress data');
        }
        const progress = llmManager.getDownloadProgress(message.data.filename);
        return { id: message.id, success: true, data: progress };
      }

      case 'abortGeneration': {
        if (!isAbortGenerationData(message.data)) {
          throw new Error('Invalid abortGeneration data');
        }

        // Find and abort the active generation
        const controller = activeGenerations.get(message.data.requestId);
        if (controller) {
          controller.abort();
          activeGenerations.delete(message.data.requestId);
          logger.info(`Aborted generation ${message.data.requestId}`);
        }

        return { id: message.id, success: true };
      }

      default:
        throw new Error(`Unknown message type: ${message.type}`);
    }
  } catch (error) {
    logger.error('Worker error:', error);
    return {
      id: message.id,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

if (parentPort) {
  parentPort.on('message', (message: WorkerMessage) => {
    // Skip MCP response messages - they're handled by LocalLLMManager promises
    if (
      message.type === 'mcpToolsResponse' ||
      message.type === 'mcpToolExecutionResponse'
    ) {
      return;
    }

    handleMessage(message)
      .then(response => {
        if (parentPort) {
          parentPort.postMessage(response);
        }
      })
      .catch(error => {
        logger.error('Unhandled worker error:', error);
        if (parentPort) {
          parentPort.postMessage({
            id: message.id,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      });
  });

  // Handle all unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection in worker thread:', reason, promise);
    // Send error to parent but DON'T exit
    if (parentPort) {
      parentPort.postMessage({
        type: SSEEventType.ERROR,
        error: reason instanceof Error ? reason.message : 'Unhandled rejection',
      });
    }
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', error => {
    logger.error('Uncaught Exception in worker thread:', error);
    // Send error to parent but DON'T exit
    if (parentPort) {
      parentPort.postMessage({
        type: SSEEventType.ERROR,
        error: error.message,
      });
    }
  });

  // Handle worker termination gracefully
  process.on('SIGTERM', () => {
    logger.info('LLM Worker terminating...');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    logger.info('LLM Worker interrupted...');
    process.exit(0);
  });

  logger.info('LLM Worker started');
}

// Clean up function for worker shutdown
function cleanup() {
  // Abort all active generations
  for (const [id, controller] of activeGenerations) {
    logger.info(`Aborting generation ${id} during cleanup`);
    controller.abort();
  }
  activeGenerations.clear();
}

// Handle process termination
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
