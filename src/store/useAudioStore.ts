import { create } from 'zustand';
import { Howl } from 'howler';

interface AudioFile {
  id: number;
  title: string;
  artist: string;
  duration: string;
  url: string;
  path: string;
  size: number;
}

interface AudioState {
  // Audio files
  audioFiles: AudioFile[];
  currentTrack: AudioFile | null;
  currentTrackIndex: number;

  // Playback state
  isPlaying: boolean;
  isLoading: boolean;
  volume: number;
  currentTime: number;
  duration: number;

  // Howl instance
  howl: Howl | null;

  // Actions
  setAudioFiles: (files: AudioFile[]) => void;
  playTrack: (track: AudioFile, index: number) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  setVolume: (volume: number) => void;
  seek: (time: number) => void;
  nextTrack: () => void;
  previousTrack: () => void;
  updateCurrentTime: () => void;
  cleanup: () => void;
}

export const useAudioStore = create<AudioState>((set, get) => ({
  // Initial state
  audioFiles: [],
  currentTrack: null,
  currentTrackIndex: -1,
  isPlaying: false,
  isLoading: false,
  volume: 0.7,
  currentTime: 0,
  duration: 0,
  howl: null,

  // Actions
  setAudioFiles: files => set({ audioFiles: files }),

  playTrack: (track, index) => {
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
      onerror: (id, error) => {
        console.error('Audio error:', error);
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
    }
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
    const { audioFiles, currentTrackIndex } = get();
    if (audioFiles.length > 0) {
      const nextIndex = (currentTrackIndex + 1) % audioFiles.length;
      get().playTrack(audioFiles[nextIndex], nextIndex);
    }
  },

  previousTrack: () => {
    const { audioFiles, currentTrackIndex } = get();
    if (audioFiles.length > 0) {
      const prevIndex =
        currentTrackIndex <= 0 ? audioFiles.length - 1 : currentTrackIndex - 1;
      get().playTrack(audioFiles[prevIndex], prevIndex);
    }
  },

  updateCurrentTime: () => {
    const { howl } = get();
    if (howl && get().isPlaying) {
      const currentTime = howl.seek() || 0;
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
}));
