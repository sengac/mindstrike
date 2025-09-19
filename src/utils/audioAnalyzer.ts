// Global audio analyzer singleton to handle MediaElementSource reuse issues

class AudioAnalyzer {
  private static instance: AudioAnalyzer | null = null;
  private audioContext: AudioContext | null = null;
  private analyzer: AnalyserNode | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private currentAudioElement: HTMLAudioElement | null = null;
  private subscribers: Set<
    (data: { frequency: Uint8Array; waveform: Uint8Array }) => void
  > = new Set();
  private animationFrame: number | null = null;

  static getInstance(): AudioAnalyzer {
    if (!AudioAnalyzer.instance) {
      AudioAnalyzer.instance = new AudioAnalyzer();
    }
    return AudioAnalyzer.instance;
  }

  private constructor() {
    // Private constructor for singleton
  }

  async connectToAudio(audioElement: HTMLAudioElement): Promise<boolean> {
    try {
      // If we're already connected to this element, we're good
      if (this.currentAudioElement === audioElement && this.analyzer) {
        this.startAnalysis();
        return true;
      }

      // Clean up previous connections
      this.cleanup();

      // Create AudioContext if needed
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext ||
          (window as any).webkitAudioContext)();
      }

      // Resume context if suspended
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Create analyzer
      this.analyzer = this.audioContext.createAnalyser();
      this.analyzer.fftSize = 256;
      this.analyzer.smoothingTimeConstant = 0.8;

      // Try to create source
      this.source = this.audioContext.createMediaElementSource(audioElement);
      this.source.connect(this.analyzer);
      this.analyzer.connect(this.audioContext.destination);

      this.currentAudioElement = audioElement;

      this.startAnalysis();
      return true;
    } catch (error) {
      console.warn('Failed to connect audio analyzer:', error);
      return false;
    }
  }

  private startAnalysis() {
    if (!this.analyzer || this.animationFrame) return;

    const bufferLength = this.analyzer.frequencyBinCount;
    const frequencyData = new Uint8Array(bufferLength);
    const waveformData = new Uint8Array(bufferLength);

    const analyze = () => {
      if (!this.analyzer || this.subscribers.size === 0) {
        this.animationFrame = null;
        return;
      }

      this.analyzer.getByteFrequencyData(frequencyData);
      this.analyzer.getByteTimeDomainData(waveformData);

      // Notify all subscribers with both frequency and waveform data
      this.subscribers.forEach(callback => {
        try {
          callback({
            frequency: new Uint8Array(frequencyData),
            waveform: new Uint8Array(waveformData),
          });
        } catch (error) {
          console.warn('Error in audio analyzer subscriber:', error);
        }
      });

      this.animationFrame = requestAnimationFrame(analyze);
    };

    analyze();
  }

  subscribe(
    callback: (data: { frequency: Uint8Array; waveform: Uint8Array }) => void
  ): () => void {
    this.subscribers.add(callback);

    // Start analysis if we have an analyzer and this is the first subscriber
    if (this.analyzer && this.subscribers.size === 1) {
      this.startAnalysis();
    }

    // Return unsubscribe function
    return () => {
      this.subscribers.delete(callback);

      // Stop analysis if no more subscribers
      if (this.subscribers.size === 0 && this.animationFrame) {
        cancelAnimationFrame(this.animationFrame);
        this.animationFrame = null;
      }
    };
  }

  private cleanup() {
    // Cancel animation frame
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    // Disconnect audio nodes
    if (this.source) {
      try {
        this.source.disconnect();
      } catch (error) {
        // Already disconnected
      }
      this.source = null;
    }

    if (this.analyzer) {
      try {
        this.analyzer.disconnect();
      } catch (error) {
        // Already disconnected
      }
      this.analyzer = null;
    }

    this.currentAudioElement = null;
  }

  disconnect() {
    this.cleanup();
    this.subscribers.clear();
  }

  isConnected(): boolean {
    return !!(this.analyzer && this.source && this.currentAudioElement);
  }

  getCurrentAudioElement(): HTMLAudioElement | null {
    return this.currentAudioElement;
  }
}

export const audioAnalyzer = AudioAnalyzer.getInstance();
