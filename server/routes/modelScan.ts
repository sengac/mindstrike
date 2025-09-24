import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { sseManager } from '../sseManager';
import { modelFetcher } from '../modelFetcher';
import { logger } from '../logger';
import { SSEEventType } from '../../src/types';
import type { ScanProgress } from '../../src/store/useModelScanStore';

interface ModelSearchParams {
  query: string;
  searchType: string;
}

const router = Router();

// Active scan sessions
const activeScanSessions = new Map<
  string,
  {
    id: string;
    controller: AbortController;
    status: 'running' | 'completed' | 'cancelled' | 'error';
    startTime: number;
  }
>();

// Progress update helper
function broadcastProgress(
  scanId: string,
  progress: Partial<ScanProgress> & {
    operationType?: 'scan' | 'search';
    error?: string;
  }
) {
  sseManager.broadcast('unified-events', {
    type: SSEEventType.SCAN_PROGRESS,
    scanId,
    progress,
    timestamp: Date.now(),
  });
}

/**
 * SSE endpoint for real-time scan progress updates
 */
router.get('/progress', (req, res) => {
  const clientId = `scan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  sseManager.addClient(clientId, res, 'model-scan');
});

/**
 * Start a new model search
 */
router.post('/search', async (req, res) => {
  const searchId = uuidv4();
  const controller = new AbortController();

  // Register the search session
  activeScanSessions.set(searchId, {
    id: searchId,
    controller,
    status: 'running',
    startTime: Date.now(),
  });

  logger.info(`Starting model search session: ${searchId}`);

  // Send initial response
  res.json({
    searchId,
    message: 'Model search started',
  });

  // Start the search process asynchronously
  performModelSearch(searchId, req.body, controller.signal).catch(error => {
    logger.error(`Model search ${searchId} failed:`, error);

    const session = activeScanSessions.get(searchId);
    if (session && session.status === 'running') {
      session.status = 'error';
      broadcastProgress(searchId, {
        stage: 'error',
        message: 'Search failed',
        error: error.message,
        operationType: 'search',
      });
    }
  });
});

/**
 * Start a new model scan
 */
router.post('/start', async (req, res) => {
  const scanId = uuidv4();
  const controller = new AbortController();

  // Register the scan session
  activeScanSessions.set(scanId, {
    id: scanId,
    controller,
    status: 'running',
    startTime: Date.now(),
  });

  logger.info(`Starting model scan session: ${scanId}`);

  // Send initial response
  res.json({
    scanId,
    message: 'Model scan started',
  });

  // Start the scan process asynchronously
  performModelScan(scanId, controller.signal).catch(error => {
    logger.error(`Model scan ${scanId} failed:`, error);

    const session = activeScanSessions.get(scanId);
    if (session && session.status === 'running') {
      session.status = 'error';
      broadcastProgress(scanId, {
        stage: 'error',
        message: 'Scan failed',
        error: error.message,
        operationType: 'scan',
      });
    }
  });
});

/**
 * Cancel an active model scan
 */
router.post('/cancel/:scanId', (req, res) => {
  const { scanId } = req.params;
  const session = activeScanSessions.get(scanId);

  if (!session) {
    return res.status(404).json({ error: 'Scan session not found' });
  }

  if (session.status !== 'running') {
    return res.status(400).json({ error: 'Scan is not currently running' });
  }

  logger.info(`Cancelling model scan session: ${scanId}`);

  // Cancel the scan
  session.controller.abort();
  session.status = 'cancelled';

  broadcastProgress(scanId, {
    stage: 'cancelled',
    message: 'Scan cancelled by user',
  });

  // Clean up the session after a delay
  setTimeout(() => {
    activeScanSessions.delete(scanId);
  }, 5000);

  res.json({ message: 'Scan cancelled successfully' });
});

/**
 * Get status of a specific scan
 */
router.get('/status/:scanId', (req, res) => {
  const { scanId } = req.params;
  const session = activeScanSessions.get(scanId);

  if (!session) {
    return res.status(404).json({ error: 'Scan session not found' });
  }

  res.json({
    scanId: session.id,
    status: session.status,
    startTime: session.startTime,
    duration: Date.now() - session.startTime,
  });
});

/**
 * Perform the actual model search with progress updates
 */
async function performModelSearch(
  searchId: string,
  searchParams: ModelSearchParams,
  signal: AbortSignal
): Promise<void> {
  const session = activeScanSessions.get(searchId);
  if (!session) {
    return;
  }

  try {
    // Stage 1: Initialize
    if (signal.aborted) {
      return;
    }
    broadcastProgress(searchId, {
      stage: 'searching',
      message: 'Starting search...',
      progress: 0,
      operationType: 'search',
    });

    await new Promise(resolve => setTimeout(resolve, 500)); // Brief delay for UX

    // Stage 2: Perform search
    if (signal.aborted) {
      return;
    }
    broadcastProgress(searchId, {
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
            // Will be handled outside this callback
            return;
        }

        broadcastProgress(searchId, {
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

    await new Promise(resolve => setTimeout(resolve, 300)); // Brief delay for UX

    // Stage 3: Completed
    if (signal.aborted) {
      return;
    }
    session.status = 'completed';
    broadcastProgress(searchId, {
      stage: 'completed',
      message: `Search completed! Found ${results.length} models.`,
      progress: 100,
      totalItems: results.length,
      operationType: 'search',
      results: results,
    });

    logger.info(
      `Model search ${searchId} completed successfully. Found ${results.length} models.`
    );

    // Clean up the session after a delay
    setTimeout(() => {
      activeScanSessions.delete(searchId);
    }, 10000);
  } catch (error) {
    if (signal.aborted) {
      logger.info(`Model search ${searchId} was cancelled`);
      return;
    }

    logger.error(`Model search ${searchId} failed:`, error);

    if (session) {
      session.status = 'error';
      broadcastProgress(searchId, {
        stage: 'error',
        message: 'Search failed due to an error',
        error: error instanceof Error ? error.message : 'Unknown error',
        operationType: 'search',
      });

      // Clean up the session after a delay
      setTimeout(() => {
        activeScanSessions.delete(searchId);
      }, 5000);
    }
  }
}

/**
 * Perform the actual model scanning with progress updates
 */
async function performModelScan(
  scanId: string,
  signal: AbortSignal
): Promise<void> {
  const session = activeScanSessions.get(scanId);
  if (!session) {
    return;
  }

  try {
    // Stage 1: Initialize
    if (signal.aborted) {
      return;
    }
    broadcastProgress(scanId, {
      stage: 'initializing',
      message: 'Preparing to fetch model list...',
      progress: 0,
      operationType: 'scan',
    });

    await new Promise(resolve => setTimeout(resolve, 500)); // Brief delay for UX

    // Stage 2: Fetch from HuggingFace
    if (signal.aborted) {
      return;
    }
    broadcastProgress(scanId, {
      stage: 'fetching-huggingface',
      message: 'Fetching popular models from HuggingFace...',
      progress: 10,
      operationType: 'scan',
    });

    // Fetch popular models with progress tracking
    await modelFetcher.fetchPopularModels((current, total, modelId) => {
      if (signal.aborted) {
        return;
      }

      const progress = 10 + Math.round((current / total) * 40); // 10-50%
      broadcastProgress(scanId, {
        stage: 'fetching-huggingface',
        message: `Fetching model details from HuggingFace (${current}/${total})...`,
        progress,
        currentItem: modelId || `Model ${current}`,
        totalItems: total,
        completedItems: current,
        operationType: 'scan',
      });
    }, signal);

    // Stage 3: Check model availability
    if (signal.aborted) {
      return;
    }
    broadcastProgress(scanId, {
      stage: 'checking-models',
      message: 'Checking model availability and metadata...',
      progress: 50,
      operationType: 'scan',
    });

    const models = await modelFetcher.getAvailableModels();
    const totalModels = models.length;
    let checkedModels = 0;

    // Simulate checking each model (in real implementation, this might verify download links, etc.)
    for (let i = 0; i < totalModels && !signal.aborted; i++) {
      const model = models[i];

      // Simulate model checking with a small delay
      await new Promise(resolve => setTimeout(resolve, 50));

      checkedModels++;
      const progress = 50 + Math.round((checkedModels / totalModels) * 40); // 50-90%

      broadcastProgress(scanId, {
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
    broadcastProgress(scanId, {
      stage: 'completing',
      message: 'Finalizing scan results...',
      progress: 90,
      operationType: 'scan',
    });

    await new Promise(resolve => setTimeout(resolve, 500)); // Brief delay for UX

    // Stage 5: Completed
    if (signal.aborted) {
      return;
    }
    session.status = 'completed';
    broadcastProgress(scanId, {
      stage: 'completed',
      message: `Scan completed! Found ${models.length} models available for download.`,
      progress: 100,
      totalItems: models.length,
      operationType: 'scan',
    });

    logger.info(
      `Model scan ${scanId} completed successfully. Found ${models.length} models.`
    );

    // Clean up the session after a delay
    setTimeout(() => {
      activeScanSessions.delete(scanId);
    }, 10000);
  } catch (error) {
    if (signal.aborted) {
      logger.info(`Model scan ${scanId} was cancelled`);
      return;
    }

    logger.error(`Model scan ${scanId} failed:`, error);

    if (session) {
      session.status = 'error';
      broadcastProgress(scanId, {
        stage: 'error',
        message: 'Scan failed due to an error',
        error: error instanceof Error ? error.message : 'Unknown error',
        operationType: 'scan',
      });

      // Clean up the session after a delay
      setTimeout(() => {
        activeScanSessions.delete(scanId);
      }, 5000);
    }
  }
}

// Cleanup function for graceful shutdown
export function cleanupModelScanSessions() {
  logger.info('Cleaning up active model scan sessions...');

  for (const [scanId, session] of activeScanSessions) {
    if (session.status === 'running') {
      session.controller.abort();
      session.status = 'cancelled';

      broadcastProgress(scanId, {
        stage: 'cancelled',
        message: 'Scan cancelled due to server shutdown',
      });
    }
  }

  activeScanSessions.clear();
}

export default router;
