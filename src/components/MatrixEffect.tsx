import { useEffect, useRef } from 'react';

interface MatrixEffectProps {
  className?: string;
}

export function MatrixEffect({ className = '' }: MatrixEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Matrix effect variables
    const fontSize = 10;
    const columns = Math.floor(canvas.width / fontSize);
    const drops: number[] = new Array(columns).fill(0);

    // Animation function
    const draw = () => {
      // Semi-transparent background for fade effect
      ctx.fillStyle = 'rgba(37, 99, 235, 0.05)'; // Very transparent blue-600
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Matrix text color - very bright blue
      ctx.fillStyle = '#60a5fa'; // blue-400 for very bright text
      ctx.font = `${fontSize}px monospace`;

      for (let i = 0; i < drops.length; i++) {
        // Random 1 or 0
        const text = Math.random() > 0.5 ? '1' : '0';

        // Draw the character
        ctx.fillText(text, i * fontSize, drops[i] * fontSize);

        // Reset drop to top randomly or when it reaches bottom
        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }

        drops[i]++;
      }
    };

    const interval = setInterval(draw, 50);

    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full ${className}`}
      style={{ background: 'transparent' }}
    />
  );
}
