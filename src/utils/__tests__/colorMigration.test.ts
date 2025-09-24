import { describe, it, expect } from 'vitest';
import {
  migrateCustomColors,
  needsColorMigration,
  migrateNodeData,
} from '../colorMigration';

describe('colorMigration', () => {
  describe('migrateCustomColors', () => {
    it('should migrate Tailwind class format', () => {
      expect(
        migrateCustomColors({ backgroundClass: 'bg-blue-500 border-blue-400' })
      ).toBe('blue');
      expect(migrateCustomColors({ backgroundClass: 'bg-green-500' })).toBe(
        'green'
      );
      expect(migrateCustomColors({ backgroundClass: 'bg-purple-500' })).toBe(
        'purple'
      );
    });

    it('should migrate hex color format', () => {
      expect(migrateCustomColors({ backgroundColor: '#3b82f6' })).toBe('blue');
      expect(migrateCustomColors({ backgroundColor: '#22c55e' })).toBe('green');
      expect(migrateCustomColors({ backgroundColor: '#a855f7' })).toBe(
        'purple'
      );
    });

    it('should migrate legacy hex colors', () => {
      expect(migrateCustomColors({ backgroundColor: '#10b981' })).toBe('green');
      expect(migrateCustomColors({ backgroundColor: '#8b5cf6' })).toBe(
        'purple'
      );
      expect(migrateCustomColors({ backgroundColor: '#f59e0b' })).toBe(
        'orange'
      );
    });

    it('should return null for unknown colors', () => {
      expect(migrateCustomColors({ backgroundColor: '#000000' })).toBeNull();
      expect(
        migrateCustomColors({ backgroundClass: 'bg-unknown-500' })
      ).toBeNull();
    });

    it('should return null for null/undefined input', () => {
      expect(migrateCustomColors(null)).toBeNull();
      expect(migrateCustomColors(undefined)).toBeNull();
    });
  });

  describe('needsColorMigration', () => {
    it('should return true when customColors exists but colorTheme does not', () => {
      expect(
        needsColorMigration({ customColors: { backgroundColor: '#3b82f6' } })
      ).toBe(true);
    });

    it('should return false when colorTheme exists', () => {
      expect(needsColorMigration({ colorTheme: 'blue' })).toBe(false);
      expect(
        needsColorMigration({
          customColors: { backgroundColor: '#3b82f6' },
          colorTheme: 'blue',
        })
      ).toBe(false);
    });

    it('should return false when neither exists', () => {
      expect(needsColorMigration({})).toBe(false);
    });
  });

  describe('migrateNodeData', () => {
    it('should migrate node data with customColors', () => {
      const input = {
        id: 'node-1',
        label: 'Test Node',
        customColors: { backgroundColor: '#3b82f6', borderColor: '#2563eb' },
      };

      const result = migrateNodeData(input);

      expect(result).toEqual({
        id: 'node-1',
        label: 'Test Node',
        colorTheme: 'blue',
      });
      expect('customColors' in result).toBe(false);
    });

    it('should not modify node data without customColors', () => {
      const input = {
        id: 'node-1',
        label: 'Test Node',
        colorTheme: 'green' as const,
      };

      const result = migrateNodeData(input);

      expect(result).toEqual({
        id: 'node-1',
        label: 'Test Node',
        colorTheme: 'green',
      });
    });

    it('should handle node data with both customColors and colorTheme', () => {
      const input = {
        id: 'node-1',
        label: 'Test Node',
        customColors: { backgroundColor: '#3b82f6' },
        colorTheme: 'green' as const,
      };

      const result = migrateNodeData(input);

      expect(result).toEqual({
        id: 'node-1',
        label: 'Test Node',
        colorTheme: 'green',
      });
    });
  });
});
