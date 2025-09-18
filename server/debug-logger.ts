import { sseManager } from './sse-manager.js';
import { logger } from './logger.js';

interface DebugEntry {
  entryType: 'request' | 'response' | 'error';
  title: string;
  content: string;
  duration?: number;
  model?: string;
  endpoint?: string;
  tokensPerSecond?: number;
  totalTokens?: number;
}

class ServerDebugLogger {
  private broadcastDebugEntry(entry: DebugEntry) {
    try {
      const debugData = {
        type: 'debug-entry',
        timestamp: Date.now(),
        ...entry,
      };

      sseManager.broadcast('unified-events', debugData);
    } catch (error) {
      logger.error('Failed to broadcast debug entry:', error);
    }
  }

  logRequest(
    title: string,
    content: string,
    model?: string,
    endpoint?: string
  ) {
    this.broadcastDebugEntry({
      entryType: 'request',
      title,
      content,
      model,
      endpoint,
    });
  }

  logResponse(
    title: string,
    content: string,
    duration?: number,
    model?: string,
    endpoint?: string,
    tokensPerSecond?: number,
    totalTokens?: number
  ) {
    this.broadcastDebugEntry({
      entryType: 'response',
      title,
      content,
      duration,
      model,
      endpoint,
      tokensPerSecond,
      totalTokens,
    });
  }

  logError(title: string, content: string, model?: string, endpoint?: string) {
    this.broadcastDebugEntry({
      entryType: 'error',
      title,
      content,
      model,
      endpoint,
    });
  }
}

export const serverDebugLogger = new ServerDebugLogger();
