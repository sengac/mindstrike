import { useState, useCallback } from 'react';
import { useTaskStore } from '../store/useTaskStore';
import { useDebugStore } from '../store/useDebugStore';

interface TaskBasedGenerationOptions {
  onProgress?: (progress: {
    completed: number;
    total: number;
    currentTask?: string;
  }) => void;
  onComplete?: (result: { totalChanges: number; summary: string }) => void;
  onError?: (error: string) => void;
}

export function useTaskBasedGeneration() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentWorkflowId, setCurrentWorkflowId] = useState<string | null>(
    null
  );

  const taskStore = useTaskStore();
  const { setGenerating } = useDebugStore();

  const startGeneration = useCallback(
    async (
      mindMapId: string,
      prompt: string,
      selectedNodeId: string,
      options: TaskBasedGenerationOptions = {}
    ) => {
      if (isGenerating) {
        return;
      }

      setIsGenerating(true);
      setGenerating(true); // Update debug store
      setCurrentWorkflowId(null);

      try {
        // Step 1: Plan tasks
        const planResponse = await fetch(
          `/api/mindmaps/${mindMapId}/plan-tasks`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, selectedNodeId }),
          }
        );

        if (!planResponse.ok) {
          const errorData = await planResponse.json();
          throw new Error(errorData.error || 'Failed to plan tasks');
        }

        const planResult = await planResponse.json();
        const { workflowId, tasks } = planResult;

        setCurrentWorkflowId(workflowId);

        // Initialize task store
        taskStore.startWorkflow(workflowId, prompt, mindMapId);
        taskStore.setWorkflowTasks(workflowId, tasks);

        // Connect mindmap store to workflow SSE for task completion updates
        const mindMapStore = await import('../store/useMindMapStore');
        mindMapStore.useMindMapStore.getState().connectToWorkflow(workflowId);

        // Step 2: Execute tasks sequentially
        let totalChanges = 0;

        for (let i = 0; i < tasks.length; i++) {
          const task = tasks[i];

          // Update task status to in-progress
          taskStore.updateTaskStatus(workflowId, task.id, 'in-progress');
          taskStore.setCurrentTaskIndex(workflowId, i);

          // Notify progress
          if (options.onProgress) {
            options.onProgress({
              completed: i,
              total: tasks.length,
              currentTask: task.description,
            });
          }

          try {
            // Execute individual task
            const taskResponse = await fetch(
              `/api/mindmaps/${mindMapId}/execute-task`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  taskId: task.id,
                  task,
                  selectedNodeId,
                  workflowId,
                }),
              }
            );

            if (!taskResponse.ok) {
              const errorData = await taskResponse.json();
              throw new Error(errorData.error || `Task ${task.id} failed`);
            }

            const taskResult = await taskResponse.json();

            // Update task status to completed
            taskStore.updateTaskStatus(
              workflowId,
              task.id,
              'completed',
              taskResult.result
            );

            totalChanges += taskResult.result.changes.length;
          } catch (taskError) {
            taskStore.updateTaskStatus(
              workflowId,
              task.id,
              'failed',
              undefined,
              taskError instanceof Error ? taskError.message : String(taskError)
            );

            // Continue with next task instead of failing the entire workflow
            continue;
          }
        }

        // Step 3: Complete workflow
        taskStore.completeWorkflow(workflowId, totalChanges);

        // Disconnect from workflow SSE
        (await import('../store/useMindMapStore')).useMindMapStore
          .getState()
          .disconnectFromWorkflow();

        // Final progress update
        if (options.onProgress) {
          options.onProgress({
            completed: tasks.length,
            total: tasks.length,
          });
        }

        // Completion notification
        if (options.onComplete) {
          options.onComplete({
            totalChanges,
            summary: `Workflow completed! Applied ${totalChanges} change(s) across ${tasks.length} tasks.`,
          });
        }
      } catch (error) {
        if (currentWorkflowId) {
          taskStore.failWorkflow(
            currentWorkflowId,
            error instanceof Error ? error.message : String(error)
          );
        }

        // Disconnect from workflow SSE on error
        (await import('../store/useMindMapStore')).useMindMapStore
          .getState()
          .disconnectFromWorkflow();

        if (options.onError) {
          options.onError(
            error instanceof Error ? error.message : String(error)
          );
        }
      } finally {
        setIsGenerating(false);
        setGenerating(false); // Update debug store
      }
    },
    [isGenerating, taskStore, setGenerating]
  );

  const cancelGeneration = useCallback(async () => {
    if (currentWorkflowId) {
      taskStore.failWorkflow(currentWorkflowId, 'Cancelled by user');
    }

    // Disconnect from workflow SSE on cancel
    (await import('../store/useMindMapStore')).useMindMapStore
      .getState()
      .disconnectFromWorkflow();

    setIsGenerating(false);
    setGenerating(false); // Update debug store
    setCurrentWorkflowId(null);
  }, [currentWorkflowId, taskStore, setGenerating]);

  return {
    isGenerating,
    currentWorkflowId,
    startGeneration,
    cancelGeneration,
  };
}
