// Common LCD display constants and utilities
export const LCD_SIZES = {
  small: { dotSize: 1, charSpacing: 1 },
  medium: { dotSize: 2, charSpacing: 2 },
  large: { dotSize: 3, charSpacing: 3 },
} as const;

export type LCDSize = keyof typeof LCD_SIZES;

export const LCD_COLORS = {
  lit: '#E3F2FD',
  unlit: 'rgba(147, 197, 253, 0.1)',
  unlitGrid: 'rgba(147, 197, 253, 0.3)',
  glow: '#3b82f6',
} as const;

export const LCD_TIMING = {
  scrollInterval: 500, // milliseconds
} as const;
