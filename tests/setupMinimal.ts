import { beforeEach, afterEach, vi } from 'vitest';

// Mock console methods for cleaner test output
global.console = {
  ...console,
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// Global test setup
beforeEach(() => {
  // Clear all timers and mocks
  vi.clearAllTimers();
  vi.clearAllMocks();

  // Set test environment
  process.env.NODE_ENV = 'test';
});

afterEach(() => {
  // Restore all mocks
  vi.restoreAllMocks();
});
