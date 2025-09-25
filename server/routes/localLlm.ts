import type { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import { exec } from 'child_process';
import fs from 'fs';
import os from 'os';
import { getLocalLLMManager } from '../localLlmSingleton';
import type { ModelLoadingSettings } from '../localLlmManager';
import { sseManager } from '../sseManager';
import { getLocalModelsDirectory } from '../utils/settingsDirectory';
import { modelSettingsManager } from '../utils/modelSettingsManager';
import { SSEEventType } from '../../src/types';
import { HTTP_STATUS } from '../llm/constants';
import { logger } from '../logger';

const router = Router();
const llmManager = getLocalLLMManager();

// Helper to wrap async route handlers
const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Get all local models
 */
router.get(
  '/models',
  asyncHandler(async (req, res) => {
    try {
      const models = await llmManager.getLocalModels();
      res.json(models);
    } catch (error) {
      logger.error('Error getting local models:', error);
      res.status(500).json({ error: 'Failed to get local models' });
    }
  })
);

/**
 * Get cached available models only (no fetch if cache is empty)
 */
router.get(
  '/available-models-cached',
  asyncHandler(async (req, res) => {
    try {
      const { modelFetcher } = await import('../modelFetcher');
      const models = modelFetcher.getCachedModels();
      res.json(models);
    } catch (error) {
      logger.error('Error getting cached models:', error);
      res.status(500).json({ error: 'Failed to get cached models' });
    }
  })
);

/**
 * Get updated VRAM data for specific models and trigger fetch for visible ones
 */
router.post(
  '/check-model-updates',
  asyncHandler(async (req, res) => {
    try {
      const { modelIds, visibleModelIds } = req.body as {
        modelIds: unknown;
        visibleModelIds?: unknown;
      };
      if (!Array.isArray(modelIds)) {
        res.status(400).json({ error: 'modelIds must be an array' });
        return;
      }

      const { modelFetcher } = await import('../modelFetcher');

      // If visible model IDs are provided, queue them for VRAM fetching
      if (Array.isArray(visibleModelIds) && visibleModelIds.length > 0) {
        const visibleModels = modelFetcher.getModelsById(
          visibleModelIds as string[]
        );
        const modelsNeedingVram = visibleModels.filter(
          m => !m.hasVramData && !m.vramError && !m.isFetchingVram && m.url
        );

        if (modelsNeedingVram.length > 0) {
          logger.info(
            `Queueing VRAM fetch for ${modelsNeedingVram.length} visible models`
          );
          // Fire and forget - we don't wait for VRAM fetching to complete
          modelFetcher
            .fetchVRAMDataForModels(modelsNeedingVram)
            .catch(error => {
              logger.error('Error queuing VRAM fetch:', error);
            });
        }
      }

      // Return all requested models (with updated data if available)
      const updatedModels = modelFetcher.getModelsById(modelIds as string[]);

      res.json({
        success: true,
        models: updatedModels,
      });
    } catch (error) {
      logger.error('Error checking model updates:', error);
      res.status(500).json({ error: 'Failed to check model updates' });
    }
  })
);

/**
 * Manually retry VRAM fetching for all models that need it
 */
router.post(
  '/retry-vram-fetch',
  asyncHandler(async (req, res) => {
    try {
      const { modelFetcher } = await import('../modelFetcher');
      modelFetcher.retryVramFetching();

      res.json({
        success: true,
        message: 'VRAM fetching retry initiated',
      });
    } catch (error) {
      logger.error('Error retrying VRAM fetch:', error);
      res.status(500).json({ error: 'Failed to retry VRAM fetch' });
    }
  })
);

/**
 * Get available models for download (with fallback to fetch)
 */
router.get(
  '/available-models',
  asyncHandler(async (req, res) => {
    try {
      const models = await llmManager.getAvailableModels();
      res.json(models);
    } catch (error) {
      logger.error('Error getting available models:', error);
      res.status(500).json({ error: 'Failed to get available models' });
    }
  })
);

/**
 * Refresh available models cache
 */
router.post(
  '/refresh-models',
  asyncHandler(async (req, res) => {
    try {
      const { modelFetcher } = await import('../modelFetcher');
      const models = await modelFetcher.refreshAvailableModels(); // Force refresh
      res.json({ success: true, models });
    } catch (error) {
      logger.error('Error refreshing models:', error);
      res.status(500).json({ error: 'Failed to refresh models' });
    }
  })
);

/**
 * Open models directory in file explorer
 */
router.post(
  '/open-models-directory',
  asyncHandler(async (req, res) => {
    try {
      const modelsDir = getLocalModelsDirectory();
      const platform = os.platform();

      // Ensure the directory exists before trying to open it
      if (!fs.existsSync(modelsDir)) {
        fs.mkdirSync(modelsDir, { recursive: true });
      }

      let command: string;
      if (platform === 'win32') {
        command = `explorer "${modelsDir}"`;
      } else if (platform === 'darwin') {
        command = `open "${modelsDir}"`;
      } else {
        // Linux and other Unix-like systems
        command = `xdg-open "${modelsDir}"`;
      }

      exec(command, error => {
        if (error) {
          logger.error('Error opening models directory:', error);
          res.status(500).json({ error: 'Failed to open models directory' });
          return;
        }
        res.json({ success: true, directory: modelsDir });
      });
    } catch (error) {
      logger.error('Error opening models directory:', error);
      res.status(500).json({ error: 'Failed to open models directory' });
    }
  })
);

/**
 * Clear accessibility cache and recheck all models
 */
router.post(
  '/refresh-accessibility',
  asyncHandler(async (req, res) => {
    try {
      const { modelFetcher } = await import('../modelFetcher');
      modelFetcher.clearAccessibilityCache();
      const models = await modelFetcher.refreshAvailableModels(); // Force refresh
      res.json({ success: true, models });
    } catch (error) {
      logger.error('Error refreshing accessibility:', error);
      res.status(500).json({ error: 'Failed to refresh accessibility' });
    }
  })
);

/**
 * Set Hugging Face token
 */
router.post(
  '/hf-token',
  asyncHandler(async (req, res) => {
    try {
      const { token } = req.body as { token: unknown };
      if (!token || typeof token !== 'string') {
        res.status(400).json({ error: 'Token is required' });
        return;
      }

      const { modelFetcher } = await import('../modelFetcher');
      await modelFetcher.setHuggingFaceToken(token);

      res.json({
        success: true,
        message: 'Hugging Face token saved. Rechecking gated models...',
      });
    } catch (error) {
      logger.error('Error setting Hugging Face token:', error);
      res.status(500).json({ error: 'Failed to save Hugging Face token' });
    }
  })
);

/**
 * Remove Hugging Face token
 */
router.delete(
  '/hf-token',
  asyncHandler(async (req, res) => {
    try {
      const { modelFetcher } = await import('../modelFetcher');
      await modelFetcher.removeHuggingFaceToken();

      res.json({ success: true, message: 'Hugging Face token removed' });
    } catch (error) {
      logger.error('Error removing Hugging Face token:', error);
      res.status(500).json({ error: 'Failed to remove Hugging Face token' });
    }
  })
);

/**
 * Get Hugging Face token
 */
router.get(
  '/hf-token',
  asyncHandler(async (req, res) => {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const { getMindstrikeDirectory } = await import(
        '../utils/settingsDirectory.js'
      );

      const tokenFile = path.join(getMindstrikeDirectory(), 'hf-token');
      const token = await fs.readFile(tokenFile, 'utf-8');

      res.json({ token: token.trim() });
    } catch (error) {
      logger.error('Error reading Hugging Face token:', error);
      res.status(404).json({ error: 'Token not found' });
    }
  })
);

/**
 * Check if Hugging Face token is set
 */
router.get(
  '/hf-token/status',
  asyncHandler(async (req, res) => {
    try {
      const { modelFetcher } = await import('../modelFetcher');
      const hasToken = modelFetcher.hasHuggingFaceToken();

      res.json({ hasToken });
    } catch (error) {
      logger.error('Error checking Hugging Face token status:', error);
      res.status(500).json({ error: 'Failed to check token status' });
    }
  })
);

/**
 * Update model list with real-time progress via SSE
 */
router.get(
  '/update-models-stream',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { modelFetcher } = await import('../modelFetcher');

      const clientId = `model-update-${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Set up SSE
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      // Send initial connection event
      res.write(
        `data: {"type": "${SSEEventType.CONNECTED}", "message": "Connected to model update stream"}\n\n`
      );
      if ('flush' in res && typeof res.flush === 'function') {
        (res.flush as () => void)();
      }

      // Progress callback that sends updates via SSE
      const progressCallback = (progress: { [key: string]: unknown }) => {
        res.write(
          `data: ${JSON.stringify({
            type: 'progress',
            ...progress,
          })}\n\n`
        );
        if ('flush' in res && typeof res.flush === 'function') {
          (res.flush as () => void)();
        }
      };

      // Handle client disconnect
      req.on('close', () => {
        logger.info(`Model update stream client ${clientId} disconnected`);
      });

      // Start the model update process
      try {
        // Force refresh with progress
        const models =
          await modelFetcher.getAvailableModelsWithProgress(progressCallback);

        // Update the local LLM manager's cache
        const updatedModels = await llmManager.getAvailableModels();

        // Send final success event
        res.write(
          `data: ${JSON.stringify({
            type: SSEEventType.COMPLETED,
            message: `✅ Model update completed! Found ${models.length} models.`,
            models: updatedModels,
          })}\n\n`
        );
      } catch (error) {
        // Send error event
        res.write(
          `data: ${JSON.stringify({
            type: SSEEventType.ERROR,
            message: `❌ Failed to update models: ${error instanceof Error ? error.message : 'Unknown error'}`,
          })}\n\n`
        );
      }

      // Close the connection
      res.end();
    } catch (error) {
      logger.error('Error setting up model update stream:', error);
      res.status(500).json({ error: 'Failed to start model update stream' });
    }
  })
);

/**
 * Update model list (non-streaming version)
 */
router.post(
  '/update-models',
  asyncHandler(async (req, res) => {
    try {
      const { modelFetcher } = await import('../modelFetcher');

      // Force refresh
      const models = await modelFetcher.refreshAvailableModels();
      res.json({ success: true, models, count: models.length });
    } catch (error) {
      logger.error('Error updating models:', error);
      res.status(500).json({ error: 'Failed to update models' });
    }
  })
);

/**
 * Search for models by query
 */
router.post(
  '/search-models',
  asyncHandler(async (req, res) => {
    try {
      const { query, searchType = 'all' } = req.body as {
        query: unknown;
        searchType?: string;
      };

      if (!query || typeof query !== 'string') {
        res
          .status(HTTP_STATUS.BAD_REQUEST)
          .json({ error: 'Query parameter is required and must be a string' });
        return;
      }

      const { modelFetcher } = await import('../modelFetcher');
      const models = await modelFetcher.searchModels(query, searchType);
      res.json({
        success: true,
        models,
        count: models.length,
        query,
        searchType,
      });
    } catch (error) {
      logger.error('Error searching models:', error);

      // Handle specific timeout errors
      if (error instanceof Error && error.message.includes('504')) {
        res.status(504).json({
          error:
            'Search request timed out. HuggingFace API is currently slow. Please try again with a more specific search term.',
        });
      } else if (error instanceof Error && error.message.includes('502')) {
        res.status(502).json({
          error:
            'HuggingFace API is temporarily unavailable. Please try again later.',
        });
      } else {
        res.status(500).json({ error: 'Failed to search models' });
      }
    }
  })
);

/**
 * Clear search cache for a query (debug endpoint)
 */
router.post(
  '/clear-search-cache',
  asyncHandler(async (req, res) => {
    try {
      const { query } = req.body as { query: unknown };

      if (!query || typeof query !== 'string') {
        res
          .status(HTTP_STATUS.BAD_REQUEST)
          .json({ error: 'Query parameter is required and must be a string' });
        return;
      }

      const { modelFetcher } = await import('../modelFetcher');
      modelFetcher.clearSearchCacheForQuery(query);
      res.json({
        success: true,
        message: `Cleared search cache for: ${query}`,
      });
    } catch (error) {
      logger.error('Error clearing search cache:', error);
      res.status(500).json({ error: 'Failed to clear search cache' });
    }
  })
);

/**
 * Download a model
 */
router.post(
  '/download',
  asyncHandler(async (req, res) => {
    try {
      const {
        modelUrl,
        modelName,
        filename,
        size,
        description,
        contextLength,
        parameterCount,
        quantization,
        // Multi-part model fields
        isMultiPart,
        totalParts,
        allPartFiles,
        totalSize,
      } = req.body as {
        modelUrl?: string;
        modelName?: string;
        filename?: string;
        size?: number;
        description?: string;
        contextLength?: number;
        parameterCount?: string;
        quantization?: string;
        isMultiPart?: boolean;
        totalParts?: number;
        allPartFiles?: string[];
        totalSize?: number;
      };

      if (!modelUrl || !filename) {
        res.status(400).json({ error: 'Model URL and filename are required' });
        return;
      }

      const modelInfo = {
        name: modelName ?? filename,
        url: modelUrl,
        filename,
        size: size ?? 0,
        description: description ?? '',
        contextLength,
        parameterCount,
        quantization,
        // Include multi-part fields
        isMultiPart,
        totalParts,
        allPartFiles,
        totalSize,
      };

      // Start download in background
      llmManager
        .downloadModel(modelInfo, (progress, speed) => {
          // Broadcast progress via unified event bus
          sseManager.broadcast('unified-events', {
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
          // Download completed - broadcast completion
          sseManager.broadcast('unified-events', {
            type: 'download-progress',
            data: {
              filename,
              progress: 100,
              speed: '0 B/s',
              isDownloading: false,
              completed: true,
            },
          });

          // Give server time to process the new model file before broadcasting update
          setTimeout(() => {
            sseManager.broadcast('unified-events', {
              type: SSEEventType.MODELS_UPDATED,
              timestamp: Date.now(),
            });
          }, 2000);
        })
        .catch(error => {
          // Download failed or cancelled - broadcast error
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          const isCancelled = errorMessage === 'Download cancelled';
          interface ErrorDetails {
            filename: string;
            progress: number;
            speed: string;
            isDownloading: boolean;
            error: string;
            cancelled: boolean;
            errorType?: string;
            errorMessage?: string;
            huggingFaceUrl?: string;
          }
          const errorDetails: ErrorDetails = {
            filename,
            progress: 0,
            speed: '0 B/s',
            isDownloading: false,
            error: errorMessage,
            cancelled: isCancelled,
          };

          // Add specific handling for HF errors
          if (errorMessage === 'UNAUTHORIZED_HF_TOKEN_REQUIRED') {
            errorDetails.errorType = '401';
            errorDetails.errorMessage =
              'Hugging Face token required. Please add your token in settings.';
          } else if (errorMessage === 'FORBIDDEN_MODEL_ACCESS_REQUIRED') {
            errorDetails.errorType = '403';
            errorDetails.errorMessage =
              'Model access required. Request access on Hugging Face.';
            // Extract model ID from URL for HF link
            const modelId = modelUrl
              .replace('https://huggingface.co/', '')
              .split('/resolve/')[0];
            errorDetails.huggingFaceUrl = `https://huggingface.co/${modelId}`;
          }

          sseManager.broadcast('unified-events', {
            type: 'download-progress',
            data: errorDetails,
          });

          logger.error(`Download failed: ${filename}`, error);
        });

      res.json({ message: 'Download started', filename });
    } catch (error) {
      logger.error('Error starting download:', error);
      res.status(500).json({
        error:
          error instanceof Error ? error.message : 'Failed to start download',
      });
    }
  })
);

/**
 * Cancel a download
 */
router.post(
  '/download/:filename/cancel',
  asyncHandler(async (req, res) => {
    try {
      const { filename } = req.params;

      const cancelled = await llmManager.cancelDownload(filename);
      if (cancelled) {
        res.json({ message: 'Download cancelled', filename });
      } else {
        res
          .status(404)
          .json({ error: 'Download not found or not in progress' });
      }
    } catch (error) {
      logger.error('Error cancelling download:', error);
      res.status(500).json({ error: 'Failed to cancel download' });
    }
  })
);

/**
 * Delete a model
 */
router.delete(
  '/models/:modelId',
  asyncHandler(async (req, res) => {
    try {
      const { modelId } = req.params;

      await llmManager.deleteModel(modelId);

      // Delete associated settings file
      await modelSettingsManager.deleteModelSettings(modelId);

      // Give server time to process the model deletion before broadcasting update
      setTimeout(() => {
        sseManager.broadcast('unified-events', {
          type: SSEEventType.MODELS_UPDATED,
          timestamp: Date.now(),
        });
      }, 2000);

      res.json({ message: 'Model deleted successfully' });
    } catch (error) {
      logger.error('Error deleting model:', error);
      res.status(500).json({
        error:
          error instanceof Error ? error.message : 'Failed to delete model',
      });
    }
  })
);

/**
 * Load a model
 */
router.post(
  '/models/:modelId/load',
  asyncHandler(async (req, res) => {
    try {
      const { modelId } = req.params;

      await llmManager.loadModel(modelId);

      // Broadcast model updates to connected clients
      sseManager.broadcast('unified-events', {
        type: SSEEventType.MODELS_UPDATED,
        timestamp: Date.now(),
      });

      res.json({ message: 'Model loaded successfully' });
    } catch (error) {
      logger.error('Error loading model:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to load model',
      });
    }
  })
);

/**
 * Unload a model
 */
router.post(
  '/models/:modelId/unload',
  asyncHandler(async (req, res) => {
    try {
      const { modelId } = req.params;

      await llmManager.unloadModel(modelId);

      // Broadcast model updates to connected clients
      sseManager.broadcast('unified-events', {
        type: SSEEventType.MODELS_UPDATED,
        timestamp: Date.now(),
      });

      res.json({ message: 'Model unloaded successfully' });
    } catch (error) {
      logger.error('Error unloading model:', error);
      res.status(500).json({
        error:
          error instanceof Error ? error.message : 'Failed to unload model',
      });
    }
  })
);

/**
 * Get model status
 */
router.get(
  '/models/:modelId/status',
  asyncHandler(async (req, res) => {
    try {
      const { modelId } = req.params;

      const status = await llmManager.getModelStatus(modelId);
      const runtimeInfo = await llmManager.getModelRuntimeInfo(modelId);
      res.json({ ...status, runtimeInfo });
    } catch (error) {
      logger.error('Error getting model status:', error);
      res.status(500).json({
        error:
          error instanceof Error ? error.message : 'Failed to get model status',
      });
    }
  })
);

/**
 * Update model loading settings
 */
router.put(
  '/models/:modelId/settings',
  asyncHandler(async (req, res) => {
    try {
      const { modelId } = req.params;
      const settings = req.body as ModelLoadingSettings;

      await llmManager.setModelSettings(modelId, settings);
      res.json({ message: 'Model settings updated successfully' });
    } catch (error) {
      logger.error('Error updating model settings:', error);
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to update model settings',
      });
    }
  })
);

/**
 * Get model loading settings
 */
router.get(
  '/models/:modelId/settings',
  asyncHandler(async (req, res) => {
    try {
      const { modelId } = req.params;

      const settings = await llmManager.getModelSettings(modelId);
      res.json(settings);
    } catch (error) {
      logger.error('Error getting model settings:', error);
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to get model settings',
      });
    }
  })
);

/**
 * Get optimal settings calculated for this model
 */
router.get(
  '/models/:modelId/optimal-settings',
  asyncHandler(async (req, res) => {
    try {
      const { modelId } = req.params;

      const optimalSettings =
        await llmManager.calculateOptimalSettings(modelId);
      res.json(optimalSettings);
    } catch (error) {
      logger.error('Error calculating optimal settings:', error);
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to calculate optimal settings',
      });
    }
  })
);

/**
 * Get all model settings
 */
router.get(
  '/settings',
  asyncHandler(async (req, res) => {
    try {
      const settings = await modelSettingsManager.loadAllModelSettings();
      res.json(settings);
    } catch (error) {
      logger.error('Error getting all model settings:', error);
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to get all model settings',
      });
    }
  })
);

/**
 * Generate response using local model
 */
router.post(
  '/models/:modelId/generate',
  asyncHandler(async (req, res) => {
    try {
      const { modelId } = req.params;
      const { messages, temperature, maxTokens } = req.body as {
        messages: unknown;
        temperature?: number;
        maxTokens?: number;
      };

      if (!messages || !Array.isArray(messages)) {
        res.status(400).json({ error: 'Messages array is required' });
        return;
      }

      const response = await llmManager.generateResponse(
        modelId,
        messages as Array<{ role: string; content: string }>,
        {
          temperature,
          maxTokens,
        }
      );

      res.json({ response });
    } catch (error) {
      logger.error('Error generating response:', error);
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to generate response',
      });
    }
  })
);

/**
 * Generate streaming response using local model
 */
router.post(
  '/models/:modelId/generate-stream',
  asyncHandler(async (req, res) => {
    try {
      const { modelId } = req.params;
      const { messages, temperature, maxTokens } = req.body as {
        messages: unknown;
        temperature?: number;
        maxTokens?: number;
      };

      if (!messages || !Array.isArray(messages)) {
        res.status(400).json({ error: 'Messages array is required' });
        return;
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const generator = llmManager.generateStreamResponse(
        modelId,
        messages as Array<{ role: string; content: string }>,
        {
          temperature,
          maxTokens,
        }
      );

      for await (const chunk of generator) {
        res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      logger.error('Error generating streaming response:', error);
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to generate streaming response',
      });
    }
  })
);

export default router;
