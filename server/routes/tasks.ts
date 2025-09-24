import express from 'express';
import { sseManager } from '../sseManager.js';
import { logger } from '../logger.js';

const router = express.Router();

/**
 * SSE endpoint for task progress updates
 */
router.get('/stream/:workflowId', (req, res) => {
  const { workflowId } = req.params;
  const clientId = `task-${workflowId}-${Date.now()}`;
  const topic = `tasks-${workflowId}`;

  logger.info('Task SSE client connected', { clientId, workflowId, topic });

  try {
    sseManager.addClient(clientId, res, topic);
  } catch (error) {
    logger.error('Failed to add task SSE client:', error);
    res.status(500).json({ error: 'Failed to establish SSE connection' });
  }
});

/**
 * Broadcast task update to all clients listening to a workflow
 */
export const broadcastTaskUpdate = (
  workflowId: string,
  data: Record<string, unknown>
) => {
  sseManager.broadcast('unified-events', {
    ...data,
    workflowId: workflowId, // Include workflowId for client filtering
    timestamp: Date.now(),
  });
};

export default router;
