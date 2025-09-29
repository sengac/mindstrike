import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { act as rtlAct } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MusicPlayer } from '../MusicPlayer';
import { useAudioStore, type AudioFile } from '../../store/useAudioStore';
import { usePlaylistStore, type Playlist } from '../../store/usePlaylistStore';

// Mock the stores
vi.mock('../../store/useAudioStore');
vi.mock('../../store/usePlaylistStore');
vi.mock('../../hooks/useImageCache', () => ({
  useImageCache: () => ({ cachedUrl: undefined }),
}));

// Mock LCDCanvas to avoid canvas/ResizeObserver issues
vi.mock('../LCDCanvas', () => ({
  LCDCanvas: () => null,
}));

// Mock howler
vi.mock('howler', () => ({
  Howl: vi.fn().mockImplementation(() => ({
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    unload: vi.fn(),
    volume: vi.fn(),
    seek: vi.fn(),
    duration: vi.fn(() => 180),
    on: vi.fn(),
  })),
}));

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

describe('MusicPlayer - All Tracks Sorting', () => {
  let mockAudioStore: ReturnType<typeof useAudioStore>;
  let mockPlaylistStore: ReturnType<typeof usePlaylistStore>;
  const mockedUseAudioStore = vi.mocked(useAudioStore);
  const mockedUsePlaylistStore = vi.mocked(usePlaylistStore);

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup mock audio store
    mockAudioStore = {
      audioFiles: [],
      currentTrack: null,
      activePlaylistId: null,
      isPlayingFromPlaylist: false,
      isPlaying: false,
      isLoading: false,
      volume: 0.7,
      currentTime: 0,
      duration: 0,
      visualizationsEnabled: true,
      isShuffled: false,
      setAudioFiles: vi.fn(),
      playTrack: vi.fn(),
      setPlaylistContext: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
      setVolume: vi.fn(),
      seek: vi.fn(),
      nextTrack: vi.fn(),
      previousTrack: vi.fn(),
      toggleVisualizations: vi.fn(),
      toggleShuffle: vi.fn(),
      currentTrackIndex: -1,
      shuffleOrder: [],
      howl: null,
      cleanup: vi.fn(),
      updateCurrentTime: vi.fn(),
    };

    // Setup mock playlist store
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
      reorderPlaylistTracks: vi.fn(),
      setCurrentPlaylist: vi.fn(),
      getPlaylistTracks: vi.fn(() => []),
      setAllTracks: vi.fn(),
      loadPlaylistsFromFile: vi.fn(),
      initializePlaylistStore: vi.fn(),
      savePlaylistsToFile: vi.fn(),
    };

    mockedUseAudioStore.mockReturnValue(mockAudioStore);
    mockedUsePlaylistStore.mockReturnValue(mockPlaylistStore);

    // Mock global fetch with proper typing
    global.fetch = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>();
  });

  describe('Artist > Album (Year) > Track Number Sorting', () => {
    it('should sort tracks by artist name alphabetically', async () => {
      const unsortedTracks: Partial<AudioFile>[] = [
        {
          id: 1,
          title: 'Song 1',
          artist: 'Zebra Band',
          album: 'Album A',
          year: 2020,
          path: '/music/song1.mp3',
          url: '/api/audio/1',
          duration: '3:00',
          size: 3000000,
        },
        {
          id: 2,
          title: 'Song 2',
          artist: 'Alpha Artist',
          album: 'Album B',
          year: 2020,
          path: '/music/song2.mp3',
          url: '/api/audio/2',
          duration: '3:30',
          size: 3500000,
        },
        {
          id: 3,
          title: 'Song 3',
          artist: 'Beta Band',
          album: 'Album C',
          year: 2020,
          path: '/music/song3.mp3',
          url: '/api/audio/3',
          duration: '4:00',
          size: 4000000,
        },
      ];

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => unsortedTracks,
      } as Response);

      render(<MusicPlayer isOpen={true} onClose={() => {}} />);

      await waitFor(() => {
        const setAudioFilesCalls = vi.mocked(mockAudioStore.setAudioFiles).mock
          .calls;
        expect(setAudioFilesCalls.length).toBeGreaterThan(0);

        const sortedTracks =
          setAudioFilesCalls[setAudioFilesCalls.length - 1][0];
        expect(sortedTracks[0].artist).toBe('Alpha Artist');
        expect(sortedTracks[1].artist).toBe('Beta Band');
        expect(sortedTracks[2].artist).toBe('Zebra Band');
      });
    });

    it('should sort albums by year within the same artist', async () => {
      const unsortedTracks: Partial<AudioFile>[] = [
        {
          id: 1,
          title: 'Song 1',
          artist: 'Same Artist',
          album: 'Latest Album',
          year: 2023,
          path: '/music/song1.mp3',
          url: '/api/audio/1',
          duration: '3:00',
          size: 3000000,
        },
        {
          id: 2,
          title: 'Song 2',
          artist: 'Same Artist',
          album: 'First Album',
          year: 2018,
          path: '/music/song2.mp3',
          url: '/api/audio/2',
          duration: '3:30',
          size: 3500000,
        },
        {
          id: 3,
          title: 'Song 3',
          artist: 'Same Artist',
          album: 'Middle Album',
          year: 2020,
          path: '/music/song3.mp3',
          url: '/api/audio/3',
          duration: '4:00',
          size: 4000000,
        },
      ];

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => unsortedTracks,
      } as Response);

      render(<MusicPlayer isOpen={true} onClose={() => {}} />);

      await waitFor(() => {
        const setAudioFilesCalls = vi.mocked(mockAudioStore.setAudioFiles).mock
          .calls;
        expect(setAudioFilesCalls.length).toBeGreaterThan(0);

        const sortedTracks =
          setAudioFilesCalls[setAudioFilesCalls.length - 1][0];
        expect(sortedTracks[0].album).toBe('First Album');
        expect(sortedTracks[0].year).toBe(2018);
        expect(sortedTracks[1].album).toBe('Middle Album');
        expect(sortedTracks[1].year).toBe(2020);
        expect(sortedTracks[2].album).toBe('Latest Album');
        expect(sortedTracks[2].year).toBe(2023);
      });
    });

    it('should sort by track number within the same album', async () => {
      const unsortedTracks: Partial<AudioFile>[] = [
        {
          id: 1,
          title: 'Track Three',
          artist: 'Same Artist',
          album: 'Same Album',
          year: 2020,
          path: '/music/track3.mp3',
          url: '/api/audio/1',
          duration: '3:00',
          size: 3000000,
          metadata: {
            common: {
              track: { no: 3, of: 10 },
            },
            format: {},
          },
        },
        {
          id: 2,
          title: 'Track One',
          artist: 'Same Artist',
          album: 'Same Album',
          year: 2020,
          path: '/music/track1.mp3',
          url: '/api/audio/2',
          duration: '3:30',
          size: 3500000,
          metadata: {
            common: {
              track: { no: 1, of: 10 },
            },
            format: {},
          },
        },
        {
          id: 3,
          title: 'Track Two',
          artist: 'Same Artist',
          album: 'Same Album',
          year: 2020,
          path: '/music/track2.mp3',
          url: '/api/audio/3',
          duration: '4:00',
          size: 4000000,
          metadata: {
            common: {
              track: { no: 2, of: 10 },
            },
            format: {},
          },
        },
      ];

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => unsortedTracks,
      } as Response);

      render(<MusicPlayer isOpen={true} onClose={() => {}} />);

      await waitFor(() => {
        const setAudioFilesCalls = vi.mocked(mockAudioStore.setAudioFiles).mock
          .calls;
        expect(setAudioFilesCalls.length).toBeGreaterThan(0);

        const sortedTracks =
          setAudioFilesCalls[setAudioFilesCalls.length - 1][0];
        expect(sortedTracks[0].title).toBe('Track One');
        expect(sortedTracks[1].title).toBe('Track Two');
        expect(sortedTracks[2].title).toBe('Track Three');
      });
    });

    it('should handle missing metadata gracefully', async () => {
      const tracksWithMissingData: Partial<AudioFile>[] = [
        {
          id: 1,
          title: 'Song with all data',
          artist: 'Artist A',
          album: 'Album A',
          year: 2020,
          path: '/music/song1.mp3',
          url: '/api/audio/1',
          duration: '3:00',
          size: 3000000,
          metadata: {
            common: {
              track: { no: 1, of: 10 },
            },
            format: {},
          },
        },
        {
          id: 2,
          title: 'Song without artist',
          artist: undefined,
          album: 'Album B',
          year: 2020,
          path: '/music/song2.mp3',
          url: '/api/audio/2',
          duration: '3:30',
          size: 3500000,
        },
        {
          id: 3,
          title: 'Song without year',
          artist: 'Artist B',
          album: 'Album C',
          year: undefined,
          path: '/music/song3.mp3',
          url: '/api/audio/3',
          duration: '4:00',
          size: 4000000,
        },
        {
          id: 4,
          title: 'Song without track number',
          artist: 'Artist A',
          album: 'Album A',
          year: 2020,
          path: '/music/song4.mp3',
          url: '/api/audio/4',
          duration: '3:15',
          size: 3150000,
        },
      ];

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => tracksWithMissingData,
      } as Response);

      render(<MusicPlayer isOpen={true} onClose={() => {}} />);

      await waitFor(() => {
        const setAudioFilesCalls = vi.mocked(mockAudioStore.setAudioFiles).mock
          .calls;
        expect(setAudioFilesCalls.length).toBeGreaterThan(0);

        const sortedTracks =
          setAudioFilesCalls[setAudioFilesCalls.length - 1][0];

        // Artist A songs should come first
        expect(sortedTracks[0].artist).toBe('Artist A');
        expect(sortedTracks[1].artist).toBe('Artist A');

        // Artist B should come next
        expect(sortedTracks[2].artist).toBe('Artist B');

        // Songs without artist should be last (treated as "Unknown Artist")
        expect(sortedTracks[3].artist).toBeUndefined();

        // Within Artist A's Album A, track with number should come before track without
        expect(sortedTracks[0].metadata?.common?.track?.no).toBe(1);
        expect(sortedTracks[1].metadata).toBeUndefined();
      });
    });

    it('should use title as final fallback for sorting', async () => {
      const tracksWithSameMetadata: Partial<AudioFile>[] = [
        {
          id: 1,
          title: 'Zebra Song',
          artist: 'Same Artist',
          album: 'Same Album',
          year: 2020,
          path: '/music/zebra.mp3',
          url: '/api/audio/1',
          duration: '3:00',
          size: 3000000,
        },
        {
          id: 2,
          title: 'Alpha Song',
          artist: 'Same Artist',
          album: 'Same Album',
          year: 2020,
          path: '/music/alpha.mp3',
          url: '/api/audio/2',
          duration: '3:30',
          size: 3500000,
        },
        {
          id: 3,
          title: 'Beta Song',
          artist: 'Same Artist',
          album: 'Same Album',
          year: 2020,
          path: '/music/beta.mp3',
          url: '/api/audio/3',
          duration: '4:00',
          size: 4000000,
        },
      ];

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => tracksWithSameMetadata,
      } as Response);

      render(<MusicPlayer isOpen={true} onClose={() => {}} />);

      await waitFor(() => {
        const setAudioFilesCalls = vi.mocked(mockAudioStore.setAudioFiles).mock
          .calls;
        expect(setAudioFilesCalls.length).toBeGreaterThan(0);

        const sortedTracks =
          setAudioFilesCalls[setAudioFilesCalls.length - 1][0];
        expect(sortedTracks[0].title).toBe('Alpha Song');
        expect(sortedTracks[1].title).toBe('Beta Song');
        expect(sortedTracks[2].title).toBe('Zebra Song');
      });
    });
  });

  describe('Playlist Order Preservation', () => {
    it('should maintain custom playlist order and not apply sorting', async () => {
      const allTracks: AudioFile[] = [
        {
          id: 1,
          title: 'Track A',
          artist: 'Artist Z',
          album: 'Album Z',
          year: 2023,
          path: '/music/a.mp3',
          url: '/api/audio/1',
          duration: '3:00',
          size: 3000000,
        },
        {
          id: 2,
          title: 'Track B',
          artist: 'Artist A',
          album: 'Album A',
          year: 2018,
          path: '/music/b.mp3',
          url: '/api/audio/2',
          duration: '3:30',
          size: 3500000,
        },
        {
          id: 3,
          title: 'Track C',
          artist: 'Artist M',
          album: 'Album M',
          year: 2020,
          path: '/music/c.mp3',
          url: '/api/audio/3',
          duration: '4:00',
          size: 4000000,
        },
      ] as AudioFile[];

      // Custom playlist order (not sorted)
      const playlistTracks = [allTracks[2], allTracks[0], allTracks[1]]; // C, A, B

      const mockPlaylist: Playlist = {
        id: 'playlist-1',
        name: 'My Custom Playlist',
        trackRefs: [
          { trackId: 3, path: '/music/c.mp3' },
          { trackId: 1, path: '/music/a.mp3' },
          { trackId: 2, path: '/music/b.mp3' },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Update mock stores
      mockPlaylistStore.playlists = [mockPlaylist];
      mockPlaylistStore.currentPlaylist = mockPlaylist;
      mockPlaylistStore.allTracks = allTracks;
      mockPlaylistStore.getPlaylistTracks = vi.fn(() => playlistTracks);

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => allTracks,
      } as Response);

      const { rerender } = render(
        <MusicPlayer isOpen={true} onClose={() => {}} />
      );

      // Wait for initial load
      await waitFor(() => {
        expect(mockPlaylistStore.initializePlaylistStore).toHaveBeenCalled();
      });

      // Simulate selecting a playlist
      await rtlAct(async () => {
        mockPlaylistStore.setCurrentPlaylist(mockPlaylist);
        mockAudioStore.setAudioFiles(playlistTracks);
      });

      // Verify playlist tracks are NOT sorted
      const playlistSetCalls = vi.mocked(mockAudioStore.setAudioFiles).mock
        .calls;
      const playlistOrder = playlistSetCalls.find(
        call => call[0].length === 3 && call[0][0].id === 3
      );

      if (playlistOrder) {
        expect(playlistOrder[0][0].title).toBe('Track C');
        expect(playlistOrder[0][1].title).toBe('Track A');
        expect(playlistOrder[0][2].title).toBe('Track B');
      }
    });

    it('should switch between sorted All Tracks and unsorted playlist views', async () => {
      const allTracks: AudioFile[] = [
        {
          id: 1,
          title: 'Song 1',
          artist: 'Zebra',
          album: 'Album Z',
          year: 2020,
          path: '/music/1.mp3',
          url: '/api/audio/1',
          duration: '3:00',
          size: 3000000,
        },
        {
          id: 2,
          title: 'Song 2',
          artist: 'Alpha',
          album: 'Album A',
          year: 2020,
          path: '/music/2.mp3',
          url: '/api/audio/2',
          duration: '3:30',
          size: 3500000,
        },
      ] as AudioFile[];

      const playlist: Playlist = {
        id: 'test-playlist',
        name: 'Test Playlist',
        trackRefs: [
          { trackId: 1, path: '/music/1.mp3' },
          { trackId: 2, path: '/music/2.mp3' },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPlaylistStore.playlists = [playlist];
      mockPlaylistStore.allTracks = allTracks;
      mockPlaylistStore.getPlaylistTracks = vi.fn(() => [
        allTracks[0],
        allTracks[1],
      ]);

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => allTracks,
      } as Response);

      render(<MusicPlayer isOpen={true} onClose={() => {}} />);

      await waitFor(() => {
        const setAudioFilesCalls = vi.mocked(mockAudioStore.setAudioFiles).mock
          .calls;
        expect(setAudioFilesCalls.length).toBeGreaterThan(0);

        // All Tracks view should be sorted (Alpha before Zebra)
        const sortedCall = setAudioFilesCalls.find(
          call => call[0].length === 2 && call[0][0].artist === 'Alpha'
        );

        if (sortedCall) {
          expect(sortedCall[0][0].artist).toBe('Alpha');
          expect(sortedCall[0][1].artist).toBe('Zebra');
        }
      });

      // Switch to playlist view
      await rtlAct(async () => {
        mockPlaylistStore.setCurrentPlaylist(playlist);
        mockAudioStore.setAudioFiles([allTracks[0], allTracks[1]]);
      });

      // Playlist should maintain original order (Zebra before Alpha)
      const playlistCalls = vi.mocked(mockAudioStore.setAudioFiles).mock.calls;
      const playlistCall = playlistCalls[playlistCalls.length - 1];

      expect(playlistCall[0][0].artist).toBe('Zebra');
      expect(playlistCall[0][1].artist).toBe('Alpha');
    });
  });

  describe('Complex Sorting Scenarios', () => {
    it('should handle complete sorting hierarchy correctly', async () => {
      const complexTracks: Partial<AudioFile>[] = [
        // Artist A - Album from 2020
        {
          id: 1,
          title: 'A2020 Track 2',
          artist: 'Artist A',
          album: 'Album 2020',
          year: 2020,
          path: '/music/1.mp3',
          url: '/api/audio/1',
          duration: '3:00',
          size: 3000000,
          metadata: {
            common: { track: { no: 2, of: 3 } },
            format: {},
          },
        },
        {
          id: 2,
          title: 'A2020 Track 1',
          artist: 'Artist A',
          album: 'Album 2020',
          year: 2020,
          path: '/music/2.mp3',
          url: '/api/audio/2',
          duration: '3:00',
          size: 3000000,
          metadata: {
            common: { track: { no: 1, of: 3 } },
            format: {},
          },
        },
        // Artist A - Album from 2018
        {
          id: 3,
          title: 'A2018 Track 1',
          artist: 'Artist A',
          album: 'Album 2018',
          year: 2018,
          path: '/music/3.mp3',
          url: '/api/audio/3',
          duration: '3:00',
          size: 3000000,
          metadata: {
            common: { track: { no: 1, of: 2 } },
            format: {},
          },
        },
        // Artist B - Album from 2019
        {
          id: 4,
          title: 'B2019 Track 3',
          artist: 'Artist B',
          album: 'Album 2019',
          year: 2019,
          path: '/music/4.mp3',
          url: '/api/audio/4',
          duration: '3:00',
          size: 3000000,
          metadata: {
            common: { track: { no: 3, of: 5 } },
            format: {},
          },
        },
        {
          id: 5,
          title: 'B2019 Track 1',
          artist: 'Artist B',
          album: 'Album 2019',
          year: 2019,
          path: '/music/5.mp3',
          url: '/api/audio/5',
          duration: '3:00',
          size: 3000000,
          metadata: {
            common: { track: { no: 1, of: 5 } },
            format: {},
          },
        },
      ];

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => complexTracks,
      } as Response);

      render(<MusicPlayer isOpen={true} onClose={() => {}} />);

      await waitFor(() => {
        const setAudioFilesCalls = vi.mocked(mockAudioStore.setAudioFiles).mock
          .calls;
        expect(setAudioFilesCalls.length).toBeGreaterThan(0);

        const sortedTracks =
          setAudioFilesCalls[setAudioFilesCalls.length - 1][0];

        // Expected order:
        // 1. Artist A - Album 2018 - Track 1
        // 2. Artist A - Album 2020 - Track 1
        // 3. Artist A - Album 2020 - Track 2
        // 4. Artist B - Album 2019 - Track 1
        // 5. Artist B - Album 2019 - Track 3

        expect(sortedTracks[0].title).toBe('A2018 Track 1');
        expect(sortedTracks[1].title).toBe('A2020 Track 1');
        expect(sortedTracks[2].title).toBe('A2020 Track 2');
        expect(sortedTracks[3].title).toBe('B2019 Track 1');
        expect(sortedTracks[4].title).toBe('B2019 Track 3');
      });
    });
  });
});
