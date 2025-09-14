import { useState, useCallback } from 'react';
import { useTaskStore } from '../store/useTaskStore';

interface TaskBasedGenerationOptions {
  onProgress?: (progress: { completed: number; total: number; currentTask?: string }) => void;
  onComplete?: (result: { totalChanges: number; summary: string }) => void;
  onError?: (error: string) => void;
}

interface Task {
  id: string;
  type: string;
  description: string;
  priority: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
}

export function useTaskBasedGeneration() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentWorkflowId, setCurrentWorkflowId] = useState<string | null>(null);
  
  const taskStore = useTaskStore();

  const startGeneration = useCallback(async (
    mindMapId: string,
    prompt: string,
    selectedNodeId: string,
    options: TaskBasedGenerationOptions = {}
  ) => {
    if (isGenerating) {
      console.warn('Already generating, ignoring new request');
      return;
    }

    setIsGenerating(true);
    setCurrentWorkflowId(null);

    try {
      // Step 1: Plan tasks
      console.log('🔍 Planning tasks for:', prompt);
      const planResponse = await fetch(`/api/mindmaps/${mindMapId}/plan-tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, selectedNodeId })
      });

      if (!planResponse.ok) {
        const errorData = await planResponse.json();
        throw new Error(errorData.error || 'Failed to plan tasks');
      }

      const planResult = await planResponse.json();
      const { workflowId, tasks } = planResult;
      
      console.log('📋 Tasks planned:', tasks.length, 'tasks for workflow:', workflowId);
      setCurrentWorkflowId(workflowId);

      // Initialize task store
      taskStore.startWorkflow(workflowId, prompt, mindMapId);
      taskStore.setWorkflowTasks(workflowId, tasks);

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
            currentTask: task.description
          });
        }

        try {
          console.log(`🔄 Executing task ${i + 1}/${tasks.length}:`, task.description);
          
          // Execute individual task
          const taskResponse = await fetch(`/api/mindmaps/${mindMapId}/execute-task`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              taskId: task.id,
              task,
              selectedNodeId,
              workflowId
            })
          });

          if (!taskResponse.ok) {
            const errorData = await taskResponse.json();
            throw new Error(errorData.error || `Task ${task.id} failed`);
          }

          const taskResult = await taskResponse.json();
          console.log('✅ Task completed:', task.id, 'changes:', taskResult.result.changes.length);
          
          // Update task status to completed
          taskStore.updateTaskStatus(workflowId, task.id, 'completed', taskResult.result);
          
          totalChanges += taskResult.result.changes.length;

        } catch (taskError) {
          console.error('❌ Task failed:', task.id, taskError);
          taskStore.updateTaskStatus(workflowId, task.id, 'failed', undefined, taskError instanceof Error ? taskError.message : String(taskError));
          
          // Continue with next task instead of failing the entire workflow
          continue;
        }
      }

      // Step 3: Complete workflow
      taskStore.completeWorkflow(workflowId, totalChanges);
      
      // Final progress update
      if (options.onProgress) {
        options.onProgress({
          completed: tasks.length,
          total: tasks.length
        });
      }

      // Completion notification
      if (options.onComplete) {
        options.onComplete({
          totalChanges,
          summary: `Workflow completed! Applied ${totalChanges} change(s) across ${tasks.length} tasks.`
        });
      }

      console.log('🎉 Workflow completed:', workflowId, 'total changes:', totalChanges);

    } catch (error) {
      console.error('💥 Generation failed:', error);
      
      if (currentWorkflowId) {
        taskStore.failWorkflow(currentWorkflowId, error instanceof Error ? error.message : String(error));
      }
      
      if (options.onError) {
        options.onError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setIsGenerating(false);
    }
  }, [isGenerating, taskStore]);

  const cancelGeneration = useCallback(() => {
    if (currentWorkflowId) {
      taskStore.failWorkflow(currentWorkflowId, 'Cancelled by user');
    }
    setIsGenerating(false);
    setCurrentWorkflowId(null);
  }, [currentWorkflowId, taskStore]);

  return {
    isGenerating,
    currentWorkflowId,
    startGeneration,
    cancelGeneration
  };
}
