/**
 * Send Message Command
 *
 * Sends a message to active chat thread and streams AI response in real-time.
 */

import { httpClient } from '../utils/http-client.js';
import { ensureAppIsRunning } from '../utils/health-check.js';
import { formatSystemReminder } from '../utils/system-reminder.js';
import { sseClient } from '../utils/sse-client.js';

interface SendMessageOptions {
  format: string;
}

interface SendMessageResponse {
  success: boolean;
  messageId: string;
  threadId: string;
  timestamp: number;
}

export async function sendMessage(message: string, options: SendMessageOptions): Promise<void> {
  // Check if app is running
  await ensureAppIsRunning();

  const clientId = `cli-${Date.now()}`;

  // Connect to SSE for streaming response (synchronous mode)
  sseClient.connect(clientId);

  let responseChunks: string[] = [];
  let isComplete = false;

  // Subscribe to message events
  sseClient.subscribe('message', (event) => {
    const data = event.data as { threadId: string; chunk: string; complete?: boolean };

    if (options.format === 'json') {
      // Store chunks for JSON output
      responseChunks.push(data.chunk);
    } else {
      // Stream to console in real-time
      process.stdout.write(data.chunk);
    }

    if (data.complete) {
      isComplete = true;
    }
  });

  // Send message via HTTP POST
  const response = await httpClient.post<SendMessageResponse>('/api/cli/chat/send-message', {
    message,
    clientId
  });

  // Wait for complete response (synchronous mode)
  await new Promise<void>((resolve) => {
    const checkComplete = setInterval(() => {
      if (isComplete) {
        clearInterval(checkComplete);
        resolve();
      }
    }, 100);

    // Timeout after 30 seconds
    setTimeout(() => {
      clearInterval(checkComplete);
      resolve();
    }, 30000);
  });

  // Close SSE connection
  sseClient.close();

  // Output based on format
  if (options.format === 'json') {
    console.log(
      JSON.stringify(
        {
          success: response.success,
          messageId: response.messageId,
          threadId: response.threadId,
          response: responseChunks.join('')
        },
        null,
        2
      )
    );
  } else {
    console.log('\n');

    // Emit system-reminder for AI agents
    const reminder = formatSystemReminder({
      operation: 'Message sent',
      entityId: response.messageId,
      nextSteps: [
        'Continue conversation: mindstrike send-message "<follow-up>"',
        `View thread history: mindstrike get-thread ${response.threadId}`,
        'Create new thread: mindstrike create-thread "<topic>"',
        'Query mind map for context: mindstrike get-mindmap --format=json'
      ]
    });

    console.log(reminder);
  }
}
