import { sseManager } from './sse-manager.js';
import { logger } from './logger.js';

interface DebugEntry {
  entryType: 'request' | 'response' | 'error';
  title: string;
  content: string;
  duration?: number;
  model?: string;
  endpoint?: string;
}

class ServerDebugLogger {
  private broadcastDebugEntry(entry: DebugEntry) {
    try {
      sseManager.broadcast('debug', {
        type: 'debug-entry',
        timestamp: Date.now(),
        ...entry
      });
    } catch (error) {
      logger.error('Failed to broadcast debug entry:', error);
    }
  }

  logRequest(title: string, content: string, model?: string, endpoint?: string) {
    this.broadcastDebugEntry({
      entryType: 'request',
      title,
      content,
      model,
      endpoint
    });
  }

  logResponse(title: string, content: string, duration?: number, model?: string, endpoint?: string) {
    this.broadcastDebugEntry({
      entryType: 'response',
      title,
      content,
      duration,
      model,
      endpoint
    });
  }

  logError(title: string, content: string, model?: string, endpoint?: string) {
    this.broadcastDebugEntry({
      entryType: 'error',
      title,
      content,
      model,
      endpoint
    });
  }
}

export const serverDebugLogger = new ServerDebugLogger();
