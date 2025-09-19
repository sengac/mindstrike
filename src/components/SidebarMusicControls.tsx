import { Play, Pause, SkipBack, SkipForward, X } from 'lucide-react';
import { useAudioStore } from '../store/useAudioStore';
import { useEffect, useState } from 'react';

interface SidebarMusicControlsProps {
  isMusicPlayerVisible: boolean;
}

export function SidebarMusicControls({
  isMusicPlayerVisible,
}: SidebarMusicControlsProps) {
  const {
    currentTrack,
    isPlaying,
    isLoading,
    play,
    pause,
    stop,
    nextTrack,
    previousTrack,
  } = useAudioStore();

  const [isVisible, setIsVisible] = useState(false);
  const [animationStep, setAnimationStep] = useState(0);
  const [isClosing, setIsClosing] = useState(false);
  const [userClosed, setUserClosed] = useState(false);

  const shouldShow = currentTrack && !userClosed;
  const shouldRender = shouldShow || isClosing;

  // Trigger animations when controls should appear or disappear
  useEffect(() => {
    if (shouldShow && !isVisible && !isClosing) {
      setIsVisible(true);
      setIsClosing(false);
      // Stagger the button animations (slide down)
      setTimeout(() => setAnimationStep(1), 100); // Previous button
      setTimeout(() => setAnimationStep(2), 200); // Play/Pause button
      setTimeout(() => setAnimationStep(3), 300); // Next button
      setTimeout(() => setAnimationStep(4), 400); // Close button
    } else if (!shouldShow && isVisible) {
      // Start closing animation (reverse order)
      setIsClosing(true);
      setAnimationStep(3); // Hide close button first
      setTimeout(() => setAnimationStep(2), 100); // Next button
      setTimeout(() => setAnimationStep(1), 200); // Play/Pause button
      setTimeout(() => setAnimationStep(0), 300); // Previous button
      setTimeout(() => {
        setIsVisible(false);
        setIsClosing(false);
      }, 400); // Finally hide the whole component
    }
  }, [shouldShow, isVisible, isClosing]);

  // Reset userClosed when track changes or music starts playing
  useEffect(() => {
    if (!currentTrack) {
      setUserClosed(false);
    } else if (currentTrack && isPlaying) {
      setUserClosed(false);
    }
  }, [currentTrack, isPlaying]);

  // Only render controls if:
  // 1. Should show normally OR currently playing closing animation
  if (!shouldRender) {
    return null;
  }

  const togglePlayPause = () => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  };

  const handleClose = () => {
    // Stop music playback immediately
    stop();

    // Don't immediately set userClosed, let the animation play first
    if (!isClosing && isVisible) {
      setIsClosing(true);
      setAnimationStep(3); // Hide close button first
      setTimeout(() => setAnimationStep(2), 100); // Next button
      setTimeout(() => setAnimationStep(1), 200); // Play/Pause button
      setTimeout(() => setAnimationStep(0), 300); // Previous button
      setTimeout(() => {
        setIsVisible(false);
        setIsClosing(false);
        setUserClosed(true); // Only set this after animation completes
      }, 400);
    }
  };

  return (
    <div className="px-2 py-3 border-t border-dark-border">
      {/* Track indicator */}
      <div className="flex justify-center mb-2">
        <div
          className={`w-8 h-1 bg-blue-600 rounded-full opacity-60 transition-all duration-300 ${
            isVisible ? 'translate-y-0 opacity-60' : '-translate-y-2 opacity-0'
          }`}
        ></div>
      </div>

      {/* Compact controls arranged vertically */}
      <div className="flex flex-col space-y-1">
        <button
          onClick={previousTrack}
          className={`w-full h-8 flex items-center justify-center text-gray-400 hover:text-white hover:bg-dark-hover rounded transition-all duration-300 disabled:opacity-50 ${
            (!isClosing && animationStep >= 1) ||
            (isClosing && animationStep >= 1)
              ? 'translate-y-0 opacity-100'
              : '-translate-y-4 opacity-0'
          }`}
          disabled={isLoading}
          title="Previous Track"
        >
          <SkipBack size={14} />
        </button>

        <button
          onClick={togglePlayPause}
          className={`w-full h-8 flex items-center justify-center bg-blue-600 hover:bg-blue-700 rounded text-white transition-all duration-300 disabled:opacity-50 ${
            (!isClosing && animationStep >= 2) ||
            (isClosing && animationStep >= 2)
              ? 'translate-y-0 opacity-100'
              : '-translate-y-4 opacity-0'
          }`}
          disabled={isLoading}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
        </button>

        <button
          onClick={nextTrack}
          className={`w-full h-8 flex items-center justify-center text-gray-400 hover:text-white hover:bg-dark-hover rounded transition-all duration-300 disabled:opacity-50 ${
            (!isClosing && animationStep >= 3) ||
            (isClosing && animationStep >= 3)
              ? 'translate-y-0 opacity-100'
              : '-translate-y-4 opacity-0'
          }`}
          disabled={isLoading}
          title="Next Track"
        >
          <SkipForward size={14} />
        </button>

        <button
          onClick={handleClose}
          className={`w-full h-8 flex items-center justify-center text-gray-400 hover:text-red-400 hover:bg-dark-hover rounded transition-all duration-300 ${
            (!isClosing && animationStep >= 4) ||
            (isClosing && animationStep >= 4)
              ? 'translate-y-0 opacity-100'
              : '-translate-y-4 opacity-0'
          }`}
          title="Close Player"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
