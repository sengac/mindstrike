import { LocalLLMManager } from './local-llm-manager.js';

// Singleton instance of LocalLLMManager to ensure the same instance
// is used across HTTP routes and LLMClient
let instance: LocalLLMManager | null = null;

export function getLocalLLMManager(): LocalLLMManager {
  if (!instance) {
    instance = new LocalLLMManager();
  }
  return instance;
}
