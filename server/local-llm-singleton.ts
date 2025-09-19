import { LLMWorkerProxy } from './llm-worker-proxy.js';
import { logger } from './logger.js';

// Singleton instance of LLMWorkerProxy to ensure the same instance
// is used across HTTP routes and LLMClient
let instance: LLMWorkerProxy | null = null;

export function getLocalLLMManager(): LLMWorkerProxy {
  if (!instance) {
    try {
      instance = new LLMWorkerProxy();
      logger.info('LLM Worker Proxy initialized');
    } catch (error) {
      logger.error('Failed to initialize LLM Worker Proxy:', error);
      throw error;
    }
  }
  return instance;
}

// Cleanup function to terminate worker on process exit
export function cleanup(): void {
  if (instance) {
    instance.terminate();
    instance = null;
  }
}
