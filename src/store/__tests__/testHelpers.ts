import type { MindMapData, MindMapNode } from '../../utils/mindMapData';

interface SimplifiedNode {
  id: string;
  label: string;
  isRoot?: boolean;
  parentId?: string;
  level?: number;
  children?: string[];
}

/**
 * Helper function to convert simplified node format to MindMapData
 * for use in tests
 */
export function createTestMindMapData(
  nodes: SimplifiedNode[],
  layout: 'LR' | 'RL' | 'TB' | 'BT' = 'LR'
): MindMapData {
  // Find root node
  const rootNode = nodes.find(n => n.isRoot);
  if (!rootNode) {
    throw new Error('No root node found in test data');
  }

  // Build tree structure
  const nodeMap = new Map<string, SimplifiedNode>();
  nodes.forEach(node => nodeMap.set(node.id, node));

  function buildMindMapNode(nodeId: string): MindMapNode {
    const node = nodeMap.get(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }

    const mindMapNode: MindMapNode = {
      id: node.id,
      text: node.label,
    };

    if (node.children && node.children.length > 0) {
      mindMapNode.children = node.children.map(childId =>
        buildMindMapNode(childId)
      );
    }

    return mindMapNode;
  }

  const rootMindMapNode = buildMindMapNode(rootNode.id);

  const layoutMap: Record<
    string,
    'graph-left' | 'graph-right' | 'graph-top' | 'graph-bottom'
  > = {
    LR: 'graph-right',
    RL: 'graph-left',
    TB: 'graph-bottom',
    BT: 'graph-top',
  };

  return {
    root: {
      ...rootMindMapNode,
      layout: layoutMap[layout],
    },
  };
}
