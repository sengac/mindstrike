import { describe, it, expect } from 'vitest';
import {
  calculateVRAMSafety,
  formatBytes,
  getRecommendedContextSize,
  getModelSafetyLevel,
} from '../vramSafety';

describe('VRAM Safety Utilities', () => {
  describe('calculateVRAMSafety', () => {
    it('should return safe level when usage is below 70%', () => {
      const result = calculateVRAMSafety(5000, 10000); // 50% usage
      expect(result.level).toBe('safe');
      expect(result.icon).toBe('🟢');
      expect(result.percentageUsed).toBe(50);
      expect(result.description).toContain('50%');
      expect(result.description).toContain('safe to run');
    });

    it('should return caution level when usage is 70-90%', () => {
      const result = calculateVRAMSafety(8000, 10000); // 80% usage
      expect(result.level).toBe('caution');
      expect(result.icon).toBe('🟡');
      expect(result.percentageUsed).toBe(80);
      expect(result.description).toContain('80%');
      expect(result.description).toContain('caution');
    });

    it('should return risky level when usage is 90-100%', () => {
      const result = calculateVRAMSafety(9500, 10000); // 95% usage
      expect(result.level).toBe('risky');
      expect(result.icon).toBe('🟠');
      expect(result.percentageUsed).toBe(95);
      expect(result.description).toContain('95%');
      expect(result.description).toContain('risky');
    });

    it('should return unsafe level when usage exceeds 100%', () => {
      const result = calculateVRAMSafety(12000, 10000); // 120% usage
      expect(result.level).toBe('unsafe');
      expect(result.icon).toBe('🔴');
      expect(result.percentageUsed).toBe(120);
      expect(result.description).toContain('Exceeds');
      expect(result.description).toContain('20%');
    });

    it('should return unknown level when data is missing', () => {
      const result1 = calculateVRAMSafety(undefined, 10000);
      expect(result1.level).toBe('unknown');
      expect(result1.icon).toBe('⚫');

      const result2 = calculateVRAMSafety(5000, undefined);
      expect(result2.level).toBe('unknown');

      const result3 = calculateVRAMSafety(5000, 0);
      expect(result3.level).toBe('unknown');
    });

    it('should handle edge cases correctly', () => {
      // Exactly 70%
      const result1 = calculateVRAMSafety(7000, 10000);
      expect(result1.level).toBe('safe');

      // Exactly 90%
      const result2 = calculateVRAMSafety(9000, 10000);
      expect(result2.level).toBe('caution');

      // Exactly 100%
      const result3 = calculateVRAMSafety(10000, 10000);
      expect(result3.level).toBe('risky');
    });
  });

  describe('formatBytes', () => {
    it('should format bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(512)).toBe('512.0 B');
      expect(formatBytes(1024)).toBe('1.0 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(1048576)).toBe('1.0 MB');
      expect(formatBytes(1073741824)).toBe('1.0 GB');
      expect(formatBytes(5368709120)).toBe('5.0 GB');
      expect(formatBytes(1099511627776)).toBe('1.0 TB');
    });

    it('should handle decimal places correctly', () => {
      expect(formatBytes(1500)).toBe('1.5 KB');
      expect(formatBytes(1234567)).toBe('1.2 MB');
      expect(formatBytes(12345678900)).toBe('11.5 GB');
    });
  });

  describe('getRecommendedContextSize', () => {
    const mockEstimates = [
      { conservative: 2000, config: { contextSize: 2048 } },
      { conservative: 4000, config: { contextSize: 4096 } },
      { conservative: 8000, config: { contextSize: 8192 } },
      { conservative: 16000, config: { contextSize: 16384 } },
    ];

    it('should recommend largest safe context size', () => {
      // With 10GB available, 70% threshold is 7GB
      // Should recommend 4096 context (4GB)
      const result = getRecommendedContextSize(mockEstimates, 10000);
      expect(result).toBe(1); // Index 1 = 4096 context
    });

    it('should return -1 when no options are safe', () => {
      // With only 1GB available, even smallest option (2GB) is unsafe
      const result = getRecommendedContextSize(mockEstimates, 1000);
      expect(result).toBe(-1);
    });

    it('should handle large available VRAM', () => {
      // With 30GB available, all options are safe, should recommend largest
      const result = getRecommendedContextSize(mockEstimates, 30000);
      expect(result).toBe(3); // Index 3 = 16384 context
    });

    it('should handle edge cases', () => {
      // Empty estimates array
      const result1 = getRecommendedContextSize([], 10000);
      expect(result1).toBe(-1);

      // Zero available VRAM
      const result2 = getRecommendedContextSize(mockEstimates, 0);
      expect(result2).toBe(-1);

      // Negative available VRAM (edge case)
      const result3 = getRecommendedContextSize(mockEstimates, -100);
      expect(result3).toBe(-1);
    });

    it('should respect 70% safety threshold', () => {
      // With 5.7GB available, 70% is ~4GB
      // Should recommend 2048 context (2GB)
      const result = getRecommendedContextSize(mockEstimates, 5700);
      expect(result).toBe(0); // Index 0 = 2048 context
    });
  });

  describe('getModelSafetyLevel', () => {
    const mockEstimates = [
      { conservative: 2000 },
      { conservative: 4000 },
      { conservative: 8000 },
    ];

    it('should return safety level based on minimum requirement', () => {
      // With 10GB available, minimum 2GB requirement is safe (20%)
      const result = getModelSafetyLevel(mockEstimates, 10000);
      expect(result).toBe('safe');
    });

    it('should return caution when minimum requirement is 70-90%', () => {
      // With 2.5GB available, minimum 2GB requirement is 80%
      const result = getModelSafetyLevel(mockEstimates, 2500);
      expect(result).toBe('caution');
    });

    it('should return risky when minimum requirement is 90-100%', () => {
      // With 2.1GB available, minimum 2GB requirement is ~95%
      const result = getModelSafetyLevel(mockEstimates, 2100);
      expect(result).toBe('risky');
    });

    it('should return unsafe when minimum requirement exceeds available', () => {
      // With 1GB available, minimum 2GB requirement exceeds available
      const result = getModelSafetyLevel(mockEstimates, 1000);
      expect(result).toBe('unsafe');
    });

    it('should return unknown when data is missing', () => {
      const result1 = getModelSafetyLevel(undefined, 10000);
      expect(result1).toBe('unknown');

      const result2 = getModelSafetyLevel([], 10000);
      expect(result2).toBe('unknown');

      const result3 = getModelSafetyLevel(mockEstimates, undefined);
      expect(result3).toBe('unknown');
    });
  });

  describe('Integration scenarios', () => {
    it('should handle realistic model scenarios', () => {
      // Simulate a 7B model with different context sizes
      const estimates = [
        { conservative: 4500, config: { contextSize: 2048 } },
        { conservative: 5000, config: { contextSize: 4096 } },
        { conservative: 6000, config: { contextSize: 8192 } },
        { conservative: 8000, config: { contextSize: 16384 } },
      ];

      // User has 8GB VRAM available
      const availableVram = 8000;

      // Get overall model safety
      const modelSafety = getModelSafetyLevel(estimates, availableVram);
      expect(modelSafety).toBe('safe'); // Minimum requirement is 4.5GB (56%)

      // Get recommended context size
      const recommended = getRecommendedContextSize(estimates, availableVram);
      expect(recommended).toBe(1); // 4096 context (5GB = 62.5%)

      // Check individual safety levels
      const safety2k = calculateVRAMSafety(
        estimates[0].conservative,
        availableVram
      );
      expect(safety2k.level).toBe('safe'); // 56%

      const safety4k = calculateVRAMSafety(
        estimates[1].conservative,
        availableVram
      );
      expect(safety4k.level).toBe('safe'); // 62.5%

      const safety8k = calculateVRAMSafety(
        estimates[2].conservative,
        availableVram
      );
      expect(safety8k.level).toBe('caution'); // 75%

      const safety16k = calculateVRAMSafety(
        estimates[3].conservative,
        availableVram
      );
      expect(safety16k.level).toBe('risky'); // 100%
    });

    it('should handle low VRAM scenarios', () => {
      const estimates = [
        { conservative: 4000, config: { contextSize: 2048 } },
        { conservative: 8000, config: { contextSize: 8192 } },
      ];

      // User has only 3GB VRAM
      const availableVram = 3000;

      const modelSafety = getModelSafetyLevel(estimates, availableVram);
      expect(modelSafety).toBe('unsafe'); // Even minimum 4GB exceeds 3GB

      const recommended = getRecommendedContextSize(estimates, availableVram);
      expect(recommended).toBe(-1); // No safe options
    });

    it('should handle high VRAM scenarios', () => {
      const estimates = [
        { conservative: 8000, config: { contextSize: 8192 } },
        { conservative: 16000, config: { contextSize: 32768 } },
      ];

      // User has 48GB VRAM (high-end GPU)
      const availableVram = 48000;

      const modelSafety = getModelSafetyLevel(estimates, availableVram);
      expect(modelSafety).toBe('safe'); // 8GB minimum is only 17%

      const recommended = getRecommendedContextSize(estimates, availableVram);
      expect(recommended).toBe(1); // Can safely use largest context
    });
  });
});
