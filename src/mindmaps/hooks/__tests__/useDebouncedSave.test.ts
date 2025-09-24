import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedSave } from '../useDebouncedSave';

describe('useDebouncedSave', () => {
  let mockSaveFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockSaveFn = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should debounce save calls', async () => {
    const { result } = renderHook(() => useDebouncedSave(mockSaveFn, 500));

    // Call save multiple times quickly
    act(() => {
      result.current('data1').catch(() => {
        // Ignore errors in test
      });
      result.current('data2').catch(() => {
        // Ignore errors in test
      });
      result.current('data3').catch(() => {
        // Ignore errors in test
      });
    });

    // Should not have called save yet
    expect(mockSaveFn).not.toHaveBeenCalled();

    // Fast-forward time
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Should have called save only once with the last data
    expect(mockSaveFn).toHaveBeenCalledTimes(1);
    expect(mockSaveFn).toHaveBeenCalledWith('data3');
  });

  it('should save immediately when requested', async () => {
    const { result } = renderHook(() => useDebouncedSave(mockSaveFn));

    await act(async () => {
      await result.current('immediate data', true);
    });

    // Should have called save immediately
    expect(mockSaveFn).toHaveBeenCalledTimes(1);
    expect(mockSaveFn).toHaveBeenCalledWith('immediate data');
  });

  it('should cancel previous timeout when new save is called', async () => {
    const { result } = renderHook(() => useDebouncedSave(mockSaveFn, 1000));

    // First save
    act(() => {
      result.current('first').catch(() => {
        // Ignore errors in test
      });
    });

    // Advance time partially
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Second save should cancel the first
    act(() => {
      result.current('second').catch(() => {
        // Ignore errors in test
      });
    });

    // Advance past original timeout
    act(() => {
      vi.advanceTimersByTime(600);
    });

    // Should not have saved yet
    expect(mockSaveFn).not.toHaveBeenCalled();

    // Advance to complete second timeout
    act(() => {
      vi.advanceTimersByTime(400);
    });

    // Should have saved only the second data
    expect(mockSaveFn).toHaveBeenCalledTimes(1);
    expect(mockSaveFn).toHaveBeenCalledWith('second');
  });

  it('should clear timeout on unmount', () => {
    const { result, unmount } = renderHook(() => useDebouncedSave(mockSaveFn));

    // Start a save
    act(() => {
      result.current('data').catch(() => {
        // Ignore errors in test
      });
    });

    // Unmount before timeout
    unmount();

    // Advance time
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Should not have called save
    expect(mockSaveFn).not.toHaveBeenCalled();
  });

  it('should not save after unmount', () => {
    const { result, unmount } = renderHook(() => useDebouncedSave(mockSaveFn));

    // Start a save
    act(() => {
      result.current('data').catch(() => {
        // Ignore errors in test
      });
    });

    // Unmount
    unmount();

    // Try to advance timers
    act(() => {
      vi.runAllTimers();
    });

    // Should not have saved
    expect(mockSaveFn).not.toHaveBeenCalled();
  });

  it('should handle save errors gracefully', async () => {
    const errorSaveFn = vi.fn().mockRejectedValue(new Error('Save failed'));
    const { result } = renderHook(() => useDebouncedSave(errorSaveFn));

    // Trigger debounced save
    act(() => {
      result.current('data').catch(() => {
        // Test expects no error to be thrown
      });
    });

    // Advance time to trigger save
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Wait for async operations
    await vi.waitFor(() => {
      expect(errorSaveFn).toHaveBeenCalled();
    });

    // The error should be silently caught - no console errors
    // The hook handles errors internally for debounced saves
  });

  it('should respect custom delay', () => {
    const { result } = renderHook(() => useDebouncedSave(mockSaveFn, 2000));

    act(() => {
      result.current('data').catch(() => {
        // Ignore errors in test
      });
    });

    // Advance time less than custom delay
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    // Should not have saved yet
    expect(mockSaveFn).not.toHaveBeenCalled();

    // Advance past custom delay
    act(() => {
      vi.advanceTimersByTime(600);
    });

    // Should have saved
    expect(mockSaveFn).toHaveBeenCalledTimes(1);
  });

  it('should work with complex data types', async () => {
    const complexData = {
      id: '1',
      name: 'Test',
      nested: {
        value: 42,
        array: [1, 2, 3],
      },
    };

    const { result } = renderHook(() =>
      useDebouncedSave<typeof complexData>(mockSaveFn)
    );

    act(() => {
      result.current(complexData).catch(() => {
        // Ignore errors in test
      });
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(mockSaveFn).toHaveBeenCalledWith(complexData);
  });

  it('should handle multiple immediate saves', async () => {
    const { result } = renderHook(() => useDebouncedSave(mockSaveFn));

    await act(async () => {
      await result.current('data1', true);
      await result.current('data2', true);
      await result.current('data3', true);
    });

    // All immediate saves should go through
    expect(mockSaveFn).toHaveBeenCalledTimes(3);
    expect(mockSaveFn).toHaveBeenNthCalledWith(1, 'data1');
    expect(mockSaveFn).toHaveBeenNthCalledWith(2, 'data2');
    expect(mockSaveFn).toHaveBeenNthCalledWith(3, 'data3');
  });

  it('should mix immediate and debounced saves correctly', async () => {
    const { result } = renderHook(() => useDebouncedSave(mockSaveFn));

    // Immediate save
    await act(async () => {
      await result.current('immediate', true);
    });

    expect(mockSaveFn).toHaveBeenCalledTimes(1);

    // Debounced save
    act(() => {
      result.current('debounced').catch(() => {
        // Ignore errors in test
      });
    });

    // Advance time
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(mockSaveFn).toHaveBeenCalledTimes(2);
    expect(mockSaveFn).toHaveBeenNthCalledWith(1, 'immediate');
    expect(mockSaveFn).toHaveBeenNthCalledWith(2, 'debounced');
  });
});
