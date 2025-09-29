import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppBar } from '../AppBar';
import { Settings } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type { AppView } from '../../types';

// Mock the store
vi.mock('../../store/useAppStore');

// Mock child components
vi.mock('../WindowControls', () => ({
  WindowControls: () => (
    <div data-testid="window-controls">Window Controls</div>
  ),
}));

vi.mock('../SystemInfo', () => ({
  SystemInfo: () => <div data-testid="system-info">System Info</div>,
}));

describe('AppBar', () => {
  const mockIncreaseFontSize = vi.fn();
  const mockDecreaseFontSize = vi.fn();
  const mockSetShowLocalModelDialog = vi.fn();
  const mockedUseAppStore = vi.mocked(useAppStore);

  const defaultMockStore = {
    fontSize: 14,
    increaseFontSize: mockIncreaseFontSize,
    decreaseFontSize: mockDecreaseFontSize,
    setShowLocalModelDialog: mockSetShowLocalModelDialog,
    activeView: 'chat' as AppView,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseAppStore.mockReturnValue(defaultMockStore);
  });

  describe('Font Size Controls', () => {
    it('should display font size controls when activeView is chat', () => {
      render(<AppBar icon={Settings} title="Test" />);

      expect(screen.getByText('14px')).toBeDefined();
      expect(screen.getByTitle('Increase font size')).toBeDefined();
      expect(screen.getByTitle('Decrease font size')).toBeDefined();
    });

    it('should display font size controls when activeView is mindmaps', () => {
      mockedUseAppStore.mockReturnValue({
        ...defaultMockStore,
        activeView: 'mindmaps' as AppView,
      });

      render(<AppBar icon={Settings} title="Test" />);

      expect(screen.getByText('14px')).toBeDefined();
      expect(screen.getByTitle('Increase font size')).toBeDefined();
      expect(screen.getByTitle('Decrease font size')).toBeDefined();
    });

    it('should display font size controls when activeView is workspace', () => {
      mockedUseAppStore.mockReturnValue({
        ...defaultMockStore,
        activeView: 'workspace' as AppView,
      });

      render(<AppBar icon={Settings} title="Test" />);

      expect(screen.getByText('14px')).toBeDefined();
      expect(screen.getByTitle('Increase font size')).toBeDefined();
      expect(screen.getByTitle('Decrease font size')).toBeDefined();
    });

    it('should NOT display font size controls when activeView is settings', () => {
      mockedUseAppStore.mockReturnValue({
        ...defaultMockStore,
        activeView: 'settings' as AppView,
      });

      render(<AppBar icon={Settings} title="Test" />);

      expect(screen.queryByText('14px')).toBeNull();
      expect(screen.queryByTitle('Increase font size')).toBeNull();
      expect(screen.queryByTitle('Decrease font size')).toBeNull();
    });

    it('should NOT display font size controls for other views', () => {
      mockedUseAppStore.mockReturnValue({
        ...defaultMockStore,
        activeView: 'agents' as AppView,
      });

      render(<AppBar icon={Settings} title="Test" />);

      expect(screen.queryByText('14px')).toBeNull();
      expect(screen.queryByTitle('Increase font size')).toBeNull();
      expect(screen.queryByTitle('Decrease font size')).toBeNull();
    });

    it('should call increaseFontSize when plus button is clicked', () => {
      render(<AppBar icon={Settings} title="Test" />);

      const increaseButton = screen.getByTitle('Increase font size');
      fireEvent.click(increaseButton);

      expect(mockIncreaseFontSize).toHaveBeenCalledTimes(1);
    });

    it('should call decreaseFontSize when minus button is clicked', () => {
      render(<AppBar icon={Settings} title="Test" />);

      const decreaseButton = screen.getByTitle('Decrease font size');
      fireEvent.click(decreaseButton);

      expect(mockDecreaseFontSize).toHaveBeenCalledTimes(1);
    });

    it('should display current font size from store', () => {
      mockedUseAppStore.mockReturnValue({
        ...defaultMockStore,
        fontSize: 18,
      });

      render(<AppBar icon={Settings} title="Test" />);

      expect(screen.getByText('18px')).toBeDefined();
    });

    it('should update displayed font size when store changes', () => {
      const { rerender } = render(<AppBar icon={Settings} title="Test" />);

      expect(screen.getByText('14px')).toBeDefined();

      // Update the mock to return a different font size
      mockedUseAppStore.mockReturnValue({
        ...defaultMockStore,
        fontSize: 20,
      });

      rerender(<AppBar icon={Settings} title="Test" />);

      expect(screen.getByText('20px')).toBeDefined();
    });
  });

  describe('Manage Local Models Button', () => {
    it('should display Manage Local Models button when not in settings view', () => {
      render(<AppBar icon={Settings} title="Test" />);

      const button = screen.getByTitle('Manage Local Models');
      expect(button).toBeDefined();
    });

    it('should NOT display Manage Local Models button in settings view', () => {
      mockedUseAppStore.mockReturnValue({
        ...defaultMockStore,
        activeView: 'settings' as AppView,
      });

      render(<AppBar icon={Settings} title="Test" />);

      expect(screen.queryByTitle('Manage Local Models')).toBeNull();
    });

    it('should call setShowLocalModelDialog when Manage Local Models is clicked', () => {
      render(<AppBar icon={Settings} title="Test" />);

      const button = screen.getByTitle('Manage Local Models');
      fireEvent.click(button);

      expect(mockSetShowLocalModelDialog).toHaveBeenCalledWith(true);
    });
  });

  describe('Basic Rendering', () => {
    it('should render with provided title and icon', () => {
      render(<AppBar icon={Settings} title="Test Title" />);

      expect(screen.getByText('Test Title')).toBeDefined();
    });

    it('should render with custom icon color', () => {
      render(<AppBar icon={Settings} title="Test" iconColor="text-red-500" />);

      const title = screen.getByText('Test');
      const icon = title.previousElementSibling;
      expect(icon?.classList.contains('text-red-500')).toBe(true);
    });

    it('should render additional actions when provided', () => {
      const actions = (
        <button data-testid="custom-action">Custom Action</button>
      );
      render(<AppBar icon={Settings} title="Test" actions={actions} />);

      expect(screen.getByTestId('custom-action')).toBeDefined();
    });

    it('should render WindowControls and SystemInfo', () => {
      render(<AppBar icon={Settings} title="Test" />);

      expect(screen.getByTestId('window-controls')).toBeDefined();
      expect(screen.getByTestId('system-info')).toBeDefined();
    });
  });
});
