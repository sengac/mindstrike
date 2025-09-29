import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettingsView } from '../SettingsView';
import { useAppStore } from '../../../store/useAppStore';
import { useCustomServices } from '../../../hooks/useModels';
import type { FontScheme } from '../../../types';

// Mock the hooks
vi.mock('../../../store/useAppStore');
vi.mock('../../../hooks/useModels');

// Mock child components
vi.mock('../../../components/AppBar', () => ({
  AppBar: ({ title }: { title: string }) => (
    <div data-testid="app-bar">{title}</div>
  ),
}));

vi.mock('../LocalLLMManager', () => ({
  LocalLLMManager: () => (
    <div data-testid="local-llm-manager">Local LLM Manager</div>
  ),
}));

vi.mock('../../../components/shared/AddEditLLMServiceDialog', () => ({
  AddEditLLMServiceDialog: ({
    isOpen,
    onClose,
  }: {
    isOpen: boolean;
    onClose: () => void;
  }) =>
    isOpen ? (
      <div data-testid="add-edit-dialog">
        Dialog <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

vi.mock('../../../components/MusicVisualization', () => ({
  MusicVisualization: () => (
    <div data-testid="music-visualization">Music Visualization</div>
  ),
}));

describe('SettingsView', () => {
  const mockIncreaseFontSize = vi.fn();
  const mockDecreaseFontSize = vi.fn();
  const mockSetFontScheme = vi.fn();
  const mockedUseAppStore = vi.mocked(useAppStore);
  const mockedUseCustomServices = vi.mocked(useCustomServices);

  const defaultMockStore = {
    fontSize: 14,
    increaseFontSize: mockIncreaseFontSize,
    decreaseFontSize: mockDecreaseFontSize,
    fontScheme: 'system' as FontScheme,
    setFontScheme: mockSetFontScheme,
  };

  const defaultMockServices = {
    services: [],
    isLoading: false,
    addService: vi.fn(),
    removeService: vi.fn(),
    updateService: vi.fn(),
    testService: vi.fn().mockResolvedValue({ success: true, models: [] }),
    refetch: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseAppStore.mockReturnValue(defaultMockStore);
    mockedUseCustomServices.mockReturnValue(defaultMockServices);
  });

  describe('Font Size Controls in General Preferences', () => {
    it('should display font size controls in General Preferences tab', async () => {
      render(<SettingsView />);

      // Click on General Preferences tab
      const generalTab = screen.getByText('General Preferences');
      fireEvent.click(generalTab);

      await waitFor(() => {
        expect(screen.getByText('Font Size')).toBeDefined();
        expect(screen.getByText('14px')).toBeDefined();
        expect(screen.getByTitle('Increase font size')).toBeDefined();
        expect(screen.getByTitle('Decrease font size')).toBeDefined();
      });
    });

    it('should call increaseFontSize when plus button is clicked', async () => {
      render(<SettingsView />);

      // Click on General Preferences tab
      const generalTab = screen.getByText('General Preferences');
      fireEvent.click(generalTab);

      await waitFor(() => {
        const increaseButton = screen.getByTitle('Increase font size');
        fireEvent.click(increaseButton);
        expect(mockIncreaseFontSize).toHaveBeenCalledTimes(1);
      });
    });

    it('should call decreaseFontSize when minus button is clicked', async () => {
      render(<SettingsView />);

      // Click on General Preferences tab
      const generalTab = screen.getByText('General Preferences');
      fireEvent.click(generalTab);

      await waitFor(() => {
        const decreaseButton = screen.getByTitle('Decrease font size');
        fireEvent.click(decreaseButton);
        expect(mockDecreaseFontSize).toHaveBeenCalledTimes(1);
      });
    });

    it('should display current font size from store', async () => {
      mockedUseAppStore.mockReturnValue({
        ...defaultMockStore,
        fontSize: 18,
      });

      render(<SettingsView />);

      // Click on General Preferences tab
      const generalTab = screen.getByText('General Preferences');
      fireEvent.click(generalTab);

      await waitFor(() => {
        expect(screen.getByText('18px')).toBeDefined();
      });
    });

    it('should update displayed font size when store changes', async () => {
      const { rerender } = render(<SettingsView />);

      // Click on General Preferences tab
      const generalTab = screen.getByText('General Preferences');
      fireEvent.click(generalTab);

      await waitFor(() => {
        expect(screen.getByText('14px')).toBeDefined();
      });

      // Update the mock to return a different font size
      mockedUseAppStore.mockReturnValue({
        ...defaultMockStore,
        fontSize: 20,
      });

      rerender(<SettingsView />);

      await waitFor(() => {
        expect(screen.getByText('20px')).toBeDefined();
      });
    });
  });

  describe('Font Scheme Controls', () => {
    it('should display font scheme selector in General Preferences', async () => {
      render(<SettingsView />);

      // Click on General Preferences tab
      const generalTab = screen.getByText('General Preferences');
      fireEvent.click(generalTab);

      await waitFor(() => {
        expect(screen.getByText('Font Scheme')).toBeDefined();
        expect(
          screen.getByText('Choose a font scheme for markdown content')
        ).toBeDefined();
      });
    });

    it('should call setFontScheme when font scheme is changed', async () => {
      render(<SettingsView />);

      // Click on General Preferences tab
      const generalTab = screen.getByText('General Preferences');
      fireEvent.click(generalTab);

      await waitFor(() => {
        const select = screen.getByRole('combobox');
        fireEvent.change(select, { target: { value: 'inter' } });
        expect(mockSetFontScheme).toHaveBeenCalledWith('inter');
      });
    });
  });

  describe('Tab Navigation', () => {
    it('should render all three tabs', () => {
      render(<SettingsView />);

      expect(screen.getByText('Built-in LLM')).toBeDefined();
      expect(screen.getByText('LLM Services')).toBeDefined();
      expect(screen.getByText('General Preferences')).toBeDefined();
    });

    it('should show Built-in LLM content by default', () => {
      render(<SettingsView />);

      expect(screen.getByText('Built-in LLM Models')).toBeDefined();
      expect(screen.getByTestId('local-llm-manager')).toBeDefined();
    });

    it('should switch to LLM Services tab when clicked', async () => {
      render(<SettingsView />);

      const llmServicesTab = screen.getByText('LLM Services');
      fireEvent.click(llmServicesTab);

      await waitFor(() => {
        expect(screen.getByText('Add Service')).toBeDefined();
        expect(screen.getByText('Rescan')).toBeDefined();
      });
    });

    it('should switch to General Preferences tab when clicked', async () => {
      render(<SettingsView />);

      const generalTab = screen.getByText('General Preferences');
      fireEvent.click(generalTab);

      await waitFor(() => {
        expect(screen.getByText('Font Size')).toBeDefined();
        expect(screen.getByText('Font Scheme')).toBeDefined();
      });
    });
  });

  describe('LLM Services Integration', () => {
    it('should display empty state when no services', () => {
      render(<SettingsView />);

      const llmServicesTab = screen.getByText('LLM Services');
      fireEvent.click(llmServicesTab);

      expect(screen.getByText('No LLM Services')).toBeDefined();
      expect(screen.getByText('Add Your First Service')).toBeDefined();
    });

    it('should open add dialog when Add Service is clicked', async () => {
      render(<SettingsView />);

      const llmServicesTab = screen.getByText('LLM Services');
      fireEvent.click(llmServicesTab);

      const addButton = screen.getByText('Add Service');
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(screen.getByTestId('add-edit-dialog')).toBeDefined();
      });
    });
  });
});
