export type VRAMSafetyLevel =
  | 'safe'
  | 'caution'
  | 'risky'
  | 'unsafe'
  | 'unknown';

export interface VRAMSafetyInfo {
  level: VRAMSafetyLevel;
  color: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  icon: string;
  description: string;
  percentageUsed: number;
}

/**
 * Calculate VRAM safety level based on required vs available VRAM
 * @param requiredMB Required VRAM in MB (conservative estimate)
 * @param availableMB Available VRAM in MB
 * @returns Safety level information
 */
export function calculateVRAMSafety(
  requiredMB: number | undefined,
  availableMB: number | undefined
): VRAMSafetyInfo {
  // Handle missing data
  if (!requiredMB || !availableMB || availableMB <= 0) {
    return {
      level: 'unknown',
      color: 'text-gray-400',
      bgColor: 'bg-gray-700',
      borderColor: 'border-gray-600',
      textColor: 'text-gray-300',
      icon: '⚫',
      description: 'VRAM data unavailable',
      percentageUsed: 0,
    };
  }

  const percentageUsed = (requiredMB / availableMB) * 100;

  if (percentageUsed > 100) {
    return {
      level: 'unsafe',
      color: 'text-red-500',
      bgColor: 'bg-red-900/30',
      borderColor: 'border-red-600',
      textColor: 'text-red-400',
      icon: '🔴',
      description: `Exceeds available VRAM by ${Math.round(percentageUsed - 100)}%`,
      percentageUsed,
    };
  }

  if (percentageUsed > 90) {
    return {
      level: 'risky',
      color: 'text-orange-500',
      bgColor: 'bg-orange-900/30',
      borderColor: 'border-orange-600',
      textColor: 'text-orange-400',
      icon: '🟠',
      description: `Uses ${Math.round(percentageUsed)}% of available VRAM (risky)`,
      percentageUsed,
    };
  }

  if (percentageUsed > 70) {
    return {
      level: 'caution',
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-900/30',
      borderColor: 'border-yellow-600',
      textColor: 'text-yellow-400',
      icon: '🟡',
      description: `Uses ${Math.round(percentageUsed)}% of available VRAM (proceed with caution)`,
      percentageUsed,
    };
  }

  return {
    level: 'safe',
    color: 'text-green-500',
    bgColor: 'bg-green-900/30',
    borderColor: 'border-green-600',
    textColor: 'text-green-400',
    icon: '🟢',
    description: `Uses ${Math.round(percentageUsed)}% of available VRAM (safe to run)`,
    percentageUsed,
  };
}

/**
 * Format bytes to human-readable size
 * @param bytes Size in bytes
 * @returns Formatted string (e.g., "4.5 GB")
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return '0 B';
  }
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Get the best context size for available VRAM
 * @param vramEstimates Array of VRAM estimates for different context sizes
 * @param availableMB Available VRAM in MB
 * @returns Index of the recommended context size, or -1 if none are safe
 */
export function getRecommendedContextSize(
  vramEstimates: Array<{
    conservative: number;
    config: { contextSize: number };
  }>,
  availableMB: number
): number {
  if (!vramEstimates || vramEstimates.length === 0 || !availableMB) {
    return -1;
  }

  // Find the largest context size that's still safe (< 70% of available VRAM)
  const safeThreshold = availableMB * 0.7;

  for (let i = vramEstimates.length - 1; i >= 0; i--) {
    if (vramEstimates[i].conservative <= safeThreshold) {
      return i;
    }
  }

  return -1; // No safe option
}

/**
 * Get a summary safety level for a model based on all its VRAM estimates
 * @param vramEstimates Array of VRAM estimates
 * @param availableMB Available VRAM in MB
 * @returns Overall safety level
 */
export function getModelSafetyLevel(
  vramEstimates: Array<{ conservative: number }> | undefined,
  availableMB: number | undefined
): VRAMSafetyLevel {
  if (!vramEstimates || vramEstimates.length === 0 || !availableMB) {
    return 'unknown';
  }

  // Check the smallest context size (most likely to fit)
  const minRequirement = Math.min(...vramEstimates.map(e => e.conservative));
  const safety = calculateVRAMSafety(minRequirement, availableMB);

  return safety.level;
}
