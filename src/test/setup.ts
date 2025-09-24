import { vi, beforeEach, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Set up React act environment for Vitest
declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

declare global {
  interface Window {
    EventSource: typeof EventSource;
  }

  namespace NodeJS {
    interface Global {
      EventSource: typeof EventSource;
      requestAnimationFrame: (callback: FrameRequestCallback) => number;
      cancelAnimationFrame: (id: number) => void;
    }
  }
}

// Mock ReactFlow components and hooks globally
vi.mock('reactflow', async () => {
  const actual = await vi.importActual('reactflow');
  const React = await import('react');

  return {
    ...actual,
    ReactFlow: vi.fn(() =>
      React.createElement('div', { 'data-testid': 'rf__wrapper' })
    ),
    Background: vi.fn(() =>
      React.createElement('div', { 'data-testid': 'react-flow-background' })
    ),
    Controls: vi.fn(() =>
      React.createElement('div', { 'data-testid': 'react-flow-controls' })
    ),
    MiniMap: vi.fn(() =>
      React.createElement('div', { 'data-testid': 'react-flow-minimap' })
    ),
    Handle: vi.fn(props =>
      React.createElement('div', {
        'data-testid': `react-flow-handle-${props?.type ?? 'source'}-${props?.position ?? 'top'}-${props?.id ?? 'default'}`,
      })
    ),
    useReactFlow: vi.fn(() => ({
      getNodes: vi.fn(() => []),
      getEdges: vi.fn(() => []),
      setNodes: vi.fn(),
      setEdges: vi.fn(),
      fitView: vi.fn(),
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      screenToFlowPosition: vi.fn(position => position),
      flowToScreenPosition: vi.fn(position => position),
    })),
    useNodesState: vi.fn(() => [[], vi.fn(), vi.fn()]),
    useEdgesState: vi.fn(() => [[], vi.fn(), vi.fn()]),
  };
});

// Mock the logger
vi.mock('../utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock monaco-editor - using manual mock in __mocks__ directory
vi.mock('monaco-editor');

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock EventSource
class MockEventSource implements EventSource {
  public url: string;
  public onopen: ((this: EventSource, ev: Event) => void) | null = null;
  public onmessage: ((this: EventSource, ev: MessageEvent) => void) | null =
    null;
  public onerror: ((this: EventSource, ev: Event) => void) | null = null;
  public readyState: number = 1;
  public withCredentials: boolean = false;
  public readonly CONNECTING = 0 as const;
  public readonly OPEN = 1 as const;
  public readonly CLOSED = 2 as const;

  static readonly CONNECTING = 0 as const;
  static readonly OPEN = 1 as const;
  static readonly CLOSED = 2 as const;

  constructor(url: string | URL, eventSourceInitDict?: EventSourceInit) {
    this.url = typeof url === 'string' ? url : url.toString();
    if (eventSourceInitDict) {
      this.withCredentials = eventSourceInitDict.withCredentials ?? false;
    }
  }

  addEventListener<K extends keyof EventSourceEventMap>(
    type: K,
    listener: (this: EventSource, ev: EventSourceEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void;
  addEventListener(): void {}

  removeEventListener<K extends keyof EventSourceEventMap>(
    type: K,
    listener: (this: EventSource, ev: EventSourceEventMap[K]) => unknown,
    options?: boolean | EventListenerOptions
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions
  ): void;
  removeEventListener(): void {}

  close(): void {
    this.readyState = 2;
  }

  dispatchEvent(event: Event): boolean {
    // Mock implementation - could dispatch to listeners if needed
    if (event.type === 'open' && this.onopen) {
      this.onopen.call(this, event);
    } else if (event.type === 'message' && this.onmessage) {
      this.onmessage.call(this, event as MessageEvent);
    } else if (event.type === 'error' && this.onerror) {
      this.onerror.call(this, event);
    }
    return true;
  }
}

// Mock global EventSource for tests
interface GlobalWithEventSource extends NodeJS.Global {
  EventSource: typeof EventSource;
}
(global as GlobalWithEventSource).EventSource = MockEventSource;

// Mock window methods
Object.defineProperty(window, 'dispatchEvent', {
  value: vi.fn(),
  writable: true,
});

Object.defineProperty(window, 'addEventListener', {
  value: vi.fn(),
  writable: true,
});

Object.defineProperty(window, 'removeEventListener', {
  value: vi.fn(),
  writable: true,
});

// Mock matchMedia for react-hot-toast
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver
const MockResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Define ResizeObserver on global
Object.defineProperty(global, 'ResizeObserver', {
  writable: true,
  configurable: true,
  value: MockResizeObserver,
});

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock requestAnimationFrame
// Mock global requestAnimationFrame for tests
interface GlobalWithAnimationFrame extends NodeJS.Global {
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
}
(global as GlobalWithAnimationFrame).requestAnimationFrame = vi.fn(
  (cb: FrameRequestCallback) => {
    const id = setTimeout(() => cb(performance.now()), 16);
    return Number(id);
  }
);
global.cancelAnimationFrame = vi.fn();

// Setup and teardown
beforeEach(() => {
  // Reset fetch mock
  mockFetch.mockClear();
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({}),
  });

  // Clear window event mocks if they exist
  if (vi.isMockFunction(window.dispatchEvent)) {
    vi.mocked(window.dispatchEvent).mockClear();
  }
  if (vi.isMockFunction(window.addEventListener)) {
    vi.mocked(window.addEventListener).mockClear();
  }
  if (vi.isMockFunction(window.removeEventListener)) {
    vi.mocked(window.removeEventListener).mockClear();
  }
});

// Mock getBoundingClientRect for text measurement
// @ts-ignore - Mocking DOM API
Element.prototype.getBoundingClientRect = vi.fn(function (this: HTMLElement) {
  // Default size for text elements
  const fontSize = parseInt(this.style.fontSize ?? '14');
  const text = this.textContent ?? '';
  const lines =
    this.style.whiteSpace === 'normal' ? Math.ceil(text.length / 30) : 1;

  return {
    width: Math.min(text.length * fontSize * 0.6, 300),
    height: lines * fontSize * 1.5,
    top: 0,
    left: 0,
    bottom: lines * fontSize * 1.5,
    right: Math.min(text.length * fontSize * 0.6, 300),
    x: 0,
    y: 0,
    toJSON: () => {},
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
});
