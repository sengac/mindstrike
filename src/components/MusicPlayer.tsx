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
} from 'lucide-react';
import { BaseDialog } from './shared/BaseDialog';
import { useDialogAnimation } from '../hooks/useDialogAnimation';
import { useEffect, useState } from 'react';
import { useAudioStore } from '../store/useAudioStore';

import { LCDDisplay } from './LCDDisplay';
import { List as VirtualizedList, AutoSizer } from 'react-virtualized';

interface MusicPlayerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MusicPlayer({ isOpen, onClose }: MusicPlayerProps) {
  const { shouldRender, isVisible, handleClose } = useDialogAnimation(
    isOpen,
    onClose
  );

  const [lcdCharCols, setLcdCharCols] = useState<number>(0);
  const [isLoadingPlaylist, setIsLoadingPlaylist] = useState<boolean>(false);
  const [isDraggingProgress, setIsDraggingProgress] = useState<boolean>(false);
  const [isDraggingVolume, setIsDraggingVolume] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');

  const {
    audioFiles,
    currentTrack,
    currentTrackIndex,
    isPlaying,
    isLoading,
    volume,
    currentTime,
    duration,
    visualizationsEnabled,
    setAudioFiles,
    playTrack,
    play,
    pause,
    setVolume,
    seek,
    nextTrack,
    previousTrack,
    toggleVisualizations,
  } = useAudioStore();

  // Fetch audio files when dialog opens
  useEffect(() => {
    if (shouldRender) {
      fetchAudioFiles();
    }
  }, [shouldRender]);

  const fetchAudioFiles = async () => {
    setIsLoadingPlaylist(true);
    try {
      const response = await fetch('/api/audio/files');
      if (!response.ok) {
        throw new Error('Failed to fetch audio files');
      }
      const files = await response.json();
      const audioFiles = files.map((file: any) => ({
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
        coverArtUrl: file.coverArtUrl,
      }));
      setAudioFiles(audioFiles);
    } catch (error) {
      console.error('Error fetching audio files:', error);
    } finally {
      setIsLoadingPlaylist(false);
    }
  };

  const togglePlayPause = () => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  };

  const handleVolumeChange = (percentage: number) => {
    setVolume(percentage / 100);
  };

  const handleSeek = (percentage: number) => {
    const seekTime = (percentage / 100) * duration;
    seek(seekTime);
  };

  const handleTrackSelect = (filteredIndex: number) => {
    const track = filteredAudioFiles[filteredIndex];
    if (track) {
      // Find the original index in the full audioFiles array
      const originalIndex = audioFiles.findIndex(f => f.id === track.id);
      playTrack(track, originalIndex);
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

  if (!shouldRender) return null;

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
      if (albumPart && yearPart) return `${albumPart} • ${yearPart}`;
      return albumPart || yearPart || '';
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

  // Filter audioFiles based on search term
  const filteredAudioFiles = audioFiles.filter(track => {
    if (!searchTerm.trim()) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      track.title.toLowerCase().includes(searchLower) ||
      track.artist.toLowerCase().includes(searchLower) ||
      track.album?.toLowerCase().includes(searchLower) ||
      track.genre?.some(g => g.toLowerCase().includes(searchLower))
    );
  });

  const clearSearch = () => {
    setSearchTerm('');
  };

  return (
    <BaseDialog
      isOpen={shouldRender}
      onClose={handleClose}
      isVisible={isVisible}
      maxWidth="max-w-2xl"
    >
      {/* Dialog bar */}
      <div className="flex items-center justify-between p-2 bg-gray-800 border-b border-gray-700">
        <div className="text-sm font-mono text-gray-400">Music Player</div>
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
            disabled={isLoading || audioFiles.length === 0 || !currentTrack}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause size={16} className="text-gray-400 hover:text-white" />
            ) : (
              <Play size={16} className="text-gray-400 hover:text-white" />
            )}
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

      {/* Main stereo body */}
      <div>
        {/* Main track LCD display */}
        <div className="flex">
          {/* Cover art */}
          {currentTrack?.coverArtUrl && (
            <div className="w-24 h-24 flex-shrink-0">
              <img
                src={currentTrack.coverArtUrl}
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
          className="w-full h-2 cursor-pointer bg-gray-800 select-none"
          data-progress-bar
          onMouseDown={handleProgressMouseDown}
          onContextMenu={e => e.preventDefault()}
        >
          <div
            className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-600 relative overflow-hidden"
            style={{
              width: `${progressPercentage}%`,
            }}
          >
            <div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
              style={{
                animation: 'liquid-shimmer 2s ease-in-out infinite',
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-black/20" />
          </div>
        </div>

        {/* Playlist section */}
        <div className="h-64 relative">
          {isLoadingPlaylist ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader size={32} className="text-gray-400 animate-spin" />
            </div>
          ) : (
            <AutoSizer>
              {({ width, height }) => (
                <VirtualizedList
                  height={height}
                  rowCount={filteredAudioFiles.length}
                  rowHeight={Math.max(24, Math.floor(height / 15))}
                  width={width}
                  rowRenderer={({ index, key, style }) => {
                    const track = filteredAudioFiles[index];
                    const originalIndex = audioFiles.findIndex(
                      f => f.id === track.id
                    );
                    const albumInfo = track.album ? ` [${track.album}]` : '';
                    const yearInfo = track.year ? ` (${track.year})` : '';
                    const displayText = `${String(originalIndex + 1).padStart(2, '0')}. ${track.title} - ${track.artist}${albumInfo}${yearInfo}`;

                    return (
                      <div
                        key={key}
                        style={style}
                        onClick={() => handleTrackSelect(index)}
                        className={`px-2 py-1 cursor-pointer hover:bg-gray-600 transition-colors flex items-center ${
                          originalIndex === currentTrackIndex
                            ? 'bg-gray-600'
                            : ''
                        }`}
                      >
                        <div className="flex items-center flex-1 min-w-0">
                          {/* Cover art thumbnail */}
                          {track.coverArtUrl && (
                            <img
                              src={track.coverArtUrl}
                              alt="Cover"
                              className="w-4 h-4 rounded mr-2 flex-shrink-0"
                            />
                          )}
                          <span className="text-xs font-mono text-gray-400 truncate">
                            {displayText}
                          </span>
                        </div>
                        {originalIndex === currentTrackIndex && isPlaying && (
                          <span className="text-xs font-mono text-gray-400 ml-2 flex-shrink-0">
                            ♪
                          </span>
                        )}
                      </div>
                    );
                  }}
                />
              )}
            </AutoSizer>
          )}
        </div>

        {/* Volume control */}
        <div
          className="p-2 bg-gray-700 select-none"
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
    </BaseDialog>
  );
}
