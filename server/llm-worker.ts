import { parentPort } from 'worker_threads';
import { LocalLLMManager } from './local-llm-manager.js';
import { logger } from './logger.js';
import { SSEEventType } from '../src/types.js';

// Worker thread for local LLM operations to prevent main thread crashes
let llmManager: LocalLLMManager;

interface WorkerMessage {
  id: string;
  type: string;
  data?: any;
}

interface WorkerResponse {
  id: string;
  success: boolean;
  data?: any;
  error?: string;
}

async function handleMessage(message: WorkerMessage): Promise<WorkerResponse> {
  try {
    switch (message.type) {
      case 'init':
        llmManager = new LocalLLMManager();
        return { id: message.id, success: true };

      case 'getLocalModels':
        const models = await llmManager.getLocalModels();
        return { id: message.id, success: true, data: models };

      case 'getAvailableModels':
        const availableModels = await llmManager.getAvailableModels();
        return { id: message.id, success: true, data: availableModels };

      case 'searchModels':
        const searchResults = await llmManager.searchModels(message.data.query);
        return { id: message.id, success: true, data: searchResults };

      case 'downloadModel':
        const downloadPath = await llmManager.downloadModel(
          message.data.modelInfo,
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

      case 'deleteModel':
        await llmManager.deleteModel(message.data.modelId);
        return { id: message.id, success: true };

      case 'loadModel':
        await llmManager.loadModel(
          message.data.modelIdOrName,
          message.data.threadId
        );
        return { id: message.id, success: true };

      case 'updateSessionHistory':
        await llmManager.updateSessionHistory(
          message.data.modelIdOrName,
          message.data.threadId
        );
        return { id: message.id, success: true };

      case 'unloadModel':
        await llmManager.unloadModel(message.data.modelId);
        return { id: message.id, success: true };

      case 'generateResponse':
        try {
          const response = await llmManager.generateResponse(
            message.data.modelIdOrName,
            message.data.messages,
            message.data.options
          );
          return { id: message.id, success: true, data: response };
        } catch (error) {
          logger.error(
            'Generate response error (returning as message):',
            error
          );
          // Return error as the final message instead of throwing
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error occurred';
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
          // For streaming, we need to handle this differently
          // We'll send multiple messages back for each chunk
          const generator = llmManager.generateStreamResponse(
            message.data.modelIdOrName,
            message.data.messages,
            message.data.options
          );

          // Send chunks as they come
          for await (const chunk of generator) {
            if (parentPort) {
              parentPort.postMessage({
                id: message.id,
                type: 'streamChunk',
                data: chunk,
              });
            }
          }

          // Send completion signal
          return { id: message.id, success: true, data: 'STREAM_COMPLETE' };
        } catch (error) {
          logger.error(
            'Generate stream response error (returning as chunk):',
            error
          );
          // Send error as a final chunk
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error occurred';
          let userFriendlyMessage = errorMessage;

          if (errorMessage.includes('KV slot')) {
            userFriendlyMessage =
              'Model memory is full. Try reducing conversation length or restart the model.';
          }

          if (parentPort) {
            parentPort.postMessage({
              id: message.id,
              type: 'streamChunk',
              data: `❌ Error: ${userFriendlyMessage}`,
            });
          }

          return { id: message.id, success: true, data: 'STREAM_COMPLETE' };
        }

      case 'setModelSettings':
        await llmManager.setModelSettings(
          message.data.modelId,
          message.data.settings
        );
        return { id: message.id, success: true };

      case 'getModelSettings':
        const settings = await llmManager.getModelSettings(
          message.data.modelId
        );
        return { id: message.id, success: true, data: settings };

      case 'calculateOptimalSettings':
        const optimalSettings = await llmManager.calculateOptimalSettings(
          message.data.modelId
        );
        return { id: message.id, success: true, data: optimalSettings };

      case 'getModelRuntimeInfo':
        const runtimeInfo = llmManager.getModelRuntimeInfo(
          message.data.modelId
        );
        return { id: message.id, success: true, data: runtimeInfo };

      case 'clearContextSizeCache':
        llmManager.clearContextSizeCache();
        return { id: message.id, success: true };

      case 'getModelStatus':
        const modelStatus = await llmManager.getModelStatus(
          message.data.modelId
        );
        return { id: message.id, success: true, data: modelStatus };

      case 'cancelDownload':
        const cancelled = llmManager.cancelDownload(message.data.filename);
        return { id: message.id, success: true, data: cancelled };

      case 'getDownloadProgress':
        const progress = llmManager.getDownloadProgress(message.data.filename);
        return { id: message.id, success: true, data: progress };

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
  parentPort.on('message', async (message: WorkerMessage) => {
    // Skip MCP response messages - they're handled by LocalLLMManager promises
    if (
      message.type === 'mcpToolsResponse' ||
      message.type === 'mcpToolExecutionResponse'
    ) {
      return;
    }

    try {
      const response = await handleMessage(message);
      if (parentPort) {
        parentPort.postMessage(response);
      }
    } catch (error) {
      logger.error('Unhandled worker error:', error);
      if (parentPort) {
        parentPort.postMessage({
          id: message.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  });

  // Handle all unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection in worker thread:', reason);
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
