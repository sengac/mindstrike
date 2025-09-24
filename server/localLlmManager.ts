import type { LlamaModel, LlamaContext } from 'node-llama-cpp';
import { LocalLLMOrchestrator } from './llm/localLlmOrchestrator.js';

// Re-export types
export interface LocalModelInfo {
  id: string;
  name: string;
  filename: string;
  path: string;
  size: number;
  downloaded: boolean;
  downloading: boolean;
  contextLength: number;
  parameterCount?: string;
  quantization?: string;
  layerCount?: number;
  maxContextLength?: number;
}

export interface ModelDownloadInfo {
  name: string;
  url: string;
  filename: string;
  size: number;
  description: string;
  contextLength?: number;
  parameterCount?: string;
  quantization?: string;
}

export interface ModelLoadingSettings {
  gpuLayers?: number;
  contextSize?: number;
  batchSize?: number;
  threads?: number;
  temperature?: number;
}

export interface StreamResponseOptions {
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  threadId?: string;
  disableFunctions?: boolean;
  disableChatHistory?: boolean;
  onToken?: (token: string) => void;
}

export interface ModelRuntimeInfo {
  model: LlamaModel;
  context: LlamaContext;
  session: unknown;
  modelPath: string;
  contextSize: number;
  gpuLayers: number;
  batchSize: number;
  loadedAt: Date;
  lastUsedAt: Date;
  threadIds: Set<string>;
}

/**
 * LocalLLMManager - Thin wrapper around LocalLLMOrchestrator for backward compatibility
 */
export class LocalLLMManager extends LocalLLMOrchestrator {
  constructor() {
    super();
  }
}

// Export singleton instance
export const localLLMManager = new LocalLLMManager();
