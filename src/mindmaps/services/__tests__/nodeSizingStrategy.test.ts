import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DefaultNodeSizingStrategy,
  type NodeSizingStrategy,
} from '../nodeSizingStrategy';
import * as textMeasurementService from '../textMeasurementService';
import { NODE_SIZING } from '../../constants/nodeSizing';

// Mock the text measurement service
vi.mock('../textMeasurementService', () => ({
  calculateTextDimensions: vi.fn(),
}));

describe('Node Sizing Strategy', () => {
  let strategy: NodeSizingStrategy;

  beforeEach(() => {
    strategy = new DefaultNodeSizingStrategy();
    vi.clearAllMocks();
  });

  describe('DefaultNodeSizingStrategy', () => {
    it('should size node based on label text', () => {
      // Mock returns dimensions that already include component padding
      const mockDimensions = { width: 150, height: 32 };
      vi.mocked(textMeasurementService.calculateTextDimensions).mockReturnValue(
        mockDimensions
      );

      const result = strategy.calculateNodeSize('Short Label');

      expect(
        textMeasurementService.calculateTextDimensions
      ).toHaveBeenCalledWith({
        text: 'Short Label',
        fontSize: NODE_SIZING.DEFAULT_FONT_SIZE,
        fontFamily: NODE_SIZING.DEFAULT_FONT_FAMILY,
        fontWeight: NODE_SIZING.DEFAULT_FONT_WEIGHT,
        padding: NODE_SIZING.DEFAULT_PADDING,
        minWidth: NODE_SIZING.MIN_WIDTH,
        maxWidth: NODE_SIZING.MAX_WIDTH,
      });
      // Result should be the base dimensions (which already include component padding)
      expect(result).toEqual({ width: 150, height: 32 });
    });

    it('should not add extra width for icons since they are positioned absolutely', () => {
      const mockDimensions = { width: 150, height: 32 };
      vi.mocked(textMeasurementService.calculateTextDimensions).mockReturnValue(
        mockDimensions
      );

      const withoutIcons = strategy.calculateNodeSize('Test Label');
      const withIcons = strategy.calculateNodeSize('Test Label', {
        hasIcons: true,
      });

      // Icons are positioned absolutely outside the node bounds,
      // so they should not affect the node width
      expect(withIcons.width).toBe(withoutIcons.width);
      expect(withIcons.height).toBe(withoutIcons.height);
    });

    it('should handle editing mode with extra space', () => {
      const mockDimensions = { width: 150, height: 32 };
      vi.mocked(textMeasurementService.calculateTextDimensions).mockReturnValue(
        mockDimensions
      );

      const normal = strategy.calculateNodeSize('Edit Me');
      const editing = strategy.calculateNodeSize('Edit Me', {
        isEditing: true,
      });

      // Editing mode should add extra width for cursor and comfortable typing
      expect(editing.width).toBe(
        normal.width + NODE_SIZING.EDITING_EXTRA_WIDTH
      ); // Extra space for cursor
      expect(editing.height).toBe(normal.height); // Height should be the same
    });

    it('should apply different sizing for root nodes', () => {
      const mockDimensions = { width: 150, height: 32 };
      vi.mocked(textMeasurementService.calculateTextDimensions).mockReturnValue(
        mockDimensions
      );

      strategy.calculateNodeSize('Node', { level: 1 });
      const rootNode = strategy.calculateNodeSize('Node', { level: 0 });

      // Root nodes should be larger
      const expectedChildWidth = 150;
      const expectedChildHeight = 32;
      const expectedRootWidth = Math.round(
        expectedChildWidth * NODE_SIZING.ROOT_NODE_WIDTH_MULTIPLIER
      );
      const expectedRootHeight = Math.round(
        expectedChildHeight * NODE_SIZING.ROOT_NODE_HEIGHT_MULTIPLIER
      );
      expect(rootNode.width).toBe(expectedRootWidth); // 10% larger
      expect(rootNode.height).toBe(expectedRootHeight); // 20% taller
    });

    it('should handle very long text with wrapping', () => {
      const longText =
        'This is an extremely long node label that would traditionally be constrained but should now wrap when it exceeds the maximum width';
      // Mock wrapped dimensions (text wrapped to multiple lines)
      const mockDimensions = { width: 600, height: 48 }; // Width capped at maxWidth, height increased for 2 lines
      vi.mocked(textMeasurementService.calculateTextDimensions).mockReturnValue(
        mockDimensions
      );

      const result = strategy.calculateNodeSize(longText);

      // Should match the wrapped dimensions
      expect(result.width).toBe(600);
      expect(result.height).toBe(48);
    });

    it('should combine multiple options correctly', () => {
      const mockDimensions = { width: 200, height: 32 };
      vi.mocked(textMeasurementService.calculateTextDimensions).mockReturnValue(
        mockDimensions
      );

      const result = strategy.calculateNodeSize('Complex Node', {
        isEditing: true,
        hasIcons: true,
        level: 0,
      });

      // Should apply only editing and root modifiers (icons don't affect width)
      const baseWidth = 200;
      const withEditing = baseWidth + NODE_SIZING.EDITING_EXTRA_WIDTH;
      const asRoot = Math.round(
        withEditing * NODE_SIZING.ROOT_NODE_WIDTH_MULTIPLIER
      );

      expect(result.width).toBe(asRoot);
      const baseHeight = 32;
      expect(result.height).toBe(
        Math.round(baseHeight * NODE_SIZING.ROOT_NODE_HEIGHT_MULTIPLIER)
      ); // Root node height modifier
    });

    it('should handle empty text', () => {
      const mockDimensions = { width: 120, height: 32 }; // Minimum size
      vi.mocked(textMeasurementService.calculateTextDimensions).mockReturnValue(
        mockDimensions
      );

      const result = strategy.calculateNodeSize('');

      // Should use minimum dimensions
      expect(result.width).toBe(120);
      expect(result.height).toBe(32);
    });

    it('should pass through font customization options', () => {
      const mockDimensions = { width: 200, height: 40 };
      vi.mocked(textMeasurementService.calculateTextDimensions).mockReturnValue(
        mockDimensions
      );

      const result = strategy.calculateNodeSize('Custom Font', {
        fontSize: '16px',
        fontWeight: 'bold',
      });

      expect(
        textMeasurementService.calculateTextDimensions
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          fontSize: '16px',
          fontWeight: 'bold',
        })
      );
      // Result should match the font-specific dimensions
      expect(result).toEqual({ width: 200, height: 40 });
    });

    it('should handle collapsed nodes without changing size', () => {
      const mockDimensions = { width: 150, height: 32 };
      vi.mocked(textMeasurementService.calculateTextDimensions).mockReturnValue(
        mockDimensions
      );

      const expanded = strategy.calculateNodeSize('Collapsible', {
        isCollapsed: false,
      });
      const collapsed = strategy.calculateNodeSize('Collapsible', {
        isCollapsed: true,
      });

      // Collapsed nodes should have the same width since the collapse button
      // is positioned absolutely outside the node bounds
      expect(collapsed.width).toBe(expanded.width);
      expect(collapsed.height).toBe(expanded.height);
    });

    it('should support custom padding', () => {
      const mockDimensions = { width: 200, height: 50 };
      vi.mocked(textMeasurementService.calculateTextDimensions).mockReturnValue(
        mockDimensions
      );

      const result = strategy.calculateNodeSize('Padded Node', {
        padding: { left: 24, right: 24, top: 12, bottom: 12 },
      });

      expect(
        textMeasurementService.calculateTextDimensions
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          padding: { left: 24, right: 24, top: 12, bottom: 12 },
        })
      );
      // Result should match the custom padding dimensions
      expect(result).toEqual({ width: 200, height: 50 });
    });
  });
});
