import { describe, test, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePlaylistStore } from '../../store/usePlaylistStore';
import { useAudioStore } from '../../store/useAudioStore';

// Mock fetch
const mockFetch = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>();
global.fetch = mockFetch as typeof fetch;

// Mock logger
vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Test fixtures
const createMockTrack = (id: number) => ({
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

describe('MusicPlayer Batch Operations', () => {
  beforeEach(() => {
    // Reset stores
    usePlaylistStore.setState({
      playlists: [],
      currentPlaylist: null,
      allTracks: [],
    });

    useAudioStore.setState({
      audioFiles: [],
      currentTrack: null,
      isPlaying: false,
    });

    vi.clearAllMocks();
  });

  describe('Batch Track Addition Integration', () => {
    test('should handle batch addition of 50+ tracks without race conditions', async () => {
      const { result: playlistStore } = renderHook(() => usePlaylistStore());
      const { result: audioStore } = renderHook(() => useAudioStore());

      // Create test data
      const mockTracks = Array.from({ length: 100 }, (_, i) =>
        createMockTrack(i + 1)
      );
      const mockPlaylist = createMockPlaylist();

      // Setup initial state
      act(() => {
        playlistStore.current.createPlaylist(
          mockPlaylist.name,
          mockPlaylist.description
        );
        audioStore.current.setAudioFiles(mockTracks);
        playlistStore.current.setAllTracks(mockTracks);
      });

      const playlist = playlistStore.current.playlists[0];

      // Mock successful save
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);

      // Simulate batch drag and drop
      act(() => {
        playlistStore.current.addTracksToPlaylist(playlist.id, mockTracks);
      });

      // Verify all tracks were added
      expect(playlistStore.current.playlists[0].trackRefs).toHaveLength(100);

      // Verify save was called twice (once for create, once for batch add - no race condition)
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/playlists/save',
        expect.any(Object)
      );
    });

    test('should handle concurrent drag operations correctly', async () => {
      const { result: playlistStore } = renderHook(() => usePlaylistStore());

      // Create test data
      const batch1 = Array.from({ length: 25 }, (_, i) =>
        createMockTrack(i + 1)
      );
      const batch2 = Array.from({ length: 25 }, (_, i) =>
        createMockTrack(i + 26)
      );
      const mockPlaylist = createMockPlaylist();

      // Setup initial state
      act(() => {
        playlistStore.current.createPlaylist(
          mockPlaylist.name,
          mockPlaylist.description
        );
        playlistStore.current.setAllTracks([...batch1, ...batch2]);
      });

      const playlist = playlistStore.current.playlists[0];

      // Mock successful saves
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);

      // Simulate two rapid batch additions (like user dragging twice quickly)
      act(() => {
        playlistStore.current.addTracksToPlaylist(playlist.id, batch1);
      });

      act(() => {
        playlistStore.current.addTracksToPlaylist(playlist.id, batch2);
      });

      // Verify all tracks were added
      expect(playlistStore.current.playlists[0].trackRefs).toHaveLength(50);

      // Verify each batch triggered a save (3 saves total: 1 for create, 2 for additions)
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    test('should filter duplicates when adding multiple selections', async () => {
      const { result: playlistStore } = renderHook(() => usePlaylistStore());

      // Create test data with some duplicates
      const existingTracks = [createMockTrack(1), createMockTrack(2)];
      const newTracks = [
        createMockTrack(2), // duplicate
        createMockTrack(3),
        createMockTrack(4),
        createMockTrack(1), // duplicate
        createMockTrack(5),
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
        playlistStore.current.addTracksToPlaylist(mockPlaylist.id, newTracks);
      });

      // Verify only unique tracks were added (2 existing + 3 new = 5 total)
      const finalRefs = playlistStore.current.playlists[0].trackRefs;
      expect(finalRefs).toHaveLength(5);
      expect(finalRefs.map(r => r.trackId)).toEqual([1, 2, 3, 4, 5]);
    });

    test('should maintain correct order when batch adding', async () => {
      const { result: playlistStore } = renderHook(() => usePlaylistStore());

      // Create tracks in specific order
      const tracksToAdd = [
        createMockTrack(5),
        createMockTrack(3),
        createMockTrack(8),
        createMockTrack(1),
        createMockTrack(9),
      ];

      const mockPlaylist = createMockPlaylist();

      // Setup initial state
      act(() => {
        playlistStore.current.createPlaylist(
          mockPlaylist.name,
          mockPlaylist.description
        );
        playlistStore.current.setAllTracks(tracksToAdd);
      });

      const playlist = playlistStore.current.playlists[0];

      // Mock successful save
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);

      // Add tracks
      act(() => {
        playlistStore.current.addTracksToPlaylist(playlist.id, tracksToAdd);
      });

      // Verify order is preserved
      const finalRefs = playlistStore.current.playlists[0].trackRefs;
      expect(finalRefs.map(r => r.trackId)).toEqual([5, 3, 8, 1, 9]);
    });

    test('should handle empty batch gracefully', async () => {
      const { result: playlistStore } = renderHook(() => usePlaylistStore());

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
        playlistStore.current.addTracksToPlaylist(mockPlaylist.id, []);
      });

      // Verify no changes and no save attempt
      expect(playlistStore.current.playlists[0].trackRefs).toHaveLength(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('should update timestamps correctly on batch operations', async () => {
      const { result: playlistStore } = renderHook(() => usePlaylistStore());

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

      const beforeUpdate = Date.now();

      // Add tracks
      act(() => {
        playlistStore.current.addTracksToPlaylist(mockPlaylist.id, mockTracks);
      });

      const afterUpdate = Date.now();

      // Verify timestamp was updated
      const updatedPlaylist = playlistStore.current.playlists[0];
      expect(updatedPlaylist.updatedAt.getTime()).toBeGreaterThanOrEqual(
        beforeUpdate
      );
      expect(updatedPlaylist.updatedAt.getTime()).toBeLessThanOrEqual(
        afterUpdate
      );
      expect(updatedPlaylist.updatedAt).not.toEqual(originalDate);
    });
  });

  describe('Performance Tests', () => {
    test('should handle 1000+ tracks efficiently', async () => {
      const { result: playlistStore } = renderHook(() => usePlaylistStore());

      // Create large dataset
      const mockTracks = Array.from({ length: 1000 }, (_, i) =>
        createMockTrack(i + 1)
      );
      const mockPlaylist = createMockPlaylist();

      // Setup initial state
      act(() => {
        playlistStore.current.createPlaylist(
          mockPlaylist.name,
          mockPlaylist.description
        );
        playlistStore.current.setAllTracks(mockTracks);
      });

      const playlist = playlistStore.current.playlists[0];

      // Mock successful save
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);

      const startTime = performance.now();

      // Add all tracks
      act(() => {
        playlistStore.current.addTracksToPlaylist(playlist.id, mockTracks);
      });

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should complete in reasonable time (less than 100ms for in-memory operations)
      expect(duration).toBeLessThan(100);

      // Verify all tracks were added
      expect(playlistStore.current.playlists[0].trackRefs).toHaveLength(1000);

      // Two save calls: one for create, one for batch add
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
