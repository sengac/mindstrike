import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  X,
  Eye,
  EyeOff,
  Loader,
  RotateCcw,
  Search,
  Plus,
  List,
  Music,
  Trash2,
  Edit3,
  Shuffle,
  Square,
} from 'lucide-react';
import { BaseDialog } from './shared/BaseDialog';
import { useDialogAnimation } from '../hooks/useDialogAnimation';
import { useEffect, useState, useRef } from 'react';
import { useAudioStore, type AudioFile } from '../store/useAudioStore';
import { usePlaylistStore, type Playlist } from '../store/usePlaylistStore';
import { useImageCache } from '../hooks/useImageCache';

import { LCDDisplay } from './LCDDisplay';
import { CachedAlbumArt } from './CachedAlbumArt';
import { List as VirtualizedList, AutoSizer } from 'react-virtualized';
import { logger } from '../utils/logger';

interface MusicPlayerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MusicPlayer({ isOpen, onClose }: MusicPlayerProps) {
  const { shouldRender, isVisible, handleClose } = useDialogAnimation(
    isOpen,
    () => {
      // Reset UI state when closing (but preserve playlist state for restore)
      setShowCreatePlaylist(false);
      setEditingPlaylistId(null);
      setDraggedTrack(null);
      setDropTargetPlaylistId(null);
      setSelectedTracks(new Set());
      setLastClickedIndex(null);
      onClose();
    }
  );

  const [lcdCharCols, setLcdCharCols] = useState<number>(0);
  const [isLoadingPlaylist, setIsLoadingPlaylist] = useState<boolean>(false);
  const [isDraggingProgress, setIsDraggingProgress] = useState<boolean>(false);
  const [isDraggingVolume, setIsDraggingVolume] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showCreatePlaylist, setShowCreatePlaylist] = useState<boolean>(false);
  const [showPlaylists, setShowPlaylists] = useState<boolean>(false);
  const [newPlaylistName, setNewPlaylistName] = useState<string>('');
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(
    null
  );
  const [editingPlaylistName, setEditingPlaylistName] = useState<string>('');
  const [viewingPlaylist, setViewingPlaylist] = useState<boolean>(false);
  const [allTracks, setAllTracksLocal] = useState<AudioFile[]>([]);
  const [draggedTrack, setDraggedTrack] = useState<
    AudioFile | AudioFile[] | null
  >(null);
  const [dropTargetPlaylistId, setDropTargetPlaylistId] = useState<
    string | null
  >(null);
  const [hasRestoredPlaylist, setHasRestoredPlaylist] =
    useState<boolean>(false);
  const [reorderDropPosition, setReorderDropPosition] = useState<number | null>(
    null
  );
  const [isDraggingForReorder, setIsDraggingForReorder] =
    useState<boolean>(false);
  const reorderTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const listRef = useRef<VirtualizedList | null>(null);
  const hasScrolledToCurrentTrack = useRef<boolean>(false);

  // Multi-selection state
  const [selectedTracks, setSelectedTracks] = useState<Set<number>>(new Set());
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);

  const {
    audioFiles,
    currentTrack,
    activePlaylistId,
    isPlayingFromPlaylist,
    isPlaying,
    isLoading,
    volume,
    currentTime,
    duration,
    visualizationsEnabled,
    isShuffled,
    setAudioFiles,
    playTrack,
    setPlaylistContext,
    play,
    pause,
    stop,
    setVolume,
    seek,
    nextTrack,
    previousTrack,
    toggleVisualizations,
    toggleShuffle,
  } = useAudioStore();

  // Use image cache for current track cover art
  const { cachedUrl: currentTrackCoverArt } = useImageCache(
    currentTrack?.coverArtUrl
  );

  const {
    playlists,
    currentPlaylist,
    createPlaylist,
    deletePlaylist,
    updatePlaylist,
    addTrackToPlaylist,
    addTracksToPlaylist,
    removeTrackFromPlaylist,
    reorderPlaylistTracks,
    setCurrentPlaylist,
    getPlaylistTracks,
    setAllTracks,
    loadPlaylistsFromFile,
    initializePlaylistStore,
  } = usePlaylistStore();

  // Fetch audio files and playlists when dialog opens
  useEffect(() => {
    if (shouldRender) {
      setHasRestoredPlaylist(false); // Reset restoration flag
      fetchAudioFiles();
      initializePlaylistStore();
    }
  }, [shouldRender]);

  // Restore playlist selection after data loads (only once when dialog opens)
  useEffect(() => {
    if (shouldRender && allTracks.length > 0 && !hasRestoredPlaylist) {
      if (isPlayingFromPlaylist && activePlaylistId && playlists.length > 0) {
        // Restore the specific playlist that was being played from
        const activePlaylist = playlists.find(
          playlist => playlist.id === activePlaylistId
        );

        if (activePlaylist) {
          setCurrentPlaylist(activePlaylist);
          setAudioFiles(getPlaylistTracks(activePlaylist.id));
          setViewingPlaylist(true);
        } else {
          // Playlist not found, fallback to "All Tracks"
          setViewingPlaylist(false);
          setCurrentPlaylist(null);
          setAudioFiles([...allTracks]); // Use a copy to maintain sort order
        }
      } else {
        // Playing from "All Tracks" or no track playing, show "All Tracks"
        setViewingPlaylist(false);
        setCurrentPlaylist(null);
        setAudioFiles([...allTracks]); // Use a copy to maintain sort order
      }
      setHasRestoredPlaylist(true); // Mark as restored
    }
  }, [
    shouldRender,
    playlists,
    allTracks,
    hasRestoredPlaylist,
    isPlayingFromPlaylist,
    activePlaylistId,
  ]);

  const fetchAudioFiles = async () => {
    setIsLoadingPlaylist(true);
    try {
      const response = await fetch('/api/audio/files');
      if (!response.ok) {
        throw new Error('Failed to fetch audio files');
      }
      const files = (await response.json()) as Array<{
        id: number;
        title: string;
        artist: string;
        album?: string;
        genre?: string[];
        year: number;
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
        coverArtUrl: string | null;
      }>;
      const audioFiles = files.map(file => ({
        id: file.id,
        title: file.title,
        artist: file.artist,
        album: file.album,
        genre: file.genre,
        year: file.year,
        duration: file.duration,
        url: file.url,
        path: file.path,
        size: file.size,
        metadata: file.metadata,
        coverArtUrl: file.coverArtUrl ?? undefined,
      }));

      // Sort tracks by: Artist > Album (by year) > Track Number
      const sortedAudioFiles = [...audioFiles].sort((a, b) => {
        // First, sort by artist (handle undefined/null)
        const artistA = a.artist || 'Unknown Artist';
        const artistB = b.artist || 'Unknown Artist';
        const artistCompare = artistA.localeCompare(artistB);
        if (artistCompare !== 0) return artistCompare;

        // Within same artist, sort by album year (older albums first)
        const yearA = a.year || 9999; // Unknown years go last
        const yearB = b.year || 9999;
        const yearCompare = yearA - yearB;
        if (yearCompare !== 0) return yearCompare;

        // Within same year, sort by album name
        const albumA = a.album || 'Unknown Album';
        const albumB = b.album || 'Unknown Album';
        const albumCompare = albumA.localeCompare(albumB);
        if (albumCompare !== 0) return albumCompare;

        // Within same album, sort by track number
        const trackNoA =
          (
            a.metadata?.common?.track as
              | { no?: number; of?: number }
              | undefined
          )?.no || 999;
        const trackNoB =
          (
            b.metadata?.common?.track as
              | { no?: number; of?: number }
              | undefined
          )?.no || 999;
        const trackCompare = trackNoA - trackNoB;
        if (trackCompare !== 0) return trackCompare;

        // Final fallback: sort by title
        return a.title.localeCompare(b.title);
      });

      setAllTracksLocal(sortedAudioFiles); // Store the sorted track list locally
      setAllTracks(sortedAudioFiles); // Store in playlist store
      // Set audioFiles immediately to show tracks if not in a playlist
      if (!isPlayingFromPlaylist) {
        setAudioFiles(sortedAudioFiles);
      }
    } catch (error) {
      logger.error('Error fetching audio files:', error);
    } finally {
      setIsLoadingPlaylist(false);
    }
  };

  const togglePlayPause = () => {
    if (isPlaying) {
      pause();
    } else {
      // If no track is selected, automatically select the first track
      if (!currentTrack && audioFiles.length > 0) {
        const firstTrack = audioFiles[0];
        const playlistId = viewingPlaylist
          ? (currentPlaylist?.id ?? null)
          : null;
        playTrack(firstTrack, 0, playlistId);
      } else {
        play();
      }
    }
  };

  const handleVolumeChange = (percentage: number) => {
    setVolume(percentage / 100);
  };

  const handleSeek = (percentage: number) => {
    const seekTime = (percentage / 100) * duration;
    seek(seekTime);
  };

  const handleTrackSelect = (
    filteredIndex: number,
    event?: React.MouseEvent
  ) => {
    const track = filteredAudioFiles[filteredIndex];
    if (track) {
      // Handle multi-selection
      if (event && (event.shiftKey || event.metaKey || event.ctrlKey)) {
        handleTrackMultiSelect(filteredIndex, event);
        return;
      }

      // Clear selection on normal click
      setSelectedTracks(new Set());
      setLastClickedIndex(null);

      // Find the original index in the full audioFiles array
      const originalIndex = audioFiles.findIndex(f => f.id === track.id);
      // Pass current playlist context
      const playlistId = viewingPlaylist ? (currentPlaylist?.id ?? null) : null;
      playTrack(track, originalIndex, playlistId);
    }
  };

  const handleTrackMultiSelect = (
    filteredIndex: number,
    event: React.MouseEvent
  ) => {
    const track = filteredAudioFiles[filteredIndex];
    if (!track) {
      return;
    }

    const isMetaOrCtrl = event.metaKey || event.ctrlKey;
    const isShift = event.shiftKey;

    if (isShift && lastClickedIndex !== null) {
      // Range selection
      const start = Math.min(lastClickedIndex, filteredIndex);
      const end = Math.max(lastClickedIndex, filteredIndex);
      const newSelected = new Set(selectedTracks);

      for (let i = start; i <= end; i++) {
        const rangeTrack = filteredAudioFiles[i];
        if (rangeTrack) {
          newSelected.add(rangeTrack.id);
        }
      }

      setSelectedTracks(newSelected);
    } else if (isMetaOrCtrl) {
      // Individual selection toggle
      const newSelected = new Set(selectedTracks);
      if (newSelected.has(track.id)) {
        newSelected.delete(track.id);
      } else {
        newSelected.add(track.id);
      }
      setSelectedTracks(newSelected);
      setLastClickedIndex(filteredIndex);
    }
  };

  const getSliderPercentage = (e: React.MouseEvent, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const percentage = ((e.clientX - rect.left) / rect.width) * 100;
    return Math.max(0, Math.min(100, percentage));
  };

  const handleProgressMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDraggingProgress(true);
    const percentage = getSliderPercentage(e, e.currentTarget);
    handleSeek(percentage);
  };

  const handleVolumeMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDraggingVolume(true);
    const percentage = getSliderPercentage(e, e.currentTarget);
    handleVolumeChange(percentage);
  };

  // Global mouse move and up handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingProgress) {
        const progressBar = document.querySelector(
          '[data-progress-bar]'
        ) as HTMLElement;
        if (progressBar) {
          const rect = progressBar.getBoundingClientRect();
          const percentage = ((e.clientX - rect.left) / rect.width) * 100;
          const clampedPercentage = Math.max(0, Math.min(100, percentage));
          handleSeek(clampedPercentage);
        }
      } else if (isDraggingVolume) {
        const volumeBar = document.querySelector(
          '[data-volume-bar]'
        ) as HTMLElement;
        if (volumeBar) {
          const rect = volumeBar.getBoundingClientRect();
          const percentage = ((e.clientX - rect.left) / rect.width) * 100;
          const clampedPercentage = Math.max(0, Math.min(100, percentage));
          handleVolumeChange(clampedPercentage);
        }
      }
    };

    const handleMouseUp = () => {
      setIsDraggingProgress(false);
      setIsDraggingVolume(false);
    };

    if (isDraggingProgress || isDraggingVolume) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('mouseleave', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mouseleave', handleMouseUp);
    };
  }, [isDraggingProgress, isDraggingVolume]);

  // Auto-scroll to currently playing track when song changes
  useEffect(() => {
    if (currentTrack && listRef.current && audioFiles.length > 0) {
      // Calculate filtered files within the effect to avoid dependency issues
      const searchLower = searchTerm.toLowerCase();
      const tracksToFilter =
        viewingPlaylist && currentPlaylist
          ? getPlaylistTracks(currentPlaylist.id)
          : allTracks;

      const filteredFiles = searchTerm.trim()
        ? tracksToFilter.filter(track => {
            const title = track.title?.toLowerCase() ?? '';
            const artist = track.artist?.toLowerCase() ?? '';
            const album =
              (typeof track.album === 'string'
                ? track.album
                : ''
              )?.toLowerCase() ?? '';
            const genres = Array.isArray(track.genre)
              ? track.genre
                  .map(g => (typeof g === 'string' ? g.toLowerCase() : ''))
                  .join(' ')
              : '';

            return (
              title.includes(searchLower) ||
              artist.includes(searchLower) ||
              album.includes(searchLower) ||
              genres.includes(searchLower)
            );
          })
        : audioFiles;

      const currentTrackIndex = filteredFiles.findIndex(
        track => track.id === currentTrack.id
      );

      if (currentTrackIndex !== -1) {
        // Reset the scroll flag when a new track starts playing
        hasScrolledToCurrentTrack.current = false;

        // Small delay to ensure the list is rendered
        setTimeout(() => {
          if (listRef.current && !hasScrolledToCurrentTrack.current) {
            listRef.current.scrollToRow(currentTrackIndex);
            hasScrolledToCurrentTrack.current = true;
          }
        }, 100);
      }
    }
  }, [
    currentTrack,
    audioFiles,
    searchTerm,
    viewingPlaylist,
    currentPlaylist,
    allTracks,
  ]);

  if (!shouldRender) {
    return null;
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatLCDDisplay = () => {
    const currentTimeStr = `♪ ${formatTime(currentTime)}`;
    const remainingTimeStr = `-${formatTime(duration - currentTime)}`;

    // Calculate spacing to position remaining time at 80% of character width
    const timeRowContent = (() => {
      if (lcdCharCols === 0) {
        // Fallback to fixed spacing if dimensions not yet calculated
        return `${currentTimeStr}${' '.repeat(10)}${remainingTimeStr}`;
      }

      const remainingTimePosition = Math.floor(lcdCharCols * 0.8);
      const spacingNeeded = Math.max(
        0,
        remainingTimePosition - currentTimeStr.length
      );
      return `${currentTimeStr}${' '.repeat(spacingNeeded)}${remainingTimeStr}`;
    })();

    // Enhanced display with metadata
    const albumYearLine = (() => {
      const albumPart = currentTrack?.album
        ? `ALBUM: ${currentTrack.album}`
        : '';
      const yearPart = currentTrack?.year ? `YEAR: ${currentTrack.year}` : '';
      if (albumPart && yearPart) {
        return `${albumPart} • ${yearPart}`;
      }
      return (albumPart || yearPart) ?? '';
    })();

    return [
      // First row: current and remaining time positioned at 80%
      timeRowContent,
      // Second row: track title
      currentTrack?.title ? `SONG: ${currentTrack.title}` : 'NO TRACK LOADED',
      // Third row: artist name
      currentTrack?.artist ? `ARTIST: ${currentTrack.artist}` : '',
      // Fourth row: album and year info
      albumYearLine,
      // Fifth row: genre info
      currentTrack?.genre?.length
        ? `GENRE: ${currentTrack.genre.join(', ')}`
        : '',
    ];
  };

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;
  const volumePercentage = volume * 100;

  // Filter tracks based on search term and current view
  const filteredAudioFiles = (() => {
    if (!searchTerm.trim()) {
      return audioFiles;
    }

    const searchLower = searchTerm.toLowerCase();
    const tracksToFilter =
      viewingPlaylist && currentPlaylist
        ? getPlaylistTracks(currentPlaylist.id)
        : allTracks;

    return tracksToFilter.filter(track => {
      const title = track.title?.toLowerCase() ?? '';
      const artist = track.artist?.toLowerCase() ?? '';
      const album =
        (typeof track.album === 'string' ? track.album : '')?.toLowerCase() ??
        '';
      const genres = Array.isArray(track.genre)
        ? track.genre
            .map(g => (typeof g === 'string' ? g.toLowerCase() : ''))
            .join(' ')
        : '';

      return (
        title.includes(searchLower) ||
        artist.includes(searchLower) ||
        album.includes(searchLower) ||
        genres.includes(searchLower)
      );
    });
  })();

  const clearSearch = () => {
    setSearchTerm('');
  };

  const getSelectedTracksInfo = () => {
    const selectedCount = selectedTracks.size;
    if (selectedCount === 0) {
      return null;
    }

    const selectedList = filteredAudioFiles.filter(t =>
      selectedTracks.has(t.id)
    );
    return {
      count: selectedCount,
      tracks: selectedList,
    };
  };

  const handleCreatePlaylist = () => {
    if (newPlaylistName.trim()) {
      createPlaylist(newPlaylistName.trim());
      setNewPlaylistName('');
      setShowCreatePlaylist(false);
    }
  };

  const handleStartEditPlaylist = (playlist: Playlist) => {
    setEditingPlaylistId(playlist.id);
    setEditingPlaylistName(playlist.name);
    setShowCreatePlaylist(false); // Close create playlist if open
  };

  const handleUpdatePlaylist = () => {
    if (editingPlaylistName.trim() && editingPlaylistId) {
      updatePlaylist(editingPlaylistId, { name: editingPlaylistName.trim() });
      setEditingPlaylistId(null);
      setEditingPlaylistName('');
    }
  };

  const handleCancelEditPlaylist = () => {
    setEditingPlaylistId(null);
    setEditingPlaylistName('');
  };

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, track: AudioFile) => {
    // If the track being dragged is not in the selection, clear selection and drag just this track
    if (!selectedTracks.has(track.id)) {
      setSelectedTracks(new Set());
      setDraggedTrack(track);
    } else {
      // If dragging a selected track, drag all selected tracks
      const tracksToMove = filteredAudioFiles.filter(t =>
        selectedTracks.has(t.id)
      );
      setDraggedTrack(tracksToMove.length > 1 ? tracksToMove : track);
    }

    setIsDraggingForReorder(viewingPlaylist && currentPlaylist !== null);

    e.dataTransfer.effectAllowed = viewingPlaylist ? 'move' : 'copy';
    e.dataTransfer.setData('text/plain', ''); // Required for Firefox
  };

  const handleDragEnd = () => {
    setDraggedTrack(null);
    setDropTargetPlaylistId(null);
    setReorderDropPosition(null);
    setIsDraggingForReorder(false);

    // Clear selection only if drag was successful (will be handled by drop handler)
    // For cancelled drags, keep selection

    // Clear any pending reorder timeout
    if (reorderTimeoutRef.current) {
      clearTimeout(reorderTimeoutRef.current);
      reorderTimeoutRef.current = null;
    }
  };

  const handleDragOver = (e: React.DragEvent, playlistId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    // Set drop target on dragover for stable feedback
    if (draggedTrack && dropTargetPlaylistId !== playlistId) {
      setDropTargetPlaylistId(playlistId);
    }
  };

  const handleDragEnter = (e: React.DragEvent, playlistId: string) => {
    e.preventDefault();
    if (draggedTrack) {
      setDropTargetPlaylistId(playlistId);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    // Use a small delay to prevent flickering
    setTimeout(() => {
      if (draggedTrack) {
        const mouseX = e.clientX;
        const mouseY = e.clientY;
        const element = document.elementFromPoint(mouseX, mouseY);

        // Check if we're still over a playlist item
        if (!element?.closest('[data-playlist-drop-zone]')) {
          setDropTargetPlaylistId(null);
        }
      }
    }, 10);
  };

  const handleDrop = async (e: React.DragEvent, playlistId: string) => {
    e.preventDefault();
    if (draggedTrack) {
      // Handle multiple tracks with batch operation
      if (Array.isArray(draggedTrack)) {
        addTracksToPlaylist(playlistId, draggedTrack);
      } else {
        addTrackToPlaylist(playlistId, draggedTrack);
      }
      // Don't reload from file - the store already updated and saved
    }
    setDropTargetPlaylistId(null);
    setDraggedTrack(null);
    setSelectedTracks(new Set()); // Clear selection after drop
  };

  // Reorder handlers - compatible with react-virtualized
  const handleReorderDragOver = (e: React.DragEvent, originalIndex: number) => {
    e.preventDefault();
    if (isDraggingForReorder && draggedTrack && currentPlaylist) {
      e.dataTransfer.dropEffect = 'move';

      // Calculate drop position based on mouse position relative to the target element
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      let dropPosition = e.clientY < midY ? originalIndex : originalIndex + 1;

      // Clamp to valid range and store for drop
      dropPosition = Math.max(
        0,
        Math.min(getPlaylistTracks(currentPlaylist.id).length, dropPosition)
      );

      setReorderDropPosition(dropPosition);
    }
  };

  const handleReorderDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (
      isDraggingForReorder &&
      draggedTrack &&
      currentPlaylist &&
      reorderDropPosition !== null
    ) {
      // Find the current dragged track index in the original playlist (not the UI state)
      const playlistTracks = getPlaylistTracks(currentPlaylist.id);
      const draggedTrackItem = Array.isArray(draggedTrack)
        ? draggedTrack[0]
        : draggedTrack;
      const draggedIndex = playlistTracks.findIndex(
        track => track.id === draggedTrackItem.id
      );

      if (draggedIndex !== -1) {
        // Calculate final drop position for the reorder operation
        let finalDropPosition = reorderDropPosition;

        // Adjust for splice operation - if moving item to a position after its current position
        if (draggedIndex < reorderDropPosition) {
          finalDropPosition = reorderDropPosition - 1;
        }

        // Only reorder if the position actually changes
        if (draggedIndex !== finalDropPosition) {
          try {
            // Use playlist store to reorder tracks
            await reorderPlaylistTracks(
              currentPlaylist.id,
              draggedIndex,
              finalDropPosition
            );

            // FIRST: Empty the virtualized list completely
            setAudioFiles([]);
            if (listRef.current) {
              listRef.current.forceUpdateGrid();
            }

            // SECOND: Load fresh data from API
            await loadPlaylistsFromFile();

            // THIRD: Fill the list with fresh response data
            const freshPlaylists = usePlaylistStore.getState().playlists;
            const updatedPlaylist = freshPlaylists.find(
              p => p.id === currentPlaylist.id
            );

            if (updatedPlaylist) {
              setCurrentPlaylist(updatedPlaylist);
              setAudioFiles(getPlaylistTracks(updatedPlaylist.id));

              // Force list to re-render with new data
              if (listRef.current) {
                listRef.current.forceUpdateGrid();
              }
            }
          } catch (error) {
            logger.error('Reorder error:', error);
          }
        }
      }
    }
    setReorderDropPosition(null);
  };

  const handleViewPlaylist = (playlist: Playlist) => {
    setCurrentPlaylist(playlist);
    const playlistTracks = getPlaylistTracks(playlist.id);
    setAudioFiles(playlistTracks);
    setViewingPlaylist(true);
    setShowPlaylists(false);
    setSelectedTracks(new Set()); // Clear selection when changing views
    setLastClickedIndex(null);
    // Set playlist context immediately when viewing playlist
    setPlaylistContext(playlist.id, true);
  };

  const handlePlayPlaylist = (playlist: Playlist) => {
    const playlistTracks = getPlaylistTracks(playlist.id);
    if (playlistTracks.length > 0) {
      setCurrentPlaylist(playlist);
      setAudioFiles(playlistTracks);
      playTrack(playlistTracks[0], 0, playlist.id);
      setViewingPlaylist(true);
      setShowPlaylists(false);
    }
  };

  const handleBackToAllTracks = () => {
    setViewingPlaylist(false);
    setCurrentPlaylist(null);
    setAudioFiles([...allTracks]); // Use a copy to maintain sort order
    setSelectedTracks(new Set()); // Clear selection when changing views
    setLastClickedIndex(null);
    // Clear playlist context so future tracks play from "All Tracks"
    if (isPlayingFromPlaylist) {
      setPlaylistContext(null, false);
    }
  };

  const handleRemoveFromPlaylist = async (trackId: number) => {
    if (currentPlaylist) {
      removeTrackFromPlaylist(currentPlaylist.id, trackId);
      // Refresh playlists and update the current view
      await loadPlaylistsFromFile();

      // Update current view with fresh data
      const freshPlaylists = usePlaylistStore.getState().playlists;
      const updatedPlaylist = freshPlaylists.find(
        p => p.id === currentPlaylist.id
      );
      if (updatedPlaylist) {
        setCurrentPlaylist(updatedPlaylist);
        setAudioFiles(getPlaylistTracks(updatedPlaylist.id));
      }
    }
  };

  return (
    <BaseDialog
      isOpen={shouldRender}
      onClose={handleClose}
      isVisible={isVisible}
      maxWidth="max-w-5xl"
    >
      {/* Dialog bar */}
      <div className="flex items-center justify-between p-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center space-x-2">
          <div className="text-sm font-mono text-gray-400">Music Player</div>
        </div>
        <div className="flex items-center space-x-1">
          {/* Search input */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
              <Search size={12} className="text-gray-500" />
            </div>
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-32 pl-6 pr-6 py-1 text-xs bg-gray-700 border border-gray-600 rounded focus:outline-none focus:border-gray-500 text-gray-300 placeholder-gray-500"
            />
            {searchTerm && (
              <button
                onClick={clearSearch}
                className="absolute inset-y-0 right-0 pr-2 flex items-center"
              >
                <X size={12} className="text-gray-500 hover:text-gray-300" />
              </button>
            )}
          </div>

          <button
            onClick={fetchAudioFiles}
            className="p-2 hover:bg-gray-700 rounded transition-colors"
            disabled={isLoadingPlaylist}
            title="Rescan playlist"
          >
            <RotateCcw size={16} className="text-gray-400 hover:text-white" />
          </button>
          <button
            onClick={toggleVisualizations}
            className="p-2 hover:bg-gray-700 rounded transition-colors"
            title={
              visualizationsEnabled
                ? 'Disable visualizations'
                : 'Enable visualizations'
            }
          >
            {visualizationsEnabled ? (
              <Eye size={16} className="text-gray-400 hover:text-white" />
            ) : (
              <EyeOff size={16} className="text-gray-400 hover:text-white" />
            )}
          </button>
          <button
            onClick={toggleShuffle}
            className={`p-2 hover:bg-gray-700 rounded transition-colors ${
              isShuffled ? 'bg-gray-600' : ''
            }`}
            disabled={isLoading || audioFiles.length === 0}
            title={isShuffled ? 'Disable shuffle' : 'Enable shuffle'}
          >
            <Shuffle
              size={16}
              className={`${
                isShuffled ? 'text-blue-400' : 'text-gray-400 hover:text-white'
              }`}
            />
          </button>
          <button
            onClick={previousTrack}
            className="p-2 hover:bg-gray-700 rounded transition-colors"
            disabled={isLoading || audioFiles.length === 0}
            title="Previous track"
          >
            <SkipBack size={16} className="text-gray-400 hover:text-white" />
          </button>
          <button
            onClick={togglePlayPause}
            className="p-2 hover:bg-gray-700 rounded transition-colors"
            disabled={isLoading || audioFiles.length === 0}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause size={16} className="text-gray-400 hover:text-white" />
            ) : (
              <Play size={16} className="text-gray-400 hover:text-white" />
            )}
          </button>
          <button
            onClick={stop}
            className="p-2 hover:bg-gray-700 rounded transition-colors"
            disabled={isLoading || !currentTrack}
            title="Stop"
          >
            <Square size={16} className="text-gray-400 hover:text-white" />
          </button>
          <button
            onClick={nextTrack}
            className="p-2 hover:bg-gray-700 rounded transition-colors"
            disabled={isLoading || audioFiles.length === 0}
            title="Next track"
          >
            <SkipForward size={16} className="text-gray-400 hover:text-white" />
          </button>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-700 rounded transition-colors"
            title="Close modal"
          >
            <X size={16} className="text-gray-400 hover:text-white" />
          </button>
        </div>
      </div>

      {/* Playlists Panel */}
      {showPlaylists && (
        <div className="bg-gray-700 border-b border-gray-600 p-3 max-h-48 overflow-y-auto">
          <div className="text-sm font-mono text-gray-300 mb-2">
            Playlists ({playlists.length})
          </div>
          {playlists.length === 0 ? (
            <div className="text-xs text-gray-500">
              No playlists yet. Create one!
            </div>
          ) : (
            <div className="space-y-1">
              {playlists.map(playlist => (
                <div
                  key={playlist.id}
                  className="flex items-center justify-between p-2 bg-gray-800 rounded hover:bg-gray-600 transition-colors"
                >
                  <div
                    className="flex items-center space-x-2 flex-1 min-w-0 cursor-pointer"
                    onClick={() => handleViewPlaylist(playlist)}
                  >
                    <Music size={12} className="text-gray-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-300 truncate">
                        {playlist.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {getPlaylistTracks(playlist.id).length} tracks
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handlePlayPlaylist(playlist);
                      }}
                      className="p-1 hover:bg-gray-500 rounded text-gray-400 hover:text-white"
                      title="Play playlist"
                    >
                      <Play size={12} />
                    </button>
                    <button
                      onClick={async e => {
                        e.stopPropagation();
                        deletePlaylist(playlist.id);
                        await loadPlaylistsFromFile();
                      }}
                      className="p-1 hover:bg-gray-500 rounded text-gray-400 hover:text-red-400"
                      title="Delete playlist"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main content with sidebar */}
      <div className="flex" style={{ height: '500px' }}>
        {/* Left Sidebar - Playlists */}
        <div className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
          {/* Sidebar Header */}
          <div className="p-3 border-b border-gray-700">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-mono text-gray-300">Playlists</h3>
              <button
                onClick={() => {
                  setShowCreatePlaylist(!showCreatePlaylist);
                  setEditingPlaylistId(null); // Close editing if open
                }}
                className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
                title="Create playlist"
              >
                <Plus size={14} />
              </button>
            </div>
            {/* Instructions */}
            <div className="mt-2 text-xs text-gray-500 leading-relaxed">
              Drag tracks from "All Tracks" to add them to a playlist. When
              viewing a playlist, drag tracks up/down to reorder.
            </div>
          </div>

          {/* All Tracks Item */}
          <div className="p-2">
            <div
              onClick={handleBackToAllTracks}
              className={`flex items-center space-x-2 p-2 rounded cursor-pointer transition-colors ${
                !viewingPlaylist
                  ? 'bg-blue-600 text-white'
                  : 'hover:bg-gray-700 text-gray-300'
              }`}
            >
              <Music size={14} className="shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">All Tracks</div>
                <div className="text-xs opacity-70">
                  {allTracks.length} tracks
                </div>
              </div>
            </div>
          </div>

          {/* Playlists List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {/* Create Playlist Input */}
            {showCreatePlaylist && (
              <div className="p-2 bg-gray-700 rounded border border-gray-600">
                <input
                  type="text"
                  placeholder="Playlist name..."
                  value={newPlaylistName}
                  onChange={e => setNewPlaylistName(e.target.value)}
                  className="w-full px-2 py-1 text-xs bg-gray-800 border border-gray-600 rounded focus:outline-none focus:border-gray-500 text-gray-300 mb-2"
                  onKeyPress={e => {
                    if (e.key === 'Enter') {
                      handleCreatePlaylist();
                    }
                  }}
                  autoFocus
                />
                <div className="flex space-x-1">
                  <button
                    onClick={handleCreatePlaylist}
                    className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => setShowCreatePlaylist(false)}
                    className="px-2 py-1 bg-gray-600 hover:bg-gray-500 text-white text-xs rounded"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {playlists.map(playlist => (
              <div key={playlist.id}>
                {editingPlaylistId === playlist.id ? (
                  /* Edit Mode */
                  <div className="p-2 bg-gray-700 rounded border border-gray-600">
                    <input
                      type="text"
                      value={editingPlaylistName}
                      onChange={e => setEditingPlaylistName(e.target.value)}
                      className="w-full px-2 py-1 text-xs bg-gray-800 border border-gray-600 rounded focus:outline-none focus:border-gray-500 text-gray-300 mb-2"
                      onKeyPress={e => {
                        if (e.key === 'Enter') {
                          handleUpdatePlaylist();
                        }
                        if (e.key === 'Escape') {
                          handleCancelEditPlaylist();
                        }
                      }}
                      autoFocus
                    />
                    <div className="flex space-x-1">
                      <button
                        onClick={handleUpdatePlaylist}
                        className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded"
                      >
                        Save
                      </button>
                      <button
                        onClick={handleCancelEditPlaylist}
                        className="px-2 py-1 bg-gray-600 hover:bg-gray-500 text-white text-xs rounded"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Normal Mode */
                  <div
                    className={`group flex items-center space-x-2 p-2 rounded cursor-pointer transition-colors ${
                      currentPlaylist?.id === playlist.id
                        ? 'bg-blue-600 text-white'
                        : 'hover:bg-gray-700 text-gray-300'
                    } ${
                      dropTargetPlaylistId === playlist.id && draggedTrack
                        ? 'bg-green-600 ring-2 ring-green-400 ring-opacity-75'
                        : ''
                    } ${
                      draggedTrack && dropTargetPlaylistId !== playlist.id
                        ? 'hover:bg-green-700 hover:bg-opacity-50'
                        : ''
                    }`}
                    onClick={() => handleViewPlaylist(playlist)}
                    onDragOver={e => handleDragOver(e, playlist.id)}
                    onDragEnter={e => handleDragEnter(e, playlist.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={e => handleDrop(e, playlist.id)}
                    data-playlist-drop-zone
                  >
                    <List size={14} className="shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {playlist.name}
                      </div>
                      <div className="text-xs opacity-70">
                        {getPlaylistTracks(playlist.id).length} tracks
                      </div>
                    </div>
                    <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          handlePlayPlaylist(playlist);
                        }}
                        className="p-1 hover:bg-gray-600 rounded text-gray-400 hover:text-white"
                        title="Play playlist"
                      >
                        <Play size={10} />
                      </button>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          handleStartEditPlaylist(playlist);
                        }}
                        className="p-1 hover:bg-gray-600 rounded text-gray-400 hover:text-white"
                        title="Rename playlist"
                      >
                        <Edit3 size={10} />
                      </button>
                      <button
                        onClick={async e => {
                          e.stopPropagation();
                          deletePlaylist(playlist.id);
                          await loadPlaylistsFromFile();
                        }}
                        className="p-1 hover:bg-gray-600 rounded text-gray-400 hover:text-red-400"
                        title="Delete playlist"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right Content - Player */}
        <div className="flex-1 flex flex-col">
          {/* Main track LCD display */}
          <div className="flex">
            {/* Cover art */}
            {currentTrackCoverArt && (
              <div className="w-24 h-24 shrink-0">
                <img
                  src={currentTrackCoverArt}
                  alt="Album cover"
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {/* LCD Display */}
            <div
              className="flex-1 border border-blue-800 min-w-0"
              style={{
                background: '#1e3a8a',
              }}
            >
              <LCDDisplay
                lines={formatLCDDisplay()}
                width={0}
                height={96}
                size="medium"
                dynamicSize={true}
                onDimensionsChange={charCols => setLcdCharCols(charCols)}
              />
            </div>
          </div>

          {/* Progress bar */}
          <div
            className="w-full h-4 cursor-pointer bg-gray-800 select-none"
            data-progress-bar
            onMouseDown={handleProgressMouseDown}
            onContextMenu={e => e.preventDefault()}
          >
            <div
              className="h-full bg-linear-to-r from-blue-500 via-cyan-400 to-blue-600 relative overflow-hidden"
              style={{
                width: `${progressPercentage}%`,
              }}
            >
              <div
                className="absolute inset-0 bg-linear-to-r from-transparent via-white/40 to-transparent"
                style={{
                  animation: 'liquid-shimmer 2s ease-in-out infinite',
                }}
              />
              <div className="absolute inset-0 bg-linear-to-b from-white/20 via-transparent to-black/20" />
            </div>
          </div>

          {/* Playlist section - flex to fill remaining space */}
          <div
            className="flex-1 relative focus:outline-none"
            style={{ outline: 'none' }}
            onDragOver={
              viewingPlaylist && isDraggingForReorder
                ? e => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }
                : undefined
            }
            onDrop={
              viewingPlaylist && isDraggingForReorder
                ? e => {
                    e.preventDefault();
                    // Drop handling is now done in individual track handlers
                    // This ensures the playlist is refreshed from API after each drop
                    setReorderDropPosition(null);
                  }
                : undefined
            }
          >
            {isLoadingPlaylist ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader size={32} className="text-gray-400 animate-spin" />
              </div>
            ) : (
              <AutoSizer>
                {({ width, height }) => {
                  const rowHeight = Math.max(24, Math.floor(height / 15));

                  return (
                    <div
                      style={{ outline: 'none' }}
                      className="focus:outline-none"
                    >
                      {/* Floating drop indicator */}
                      {isDraggingForReorder && reorderDropPosition !== null && (
                        <div
                          className="absolute left-0 right-0 z-50 pointer-events-none"
                          style={{
                            top: `${reorderDropPosition * rowHeight}px`,
                            height: '3px',
                            backgroundColor: '#3b82f6',
                            boxShadow: '0 0 6px #3b82f6',
                            borderRadius: '1px',
                          }}
                        />
                      )}

                      <VirtualizedList
                        ref={listRef}
                        height={height}
                        rowCount={filteredAudioFiles.length}
                        rowHeight={rowHeight}
                        width={width}
                        tabIndex={-1}
                        style={{ outline: 'none' }}
                        rowRenderer={({ index, key, style }) => {
                          const track = filteredAudioFiles[index];
                          const originalIndex = audioFiles.findIndex(
                            f => f.id === track.id
                          );
                          const albumInfo = track.album
                            ? ` [${track.album}]`
                            : '';
                          const yearInfo = track.year ? ` (${track.year})` : '';
                          const displayText = `${String(originalIndex + 1).padStart(2, '0')}. ${track.title} - ${track.artist}${albumInfo}${yearInfo}`;

                          return (
                            <div key={key} style={style}>
                              <div
                                onClick={e => handleTrackSelect(index, e)}
                                draggable={true} // Always draggable (behavior changes based on context)
                                onDragStart={e => handleDragStart(e, track)}
                                onDragEnd={handleDragEnd}
                                onDragOver={
                                  viewingPlaylist
                                    ? e =>
                                        handleReorderDragOver(e, originalIndex)
                                    : undefined
                                }
                                onDrop={
                                  viewingPlaylist
                                    ? e => handleReorderDrop(e, originalIndex)
                                    : undefined
                                }
                                className={`group px-2 py-1 transition-colors flex items-center ${
                                  currentTrack && track.id === currentTrack.id
                                    ? 'bg-gray-600'
                                    : ''
                                } ${
                                  selectedTracks.has(track.id)
                                    ? 'bg-blue-600 bg-opacity-50'
                                    : ''
                                } ${
                                  (!Array.isArray(draggedTrack) &&
                                    draggedTrack?.id === track.id) ||
                                  (Array.isArray(draggedTrack) &&
                                    draggedTrack.some(t => t.id === track.id))
                                    ? 'opacity-50'
                                    : ''
                                } ${
                                  viewingPlaylist
                                    ? 'cursor-grab hover:bg-gray-600'
                                    : 'cursor-grab hover:bg-gray-600'
                                }`}
                              >
                                <div className="flex items-center flex-1 min-w-0">
                                  {/* Cover art thumbnail */}
                                  <CachedAlbumArt
                                    imageUrl={track.coverArtUrl}
                                    alt="Cover"
                                    className="w-4 h-4 rounded mr-2 shrink-0"
                                    fallbackIcon={false}
                                  />
                                  <span className="text-xs font-mono text-gray-400 truncate">
                                    {displayText}
                                  </span>
                                </div>
                                <div className="flex items-center space-x-1">
                                  {viewingPlaylist && currentPlaylist && (
                                    <button
                                      onClick={e => {
                                        e.stopPropagation();
                                        handleRemoveFromPlaylist(track.id);
                                      }}
                                      className="p-1 hover:bg-gray-500 rounded text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100"
                                      title="Remove from playlist"
                                    >
                                      <Trash2 size={10} />
                                    </button>
                                  )}
                                  {currentTrack &&
                                    track.id === currentTrack.id &&
                                    isPlaying && (
                                      <span className="text-xs font-mono text-gray-400 ml-2 shrink-0">
                                        ♪
                                      </span>
                                    )}
                                </div>
                              </div>
                            </div>
                          );
                        }}
                      />
                    </div>
                  );
                }}
              </AutoSizer>
            )}
          </div>

          {/* Selection status bar */}
          {getSelectedTracksInfo() && (
            <div className="px-2 py-1 bg-blue-600 bg-opacity-20 border-t border-blue-500 border-opacity-30">
              <div className="flex items-center justify-between">
                <div className="text-xs text-blue-200">
                  {getSelectedTracksInfo()?.count} track
                  {getSelectedTracksInfo()?.count !== 1 ? 's' : ''} selected
                </div>
                <div className="flex items-center space-x-3">
                  {viewingPlaylist && currentPlaylist && (
                    <button
                      onClick={async () => {
                        const selectedList = filteredAudioFiles.filter(t =>
                          selectedTracks.has(t.id)
                        );
                        for (const track of selectedList) {
                          removeTrackFromPlaylist(currentPlaylist.id, track.id);
                        }
                        await loadPlaylistsFromFile();

                        // Update current view with fresh data
                        const freshPlaylists =
                          usePlaylistStore.getState().playlists;
                        const updatedPlaylist = freshPlaylists.find(
                          p => p.id === currentPlaylist.id
                        );
                        if (updatedPlaylist) {
                          setCurrentPlaylist(updatedPlaylist);
                          setAudioFiles(getPlaylistTracks(updatedPlaylist.id));
                        }

                        // Clear selection after removal
                        setSelectedTracks(new Set());
                        setLastClickedIndex(null);
                      }}
                      className="text-xs text-red-200 hover:text-red-100 underline"
                    >
                      Remove from playlist
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedTracks(new Set())}
                    className="text-xs text-blue-200 hover:text-white underline"
                  >
                    Clear selection
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Volume control - pinned to bottom */}
          <div
            className="p-2 bg-gray-700 select-none border-t border-gray-600"
            onContextMenu={e => e.preventDefault()}
          >
            <div className="flex items-center space-x-2">
              <Volume2 size={10} className="text-gray-300" />
              <div className="flex-1">
                <div
                  className="w-full h-2 cursor-pointer bg-gray-800"
                  data-volume-bar
                  onMouseDown={handleVolumeMouseDown}
                >
                  <div
                    className="h-full bg-gray-400"
                    style={{
                      width: `${volumePercentage}%`,
                    }}
                  />
                </div>
              </div>
              <span className="text-xs font-mono font-bold w-5 text-center text-gray-300">
                {Math.round(volumePercentage)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </BaseDialog>
  );
}
