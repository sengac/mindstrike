/**
 * Real overlap detection test with actual DOM-like conditions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { detectNodeOverlaps } from '../../src/utils/overlapDetection';

// Create realistic mock elements that simulate the actual browser DOM
const createRealisticMockElement = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string
) => ({
  getAttribute: (name: string) => (name === 'data-id' ? id : null),
  textContent: label,
  getBoundingClientRect: () => ({
    x,
    y,
    width,
    height,
    top: y,
    left: x,
    bottom: y + height,
    right: x + width,
    toJSON: () => ({}),
  }),
});

describe('Real Overlap Detection Test', () => {
  it('should detect obvious overlaps that would be visible to users', () => {
    // Create a realistic scenario with nodes that clearly overlap
    const node1 = createRealisticMockElement(
      'node-1',
      100,
      100,
      200,
      50,
      'First Node'
    );
    const node2 = createRealisticMockElement(
      'node-2',
      150,
      110,
      200,
      50,
      'Second Node'
    ); // Clearly overlaps
    const node3 = createRealisticMockElement(
      'node-3',
      400,
      100,
      200,
      50,
      'Third Node'
    ); // No overlap

    const mockContainer = {
      querySelectorAll: vi.fn().mockReturnValue([node1, node2, node3]),
    };

    const result = detectNodeOverlaps(mockContainer, false);

    console.log('Test result:', {
      hasOverlaps: result.hasOverlaps,
      totalNodes: result.totalNodes,
      overlapCount: result.overlaps.length,
      message: result.message,
    });

    // This SHOULD detect overlaps
    expect(result.hasOverlaps).toBe(true);
    expect(result.overlaps.length).toBe(1);
    expect(result.totalNodes).toBe(3);

    // Check the specific overlap
    const overlap = result.overlaps[0];
    expect(overlap.node1.id).toBe('node-1');
    expect(overlap.node2.id).toBe('node-2');
    expect(overlap.overlapArea).toBeGreaterThan(0);

    // Calculate expected overlap:
    // Node1: x=100-300, y=100-150
    // Node2: x=150-350, y=110-160
    // Overlap: x=150-300 (150px), y=110-150 (40px) = 6000px²
    expect(overlap.overlapArea).toBe(6000);
  });

  it('should NOT detect overlaps when nodes are properly spaced', () => {
    // Create properly spaced nodes
    const node1 = createRealisticMockElement(
      'node-1',
      100,
      100,
      200,
      50,
      'First Node'
    );
    const node2 = createRealisticMockElement(
      'node-2',
      400,
      100,
      200,
      50,
      'Second Node'
    ); // Far apart
    const node3 = createRealisticMockElement(
      'node-3',
      100,
      200,
      200,
      50,
      'Third Node'
    ); // Below, no overlap

    const mockContainer = {
      querySelectorAll: vi.fn().mockReturnValue([node1, node2, node3]),
    };

    const result = detectNodeOverlaps(mockContainer, false);

    console.log('No overlap test result:', {
      hasOverlaps: result.hasOverlaps,
      totalNodes: result.totalNodes,
      message: result.message,
    });

    expect(result.hasOverlaps).toBe(false);
    expect(result.overlaps.length).toBe(0);
    expect(result.totalNodes).toBe(3);
  });

  it('should simulate the exact mindmap scenario with stacked nodes', () => {
    // Simulate the stacked nodes I can see in the mindmap screenshot
    const nodeA = createRealisticMockElement(
      'node-mindmap-1',
      1100,
      500,
      180,
      40,
      'MCP Node 1'
    );
    const nodeB = createRealisticMockElement(
      'node-mindmap-2',
      1100,
      520,
      180,
      40,
      'MCP Node 2'
    ); // Overlaps
    const nodeC = createRealisticMockElement(
      'node-mindmap-3',
      1100,
      540,
      180,
      40,
      'MCP Node 3'
    ); // Overlaps
    const nodeD = createRealisticMockElement(
      'node-mindmap-4',
      1100,
      560,
      180,
      40,
      'MCP Node 4'
    ); // Overlaps

    const mockContainer = {
      querySelectorAll: vi.fn().mockReturnValue([nodeA, nodeB, nodeC, nodeD]),
    };

    const result = detectNodeOverlaps(mockContainer, false);

    console.log('Mindmap simulation result:', {
      hasOverlaps: result.hasOverlaps,
      totalNodes: result.totalNodes,
      overlapCount: result.overlaps.length,
      message: result.message,
      overlaps: result.overlaps.map(o => ({
        node1: o.node1.label,
        node2: o.node2.label,
        area: o.overlapArea,
      })),
    });

    // With 4 stacked nodes, we should have multiple overlaps
    expect(result.hasOverlaps).toBe(true);
    expect(result.overlaps.length).toBeGreaterThanOrEqual(3); // Should detect multiple overlaps
    expect(result.totalNodes).toBe(4);
  });
});
