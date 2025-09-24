import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import fs from 'fs';
import os from 'os';
import { getLocalLLMManager } from '../localLlmSingleton.js';
import { sseManager } from '../sseManager.js';
import { getLocalModelsDirectory } from '../utils/settingsDirectory.js';
import { modelSettingsManager } from '../utils/modelSettingsManager.js';
import { SSEEventType } from '../../src/types.js';
import {
  HTTP_STATUS,
  TIMING,
  PROGRESS,
  RANDOM_STRING,
} from '../llm/constants.js';

const router = Router();
const llmManager = getLocalLLMManager();

/**
 * Get all local models
 */
router.get('/models', async (req, res) => {
  try {
    const models = await llmManager.getLocalModels();
    res.json(models);
  } catch (error) {
    console.error('Error getting local models:', error);
    res.status(500).json({ error: 'Failed to get local models' });
  }
});

/**
 * Get cached available models only (no fetch if cache is empty)
 */
router.get('/available-models-cached', async (req, res) => {
  try {
    const { modelFetcher } = await import('../modelFetcher.js');
    const models = modelFetcher.getCachedModels();
    res.json(models);
  } catch (error) {
    console.error('Error getting cached models:', error);
    res.status(500).json({ error: 'Failed to get cached models' });
  }
});

/**
 * Get available models for download (with fallback to fetch)
 */
router.get('/available-models', async (req, res) => {
  try {
    const models = await llmManager.getAvailableModels();
    res.json(models);
  } catch (error) {
    console.error('Error getting available models:', error);
    res.status(500).json({ error: 'Failed to get available models' });
  }
});

/**
 * Refresh available models cache
 */
router.post('/refresh-models', async (req, res) => {
  try {
    const { modelFetcher } = await import('../modelFetcher.js');
    const models = await modelFetcher.refreshAvailableModels(); // Force refresh
    res.json({ success: true, models });
  } catch (error) {
    console.error('Error refreshing models:', error);
    res.status(500).json({ error: 'Failed to refresh models' });
  }
});

/**
 * Open models directory in file explorer
 */
router.post('/open-models-directory', async (req, res) => {
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
        console.error('Error opening models directory:', error);
        return res
          .status(500)
          .json({ error: 'Failed to open models directory' });
      }
      res.json({ success: true, directory: modelsDir });
    });
  } catch (error) {
    console.error('Error opening models directory:', error);
    res.status(500).json({ error: 'Failed to open models directory' });
  }
});

/**
 * Clear accessibility cache and recheck all models
 */
router.post('/refresh-accessibility', async (req, res) => {
  try {
    const { modelFetcher } = await import('../modelFetcher.js');
    modelFetcher.clearAccessibilityCache();
    const models = await modelFetcher.refreshAvailableModels(); // Force refresh
    res.json({ success: true, models });
  } catch (error) {
    console.error('Error refreshing accessibility:', error);
    res.status(500).json({ error: 'Failed to refresh accessibility' });
  }
});

/**
 * Set Hugging Face token
 */
router.post('/hf-token', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Token is required' });
    }

    const { modelFetcher } = await import('../modelFetcher.js');
    await modelFetcher.setHuggingFaceToken(token);

    res.json({
      success: true,
      message: 'Hugging Face token saved. Rechecking gated models...',
    });
  } catch (error) {
    console.error('Error setting Hugging Face token:', error);
    res.status(500).json({ error: 'Failed to save Hugging Face token' });
  }
});

/**
 * Remove Hugging Face token
 */
router.delete('/hf-token', async (req, res) => {
  try {
    const { modelFetcher } = await import('../modelFetcher.js');
    await modelFetcher.removeHuggingFaceToken();

    res.json({ success: true, message: 'Hugging Face token removed' });
  } catch (error) {
    console.error('Error removing Hugging Face token:', error);
    res.status(500).json({ error: 'Failed to remove Hugging Face token' });
  }
});

/**
 * Get Hugging Face token
 */
router.get('/hf-token', async (req, res) => {
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
    console.error('Error reading Hugging Face token:', error);
    res.status(404).json({ error: 'Token not found' });
  }
});

/**
 * Check if Hugging Face token is set
 */
router.get('/hf-token/status', async (req, res) => {
  try {
    const { modelFetcher } = await import('../modelFetcher.js');
    const hasToken = modelFetcher.hasHuggingFaceToken();

    res.json({ hasToken });
  } catch (error) {
    console.error('Error checking Hugging Face token status:', error);
    res.status(500).json({ error: 'Failed to check token status' });
  }
});

/**
 * Update model list with real-time progress via SSE
 */
router.get('/update-models-stream', async (req: Request, res: Response) => {
  try {
    const { modelFetcher } = await import('../modelFetcher.js');

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
      res.flush();
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
        res.flush();
      }
    };

    // Handle client disconnect
    req.on('close', () => {
      console.log(`Model update stream client ${clientId} disconnected`);
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
    console.error('Error setting up model update stream:', error);
    res.status(500).json({ error: 'Failed to start model update stream' });
  }
});

/**
 * Update model list (non-streaming version)
 */
router.post('/update-models', async (req, res) => {
  try {
    const { modelFetcher } = await import('../modelFetcher.js');

    // Force refresh
    const models = await modelFetcher.refreshAvailableModels();
    res.json({ success: true, models, count: models.length });
  } catch (error) {
    console.error('Error updating models:', error);
    res.status(500).json({ error: 'Failed to update models' });
  }
});

/**
 * Search for models by query
 */
router.post('/search-models', async (req, res) => {
  try {
    const { query, searchType = 'all' } = req.body;

    if (!query || typeof query !== 'string') {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json({ error: 'Query parameter is required and must be a string' });
    }

    const { modelFetcher } = await import('../modelFetcher.js');
    const models = await modelFetcher.searchModels(query, searchType);
    res.json({
      success: true,
      models,
      count: models.length,
      query,
      searchType,
    });
  } catch (error) {
    console.error('Error searching models:', error);

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
});

/**
 * Clear search cache for a query (debug endpoint)
 */
router.post('/clear-search-cache', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || typeof query !== 'string') {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json({ error: 'Query parameter is required and must be a string' });
    }

    const { modelFetcher } = await import('../modelFetcher.js');
    modelFetcher.clearSearchCacheForQuery(query);
    res.json({ success: true, message: `Cleared search cache for: ${query}` });
  } catch (error) {
    console.error('Error clearing search cache:', error);
    res.status(500).json({ error: 'Failed to clear search cache' });
  }
});

/**
 * Download a model
 */
router.post('/download', async (req, res) => {
  const {
    modelUrl,
    modelName,
    filename,
    size,
    description,
    contextLength,
    parameterCount,
    quantization,
  } = req.body;

  if (!modelUrl || !filename) {
    return res
      .status(400)
      .json({ error: 'Model URL and filename are required' });
  }

  try {
    const modelInfo = {
      name: modelName || filename,
      url: modelUrl,
      filename,
      size,
      description,
      contextLength,
      parameterCount,
      quantization,
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
        const isCancelled = error.message === 'Download cancelled';
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
          error: error.message,
          cancelled: isCancelled,
        };

        // Add specific handling for HF errors
        if (error.message === 'UNAUTHORIZED_HF_TOKEN_REQUIRED') {
          errorDetails.errorType = '401';
          errorDetails.errorMessage =
            'Hugging Face token required. Please add your token in settings.';
        } else if (error.message === 'FORBIDDEN_MODEL_ACCESS_REQUIRED') {
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

        console.error(`Download failed: ${filename}`, error);
      });

    res.json({ message: 'Download started', filename });
  } catch (error) {
    console.error('Error starting download:', error);
    res.status(500).json({
      error:
        error instanceof Error ? error.message : 'Failed to start download',
    });
  }
});

/**
 * Cancel a download
 */
router.post('/download/:filename/cancel', async (req, res) => {
  const { filename } = req.params;

  try {
    const cancelled = await llmManager.cancelDownload(filename);
    if (cancelled) {
      res.json({ message: 'Download cancelled', filename });
    } else {
      res.status(404).json({ error: 'Download not found or not in progress' });
    }
  } catch (error) {
    console.error('Error cancelling download:', error);
    res.status(500).json({ error: 'Failed to cancel download' });
  }
});

/**
 * Delete a model
 */
router.delete('/models/:modelId', async (req, res) => {
  const { modelId } = req.params;

  try {
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
    console.error('Error deleting model:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to delete model',
    });
  }
});

/**
 * Load a model
 */
router.post('/models/:modelId/load', async (req, res) => {
  const { modelId } = req.params;

  try {
    await llmManager.loadModel(modelId);

    // Broadcast model updates to connected clients
    sseManager.broadcast('unified-events', {
      type: SSEEventType.MODELS_UPDATED,
      timestamp: Date.now(),
    });

    res.json({ message: 'Model loaded successfully' });
  } catch (error) {
    console.error('Error loading model:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to load model',
    });
  }
});

/**
 * Unload a model
 */
router.post('/models/:modelId/unload', async (req, res) => {
  const { modelId } = req.params;

  try {
    await llmManager.unloadModel(modelId);

    // Broadcast model updates to connected clients
    sseManager.broadcast('unified-events', {
      type: SSEEventType.MODELS_UPDATED,
      timestamp: Date.now(),
    });

    res.json({ message: 'Model unloaded successfully' });
  } catch (error) {
    console.error('Error unloading model:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to unload model',
    });
  }
});

/**
 * Get model status
 */
router.get('/models/:modelId/status', async (req, res) => {
  const { modelId } = req.params;

  try {
    const status = await llmManager.getModelStatus(modelId);
    const runtimeInfo = await llmManager.getModelRuntimeInfo(modelId);
    res.json({ ...status, runtimeInfo });
  } catch (error) {
    console.error('Error getting model status:', error);
    res.status(500).json({
      error:
        error instanceof Error ? error.message : 'Failed to get model status',
    });
  }
});

/**
 * Update model loading settings
 */
router.put('/models/:modelId/settings', async (req, res) => {
  const { modelId } = req.params;
  const settings = req.body;

  try {
    await llmManager.setModelSettings(modelId, settings);
    res.json({ message: 'Model settings updated successfully' });
  } catch (error) {
    console.error('Error updating model settings:', error);
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Failed to update model settings',
    });
  }
});

/**
 * Get model loading settings
 */
router.get('/models/:modelId/settings', async (req, res) => {
  const { modelId } = req.params;

  try {
    const settings = await llmManager.getModelSettings(modelId);
    res.json(settings);
  } catch (error) {
    console.error('Error getting model settings:', error);
    res.status(500).json({
      error:
        error instanceof Error ? error.message : 'Failed to get model settings',
    });
  }
});

/**
 * Get optimal settings calculated for this model
 */
router.get('/models/:modelId/optimal-settings', async (req, res) => {
  const { modelId } = req.params;

  try {
    const optimalSettings = await llmManager.calculateOptimalSettings(modelId);
    res.json(optimalSettings);
  } catch (error) {
    console.error('Error calculating optimal settings:', error);
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Failed to calculate optimal settings',
    });
  }
});

/**
 * Get all model settings
 */
router.get('/settings', async (req, res) => {
  try {
    const settings = await modelSettingsManager.loadAllModelSettings();
    res.json(settings);
  } catch (error) {
    console.error('Error getting all model settings:', error);
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Failed to get all model settings',
    });
  }
});

/**
 * Generate response using local model
 */
router.post('/models/:modelId/generate', async (req, res) => {
  const { modelId } = req.params;
  const { messages, temperature, maxTokens } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array is required' });
  }

  try {
    const response = await llmManager.generateResponse(modelId, messages, {
      temperature,
      maxTokens,
    });

    res.json({ response });
  } catch (error) {
    console.error('Error generating response:', error);
    res.status(500).json({
      error:
        error instanceof Error ? error.message : 'Failed to generate response',
    });
  }
});

/**
 * Generate streaming response using local model
 */
router.post('/models/:modelId/generate-stream', async (req, res) => {
  const { modelId } = req.params;
  const { messages, temperature, maxTokens } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array is required' });
  }

  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const generator = llmManager.generateStreamResponse(modelId, messages, {
      temperature,
      maxTokens,
    });

    for await (const chunk of generator) {
      res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('Error generating streaming response:', error);
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Failed to generate streaming response',
    });
  }
});

export default router;
