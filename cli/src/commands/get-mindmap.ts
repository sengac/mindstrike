/**
 * Get Mindmap Command
 *
 * Queries mind map state and returns JSON structure for AI context injection.
 */

import { httpClient } from '../utils/http-client.js';
import { ensureAppIsRunning } from '../utils/health-check.js';

interface GetMindmapOptions {
  format: string;
}

interface MindMapNode {
  id: string;
  label: string;
  position: {
    x: number;
    y: number;
  };
  data?: unknown;
}

interface MindMapEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

interface MindMapResponse {
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  metadata?: {
    title?: string;
    created?: string;
    modified?: string;
  };
}

export async function getMindmap(options: GetMindmapOptions): Promise<void> {
  // Check if app is running
  await ensureAppIsRunning();

  // Execute HTTP GET to query mindmap
  const response = await httpClient.get<MindMapResponse>('/api/cli/mindmap/query');

  // Always output as JSON (this is for AI context injection)
  if (options.format === 'json') {
    console.log(JSON.stringify(response, null, 2));
  } else {
    // Even in text format, output parseable JSON
    console.log(JSON.stringify(response, null, 2));
  }
}
