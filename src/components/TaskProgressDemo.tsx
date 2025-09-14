import React, { useState, useEffect } from 'react';
import { TaskProgress } from './TaskProgress';
import { useTaskStore } from '../store/useTaskStore';

/**
 * Demo component to simulate the agentic workflow for testing
 */
export const TaskProgressDemo: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const taskStore = useTaskStore();

  const runDemo = async () => {
    if (isRunning) return;
    
    setIsRunning(true);
    
    // Simulate agentic workflow
    const workflowId = `demo-${Date.now()}`;
    const mockQuery = "Add comprehensive information about machine learning including supervised learning, unsupervised learning, and deep learning with examples and code snippets";
    
    // Start workflow
    taskStore.startWorkflow(workflowId, mockQuery, 'demo-mindmap');
    
    // Add demo tasks
    const demoTasks = [
      {
        id: `task-${Date.now()}-0`,
        type: 'create' as const,
        description: 'Add main topic node for machine learning',
        priority: 'high' as const,
        status: 'todo' as const,
        createdAt: new Date()
      },
      {
        id: `task-${Date.now()}-1`,
        type: 'create' as const,
        description: 'Add supervised learning subtopic with examples',
        priority: 'medium' as const,
        status: 'todo' as const,
        createdAt: new Date()
      },
      {
        id: `task-${Date.now()}-2`,
        type: 'create' as const,
        description: 'Add unsupervised learning subtopic with examples',
        priority: 'medium' as const,
        status: 'todo' as const,
        createdAt: new Date()
      },
      {
        id: `task-${Date.now()}-3`,
        type: 'create' as const,
        description: 'Add deep learning subtopic with neural network examples',
        priority: 'medium' as const,
        status: 'todo' as const,
        createdAt: new Date()
      }
    ];

    taskStore.setWorkflowTasks(workflowId, demoTasks);

    // Simulate task execution
    for (let i = 0; i < demoTasks.length; i++) {
      const task = demoTasks[i];
      
      // Set current task index
      taskStore.setCurrentTaskIndex(workflowId, i);
      
      // Set task to in-progress
      taskStore.updateTaskStatus(workflowId, task.id, 'in-progress');
      
      // Simulate work time
      await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
      
      // Complete task (90% success rate)
      if (Math.random() > 0.1) {
        taskStore.updateTaskStatus(workflowId, task.id, 'completed', {
          changes: [{ action: 'create', nodeId: `node-${i}`, text: `Demo Node ${i}` }]
        });
      } else {
        taskStore.updateTaskStatus(workflowId, task.id, 'failed', undefined, 'Simulated random failure');
      }
    }

    // Complete workflow
    const completedTasks = demoTasks.filter((_, i) => Math.random() > 0.1).length;
    taskStore.completeWorkflow(workflowId, completedTasks * 2); // 2 changes per task
    
    setIsRunning(false);
  };

  const clearDemo = () => {
    taskStore.clearCurrentWorkflow();
    setIsRunning(false);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
          Agentic Workflow Demo
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          This demo simulates the new agentic mindmap workflow that breaks down complex requests into individual tasks and executes them step-by-step.
        </p>
        
        <div className="flex space-x-4">
          <button
            onClick={runDemo}
            disabled={isRunning}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
          >
            {isRunning ? 'Running Demo...' : 'Start Workflow Demo'}
          </button>
          
          <button
            onClick={clearDemo}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
          >
            Clear Demo
          </button>
        </div>
      </div>

      {/* Task Progress Component */}
      {taskStore.currentWorkflow && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <TaskProgress workflowId={taskStore.currentWorkflow.id} />
        </div>
      )}

      {/* Demo Info */}
      <div className="mt-6 p-4 bg-gray-100 dark:bg-gray-700 rounded-lg">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          How the Agentic Workflow Works:
        </h3>
        <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
          <li>• <strong>Task Decomposition:</strong> Complex queries are broken into specific, actionable tasks</li>
          <li>• <strong>Iterative Execution:</strong> Each task is executed individually with updated context</li>
          <li>• <strong>Progress Tracking:</strong> Real-time TODO list visible to users during generation</li>
          <li>• <strong>Error Handling:</strong> Failed tasks don't prevent other tasks from completing</li>
          <li>• <strong>Contextual Updates:</strong> Each task sees the updated mindmap state from previous tasks</li>
        </ul>
      </div>
    </div>
  );
};

export default TaskProgressDemo;
