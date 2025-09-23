import { useEffect, useRef, useState } from 'react';
import { audioAnalyzer } from '../utils/audioAnalyzer';
import { useAudioStore } from '../store/useAudioStore';

interface NetworkEffectProps {
  className?: string;
  onHeartClick?: () => void;
}

interface HeartParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
}

interface MusicNote {
  x: number;
  y: number;
  vy: number;
  size: number;
  alpha: number;
  type: 'eighth' | 'quarter';
}

export function NetworkEffect({
  className = '',
  onHeartClick,
}: NetworkEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mousePos = useRef({ x: 0, y: 0 });
  const isHovering = useRef(false);
  const heartParticles = useRef<HeartParticle[]>([]);
  const musicNotes = useRef<MusicNote[]>([]);
  const noteSpawnTimer = useRef(0);
  const [_audioData, setAudioData] = useState<{
    frequency: Uint8Array;
    waveform: Uint8Array;
  } | null>(null);
  const audioDataRef = useRef<{
    frequency: Uint8Array;
    waveform: Uint8Array;
  } | null>(null);
  const [_isConnected, setIsConnected] = useState(false);

  // Beat detection state
  const beatDetectionRef = useRef({
    lastBeatTime: 0,
    beatThreshold: 0,
    beatHistory: [] as number[],
    currentZoom: 0.75, // Base zoom level
    targetZoom: 0.75,
    lastKickEnergy: 0,
    // Sine wave visualization state
    waveAmplitude: 0,
    targetAmplitude: 0,
    wavePhase: 0,
    // Waveform animation state
    waveVisibility: 0, // 0 = hidden, 1 = fully visible
    targetVisibility: 0,
    slideOffset: 0, // For slide animation
    // Music state tracking
    musicStartTime: 0,
    musicStopTime: 0,
    lastMusicState: false,
    lastFrequencySnapshot: null as Uint8Array | null,
  });

  const { howl, isPlaying } = useAudioStore();

  // Connect to audio analyzer when howl is available
  useEffect(() => {
    if (!howl || !isPlaying) {
      setIsConnected(false);
      setAudioData(null);
      audioDataRef.current = null;
      // Reset beat detection
      beatDetectionRef.current = {
        lastBeatTime: 0,
        beatThreshold: 0,
        beatHistory: [],
        currentZoom: 0.75,
        targetZoom: 0.75,
        lastKickEnergy: 0,
        waveAmplitude: 0,
        targetAmplitude: 0,
        wavePhase: 0,
        waveVisibility: 0,
        targetVisibility: 0,
        slideOffset: 0,
        musicStartTime: 0,
        musicStopTime: 0,
        lastMusicState: false,
        lastFrequencySnapshot: null,
      };
      return;
    }

    const audioElement = (howl as any)._sounds[0]?._node;
    if (!audioElement) {
      console.warn('NetworkEffect: No audio element found in Howler instance');
      return;
    }

    // Subscribe to audio analyzer
    const unsubscribe = audioAnalyzer.subscribe(data => {
      // Update both state and ref so animation loop can access current data
      setAudioData(data);
      audioDataRef.current = data;
    });

    // Try to connect to the audio element
    audioAnalyzer.connectToAudio(audioElement).then(success => {
      setIsConnected(success);
      if (!success) {
        console.warn('NetworkEffect: Failed to connect to audio analyzer');
      }
    });

    return () => {
      unsubscribe();
      setIsConnected(false);
      setAudioData(null);
      audioDataRef.current = null;
    };
  }, [howl, isPlaying]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // 3D Point structure
    interface Point3D {
      x: number;
      y: number;
      z: number;
    }

    interface Point2D {
      x: number;
      y: number;
    }

    // Cube vertices
    const cubeVertices: Point3D[] = [
      { x: -1, y: -1, z: -1 }, // 0
      { x: 1, y: -1, z: -1 }, // 1
      { x: 1, y: 1, z: -1 }, // 2
      { x: -1, y: 1, z: -1 }, // 3
      { x: -1, y: -1, z: 1 }, // 4
      { x: 1, y: -1, z: 1 }, // 5
      { x: 1, y: 1, z: 1 }, // 6
      { x: -1, y: 1, z: 1 }, // 7
    ];

    // Cube edges (which vertices connect to which)
    const cubeEdges: [number, number][] = [
      // Front face
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      // Back face
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 4],
      // Connecting edges
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7],
    ];

    // 3D to 2D projection with rotation and zoom
    const project = (
      point: Point3D,
      rotX: number,
      rotY: number,
      rotZ: number,
      zoom: number
    ): Point2D => {
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      // Scale so cube edges stay within viewbox boundaries at zoom = 1.0
      const baseScale = Math.min(canvas.width, canvas.height) / 3;
      const scale = baseScale * zoom;

      let { x, y, z } = point;

      // Rotate around X axis
      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);
      const y1 = y * cosX - z * sinX;
      const z1 = y * sinX + z * cosX;
      y = y1;
      z = z1;

      // Rotate around Y axis
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const x1 = x * cosY + z * sinY;
      const z2 = -x * sinY + z * cosY;
      x = x1;
      z = z2;

      // Rotate around Z axis
      const cosZ = Math.cos(rotZ);
      const sinZ = Math.sin(rotZ);
      const x2 = x * cosZ - y * sinZ;
      const y2 = x * sinZ + y * cosZ;
      x = x2;
      y = y2;

      return {
        x: centerX + x * scale,
        y: centerY + y * scale,
      };
    };

    let time = 0;
    let currentSpeed = 1;
    let targetSpeed = 1;
    let lastKeyTime = 0;
    let firstKeyTime = 0;
    let networkAlpha = 0;
    let targetNetworkAlpha = 0;

    // Network nodes
    interface NetworkNode {
      x: number;
      y: number;
      targetX: number;
      targetY: number;
      vx: number;
      vy: number;
      connections: number[];
    }

    const networkNodes: NetworkNode[] = [];
    const maxNodes = 15;

    // Create network nodes
    for (let i = 0; i < maxNodes; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      networkNodes.push({
        x: x,
        y: y,
        targetX: x,
        targetY: y,
        vx: 0,
        vy: 0,
        connections: [],
      });
    }

    // Create connections between nearby nodes
    networkNodes.forEach((node, index) => {
      networkNodes.forEach((otherNode, otherIndex) => {
        if (index !== otherIndex) {
          const distance = Math.sqrt(
            Math.pow(node.x - otherNode.x, 2) +
              Math.pow(node.y - otherNode.y, 2)
          );
          if (distance < 150 && node.connections.length < 3) {
            node.connections.push(otherIndex);
          }
        }
      });
    });

    // Keyboard event listener for speed boost
    const handleKeyPress = () => {
      targetSpeed = 1.2; // Very gentle speed up on keypress
      lastKeyTime = time;

      // Track first key of typing session
      if (time - lastKeyTime > 2) {
        // If more than 2 seconds since last key
        firstKeyTime = time;
      }

      // Move network nodes on each keypress
      networkNodes.forEach(node => {
        // Add random impulse to each node
        const impulseStrength = 30 + Math.random() * 40;
        const angle = Math.random() * Math.PI * 2;

        node.vx += Math.cos(angle) * impulseStrength;
        node.vy += Math.sin(angle) * impulseStrength;

        // Set new target position (full canvas)
        node.targetX = Math.max(
          0,
          Math.min(canvas.width, node.x + (Math.random() - 0.5) * 150)
        );
        node.targetY = Math.max(
          0,
          Math.min(canvas.height, node.y + (Math.random() - 0.5) * 150)
        );
      });
    };

    // Add event listener
    window.addEventListener('keydown', handleKeyPress);

    // Mouse event handlers
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mousePos.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    const handleMouseEnter = () => {
      isHovering.current = true;
    };

    const handleMouseLeave = () => {
      isHovering.current = false;
    };

    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      // Create explosion particles
      const newParticles: HeartParticle[] = [];
      for (let i = 0; i < 15; i++) {
        const angle = (Math.PI * 2 * i) / 15;
        const speed = Math.random() * 3 + 2;
        newParticles.push({
          x: clickX,
          y: clickY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: Math.random() * 3 + 2,
          life: 1,
          maxLife: 1,
        });
      }
      heartParticles.current = [...heartParticles.current, ...newParticles];

      // Trigger the music player dialog
      if (onHeartClick) {
        onHeartClick();
      }
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseenter', handleMouseEnter);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('click', handleClick);

    // Function to draw pixelated musical note
    const drawPixelatedNote = (
      x: number,
      y: number,
      scale: number,
      alpha: number,
      type: 'eighth' | 'quarter'
    ) => {
      let notePixels: number[][];

      if (type === 'eighth') {
        // Eighth note pattern (with beam)
        notePixels = [
          [0, 0, 0, 1, 0],
          [0, 0, 0, 1, 0],
          [0, 0, 0, 1, 0],
          [0, 0, 0, 1, 1],
          [0, 0, 0, 1, 0],
          [0, 0, 0, 1, 0],
          [0, 1, 1, 1, 0],
          [1, 1, 1, 0, 0],
        ];
      } else {
        // Quarter note pattern
        notePixels = [
          [0, 0, 0, 1, 0],
          [0, 0, 0, 1, 0],
          [0, 0, 0, 1, 0],
          [0, 0, 0, 1, 0],
          [0, 0, 0, 1, 0],
          [0, 0, 0, 1, 0],
          [0, 1, 1, 1, 0],
          [1, 1, 1, 0, 0],
        ];
      }

      const pixelSize = 2 * scale;
      const offsetX = x - (notePixels[0].length * pixelSize) / 2;
      const offsetY = y - (notePixels.length * pixelSize) / 2;

      ctx.fillStyle = `rgba(30, 64, 175, ${alpha})`;
      notePixels.forEach((row, rowIndex) => {
        row.forEach((pixel, colIndex) => {
          if (pixel === 1) {
            ctx.fillRect(
              offsetX + colIndex * pixelSize,
              offsetY + rowIndex * pixelSize,
              pixelSize,
              pixelSize
            );
          }
        });
      });
    };

    // Function to draw pixelated heart
    const drawPixelatedHeart = (
      x: number,
      y: number,
      scale: number,
      alpha: number
    ) => {
      const heartPixels = [
        [0, 1, 1, 0, 0, 0, 1, 1, 0],
        [1, 1, 1, 1, 0, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1],
        [0, 1, 1, 1, 1, 1, 1, 1, 0],
        [0, 0, 1, 1, 1, 1, 1, 0, 0],
        [0, 0, 0, 1, 1, 1, 0, 0, 0],
        [0, 0, 0, 0, 1, 0, 0, 0, 0],
      ];

      const pixelSize = 3 * scale;
      const offsetX = x - (heartPixels[0].length * pixelSize) / 2;
      const offsetY = y - (heartPixels.length * pixelSize) / 2;

      ctx.fillStyle = `rgba(30, 64, 175, ${alpha})`; // Match cube color #1e40af
      heartPixels.forEach((row, rowIndex) => {
        row.forEach((pixel, colIndex) => {
          if (pixel === 1) {
            ctx.fillRect(
              offsetX + colIndex * pixelSize,
              offsetY + rowIndex * pixelSize,
              pixelSize,
              pixelSize
            );
          }
        });
      });
    };

    // Function to detect kick drum beats and update zoom
    const detectBeatAndUpdateZoom = (frequencyData: Uint8Array) => {
      const beatDetection = beatDetectionRef.current;

      // Calculate kick drum energy (low frequencies: bins 1-12 of 128, roughly 43-516 Hz)
      const kickBins = 12; // Expanded range to catch more kick frequencies
      let kickEnergy = 0;
      for (let i = 1; i <= kickBins; i++) {
        kickEnergy += frequencyData[i];
      }
      kickEnergy = kickEnergy / kickBins;

      // Update beat history for threshold calculation
      beatDetection.beatHistory.push(kickEnergy);
      if (beatDetection.beatHistory.length > 20) {
        beatDetection.beatHistory.shift();
      }

      // Calculate dynamic threshold (average + variance)
      const avgEnergy =
        beatDetection.beatHistory.reduce((a, b) => a + b, 0) /
        beatDetection.beatHistory.length;
      const variance =
        beatDetection.beatHistory.reduce(
          (sum, energy) => sum + Math.pow(energy - avgEnergy, 2),
          0
        ) / beatDetection.beatHistory.length;
      const dynamicThreshold = avgEnergy + Math.sqrt(variance) * 0.5; // Very sensitive

      // Detect beat: current energy is significantly higher than threshold and last energy
      const energyIncrease = kickEnergy - beatDetection.lastKickEnergy;
      const timeSinceLastBeat = time - beatDetection.lastBeatTime;
      const isKick =
        kickEnergy > dynamicThreshold &&
        energyIncrease > 4 && // Very low threshold for energy increase
        timeSinceLastBeat > 0.05; // Allow very fast beats (up to 1200 BPM)

      if (isKick) {
        // Trigger zoom in - subtle but noticeable
        beatDetection.targetZoom = 1.1; // Zoom in to 110% (more subtle)
        beatDetection.lastBeatTime = time;
        // Trigger wave amplitude increase
        beatDetection.targetAmplitude = Math.min(150, kickEnergy * 0.8); // Scale amplitude to kick energy
      }

      // Smooth zoom animation
      const zoomSpeed = 0.2; // Faster animation
      beatDetection.currentZoom +=
        (beatDetection.targetZoom - beatDetection.currentZoom) * zoomSpeed;

      // Gradually return to base zoom
      if (timeSinceLastBeat > 0.05) {
        // Start returning after 50ms
        beatDetection.targetZoom += (0.75 - beatDetection.targetZoom) * 0.08; // Faster return
      }

      // Update wave amplitude with decay
      beatDetection.waveAmplitude +=
        (beatDetection.targetAmplitude - beatDetection.waveAmplitude) * 0.15;
      beatDetection.targetAmplitude *= 0.92; // Gradual decay for reverberation effect

      // Update wave phase for continuous animation
      beatDetection.wavePhase += 0.1;

      beatDetection.lastKickEnergy = kickEnergy;

      return beatDetection.currentZoom;
    };

    // Function to draw seewav-style waveform visualization
    const drawSoundWave = () => {
      const beatDetection = beatDetectionRef.current;

      // Only draw if visibility is above threshold (smooth fade in/out)
      if (beatDetection.waveVisibility < 0.01) {
        return;
      }

      // Use current waveform data or snapshot when fading out
      const currentAudioData = audioDataRef.current;
      let waveformData: Uint8Array;

      if (currentAudioData && currentAudioData.waveform.length > 0) {
        // Music is playing - use live waveform data
        waveformData = currentAudioData.waveform;
      } else if (beatDetection.lastFrequencySnapshot) {
        // Music stopped - use snapshot for fade out
        waveformData = beatDetection.lastFrequencySnapshot;
      } else {
        // No data available
        return;
      }

      // True seewav-style visualization with thin vertical lines
      const numBars = 120; // Many thin bars like seewav
      const barWidth = 2; // Very thin bars
      const barSpacing = canvas.width / numBars; // Even distribution
      const centerY = canvas.height / 2;
      const maxBarHeight = canvas.height * 0.6;

      // Extract envelope from waveform data (not frequency data!)
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
      ctx.globalAlpha = beatDetection.waveVisibility;

      // Draw the waveform with thin vertical lines
      smoothedEnvelope.forEach((height, idx) => {
        const x = (idx + 0.5) * barSpacing + beatDetection.slideOffset;

        // Skip bars that are off screen
        if (x < -barWidth || x > canvas.width + barWidth) {
          return;
        }

        const barHeight = height * maxBarHeight;
        const topY = centerY - barHeight / 2;
        const bottomY = centerY + barHeight / 2;

        // Create gradient for each line - lighter blue for visibility
        const gradient = ctx.createLinearGradient(0, topY, 0, bottomY);
        gradient.addColorStop(0, '#3b82f6');
        gradient.addColorStop(0.5, '#3b82f6');
        gradient.addColorStop(1, '#3b82f6');

        ctx.strokeStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(x, topY);
        ctx.lineTo(x, bottomY);
        ctx.stroke();
      });

      // Reset effects
      ctx.globalAlpha = 1;
    };

    const animate = () => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      time += 0.02;

      // Update heart particles
      heartParticles.current = heartParticles.current
        .map(particle => ({
          ...particle,
          x: particle.x + particle.vx,
          y: particle.y + particle.vy,
          vy: particle.vy + 0.1, // gravity
          life: particle.life - 0.02,
        }))
        .filter(particle => particle.life > 0);

      // Update musical notes when hovering
      if (isHovering.current) {
        // Spawn new notes
        noteSpawnTimer.current += 0.02;
        if (noteSpawnTimer.current >= 0.3) {
          // Spawn every 0.3 seconds
          noteSpawnTimer.current = 0;

          // Create 2-3 notes at random positions
          const numNotes = Math.floor(Math.random() * 2) + 2;
          for (let i = 0; i < numNotes; i++) {
            musicNotes.current.push({
              x: Math.random() * canvas.width,
              y: canvas.height + 20, // Start below canvas
              vy: -(Math.random() * 2 + 1), // Float upward at different speeds
              size: Math.random() * 0.5 + 0.8, // Random size
              alpha: Math.random() * 0.5 + 0.5, // Random opacity
              type: Math.random() > 0.5 ? 'eighth' : 'quarter',
            });
          }
        }
      } else {
        // Reset spawn timer when not hovering
        noteSpawnTimer.current = 0;
      }

      // Update existing musical notes
      musicNotes.current = musicNotes.current
        .map(note => ({
          ...note,
          y: note.y + note.vy,
          alpha: note.y < canvas.height * 0.3 ? note.alpha * 0.98 : note.alpha, // Fade out at top
        }))
        .filter(note => note.y > -50 && note.alpha > 0.01); // Remove notes that are off-screen or fully faded

      // Network effect based on typing duration
      const typingDuration = time - firstKeyTime;
      const timeSinceLastKey = time - lastKeyTime;

      if (timeSinceLastKey <= 1 && typingDuration >= 3) {
        // Show network if typing for more than 3 seconds
        targetNetworkAlpha = 0.6;
      } else {
        // Fade network when typing stops
        targetNetworkAlpha = 0;
      }

      // Smooth network fade
      networkAlpha += (targetNetworkAlpha - networkAlpha) * 0.03;

      // Update network node positions
      networkNodes.forEach(node => {
        // Apply velocity
        node.x += node.vx * 0.02;
        node.y += node.vy * 0.02;

        // Apply friction
        node.vx *= 0.95;
        node.vy *= 0.95;

        // Move towards target position
        const dx = node.targetX - node.x;
        const dy = node.targetY - node.y;
        node.x += dx * 0.02;
        node.y += dy * 0.02;

        // Keep nodes within bounds (allow full canvas)
        if (node.x < 0) {
          node.x = 0;
          node.vx = Math.abs(node.vx);
        }
        if (node.x > canvas.width) {
          node.x = canvas.width;
          node.vx = -Math.abs(node.vx);
        }
        if (node.y < 0) {
          node.y = 0;
          node.vy = Math.abs(node.vy);
        }
        if (node.y > canvas.height) {
          node.y = canvas.height;
          node.vy = -Math.abs(node.vy);
        }
      });

      // Gradually slow down if no recent key presses
      if (timeSinceLastKey > 1) {
        // 1 second after last keypress
        targetSpeed = Math.max(0.8, targetSpeed * 0.99); // Slowly reduce speed, minimum 0.8
      }

      // Smoothly interpolate to target speed
      currentSpeed += (targetSpeed - currentSpeed) * 0.02; // Slightly faster transition

      // Calculate rotations with smooth variable speed and mouse influence
      let rotX = time * 0.7 * currentSpeed;
      let rotY = time * 0.5 * currentSpeed;
      const rotZ = time * 0.3 * currentSpeed;

      // Add mouse-controlled rotation when hovering
      if (isHovering.current) {
        const mouseInfluence = 0.005; // Sensitivity of mouse control
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        // Mouse position relative to center, normalized to -1 to 1
        const mouseX = (mousePos.current.x - centerX) / centerX;
        const mouseY = (mousePos.current.y - centerY) / centerY;

        // Add mouse influence to rotations
        rotY += mouseX * mouseInfluence * 10; // Horizontal mouse movement affects Y rotation
        rotX += mouseY * mouseInfluence * 10; // Vertical mouse movement affects X rotation
      }

      // Update waveform visibility transitions (always runs)
      const beatDetection = beatDetectionRef.current;
      const currentAudioData = audioDataRef.current;
      const hasMusicData =
        currentAudioData && currentAudioData.waveform.length > 0;

      // Detect music state changes
      if (hasMusicData && !beatDetection.lastMusicState) {
        // Music just started
        beatDetection.musicStartTime = time;
        beatDetection.lastMusicState = true;
      } else if (!hasMusicData && beatDetection.lastMusicState) {
        // Music just stopped - take snapshot
        beatDetection.musicStopTime = time;
        beatDetection.lastMusicState = false;
        if (currentAudioData) {
          beatDetection.lastFrequencySnapshot = new Uint8Array(
            currentAudioData.waveform
          );
        }
      }

      // Update target visibility with delays
      const timeSinceStart = time - beatDetection.musicStartTime;
      const timeSinceStop = time - beatDetection.musicStopTime;

      if (hasMusicData && timeSinceStart > 0.3) {
        // Show waveform 300ms after music starts
        beatDetection.targetVisibility = 1;
      } else if (!hasMusicData && timeSinceStop < 2.0) {
        // Keep visible for 2 seconds after music stops (fade out snapshot)
        beatDetection.targetVisibility = Math.max(0, 1 - timeSinceStop / 2.0);
      } else {
        beatDetection.targetVisibility = 0;
      }

      // Smooth visibility transition
      beatDetection.waveVisibility +=
        (beatDetection.targetVisibility - beatDetection.waveVisibility) * 0.08;

      // Update slide offset for animation
      beatDetection.slideOffset = (1 - beatDetection.waveVisibility) * 50; // Slide from right

      // Calculate beat-responsive zoom
      let finalZoom = 0.75; // Default zoom
      if (currentAudioData && currentAudioData.frequency.length > 0) {
        // Use beat detection to control zoom
        finalZoom = detectBeatAndUpdateZoom(currentAudioData.frequency);
      } else {
        // Fallback to gentle oscillation when no music
        finalZoom = Math.sin(time * 0.3) * 0.15 + 0.75; // Oscillates between 0.6 and 0.9
      }

      // Project all vertices with zoom
      const projectedVertices = cubeVertices.map(vertex =>
        project(vertex, rotX, rotY, rotZ, finalZoom)
      );

      // Draw network effect in background
      if (networkAlpha > 0.01) {
        // Draw network connections
        networkNodes.forEach((node, _index) => {
          node.connections.forEach(connectionIndex => {
            const connectedNode = networkNodes[connectionIndex];

            ctx.strokeStyle = `rgba(59, 130, 246, ${networkAlpha * 0.2})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(node.x, node.y);
            ctx.lineTo(connectedNode.x, connectedNode.y);
            ctx.stroke();
          });
        });

        // Draw network nodes
        networkNodes.forEach(node => {
          ctx.fillStyle = `rgba(59, 130, 246, ${networkAlpha})`;
          ctx.beginPath();
          ctx.arc(node.x, node.y, 2, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      // Draw sound wave visualization in the middle
      drawSoundWave();

      // Draw wireframe edges
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1;
      ctx.lineCap = 'square';

      cubeEdges.forEach(([start, end]) => {
        const p1 = projectedVertices[start];
        const p2 = projectedVertices[end];

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      });

      // Draw hovering heart that follows mouse
      if (isHovering.current) {
        const heartBeat = 1 + Math.sin(time * 8) * 0.2; // beating animation
        drawPixelatedHeart(
          mousePos.current.x,
          mousePos.current.y,
          heartBeat,
          0.8
        );
      }

      // Draw explosion particles
      heartParticles.current.forEach(particle => {
        const alpha = particle.life / particle.maxLife;
        drawPixelatedHeart(
          particle.x,
          particle.y,
          particle.size * 0.3,
          alpha * 0.7
        );
      });

      // Draw floating musical notes
      musicNotes.current.forEach(note => {
        drawPixelatedNote(
          note.x,
          note.y,
          note.size,
          note.alpha * 0.8,
          note.type
        );
      });
    };

    const interval = setInterval(animate, 16); // ~60fps

    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('keydown', handleKeyPress);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseenter', handleMouseEnter);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      canvas.removeEventListener('click', handleClick);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full ${className}`}
      style={{
        background: 'transparent',
        cursor: 'pointer',
      }}
    />
  );
}
