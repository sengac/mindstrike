import { vi } from 'vitest';
import type { Thread } from '../../../types';
import type { MindMapData } from '../../../mindmaps/types';

// Workspace roots for different test scenarios
export const mockWorkspaceRoots = {
  projectA: '/Users/test/projects/projectA',
  projectB: '/Users/test/projects/projectB',
  emptyWorkspace: '/Users/test/empty',
};

// Mock threads for different workspaces
export const mockThreadsProjectA: Thread[] = [
  {
    id: 'thread-a1',
    name: 'Project A Discussion',
    model: 'gpt-4',
    customPrompt: 'Project A specific prompt',
    createdAt: new Date('2024-01-01').toISOString(),
    updatedAt: new Date('2024-01-01').toISOString(),
  },
  {
    id: 'thread-a2',
    name: 'Project A Implementation',
    model: 'claude-3',
    createdAt: new Date('2024-01-02').toISOString(),
    updatedAt: new Date('2024-01-02').toISOString(),
  },
];

export const mockThreadsProjectB: Thread[] = [
  {
    id: 'thread-b1',
    name: 'Project B Planning',
    model: 'gpt-4',
    customPrompt: 'Project B specific prompt',
    createdAt: new Date('2024-01-03').toISOString(),
    updatedAt: new Date('2024-01-03').toISOString(),
  },
  {
    id: 'thread-b2',
    name: 'Project B Architecture',
    model: 'claude-3',
    createdAt: new Date('2024-01-04').toISOString(),
    updatedAt: new Date('2024-01-04').toISOString(),
  },
  {
    id: 'thread-b3',
    name: 'Project B Testing',
    model: 'gpt-3.5-turbo',
    createdAt: new Date('2024-01-05').toISOString(),
    updatedAt: new Date('2024-01-05').toISOString(),
  },
];

// Mock mindmaps for different workspaces
export const mockMindMapsProjectA: MindMapData[] = [
  {
    id: 'mindmap-a1',
    name: 'Project A Architecture',
    nodes: [
      {
        id: 'node-a1',
        type: 'concept',
        position: { x: 0, y: 0 },
        data: {
          label: 'Main Concept A',
          content: 'Architecture overview for Project A',
          type: 'concept',
        },
      },
      {
        id: 'node-a2',
        type: 'concept',
        position: { x: 200, y: 100 },
        data: {
          label: 'Component A1',
          content: 'First component details',
          type: 'concept',
        },
      },
    ],
    edges: [
      {
        id: 'edge-a1',
        source: 'node-a1',
        target: 'node-a2',
        type: 'smoothstep',
      },
    ],
    createdAt: new Date('2024-01-01').toISOString(),
    updatedAt: new Date('2024-01-01').toISOString(),
  },
  {
    id: 'mindmap-a2',
    name: 'Project A Flow',
    nodes: [
      {
        id: 'node-a3',
        type: 'concept',
        position: { x: 0, y: 0 },
        data: {
          label: 'Flow Start',
          content: 'Starting point',
          type: 'concept',
        },
      },
    ],
    edges: [],
    createdAt: new Date('2024-01-02').toISOString(),
    updatedAt: new Date('2024-01-02').toISOString(),
  },
];

export const mockMindMapsProjectB: MindMapData[] = [
  {
    id: 'mindmap-b1',
    name: 'Project B Overview',
    nodes: [
      {
        id: 'node-b1',
        type: 'concept',
        position: { x: 0, y: 0 },
        data: {
          label: 'Main Concept B',
          content: 'Overview for Project B',
          type: 'concept',
        },
      },
      {
        id: 'node-b2',
        type: 'concept',
        position: { x: 300, y: 0 },
        data: {
          label: 'Component B1',
          content: 'Component details',
          type: 'concept',
        },
      },
      {
        id: 'node-b3',
        type: 'concept',
        position: { x: 150, y: 200 },
        data: {
          label: 'Component B2',
          content: 'Another component',
          type: 'concept',
        },
      },
    ],
    edges: [
      {
        id: 'edge-b1',
        source: 'node-b1',
        target: 'node-b2',
        type: 'smoothstep',
      },
      {
        id: 'edge-b2',
        source: 'node-b1',
        target: 'node-b3',
        type: 'smoothstep',
      },
    ],
    createdAt: new Date('2024-01-03').toISOString(),
    updatedAt: new Date('2024-01-03').toISOString(),
  },
];

// Mock file lists for different workspaces
export const mockFilesProjectA = [
  'README.md',
  'package.json',
  'src/',
  'tests/',
  'config.js',
];

export const mockFilesProjectB = [
  'README.md',
  'Cargo.toml',
  'src/',
  'target/',
  'build.rs',
];

// Mock workspace change responses
export const mockWorkspaceChangeResponse = (root: string) => ({
  success: true,
  workspaceRoot: root,
  message: `Workspace root set to ${root}`,
});

// Mock SSE events for workspace changes
export const createMockWorkspaceSSEEvent = (workspaceRoot: string) => ({
  type: 'workspace-root-changed',
  data: { workspaceRoot },
});

export const createMockMusicSSEEvent = (musicRoot: string) => ({
  type: 'music-root-changed',
  data: { musicRoot },
});

// Helper function to create mock API responses
export const createMockAPIResponse = <T>(data: T, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
  text: async () => JSON.stringify(data),
});

// Mock workspace store state
export const createMockWorkspaceState = (overrides = {}) => ({
  files: [],
  isLoading: false,
  currentDirectory: '.',
  workspaceRoot: mockWorkspaceRoots.projectA,
  musicRoot: null,
  setFiles: vi.fn(),
  setIsLoading: vi.fn(),
  setCurrentDirectory: vi.fn(),
  setWorkspaceRoot: vi.fn(),
  setMusicRoot: vi.fn(),
  loadWorkspaceRoots: vi.fn(),
  ...overrides,
});
