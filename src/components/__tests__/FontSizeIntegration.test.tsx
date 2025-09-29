import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { create } from 'zustand';
import type { AppView, FontScheme } from '../../types';

// Create a test store that mimics the real store structure
interface TestAppStore {
  fontSize: number;
  fontScheme: FontScheme;
  activeView: AppView;
  sidebarOpen: boolean;
  increaseFontSize: () => void;
  decreaseFontSize: () => void;
  setFontScheme: (scheme: FontScheme) => void;
  setActiveView: (view: AppView) => void;
  setSidebarOpen: (open: boolean) => void;
  setShowLocalModelDialog: (show: boolean) => void;
  showLocalModelDialog: boolean;
}

const createTestStore = () => {
  return create<TestAppStore>(set => ({
    fontSize: 14,
    fontScheme: 'system',
    activeView: 'chat',
    sidebarOpen: true,
    showLocalModelDialog: false,
    increaseFontSize: () =>
      set(state => ({ fontSize: Math.min(state.fontSize + 2, 24) })),
    decreaseFontSize: () =>
      set(state => ({ fontSize: Math.max(state.fontSize - 2, 10) })),
    setFontScheme: fontScheme => set({ fontScheme }),
    setActiveView: activeView => set({ activeView }),
    setSidebarOpen: sidebarOpen => set({ sidebarOpen }),
    setShowLocalModelDialog: showLocalModelDialog =>
      set({ showLocalModelDialog }),
  }));
};

describe('Font Size Integration Tests', () => {
  describe('Font size synchronization', () => {
    it('should update font size consistently across components', () => {
      // Create a test store instance
      const useTestStore = createTestStore();

      // Create a component that uses the store
      const TestComponent = () => {
        const { fontSize, increaseFontSize, decreaseFontSize, activeView } =
          useTestStore();

        return (
          <div>
            <div data-testid="font-size-display">{fontSize}px</div>
            <button onClick={increaseFontSize} data-testid="increase-btn">
              Increase
            </button>
            <button onClick={decreaseFontSize} data-testid="decrease-btn">
              Decrease
            </button>
            <div data-testid="active-view">{activeView}</div>
          </div>
        );
      };

      render(<TestComponent />);

      // Initial state
      expect(screen.getByTestId('font-size-display').textContent).toBe('14px');

      // Increase font size
      fireEvent.click(screen.getByTestId('increase-btn'));
      expect(screen.getByTestId('font-size-display').textContent).toBe('16px');

      // Increase again
      fireEvent.click(screen.getByTestId('increase-btn'));
      expect(screen.getByTestId('font-size-display').textContent).toBe('18px');

      // Decrease font size
      fireEvent.click(screen.getByTestId('decrease-btn'));
      expect(screen.getByTestId('font-size-display').textContent).toBe('16px');
    });

    it('should respect minimum font size limit', () => {
      const useTestStore = createTestStore();

      const TestComponent = () => {
        const { fontSize, decreaseFontSize } = useTestStore();

        return (
          <div>
            <div data-testid="font-size-display">{fontSize}px</div>
            <button onClick={decreaseFontSize} data-testid="decrease-btn">
              Decrease
            </button>
          </div>
        );
      };

      render(<TestComponent />);

      // Decrease to minimum (14 -> 12 -> 10)
      fireEvent.click(screen.getByTestId('decrease-btn'));
      expect(screen.getByTestId('font-size-display').textContent).toBe('12px');

      fireEvent.click(screen.getByTestId('decrease-btn'));
      expect(screen.getByTestId('font-size-display').textContent).toBe('10px');

      // Should not go below 10
      fireEvent.click(screen.getByTestId('decrease-btn'));
      expect(screen.getByTestId('font-size-display').textContent).toBe('10px');
    });

    it('should respect maximum font size limit', () => {
      const useTestStore = createTestStore();

      const TestComponent = () => {
        const { fontSize, increaseFontSize } = useTestStore();

        return (
          <div>
            <div data-testid="font-size-display">{fontSize}px</div>
            <button onClick={increaseFontSize} data-testid="increase-btn">
              Increase
            </button>
          </div>
        );
      };

      render(<TestComponent />);

      // Increase to maximum (14 -> 16 -> 18 -> 20 -> 22 -> 24)
      for (let i = 0; i < 5; i++) {
        fireEvent.click(screen.getByTestId('increase-btn'));
      }
      expect(screen.getByTestId('font-size-display').textContent).toBe('24px');

      // Should not go above 24
      fireEvent.click(screen.getByTestId('increase-btn'));
      expect(screen.getByTestId('font-size-display').textContent).toBe('24px');
    });
  });

  describe('Font size effect on UI', () => {
    it('should apply font size to body element', () => {
      const useTestStore = createTestStore();

      const TestComponent = () => {
        const { fontSize, increaseFontSize } = useTestStore();

        // Simulate the effect that would normally be in App.tsx
        React.useEffect(() => {
          document.body.style.setProperty('--base-font-size', `${fontSize}px`);
        }, [fontSize]);

        return (
          <div>
            <button onClick={increaseFontSize} data-testid="increase-btn">
              Increase
            </button>
          </div>
        );
      };

      render(<TestComponent />);

      // Check initial CSS variable
      expect(document.body.style.getPropertyValue('--base-font-size')).toBe(
        '14px'
      );

      // Increase font size
      fireEvent.click(screen.getByTestId('increase-btn'));

      // Check updated CSS variable
      expect(document.body.style.getPropertyValue('--base-font-size')).toBe(
        '16px'
      );
    });
  });

  describe('Active view conditional rendering', () => {
    it('should show/hide font controls based on active view', () => {
      const useTestStore = createTestStore();

      const TestComponent = () => {
        const {
          activeView,
          setActiveView,
          fontSize,
          increaseFontSize,
          decreaseFontSize,
        } = useTestStore();

        const showFontControls =
          activeView === 'chat' ||
          activeView === 'mindmaps' ||
          activeView === 'workspace';

        return (
          <div>
            <button
              onClick={() => setActiveView('chat')}
              data-testid="chat-btn"
            >
              Chat
            </button>
            <button
              onClick={() => setActiveView('mindmaps')}
              data-testid="mindmaps-btn"
            >
              MindMaps
            </button>
            <button
              onClick={() => setActiveView('workspace')}
              data-testid="workspace-btn"
            >
              Workspace
            </button>
            <button
              onClick={() => setActiveView('settings')}
              data-testid="settings-btn"
            >
              Settings
            </button>

            {showFontControls && (
              <div data-testid="font-controls">
                <span>{fontSize}px</span>
                <button onClick={increaseFontSize}>+</button>
                <button onClick={decreaseFontSize}>-</button>
              </div>
            )}
          </div>
        );
      };

      render(<TestComponent />);

      // Initially in chat view - controls should be visible
      expect(screen.getByTestId('font-controls')).toBeDefined();

      // Switch to mindmaps - controls should still be visible
      fireEvent.click(screen.getByTestId('mindmaps-btn'));
      expect(screen.getByTestId('font-controls')).toBeDefined();

      // Switch to workspace - controls should still be visible
      fireEvent.click(screen.getByTestId('workspace-btn'));
      expect(screen.getByTestId('font-controls')).toBeDefined();

      // Switch to settings - controls should be hidden
      fireEvent.click(screen.getByTestId('settings-btn'));
      expect(screen.queryByTestId('font-controls')).toBeNull();

      // Switch back to chat - controls should be visible again
      fireEvent.click(screen.getByTestId('chat-btn'));
      expect(screen.getByTestId('font-controls')).toBeDefined();
    });
  });
});
