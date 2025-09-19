import { Music, Play, Pause, SkipBack, SkipForward, Volume2, X } from 'lucide-react';
import { BaseDialog } from './shared/BaseDialog';
import { useDialogAnimation } from '../hooks/useDialogAnimation';
import { useState } from 'react';

interface MusicPlayerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MusicPlayer({ isOpen, onClose }: MusicPlayerProps) {
  const { shouldRender, isVisible, handleClose } = useDialogAnimation(
    isOpen,
    onClose
  );
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(180); // 3 minutes
  const [volume, setVolume] = useState(75);

  if (!shouldRender) return null;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPercentage = (currentTime / duration) * 100;

  const playlist = [
    { id: 1, title: "Deep Focus", artist: "Lo-Fi Beats Collection", duration: "3:00", isActive: true },
    { id: 2, title: "Midnight Coding", artist: "Chill Hip-Hop", duration: "4:15", isActive: false },
    { id: 3, title: "Binary Dreams", artist: "Synthwave Collective", duration: "3:45", isActive: false },
    { id: 4, title: "Algorithm Flow", artist: "Ambient Tech", duration: "5:22", isActive: false },
    { id: 5, title: "Debug Mode", artist: "Electronic Vibes", duration: "2:58", isActive: false },
  ];

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
              <h4 className="text-white text-lg font-medium mb-1">Deep Focus</h4>
              <p className="text-gray-400 text-sm">Lo-Fi Beats Collection</p>
            </div>

            {/* Progress Bar */}
            <div className="mb-6">
              <div className="flex justify-between text-xs text-gray-400 mb-2">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div 
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center space-x-6 mb-6">
              <button className="text-gray-400 hover:text-white transition-colors">
                <SkipBack size={24} />
              </button>
              <button 
                onClick={() => setIsPlaying(!isPlaying)}
                className="w-12 h-12 bg-blue-600 hover:bg-blue-700 rounded-full flex items-center justify-center text-white transition-colors"
              >
                {isPlaying ? <Pause size={24} /> : <Play size={24} />}
              </button>
              <button className="text-gray-400 hover:text-white transition-colors">
                <SkipForward size={24} />
              </button>
            </div>

            {/* Volume */}
            <div className="flex items-center space-x-3">
              <Volume2 size={20} className="text-gray-400" />
              <div className="flex-1">
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full"
                    style={{ width: `${volume}%` }}
                  />
                </div>
              </div>
              <span className="text-xs text-gray-400 w-8">{volume}</span>
            </div>
          </div>

          {/* Right Side - Playlist */}
          <div className="w-80 border-l border-gray-700 pl-6">
            <h4 className="text-white font-medium mb-4">Playlist</h4>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {playlist.map((track) => (
                <div 
                  key={track.id}
                  className={`p-3 rounded-lg cursor-pointer transition-colors ${
                    track.isActive 
                      ? 'bg-blue-600/20 border border-blue-500/30' 
                      : 'bg-gray-800/50 hover:bg-gray-700/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h5 className={`text-sm font-medium truncate ${
                        track.isActive ? 'text-blue-400' : 'text-white'
                      }`}>
                        {track.title}
                      </h5>
                      <p className="text-xs text-gray-400 truncate">
                        {track.artist}
                      </p>
                    </div>
                    <div className="flex items-center space-x-2 ml-2">
                      <span className="text-xs text-gray-400">
                        {track.duration}
                      </span>
                      {track.isActive && (
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </BaseDialog>
  );
}
