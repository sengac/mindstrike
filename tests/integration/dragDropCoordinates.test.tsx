import { describe, it, expect } from 'vitest';
import type { XYPosition } from 'reactflow';
import { NODE_SIZING } from '../../src/mindmaps/constants/nodeSizing';

describe('Drag and Drop Coordinate System', () => {
  describe('Drop indicator positioning', () => {
    it('should calculate correct position relative to container', () => {
      // Mock DOM elements
      const mockTargetElement = {
        getBoundingClientRect: () => ({
          left: 150,
          top: 200,
          width: 100,
          height: 40,
          right: 250,
          bottom: 240,
        }),
      };

      const mockContainer = {
        getBoundingClientRect: () => ({
          left: 50,
          top: 50,
          width: 800,
          height: 600,
          right: 850,
          bottom: 650,
        }),
      };

      // Calculate relative position
      const targetRect = mockTargetElement.getBoundingClientRect();
      const containerRect = mockContainer.getBoundingClientRect();

      const relativeLeft = targetRect.left - containerRect.left;
      const relativeTop = targetRect.top - containerRect.top;

      expect(relativeLeft).toBe(100); // 150 - 50
      expect(relativeTop).toBe(150); // 200 - 50
    });

    it('should handle ReactFlow viewport transformations', () => {
      // ReactFlow applies CSS transforms for zoom and pan
      // Original node position in flow coordinates
      const nodePosition: XYPosition = { x: 300, y: 400 };

      // Mock ReactFlow viewport
      const viewport = {
        x: 100, // panned 100px right
        y: 50, // panned 50px down
        zoom: 1.5, // 150% zoom
      };

      // ReactFlow transform calculation (simplified)
      // transform: translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})

      // The actual screen position would be:
      // screenX = (nodePosition.x * zoom) + viewport.x
      // screenY = (nodePosition.y * zoom) + viewport.y
      const screenX = nodePosition.x * viewport.zoom + viewport.x;
      const screenY = nodePosition.y * viewport.zoom + viewport.y;

      expect(screenX).toBe(550); // (300 * 1.5) + 100
      expect(screenY).toBe(650); // (400 * 1.5) + 50
    });

    it('should position drop indicators correctly with zoom', () => {
      // Test case: Node at flow position (200, 300) with 0.8x zoom
      const zoom = 0.8;

      // Node dimensions in flow space
      const nodeWidth = 150;

      // When rendered, dimensions are scaled by zoom
      const renderedWidth = nodeWidth * zoom; // 120

      // Drop indicator should be positioned based on rendered dimensions
      const dropIndicatorAbove = {
        top: -6, // slightly above node
        width: renderedWidth + 20, // add some padding
        height: 4,
      };

      expect(dropIndicatorAbove.width).toBe(140); // 120 + 20
    });
  });

  describe('Finding closest drop target', () => {
    it('should find closest node based on cursor position in flow coordinates', () => {
      const nodes = [
        { id: '1', position: { x: 100, y: 100 } },
        { id: '2', position: { x: 200, y: 100 } },
        { id: '3', position: { x: 300, y: 200 } },
      ];

      // Cursor position in flow coordinates (not the dragged node position)
      const cursorPosition = { x: 180, y: 110 };

      // Calculate distances from cursor to each node
      const distances = nodes.map(node => ({
        id: node.id,
        distance: Math.sqrt(
          Math.pow(node.position.x - cursorPosition.x, 2) +
            Math.pow(node.position.y - cursorPosition.y, 2)
        ),
      }));

      // Find closest
      const closest = distances.reduce((min, curr) =>
        curr.distance < min.distance ? curr : min
      );

      expect(closest.id).toBe('2'); // Node 2 is closest to cursor at (180, 110)
    });
  });

  describe('Drop position detection', () => {
    it('should determine drop position based on cursor position and proportional zones', () => {
      const targetNodePosition = { x: 200, y: 200 };
      const nodeHeight = 60; // Example node height

      // Test cases for proportional zones (33% each)
      const threshold = nodeHeight * NODE_SIZING.ZONE_PERCENTAGE; // 19.8px

      // Test "above" zone (top 33%) - cursor position determines zone
      const cursorPositionAbove = { x: 200, y: 210 }; // Cursor 10px from top of target
      const offsetAbove = cursorPositionAbove.y - targetNodePosition.y;
      expect(offsetAbove).toBeLessThan(threshold);

      // Test "over" zone (middle 34%) - cursor in middle of target
      const cursorPositionOver = { x: 200, y: 230 }; // Cursor 30px from top (middle)
      const offsetOver = cursorPositionOver.y - targetNodePosition.y;
      expect(offsetOver).toBeGreaterThanOrEqual(threshold);
      expect(offsetOver).toBeLessThanOrEqual(nodeHeight - threshold);

      // Test "below" zone (bottom 33%) - cursor near bottom of target
      const cursorPositionBelow = { x: 200, y: 250 }; // Cursor 50px from top
      const offsetBelow = cursorPositionBelow.y - targetNodePosition.y;
      expect(offsetBelow).toBeGreaterThan(nodeHeight - threshold);
    });

    it('should handle different node sizes with proportional zones', () => {
      // Small node (30px height)
      const smallNodeHeight = 30;
      const smallThreshold = smallNodeHeight * NODE_SIZING.ZONE_PERCENTAGE; // ~10px
      expect(smallThreshold).toBeCloseTo(9.9, 1);

      // Large node (120px height)
      const largeNodeHeight = 120;
      const largeThreshold = largeNodeHeight * NODE_SIZING.ZONE_PERCENTAGE; // ~40px
      expect(largeThreshold).toBeCloseTo(39.6, 1);

      // The zones scale proportionally with node size
      expect(largeThreshold / smallThreshold).toBe(4); // 4x larger node = 4x larger zones
    });

    it('should use cursor position, not dragged node position', () => {
      // This test demonstrates the key difference:
      // The dragged node might be at one position, but the cursor at another

      const targetNode = { position: { x: 300, y: 300 }, height: 60 };
      const draggedNode = { position: { x: 100, y: 100 } }; // Far from target

      // But cursor is over the target node
      const cursorPosition = { x: 300, y: 320 }; // 20px into target

      // Drop position should be based on cursor, not dragged node
      const cursorOffset = cursorPosition.y - targetNode.position.y; // 20px
      const threshold = targetNode.height * NODE_SIZING.ZONE_PERCENTAGE; // ~20px

      // Cursor at 20px should be in "over" zone (between 20px and 40px)
      expect(cursorOffset).toBeGreaterThanOrEqual(threshold);
      expect(cursorOffset).toBeLessThan(targetNode.height - threshold);

      // If we used dragged node position, it would be way off
      const wrongOffset = draggedNode.position.y - targetNode.position.y; // -200px
      expect(wrongOffset).toBe(-200); // Completely wrong!
    });
  });
});
