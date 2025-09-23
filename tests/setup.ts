import { beforeEach, afterEach, vi } from 'vitest';
import { resolve } from 'path';

// Global mocks for server-side modules
if (process.env.NODE_ENV === 'test') {
  // Mock winston logger
  vi.mock('winston', () => ({
    createLogger: vi.fn(() => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      log: vi.fn(),
    })),
    format: {
      combine: vi.fn(),
      timestamp: vi.fn(),
      printf: vi.fn(),
      colorize: vi.fn(),
      simple: vi.fn(),
      json: vi.fn(),
    },
    transports: {
      Console: vi.fn(),
      File: vi.fn(),
    },
  }));

  // Mock file system operations for safety
  vi.mock('fs/promises', async () => {
    const actual =
      await vi.importActual<typeof import('fs/promises')>('fs/promises');
    return {
      ...actual,
      writeFile: vi.fn(),
      mkdir: vi.fn(),
      unlink: vi.fn(),
      rmdir: vi.fn(),
    };
  });

  // Mock Model Context Protocol servers - these are ESM modules
  vi.mock('@modelcontextprotocol/server-filesystem', async () => {
    return {
      FileSystemServer: vi.fn().mockImplementation(() => ({
        start: vi.fn(),
        stop: vi.fn(),
        on: vi.fn(),
      })),
    };
  });

  vi.mock('@modelcontextprotocol/server-github', async () => {
    return {
      GitHubServer: vi.fn().mockImplementation(() => ({
        start: vi.fn(),
        stop: vi.fn(),
        on: vi.fn(),
      })),
    };
  });

  // Mock node-llama-cpp for local LLM tests
  vi.mock('node-llama-cpp', () => ({
    getLlama: vi.fn().mockResolvedValue({
      loadModel: vi.fn().mockResolvedValue({
        createContext: vi.fn().mockReturnValue({
          createCompletion: vi.fn().mockResolvedValue({
            text: 'Mocked response',
          }),
        }),
      }),
    }),
  }));

  // Mock Express SSE
  vi.mock('express', async () => {
    const actual = await vi.importActual<typeof import('express')>('express');
    return {
      ...actual,
      response: {
        ...actual.response,
        sse: vi.fn(),
      },
    };
  });
}

// Mock console methods for cleaner test output
const originalConsole = { ...console };
global.console = {
  ...console,
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// Global test utilities
global.testHelpers = {
  getTestWorkspace: () => resolve(__dirname, 'fixtures', 'test-workspace'),
  resetConsole: () => {
    global.console = originalConsole;
  },
};

// Global test setup
beforeEach(() => {
  // Clear all timers and mocks
  vi.clearAllTimers();
  vi.clearAllMocks();

  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.VITEST = 'true';
  process.env.WORKSPACE_DIR = global.testHelpers.getTestWorkspace();
});

afterEach(() => {
  // Restore all mocks and modules
  vi.restoreAllMocks();
  vi.resetModules();

  // Clean up environment
  delete process.env.NODE_ENV;
  delete process.env.VITEST;
  delete process.env.WORKSPACE_DIR;
});

// Type augmentation for global test helpers
declare global {
  var testHelpers: {
    getTestWorkspace: () => string;
    resetConsole: () => void;
  };
}
