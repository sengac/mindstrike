import { useEffect, useRef } from 'react';

interface FlameEffectProps {
  className?: string;
}

export function FlameEffect({ className = '' }: FlameEffectProps) {
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
      { x:  1, y: -1, z: -1 }, // 1
      { x:  1, y:  1, z: -1 }, // 2
      { x: -1, y:  1, z: -1 }, // 3
      { x: -1, y: -1, z:  1 }, // 4
      { x:  1, y: -1, z:  1 }, // 5
      { x:  1, y:  1, z:  1 }, // 6
      { x: -1, y:  1, z:  1 }, // 7
    ];

    // Cube edges (which vertices connect to which)
    const cubeEdges: [number, number][] = [
      // Front face
      [0, 1], [1, 2], [2, 3], [3, 0],
      // Back face
      [4, 5], [5, 6], [6, 7], [7, 4],
      // Connecting edges
      [0, 4], [1, 5], [2, 6], [3, 7]
    ];

    // Cube faces (which vertices form each face)
    const cubeFaces: number[][] = [
      [0, 1, 2, 3], // Front face
      [4, 5, 6, 7], // Back face
      [0, 1, 5, 4], // Bottom face
      [2, 3, 7, 6], // Top face
      [0, 3, 7, 4], // Left face
      [1, 2, 6, 5], // Right face
    ];

    // 3D to 2D projection with rotation and zoom
    const project = (point: Point3D, rotX: number, rotY: number, rotZ: number, zoom: number): Point2D => {
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      // Scale to fit within canvas bounds with margin, modified by zoom
      const baseScale = Math.min(canvas.width, canvas.height) * 0.15;
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
        y: centerY + y * scale
      };
    };

    // Calculate face normal for depth sorting
    const getFaceNormal = (face: number[], vertices: Point3D[]): number => {
      const v1 = vertices[face[0]];
      const v2 = vertices[face[1]];
      const v3 = vertices[face[2]];
      
      const edge1 = { x: v2.x - v1.x, y: v2.y - v1.y, z: v2.z - v1.z };
      const edge2 = { x: v3.x - v1.x, y: v3.y - v1.y, z: v3.z - v1.z };
      
      // Cross product for normal
      const normal = {
        x: edge1.y * edge2.z - edge1.z * edge2.y,
        y: edge1.z * edge2.x - edge1.x * edge2.z,
        z: edge1.x * edge2.y - edge1.y * edge2.x
      };
      
      return normal.z; // Return z component for depth
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
      connections: number[];
    }

    const networkNodes: NetworkNode[] = [];
    const maxNodes = 15;

    // Create network nodes
    for (let i = 0; i < maxNodes; i++) {
      networkNodes.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        connections: []
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
      targetSpeed = 1.5; // Gentle speed up on keypress
      lastKeyTime = time;
      
      // Track first key of typing session
      if (time - lastKeyTime > 2) { // If more than 2 seconds since last key
        firstKeyTime = time;
      }
    };

    // Add event listener
    window.addEventListener('keydown', handleKeyPress);

    const animate = () => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      time += 0.02;
      
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
      
      // Gradually slow down if no recent key presses
      if (timeSinceLastKey > 1) { // 1 second after last keypress
        targetSpeed = Math.max(0.8, targetSpeed * 0.99); // Slowly reduce speed, minimum 0.8
      }
      
      // Smoothly interpolate to target speed
      currentSpeed += (targetSpeed - currentSpeed) * 0.02; // Slightly faster transition
      
      // Calculate rotations with smooth variable speed
      const rotX = time * 0.7 * currentSpeed;
      const rotY = time * 0.5 * currentSpeed;
      const rotZ = time * 0.3 * currentSpeed;
      
      // Calculate zoom with smooth in/out effect
      const zoomCycle = Math.sin(time * 0.3) * 0.5 + 1; // Oscillates between 0.5 and 1.5
      
      // Rotate vertices for normal calculation
      const rotatedVertices = cubeVertices.map(vertex => {
        let { x, y, z } = vertex;
        
        // Apply same rotations as projection
        const cosX = Math.cos(rotX);
        const sinX = Math.sin(rotX);
        const y1 = y * cosX - z * sinX;
        const z1 = y * sinX + z * cosX;
        y = y1;
        z = z1;
        
        const cosY = Math.cos(rotY);
        const sinY = Math.sin(rotY);
        const x1 = x * cosY + z * sinY;
        const z2 = -x * sinY + z * cosY;
        x = x1;
        z = z2;
        
        const cosZ = Math.cos(rotZ);
        const sinZ = Math.sin(rotZ);
        const x2 = x * cosZ - y * sinZ;
        const y2 = x * sinZ + y * cosZ;
        
        return { x: x2, y: y2, z };
      });
      
      // Project all vertices with zoom
      const projectedVertices = cubeVertices.map(vertex => 
        project(vertex, rotX, rotY, rotZ, zoomCycle)
      );
      
      // Draw network effect in background
      if (networkAlpha > 0.01) {
        // Draw network connections
        networkNodes.forEach((node, index) => {
          node.connections.forEach(connectionIndex => {
            const connectedNode = networkNodes[connectionIndex];
            
            ctx.strokeStyle = `rgba(59, 130, 246, ${networkAlpha * 0.3})`;
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
      
      // Draw wireframe edges
      ctx.strokeStyle = '#1e40af';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      
      cubeEdges.forEach(([start, end]) => {
        const p1 = projectedVertices[start];
        const p2 = projectedVertices[end];
        
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      });
      
      // Draw vertices as dots
      ctx.fillStyle = '#3b82f6';
      projectedVertices.forEach(point => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    };

    const interval = setInterval(animate, 16); // ~60fps

    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('keydown', handleKeyPress);
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
