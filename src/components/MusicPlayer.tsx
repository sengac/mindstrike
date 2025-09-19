import {
  Music,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  X,
} from 'lucide-react';
import { BaseDialog } from './shared/BaseDialog';
import { useDialogAnimation } from '../hooks/useDialogAnimation';
import { useEffect } from 'react';
import { useAudioStore } from '../store/useAudioStore';

interface MusicPlayerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MusicPlayer({ isOpen, onClose }: MusicPlayerProps) {
  const { shouldRender, isVisible, handleClose } = useDialogAnimation(
    isOpen,
    onClose
  );

  const {
    audioFiles,
    currentTrack,
    currentTrackIndex,
    isPlaying,
    isLoading,
    volume,
    currentTime,
    duration,
    setAudioFiles,
    playTrack,
    play,
    pause,
    setVolume,
    seek,
    nextTrack,
    previousTrack,
  } = useAudioStore();

  // Fetch audio files when dialog opens
  useEffect(() => {
    if (shouldRender) {
      fetchAudioFiles();
    }
  }, [shouldRender]);

  const fetchAudioFiles = async () => {
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
        duration: file.duration,
        url: file.url,
        path: file.path,
        size: file.size,
      }));
      setAudioFiles(audioFiles);
    } catch (error) {
      console.error('Error fetching audio files:', error);
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

  const handleTrackSelect = (index: number) => {
    const track = audioFiles[index];
    if (track) {
      playTrack(track, index);
    }
  };

  if (!shouldRender) return null;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;
  const volumePercentage = volume * 100;

  return (
    <BaseDialog
      isOpen={shouldRender}
      onClose={handleClose}
      isVisible={isVisible}
      maxWidth="max-w-4xl"
    >
      <div className="bg-gradient-to-br from-blue-900/20 to-purple-900/20">
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
              <Music size={20} className="text-white" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-white">Music Player</h3>
              <p className="text-sm text-gray-400">Ambient Coding Vibes</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Horizontal Layout */}
        <div className="flex p-6 pt-4 space-x-6">
          {/* Left Side - Player Controls and Thumbnail */}
          <div className="flex-1 min-w-0">
            {/* Album Art */}
            <div className="flex justify-center mb-6">
              <div className="w-48 h-48 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-lg flex items-center justify-center border border-blue-500/30">
                <Music size={64} className="text-blue-400 opacity-50" />
              </div>
            </div>

            {/* Track Info */}
            <div className="text-center mb-6">
              <h4 className="text-white text-lg font-medium mb-1">
                {currentTrack?.title ||
                  (audioFiles.length === 0
                    ? 'No audio files found'
                    : 'Select a track')}
              </h4>
              <p className="text-gray-400 text-sm">
                {currentTrack?.artist ||
                  (audioFiles.length === 0
                    ? 'Add audio files to your workspace'
                    : 'Unknown Artist')}
              </p>
              {isLoading && (
                <p className="text-blue-400 text-xs mt-1">Loading track...</p>
              )}
              {currentTrack?.path && (
                <p className="text-gray-500 text-xs mt-1 truncate">
                  {currentTrack.path}
                </p>
              )}
            </div>

            {/* Progress Bar */}
            <div className="mb-6">
              <div className="flex justify-between text-xs text-gray-400 mb-2">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
              <div
                className="w-full bg-gray-700 rounded-full h-2 cursor-pointer"
                onClick={e => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const percentage =
                    ((e.clientX - rect.left) / rect.width) * 100;
                  handleSeek(percentage);
                }}
              >
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-150"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center space-x-6 mb-6">
              <button
                onClick={previousTrack}
                className="text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                disabled={isLoading || audioFiles.length === 0}
              >
                <SkipBack size={24} />
              </button>
              <button
                onClick={togglePlayPause}
                className="w-12 h-12 bg-blue-600 hover:bg-blue-700 rounded-full flex items-center justify-center text-white transition-colors disabled:opacity-50"
                disabled={isLoading || audioFiles.length === 0 || !currentTrack}
              >
                {isPlaying ? <Pause size={24} /> : <Play size={24} />}
              </button>
              <button
                onClick={nextTrack}
                className="text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                disabled={isLoading || audioFiles.length === 0}
              >
                <SkipForward size={24} />
              </button>
            </div>

            {/* Volume */}
            <div className="flex items-center space-x-3">
              <Volume2 size={20} className="text-gray-400" />
              <div className="flex-1">
                <div
                  className="w-full bg-gray-700 rounded-full h-2 cursor-pointer"
                  onClick={e => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const percentage =
                      ((e.clientX - rect.left) / rect.width) * 100;
                    handleVolumeChange(Math.max(0, Math.min(100, percentage)));
                  }}
                >
                  <div
                    className="bg-blue-500 h-2 rounded-full"
                    style={{ width: `${volumePercentage}%` }}
                  />
                </div>
              </div>
              <span className="text-xs text-gray-400 w-8">
                {Math.round(volumePercentage)}
              </span>
            </div>
          </div>

          {/* Right Side - Playlist */}
          <div className="w-80 border-l border-gray-700 pl-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-white font-medium">Playlist</h4>
              <button
                onClick={fetchAudioFiles}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                Refresh
              </button>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {audioFiles.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-gray-400 text-sm mb-2">
                    No audio files found
                  </div>
                  <div className="text-gray-500 text-xs">
                    Add MP3, WAV, OGG, or other audio files to your workspace
                  </div>
                </div>
              ) : (
                audioFiles.map((track, index) => (
                  <div
                    key={track.id}
                    onClick={() => handleTrackSelect(index)}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${
                      index === currentTrackIndex
                        ? 'bg-blue-600/20 border border-blue-500/30'
                        : 'bg-gray-800/50 hover:bg-gray-700/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <h5
                          className={`text-sm font-medium truncate ${
                            index === currentTrackIndex
                              ? 'text-blue-400'
                              : 'text-white'
                          }`}
                        >
                          {track.title}
                        </h5>
                        <p className="text-xs text-gray-400 truncate">
                          {track.artist}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2 ml-2">
                        {index === currentTrackIndex && isPlaying && (
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                        )}
                        {index === currentTrackIndex &&
                          !isPlaying &&
                          !isLoading && (
                            <div className="w-2 h-2 bg-blue-500 rounded-full" />
                          )}
                        {index === currentTrackIndex && isLoading && (
                          <div className="w-2 h-2 bg-yellow-500 rounded-full animate-spin" />
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </BaseDialog>
  );
}
