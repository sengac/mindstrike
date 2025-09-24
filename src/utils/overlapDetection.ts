/**
 * Overlap detection utility for mindmap nodes
 * Detects when nodes are overlapping in their rendered positions and throws errors
 */

export interface NodePosition {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

export interface OverlapResult {
  hasOverlaps: boolean;
  overlaps: Array<{
    node1: NodePosition;
    node2: NodePosition;
    overlapArea: number;
  }>;
  totalNodes: number;
  message: string;
}

/**
 * Detects overlapping nodes by checking their actual DOM positions
 */
export function detectNodeOverlaps(
  containerElement?: HTMLElement,
  throwOnOverlap: boolean = false
): OverlapResult {
  const container = containerElement || document;

  // Find all mindmap nodes (exclude tiny handles and other elements)
  const nodeElements = container.querySelectorAll('[data-id^="node-"]');
  const nodePositions: NodePosition[] = [];

  nodeElements.forEach(el => {
    const rect = el.getBoundingClientRect();
    const nodeId = el.getAttribute('data-id') || 'unknown';

    // Only consider actual content nodes (filter out tiny handles)
    if (rect.width > 50 && rect.height > 20) {
      nodePositions.push({
        id: nodeId,
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        label: el.textContent?.trim().substring(0, 50) || 'No label',
      });
    }
  });

  // Check for overlaps
  const overlaps: Array<{
    node1: NodePosition;
    node2: NodePosition;
    overlapArea: number;
  }> = [];

  for (let i = 0; i < nodePositions.length; i++) {
    for (let j = i + 1; j < nodePositions.length; j++) {
      const node1 = nodePositions[i];
      const node2 = nodePositions[j];

      // Check if rectangles overlap
      const xOverlap = Math.max(
        0,
        Math.min(node1.x + node1.width, node2.x + node2.width) -
          Math.max(node1.x, node2.x)
      );
      const yOverlap = Math.max(
        0,
        Math.min(node1.y + node1.height, node2.y + node2.height) -
          Math.max(node1.y, node2.y)
      );

      if (xOverlap > 0 && yOverlap > 0) {
        const overlapArea = xOverlap * yOverlap;
        overlaps.push({
          node1,
          node2,
          overlapArea,
        });
      }
    }
  }

  const hasOverlaps = overlaps.length > 0;
  const result: OverlapResult = {
    hasOverlaps,
    overlaps,
    totalNodes: nodePositions.length,
    message: hasOverlaps
      ? `⚠️ Found ${overlaps.length} overlapping node pairs out of ${nodePositions.length} nodes`
      : `✅ No overlaps detected among ${nodePositions.length} nodes`,
  };

  if (hasOverlaps) {
    console.error('🚨 OVERLAP DETECTED:', result.message);

    // Log detailed overlap information for debugging
    overlaps.forEach((overlap, index) => {
      console.error(`OVERLAP ${index + 1}:`, {
        node1: `"${overlap.node1.label.substring(0, 30)}..." (${overlap.node1.width}x${overlap.node1.height}) at (${overlap.node1.x}, ${overlap.node1.y})`,
        node2: `"${overlap.node2.label.substring(0, 30)}..." (${overlap.node2.width}x${overlap.node2.height}) at (${overlap.node2.x}, ${overlap.node2.y})`,
        overlapArea: overlap.overlapArea,
        distance: Math.sqrt(
          Math.pow(overlap.node2.x - overlap.node1.x, 2) +
            Math.pow(overlap.node2.y - overlap.node1.y, 2)
        ).toFixed(1),
      });
    });

    if (throwOnOverlap) {
      throw new Error(
        `Mindmap Layout Error: ${result.message}. See console for details.`
      );
    }
  } else {
    console.log('✅ NO OVERLAPS:', result.message);
  }

  // Always log layout debugging info in development
  if (process.env.NODE_ENV === 'development' && nodePositions.length > 0) {
    const bounds = {
      minX: Math.min(...nodePositions.map(n => n.x)),
      maxX: Math.max(...nodePositions.map(n => n.x + n.width)),
      minY: Math.min(...nodePositions.map(n => n.y)),
      maxY: Math.max(...nodePositions.map(n => n.y + n.height)),
    };
    const layoutWidth = bounds.maxX - bounds.minX;
    const layoutHeight = bounds.maxY - bounds.minY;

    console.log('📐 LAYOUT DEBUG:', {
      totalNodes: nodePositions.length,
      layoutDimensions: `${layoutWidth.toFixed(0)}x${layoutHeight.toFixed(0)}`,
      bounds: `(${bounds.minX.toFixed(0)}, ${bounds.minY.toFixed(0)}) to (${bounds.maxX.toFixed(0)}, ${bounds.maxY.toFixed(0)})`,
      averageNodeSize: `${(nodePositions.reduce((sum, n) => sum + n.width, 0) / nodePositions.length).toFixed(0)}x${(nodePositions.reduce((sum, n) => sum + n.height, 0) / nodePositions.length).toFixed(0)}`,
    });
  }

  return result;
}

/**
 * Continuously monitors for overlaps (useful for development)
 */
export function startOverlapMonitoring(
  intervalMs: number = 2000,
  throwOnOverlap: boolean = false
): () => void {
  const intervalId = setInterval(() => {
    try {
      detectNodeOverlaps(undefined, throwOnOverlap);
    } catch (error) {
      console.error('Overlap monitoring error:', error);
    }
  }, intervalMs);

  // Return cleanup function
  return () => clearInterval(intervalId);
}
