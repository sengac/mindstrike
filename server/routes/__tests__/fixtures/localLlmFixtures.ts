import { vi } from 'vitest';
import type {
  LocalModelInfo,
  ModelLoadingSettings,
} from '../../../localLlmManager';

// Mock model data
export const mockLocalModels: LocalModelInfo[] = [
  {
    id: 'model1',
    name: 'LLaMA 7B',
    path: '/models/llama-7b.gguf',
    size: 7000000000,
    loaded: false,
    loading: false,
    quantization: 'Q4_K_M',
    contextLength: 2048,
    parameterCount: '7B',
  },
  {
    id: 'model2',
    name: 'Mistral 7B',
    path: '/models/mistral-7b.gguf',
    size: 7500000000,
    loaded: true,
    loading: false,
    quantization: 'Q5_K_M',
    contextLength: 4096,
    parameterCount: '7B',
  },
];

export const mockAvailableModels = [
  {
    id: 'available1',
    name: 'GPT-J 6B',
    filename: 'gpt-j-6b.gguf',
    url: 'https://huggingface.co/models/gpt-j-6b.gguf',
    size: 6000000000,
    description: 'GPT-J 6B model',
    quantization: 'Q4_K_M',
    contextLength: 2048,
    parameterCount: '6B',
    hasVramData: true,
    vramError: false,
    isFetchingVram: false,
  },
  {
    id: 'available2',
    name: 'Falcon 7B',
    filename: 'falcon-7b.gguf',
    url: 'https://huggingface.co/models/falcon-7b.gguf',
    size: 7000000000,
    description: 'Falcon 7B model',
    quantization: 'Q5_K_M',
    contextLength: 4096,
    parameterCount: '7B',
    hasVramData: false,
    vramError: false,
    isFetchingVram: false,
  },
];

export const mockModelSettings: ModelLoadingSettings = {
  gpuLayers: 32,
  contextSize: 2048,
  batchSize: 512,
  threads: 8,
  temperature: 0.7,
};

export const mockSearchResults = [
  {
    id: 'search1',
    name: 'LLaMA 2 7B',
    filename: 'llama-2-7b.gguf',
    url: 'https://huggingface.co/models/llama-2-7b.gguf',
    size: 7000000000,
    description: 'LLaMA 2 7B Chat',
    quantization: 'Q4_K_M',
    contextLength: 4096,
    parameterCount: '7B',
  },
  {
    id: 'search2',
    name: 'LLaMA 2 13B',
    filename: 'llama-2-13b.gguf',
    url: 'https://huggingface.co/models/llama-2-13b.gguf',
    size: 13000000000,
    description: 'LLaMA 2 13B Chat',
    quantization: 'Q4_K_M',
    contextLength: 4096,
    parameterCount: '13B',
  },
];

export const mockModelInfo = {
  id: 'test-model',
  name: 'Test Model',
  path: '/models/test-model.gguf',
  size: 5000000000,
  loaded: false,
  loading: false,
  quantization: 'Q4_K_M',
  contextLength: 2048,
  parameterCount: '5B',
};

export const mockDownloadInfo = {
  modelUrl: 'https://huggingface.co/models/test-model.gguf',
  modelName: 'Test Model',
  filename: 'test-model.gguf',
  size: 5000000000,
  description: 'Test model for downloads',
  contextLength: 2048,
  parameterCount: '5B',
  quantization: 'Q4_K_M',
};

export const mockGenerateResponse = {
  response: 'This is a generated response from the model.',
  tokens: 10,
  tokensPerSecond: 25.5,
};

// Type for exec callback
export type ExecCallback = (
  error: Error | null,
  stdout?: string,
  stderr?: string
) => void;

// Mock child process for exec
export const mockChildProcess = {
  stdout: null,
  stderr: null,
  stdin: null,
  pid: 1234,
  kill: vi.fn(),
  send: vi.fn(),
  disconnect: vi.fn(),
  unref: vi.fn(),
  ref: vi.fn(),
  on: vi.fn(),
  once: vi.fn(),
  emit: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  removeAllListeners: vi.fn(),
  setMaxListeners: vi.fn(),
  getMaxListeners: vi.fn(),
  listeners: vi.fn(),
  rawListeners: vi.fn(),
  listenerCount: vi.fn(),
  prependListener: vi.fn(),
  prependOnceListener: vi.fn(),
  eventNames: vi.fn(),
  off: vi.fn(),
};

// Import the actual type
import type { LocalLLMManager } from '../../../localLlmManager';

// Create mock LLM Manager with proper typing
export const createMockLLMManager = (): Partial<LocalLLMManager> => ({
  getLocalModels: vi.fn(),
  getAvailableModels: vi.fn(),
  downloadModel: vi.fn(),
  cancelDownload: vi.fn(),
  deleteModel: vi.fn(),
  loadModel: vi.fn(),
  unloadModel: vi.fn(),
  getModelStatus: vi.fn(),
  getModelRuntimeInfo: vi.fn(),
  setModelSettings: vi.fn(),
  getModelSettings: vi.fn(),
  calculateOptimalSettings: vi.fn(),
  generateResponse: vi.fn(),
  generateStreamResponse: vi.fn(),
});

// Create mock Model Fetcher
export const createMockModelFetcher = () => ({
  getCachedModels: vi.fn().mockReturnValue(mockAvailableModels),
  getModelsById: vi.fn(),
  fetchVRAMDataForModels: vi.fn(),
  retryVramFetching: vi.fn(),
  refreshAvailableModels: vi.fn(),
  clearAccessibilityCache: vi.fn(),
  setHuggingFaceToken: vi.fn(),
  removeHuggingFaceToken: vi.fn(),
  hasHuggingFaceToken: vi.fn(),
  searchModels: vi.fn(),
  clearSearchCacheForQuery: vi.fn(),
  getAvailableModelsWithProgress: vi.fn(),
});

// Create mock SSE Manager
export const createMockSSEManager = () => ({
  broadcast: vi.fn(),
  addClient: vi.fn(),
  removeClient: vi.fn(),
  getClients: vi.fn(),
});

// Create mock Model Settings Manager
export const createMockModelSettingsManager = () => ({
  loadAllModelSettings: vi.fn(),
  deleteModelSettings: vi.fn(),
  saveModelSettings: vi.fn(),
  getModelSettings: vi.fn(),
});

// Create mock Logger
export const createMockLogger = () => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  verbose: vi.fn(),
});

// Helper to create mock Express Response for SSE
export const createMockSSEResponse = () => {
  const mockResponse = {
    writeHead: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
    flush: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
  };
  return mockResponse;
};

// Helper to create mock Express Request for SSE
export const createMockSSERequest = () => {
  const mockRequest = {
    on: vi.fn(),
    params: {},
    body: {},
    query: {},
  };
  return mockRequest;
};
