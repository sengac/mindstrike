import { useRef, useEffect, useState } from 'react';
import { useAudioStore } from '../store/useAudioStore';
import { audioAnalyzer } from '../utils/audioAnalyzer';

interface MusicVisualizationProps {
  className?: string;
}

export function MusicVisualization({
  className = '',
}: MusicVisualizationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const [audioData, setAudioData] = useState<{
    frequency: Uint8Array;
    waveform: Uint8Array;
  } | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const { howl, isPlaying, visualizationsEnabled } = useAudioStore();

  // Connect to audio analyzer when howl is available
  useEffect(() => {
    if (!howl || !isPlaying) {
      setIsConnected(false);
      setAudioData(null);
      return;
    }

    const audioElement = (howl as any)._sounds[0]?._node;
    if (!audioElement) {
      console.warn('No audio element found in Howler instance');
      return;
    }

    // Subscribe to audio analyzer
    const unsubscribe = audioAnalyzer.subscribe(data => {
      setAudioData(data);
    });

    // Try to connect to the audio element
    audioAnalyzer.connectToAudio(audioElement).then(success => {
      setIsConnected(success);
      if (!success) {
        console.warn('Failed to connect to audio analyzer');
      }
    });

    return () => {
      unsubscribe();
      setIsConnected(false);
      setAudioData(null);
    };
  }, [howl, isPlaying]);

  // Animation loop
  useEffect(() => {
    if (!isConnected || !isPlaying || !audioData) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = undefined;
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    // Ensure canvas is properly sized when animation starts
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    resizeCanvas();

    const draw = () => {
      if (!isPlaying || !audioData) {
        return;
      }

      const dataArray = audioData.frequency;
      const bufferLength = dataArray.length;

      // Clear canvas with transparent background (use logical dimensions)
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      // Calculate bar dimensions (use logical dimensions)
      const barWidth = (rect.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      // Create gradient using darker gray
      const gradient = ctx.createLinearGradient(0, rect.height, 0, 0);
      gradient.addColorStop(0, 'rgba(75, 85, 99, 0.4)'); // gray-600 with medium opacity
      gradient.addColorStop(0.5, 'rgba(75, 85, 99, 0.6)'); // gray-600 with higher opacity
      gradient.addColorStop(1, 'rgba(75, 85, 99, 0.8)'); // gray-600 with high opacity

      // Draw frequency bars (smaller)
      for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * rect.height * 0.4; // Reduced from 0.8 to 0.4

        ctx.fillStyle = gradient;
        ctx.fillRect(x, rect.height - barHeight, barWidth, barHeight);

        // Add subtle glow effect for higher frequencies
        if (dataArray[i] > 120) {
          ctx.shadowBlur = 5; // Reduced glow
          ctx.shadowColor = `rgba(75, 85, 99, ${(dataArray[i] / 255) * 0.3})`; // Darker glow
          ctx.fillRect(x, rect.height - barHeight, barWidth, barHeight);
          ctx.shadowBlur = 0;
        }

        x += barWidth + 1;
      }

      // Draw seewav-style waveform visualization (from NetworkEffect)
      drawSoundWave(ctx, rect, audioData.waveform);

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = undefined;
      }
    };
  }, [isConnected, isPlaying, audioData]);

  // Resize canvas to match container
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  // Component cleanup
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = undefined;
      }
    };
  }, []);

  // Function to draw seewav-style waveform visualization (from NetworkEffect)
  const drawSoundWave = (
    ctx: CanvasRenderingContext2D,
    rect: DOMRect,
    waveformData: Uint8Array
  ) => {
    if (!waveformData || waveformData.length === 0) {
      return;
    }

    // True seewav-style visualization with thin vertical lines
    const numBars = 120; // Many thin bars like seewav
    const barWidth = 2; // Very thin bars
    const barSpacing = rect.width / numBars; // Even distribution
    const centerY = rect.height / 2;
    const maxBarHeight = rect.height * 0.4; // Reduced height for EQ overlay

    // Extract envelope from waveform data
    const envelope: number[] = [];
    const samplesPerBar = Math.floor(waveformData.length / numBars);

    // Sigmoid function for compression
    const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

    for (let i = 0; i < numBars; i++) {
      const start = i * samplesPerBar;
      const end = Math.min(start + samplesPerBar, waveformData.length);

      // Calculate RMS (root mean square) for this segment
      let sum = 0;
      for (let j = start; j < end; j++) {
        const sample = (waveformData[j] - 128) / 128; // Convert to -1 to 1 range
        sum += sample * sample;
      }

      const rms = Math.sqrt(sum / (end - start));
      // Apply compression similar to seewav
      const compressed = 1.9 * (sigmoid(2.5 * rms) - 0.5);
      envelope.push(Math.max(0, compressed));
    }

    // Simple smoothing
    const smoothedEnvelope = envelope.map((val, idx) => {
      let sum = val;
      let count = 1;

      // Average with neighbors
      if (idx > 0) {
        sum += envelope[idx - 1];
        count++;
      }
      if (idx < envelope.length - 1) {
        sum += envelope[idx + 1];
        count++;
      }

      return sum / count;
    });

    // Set drawing style
    ctx.lineWidth = barWidth;
    ctx.lineCap = 'round';

    // Draw the waveform with thin vertical lines
    smoothedEnvelope.forEach((height, idx) => {
      const x = (idx + 0.5) * barSpacing;

      // Skip bars that are off screen
      if (x < -barWidth || x > rect.width + barWidth) {
        return;
      }

      const barHeight = height * maxBarHeight;
      const topY = centerY - barHeight / 2;
      const bottomY = centerY + barHeight / 2;

      // Create gradient for each line - using gray to match EQ bars
      const gradient = ctx.createLinearGradient(0, topY, 0, bottomY);
      gradient.addColorStop(0, 'rgba(156, 163, 175, 0.8)');
      gradient.addColorStop(0.5, 'rgba(156, 163, 175, 0.9)');
      gradient.addColorStop(1, 'rgba(156, 163, 175, 0.8)');

      ctx.strokeStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(x, topY);
      ctx.lineTo(x, bottomY);
      ctx.stroke();
    });
  };

  // Don't render if audio isn't playing or visualizations are disabled
  if (!isPlaying || !howl || !visualizationsEnabled) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full pointer-events-none opacity-40 ${className}`}
      style={{
        background: 'transparent',
        zIndex: 0,
      }}
    />
  );
}
