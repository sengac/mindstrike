import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWorkspaceSync } from '../useWorkspaceSync';

// Mock the useAppStore hook
const mockUseAppStore = vi.fn();
vi.mock('../../../store/useAppStore', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    mockUseAppStore(selector),
}));

describe('useWorkspaceSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not call onWorkspaceChange on initial mount', () => {
    mockUseAppStore.mockReturnValue(1);
    const onWorkspaceChange = vi.fn();

    renderHook(() => useWorkspaceSync({ onWorkspaceChange }));

    expect(onWorkspaceChange).not.toHaveBeenCalled();
  });

  it('should call onWorkspaceChange when workspace version changes', () => {
    mockUseAppStore.mockReturnValue(1);
    const onWorkspaceChange = vi.fn();

    const { rerender } = renderHook(() =>
      useWorkspaceSync({ onWorkspaceChange })
    );

    // Change workspace version
    mockUseAppStore.mockReturnValue(2);
    rerender();

    expect(onWorkspaceChange).toHaveBeenCalledOnce();
  });

  it('should not call onWorkspaceChange when workspace version stays the same', () => {
    mockUseAppStore.mockReturnValue(1);
    const onWorkspaceChange = vi.fn();

    const { rerender } = renderHook(() =>
      useWorkspaceSync({ onWorkspaceChange })
    );

    // Keep same workspace version
    rerender();

    expect(onWorkspaceChange).not.toHaveBeenCalled();
  });

  it('should handle multiple workspace changes', () => {
    mockUseAppStore.mockReturnValue(1);
    const onWorkspaceChange = vi.fn();

    const { rerender } = renderHook(() =>
      useWorkspaceSync({ onWorkspaceChange })
    );

    // First change
    mockUseAppStore.mockReturnValue(2);
    rerender();

    expect(onWorkspaceChange).toHaveBeenCalledTimes(1);

    // Second change
    mockUseAppStore.mockReturnValue(3);
    rerender();

    expect(onWorkspaceChange).toHaveBeenCalledTimes(2);
  });

  it('should return current workspace version', () => {
    mockUseAppStore.mockReturnValue(5);

    const { result } = renderHook(() =>
      useWorkspaceSync({ onWorkspaceChange: vi.fn() })
    );

    expect(result.current.workspaceVersion).toBe(5);
  });

  it('should handle callback changes correctly', () => {
    mockUseAppStore.mockReturnValue(1);
    const onWorkspaceChange1 = vi.fn();
    const onWorkspaceChange2 = vi.fn();

    const { rerender } = renderHook(
      ({ callback }) => useWorkspaceSync({ onWorkspaceChange: callback }),
      { initialProps: { callback: onWorkspaceChange1 } }
    );

    // Change workspace version
    mockUseAppStore.mockReturnValue(2);
    rerender({ callback: onWorkspaceChange1 });

    expect(onWorkspaceChange1).toHaveBeenCalledOnce();
    expect(onWorkspaceChange2).not.toHaveBeenCalled();

    // Change callback
    rerender({ callback: onWorkspaceChange2 });

    // Callback change alone shouldn't trigger
    expect(onWorkspaceChange2).not.toHaveBeenCalled();

    // Change workspace version again
    mockUseAppStore.mockReturnValue(3);
    rerender({ callback: onWorkspaceChange2 });

    expect(onWorkspaceChange2).toHaveBeenCalledOnce();
    expect(onWorkspaceChange1).toHaveBeenCalledOnce(); // Still only once
  });
});
