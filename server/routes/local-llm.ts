import { Router } from 'express';
import { getLocalLLMManager } from '../local-llm-singleton.js';
import { sseManager } from '../sse-manager.js';

const router = Router();
const llmManager = getLocalLLMManager();

// SSE connections for download progress
const sseConnections = new Map<string, Set<any>>();

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
 * Get available models for download
 */
router.get('/available-models', (req, res) => {
  try {
    const models = llmManager.getAvailableModels();
    res.json(models);
  } catch (error) {
    console.error('Error getting available models:', error);
    res.status(500).json({ error: 'Failed to get available models' });
  }
});

/**
 * Download a model
 */
router.post('/download', async (req, res) => {
  const { modelUrl, modelName, filename, size, description, modelType, contextLength, parameterCount, quantization } = req.body;
  
  if (!modelUrl || !filename) {
    return res.status(400).json({ error: 'Model URL and filename are required' });
  }

  try {
    const modelInfo = {
      name: modelName || filename,
      url: modelUrl,
      filename,
      size,
      description,
      modelType: modelType || 'unknown',
      contextLength,
      parameterCount,
      quantization
    };

    // Start download in background
    llmManager.downloadModel(modelInfo, (progress, speed) => {
      // Notify all SSE connections for this filename
      const connections = sseConnections.get(filename);
      if (connections) {
        const data = JSON.stringify({ progress, speed, isDownloading: true });
        connections.forEach(res => {
          try {
            res.write(`data: ${data}\n\n`);
          } catch (error) {
            // Connection closed, remove it
            connections.delete(res);
          }
        });
      }
    }).then(() => {
      // Download completed
      const connections = sseConnections.get(filename);
      if (connections) {
        const data = JSON.stringify({ progress: 100, speed: '0 B/s', isDownloading: false, completed: true });
        connections.forEach(res => {
          try {
            res.write(`data: ${data}\n\n`);
            res.end();
          } catch (error) {
            // Connection already closed
          }
        });
        sseConnections.delete(filename);
      }
      console.log(`Download completed: ${filename}`);
      
      // Broadcast model updates to connected clients since new model is available
      sseManager.broadcast('model-updates', {
        type: 'models-updated',
        timestamp: Date.now()
      });
    }).catch((error) => {
      // Download failed or cancelled
      const connections = sseConnections.get(filename);
      if (connections) {
        const isCancelled = error.message === 'Download cancelled';
        const data = JSON.stringify({ 
          progress: 0, 
          speed: '0 B/s', 
          isDownloading: false, 
          error: error.message,
          cancelled: isCancelled
        });
        connections.forEach(res => {
          try {
            res.write(`data: ${data}\n\n`);
            res.end();
          } catch (error) {
            // Connection already closed
          }
        });
        sseConnections.delete(filename);
      }
      console.error(`Download failed: ${filename}`, error);
    });

    res.json({ message: 'Download started', filename });
  } catch (error) {
    console.error('Error starting download:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to start download' });
  }
});

/**
 * Get download progress (legacy endpoint)
 */
router.get('/download-progress/:filename', (req, res) => {
  const { filename } = req.params;
  const progressInfo = llmManager.getDownloadProgress(filename);
  
  res.json({
    progress: progressInfo.progress,
    isDownloading: progressInfo.isDownloading,
    speed: progressInfo.speed,
    completed: !progressInfo.isDownloading && progressInfo.progress === 0
  });
});

/**
 * SSE endpoint for real-time download progress
 */
router.get('/download-progress-stream/:filename', (req, res) => {
  const { filename } = req.params;
  
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Add this connection to the set for this filename
  if (!sseConnections.has(filename)) {
    sseConnections.set(filename, new Set());
  }
  sseConnections.get(filename)!.add(res);
  
  // Send initial status
  const progressInfo = llmManager.getDownloadProgress(filename);
  const initialData = JSON.stringify({
    progress: progressInfo.progress,
    speed: progressInfo.speed || '0 B/s',
    isDownloading: progressInfo.isDownloading
  });
  res.write(`data: ${initialData}\n\n`);
  
  // Handle client disconnect
  req.on('close', () => {
    const connections = sseConnections.get(filename);
    if (connections) {
      connections.delete(res);
      if (connections.size === 0) {
        sseConnections.delete(filename);
      }
    }
  });
});

/**
 * Cancel a download
 */
router.post('/download/:filename/cancel', (req, res) => {
  const { filename } = req.params;
  
  try {
    const cancelled = llmManager.cancelDownload(filename);
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
    res.json({ message: 'Model deleted successfully' });
  } catch (error) {
    console.error('Error deleting model:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to delete model' });
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
    sseManager.broadcast('model-updates', {
      type: 'models-updated',
      timestamp: Date.now()
    });
    
    res.json({ message: 'Model loaded successfully' });
  } catch (error) {
    console.error('Error loading model:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load model' });
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
    sseManager.broadcast('model-updates', {
      type: 'models-updated',
      timestamp: Date.now()
    });
    
    res.json({ message: 'Model unloaded successfully' });
  } catch (error) {
    console.error('Error unloading model:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to unload model' });
  }
});

/**
 * Get model status
 */
router.get('/models/:modelId/status', async (req, res) => {
  const { modelId } = req.params;
  
  try {
    const status = await llmManager.getModelStatus(modelId);
    res.json(status);
  } catch (error) {
    console.error('Error getting model status:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to get model status' });
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
      maxTokens
    });
    
    res.json({ response });
  } catch (error) {
    console.error('Error generating response:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to generate response' });
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
      maxTokens
    });

    for await (const chunk of generator) {
      res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('Error generating streaming response:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to generate streaming response' });
  }
});



export default router;
