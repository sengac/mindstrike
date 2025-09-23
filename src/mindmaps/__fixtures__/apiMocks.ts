import { vi } from 'vitest';
import type { MindMap } from '../hooks/useMindMaps';

// Mock API responses for mind maps
export const mockMindMapsApiResponse: MindMap[] = [
  {
    id: 'mindmap-1',
    name: 'Project Planning',
    description: 'Mind map for project planning and organization',
    createdAt: new Date('2024-01-01T10:00:00Z'),
    updatedAt: new Date('2024-01-02T15:30:00Z'),
  },
  {
    id: 'mindmap-2',
    name: 'Research Notes',
    description: 'Research findings and references',
    createdAt: new Date('2024-01-03T09:15:00Z'),
    updatedAt: new Date('2024-01-03T16:45:00Z'),
  },
  {
    id: 'mindmap-3',
    name: 'Meeting Notes',
    description: 'Notes from team meetings',
    createdAt: new Date('2024-01-04T14:20:00Z'),
    updatedAt: new Date('2024-01-04T14:20:00Z'),
  },
];

// Mock mind map generation response
export const mockGenerationResponse = {
  streamId: 'stream-123',
  workflowId: 'workflow-456',
  status: 'started',
};

// Mock generation progress events
export const mockGenerationProgressEvents = [
  {
    type: 'progress',
    status: 'Starting iterative reasoning...',
    streamId: 'stream-123',
  },
  {
    type: 'task_progress',
    task: {
      id: 'reasoning-step-1',
      result: 'Analyzing the main topic',
      status: 'completed',
    },
    streamId: 'stream-123',
  },
  {
    type: 'mindmap_change',
    action: 'create',
    nodeId: 'new-node-1',
    parentId: 'root-node',
    text: 'New Child Node',
    notes: 'Generated notes',
    sources: [],
    streamId: 'stream-123',
  },
  {
    type: 'complete',
    result: {
      changes: [
        {
          action: 'create',
          nodeId: 'new-node-1',
          parentId: 'root-node',
          text: 'New Child Node',
          notes: 'Generated notes',
          sources: [],
        },
      ],
    },
    streamId: 'stream-123',
  },
];

// Mock fetch implementation
export const createMockFetch = () => {
  const mockFetch = vi.fn();

  // GET /api/mindmaps - return list of mind maps
  mockFetch.mockImplementation((url: string, options?: RequestInit) => {
    if (url === '/api/mindmaps' && (!options || options.method !== 'POST')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockMindMapsApiResponse),
      });
    }

    // POST /api/mindmaps - save mind maps
    if (url === '/api/mindmaps' && options?.method === 'POST') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
    }

    // POST /api/mindmaps/:id/generate - start generation
    if (url.includes('/generate') && options?.method === 'POST') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockGenerationResponse),
      });
    }

    // POST /api/mindmaps/cancel/:workflowId - cancel generation
    if (url.includes('/cancel/') && options?.method === 'POST') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
    }

    // Default fallback
    return Promise.resolve({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: 'Not found' }),
    });
  });

  return mockFetch;
};

// Mock EventSource for SSE testing
export class MockEventSource {
  public url: string;
  public onopen: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public readyState: number = 0;

  private listeners: Map<string, ((event: Event) => void)[]> = new Map();

  constructor(url: string) {
    this.url = url;
    this.readyState = 1; // OPEN

    // Simulate connection open
    setTimeout(() => {
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 0);
  }

  addEventListener(type: string, listener: (event: Event) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(listener);
  }

  removeEventListener(type: string, listener: (event: Event) => void) {
    const listeners = this.listeners.get(type);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  close() {
    this.readyState = 2; // CLOSED
  }

  // Test helper to simulate incoming messages
  simulateMessage(data: Record<string, unknown>) {
    const event = new MessageEvent('message', {
      data: JSON.stringify(data),
    });

    if (this.onmessage) {
      this.onmessage(event);
    }

    const listeners = this.listeners.get('message');
    if (listeners) {
      listeners.forEach(listener => listener(event));
    }
  }

  // Test helper to simulate error
  simulateError() {
    const event = new Event('error');

    if (this.onerror) {
      this.onerror(event);
    }

    const listeners = this.listeners.get('error');
    if (listeners) {
      listeners.forEach(listener => listener(event));
    }
  }
}

// Mock DOM events for custom events
export const mockWindowEvents: Record<string, CustomEvent[]> = {};

export const mockDispatchEvent = vi.fn((event: CustomEvent) => {
  const eventType = event.type;
  if (!mockWindowEvents[eventType]) {
    mockWindowEvents[eventType] = [];
  }
  mockWindowEvents[eventType].push(event);
  return true;
});

export const mockAddEventListener = vi.fn();
export const mockRemoveEventListener = vi.fn();

// Mock window object
export const mockWindow = {
  dispatchEvent: mockDispatchEvent,
  addEventListener: mockAddEventListener,
  removeEventListener: mockRemoveEventListener,
};

// Reset function for all API mocks
export const resetApiMocks = () => {
  vi.clearAllMocks();
  Object.keys(mockWindowEvents).forEach(key => {
    delete mockWindowEvents[key];
  });
};
