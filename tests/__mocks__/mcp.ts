import { vi } from 'vitest';

export const FileSystemServer = vi.fn().mockImplementation(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  on: vi.fn(),
  removeAllListeners: vi.fn(),
}));

export const GitHubServer = vi.fn().mockImplementation(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  on: vi.fn(),
  removeAllListeners: vi.fn(),
}));

export default {
  FileSystemServer,
  GitHubServer,
};
