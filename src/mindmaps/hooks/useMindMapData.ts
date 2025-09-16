import { useState, useEffect, useCallback, useRef } from 'react';
import { Node, Edge } from 'reactflow';
import { MindMapNodeData } from '../types/mindMap';

export interface MindMapNode {
  id: string;
  text: string;
  notes?: string | null;
  chatId?: string | null;
  side?: 'left' | 'right';
  children?: MindMapNode[];
}

export interface MindMapData {
  root: MindMapNode & {
    layout: 'graph-left' | 'graph-right' | 'graph-top' | 'graph-bottom';
  };
}

interface HistoryState {
  nodes: Node<MindMapNodeData>[];
  rootNodeId: string;
  layout: 'LR' | 'RL' | 'TB' | 'BT';
}

export function useMindMapData(
  mindMapId: string,
  initialData?: MindMapData,
  onSave?: (data: MindMapData) => void,
  onInitialLoadComplete?: () => void
) {
  const [nodes, setNodes] = useState<Node<MindMapNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [rootNodeId, setRootNodeId] = useState<string>('');
  const [layout, setLayout] = useState<'LR' | 'RL' | 'TB' | 'BT'>('LR');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // History for undo/redo
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isUndoRedo = useRef(false);
  const isInitializing = useRef(true);

  // Convert tree structure to React Flow nodes
  const convertTreeToNodes = useCallback((treeData: MindMapData) => {
    const { root } = treeData;

    const layoutMap: Record<string, 'LR' | 'RL' | 'TB' | 'BT'> = {
      'graph-right': 'LR',
      'graph-left': 'RL',
      'graph-bottom': 'TB',
      'graph-top': 'BT',
    };

    const detectedLayout = layoutMap[root.layout] || 'LR';
    const nodes: Node<MindMapNodeData>[] = [];

    const buildReactFlowNodes = (
      treeNode: MindMapNode,
      parentId?: string,
      level: number = 0
    ) => {
      const reactFlowNode: Node<MindMapNodeData> = {
        id: treeNode.id,
        type: 'mindMapNode',
        position: { x: 0, y: 0 },
        data: {
          id: treeNode.id,
          label: treeNode.text,
          isRoot: level === 0,
          parentId,
          level,
          notes: treeNode.notes,
          chatId: treeNode.chatId,
          hasChildren:
            (treeNode.children && treeNode.children.length > 0) || false,
        },
      };

      nodes.push(reactFlowNode);

      if (treeNode.children) {
        treeNode.children.forEach(child => {
          buildReactFlowNodes(child, treeNode.id, level + 1);
        });
      }
    };

    buildReactFlowNodes(root);

    return {
      nodes,
      rootNodeId: root.id,
      layout: detectedLayout,
    };
  }, []);

  // Convert React Flow nodes to tree structure
  const convertNodesToTree = useCallback(
    (
      nodes: Node<MindMapNodeData>[],
      rootNodeId: string,
      layout: 'LR' | 'RL' | 'TB' | 'BT'
    ): MindMapData => {
      const rootNode = nodes.find(n => n.id === rootNodeId);
      if (!rootNode) {
        throw new Error('Root node not found');
      }

      const layoutMap: Record<
        string,
        'graph-left' | 'graph-right' | 'graph-top' | 'graph-bottom'
      > = {
        LR: 'graph-right',
        RL: 'graph-left',
        TB: 'graph-bottom',
        BT: 'graph-top',
      };

      const buildTree = (nodeId: string): MindMapNode => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) {
          throw new Error(`Node ${nodeId} not found`);
        }

        const children = nodes
          .filter(n => n.data.parentId === nodeId)
          .map(childNode => buildTree(childNode.id));

        const nodeData: MindMapNode = {
          id: node.id,
          text: node.data.label,
          notes: node.data.notes || null,
          ...(children.length > 0 && { children }),
        };

        // Only add chatId if it exists
        if (node.data.chatId) {
          nodeData.chatId = node.data.chatId;
        }

        return nodeData;
      };

      const rootTree = buildTree(rootNodeId);

      return {
        root: {
          ...rootTree,
          layout: layoutMap[layout] || 'graph-right',
        },
      };
    },
    []
  );

  // Generate edges from node hierarchy
  const generateEdges = useCallback(
    (
      nodes: Node<MindMapNodeData>[],
      layout: 'LR' | 'RL' | 'TB' | 'BT' = 'LR'
    ): Edge[] => {
      const edges: Edge[] = [];

      let sourceHandle: string, targetHandle: string;
      switch (layout) {
        case 'LR':
          sourceHandle = 'right-source';
          targetHandle = 'left';
          break;
        case 'RL':
          sourceHandle = 'left-source';
          targetHandle = 'right';
          break;
        case 'TB':
          sourceHandle = 'bottom-source';
          targetHandle = 'top';
          break;
        case 'BT':
          sourceHandle = 'top-source';
          targetHandle = 'bottom';
          break;
      }

      nodes.forEach(node => {
        if (node.data.parentId) {
          edges.push({
            id: `edge-${node.data.parentId}-${node.id}`,
            source: node.data.parentId,
            target: node.id,
            sourceHandle,
            targetHandle,
            type: 'default',
            style: { stroke: '#64748b', strokeWidth: 2 },
          });
        }
      });

      return edges;
    },
    []
  );

  // Save state to history
  const saveToHistory = useCallback(
    (
      newNodes: Node<MindMapNodeData>[],
      newRootId: string,
      newLayout?: 'LR' | 'RL' | 'TB' | 'BT'
    ) => {
      if (isUndoRedo.current) {
        isUndoRedo.current = false;
        return;
      }

      const newState = {
        nodes: newNodes,
        rootNodeId: newRootId,
        layout: newLayout || layout,
      };
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(newState);

      if (newHistory.length > 50) {
        newHistory.shift();
      } else {
        setHistoryIndex(prev => prev + 1);
      }

      setHistory(newHistory);
    },
    [history, historyIndex, layout]
  );

  // Initialize data
  useEffect(() => {
    if (initialData && initialData.root) {
      setIsLoading(true);

      setTimeout(() => {
        const {
          nodes: convertedNodes,
          rootNodeId: convertedRootId,
          layout: loadLayout,
        } = convertTreeToNodes(initialData);
        const generatedEdges = generateEdges(convertedNodes, loadLayout);

        setNodes(convertedNodes);
        setEdges(generatedEdges);
        setRootNodeId(convertedRootId);
        setLayout(loadLayout);

        setHistory([
          {
            nodes: convertedNodes,
            rootNodeId: convertedRootId,
            layout: loadLayout,
          },
        ]);
        setHistoryIndex(0);

        // Keep loading true until layout completes and fitView runs

        // Trigger initial load complete callback
        if (onInitialLoadComplete) {
          setTimeout(onInitialLoadComplete, 200);
        }
      }, 50);
    } else if (mindMapId) {
      const rootId = `node-${Date.now()}`;
      const rootNode: Node<MindMapNodeData> = {
        id: rootId,
        type: 'mindMapNode',
        position: { x: 400, y: 300 },
        data: {
          id: rootId,
          label: 'Central Idea',
          isRoot: true,
          level: 0,
        },
      };

      setNodes([rootNode]);
      setEdges([]);
      setRootNodeId(rootId);
      setHistory([{ nodes: [rootNode], rootNodeId: rootId, layout: 'LR' }]);
      setHistoryIndex(0);

      // Trigger initial load complete callback for new graph
      if (onInitialLoadComplete) {
        setTimeout(onInitialLoadComplete, 200);
      }
    }

    setTimeout(() => {
      isInitializing.current = false;
    }, 100);
  }, [mindMapId, initialData, convertTreeToNodes, generateEdges]);

  // Auto-save
  useEffect(() => {
    if (nodes.length > 0 && rootNodeId && !isInitializing.current && onSave) {
      const timeoutId = setTimeout(() => {
        const treeData = convertNodesToTree(nodes, rootNodeId, layout);
        onSave(treeData);
      }, 500);

      return () => clearTimeout(timeoutId);
    }
  }, [nodes, edges, rootNodeId, layout, onSave, convertNodesToTree]);

  // Undo/Redo
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      isUndoRedo.current = true;
      const prevState = history[historyIndex - 1];
      const generatedEdges = generateEdges(prevState.nodes, prevState.layout);

      setNodes(prevState.nodes);
      setEdges(generatedEdges);
      setRootNodeId(prevState.rootNodeId);
      setLayout(prevState.layout);
      setHistoryIndex(prev => prev - 1);
    }
  }, [history, historyIndex, generateEdges]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      isUndoRedo.current = true;
      const nextState = history[historyIndex + 1];
      const generatedEdges = generateEdges(nextState.nodes, nextState.layout);

      setNodes(nextState.nodes);
      setEdges(generatedEdges);
      setRootNodeId(nextState.rootNodeId);
      setLayout(nextState.layout);
      setHistoryIndex(prev => prev + 1);
    }
  }, [history, historyIndex, generateEdges]);

  return {
    // State
    nodes,
    edges,
    rootNodeId,
    layout,
    selectedNodeId,
    isLoading,

    // Setters
    setNodes,
    setEdges,
    setLayout,
    setSelectedNodeId,
    setIsLoading,

    // Utilities
    generateEdges,
    convertNodesToTree,
    saveToHistory,

    // History
    undo,
    redo,
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1,
  };
}
