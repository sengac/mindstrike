import { vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// Mock model data
export const mockSearchResults = [
  {
    id: 'model-1',
    name: 'Test Model 1',
    filename: 'test-model-1.gguf',
    url: 'https://example.com/model-1',
    size: 1000000,
    description: 'Test model 1 description',
  },
  {
    id: 'model-2',
    name: 'Test Model 2',
    filename: 'test-model-2.gguf',
    url: 'https://example.com/model-2',
    size: 2000000,
    description: 'Test model 2 description',
  },
];

export const mockAvailableModels = [
  {
    id: 'available-1',
    name: 'Available Model 1',
    filename: 'available-1.gguf',
    url: 'https://example.com/available-1',
    size: 3000000,
    description: 'Available model 1',
  },
  {
    id: 'available-2',
    name: 'Available Model 2',
    filename: 'available-2.gguf',
    url: 'https://example.com/available-2',
    size: 4000000,
    description: 'Available model 2',
  },
];

// Mock session data
export const mockScanSession = {
  id: 'test-scan-123',
  controller: new AbortController(),
  status: 'running' as const,
  startTime: Date.now(),
};

export const mockSearchSession = {
  id: 'test-search-456',
  controller: new AbortController(),
  status: 'running' as const,
  startTime: Date.now(),
};

// Mock search params
export const mockSearchParams = {
  query: 'llama',
  searchType: 'all',
};

// Mock progress updates
export const mockProgressUpdate = {
  stage: 'initializing' as const,
  message: 'Starting scan...',
  progress: 0,
  operationType: 'scan' as const,
};

// Helper to create mock request
export const createMockRequest = (
  params: Record<string, unknown> = {},
  body: unknown = {},
  query: Record<string, unknown> = {}
): Partial<Request> => ({
  params,
  body,
  query,
  on: vi.fn(),
  headers: {},
  get: vi.fn(),
});

// Helper to create mock response
export const createMockResponse = (): Partial<Response> => {
  const res: Partial<Response> = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    writeHead: vi.fn().mockReturnThis(),
    write: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
    flush: vi.fn(),
    headersSent: false,
  };
  return res;
};

// Helper to create mock next function
export const createMockNext = (): NextFunction => vi.fn() as NextFunction;

// Mock SSE Manager
export const createMockSSEManager = () => ({
  broadcast: vi.fn(),
  addClient: vi.fn(),
  removeClient: vi.fn(),
  getClients: vi.fn().mockReturnValue([]),
});

// Mock Model Fetcher
export const createMockModelFetcher = () => ({
  searchModelsWithProgress: vi.fn(),
  fetchPopularModels: vi.fn(),
  getAvailableModels: vi.fn(),
  getCachedModels: vi.fn(),
  refreshAvailableModels: vi.fn(),
  setProgressCallback: vi.fn(),
  getModelsById: vi.fn(),
  fetchVRAMDataForModels: vi.fn(),
  retryVramFetching: vi.fn(),
  clearAccessibilityCache: vi.fn(),
  setHuggingFaceToken: vi.fn(),
  removeHuggingFaceToken: vi.fn(),
  hasHuggingFaceToken: vi.fn(),
  searchModels: vi.fn(),
  clearSearchCacheForQuery: vi.fn(),
  getAvailableModelsWithProgress: vi.fn(),
});

// Mock Logger
export const createMockLogger = () => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  verbose: vi.fn(),
});

// Helper to simulate delay
export const delay = (ms: number) =>
  new Promise(resolve => setTimeout(resolve, ms));

// Helper to wait for all promises to resolve
export const flushPromises = () =>
  new Promise(resolve => setImmediate(resolve));
