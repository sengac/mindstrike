/**
 * Node color theme definitions
 * These are the available color presets for mind map nodes
 */

export const NodeColorTheme = {
  Blue: 'blue',
  Green: 'green',
  Purple: 'purple',
  Orange: 'orange',
  Pink: 'pink',
  Red: 'red',
  Cyan: 'cyan',
  Lime: 'lime',
} as const;

export type NodeColorTheme =
  (typeof NodeColorTheme)[keyof typeof NodeColorTheme];

export interface NodeColorSet {
  backgroundColor: string;
  borderColor: string;
  foregroundColor: string;
}

// Color definitions for each theme
// Using exact Tailwind CSS color values
export const NODE_COLORS: Record<NodeColorTheme, NodeColorSet> = {
  [NodeColorTheme.Blue]: {
    backgroundColor: '#3b82f6', // blue-500
    borderColor: '#2563eb', // blue-600
    foregroundColor: '#ffffff',
  },
  [NodeColorTheme.Green]: {
    backgroundColor: '#22c55e', // green-500
    borderColor: '#16a34a', // green-600
    foregroundColor: '#ffffff',
  },
  [NodeColorTheme.Purple]: {
    backgroundColor: '#a855f7', // purple-500
    borderColor: '#9333ea', // purple-600
    foregroundColor: '#ffffff',
  },
  [NodeColorTheme.Orange]: {
    backgroundColor: '#f97316', // orange-500
    borderColor: '#ea580c', // orange-600
    foregroundColor: '#ffffff',
  },
  [NodeColorTheme.Pink]: {
    backgroundColor: '#ec4899', // pink-500
    borderColor: '#db2777', // pink-600
    foregroundColor: '#ffffff',
  },
  [NodeColorTheme.Red]: {
    backgroundColor: '#ef4444', // red-500
    borderColor: '#dc2626', // red-600
    foregroundColor: '#ffffff',
  },
  [NodeColorTheme.Cyan]: {
    backgroundColor: '#06b6d4', // cyan-500
    borderColor: '#0891b2', // cyan-600
    foregroundColor: '#ffffff',
  },
  [NodeColorTheme.Lime]: {
    backgroundColor: '#84cc16', // lime-500
    borderColor: '#65a30d', // lime-600
    foregroundColor: '#ffffff',
  },
};

// Default colors for nodes without custom themes
export const DEFAULT_NODE_COLORS = {
  root: {
    backgroundColor: '#3b82f6',
    borderColor: '#2563eb',
    foregroundColor: '#ffffff',
  },
  regular: {
    backgroundColor: 'transparent',
    borderColor: '#6b7280',
    foregroundColor: '#ffffff',
  },
};
