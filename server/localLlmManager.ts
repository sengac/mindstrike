import type { LlamaModel, LlamaContext } from 'node-llama-cpp';
import { LocalLLMOrchestrator } from './llm/localLlmOrchestrator';
import type { VRAMEstimateInfo, ModelArchitecture } from './modelFetcher';

// Re-export types
export interface LocalModelInfo {
  id: string;
  name: string;
  filename: string;
  path: string;
  size: number;
  downloaded: boolean;
  downloading: boolean;
  trainedContextLength?: number; // The context length the model was trained with
  maxContextLength?: number; // The maximum context length the model can handle
  parameterCount?: string;
  quantization?: string;
  layerCount?: number;

  // VRAM calculation fields
  vramEstimates?: VRAMEstimateInfo[];
  modelArchitecture?: ModelArchitecture;
  hasVramData?: boolean;
  vramError?: string;
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
