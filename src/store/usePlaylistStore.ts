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

interface PlaylistTrackReference {
  trackId: number;
  path: string; // backup identifier in case ID changes
}

interface Playlist {
  id: string;
  name: string;
  description?: string;
  trackRefs: PlaylistTrackReference[];
  createdAt: Date;
  updatedAt: Date;
}

interface PlaylistState {
  playlists: Playlist[];
  currentPlaylist: Playlist | null;
  allTracks: AudioFile[]; // cache of all available tracks

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
  getPlaylistTracks: (playlistId: string) => AudioFile[];
  setAllTracks: (tracks: AudioFile[]) => void;
  savePlaylistsToFile: () => Promise<void>;
  loadPlaylistsFromFile: () => Promise<void>;
  initializePlaylistStore: () => Promise<void>;
}

export const usePlaylistStore = create<PlaylistState>()((set, get) => ({
  playlists: [],
  currentPlaylist: null,
  allTracks: [],

  createPlaylist: (name, description) => {
    const newPlaylist: Playlist = {
      id: crypto.randomUUID(),
      name,
      description,
      trackRefs: [],
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
    if (playlist && playlist.trackRefs.some(ref => ref.trackId === track.id)) {
      console.log('Track already in playlist');
      return;
    }

    const trackRef: PlaylistTrackReference = {
      trackId: track.id,
      path: track.path,
    };

    set(state => ({
      playlists: state.playlists.map(p =>
        p.id === playlistId
          ? {
              ...p,
              trackRefs: [...p.trackRefs, trackRef],
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
              trackRefs: p.trackRefs.filter(ref => ref.trackId !== trackId),
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
          const newTrackRefs = [...p.trackRefs];
          const [movedTrackRef] = newTrackRefs.splice(fromIndex, 1);
          newTrackRefs.splice(toIndex, 0, movedTrackRef);

          return {
            ...p,
            trackRefs: newTrackRefs,
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

  getPlaylistTracks: playlistId => {
    const playlist = get().playlists.find(p => p.id === playlistId);
    if (!playlist) return [];

    const { allTracks } = get();
    return playlist.trackRefs
      .map(ref => {
        // First try to find by trackId
        let track = allTracks.find(t => t.id === ref.trackId);
        // Fallback to finding by path if trackId doesn't match
        if (!track) {
          track = allTracks.find(t => t.path === ref.path);
        }
        return track;
      })
      .filter(track => track !== undefined) as AudioFile[];
  },

  setAllTracks: tracks => {
    set({ allTracks: tracks });
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
