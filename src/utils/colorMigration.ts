/**
 * Migration utilities for converting old customColors to new colorTheme format
 */

import type { NodeColorThemeType } from '../mindmaps/constants/nodeColors';

interface OldCustomColors {
  backgroundClass?: string;
  foregroundClass?: string;
  backgroundColor?: string;
  borderColor?: string;
  foregroundColor?: string;
}

/**
 * Map old Tailwind classes or hex colors to new color themes
 */
const COLOR_MIGRATION_MAP: Record<string, NodeColorThemeType> = {
  // Tailwind class mappings
  'bg-blue-500': 'blue',
  'bg-green-500': 'green',
  'bg-purple-500': 'purple',
  'bg-orange-500': 'orange',
  'bg-pink-500': 'pink',
  'bg-red-500': 'red',
  'bg-cyan-500': 'cyan',
  'bg-lime-500': 'lime',

  // Hex color mappings (exact matches)
  '#3b82f6': 'blue',
  '#22c55e': 'green',
  '#a855f7': 'purple',
  '#f97316': 'orange',
  '#ec4899': 'pink',
  '#ef4444': 'red',
  '#06b6d4': 'cyan',
  '#84cc16': 'lime',

  // Legacy hex mappings (close matches from previous implementation)
  '#10b981': 'green', // Was using emerald-500 instead of green-500
  '#8b5cf6': 'purple', // Was using violet-500 instead of purple-500
  '#f59e0b': 'orange', // Was using amber-500 instead of orange-500
};

/**
 * Migrate old customColors format to new colorTheme
 */
export function migrateCustomColors(
  customColors: OldCustomColors | null | undefined
): NodeColorThemeType | null {
  if (!customColors) {
    return null;
  }

  // Check Tailwind class format
  if (customColors.backgroundClass) {
    const theme =
      COLOR_MIGRATION_MAP[customColors.backgroundClass.split(' ')[0]];
    if (theme) {
      return theme;
    }
  }

  // Check hex color format
  if (customColors.backgroundColor) {
    const theme = COLOR_MIGRATION_MAP[customColors.backgroundColor];
    if (theme) {
      return theme;
    }
  }

  // No matching theme found
  return null;
}

/**
 * Node data with potential old format
 */
export interface NodeDataWithLegacyColors {
  customColors?: OldCustomColors | null;
  colorTheme?: NodeColorThemeType | null;
}

/**
 * Check if a node data object needs migration
 */
export function needsColorMigration(
  nodeData: NodeDataWithLegacyColors
): boolean {
  return (
    nodeData.customColors !== undefined && nodeData.colorTheme === undefined
  );
}

/**
 * Migrate node data from old format to new format
 */
export function migrateNodeData<T extends NodeDataWithLegacyColors>(
  nodeData: T
): Omit<T, 'customColors'> & { colorTheme: NodeColorThemeType | null } {
  if (!needsColorMigration(nodeData)) {
    const { customColors, ...rest } = nodeData;
    return rest as Omit<T, 'customColors'> & {
      colorTheme: NodeColorThemeType | null;
    };
  }

  const { customColors, ...rest } = nodeData;
  const colorTheme = migrateCustomColors(customColors);

  return {
    ...rest,
    colorTheme,
  } as Omit<T, 'customColors'> & { colorTheme: NodeColorThemeType | null };
}
