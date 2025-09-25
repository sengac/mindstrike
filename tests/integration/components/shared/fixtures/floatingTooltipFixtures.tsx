import React from 'react';
import type { FloatingTooltipProps } from '../../../../../src/components/shared/FloatingTooltip';

/**
 * Mock target element positions for testing
 */
export const mockTargetPositions = {
  center: {
    top: 300,
    bottom: 320,
    left: 400,
    right: 500,
    width: 100,
    height: 20,
    x: 400,
    y: 300,
  },
  topEdge: {
    top: 5,
    bottom: 25,
    left: 400,
    right: 500,
    width: 100,
    height: 20,
    x: 400,
    y: 5,
  },
  bottomEdge: {
    top: window.innerHeight - 25,
    bottom: window.innerHeight - 5,
    left: 400,
    right: 500,
    width: 100,
    height: 20,
    x: 400,
    y: window.innerHeight - 25,
  },
  leftEdge: {
    top: 300,
    bottom: 320,
    left: 5,
    right: 105,
    width: 100,
    height: 20,
    x: 5,
    y: 300,
  },
  rightEdge: {
    top: 300,
    bottom: 320,
    left: window.innerWidth - 105,
    right: window.innerWidth - 5,
    width: 100,
    height: 20,
    x: window.innerWidth - 105,
    y: 300,
  },
};

/**
 * Sample tooltip content for testing
 */
export const sampleTooltipContent = {
  simple: 'This is a simple tooltip',
  complex: (
    <div>
      <h3 className="font-bold">Complex Tooltip</h3>
      <p>This tooltip has multiple elements</p>
      <ul>
        <li>Item 1</li>
        <li>Item 2</li>
      </ul>
    </div>
  ),
  contextHelp: (
    <div className="text-xs text-gray-300 space-y-2" style={{ width: '260px' }}>
      <p className="font-semibold text-gray-200 whitespace-normal">
        What is Training Context?
      </p>
      <p className="whitespace-normal leading-relaxed">
        The training context (or context window) is the maximum number of tokens
        the model can process at once. This includes both your input and the
        model's response.
      </p>
      <p className="text-gray-400 whitespace-normal leading-relaxed">
        <span className="font-medium">Note:</span> This is the absolute maximum.
        Actual usable context may be limited by available VRAM.
      </p>
    </div>
  ),
};

/**
 * Default props for FloatingTooltip testing
 */
export const defaultTooltipProps: Partial<FloatingTooltipProps> = {
  isVisible: true,
  placement: 'auto',
  offset: 8,
  className: '',
};

/**
 * Mock ref creation helper
 */
export function createMockRef<T extends HTMLElement>(
  tagName: string = 'div'
): React.RefObject<T> {
  const element = document.createElement(tagName) as T;
  return { current: element };
}

/**
 * Helper to mock element getBoundingClientRect
 */
export function mockElementPosition(
  element: HTMLElement,
  position: DOMRect | Record<string, number>
) {
  element.getBoundingClientRect = () => position as DOMRect;
  return element;
}
