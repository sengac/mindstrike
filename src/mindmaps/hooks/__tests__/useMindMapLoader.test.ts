import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMindMapLoader } from '../useMindMapLoader';
import type { MindMap } from '../useMindMaps';

// Mock the dependencies
vi.mock('../../services/mindMapApi', () => ({
  mindMapApi: {
    fetchAll: vi.fn(),
  },
}));

vi.mock('../../utils/mindMapUtils', () => ({
  sortMindMapsByDate: vi.fn(data => [...data].reverse()),
}));

vi.mock('../../../utils/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe('useMindMapLoader', () => {
  const mockMindMaps: MindMap[] = [
    {
      id: '1',
      name: 'Map 1',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    },
    {
      id: '2',
      name: 'Map 2',
      createdAt: new Date('2024-01-02'),
      updatedAt: new Date('2024-01-02'),
    },
  ];

  let mockFetchAll: ReturnType<typeof vi.fn>;
  let mockLogger: { error: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.clearAllMocks();

    const apiModule = await import('../../services/mindMapApi');
    mockFetchAll = apiModule.mindMapApi.fetchAll as ReturnType<typeof vi.fn>;
    mockFetchAll.mockResolvedValue(mockMindMaps);

    const loggerModule = await import('../../../utils/logger');
    mockLogger = {
      error: loggerModule.logger.error as ReturnType<typeof vi.fn>,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should not load mind maps on mount by default', async () => {
    const onLoad = vi.fn();
    const onError = vi.fn();

    renderHook(() => useMindMapLoader({ onLoad, onError }));

    // Wait a bit to ensure no loading happens
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(mockFetchAll).not.toHaveBeenCalled();
    expect(onLoad).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('should load mind maps on mount when autoLoad is true', async () => {
    const onLoad = vi.fn();
    const onError = vi.fn();

    renderHook(() => useMindMapLoader({ onLoad, onError, autoLoad: true }));

    await waitFor(() => {
      expect(mockFetchAll).toHaveBeenCalledOnce();
    });

    await waitFor(() => {
      expect(onLoad).toHaveBeenCalledWith(mockMindMaps.reverse());
    });

    expect(onError).not.toHaveBeenCalled();
  });

  it('should handle load errors when autoLoad is true', async () => {
    const error = new Error('Network error');
    mockFetchAll.mockRejectedValueOnce(error);

    const onLoad = vi.fn();
    const onError = vi.fn();

    renderHook(() => useMindMapLoader({ onLoad, onError, autoLoad: true }));

    await waitFor(() => {
      expect(mockFetchAll).toHaveBeenCalledOnce();
    });

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(error);
    });

    expect(onLoad).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to load mindmaps:',
      error
    );
  });

  it('should handle manual load errors', async () => {
    const error = new Error('Network error');
    mockFetchAll.mockRejectedValueOnce(error);

    const onLoad = vi.fn();
    const onError = vi.fn();

    const { result } = renderHook(() => useMindMapLoader({ onLoad, onError }));

    // Manually trigger load
    await result.current.load();

    await waitFor(() => {
      expect(mockFetchAll).toHaveBeenCalledOnce();
    });

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(error);
    });

    expect(onLoad).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to load mindmaps:',
      error
    );
  });

  it('should not call callbacks after unmount', async () => {
    let resolvePromise: (value: MindMap[]) => void;
    const loadPromise = new Promise<MindMap[]>(resolve => {
      resolvePromise = resolve;
    });
    mockFetchAll.mockReturnValueOnce(loadPromise);

    const onLoad = vi.fn();
    const onError = vi.fn();

    const { unmount, result } = renderHook(() =>
      useMindMapLoader({ onLoad, onError })
    );

    // Manually trigger load
    result.current.load();

    // Unmount before the promise resolves
    unmount();

    // Now resolve the promise
    resolvePromise!(mockMindMaps);

    // Wait a bit to ensure callbacks would have been called
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(onLoad).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('should prevent concurrent loads', async () => {
    const onLoad = vi.fn();

    let resolveFirstLoad: (value: MindMap[]) => void;
    const firstLoadPromise = new Promise<MindMap[]>(resolve => {
      resolveFirstLoad = resolve;
    });

    mockFetchAll
      .mockReturnValueOnce(firstLoadPromise)
      .mockResolvedValueOnce(mockMindMaps);

    const { result } = renderHook(() => useMindMapLoader({ onLoad }));

    // Manually trigger first load
    result.current.load();
    expect(mockFetchAll).toHaveBeenCalledTimes(1);

    // Try to load again while first load is in progress
    result.current.load();

    // Should not trigger another API call
    expect(mockFetchAll).toHaveBeenCalledTimes(1);

    // Resolve the first load
    resolveFirstLoad!(mockMindMaps);

    await waitFor(() => {
      expect(onLoad).toHaveBeenCalledOnce();
    });

    // Now try loading again
    result.current.load();

    await waitFor(() => {
      expect(mockFetchAll).toHaveBeenCalledTimes(2);
    });
  });

  it('should handle empty mind maps', async () => {
    mockFetchAll.mockResolvedValueOnce([]);

    const onLoad = vi.fn();

    const { result } = renderHook(() => useMindMapLoader({ onLoad }));

    // Manually trigger load
    await result.current.load();

    await waitFor(() => {
      expect(onLoad).toHaveBeenCalledWith([]);
    });
  });

  it('should work without onError callback', async () => {
    const error = new Error('Network error');
    mockFetchAll.mockRejectedValueOnce(error);

    const onLoad = vi.fn();

    const { result } = renderHook(() => useMindMapLoader({ onLoad }));

    // Manually trigger load
    await result.current.load();

    await waitFor(() => {
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to load mindmaps:',
        error
      );
    });

    // Should not throw
    expect(onLoad).not.toHaveBeenCalled();
  });

  it('should handle initial load error gracefully', async () => {
    const error = new Error('Initial load error');
    mockFetchAll.mockRejectedValueOnce(error);

    const onLoad = vi.fn();
    const onError = vi.fn();

    renderHook(() => useMindMapLoader({ onLoad, onError, autoLoad: true }));

    // Should call onError callback
    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(error);
    });

    // Should log the error
    await waitFor(() => {
      expect(mockLogger.error).toHaveBeenCalled();
    });

    expect(onLoad).not.toHaveBeenCalled();
  });
});
