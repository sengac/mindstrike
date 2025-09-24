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
  const container = containerElement ?? document;

  // Find all mindmap nodes - check for ReactFlow structure first, then fallback
  // ReactFlow creates wrapper elements, so we need to be precise about which elements we select
  let nodeElements = container.querySelectorAll(
    '.react-flow__node [data-id^="node-"]'
  );

  // If no nodes found with ReactFlow selector, try direct selector (for tests)
  if (nodeElements.length === 0) {
    nodeElements = container.querySelectorAll('[data-id^="node-"]');
  }
  const nodePositions: NodePosition[] = [];
  const seenIds = new Set<string>(); // Track unique node IDs to avoid duplicates

  nodeElements.forEach(el => {
    const rect = el.getBoundingClientRect();
    const nodeId = el.getAttribute('data-id') ?? 'unknown';

    // Skip if we've already processed this node ID
    if (seenIds.has(nodeId)) {
      return;
    }

    // Only consider actual content nodes (filter out tiny handles)
    // Also ensure the element is visible (not hidden handles)
    let isVisible = true;
    if (typeof window !== 'undefined' && window.getComputedStyle) {
      const computedStyle = window.getComputedStyle(el);
      isVisible =
        computedStyle.opacity !== '0' && computedStyle.display !== 'none';
    }

    if (rect.width > 50 && rect.height > 20 && isVisible) {
      seenIds.add(nodeId);
      nodePositions.push({
        id: nodeId,
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        label: el.textContent?.trim().substring(0, 50) ?? 'No label',
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
      // Add a small tolerance to avoid false positives from rounding errors
      const OVERLAP_TOLERANCE = 2; // pixels

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

      // Only consider it an overlap if it's more than our tolerance
      if (xOverlap > OVERLAP_TOLERANCE && yOverlap > OVERLAP_TOLERANCE) {
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
    // Overlap detected - details available in result

    // Store detailed overlap information for debugging - available in result.overlaps

    if (throwOnOverlap) {
      throw new Error(
        `Mindmap Layout Error: ${result.message}. See console for details.`
      );
    }
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
    } catch {
      // Overlap monitoring error occurred - silently continue
    }
  }, intervalMs);

  // Return cleanup function
  return () => clearInterval(intervalId);
}
