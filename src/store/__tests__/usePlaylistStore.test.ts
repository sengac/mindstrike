import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePlaylistStore } from '../usePlaylistStore';

// Mock the logger
vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock fetch for API calls with proper typing
const mockFetch = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>();
global.fetch = mockFetch as typeof fetch;

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

const createLargeMockTrackSet = (count: number) => {
  return Array.from({ length: count }, (_, i) => createMockTrack(i + 1));
};

describe('usePlaylistStore', () => {
  beforeEach(() => {
    // Reset store state
    const { result } = renderHook(() => usePlaylistStore());
    act(() => {
      usePlaylistStore.setState({
        playlists: [],
        currentPlaylist: null,
        allTracks: [],
      });
    });

    // Reset fetch mock
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('addTrackToPlaylist', () => {
    test('should add a single track to playlist', () => {
      const { result } = renderHook(() => usePlaylistStore());
      const mockTrack = createMockTrack(1);
      const mockPlaylist = createMockPlaylist();

      // Setup initial state
      act(() => {
        usePlaylistStore.setState({
          playlists: [mockPlaylist],
          allTracks: [mockTrack],
        });
      });

      // Mock successful save
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);

      // Add track to playlist
      act(() => {
        result.current.addTrackToPlaylist(mockPlaylist.id, mockTrack);
      });

      // Verify track was added
      const updatedPlaylist = result.current.playlists[0];
      expect(updatedPlaylist.trackRefs).toHaveLength(1);
      expect(updatedPlaylist.trackRefs[0]).toEqual({
        trackId: mockTrack.id,
        path: mockTrack.path,
      });
    });

    test('should not add duplicate tracks', () => {
      const { result } = renderHook(() => usePlaylistStore());
      const mockTrack = createMockTrack(1);
      const mockPlaylist = createMockPlaylist({
        trackRefs: [{ trackId: mockTrack.id, path: mockTrack.path }],
      });

      // Setup initial state
      act(() => {
        usePlaylistStore.setState({
          playlists: [mockPlaylist],
          allTracks: [mockTrack],
        });
      });

      // Try to add duplicate track
      act(() => {
        result.current.addTrackToPlaylist(mockPlaylist.id, mockTrack);
      });

      // Verify no duplicate was added
      const updatedPlaylist = result.current.playlists[0];
      expect(updatedPlaylist.trackRefs).toHaveLength(1);
    });
  });

  describe('addTracksToPlaylist', () => {
    test('should add multiple tracks in batch', () => {
      const { result } = renderHook(() => usePlaylistStore());
      const mockTracks = [
        createMockTrack(1),
        createMockTrack(2),
        createMockTrack(3),
      ];
      const mockPlaylist = createMockPlaylist();

      // Setup initial state
      act(() => {
        usePlaylistStore.setState({
          playlists: [mockPlaylist],
          allTracks: mockTracks,
        });
      });

      // Mock successful save
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);

      // Add multiple tracks
      act(() => {
        result.current.addTracksToPlaylist(mockPlaylist.id, mockTracks);
      });

      // Verify all tracks were added
      const updatedPlaylist = result.current.playlists[0];
      expect(updatedPlaylist.trackRefs).toHaveLength(3);
      expect(updatedPlaylist.trackRefs.map(ref => ref.trackId)).toEqual([
        1, 2, 3,
      ]);
    });

    test('should handle large batch operations (50+ tracks)', () => {
      const { result } = renderHook(() => usePlaylistStore());
      const mockTracks = createLargeMockTrackSet(100);
      const mockPlaylist = createMockPlaylist();

      // Setup initial state
      act(() => {
        usePlaylistStore.setState({
          playlists: [mockPlaylist],
          allTracks: mockTracks,
        });
      });

      // Mock successful save
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);

      // Add large batch of tracks
      act(() => {
        result.current.addTracksToPlaylist(mockPlaylist.id, mockTracks);
      });

      // Verify all tracks were added
      const updatedPlaylist = result.current.playlists[0];
      expect(updatedPlaylist.trackRefs).toHaveLength(100);

      // Verify save was called only once
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('should filter out duplicates when adding batch', () => {
      const { result } = renderHook(() => usePlaylistStore());
      const existingTracks = [createMockTrack(1), createMockTrack(2)];
      const newTracks = [
        createMockTrack(2), // duplicate
        createMockTrack(3),
        createMockTrack(4),
      ];
      const mockPlaylist = createMockPlaylist({
        trackRefs: existingTracks.map(t => ({ trackId: t.id, path: t.path })),
      });

      // Setup initial state
      act(() => {
        usePlaylistStore.setState({
          playlists: [mockPlaylist],
          allTracks: [...existingTracks, ...newTracks],
        });
      });

      // Mock successful save
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);

      // Add tracks with duplicates
      act(() => {
        result.current.addTracksToPlaylist(mockPlaylist.id, newTracks);
      });

      // Verify only non-duplicates were added
      const updatedPlaylist = result.current.playlists[0];
      expect(updatedPlaylist.trackRefs).toHaveLength(4);
      expect(updatedPlaylist.trackRefs.map(ref => ref.trackId)).toEqual([
        1, 2, 3, 4,
      ]);
    });

    test('should handle empty track array', () => {
      const { result } = renderHook(() => usePlaylistStore());
      const mockPlaylist = createMockPlaylist();

      // Setup initial state
      act(() => {
        usePlaylistStore.setState({
          playlists: [mockPlaylist],
          allTracks: [],
        });
      });

      // Add empty array
      act(() => {
        result.current.addTracksToPlaylist(mockPlaylist.id, []);
      });

      // Verify no changes
      const updatedPlaylist = result.current.playlists[0];
      expect(updatedPlaylist.trackRefs).toHaveLength(0);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('should handle non-existent playlist', () => {
      const { result } = renderHook(() => usePlaylistStore());
      const mockTracks = [createMockTrack(1)];

      // Setup initial state
      act(() => {
        usePlaylistStore.setState({
          playlists: [],
          allTracks: mockTracks,
        });
      });

      // Try to add to non-existent playlist
      act(() => {
        result.current.addTracksToPlaylist('non-existent-id', mockTracks);
      });

      // Verify no error and no save attempt
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('should update playlist timestamp on batch add', () => {
      const { result } = renderHook(() => usePlaylistStore());
      const mockTracks = [createMockTrack(1), createMockTrack(2)];
      const originalDate = new Date('2024-01-01');
      const mockPlaylist = createMockPlaylist({
        updatedAt: originalDate,
      });

      // Setup initial state
      act(() => {
        usePlaylistStore.setState({
          playlists: [mockPlaylist],
          allTracks: mockTracks,
        });
      });

      // Mock successful save
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);

      // Add tracks
      act(() => {
        result.current.addTracksToPlaylist(mockPlaylist.id, mockTracks);
      });

      // Verify timestamp was updated
      const updatedPlaylist = result.current.playlists[0];
      expect(updatedPlaylist.updatedAt).not.toEqual(originalDate);
      expect(updatedPlaylist.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('savePlaylistsToFile', () => {
    test('should save playlists to backend', async () => {
      const { result } = renderHook(() => usePlaylistStore());
      const mockPlaylists = [
        createMockPlaylist({ id: 'playlist-1' }),
        createMockPlaylist({ id: 'playlist-2' }),
      ];

      // Setup initial state
      act(() => {
        usePlaylistStore.setState({
          playlists: mockPlaylists,
        });
      });

      // Mock successful save
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);

      // Save playlists
      await act(async () => {
        await result.current.savePlaylistsToFile();
      });

      // Verify API was called correctly
      expect(global.fetch).toHaveBeenCalledWith('/api/playlists/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mockPlaylists),
      });
    });

    test('should handle save errors gracefully', async () => {
      const { result } = renderHook(() => usePlaylistStore());
      const mockPlaylists = [createMockPlaylist()];

      // Setup initial state
      act(() => {
        usePlaylistStore.setState({
          playlists: mockPlaylists,
        });
      });

      // Mock failed save
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      // Save playlists
      await act(async () => {
        await result.current.savePlaylistsToFile();
      });

      // Verify error was handled (no crash)
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  describe('getPlaylistTracks', () => {
    test('should resolve track references to actual tracks', () => {
      const { result } = renderHook(() => usePlaylistStore());
      const mockTracks = [
        createMockTrack(1),
        createMockTrack(2),
        createMockTrack(3),
      ];
      const mockPlaylist = createMockPlaylist({
        trackRefs: [
          { trackId: 1, path: '/music/track1.mp3' },
          { trackId: 3, path: '/music/track3.mp3' },
        ],
      });

      // Setup initial state
      act(() => {
        usePlaylistStore.setState({
          playlists: [mockPlaylist],
          allTracks: mockTracks,
        });
      });

      // Get playlist tracks
      let playlistTracks;
      act(() => {
        playlistTracks = result.current.getPlaylistTracks(mockPlaylist.id);
      });

      // Verify correct tracks were returned
      expect(playlistTracks).toHaveLength(2);
      expect(playlistTracks).toEqual([mockTracks[0], mockTracks[2]]);
    });

    test('should handle missing track IDs gracefully', () => {
      const { result } = renderHook(() => usePlaylistStore());
      const mockTracks = [createMockTrack(1)];
      const mockPlaylist = createMockPlaylist({
        trackRefs: [
          { trackId: 1, path: '/music/track1.mp3' },
          { trackId: 999, path: '/music/track999.mp3' }, // non-existent
        ],
      });

      // Setup initial state
      act(() => {
        usePlaylistStore.setState({
          playlists: [mockPlaylist],
          allTracks: mockTracks,
        });
      });

      // Get playlist tracks
      let playlistTracks;
      act(() => {
        playlistTracks = result.current.getPlaylistTracks(mockPlaylist.id);
      });

      // Verify only existing tracks were returned
      expect(playlistTracks).toHaveLength(1);
      expect(playlistTracks).toEqual([mockTracks[0]]);
    });
  });

  describe('reorderPlaylistTracks', () => {
    test('should reorder tracks within playlist', () => {
      const { result } = renderHook(() => usePlaylistStore());
      const mockTracks = [
        createMockTrack(1),
        createMockTrack(2),
        createMockTrack(3),
      ];
      const mockPlaylist = createMockPlaylist({
        trackRefs: mockTracks.map(t => ({ trackId: t.id, path: t.path })),
      });

      // Setup initial state
      act(() => {
        usePlaylistStore.setState({
          playlists: [mockPlaylist],
          allTracks: mockTracks,
        });
      });

      // Mock successful save
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);

      // Reorder tracks (move track 3 to position 0)
      act(() => {
        result.current.reorderPlaylistTracks(mockPlaylist.id, 2, 0);
      });

      // Verify new order
      const updatedPlaylist = result.current.playlists[0];
      expect(updatedPlaylist.trackRefs.map(ref => ref.trackId)).toEqual([
        3, 1, 2,
      ]);
    });
  });
});
