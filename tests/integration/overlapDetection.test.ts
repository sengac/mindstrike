/**
 * Integration tests for overlap detection functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { detectNodeOverlaps } from '../../src/utils/overlapDetection';

interface MockElement {
  tagName: string;
  attributes: Map<string, string>;
  textContent: string;
  children: unknown[];
  appendChild: ReturnType<typeof vi.fn>;
  setAttribute: (name: string, value: string) => void;
  getAttribute: (name: string) => string | null;
  getBoundingClientRect: ReturnType<typeof vi.fn>;
  querySelector?: ReturnType<typeof vi.fn>;
  querySelectorAll?: ReturnType<typeof vi.fn>;
}

interface MockDocument {
  createElement: (tagName: string) => MockElement;
  body: {
    appendChild: ReturnType<typeof vi.fn>;
    removeChild: ReturnType<typeof vi.fn>;
  };
  querySelectorAll: ReturnType<typeof vi.fn>;
}

// Mock DOM setup for testing
global.document = {
  createElement: (tagName: string): MockElement => {
    const element: MockElement = {
      tagName,
      attributes: new Map(),
      textContent: '',
      children: [],
      appendChild: vi.fn(),
      setAttribute: (name: string, value: string) => {
        element.attributes.set(name, value);
      },
      getAttribute: (name: string) => element.attributes.get(name) || null,
      getBoundingClientRect: vi.fn(() => ({
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
        toJSON: () => ({}),
      })),
      querySelector: vi.fn(),
      querySelectorAll: vi.fn(() => []),
    };
    return element;
  },
  body: {
    appendChild: vi.fn(),
    removeChild: vi.fn(),
  },
  querySelectorAll: vi.fn(() => []),
} as MockDocument;

// Mock DOM setup
const createMockElement = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string = 'Test Node'
): MockElement => {
  const element = {
    tagName: 'div',
    attributes: new Map([['data-id', id]]),
    textContent: label,
    children: [],
    appendChild: vi.fn(),
    setAttribute: (name: string, value: string) => {
      element.attributes.set(name, value);
    },
    getAttribute: (name: string) => element.attributes.get(name) || null,
    getBoundingClientRect: vi.fn(() => ({
      x,
      y,
      width,
      height,
      top: y,
      left: x,
      bottom: y + height,
      right: x + width,
      toJSON: () => ({}),
    })),
  };

  return element;
};

interface MockContainer {
  querySelectorAll: ReturnType<typeof vi.fn>;
}

describe('overlapDetection', () => {
  let mockContainer: MockContainer;

  beforeEach(() => {
    mockContainer = {
      querySelectorAll: vi.fn(() => []),
    };

    // Clear any existing console spies
    vi.clearAllMocks();

    // Mock console methods
    global.console = {
      ...console,
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    };
  });

  describe('detectNodeOverlaps', () => {
    it('should detect no overlaps when nodes are properly spaced', () => {
      // Create 3 nodes with proper spacing
      const node1 = createMockElement('node-1', 0, 0, 100, 50, 'Node 1');
      const node2 = createMockElement('node-2', 150, 0, 100, 50, 'Node 2');
      const node3 = createMockElement('node-3', 0, 100, 100, 50, 'Node 3');

      mockContainer.querySelectorAll.mockReturnValue([node1, node2, node3]);

      const result = detectNodeOverlaps(mockContainer, false);

      expect(result.hasOverlaps).toBe(false);
      expect(result.overlaps).toHaveLength(0);
      expect(result.totalNodes).toBe(3);
      expect(result.message).toContain('✅ No overlaps detected');
    });

    it('should detect overlaps when nodes overlap partially', () => {
      // Create 2 overlapping nodes
      const node1 = createMockElement('node-1', 0, 0, 100, 50, 'Node 1');
      const node2 = createMockElement('node-2', 50, 25, 100, 50, 'Node 2'); // Overlaps with node1

      mockContainer.querySelectorAll.mockReturnValue([node1, node2]);

      const result = detectNodeOverlaps(mockContainer, false);

      expect(result.hasOverlaps).toBe(true);
      expect(result.overlaps).toHaveLength(1);
      expect(result.totalNodes).toBe(2);
      expect(result.message).toContain('⚠️ Found 1 overlapping node pairs');

      const overlap = result.overlaps[0];
      expect(overlap.node1.id).toBe('node-1');
      expect(overlap.node2.id).toBe('node-2');
      expect(overlap.overlapArea).toBe(50 * 25); // 50px width overlap × 25px height overlap
    });

    it('should detect overlaps when nodes overlap completely', () => {
      // Create 2 completely overlapping nodes (same position and size)
      const node1 = createMockElement('node-1', 100, 100, 120, 40, 'Node 1');
      const node2 = createMockElement('node-2', 100, 100, 120, 40, 'Node 2');

      mockContainer.querySelectorAll.mockReturnValue([node1, node2]);

      const result = detectNodeOverlaps(mockContainer, false);

      expect(result.hasOverlaps).toBe(true);
      expect(result.overlaps).toHaveLength(1);
      expect(result.overlaps[0].overlapArea).toBe(120 * 40); // Complete overlap
    });

    it('should ignore small elements (handles) and only check content nodes', () => {
      // Create actual content nodes and small handles
      const contentNode1 = createMockElement(
        'node-1',
        0,
        0,
        100,
        50,
        'Content 1'
      );
      const contentNode2 = createMockElement(
        'node-2',
        150,
        0,
        100,
        50,
        'Content 2'
      );
      const handle1 = createMockElement('node-1-handle', 10, 10, 4, 4, ''); // Small handle
      const handle2 = createMockElement('node-2-handle', 160, 10, 4, 4, ''); // Small handle

      mockContainer.querySelectorAll.mockReturnValue([
        contentNode1,
        contentNode2,
        handle1,
        handle2,
      ]);

      const result = detectNodeOverlaps(mockContainer, false);

      expect(result.totalNodes).toBe(2); // Only content nodes counted
      expect(result.hasOverlaps).toBe(false);
    });

    it('should handle multiple overlapping pairs correctly', () => {
      // Create 4 nodes where 3 overlap in different combinations
      const node1 = createMockElement('node-1', 0, 0, 100, 50, 'Node 1');
      const node2 = createMockElement('node-2', 50, 0, 100, 50, 'Node 2'); // Overlaps with node1
      const node3 = createMockElement('node-3', 25, 25, 100, 50, 'Node 3'); // Overlaps with node1 and node2
      const node4 = createMockElement('node-4', 200, 200, 100, 50, 'Node 4'); // No overlap

      mockContainer.querySelectorAll.mockReturnValue([
        node1,
        node2,
        node3,
        node4,
      ]);

      const result = detectNodeOverlaps(mockContainer, false);

      expect(result.hasOverlaps).toBe(true);
      expect(result.overlaps).toHaveLength(3); // 3 overlapping pairs: 1-2, 1-3, 2-3
      expect(result.totalNodes).toBe(4);
    });

    it('should throw error when throwOnOverlap is true and overlaps exist', () => {
      const node1 = createMockElement('node-1', 0, 0, 100, 50, 'Node 1');
      const node2 = createMockElement('node-2', 50, 25, 100, 50, 'Node 2');

      mockContainer.querySelectorAll.mockReturnValue([node1, node2]);

      expect(() => {
        detectNodeOverlaps(mockContainer, true);
      }).toThrow('Mindmap Layout Error');
    });

    it('should calculate overlap areas correctly', () => {
      // Test specific overlap area calculation
      const node1 = createMockElement('node-1', 0, 0, 100, 60, 'Node 1');
      const node2 = createMockElement('node-2', 80, 40, 100, 60, 'Node 2');

      mockContainer.querySelectorAll.mockReturnValue([node1, node2]);

      const result = detectNodeOverlaps(mockContainer, false);

      expect(result.hasOverlaps).toBe(true);

      // Expected overlap calculation:
      // X overlap: min(0+100, 80+100) - max(0, 80) = 100 - 80 = 20
      // Y overlap: min(0+60, 40+60) - max(0, 40) = 60 - 40 = 20
      // Area: 20 × 20 = 400
      expect(result.overlaps[0].overlapArea).toBe(400);
    });

    it('should work with default document when no container provided', () => {
      const node1 = createMockElement('node-1', 0, 0, 100, 50, 'Node 1');
      const node2 = createMockElement('node-2', 150, 0, 100, 50, 'Node 2');

      global.document.querySelectorAll = vi
        .fn()
        .mockReturnValue([node1, node2]);

      const result = detectNodeOverlaps(undefined, false);

      expect(result.totalNodes).toBe(2);
      expect(result.hasOverlaps).toBe(false);
    });
  });
});
