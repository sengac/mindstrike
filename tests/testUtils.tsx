import type { ReactElement } from 'react';
import React from 'react';
import type { RenderOptions } from '@testing-library/react';
import { render } from '@testing-library/react';
import { vi } from 'vitest';

// Custom render function that includes providers
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  // Add any global providers here (e.g., theme, router, etc.)
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  }

  return render(ui, { wrapper: Wrapper, ...options });
}

// Mock API responses
export const mockApiResponse = (
  url: string,
  data: any,
  options?: {
    status?: number;
    delay?: number;
  }
) => {
  const { status = 200, delay = 0 } = options || {};

  global.fetch = vi.fn().mockImplementation((fetchUrl: string) => {
    if (fetchUrl.includes(url)) {
      return new Promise(resolve => {
        setTimeout(() => {
          resolve({
            ok: status >= 200 && status < 300,
            status,
            json: async () => data,
            text: async () => JSON.stringify(data),
          });
        }, delay);
      });
    }
    return Promise.reject(new Error('URL not mocked'));
  });
};

// Mock SSE stream
export const mockSSEStream = (events: Array<{ type: string; data: any }>) => {
  const mockEventSource = {
    addEventListener: vi.fn((type, handler) => {
      events
        .filter(event => event.type === type)
        .forEach(event => {
          setTimeout(() => {
            handler({ data: JSON.stringify(event.data) });
          }, 10);
        });
    }),
    removeEventListener: vi.fn(),
    close: vi.fn(),
    readyState: 1, // OPEN
  };

  window.EventSource = vi.fn().mockImplementation(() => mockEventSource);

  return mockEventSource;
};

// Mock Zustand store
export const createMockStore = <T extends Record<string, any>>(
  initialState: T
) => {
  let state = { ...initialState };
  const listeners = new Set<() => void>();

  const setState = (partial: Partial<T> | ((state: T) => Partial<T>)) => {
    const updates = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...updates };
    listeners.forEach(listener => listener());
  };

  const getState = () => state;

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  return {
    getState,
    setState,
    subscribe,
    __testReset: () => {
      state = { ...initialState };
      listeners.clear();
    },
  };
};

// Wait for async operations
export const waitForAsync = (ms: number = 0) =>
  new Promise(resolve => setTimeout(resolve, ms));

// Mock file for uploads
export const createMockFile = (
  name: string,
  content: string,
  type: string = 'text/plain'
): File => {
  const blob = new Blob([content], { type });
  return new File([blob], name, { type });
};

// Mock thread data
export const mockThread = (overrides?: Partial<any>) => ({
  id: 'test-thread-1',
  title: 'Test Thread',
  messages: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  model: 'gpt-4',
  systemPrompt: 'You are a helpful assistant',
  temperature: 0.7,
  maxTokens: 2000,
  topP: 1,
  ...overrides,
});

// Mock message data
export const mockMessage = (overrides?: Partial<any>) => ({
  id: 'test-message-1',
  threadId: 'test-thread-1',
  role: 'user',
  content: 'Test message',
  timestamp: new Date().toISOString(),
  attachments: [],
  ...overrides,
});

// Mock mind map data
export const mockMindMap = (overrides?: Partial<any>) => ({
  id: 'test-mindmap-1',
  title: 'Test Mind Map',
  nodes: [
    {
      id: 'node-1',
      type: 'topic',
      position: { x: 0, y: 0 },
      data: { label: 'Central Topic', content: 'Test content' },
    },
  ],
  edges: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

// Re-export everything from React Testing Library
export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
export { renderWithProviders as render };
