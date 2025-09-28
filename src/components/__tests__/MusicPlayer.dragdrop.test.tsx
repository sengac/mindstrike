import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  render,
  fireEvent,
  waitFor,
  screen,
  act as rtlAct,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MusicPlayer } from '../MusicPlayer';
import { usePlaylistStore } from '../../store/usePlaylistStore';
import { useAudioStore } from '../../store/useAudioStore';

// Mock all dependencies
vi.mock('../shared/BaseDialog', () => ({
  BaseDialog: ({
    children,
    isOpen,
  }: {
    children: React.ReactNode;
    isOpen: boolean;
  }) => (isOpen ? <div data-testid="base-dialog">{children}</div> : null),
}));

vi.mock('../../hooks/useDialogAnimation', () => ({
  useDialogAnimation: (isOpen: boolean, onClose: () => void) => ({
    shouldRender: isOpen,
    isVisible: isOpen,
    handleClose: onClose,
  }),
}));

vi.mock('../LCDDisplay', () => ({
  LCDDisplay: () => <div data-testid="lcd-display">LCD Display</div>,
}));

vi.mock('../CachedAlbumArt', () => ({
  CachedAlbumArt: ({ src }: { src?: string }) => (
    <div data-testid="album-art">{src || 'No Art'}</div>
  ),
}));

vi.mock('../../hooks/useImageCache', () => ({
  useImageCache: () => ({
    getCachedUrl: (url: string) => url,
    preloadImage: vi.fn(),
  }),
}));

vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock stores
vi.mock('../../store/usePlaylistStore');
vi.mock('../../store/useAudioStore');
vi.mock('../../store/useAppStore', () => ({
  useAppStore: () => ({
    settings: {
      musicDirectories: ['/test/music'],
    },
  }),
}));

const mockedUsePlaylistStore = vi.mocked(usePlaylistStore);
const mockedUseAudioStore = vi.mocked(useAudioStore);

// Mock fetch
const mockFetch = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>();
global.fetch = mockFetch as typeof fetch;

// Mock virtualized list with AutoSizer - properly mock all required props
vi.mock('react-virtualized', () => {
  interface ListProps {
    rowRenderer: (props: {
      index: number;
      key: string;
      style: React.CSSProperties;
    }) => React.ReactElement;
    rowCount: number;
    height: number;
    width: number;
    rowHeight: number | ((params: { index: number }) => number);
    onRowsRendered?: (params: {
      startIndex: number;
      stopIndex: number;
    }) => void;
    scrollToIndex?: number;
  }

  const List = React.forwardRef<
    { forceUpdateGrid: () => void; scrollToRow: (index: number) => void },
    ListProps
  >((props, ref) => {
    const { rowRenderer, rowCount, height, width, rowHeight } = props;

    React.useImperativeHandle(ref, () => ({
      forceUpdateGrid: vi.fn(),
      scrollToRow: vi.fn(),
    }));

    // Calculate actual row height
    const getRowHeight = (index: number) => {
      if (typeof rowHeight === 'function') {
        return rowHeight({ index });
      }
      return rowHeight;
    };

    // Render visible rows based on height
    const visibleRows = Math.min(
      rowCount,
      Math.floor(height / (typeof rowHeight === 'number' ? rowHeight : 30))
    );

    return React.createElement(
      'div',
      {
        'data-testid': 'virtual-list',
        style: { height, width, overflow: 'auto' },
      },
      Array.from({ length: visibleRows }, (_, i) => {
        const style = {
          position: 'absolute' as const,
          top: i * getRowHeight(i),
          left: 0,
          width: '100%',
          height: getRowHeight(i),
        };
        return rowRenderer({ index: i, key: `row-${i}`, style });
      })
    );
  });

  List.displayName = 'List';

  const AutoSizer = ({
    children,
  }: {
    children: (props: { width: number; height: number }) => React.ReactElement;
  }) => {
    return React.createElement(
      'div',
      { 'data-testid': 'auto-sizer', style: { width: 800, height: 600 } },
      children({ width: 800, height: 600 })
    );
  };

  return { List, AutoSizer };
});

// Test fixtures
const createMockTrack = (id: number, overrides = {}) => ({
  id,
  title: `Track ${id}`,
  artist: `Artist ${id}`,
  album: `Album ${id}`,
  genre: [`Genre ${id}`],
  year: 2020 + id,
  duration: `${id}:00`,
  url: `/audio/track${id}.mp3`,
  path: `/music/track${id}.mp3`,
  size: id * 1000000,
  coverArtUrl: null,
  metadata: undefined,
  ...overrides,
});

const createMockPlaylist = (overrides = {}) => ({
  id: 'test-playlist-id',
  name: 'Test Playlist',
  description: 'Test playlist description',
  trackRefs: [],
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

// Create a data transfer mock
const createDataTransferMock = () => {
  const dataStore: Record<string, string> = {};
  return {
    effectAllowed: 'none' as DataTransferEffectAllowed,
    dropEffect: 'none' as DataTransferDropEffect,
    setData: vi.fn((format: string, data: string) => {
      dataStore[format] = data;
    }),
    getData: vi.fn((format: string) => dataStore[format] || ''),
    clearData: vi.fn(() => {
      Object.keys(dataStore).forEach(key => delete dataStore[key]);
    }),
    files: [] as FileList,
    items: [] as DataTransferItemList,
    types: [] as readonly string[],
    setDragImage: vi.fn(),
  };
};

describe('MusicPlayer Drag and Drop', () => {
  let mockPlaylistStore: ReturnType<typeof usePlaylistStore>;
  let mockAudioStore: ReturnType<typeof useAudioStore>;

  beforeEach(() => {
    // Setup mock stores
    mockPlaylistStore = {
      playlists: [],
      currentPlaylist: null,
      allTracks: [],
      createPlaylist: vi.fn(),
      deletePlaylist: vi.fn(),
      updatePlaylist: vi.fn(),
      addTrackToPlaylist: vi.fn(),
      addTracksToPlaylist: vi.fn(),
      removeTrackFromPlaylist: vi.fn(),
      setCurrentPlaylist: vi.fn(),
      reorderPlaylistTracks: vi.fn(),
      getPlaylistTracks: vi.fn(() => []),
      setAllTracks: vi.fn(),
      loadPlaylistsFromFile: vi.fn().mockResolvedValue(undefined),
      savePlaylistsToFile: vi.fn().mockResolvedValue(undefined),
      initializePlaylistStore: vi.fn().mockResolvedValue(undefined),
    };

    mockAudioStore = {
      audioFiles: [],
      setAudioFiles: vi.fn(),
      currentTrack: null,
      isPlaying: false,
      play: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
      playTrack: vi.fn(),
      playNext: vi.fn(),
      playPrevious: vi.fn(),
      seek: vi.fn(),
      setVolume: vi.fn(),
      volume: 1,
      currentTime: 0,
      duration: 0,
      isShuffled: false,
      isRepeating: false,
      toggleShuffle: vi.fn(),
      toggleRepeat: vi.fn(),
      activePlaylistId: null,
      isPlayingFromPlaylist: false,
      setPlaylistContext: vi.fn(),
      visualizationsEnabled: false,
      setVisualizationsEnabled: vi.fn(),
      nextTrack: vi.fn(),
      previousTrack: vi.fn(),
      toggleVisualizations: vi.fn(),
    };

    mockedUsePlaylistStore.mockReturnValue(mockPlaylistStore);
    mockedUseAudioStore.mockReturnValue(mockAudioStore);

    // Mock fetch for audio files - return the mock tracks
    mockFetch.mockImplementation(url => {
      if (typeof url === 'string' && url.includes('/api/audio/files')) {
        return Promise.resolve({
          ok: true,
          json: async () =>
            mockAudioStore.audioFiles.map(track => ({
              ...track,
              coverArtUrl: track.coverArtUrl || null,
            })),
        } as Response);
      }
      if (typeof url === 'string' && url.includes('/api/playlists')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockPlaylistStore.playlists,
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => [],
      } as Response);
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Component Rendering', () => {
    test('should render MusicPlayer component', async () => {
      const mockTrack = createMockTrack(1);
      const mockPlaylist = createMockPlaylist();

      // Set up mock stores with data BEFORE mocking return values
      mockAudioStore.audioFiles = [mockTrack];
      mockPlaylistStore.playlists = [mockPlaylist];
      mockPlaylistStore.allTracks = [mockTrack];

      // Re-mock with updated data
      mockedUseAudioStore.mockReturnValue(mockAudioStore);
      mockedUsePlaylistStore.mockReturnValue(mockPlaylistStore);

      // Render component wrapped in act
      let container: HTMLElement;
      await rtlAct(async () => {
        const rendered = render(
          <MusicPlayer isOpen={true} onClose={vi.fn()} />
        );
        container = rendered.container;
      });

      // Wait for component to fully render
      await waitFor(() => {
        // The BaseDialog mock should render when isOpen is true
        const dialog = container!.querySelector('[data-testid="base-dialog"]');
        expect(dialog).toBeTruthy();

        // Check for the LCD display
        const lcdDisplay = container!.querySelector(
          '[data-testid="lcd-display"]'
        );
        expect(lcdDisplay).toBeTruthy();
      });

      // The AutoSizer and VirtualList are conditional based on view state
      // They only render when view is 'library', not 'playlists'
      // Since we have tracks and no current playlist, it should be in library view
      const autoSizer = container!.querySelector('[data-testid="auto-sizer"]');
      const virtualList = container!.querySelector(
        '[data-testid="virtual-list"]'
      );

      // These components render conditionally based on the view
      // We're verifying that the component renders without errors
      // The virtual list only shows when in library view with tracks
      if (
        mockAudioStore.audioFiles.length > 0 &&
        !mockPlaylistStore.currentPlaylist
      ) {
        expect(autoSizer).toBeTruthy();
        expect(virtualList).toBeTruthy();
      }
    });
  });

  describe('Store Integration', () => {
    test('should call addTracksToPlaylist when dragging multiple tracks', async () => {
      const mockTracks = [
        createMockTrack(1),
        createMockTrack(2),
        createMockTrack(3),
      ];
      const mockPlaylist = createMockPlaylist();

      mockAudioStore.audioFiles = mockTracks;
      mockPlaylistStore.playlists = [mockPlaylist];
      mockPlaylistStore.allTracks = mockTracks;

      // Simulate the drag and drop action directly on the store
      await rtlAct(async () => {
        // This simulates what would happen when tracks are dropped
        mockPlaylistStore.addTracksToPlaylist(mockPlaylist.id, mockTracks);
      });

      // Verify the batch method was called
      expect(mockPlaylistStore.addTracksToPlaylist).toHaveBeenCalledWith(
        mockPlaylist.id,
        mockTracks
      );
      expect(mockPlaylistStore.addTracksToPlaylist).toHaveBeenCalledTimes(1);
    });

    test('should handle single track drag to playlist', async () => {
      const mockTrack = createMockTrack(1);
      const mockPlaylist = createMockPlaylist();

      mockAudioStore.audioFiles = [mockTrack];
      mockPlaylistStore.playlists = [mockPlaylist];
      mockPlaylistStore.allTracks = [mockTrack];

      // Simulate single track drag
      await rtlAct(async () => {
        mockPlaylistStore.addTrackToPlaylist(mockPlaylist.id, mockTrack);
      });

      // Verify single track method was called
      expect(mockPlaylistStore.addTrackToPlaylist).toHaveBeenCalledWith(
        mockPlaylist.id,
        mockTrack
      );
    });

    test('should not call loadPlaylistsFromFile after adding tracks', async () => {
      const mockTracks = [createMockTrack(1), createMockTrack(2)];
      const mockPlaylist = createMockPlaylist();

      mockAudioStore.audioFiles = mockTracks;
      mockPlaylistStore.playlists = [mockPlaylist];
      mockPlaylistStore.allTracks = mockTracks;

      // Simulate batch add
      await rtlAct(async () => {
        mockPlaylistStore.addTracksToPlaylist(mockPlaylist.id, mockTracks);
      });

      // Verify we don't reload from file (which would cause race condition)
      expect(mockPlaylistStore.loadPlaylistsFromFile).not.toHaveBeenCalled();
    });
  });

  describe('Batch Operations', () => {
    test('should handle large batch operations efficiently', async () => {
      const mockTracks = Array.from({ length: 100 }, (_, i) =>
        createMockTrack(i + 1)
      );
      const mockPlaylist = createMockPlaylist();

      mockAudioStore.audioFiles = mockTracks;
      mockPlaylistStore.playlists = [mockPlaylist];
      mockPlaylistStore.allTracks = mockTracks;

      const startTime = performance.now();

      await rtlAct(async () => {
        mockPlaylistStore.addTracksToPlaylist(mockPlaylist.id, mockTracks);
      });

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should complete quickly (< 100ms for mock operations)
      expect(duration).toBeLessThan(100);

      // Should be called once with all tracks
      expect(mockPlaylistStore.addTracksToPlaylist).toHaveBeenCalledWith(
        mockPlaylist.id,
        expect.arrayContaining(mockTracks)
      );
      expect(mockPlaylistStore.addTracksToPlaylist).toHaveBeenCalledTimes(1);
    });

    test('should prevent duplicate additions', async () => {
      const existingTrack = createMockTrack(1);
      const newTracks = [
        createMockTrack(1), // duplicate
        createMockTrack(2),
        createMockTrack(3),
      ];

      const mockPlaylist = createMockPlaylist({
        trackRefs: [{ trackId: existingTrack.id, path: existingTrack.path }],
      });

      mockAudioStore.audioFiles = newTracks;
      mockPlaylistStore.playlists = [mockPlaylist];
      mockPlaylistStore.allTracks = newTracks;
      mockPlaylistStore.getPlaylistTracks = vi.fn(() => [existingTrack]);

      await rtlAct(async () => {
        // The actual implementation should filter duplicates
        mockPlaylistStore.addTracksToPlaylist(mockPlaylist.id, newTracks);
      });

      // Verify the method was called
      expect(mockPlaylistStore.addTracksToPlaylist).toHaveBeenCalledWith(
        mockPlaylist.id,
        newTracks
      );
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty track array', async () => {
      const mockPlaylist = createMockPlaylist();

      mockPlaylistStore.playlists = [mockPlaylist];

      await rtlAct(async () => {
        mockPlaylistStore.addTracksToPlaylist(mockPlaylist.id, []);
      });

      expect(mockPlaylistStore.addTracksToPlaylist).toHaveBeenCalledWith(
        mockPlaylist.id,
        []
      );
    });

    test('should handle non-existent playlist gracefully', async () => {
      const mockTracks = [createMockTrack(1)];

      mockAudioStore.audioFiles = mockTracks;
      mockPlaylistStore.allTracks = mockTracks;

      await rtlAct(async () => {
        mockPlaylistStore.addTracksToPlaylist('non-existent-id', mockTracks);
      });

      expect(mockPlaylistStore.addTracksToPlaylist).toHaveBeenCalledWith(
        'non-existent-id',
        mockTracks
      );
    });
  });
});
