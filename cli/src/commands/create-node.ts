/**
 * Create Node Command
 *
 * Creates a new mind map node with optional parent relationship.
 */

import { httpClient } from '../utils/http-client.js';
import { ensureAppIsRunning } from '../utils/health-check.js';
import { formatSystemReminder } from '../utils/system-reminder.js';

interface CreateNodeOptions {
  parent?: string;
  format: string;
}

interface CreateNodeResponse {
  success: boolean;
  nodeId: string;
  label: string;
  parentId?: string;
  timestamp: number;
}

export async function createNode(label: string, options: CreateNodeOptions): Promise<void> {
  // Check if app is running
  await ensureAppIsRunning();

  // Execute HTTP POST to create node
  const response = await httpClient.post<CreateNodeResponse>('/api/cli/mindmap/create-node', {
    label,
    parentId: options.parent
  });

  // Output based on format
  if (options.format === 'json') {
    console.log(JSON.stringify(response, null, 2));
  } else {
    console.log(`✓ Node created: ${response.nodeId}`);

    if (options.parent) {
      console.log(`  Connected to parent: ${options.parent}`);
    }

    // Emit system-reminder for AI agents
    const reminder = formatSystemReminder({
      operation: 'Node creation',
      entityId: response.nodeId,
      nextSteps: [
        `Add child nodes: mindstrike create-node "<name>" --parent ${response.nodeId}`,
        `Edit node content: mindstrike edit-node ${response.nodeId}`,
        `Connect to other nodes: mindstrike connect-nodes ${response.nodeId} <target-id>`,
        'View mind map: mindstrike get-mindmap --format=json'
      ]
    });

    console.log('\n' + reminder);
  }
}
