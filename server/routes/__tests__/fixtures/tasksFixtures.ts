import { vi } from 'vitest';
import type { Request, Response } from 'express';

// Mock task data
export const mockTaskUpdate = {
  type: 'task-progress',
  status: 'running',
  progress: 50,
  message: 'Processing task...',
};

export const mockWorkflowId = 'workflow-123';

// Helper to create mock request
export const createMockRequest = (
  params: Record<string, unknown> = {},
  body: unknown = {},
  query: Record<string, unknown> = {}
): Partial<Request> => ({
  params,
  body,
  query,
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

// Mock SSE Manager
export const createMockSSEManager = () => ({
  broadcast: vi.fn(),
  addClient: vi.fn(),
  removeClient: vi.fn(),
  getClients: vi.fn().mockReturnValue([]),
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
