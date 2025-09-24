import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VRAMRequirementsDisplay } from '../../../src/components/shared/VRAMRequirementsDisplay';
import { useSystemInformationStore } from '../../../src/store/useSystemInformationStore';
import type {
  VRAMEstimateInfo,
  ModelArchitecture,
} from '../../../src/store/useAvailableModelsStore';

// Mock the zustand store
vi.mock('../../../src/store/useSystemInformationStore');

interface VramState {
  total: number;
  used: number;
  free: number;
}

describe('VRAMRequirementsDisplay', () => {
  // Helper to mock the store with proper selector handling
  const mockSystemInfoStore = (vramState: VramState | null) => {
    vi.mocked(useSystemInformationStore).mockImplementation(selector => {
      const state = {
        systemInfo: {
          vramState,
        },
      };
      return selector ? selector(state) : state;
    });
  };

  const mockEstimates: VRAMEstimateInfo[] = [
    {
      conservative: 2000,
      expected: 1800,
      minimum: 1600,
      config: {
        label: '2K Context',
        contextSize: 2048,
        kvType: 'f16',
        kvBits: 16,
      },
    },
    {
      conservative: 4000,
      expected: 3600,
      minimum: 3200,
      config: {
        label: '4K Context',
        contextSize: 4096,
        kvType: 'f16',
        kvBits: 16,
      },
    },
    {
      conservative: 8000,
      expected: 7200,
      minimum: 6400,
      config: {
        label: '8K Context',
        contextSize: 8192,
        kvType: 'f16',
        kvBits: 16,
      },
    },
    {
      conservative: 16000,
      expected: 14400,
      minimum: 12800,
      config: {
        label: '16K Context',
        contextSize: 16384,
        kvType: 'f16',
        kvBits: 16,
      },
    },
  ];

  const mockArchitecture: ModelArchitecture = {
    layers: 32,
    kvHeads: 8,
    embeddingDim: 4096,
  };

  beforeEach(() => {
    // Reset mock before each test
    vi.mocked(useSystemInformationStore).mockReset();

    // Default mock implementation that simulates the selector properly
    vi.mocked(useSystemInformationStore).mockImplementation(selector => {
      const state = {
        systemInfo: {
          hasGpu: false,
          gpuType: null,
          vramState: null,
          totalRAM: 0,
          freeRAM: 0,
          cpuThreads: 1,
          diskSpace: {
            total: 0,
            free: 0,
            used: 0,
          },
          lastUpdated: 0,
        },
      };
      // If a selector is provided, apply it, otherwise return the whole state
      return selector ? selector(state) : state;
    });
  });

  describe('Error States', () => {
    it('should display error message when vram data is unavailable', () => {
      mockSystemInfoStore(null);

      render(
        <VRAMRequirementsDisplay
          vramError="Failed to calculate VRAM"
          hasVramData={false}
        />
      );

      expect(screen.getByText('VRAM data unavailable')).toBeTruthy();
    });

    it('should not render when no vram data is available', () => {
      mockSystemInfoStore(null);

      const { container } = render(
        <VRAMRequirementsDisplay hasVramData={false} />
      );

      expect(container.firstChild).toBeNull();
    });

    it('should not render when vram estimates are empty', () => {
      mockSystemInfoStore(null);

      const { container } = render(
        <VRAMRequirementsDisplay vramEstimates={[]} hasVramData={true} />
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Compact Mode', () => {
    it('should render compact view with safety indicators', () => {
      mockSystemInfoStore({
        free: 10000 * 1024 * 1024, // 10GB free
        total: 16000 * 1024 * 1024,
        used: 6000 * 1024 * 1024,
      });

      render(
        <VRAMRequirementsDisplay
          vramEstimates={mockEstimates}
          hasVramData={true}
          compactMode={true}
        />
      );

      expect(screen.getByText('VRAM Requirements')).toBeTruthy();
      expect(screen.getByText(/\(Available: 9\.8 GB\)/)).toBeTruthy();

      // Check that context sizes are displayed
      expect(screen.getByText(/2K Context/)).toBeTruthy();
      expect(screen.getByText(/4K Context/)).toBeTruthy();
      expect(screen.getByText(/8K Context/)).toBeTruthy();
      expect(screen.getByText(/16K Context/)).toBeTruthy();
    });

    it('should show recommended context size in compact mode', () => {
      mockSystemInfoStore({
        free: 6000 * 1024 * 1024, // 6GB free, should recommend 4K context
        total: 8000 * 1024 * 1024,
        used: 2000 * 1024 * 1024,
      });

      const { container } = render(
        <VRAMRequirementsDisplay
          vramEstimates={mockEstimates}
          hasVramData={true}
          compactMode={true}
        />
      );

      // The 4K context (index 1) should be recommended
      const blueElement = container.querySelector('div[class*="bg-blue"]');
      expect(blueElement).toBeTruthy();
    });

    it('should apply correct safety colors in compact mode', () => {
      mockSystemInfoStore({
        free: 3000 * 1024 * 1024, // 3GB free
        total: 8000 * 1024 * 1024,
        used: 5000 * 1024 * 1024,
      });

      const { container } = render(
        <VRAMRequirementsDisplay
          vramEstimates={mockEstimates}
          hasVramData={true}
          compactMode={true}
        />
      );

      // 2K context (2GB) should be recommended (blue) because it's the best safe option
      const blueElement = container.querySelector('div[class*="bg-blue"]');
      expect(blueElement).toBeTruthy();

      // 4K context (4GB) should be unsafe (red) because it exceeds available VRAM
      const redElement = container.querySelector('div[class*="bg-red"]');
      expect(redElement).toBeTruthy();
    });
  });

  describe('Full Mode', () => {
    it('should render full view with detailed information', () => {
      mockSystemInfoStore({
        free: 12000 * 1024 * 1024, // 12GB free
        total: 16000 * 1024 * 1024,
        used: 4000 * 1024 * 1024,
      });

      render(
        <VRAMRequirementsDisplay
          vramEstimates={mockEstimates}
          hasVramData={true}
          compactMode={false}
        />
      );

      expect(screen.getByText('VRAM Requirements')).toBeTruthy();
      expect(screen.getByText(/Available: 11\.7 GB/)).toBeTruthy();

      // Check for detailed estimates
      expect(screen.getByText('2K Context')).toBeTruthy();
      expect(screen.getByText(/1\.8 GB/)).toBeTruthy(); // Expected
    });

    it('should show model architecture information', () => {
      mockSystemInfoStore({
        free: 8000 * 1024 * 1024,
        total: 16000 * 1024 * 1024,
        used: 8000 * 1024 * 1024,
      });

      render(
        <VRAMRequirementsDisplay
          vramEstimates={mockEstimates}
          modelArchitecture={mockArchitecture}
          hasVramData={true}
          compactMode={false}
        />
      );

      expect(screen.getByText(/Layers: 32/)).toBeTruthy();
      expect(screen.getByText(/KV Heads: 8/)).toBeTruthy();
      expect(screen.getByText(/Embedding: 4096/)).toBeTruthy();
    });

    it('should not display safety legend (legend removed)', () => {
      mockSystemInfoStore({
        free: 8000 * 1024 * 1024,
        total: 16000 * 1024 * 1024,
        used: 8000 * 1024 * 1024,
      });

      render(
        <VRAMRequirementsDisplay
          vramEstimates={mockEstimates}
          hasVramData={true}
          compactMode={false}
        />
      );

      // Legend has been removed from the component
      expect(screen.queryByText('<70%')).toBeNull();
      expect(screen.queryByText('70-90%')).toBeNull();
      expect(screen.queryByText('90-100%')).toBeNull();
      expect(screen.queryByText('>100%')).toBeNull();
    });

    it('should not display legend when showLegend is false', () => {
      mockSystemInfoStore({
        free: 8000 * 1024 * 1024,
        total: 16000 * 1024 * 1024,
        used: 8000 * 1024 * 1024,
      });

      render(
        <VRAMRequirementsDisplay
          vramEstimates={mockEstimates}
          hasVramData={true}
          compactMode={false}
        />
      );

      expect(screen.queryByText('<70%')).toBeNull();
    });

    it('should show percentage usage for each context size', () => {
      mockSystemInfoStore({
        free: 10000 * 1024 * 1024, // 10GB free
        total: 16000 * 1024 * 1024,
        used: 6000 * 1024 * 1024,
      });

      render(
        <VRAMRequirementsDisplay
          vramEstimates={mockEstimates}
          hasVramData={true}
          compactMode={false}
        />
      );

      // 2GB / 10GB = 20%
      expect(screen.getByText('20%')).toBeTruthy();
      // 4GB / 10GB = 40%
      expect(screen.getByText('40%')).toBeTruthy();
      // 8GB / 10GB = 80%
      expect(screen.getByText('80%')).toBeTruthy();
      // 16GB / 10GB = 160%
      expect(screen.getByText('160%')).toBeTruthy();
    });
  });

  describe('Safety Level Calculation', () => {
    it('should mark as safe when usage is below 70%', () => {
      mockSystemInfoStore({
        free: 10000 * 1024 * 1024, // 10GB free
        total: 16000 * 1024 * 1024,
        used: 6000 * 1024 * 1024,
      });

      const { container } = render(
        <VRAMRequirementsDisplay
          vramEstimates={[mockEstimates[0]]} // 2GB requirement
          hasVramData={true}
          compactMode={false}
        />
      );

      // With only one estimate that's safe (20% usage), it should be marked as recommended (blue)
      // since it's the best (and only) option
      const allDivs = container.querySelectorAll('div');
      let foundBlue = false;

      allDivs.forEach(div => {
        if (div.className?.includes('bg-blue')) {
          foundBlue = true;
        }
      });

      // Should have blue background for recommended context (even though it's also safe)
      expect(foundBlue).toBeTruthy();
    });

    it('should mark as caution when usage is 70-90%', () => {
      mockSystemInfoStore({
        free: 5000 * 1024 * 1024, // 5GB free
        total: 8000 * 1024 * 1024,
        used: 3000 * 1024 * 1024,
      });

      const { container } = render(
        <VRAMRequirementsDisplay
          vramEstimates={[mockEstimates[1]]} // 4GB requirement (80% of 5GB)
          hasVramData={true}
          compactMode={false}
        />
      );

      // Should have yellow background for caution context
      const yellowElement = container.querySelector('div[class*="bg-yellow"]');
      expect(yellowElement).toBeTruthy();
    });

    it('should mark as risky when usage is 90-100%', () => {
      mockSystemInfoStore({
        free: 4200 * 1024 * 1024, // 4.2GB free
        total: 8000 * 1024 * 1024,
        used: 3800 * 1024 * 1024,
      });

      const { container } = render(
        <VRAMRequirementsDisplay
          vramEstimates={[mockEstimates[1]]} // 4GB requirement (~95% of 4.2GB)
          hasVramData={true}
          compactMode={false}
        />
      );

      // Should have orange background for risky context
      const orangeElement = container.querySelector('div[class*="bg-orange"]');
      expect(orangeElement).toBeTruthy();
    });

    it('should mark as unsafe when usage exceeds 100%', () => {
      mockSystemInfoStore({
        free: 3000 * 1024 * 1024, // 3GB free
        total: 8000 * 1024 * 1024,
        used: 5000 * 1024 * 1024,
      });

      const { container } = render(
        <VRAMRequirementsDisplay
          vramEstimates={[mockEstimates[1]]} // 4GB requirement (133% of 3GB)
          hasVramData={true}
          compactMode={false}
        />
      );

      // Should have red background for unsafe context
      const redElement = container.querySelector('div[class*="bg-red"]');
      expect(redElement).toBeTruthy();
    });
  });

  describe('No System VRAM Information', () => {
    it('should still render estimates without safety indicators', () => {
      mockSystemInfoStore(null);

      render(
        <VRAMRequirementsDisplay
          vramEstimates={mockEstimates}
          hasVramData={true}
          compactMode={false}
        />
      );

      // Should show context sizes but no percentage
      expect(screen.getByText('2K Context')).toBeTruthy();
      expect(screen.queryByText(/\d+%/)).toBeNull();
    });

    it('should not show available VRAM when system info is missing', () => {
      mockSystemInfoStore(null);

      render(
        <VRAMRequirementsDisplay
          vramEstimates={mockEstimates}
          hasVramData={true}
          compactMode={false}
        />
      );

      expect(screen.queryByText(/Available:/)).toBeNull();
    });
  });

  describe('Custom Class Names', () => {
    it('should apply custom className prop', () => {
      mockSystemInfoStore(null);

      const { container } = render(
        <VRAMRequirementsDisplay
          vramEstimates={mockEstimates}
          hasVramData={true}
          compactMode={false}
          className="custom-test-class"
        />
      );

      const element = container.firstChild as HTMLElement;
      expect(element.className).toContain('custom-test-class');
    });
  });
});
