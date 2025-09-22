import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  isSseWorkflowStartedData,
  isSseTasksPlannedData,
  isSseTaskProgressData,
  isSseTaskCompletedData,
} from '../utils/sseDecoder';
import { sseEventBus } from '../utils/sseEventBus';
import { SSEEventType } from '../types';

export interface Task {
  id: string;
  type: 'create' | 'update' | 'delete' | 'analyze';
  description: string;
  priority: 'high' | 'medium' | 'low';
  status: 'todo' | 'in-progress' | 'completed' | 'failed';
  nodeId?: string;
  parentId?: string;
  details?: unknown;
  result?: unknown;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface TaskWorkflow {
  id: string;
  originalQuery: string;
  tasks: Task[];
  currentTaskIndex: number;
  status: 'planning' | 'executing' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
  totalChanges: number;
  contextId?: string; // mindmap ID or other context
}

interface TaskState {
  // Current active workflow
  currentWorkflow: TaskWorkflow | null;

  // All workflows (for history/debugging)
  workflows: TaskWorkflow[];

  // Global task queue (for potential future use)
  globalQueue: Task[];

  // SSE Connection
  workflowEventSource: EventSource | null;

  // UI State
  isVisible: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  startWorkflow: (
    id: string,
    originalQuery: string,
    contextId?: string
  ) => void;
  setWorkflowTasks: (workflowId: string, tasks: Task[]) => void;
  updateTaskStatus: (
    workflowId: string,
    taskId: string,
    status: Task['status'],
    result?: unknown,
    error?: string
  ) => void;
  setCurrentTaskIndex: (workflowId: string, index: number) => void;
  completeWorkflow: (workflowId: string, totalChanges: number) => void;
  failWorkflow: (workflowId: string, error: string) => void;
  clearCurrentWorkflow: () => void;

  // Global queue actions
  addToGlobalQueue: (task: Task) => void;
  removeFromGlobalQueue: (taskId: string) => void;
  clearGlobalQueue: () => void;

  // UI actions
  setVisible: (visible: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // SSE actions
  connectWorkflowSSE: () => void;
  disconnectWorkflowSSE: () => void;

  // Utilities
  getWorkflowProgress: (workflowId: string) => {
    completed: number;
    total: number;
    percentage: number;
  };
  getActiveTask: () => Task | null;
}

export const useTaskStore = create<TaskState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    currentWorkflow: null,
    workflows: [],
    globalQueue: [],
    workflowEventSource: null,
    isVisible: false,
    isLoading: false,
    error: null,

    // Actions
    startWorkflow: (id: string, originalQuery: string, contextId?: string) => {
      const workflow: TaskWorkflow = {
        id,
        originalQuery,
        tasks: [],
        currentTaskIndex: 0,
        status: 'planning',
        createdAt: new Date(),
        totalChanges: 0,
        contextId,
      };

      set(state => ({
        currentWorkflow: workflow,
        workflows: [...state.workflows, workflow],
        isVisible: true,
        error: null,
      }));
    },

    setWorkflowTasks: (workflowId: string, tasks: Task[]) => {
      set(state => {
        const updatedWorkflows = state.workflows.map(workflow =>
          workflow.id === workflowId
            ? { ...workflow, tasks, status: 'executing' as const }
            : workflow
        );

        const currentWorkflow =
          state.currentWorkflow?.id === workflowId
            ? { ...state.currentWorkflow, tasks, status: 'executing' as const }
            : state.currentWorkflow;

        return {
          workflows: updatedWorkflows,
          currentWorkflow,
        };
      });
    },

    updateTaskStatus: (
      workflowId: string,
      taskId: string,
      status: Task['status'],
      result?: unknown,
      error?: string
    ) => {
      set(state => {
        const updateTask = (task: Task): Task => {
          if (task.id === taskId) {
            return {
              ...task,
              status,
              result,
              error,
              completedAt:
                status === 'completed' || status === 'failed'
                  ? new Date()
                  : task.completedAt,
            };
          }
          return task;
        };

        const updatedWorkflows = state.workflows.map(workflow => {
          if (workflow.id === workflowId) {
            return {
              ...workflow,
              tasks: workflow.tasks.map(updateTask),
            };
          }
          return workflow;
        });

        const currentWorkflow =
          state.currentWorkflow?.id === workflowId
            ? {
                ...state.currentWorkflow,
                tasks: state.currentWorkflow.tasks.map(updateTask),
              }
            : state.currentWorkflow;

        return {
          workflows: updatedWorkflows,
          currentWorkflow,
        };
      });
    },

    setCurrentTaskIndex: (workflowId: string, index: number) => {
      set(state => {
        const updatedWorkflows = state.workflows.map(workflow =>
          workflow.id === workflowId
            ? { ...workflow, currentTaskIndex: index }
            : workflow
        );

        const currentWorkflow =
          state.currentWorkflow?.id === workflowId
            ? { ...state.currentWorkflow, currentTaskIndex: index }
            : state.currentWorkflow;

        return {
          workflows: updatedWorkflows,
          currentWorkflow,
        };
      });
    },

    completeWorkflow: (workflowId: string, totalChanges: number) => {
      set(state => {
        let updatedWorkflows = [...state.workflows];
        let currentWorkflow = state.currentWorkflow;

        // If completing the current workflow, move it to workflows array and clear current
        if (state.currentWorkflow?.id === workflowId) {
          const completedWorkflow = {
            ...state.currentWorkflow,
            status: 'completed' as const,
            completedAt: new Date(),
            totalChanges,
          };

          // Add to workflows array if not already there
          if (!updatedWorkflows.some(w => w.id === workflowId)) {
            updatedWorkflows.push(completedWorkflow);
          } else {
            // Update existing workflow in array
            updatedWorkflows = updatedWorkflows.map(workflow =>
              workflow.id === workflowId ? completedWorkflow : workflow
            );
          }

          // Clear current workflow
          currentWorkflow = null;
        } else {
          // Update workflow in workflows array
          updatedWorkflows = updatedWorkflows.map(workflow =>
            workflow.id === workflowId
              ? {
                  ...workflow,
                  status: 'completed' as const,
                  completedAt: new Date(),
                  totalChanges,
                }
              : workflow
          );
        }

        return {
          workflows: updatedWorkflows,
          currentWorkflow,
          isLoading: false,
        };
      });
    },

    failWorkflow: (workflowId: string, error: string) => {
      set(state => {
        let updatedWorkflows = [...state.workflows];
        let currentWorkflow = state.currentWorkflow;

        // If failing the current workflow, move it to workflows array and clear current
        if (state.currentWorkflow?.id === workflowId) {
          const failedWorkflow = {
            ...state.currentWorkflow,
            status: 'failed' as const,
            completedAt: new Date(),
          };

          // Add to workflows array if not already there
          if (!updatedWorkflows.some(w => w.id === workflowId)) {
            updatedWorkflows.push(failedWorkflow);
          } else {
            // Update existing workflow in array
            updatedWorkflows = updatedWorkflows.map(workflow =>
              workflow.id === workflowId ? failedWorkflow : workflow
            );
          }

          // Clear current workflow
          currentWorkflow = null;
        } else {
          // Update workflow in workflows array
          updatedWorkflows = updatedWorkflows.map(workflow =>
            workflow.id === workflowId
              ? {
                  ...workflow,
                  status: 'failed' as const,
                  completedAt: new Date(),
                }
              : workflow
          );
        }

        return {
          workflows: updatedWorkflows,
          currentWorkflow,
          error,
          isLoading: false,
        };
      });
    },

    clearCurrentWorkflow: () => {
      set({
        currentWorkflow: null,
        isVisible: false,
        error: null,
        isLoading: false,
      });
    },

    // Global queue actions
    addToGlobalQueue: (task: Task) => {
      set(state => ({
        globalQueue: [...state.globalQueue, task],
      }));
    },

    removeFromGlobalQueue: (taskId: string) => {
      set(state => ({
        globalQueue: state.globalQueue.filter(task => task.id !== taskId),
      }));
    },

    clearGlobalQueue: () => {
      set({ globalQueue: [] });
    },

    // UI actions
    setVisible: (isVisible: boolean) => set({ isVisible }),
    setLoading: (isLoading: boolean) => set({ isLoading }),
    setError: (error: string | null) => set({ error }),

    // SSE actions (deprecated - now handled globally)
    connectWorkflowSSE: () => {
      // No-op - SSE is now connected globally
    },

    disconnectWorkflowSSE: () => {
      // No-op - SSE connection is maintained globally
    },

    // Utilities
    getWorkflowProgress: (workflowId: string) => {
      const state = get();
      const workflow =
        state.workflows.find(w => w.id === workflowId) || state.currentWorkflow;

      if (!workflow) {
        return { completed: 0, total: 0, percentage: 0 };
      }

      const completed = workflow.tasks.filter(
        t => t.status === 'completed'
      ).length;
      const total = workflow.tasks.length;
      const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

      return { completed, total, percentage };
    },

    getActiveTask: () => {
      const state = get();
      if (!state.currentWorkflow) return null;

      const currentTask =
        state.currentWorkflow.tasks[state.currentWorkflow.currentTaskIndex];
      return currentTask || null;
    },
  }))
);

// Global SSE listener that runs immediately when the module loads
let sseInitialized = false;
let taskUnsubscribeFunctions: (() => void)[] = [];

async function initializeTaskEventSubscriptions() {
  if (taskUnsubscribeFunctions.length > 0) {
    return; // Already subscribed
  }

  const handleTaskEvent = async (event: { data: any }) => {
    try {
      // Handle nested data structure from unified SSE - data is already decoded by event bus
      const data = event.data.data || event.data;

      switch (data.type) {
        case 'workflow_started':
          if (isSseWorkflowStartedData(data)) {
            useTaskStore
              .getState()
              .startWorkflow(
                data.workflowId,
                data.originalQuery || '',
                data.contextId
              );
          }
          break;

        case 'tasks_planned':
          if (isSseTasksPlannedData(data)) {
            const tasks: Task[] = data.tasks.map((task: any) => ({
              id: task.id,
              type: 'analyze' as const,
              description: task.description,
              priority:
                (task.priority as 'high' | 'medium' | 'low') || 'medium',
              status:
                (task.status as
                  | 'todo'
                  | 'in-progress'
                  | 'completed'
                  | 'failed') || 'todo',
              createdAt: new Date(),
            }));
            useTaskStore
              .getState()
              .setWorkflowTasks(data.workflowId || '', tasks);
          }
          break;

        case 'task_progress':
          if (isSseTaskProgressData(data)) {
            useTaskStore
              .getState()
              .updateTaskStatus(
                data.workflowId || '',
                data.task.id,
                data.task.status as
                  | 'todo'
                  | 'in-progress'
                  | 'completed'
                  | 'failed',
                data.task.result,
                data.task.error
              );
          }
          break;

        case 'task_completed':
          if (isSseTaskCompletedData(data)) {
            useTaskStore
              .getState()
              .updateTaskStatus(
                data.workflowId || '',
                data.task.id,
                'completed',
                data.task.result,
                data.task.error
              );
          }
          break;

        case 'workflow_completed':
          useTaskStore
            .getState()
            .completeWorkflow(
              data.workflowId || '',
              typeof data.totalChanges === 'number' ? data.totalChanges : 0
            );
          break;

        case 'workflow_failed':
          useTaskStore
            .getState()
            .failWorkflow(
              data.workflowId || '',
              typeof data.error === 'string' ? data.error : 'Unknown error'
            );
          break;
      }
    } catch (error) {
      console.error('Error parsing workflow SSE message:', error);
    }
  };

  // Subscribe to task-related events via event bus
  const unsubscribeWorkflowStarted = sseEventBus.subscribe(
    SSEEventType.WORKFLOW_STARTED,
    handleTaskEvent
  );
  taskUnsubscribeFunctions.push(unsubscribeWorkflowStarted);

  const unsubscribeTasksPlanned = sseEventBus.subscribe(
    SSEEventType.TASKS_PLANNED,
    handleTaskEvent
  );
  taskUnsubscribeFunctions.push(unsubscribeTasksPlanned);

  const unsubscribeTaskProgress = sseEventBus.subscribe(
    SSEEventType.TASK_PROGRESS,
    handleTaskEvent
  );
  taskUnsubscribeFunctions.push(unsubscribeTaskProgress);

  const unsubscribeTaskCompleted = sseEventBus.subscribe(
    SSEEventType.TASK_COMPLETED,
    handleTaskEvent
  );
  taskUnsubscribeFunctions.push(unsubscribeTaskCompleted);

  const unsubscribeWorkflowCompleted = sseEventBus.subscribe(
    SSEEventType.WORKFLOW_COMPLETED,
    handleTaskEvent
  );
  taskUnsubscribeFunctions.push(unsubscribeWorkflowCompleted);

  const unsubscribeWorkflowFailed = sseEventBus.subscribe(
    SSEEventType.WORKFLOW_FAILED,
    handleTaskEvent
  );
  taskUnsubscribeFunctions.push(unsubscribeWorkflowFailed);
}

// Initialize SSE connection when the module loads
async function initializeWorkflowSSE() {
  if (!sseInitialized) {
    sseInitialized = true;
    // Small delay to ensure server is ready
    setTimeout(async () => {
      await initializeTaskEventSubscriptions();
    }, 1000);
  }
}

// Start the global SSE connection
initializeWorkflowSSE();
