export class MindMapDataManager {
    constructor() {
        this.history = [];
        this.historyIndex = -1;
        this.isUndoRedo = false;
    }
    // Convert tree structure to React Flow nodes
    convertTreeToNodes(treeData) {
        const { root } = treeData;
        const layoutMap = {
            'graph-right': 'LR',
            'graph-left': 'RL',
            'graph-bottom': 'TB',
            'graph-top': 'BT'
        };
        const detectedLayout = layoutMap[root.layout] || 'LR';
        const nodes = [];
        const buildReactFlowNodes = (treeNode, parentId, level = 0) => {
            const reactFlowNode = {
                id: treeNode.id,
                type: 'mindMapNode',
                position: { x: 0, y: 0 },
                data: {
                    id: treeNode.id,
                    label: treeNode.text,
                    isRoot: level === 0,
                    parentId,
                    level,
                    hasChildren: (treeNode.children && treeNode.children.length > 0) || false,
                    chatId: treeNode.chatId || undefined,
                    notes: treeNode.notes || undefined,
                    sources: treeNode.sources || undefined,
                    customColors: treeNode.customColors || undefined
                }
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
            layout: detectedLayout
        };
    }
    // Convert React Flow nodes to tree structure
    convertNodesToTree(nodes, rootNodeId, layout) {
        const rootNode = nodes.find(n => n.id === rootNodeId);
        if (!rootNode) {
            throw new Error('Root node not found');
        }
        const layoutMap = {
            LR: 'graph-right',
            RL: 'graph-left',
            TB: 'graph-bottom',
            BT: 'graph-top'
        };
        const buildTree = (nodeId) => {
            const node = nodes.find(n => n.id === nodeId);
            if (!node) {
                throw new Error(`Node ${nodeId} not found`);
            }
            const children = nodes
                .filter(n => n.data.parentId === nodeId)
                .map(childNode => buildTree(childNode.id));
            const nodeData = {
                id: node.id,
                text: node.data.label,
                notes: node.data.notes || null,
                ...(children.length > 0 && { children })
            };
            // Include chatId if it exists
            if (node.data.chatId) {
                nodeData.chatId = node.data.chatId;
            }
            // Include sources if they exist
            if (node.data.sources && node.data.sources.length > 0) {
                nodeData.sources = node.data.sources;
            }
            // Include customColors if they exist
            if (node.data.customColors) {
                nodeData.customColors = node.data.customColors;
            }
            return nodeData;
        };
        const rootTree = buildTree(rootNodeId);
        return {
            root: {
                ...rootTree,
                layout: layoutMap[layout] || 'graph-right'
            }
        };
    }
    // Generate edges from node hierarchy
    generateEdges(nodes, layout = 'LR') {
        const edges = [];
        let sourceHandle, targetHandle;
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
                    style: { stroke: '#64748b', strokeWidth: 2 }
                });
            }
        });
        return edges;
    }
    // Save state to history
    saveToHistory(nodes, rootNodeId, layout) {
        if (this.isUndoRedo) {
            this.isUndoRedo = false;
            return;
        }
        const newState = {
            nodes,
            rootNodeId,
            layout
        };
        const newHistory = this.history.slice(0, this.historyIndex + 1);
        newHistory.push(newState);
        if (newHistory.length > 50) {
            newHistory.shift();
        }
        else {
            this.historyIndex += 1;
        }
        this.history = newHistory;
    }
    // Initialize data from tree or create empty graph
    async initializeData(mindMapId, initialData) {
        if (initialData && initialData.root) {
            const { nodes, rootNodeId, layout } = this.convertTreeToNodes(initialData);
            const edges = this.generateEdges(nodes, layout);
            this.history = [{ nodes, rootNodeId, layout }];
            this.historyIndex = 0;
            return { nodes, edges, rootNodeId, layout };
        }
        else {
            const rootId = `node-${Date.now()}`;
            const rootNode = {
                id: rootId,
                type: 'mindMapNode',
                position: { x: 400, y: 300 },
                data: {
                    id: rootId,
                    label: 'Central Idea',
                    isRoot: true,
                    level: 0
                }
            };
            const nodes = [rootNode];
            const edges = [];
            const layout = 'LR';
            this.history = [{ nodes, rootNodeId: rootId, layout }];
            this.historyIndex = 0;
            return { nodes, edges, rootNodeId: rootId, layout };
        }
    }
    // Undo/Redo functionality
    undo() {
        if (this.historyIndex > 0) {
            this.isUndoRedo = true;
            const prevState = this.history[this.historyIndex - 1];
            const edges = this.generateEdges(prevState.nodes, prevState.layout);
            this.historyIndex -= 1;
            return {
                nodes: prevState.nodes,
                edges,
                rootNodeId: prevState.rootNodeId,
                layout: prevState.layout
            };
        }
        return null;
    }
    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.isUndoRedo = true;
            const nextState = this.history[this.historyIndex + 1];
            const edges = this.generateEdges(nextState.nodes, nextState.layout);
            this.historyIndex += 1;
            return {
                nodes: nextState.nodes,
                edges,
                rootNodeId: nextState.rootNodeId,
                layout: nextState.layout
            };
        }
        return null;
    }
    get canUndo() {
        return this.historyIndex > 0;
    }
    get canRedo() {
        return this.historyIndex < this.history.length - 1;
    }
}
