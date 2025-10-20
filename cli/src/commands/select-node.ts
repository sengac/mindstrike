/**
 * Select Node Command
 *
 * Selects a mind map node and updates UI in real-time.
 */

import { httpClient } from '../utils/http-client.js';
import { ensureAppIsRunning } from '../utils/health-check.js';
import { formatSystemReminder } from '../utils/system-reminder.js';

interface SelectNodeOptions {
  format: string;
}

interface SelectNodeResponse {
  success: boolean;
  nodeId: string;
  timestamp: number;
}

export async function selectNode(nodeId: string, options: SelectNodeOptions): Promise<void> {
  // Check if app is running
  await ensureAppIsRunning();

  // Execute HTTP POST to select node
  const response = await httpClient.post<SelectNodeResponse>('/api/cli/mindmap/select-node', {
    nodeId
  });

  // Output based on format
  if (options.format === 'json') {
    console.log(JSON.stringify(response, null, 2));
  } else {
    console.log(`✓ Selected node: ${response.nodeId}`);

    // Emit system-reminder for AI agents
    const reminder = formatSystemReminder({
      operation: 'Node selection',
      entityId: response.nodeId,
      nextSteps: [
        `View node details: mindstrike get-node ${response.nodeId}`,
        `Edit node content: mindstrike edit-node ${response.nodeId}`,
        `Create child node: mindstrike create-node "<label>" --parent ${response.nodeId}`,
        'Query full mind map: mindstrike get-mindmap --format=json'
      ]
    });

    console.log('\n' + reminder);
  }
}
