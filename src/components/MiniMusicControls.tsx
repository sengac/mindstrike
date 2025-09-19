import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  RotateCw,
} from 'lucide-react';
import { useAudioStore } from '../store/useAudioStore';

interface MiniMusicControlsProps {
  isMusicPlayerVisible: boolean;
}

export function MiniMusicControls({
  isMusicPlayerVisible,
}: MiniMusicControlsProps) {
  const {
    currentTrack,
    isPlaying,
    isLoading,
    play,
    pause,
    nextTrack,
    previousTrack,
    seek,
    currentTime,
    duration,
  } = useAudioStore();

  // Only show controls if:
  // 1. A track is selected
  // 2. Music player dialog is not visible
  if (!currentTrack || isMusicPlayerVisible) {
    return null;
  }

  const togglePlayPause = () => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  };

  const handleRewind = () => {
    const newTime = Math.max(0, currentTime - 10); // Rewind 10 seconds
    seek(newTime);
  };

  const handleFastForward = () => {
    const newTime = Math.min(duration, currentTime + 10); // Fast forward 10 seconds
    seek(newTime);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-gray-800/50 border-t border-gray-700 px-6 py-3">
      <div className="flex items-center justify-between max-w-4xl mx-auto">
        {/* Track Info */}
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          <div className="w-8 h-8 bg-blue-600/20 rounded flex items-center justify-center flex-shrink-0">
            <Play size={12} className="text-blue-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-white truncate">
              {currentTrack.title}
            </div>
            <div className="text-xs text-gray-400 truncate">
              {currentTrack.artist}
            </div>
          </div>
          <div className="text-xs text-gray-400 flex-shrink-0">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-2 flex-shrink-0 ml-4">
          <button
            onClick={previousTrack}
            className="p-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            disabled={isLoading}
            title="Previous Track"
          >
            <SkipBack size={16} />
          </button>

          <button
            onClick={handleRewind}
            className="p-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            disabled={isLoading}
            title="Rewind 10s"
          >
            <RotateCcw size={16} />
          </button>

          <button
            onClick={togglePlayPause}
            className="p-2 bg-blue-600 hover:bg-blue-700 rounded-full text-white transition-colors disabled:opacity-50"
            disabled={isLoading}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>

          <button
            onClick={handleFastForward}
            className="p-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            disabled={isLoading}
            title="Fast Forward 10s"
          >
            <RotateCw size={16} />
          </button>

          <button
            onClick={nextTrack}
            className="p-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            disabled={isLoading}
            title="Next Track"
          >
            <SkipForward size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
