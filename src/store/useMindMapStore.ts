import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { useMemo } from 'react';
import type { Node, Edge } from 'reactflow';
import type { MindMapNodeData, Source } from '../types/mindMap';
import type { MindMapData } from '../utils/mindMapData';
import { MindMapDataManager } from '../utils/mindMapData';
import { MindMapLayoutManager } from '../utils/mindMapLayout';
import { MindMapActionsManager } from '../utils/mindMapActions';
import type { SseDecodedData } from '../utils/sseDecoder';
import {
  isSseObject,
  isSseMindmapChangeData,
  isSseMindmapCompleteData,
} from '../utils/sseDecoder';
import { sseEventBus } from '../utils/sseEventBus';

interface HistoryState {
  nodes: Node<MindMapNodeData>[];
  edges: Edge[];
  rootNodeId: string;
  layout: 'LR' | 'RL' | 'TB' | 'BT';
  selectedNodeId: string | null;
}

interface MindMapState {
  // Core state
  mindMapId: string | null;
  nodes: Node<MindMapNodeData>[];
  edges: Edge[];
  rootNodeId: string;
  layout: 'LR' | 'RL' | 'TB' | 'BT';

  // UI state
  selectedNodeId: string | null;
  isGenerating: boolean;
  generationError: string | null;
  generationSummary: string | null;

  // Iterative generation state
  generationProgress: {
    currentStep: number;
    maxSteps: number;
    reasoning: string | null;
    decision: string | null;
    isComplete: boolean;
    tokensPerSecond: number;
    totalTokens: number;
  } | null;

  // History state for undo/redo
  history: HistoryState[];
  historyIndex: number;
  maxHistorySize: number;

  // Managers (singleton instances)
  dataManager: MindMapDataManager;
  layoutManager: MindMapLayoutManager;
  actionsManager: MindMapActionsManager;

  // Initialization
  isInitialized: boolean;
  isInitializing: boolean;

  // Save callback
  saveCallback: ((data: MindMapData) => Promise<void>) | null;

  // SSE connection for task updates
  taskEventUnsubscribe: (() => void) | null;
  currentWorkflowId: string | null;

  // Active generation tracking
  currentGenerationWorkflowId: string | null;

  // Track mindmap changes completion
  pendingMindmapChanges: number;
  expectedMindmapChanges: number;
  generationComplete: boolean;
  finalGenerationResult: any;
}

interface MindMapActions {
  // Initialization
  initializeMindMap: (
    mindMapId: string,
    initialData?: MindMapData,
    saveCallback?: (data: MindMapData) => Promise<void>
  ) => Promise<void>;

  // Node operations
  addChildNode: (parentNodeId: string) => Promise<void>;
  addSiblingNode: (siblingNodeId: string) => Promise<void>;
  deleteNode: (nodeId: string) => Promise<void>;
  updateNodeLabel: (nodeId: string, label: string) => void;
  updateNodeLabelWithLayout: (nodeId: string, label: string) => Promise<void>;
  toggleNodeCollapse: (nodeId: string) => Promise<void>;
  moveNode: (
    nodeId: string,
    newParentId: string,
    insertIndex?: number
  ) => Promise<void>;

  // Node properties
  updateNodeChatId: (nodeId: string, chatId: string | null) => void;
  updateNodeNotes: (nodeId: string, notes: string | null) => void;
  updateNodeSources: (nodeId: string, sources: Source[]) => void;
  setNodeColors: (
    nodeId: string,
    colors: { backgroundClass: string; foregroundClass: string }
  ) => void;
  clearNodeColors: (nodeId: string) => void;

  // Layout operations
  changeLayout: (newLayout: 'LR' | 'RL' | 'TB' | 'BT') => Promise<void>;
  resetLayout: () => Promise<void>;

  // History operations
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  saveToHistory: () => void;

  // Selection
  selectNode: (nodeId: string | null) => void;

  // Generation state
  setGenerating: (isGenerating: boolean) => void;
  setGenerationError: (error: string | null) => void;
  setGenerationSummary: (summary: string | null) => void;
  setGenerationProgress: (
    progress: {
      currentStep: number;
      maxSteps: number;
      reasoning: string | null;
      decision: string | null;
      isComplete: boolean;
      tokensPerSecond: number;
      totalTokens: number;
    } | null
  ) => void;

  // Iterative generation
  startIterativeGeneration: (
    mindMapId: string,
    prompt: string,
    selectedNodeId: string
  ) => Promise<void>;
  cancelIterativeGeneration: () => void;

  // Bulk operations
  applyMindmapChanges: (changes: any[]) => Promise<void>;

  // Task workflow SSE
  connectToWorkflow: (workflowId: string) => void;
  disconnectFromWorkflow: () => void;

  // Utilities
  save: () => Promise<void>;
  reset: () => void;
}

type MindMapStore = MindMapState & MindMapActions;

// Create singleton manager instances
const dataManager = new MindMapDataManager();
const layoutManager = new MindMapLayoutManager();
const actionsManager = new MindMapActionsManager(dataManager, layoutManager);

export const useMindMapStore = create<MindMapStore>()(
  subscribeWithSelector(
    immer((set, get) => ({
      // Initial state
      mindMapId: null,
      nodes: [],
      edges: [],
      rootNodeId: '',
      layout: 'LR',
      selectedNodeId: null,
      isGenerating: false,
      generationError: null,
      generationSummary: null,
      generationProgress: null,
      history: [],
      historyIndex: -1,
      maxHistorySize: 50,
      dataManager,
      layoutManager,
      actionsManager,
      isInitialized: false,
      isInitializing: false,
      saveCallback: null,
      taskEventUnsubscribe: null,
      currentWorkflowId: null,
      currentGenerationWorkflowId: null,
      pendingMindmapChanges: 0,
      expectedMindmapChanges: 0,
      generationComplete: false,
      finalGenerationResult: null,

      // Initialize mind map
      initializeMindMap: async (mindMapId, initialData, saveCallback) => {
        const state = get();

        // Prevent multiple initializations of the same mindmap
        if (state.isInitializing) {
          return;
        }

        // If switching to a different mindmap, always reinitialize
        // If same mindmap but with different data, also reinitialize
        const shouldReinitialize =
          state.mindMapId !== mindMapId || !state.isInitialized;

        if (!shouldReinitialize) {
          // Just update the save callback if it's the same mindmap
          set({ saveCallback });
          return;
        }

        // Clear existing state when switching mindmaps
        set({
          isInitializing: true,
          mindMapId,
          saveCallback,
          isInitialized: false,
          nodes: [],
          edges: [],
          selectedNodeId: null,
          history: [],
          historyIndex: 0,
        });

        try {
          const result = await dataManager.initializeData(
            mindMapId,
            initialData
          );

          // Apply initial layout
          const layoutResult = await layoutManager.performCompleteLayout(
            result.nodes,
            result.edges,
            result.rootNodeId,
            result.layout
          );

          set(state => {
            state.nodes = layoutResult.nodes;
            state.edges = layoutResult.edges;
            state.rootNodeId = result.rootNodeId;
            state.layout = result.layout;
            state.history = [
              {
                nodes: layoutResult.nodes,
                edges: layoutResult.edges,
                rootNodeId: result.rootNodeId,
                layout: result.layout,
                selectedNodeId: null,
              },
            ];
            state.historyIndex = 0;
            state.isInitialized = true;
            state.isInitializing = false;
            state.selectedNodeId = null;
          });
        } catch (error) {
          console.error('Failed to initialize mind map:', error);
          set({ isInitializing: false });
        }
      },

      // Node operations
      addChildNode: async parentNodeId => {
        const state = get();
        if (!state.isInitialized) {
          return;
        }

        try {
          const result = await actionsManager.addChildNode(
            state.nodes,
            state.edges,
            state.rootNodeId,
            state.layout,
            parentNodeId
          );

          // Update nodes with selection
          const nodesWithSelection = result.nodes.map(n => ({
            ...n,
            selected: n.id === result.newNodeId,
          }));

          set({
            nodes: nodesWithSelection,
            edges: result.edges,
            selectedNodeId: result.newNodeId,
          });

          // Save history and trigger save
          const actions = get();
          actions.saveToHistory();
          actions.save();
        } catch (error) {
          console.error('Failed to add child node:', error);
        }
      },

      addSiblingNode: async siblingNodeId => {
        const state = get();
        if (!state.isInitialized) {
          return;
        }

        try {
          const result = await actionsManager.addSiblingNode(
            state.nodes,
            state.edges,
            state.rootNodeId,
            state.layout,
            siblingNodeId
          );

          // Update nodes with selection
          const nodesWithSelection = result.nodes.map(n => ({
            ...n,
            selected: n.id === result.newNodeId,
          }));

          set({
            nodes: nodesWithSelection,
            edges: result.edges,
            selectedNodeId: result.newNodeId,
          });

          // Save history and trigger save
          const actions = get();
          actions.saveToHistory();
          actions.save();
        } catch (error) {
          console.error('Failed to add sibling node:', error);
        }
      },

      deleteNode: async nodeId => {
        const state = get();
        if (!state.isInitialized) {
          return;
        }

        try {
          // Find all nodes that will be deleted (including descendants)
          const nodesToDelete = new Set([nodeId]);
          const findDescendants = (currentNodeId: string) => {
            const children = state.nodes.filter(
              n => n.data.parentId === currentNodeId
            );
            children.forEach(child => {
              if (!nodesToDelete.has(child.id)) {
                nodesToDelete.add(child.id);
                findDescendants(child.id);
              }
            });
          };
          findDescendants(nodeId);

          // Find parent of deleted node
          const nodeToDelete = state.nodes.find(n => n.id === nodeId);
          const parentId = nodeToDelete?.data.parentId;

          // Dispatch event to check and close inference panel
          window.dispatchEvent(
            new CustomEvent('mindmap-inference-check-and-close', {
              detail: {
                deletedNodeIds: Array.from(nodesToDelete),
                parentId: parentId,
              },
            })
          );

          const result = await actionsManager.deleteNode(
            state.nodes,
            state.edges,
            state.rootNodeId,
            state.layout,
            nodeId
          );

          set({
            nodes: result.nodes,
            edges: result.edges,
            selectedNodeId: null,
          });

          // Save history and trigger save
          const actions = get();
          actions.saveToHistory();
          actions.save();
        } catch (error) {
          console.error('Failed to delete node:', error);
        }
      },

      updateNodeLabel: (nodeId, label) => {
        const state = get();
        if (!state.isInitialized) {
          return;
        }

        const updatedNodes = actionsManager.updateNodeLabel(
          state.nodes,
          nodeId,
          label
        );
        set({ nodes: updatedNodes });
      },

      updateNodeLabelWithLayout: async (nodeId, label) => {
        const state = get();
        if (!state.isInitialized) {
          return;
        }

        try {
          const result = await actionsManager.updateNodeLabelWithLayout(
            state.nodes,
            state.edges,
            state.rootNodeId,
            state.layout,
            nodeId,
            label
          );

          set({
            nodes: result.nodes,
            edges: result.edges,
          });

          // Save history and trigger save
          const actions = get();
          actions.saveToHistory();
          actions.save();
        } catch (error) {
          console.error('Failed to update node label with layout:', error);
        }
      },

      toggleNodeCollapse: async nodeId => {
        const state = get();
        if (!state.isInitialized) {
          return;
        }

        try {
          const result = await actionsManager.toggleNodeCollapse(
            state.nodes,
            state.edges,
            state.rootNodeId,
            state.layout,
            nodeId
          );

          set({
            nodes: result.nodes,
            edges: result.edges,
          });

          // Save history and trigger save
          const actions = get();
          actions.saveToHistory();
          actions.save();
        } catch (error) {
          console.error('Failed to toggle node collapse:', error);
        }
      },

      moveNode: async (nodeId, newParentId, insertIndex) => {
        const state = get();
        if (!state.isInitialized) {
          return;
        }

        try {
          const result = await actionsManager.moveNode(
            state.nodes,
            state.edges,
            state.rootNodeId,
            state.layout,
            nodeId,
            newParentId,
            insertIndex
          );

          set({
            nodes: result.nodes,
            edges: result.edges,
          });

          // Save history and trigger save
          const actions = get();
          actions.saveToHistory();
          actions.save();
        } catch (error) {
          console.error('Failed to move node:', error);
        }
      },

      // Node properties
      updateNodeChatId: (nodeId, chatId) => {
        const state = get();
        if (!state.isInitialized) {
          return;
        }

        const updatedNodes = actionsManager.updateNodeChatId(
          state.nodes,
          nodeId,
          chatId
        );
        set({ nodes: updatedNodes });

        // Save history and trigger immediate save
        const actions = get();
        actions.saveToHistory();
        actions.save();
      },

      updateNodeNotes: (nodeId, notes) => {
        const state = get();
        if (!state.isInitialized) {
          return;
        }

        const updatedNodes = actionsManager.updateNodeNotes(
          state.nodes,
          nodeId,
          notes
        );
        set({ nodes: updatedNodes });

        // Dispatch event to update node panel
        window.dispatchEvent(
          new CustomEvent('mindmap-node-notes-updated', {
            detail: { nodeId, notes },
          })
        );

        // Save history and trigger immediate save
        const actions = get();
        actions.saveToHistory();
        actions.save();
      },

      updateNodeSources: (nodeId, sources) => {
        const state = get();
        if (!state.isInitialized) {
          return;
        }

        const updatedNodes = actionsManager.updateNodeSources(
          state.nodes,
          nodeId,
          sources
        );
        set({ nodes: updatedNodes });

        // Dispatch event to update node panel
        window.dispatchEvent(
          new CustomEvent('mindmap-node-sources-updated', {
            detail: { nodeId, sources },
          })
        );

        // Save history and trigger immediate save
        const actions = get();
        actions.saveToHistory();
        actions.save();
      },

      setNodeColors: (nodeId, colors) => {
        const state = get();
        if (!state.isInitialized) {
          return;
        }

        const updatedNodes = state.nodes.map(node =>
          node.id === nodeId
            ? {
                ...node,
                data: { ...node.data, customColors: colors },
                style: { ...node.style },
              }
            : node
        );

        set({ nodes: updatedNodes });

        // Save history and trigger immediate save
        const actions = get();
        actions.saveToHistory();
        actions.save();
      },

      clearNodeColors: nodeId => {
        const state = get();
        if (!state.isInitialized) {
          return;
        }

        const updatedNodes = state.nodes.map(node =>
          node.id === nodeId
            ? {
                ...node,
                data: { ...node.data, customColors: null },
                style: { ...node.style },
              }
            : node
        );

        set({ nodes: updatedNodes });

        // Save history and trigger immediate save
        const actions = get();
        actions.saveToHistory();
        actions.save();
      },

      // Layout operations
      changeLayout: async newLayout => {
        const state = get();
        if (!state.isInitialized) {
          return;
        }

        try {
          const result = await actionsManager.changeLayout(
            state.nodes,
            state.edges,
            state.rootNodeId,
            newLayout
          );

          set({
            nodes: result.nodes,
            edges: result.edges,
            layout: newLayout,
          });

          // Save history and trigger save
          const actions = get();
          actions.saveToHistory();
          actions.save();
        } catch (error) {
          console.error('Failed to change layout:', error);
        }
      },

      resetLayout: async () => {
        const state = get();
        if (!state.isInitialized) {
          return;
        }

        try {
          const result = await actionsManager.resetLayout(
            state.nodes,
            state.edges,
            state.rootNodeId,
            state.layout
          );

          set({
            nodes: result.nodes,
            edges: result.edges,
          });

          // Save history and trigger save
          const actions = get();
          actions.saveToHistory();
          actions.save();
        } catch (error) {
          console.error('Failed to reset layout:', error);
        }
      },

      // History operations
      undo: () => {
        const state = get();
        if (!state.isInitialized || !state.canUndo()) {
          return;
        }

        set(draft => {
          draft.historyIndex -= 1;
          const previousState = draft.history[draft.historyIndex];
          draft.nodes = previousState.nodes;
          draft.edges = previousState.edges;
          draft.rootNodeId = previousState.rootNodeId;
          draft.layout = previousState.layout;
          draft.selectedNodeId = previousState.selectedNodeId;
        });
      },

      redo: () => {
        const state = get();
        if (!state.isInitialized || !state.canRedo()) {
          return;
        }

        set(draft => {
          draft.historyIndex += 1;
          const nextState = draft.history[draft.historyIndex];
          draft.nodes = nextState.nodes;
          draft.edges = nextState.edges;
          draft.rootNodeId = nextState.rootNodeId;
          draft.layout = nextState.layout;
          draft.selectedNodeId = nextState.selectedNodeId;
        });
      },

      canUndo: () => {
        const state = get();
        return state.historyIndex > 0;
      },

      canRedo: () => {
        const state = get();
        return state.historyIndex < state.history.length - 1;
      },

      saveToHistory: () => {
        const state = get();
        if (!state.isInitialized) {
          return;
        }

        set(draft => {
          const newHistoryState: HistoryState = {
            nodes: JSON.parse(JSON.stringify(state.nodes)),
            edges: JSON.parse(JSON.stringify(state.edges)),
            rootNodeId: state.rootNodeId,
            layout: state.layout,
            selectedNodeId: state.selectedNodeId,
          };

          // Remove any future history if we're not at the end
          if (draft.historyIndex < draft.history.length - 1) {
            draft.history = draft.history.slice(0, draft.historyIndex + 1);
          }

          draft.history.push(newHistoryState);

          // Limit history size
          if (draft.history.length > draft.maxHistorySize) {
            draft.history.shift();
          } else {
            draft.historyIndex += 1;
          }
        });
      },

      // Selection
      selectNode: nodeId => {
        const state = get();
        if (!state.isInitialized) {
          return;
        }

        // Update nodes selection state
        const updatedNodes = state.nodes.map(n => ({
          ...n,
          selected: n.id === nodeId,
        }));

        set({
          selectedNodeId: nodeId,
          nodes: updatedNodes,
        });
      },

      // Generation state
      setGenerating: isGenerating => set({ isGenerating }),
      setGenerationError: generationError => set({ generationError }),
      setGenerationSummary: generationSummary => set({ generationSummary }),
      setGenerationProgress: generationProgress => set({ generationProgress }),

      // Iterative generation
      startIterativeGeneration: async (mindMapId, prompt, selectedNodeId) => {
        const state = get();
        if (state.isGenerating) {
          return;
        }

        set({
          isGenerating: true,
          generationError: null,
          generationSummary: null,
          generationProgress: {
            currentStep: 0,
            maxSteps: 1,
            reasoning: 'Starting iterative reasoning...',
            decision: null,
            isComplete: false,
            tokensPerSecond: 0,
            totalTokens: 0,
          },
          pendingMindmapChanges: 0,
          expectedMindmapChanges: 0,
          generationComplete: false,
          finalGenerationResult: null,
        });

        try {
          // Use SSE streaming to get real backend progress
          const streamResponse = await fetch(
            `/api/mindmaps/${mindMapId}/generate`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                prompt,
                selectedNodeId,
                useAgenticWorkflow: true,
                stream: true,
              }),
            }
          );

          if (!streamResponse.ok) {
            throw new Error('Failed to start streaming generation');
          }

          const streamData = await streamResponse.json();
          const streamId = streamData.streamId;

          if (!streamId) {
            throw new Error('No stream ID received');
          }

          // Subscribe to unified SSE event bus for real progress updates
          let currentStepNumber = 0;
          let completionReceived = false;

          // Helper function to check if generation can complete
          const checkGenerationCompletion = () => {
            const state = get();
            if (state.pendingMindmapChanges === 0 && state.generationComplete) {
              // All changes applied, safe to complete
              if (
                state.finalGenerationResult &&
                typeof state.finalGenerationResult === 'object' &&
                state.finalGenerationResult !== null
              ) {
                const changes = state.finalGenerationResult.changes || [];
                set({
                  generationSummary: `Iterative reasoning completed! Created ${changes.length} node(s) through ${currentStepNumber || 1} reasoning steps.`,
                  isGenerating: false,
                  currentGenerationWorkflowId: null,
                });
              } else {
                set({
                  generationSummary: `Generation completed with ${currentStepNumber || 1} steps.`,
                  isGenerating: false,
                  currentGenerationWorkflowId: null,
                });
              }
            }
          };

          // Track the current generation
          set({
            currentGenerationWorkflowId: streamData.workflowId || streamId,
          });

          const unsubscribe = sseEventBus.subscribe('*', event => {
            if (event.streamId !== streamId) {
              return;
            }

            try {
              // Handle nested data structure from unified SSE - data is already decoded by event bus
              if (typeof event.data !== 'object' || event.data === null) {
                return;
              }
              const eventData = ((event.data as Record<string, unknown>).data ||
                event.data) as SseDecodedData;

              if (
                isSseObject(eventData) &&
                eventData.type === 'mindmap_change' &&
                isSseMindmapChangeData(eventData)
              ) {
                // Real mindmap operation from backend
                currentStepNumber++;

                const actionText =
                  eventData.action === 'create'
                    ? 'Creating node'
                    : eventData.action === 'update'
                      ? 'Updating node'
                      : eventData.action === 'delete'
                        ? 'Deleting node'
                        : 'Processing node';

                set({
                  generationProgress: {
                    currentStep: currentStepNumber,
                    maxSteps: 5,
                    reasoning: `${actionText}: "${eventData.text || 'Untitled'}"`,
                    decision: eventData.action,
                    isComplete: false,
                    tokensPerSecond:
                      get().generationProgress?.tokensPerSecond || 0,
                    totalTokens: get().generationProgress?.totalTokens || 0,
                  },
                });

                // Track this mindmap change
                set(state => ({
                  pendingMindmapChanges: state.pendingMindmapChanges + 1,
                }));

                // Apply the change immediately to the mindmap
                get().applyMindmapChanges([eventData]);

                // Mark this change as complete and check if generation can complete
                set(state => {
                  const newPending = state.pendingMindmapChanges - 1;
                  return {
                    pendingMindmapChanges: newPending,
                  };
                });

                // Check if generation can complete now
                checkGenerationCompletion();
              } else if (
                isSseObject(eventData) &&
                eventData.type === 'progress' &&
                eventData.status
              ) {
                // Handle initial progress updates
                set({
                  generationProgress: {
                    currentStep: 1,
                    maxSteps: 5,
                    reasoning: eventData.status as string,
                    decision: 'starting',
                    isComplete: false,
                    tokensPerSecond: 0,
                    totalTokens: 0,
                  },
                });
              } else if (
                isSseObject(eventData) &&
                eventData.type === 'task_progress' &&
                eventData.task
              ) {
                // Handle task progress updates for reasoning steps
                const task = eventData.task as {
                  id?: string;
                  result?: string;
                  status?: string;
                };
                const stepMatch = task.id?.match(/reasoning-step-(\d+)/);
                if (stepMatch) {
                  const stepNumber = parseInt(stepMatch[1]);
                  set({
                    generationProgress: {
                      currentStep: stepNumber,
                      maxSteps: 5,
                      reasoning: task.result || `Step ${stepNumber}`,
                      decision:
                        task.status === 'completed'
                          ? 'completed'
                          : 'processing',
                      isComplete: false,
                      tokensPerSecond:
                        get().generationProgress?.tokensPerSecond || 0,
                      totalTokens: get().generationProgress?.totalTokens || 0,
                    },
                  });
                }
              } else if (
                isSseObject(eventData) &&
                eventData.type === 'token' &&
                eventData.tokensPerSecond != null
              ) {
                // Handle token progress updates
                const state = get();
                if (
                  state.generationProgress &&
                  !state.generationProgress.isComplete
                ) {
                  set({
                    generationProgress: {
                      ...state.generationProgress,
                      tokensPerSecond: eventData.tokensPerSecond ?? 0,
                      totalTokens: eventData.totalTokens ?? 0,
                    },
                  });
                }
              } else if (
                isSseObject(eventData) &&
                eventData.type === 'complete' &&
                isSseMindmapCompleteData(eventData)
              ) {
                // Store final result and mark generation as complete
                completionReceived = true;
                unsubscribe();

                // Update progress to show completion
                set({
                  generationProgress: {
                    currentStep: currentStepNumber || 1,
                    maxSteps: currentStepNumber || 1,
                    reasoning: `Completed ${currentStepNumber || 1} reasoning steps`,
                    decision: 'completed',
                    isComplete: true,
                    tokensPerSecond:
                      get().generationProgress?.tokensPerSecond || 0,
                    totalTokens: get().generationProgress?.totalTokens || 0,
                  },
                  generationComplete: true,
                  finalGenerationResult: eventData.result,
                });

                // Check if generation can complete now
                checkGenerationCompletion();
              }
            } catch (error) {
              console.error('Failed to parse SSE data:', error);
            }
          });

          // Set up timeout for generation
          setTimeout(() => {
            if (!completionReceived) {
              unsubscribe();
              set({
                generationError: 'Generation timeout',
                isGenerating: false,
                generationProgress: null,
                currentGenerationWorkflowId: null,
              });
            }
          }, 300000); // 5 minute timeout

          // Return a promise that resolves when generation is complete
          return new Promise((resolve, reject) => {
            const checkComplete = () => {
              const state = get();
              if (!state.isGenerating) {
                if (state.generationError) {
                  reject(new Error(state.generationError));
                } else {
                  resolve(undefined);
                }
              } else {
                setTimeout(checkComplete, 100);
              }
            };
            checkComplete();
          });
        } catch (error) {
          console.error('❌ Generation failed:', error);
          set({
            generationError:
              error instanceof Error ? error.message : String(error),
            isGenerating: false,
            generationProgress: null,
          });
        }
      },

      // Cancel iterative generation
      cancelIterativeGeneration: () => {
        const state = get();

        // Tell server to cancel the workflow
        if (state.currentGenerationWorkflowId) {
          fetch(`/api/mindmaps/cancel/${state.currentGenerationWorkflowId}`, {
            method: 'POST',
          }).catch(error => {
            console.warn('Failed to cancel server-side generation:', error);
          });
        }

        // Reset generation state
        set({
          isGenerating: false,
          generationError: 'Generation cancelled by user',
          generationProgress: null,
          currentGenerationWorkflowId: null,
        });
      },

      // Bulk operations
      applyMindmapChanges: async changes => {
        const state = get();
        if (!state.isInitialized) {
          return;
        }

        let updatedNodes = [...state.nodes];

        for (const change of changes) {
          try {
            if (change.action === 'create') {
              // Create new node
              const newNodeData = {
                id: change.nodeId,
                label: change.text,
                isRoot: false,
                parentId: change.parentId,
                notes: change.notes || null,
                sources: (change.sources || []).map((source: any) => ({
                  id:
                    source.id ||
                    `src-${Date.now()}-${Math.random()
                      .toString(36)
                      .substr(2, 9)}`,
                  name: source.name || source.title || 'Untitled Source',
                  directory: source.directory || source.description || '',
                  type: source.type || 'reference',
                })),
                level: 0,
                hasChildren: false,
                isCollapsed: false,
              };

              const newNode = {
                id: change.nodeId,
                type: 'mindMapNode',
                position: { x: 0, y: 0 },
                data: newNodeData,
              };

              updatedNodes.push(newNode);
            } else if (change.action === 'update') {
              // Update existing node
              const nodeIndex = updatedNodes.findIndex(
                n => n.id === change.nodeId
              );
              if (nodeIndex >= 0) {
                const node = updatedNodes[nodeIndex];
                const newData = { ...node.data };

                if (change.text !== undefined) {
                  newData.label = change.text;
                }
                if (change.notes !== undefined) {
                  newData.notes = change.notes;
                }
                if (change.sources !== undefined) {
                  newData.sources = change.sources.map((source: any) => ({
                    id:
                      source.id ||
                      `src-${Date.now()}-${Math.random()
                        .toString(36)
                        .substr(2, 9)}`,
                    name: source.name || source.title || 'Untitled Source',
                    directory: source.directory || source.description || '',
                    type: source.type || 'reference',
                  }));
                }

                updatedNodes[nodeIndex] = { ...node, data: newData };
              }
            } else if (change.action === 'delete') {
              // Delete node and its children
              const deleteNodeAndChildren = (nodeId: string) => {
                const children = updatedNodes.filter(
                  n => n.data.parentId === nodeId
                );
                children.forEach(child => deleteNodeAndChildren(child.id));
                updatedNodes = updatedNodes.filter(n => n.id !== nodeId);
              };
              deleteNodeAndChildren(change.nodeId);
            }
          } catch (error) {
            console.error('Error applying change:', change, error);
          }
        }

        // Update hierarchy levels
        const updateLevels = (nodeId: string, level: number) => {
          const nodeIndex = updatedNodes.findIndex(n => n.id === nodeId);
          if (nodeIndex !== -1) {
            const node = updatedNodes[nodeIndex];
            updatedNodes[nodeIndex] = {
              ...node,
              data: {
                ...node.data,
                level: level,
              },
            };
            const children = updatedNodes.filter(
              n => n.data.parentId === nodeId
            );
            children.forEach(child => updateLevels(child.id, level + 1));
          }
        };
        updateLevels(state.rootNodeId, 0);

        // Update hasChildren flags and ensure isCollapsed is defined
        updatedNodes.forEach((node, index) => {
          const hasChildren = updatedNodes.some(
            n => n.data.parentId === node.id
          );
          const isCollapsed =
            node.data.isCollapsed !== undefined ? node.data.isCollapsed : false;

          updatedNodes[index] = {
            ...node,
            data: {
              ...node.data,
              hasChildren,
              isCollapsed,
            },
          };
        });

        // Apply layout
        const result = await actionsManager.resetLayout(
          updatedNodes,
          dataManager.generateEdges(updatedNodes, state.layout),
          state.rootNodeId,
          state.layout
        );

        // Update state
        set({
          nodes: result.nodes,
          edges: result.edges,
        });

        // Save to history and backend
        const actions = get();
        actions.saveToHistory();
        actions.save();

        // Dispatch events to update node panel content
        changes.forEach(change => {
          if (change.action === 'update' || change.action === 'create') {
            const updatedNode = result.nodes.find(n => n.id === change.nodeId);
            if (updatedNode) {
              if (change.notes !== undefined) {
                window.dispatchEvent(
                  new CustomEvent('mindmap-node-notes-updated', {
                    detail: { nodeId: change.nodeId, notes: change.notes },
                  })
                );
              }

              if (change.sources !== undefined) {
                window.dispatchEvent(
                  new CustomEvent('mindmap-node-sources-updated', {
                    detail: { nodeId: change.nodeId, sources: change.sources },
                  })
                );
              }
            }
          }
        });
      },

      // Utilities
      save: async () => {
        const state = get();
        if (!state.isInitialized || !state.saveCallback || !state.rootNodeId) {
          return;
        }

        try {
          const treeData = dataManager.convertNodesToTree(
            state.nodes,
            state.rootNodeId,
            state.layout
          );
          await state.saveCallback(treeData);
        } catch (error) {
          console.error('Failed to save mind map:', error);
        }
      },

      reset: () => {
        set({
          mindMapId: null,
          nodes: [],
          edges: [],
          rootNodeId: '',
          layout: 'LR',
          selectedNodeId: null,
          isGenerating: false,
          generationError: null,
          generationSummary: null,
          generationProgress: null,
          history: [],
          historyIndex: -1,
          isInitialized: false,
          isInitializing: false,
          saveCallback: null,
          taskEventUnsubscribe: null,
          currentWorkflowId: null,

          currentGenerationWorkflowId: null,
        });
      },

      // SSE connection for task updates
      connectToWorkflow: (workflowId: string) => {
        const state = get();

        // Unsubscribe from any existing workflow events
        if (state.taskEventUnsubscribe) {
          state.taskEventUnsubscribe();
        }

        // Subscribe to task events via event bus
        const unsubscribe = sseEventBus.subscribe(
          'task_completed',
          async (event: { data: any }) => {
            try {
              // Handle nested data structure from unified SSE
              const eventData = event.data.data || event.data;

              if (
                eventData.type === 'task_completed' &&
                eventData.workflowId === workflowId &&
                eventData.result?.changes
              ) {
                // Apply changes directly in the store
                await get().applyMindmapChanges(eventData.result.changes);
              }
            } catch (error) {
              console.error('Failed to apply task changes from SSE:', error);
            }
          }
        );

        set({
          taskEventUnsubscribe: unsubscribe,
          currentWorkflowId: workflowId,
        });
      },

      disconnectFromWorkflow: () => {
        const state = get();

        if (state.taskEventUnsubscribe) {
          state.taskEventUnsubscribe();
        }

        set({
          taskEventUnsubscribe: null,
          currentWorkflowId: null,
        });
      },
    }))
  )
);

// Selector hooks for reactive components
export const useMindMapNodes = () => useMindMapStore(state => state.nodes);
export const useMindMapEdges = () => useMindMapStore(state => state.edges);
export const useMindMapLayout = () => useMindMapStore(state => state.layout);
export const useMindMapSelection = () => {
  const selectedNodeId = useMindMapStore(state => state.selectedNodeId);
  const selectNode = useMindMapStore(state => state.selectNode);

  return useMemo(
    () => ({ selectedNodeId, selectNode }),
    [selectedNodeId, selectNode]
  );
};
export const useMindMapHistory = () => {
  const canUndo = useMindMapStore(state => state.canUndo());
  const canRedo = useMindMapStore(state => state.canRedo());
  const undo = useMindMapStore(state => state.undo);
  const redo = useMindMapStore(state => state.redo);

  return useMemo(
    () => ({ canUndo, canRedo, undo, redo }),
    [canUndo, canRedo, undo, redo]
  );
};
export const useMindMapGeneration = () => {
  const isGenerating = useMindMapStore(state => state.isGenerating);
  const generationError = useMindMapStore(state => state.generationError);
  const generationSummary = useMindMapStore(state => state.generationSummary);
  const generationProgress = useMindMapStore(state => state.generationProgress);
  const setGenerating = useMindMapStore(state => state.setGenerating);
  const setGenerationError = useMindMapStore(state => state.setGenerationError);
  const setGenerationSummary = useMindMapStore(
    state => state.setGenerationSummary
  );
  const setGenerationProgress = useMindMapStore(
    state => state.setGenerationProgress
  );
  const startIterativeGeneration = useMindMapStore(
    state => state.startIterativeGeneration
  );
  const cancelIterativeGeneration = useMindMapStore(
    state => state.cancelIterativeGeneration
  );

  return useMemo(
    () => ({
      isGenerating,
      generationError,
      generationSummary,
      generationProgress,
      setGenerating,
      setGenerationError,
      setGenerationSummary,
      setGenerationProgress,
      startIterativeGeneration,
      cancelIterativeGeneration,
    }),
    [
      isGenerating,
      generationError,
      generationSummary,
      generationProgress,
      setGenerating,
      setGenerationError,
      setGenerationSummary,
      setGenerationProgress,
      startIterativeGeneration,
      cancelIterativeGeneration,
    ]
  );
};
export const useMindMapActions = () => {
  const addChildNode = useMindMapStore(state => state.addChildNode);
  const addSiblingNode = useMindMapStore(state => state.addSiblingNode);
  const deleteNode = useMindMapStore(state => state.deleteNode);
  const updateNodeLabel = useMindMapStore(state => state.updateNodeLabel);
  const updateNodeLabelWithLayout = useMindMapStore(
    state => state.updateNodeLabelWithLayout
  );
  const toggleNodeCollapse = useMindMapStore(state => state.toggleNodeCollapse);
  const moveNode = useMindMapStore(state => state.moveNode);
  const updateNodeChatId = useMindMapStore(state => state.updateNodeChatId);
  const updateNodeNotes = useMindMapStore(state => state.updateNodeNotes);
  const updateNodeSources = useMindMapStore(state => state.updateNodeSources);
  const setNodeColors = useMindMapStore(state => state.setNodeColors);
  const clearNodeColors = useMindMapStore(state => state.clearNodeColors);
  const changeLayout = useMindMapStore(state => state.changeLayout);
  const resetLayout = useMindMapStore(state => state.resetLayout);
  const applyMindmapChanges = useMindMapStore(
    state => state.applyMindmapChanges
  );

  return useMemo(
    () => ({
      addChildNode,
      addSiblingNode,
      deleteNode,
      updateNodeLabel,
      updateNodeLabelWithLayout,
      toggleNodeCollapse,
      moveNode,
      updateNodeChatId,
      updateNodeNotes,
      updateNodeSources,
      setNodeColors,
      clearNodeColors,
      changeLayout,
      resetLayout,
      applyMindmapChanges,
    }),
    [
      addChildNode,
      addSiblingNode,
      deleteNode,
      updateNodeLabel,
      updateNodeLabelWithLayout,
      toggleNodeCollapse,
      moveNode,
      updateNodeChatId,
      updateNodeNotes,
      updateNodeSources,
      setNodeColors,
      clearNodeColors,
      changeLayout,
      resetLayout,
      applyMindmapChanges,
    ]
  );
};
