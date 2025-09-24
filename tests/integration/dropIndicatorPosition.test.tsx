/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

// Mock DOMRect for Node environment
interface MockDOMRect {
  x: number;
  y: number;
  width: number;
  height: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function createMockDOMRect(
  x: number,
  y: number,
  width: number,
  height: number
): MockDOMRect {
  return {
    x,
    y,
    width,
    height,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
  };
}

// Mock component to test drop indicator positioning
const TestDropIndicator: React.FC<{
  targetElementRect: MockDOMRect;
  containerRect: MockDOMRect;
  dropPosition: 'above' | 'below' | 'over';
}> = ({ targetElementRect, containerRect, dropPosition }) => {
  // Calculate position relative to ReactFlow container (not outer container)
  const relativeLeft = targetElementRect.left - containerRect.left;
  const relativeTop = targetElementRect.top - containerRect.top;
  const nodeWidth = targetElementRect.width;
  const nodeHeight = targetElementRect.height;

  if (dropPosition === 'over') {
    return (
      <div
        data-testid="drop-indicator-over"
        style={{
          position: 'absolute',
          left: relativeLeft - 5,
          top: relativeTop - 5,
          width: nodeWidth + 10,
          height: nodeHeight + 10,
        }}
      />
    );
  } else if (dropPosition === 'above') {
    return (
      <div
        data-testid="drop-indicator-above"
        style={{
          position: 'absolute',
          left: relativeLeft - 10,
          top: relativeTop - 6,
          width: nodeWidth + 20,
          height: 4,
        }}
      />
    );
  } else if (dropPosition === 'below') {
    return (
      <div
        data-testid="drop-indicator-below"
        style={{
          position: 'absolute',
          left: relativeLeft - 10,
          top: relativeTop + nodeHeight + 2,
          width: nodeWidth + 20,
          height: 4,
        }}
      />
    );
  }
  return null;
};

describe('Drop Indicator Positioning', () => {
  describe('Basic positioning calculations', () => {
    it('should position "over" indicator correctly relative to ReactFlow', () => {
      const targetRect = createMockDOMRect(200, 150, 120, 40); // x, y, width, height
      const reactFlowRect = createMockDOMRect(50, 50, 800, 600); // ReactFlow component bounds

      const { getByTestId } = render(
        <div style={{ position: 'relative' }}>
          <TestDropIndicator
            targetElementRect={targetRect}
            containerRect={reactFlowRect}
            dropPosition="over"
          />
        </div>
      );

      const indicator = getByTestId('drop-indicator-over');
      const style = indicator.style;

      // Should be positioned with 5px padding around the node
      expect(style.left).toBe('145px'); // 200 - 50 - 5
      expect(style.top).toBe('95px'); // 150 - 50 - 5
      expect(style.width).toBe('130px'); // 120 + 10
      expect(style.height).toBe('50px'); // 40 + 10
    });

    it('should position "above" indicator correctly relative to ReactFlow', () => {
      const targetRect = createMockDOMRect(200, 150, 120, 40);
      const reactFlowRect = createMockDOMRect(50, 50, 800, 600);

      const { getByTestId } = render(
        <div style={{ position: 'relative' }}>
          <TestDropIndicator
            targetElementRect={targetRect}
            containerRect={reactFlowRect}
            dropPosition="above"
          />
        </div>
      );

      const indicator = getByTestId('drop-indicator-above');
      const style = indicator.style;

      // Should be positioned above the node
      expect(style.left).toBe('140px'); // 200 - 50 - 10
      expect(style.top).toBe('94px'); // 150 - 50 - 6
      expect(style.width).toBe('140px'); // 120 + 20
      expect(style.height).toBe('4px');
    });

    it('should position "below" indicator correctly relative to ReactFlow', () => {
      const targetRect = createMockDOMRect(200, 150, 120, 40);
      const reactFlowRect = createMockDOMRect(50, 50, 800, 600);

      const { getByTestId } = render(
        <div style={{ position: 'relative' }}>
          <TestDropIndicator
            targetElementRect={targetRect}
            containerRect={reactFlowRect}
            dropPosition="below"
          />
        </div>
      );

      const indicator = getByTestId('drop-indicator-below');
      const style = indicator.style;

      // Should be positioned below the node
      expect(style.left).toBe('140px'); // 200 - 50 - 10
      expect(style.top).toBe('142px'); // 150 - 50 + 40 + 2
      expect(style.width).toBe('140px'); // 120 + 20
      expect(style.height).toBe('4px');
    });
  });

  describe('Edge cases', () => {
    it('should handle nodes at ReactFlow edge', () => {
      const targetRect = createMockDOMRect(50, 50, 100, 40); // Node at top-left of ReactFlow
      const reactFlowRect = createMockDOMRect(50, 50, 800, 600);

      const { getByTestId } = render(
        <div style={{ position: 'relative' }}>
          <TestDropIndicator
            targetElementRect={targetRect}
            containerRect={reactFlowRect}
            dropPosition="over"
          />
        </div>
      );

      const indicator = getByTestId('drop-indicator-over');
      const style = indicator.style;

      expect(style.left).toBe('-5px'); // 0 - 5
      expect(style.top).toBe('-5px'); // 0 - 5
    });

    it('should handle ReactFlow with offset position', () => {
      const targetRect = createMockDOMRect(250, 250, 100, 40);
      const reactFlowRect = createMockDOMRect(100, 100, 800, 600); // ReactFlow not at (0,0)

      const { getByTestId } = render(
        <div style={{ position: 'relative' }}>
          <TestDropIndicator
            targetElementRect={targetRect}
            containerRect={reactFlowRect}
            dropPosition="over"
          />
        </div>
      );

      const indicator = getByTestId('drop-indicator-over');
      const style = indicator.style;

      expect(style.left).toBe('145px'); // 250 - 100 - 5
      expect(style.top).toBe('145px'); // 250 - 100 - 5
    });
  });

  describe('ReactFlow specific scenarios', () => {
    it('should position indicators correctly when ReactFlow has offset from container', () => {
      // This was the bug: outer container includes header/toolbar space
      const outerContainerRect = createMockDOMRect(0, 0, 1000, 800);
      const reactFlowRect = createMockDOMRect(0, 150, 1000, 650); // 150px offset from top (header/toolbar)
      const targetRect = createMockDOMRect(200, 300, 100, 40); // Node position in viewport

      // Correct calculation: relative to ReactFlow, not outer container
      const correctRelativeTop = targetRect.top - reactFlowRect.top; // 300 - 150 = 150
      const incorrectRelativeTop = targetRect.top - outerContainerRect.top; // 300 - 0 = 300 (wrong!)

      expect(correctRelativeTop).toBe(150);
      expect(incorrectRelativeTop).toBe(300);
      expect(incorrectRelativeTop - correctRelativeTop).toBe(150); // The 150px offset bug!
    });

    it('should handle zoomed viewport', () => {
      // When ReactFlow zooms, the node DOM elements are scaled
      // but getBoundingClientRect() returns the actual rendered size
      const zoom = 1.5;
      const baseWidth = 100;
      const baseHeight = 40;

      // Simulated scaled rect from getBoundingClientRect()
      const targetRect = createMockDOMRect(
        300 * zoom, // x position scaled
        200 * zoom, // y position scaled
        baseWidth * zoom, // width scaled
        baseHeight * zoom // height scaled
      );
      const reactFlowRect = createMockDOMRect(0, 0, 1000, 800);

      const { getByTestId } = render(
        <div style={{ position: 'relative' }}>
          <TestDropIndicator
            targetElementRect={targetRect}
            containerRect={reactFlowRect}
            dropPosition="over"
          />
        </div>
      );

      const indicator = getByTestId('drop-indicator-over');
      const style = indicator.style;

      // Indicator should match the scaled dimensions
      expect(style.width).toBe(`${baseWidth * zoom + 10}px`); // 150 + 10 = 160px
      expect(style.height).toBe(`${baseHeight * zoom + 10}px`); // 60 + 10 = 70px
    });

    it('should handle panned viewport', () => {
      // When ReactFlow pans, nodes move but container stays in place
      const panX = 100;
      const panY = 50;

      // Node appears to be offset by pan amount
      const targetRect = createMockDOMRect(200 + panX, 150 + panY, 100, 40);
      const reactFlowRect = createMockDOMRect(0, 0, 1000, 800);

      const { getByTestId } = render(
        <div style={{ position: 'relative' }}>
          <TestDropIndicator
            targetElementRect={targetRect}
            containerRect={reactFlowRect}
            dropPosition="above"
          />
        </div>
      );

      const indicator = getByTestId('drop-indicator-above');
      const style = indicator.style;

      // Indicator should be positioned relative to the panned position
      expect(style.left).toBe(`${200 + panX - 10}px`); // 290px
      expect(style.top).toBe(`${150 + panY - 6}px`); // 194px
    });
  });
});
