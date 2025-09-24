import { create } from 'zustand';
import { Howl } from 'howler';
import toast from 'react-hot-toast';
import { logger } from '../utils/logger';

export interface AudioFile {
  id: number;
  title: string;
  artist: string;
  album?: string;
  genre?: string[];
  year?: number;
  duration: string;
  url: string;
  path: string;
  size: number;
  metadata?: {
    common: {
      title?: string;
      artist?: string;
      album?: string;
      genre?: string[];
      year?: number;
      [key: string]: unknown;
    };
    format: {
      duration?: number;
      bitrate?: number;
      sampleRate?: number;
      numberOfChannels?: number;
      [key: string]: unknown;
    };
  };
  coverArtUrl?: string;
}

interface AudioState {
  // Audio files
  audioFiles: AudioFile[];
  currentTrack: AudioFile | null;
  currentTrackIndex: number;

  // Playlist context
  activePlaylistId: string | null;
  isPlayingFromPlaylist: boolean;

  // Playback state
  isPlaying: boolean;
  isLoading: boolean;
  volume: number;
  currentTime: number;
  duration: number;

  // Shuffle state
  isShuffled: boolean;
  shuffleOrder: number[];

  // Visualizations
  visualizationsEnabled: boolean;

  // Howl instance
  howl: Howl | null;

  // Actions
  setAudioFiles: (files: AudioFile[]) => void;
  playTrack: (
    track: AudioFile,
    index: number,
    playlistId?: string | null
  ) => void;
  setPlaylistContext: (
    playlistId: string | null,
    isFromPlaylist: boolean
  ) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  setVolume: (volume: number) => void;
  seek: (time: number) => void;
  nextTrack: () => void;
  previousTrack: () => void;
  updateCurrentTime: () => void;
  cleanup: () => void;
  toggleVisualizations: () => void;
  toggleShuffle: () => void;
}

export const useAudioStore = create<AudioState>((set, get) => ({
  // Initial state
  audioFiles: [],
  currentTrack: null,
  currentTrackIndex: -1,
  activePlaylistId: null,
  isPlayingFromPlaylist: false,
  isPlaying: false,
  isLoading: false,
  volume: 0.7,
  currentTime: 0,
  duration: 0,
  isShuffled: false,
  shuffleOrder: [],
  visualizationsEnabled: true,
  howl: null,

  // Actions
  setAudioFiles: files => {
    const { isShuffled } = get();
    let shuffleOrder: number[] = [];
    if (isShuffled) {
      // Regenerate shuffle order when audio files change
      shuffleOrder = [...Array(files.length)].map((_, i) => i);
      for (let i = shuffleOrder.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffleOrder[i], shuffleOrder[j]] = [shuffleOrder[j], shuffleOrder[i]];
      }
    }
    set({ audioFiles: files, shuffleOrder });
  },

  setPlaylistContext: (playlistId, isFromPlaylist) => {
    set({
      activePlaylistId: playlistId,
      isPlayingFromPlaylist: isFromPlaylist,
    });
  },

  playTrack: (track, index, playlistId = null) => {
    const state = get();

    // Stop current track if playing
    if (state.howl) {
      state.howl.stop();
      state.howl.unload();
    }

    set({
      isLoading: true,
      currentTrack: track,
      currentTrackIndex: index,
      currentTime: 0,
      duration: 0,
      activePlaylistId: playlistId,
      isPlayingFromPlaylist: playlistId !== null,
    });

    const howl = new Howl({
      src: [track.url],
      html5: true,
      volume: state.volume,
      onload: () => {
        set({
          isLoading: false,
          duration: howl.duration(),
        });
      },
      onplay: () => {
        set({ isPlaying: true });

        // Show "Now Playing" toast with metadata
        const { currentTrack } = get();
        if (currentTrack) {
          const album = currentTrack.album ? ` • ${currentTrack.album}` : '';
          const year = currentTrack.year ? ` (${currentTrack.year})` : '';
          const toastContent = `${currentTrack.title}\n${currentTrack.artist ?? 'Unknown Artist'}${album}${year}`;
          toast(toastContent, {
            duration: 15000,
            icon: currentTrack.coverArtUrl ? (
              <img
                src={currentTrack.coverArtUrl}
                alt="Album cover"
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '4px',
                  objectFit: 'cover',
                }}
              />
            ) : (
              '🎵'
            ),
          });
        }

        // Start time updates
        const updateTime = () => {
          if (get().isPlaying) {
            get().updateCurrentTime();
            requestAnimationFrame(updateTime);
          }
        };
        updateTime();
      },
      onpause: () => set({ isPlaying: false }),
      onstop: () => set({ isPlaying: false, currentTime: 0 }),
      onend: () => {
        set({ isPlaying: false });
        // Auto-play next track
        get().nextTrack();
      },
      onloaderror: (error: unknown) => {
        logger.error('Audio error:', error);
        set({ isLoading: false, isPlaying: false });
      },
    });

    set({ howl });
    howl.play();
  },

  play: () => {
    const { howl } = get();
    if (howl && !get().isPlaying) {
      howl.play();
    }
  },

  pause: () => {
    const { howl } = get();
    if (howl && get().isPlaying) {
      howl.pause();
    }
  },

  stop: () => {
    const { howl } = get();
    if (howl) {
      howl.stop();
      howl.unload();
    }
    set({
      currentTrack: null,
      currentTrackIndex: -1,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      howl: null,
    });
  },

  setVolume: volume => {
    const { howl } = get();
    set({ volume });
    if (howl) {
      howl.volume(volume);
    }
  },

  seek: time => {
    const { howl } = get();
    if (howl) {
      howl.seek(time);
      set({ currentTime: time });
    }
  },

  nextTrack: () => {
    const { audioFiles, currentTrackIndex, isShuffled, shuffleOrder } = get();
    if (audioFiles.length > 0) {
      let nextIndex;
      if (isShuffled && shuffleOrder.length > 0) {
        const currentShuffleIndex = shuffleOrder.findIndex(
          idx => idx === currentTrackIndex
        );
        const nextShuffleIndex =
          (currentShuffleIndex + 1) % shuffleOrder.length;
        nextIndex = shuffleOrder[nextShuffleIndex];
      } else {
        nextIndex = (currentTrackIndex + 1) % audioFiles.length;
      }
      get().playTrack(audioFiles[nextIndex], nextIndex);
    }
  },

  previousTrack: () => {
    const { audioFiles, currentTrackIndex, isShuffled, shuffleOrder } = get();
    if (audioFiles.length > 0) {
      let prevIndex;
      if (isShuffled && shuffleOrder.length > 0) {
        const currentShuffleIndex = shuffleOrder.findIndex(
          idx => idx === currentTrackIndex
        );
        const prevShuffleIndex =
          currentShuffleIndex <= 0
            ? shuffleOrder.length - 1
            : currentShuffleIndex - 1;
        prevIndex = shuffleOrder[prevShuffleIndex];
      } else {
        prevIndex =
          currentTrackIndex <= 0
            ? audioFiles.length - 1
            : currentTrackIndex - 1;
      }
      get().playTrack(audioFiles[prevIndex], prevIndex);
    }
  },

  updateCurrentTime: () => {
    const { howl } = get();
    if (howl && get().isPlaying) {
      const currentTime = howl.seek() ?? 0;
      set({ currentTime: typeof currentTime === 'number' ? currentTime : 0 });
    }
  },

  cleanup: () => {
    const { howl } = get();
    if (howl) {
      howl.stop();
      howl.unload();
    }
    set({
      howl: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
    });
  },

  toggleVisualizations: () => {
    set(state => ({ visualizationsEnabled: !state.visualizationsEnabled }));
  },

  toggleShuffle: () => {
    const { audioFiles, isShuffled } = get();
    if (!isShuffled) {
      // Enable shuffle: create a randomized order
      const shuffleOrder = [...Array(audioFiles.length)].map((_, i) => i);
      for (let i = shuffleOrder.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffleOrder[i], shuffleOrder[j]] = [shuffleOrder[j], shuffleOrder[i]];
      }
      set({ isShuffled: true, shuffleOrder });
    } else {
      // Disable shuffle: clear the shuffle order
      set({ isShuffled: false, shuffleOrder: [] });
    }
  },
}));
