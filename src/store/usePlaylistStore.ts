import { create } from 'zustand';

interface AudioFile {
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

interface Playlist {
  id: string;
  name: string;
  description?: string;
  tracks: AudioFile[];
  createdAt: Date;
  updatedAt: Date;
}

interface PlaylistState {
  playlists: Playlist[];
  currentPlaylist: Playlist | null;

  // Actions
  createPlaylist: (name: string, description?: string) => void;
  deletePlaylist: (id: string) => void;
  updatePlaylist: (id: string, updates: Partial<Playlist>) => void;
  addTrackToPlaylist: (playlistId: string, track: AudioFile) => void;
  removeTrackFromPlaylist: (playlistId: string, trackId: number) => void;
  setCurrentPlaylist: (playlist: Playlist | null) => void;
  reorderPlaylistTracks: (
    playlistId: string,
    fromIndex: number,
    toIndex: number
  ) => Promise<void>;
  getPlaylistById: (id: string) => Playlist | undefined;
  savePlaylistsToFile: () => Promise<void>;
  loadPlaylistsFromFile: () => Promise<void>;
  initializePlaylistStore: () => Promise<void>;
}

export const usePlaylistStore = create<PlaylistState>()((set, get) => ({
  playlists: [],
  currentPlaylist: null,

  createPlaylist: (name, description) => {
    const newPlaylist: Playlist = {
      id: crypto.randomUUID(),
      name,
      description,
      tracks: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    set(state => ({
      playlists: [...state.playlists, newPlaylist],
    }));

    get().savePlaylistsToFile();
  },

  deletePlaylist: id => {
    set(state => ({
      playlists: state.playlists.filter(p => p.id !== id),
      currentPlaylist:
        state.currentPlaylist?.id === id ? null : state.currentPlaylist,
    }));

    get().savePlaylistsToFile();
  },

  updatePlaylist: (id, updates) => {
    set(state => ({
      playlists: state.playlists.map(p =>
        p.id === id ? { ...p, ...updates, updatedAt: new Date() } : p
      ),
    }));

    get().savePlaylistsToFile();
  },

  addTrackToPlaylist: (playlistId, track) => {
    // Check if track is already in the playlist
    const playlist = get().playlists.find(p => p.id === playlistId);
    if (playlist && playlist.tracks.some(t => t.id === track.id)) {
      console.log('Track already in playlist');
      return;
    }

    set(state => ({
      playlists: state.playlists.map(p =>
        p.id === playlistId
          ? {
              ...p,
              tracks: [...p.tracks, track],
              updatedAt: new Date(),
            }
          : p
      ),
    }));

    get().savePlaylistsToFile();
  },

  removeTrackFromPlaylist: (playlistId, trackId) => {
    set(state => ({
      playlists: state.playlists.map(p =>
        p.id === playlistId
          ? {
              ...p,
              tracks: p.tracks.filter(t => t.id !== trackId),
              updatedAt: new Date(),
            }
          : p
      ),
    }));

    get().savePlaylistsToFile();
  },

  setCurrentPlaylist: playlist => {
    set({ currentPlaylist: playlist });
  },

  reorderPlaylistTracks: async (playlistId, fromIndex, toIndex) => {
    set(state => ({
      playlists: state.playlists.map(p => {
        if (p.id === playlistId) {
          const newTracks = [...p.tracks];
          const [movedTrack] = newTracks.splice(fromIndex, 1);
          newTracks.splice(toIndex, 0, movedTrack);

          return {
            ...p,
            tracks: newTracks,
            updatedAt: new Date(),
          };
        }
        return p;
      }),
    }));

    await get().savePlaylistsToFile();
  },

  getPlaylistById: id => {
    return get().playlists.find(p => p.id === id);
  },

  savePlaylistsToFile: async () => {
    try {
      const playlists = get().playlists;
      const response = await fetch('/api/playlists/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(playlists),
      });

      if (!response.ok) {
        console.error(
          'Failed to save playlists:',
          response.status,
          response.statusText
        );
      }
    } catch (error) {
      console.error('Failed to save playlists:', error);
    }
  },

  loadPlaylistsFromFile: async () => {
    try {
      const response = await fetch('/api/playlists/load');
      if (response.ok) {
        const playlists = await response.json();
        set({ playlists });
      } else {
        console.error(
          'Failed to load playlists:',
          response.status,
          response.statusText
        );
      }
    } catch (error) {
      console.error('Failed to load playlists:', error);
    }
  },

  initializePlaylistStore: async () => {
    try {
      await get().loadPlaylistsFromFile();
    } catch (error) {
      console.error('Failed to initialize playlist store:', error);
    }
  },
}));
