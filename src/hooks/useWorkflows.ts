import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export function useWorkflows() {
  const workspaceVersion = useAppStore((state) => state.workspaceVersion);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const loadWorkflows = useCallback(async () => {
    try {
      const response = await fetch('/api/workflows');
      if (response.ok) {
        const data = await response.json();
        const parsedWorkflows = data.map((workflow: any) => ({
          ...workflow,
          createdAt: new Date(workflow.createdAt),
          updatedAt: new Date(workflow.updatedAt)
        }));
        setWorkflows(parsedWorkflows);
        
        // Set the most recently updated workflow as active
        if (parsedWorkflows.length > 0) {
          const mostRecent = parsedWorkflows.sort((a: Workflow, b: Workflow) => 
            b.updatedAt.getTime() - a.updatedAt.getTime()
          )[0];
          setActiveWorkflowId(mostRecent.id);
        }
      }
    } catch (error) {
      console.error('Failed to load workflows from file:', error);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Load workflows from mindstrike-workflows.json file on mount and when workspace changes
  useEffect(() => {
    loadWorkflows();
  }, [loadWorkflows, workspaceVersion]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Save workflows to mindstrike-workflows.json file with debouncing
  const saveWorkflows = useCallback(async (workflowsToSave: Workflow[]) => {
    // Clear any existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce the save operation
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch('/api/workflows', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(workflowsToSave)
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
      } catch (error) {
        console.error('Failed to save workflows to file:', error);
      }
    }, 500);
  }, []);

  const createWorkflow = useCallback(async (name?: string): Promise<string> => {
    const newWorkflow: Workflow = {
      id: Date.now().toString(),
      name: name || `Workflow ${workflows.length + 1}`,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const updatedWorkflows = [newWorkflow, ...workflows];
    setWorkflows(updatedWorkflows);
    setActiveWorkflowId(newWorkflow.id);
    await saveWorkflows(updatedWorkflows);
    
    return newWorkflow.id;
  }, [workflows, saveWorkflows]);

  const deleteWorkflow = useCallback(async (workflowId: string) => {
    const updatedWorkflows = workflows.filter(w => w.id !== workflowId);
    setWorkflows(updatedWorkflows);
    
    if (activeWorkflowId === workflowId) {
      const newActiveId = updatedWorkflows.length > 0 ? updatedWorkflows[0].id : null;
      setActiveWorkflowId(newActiveId);
    }
    
    await saveWorkflows(updatedWorkflows);
  }, [workflows, activeWorkflowId, saveWorkflows]);

  const renameWorkflow = useCallback(async (workflowId: string, newName: string) => {
    const updatedWorkflows = workflows.map(workflow =>
      workflow.id === workflowId
        ? { ...workflow, name: newName, updatedAt: new Date() }
        : workflow
    );
    setWorkflows(updatedWorkflows);
    await saveWorkflows(updatedWorkflows);
  }, [workflows, saveWorkflows]);

  const getActiveWorkflow = useCallback(() => {
    return workflows.find(w => w.id === activeWorkflowId) || null;
  }, [workflows, activeWorkflowId]);

  const selectWorkflow = useCallback(async (workflowId: string) => {
    setActiveWorkflowId(workflowId);
  }, []);

  return {
    workflows,
    activeWorkflowId,
    activeWorkflow: getActiveWorkflow(),
    isLoaded,
    loadWorkflows,
    createWorkflow,
    deleteWorkflow,
    renameWorkflow,
    selectWorkflow
  };
}
