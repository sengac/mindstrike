/**
 * Health Check Utility
 *
 * Checks if MindStrike app is running by pinging the health endpoint.
 */

import { httpClient } from './http-client.js';

export async function checkAppHealth(): Promise<boolean> {
  try {
    await httpClient.get('/api/health');
    return true;
  } catch {
    return false;
  }
}

export async function ensureAppIsRunning(): Promise<void> {
  const isRunning = await checkAppHealth();

  if (!isRunning) {
    throw new Error(
      'MindStrike app is not running. Please start the app first.\n' +
        'Hint: Run the MindStrike desktop app or start the server with: npm run dev'
    );
  }
}
