import React from 'react';
import { Workflow } from 'lucide-react';
import { Workflow as WorkflowType } from '../hooks/useWorkflows';

interface WorkflowsViewProps {
  activeWorkflow: WorkflowType | null;
}

export function WorkflowsView({ activeWorkflow }: WorkflowsViewProps) {
  return (
    <div className="flex-1 flex flex-col bg-gray-900 p-6">
      {activeWorkflow ? (
        <div className="flex flex-col h-full">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-white mb-2">{activeWorkflow.name}</h2>
            {activeWorkflow.description && (
              <p className="text-gray-400">{activeWorkflow.description}</p>
            )}
            <p className="text-sm text-gray-500 mt-2">
              Created: {activeWorkflow.createdAt.toLocaleDateString()} | 
              Last updated: {activeWorkflow.updatedAt.toLocaleDateString()}
            </p>
          </div>
          
          <div className="flex-1 bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <Workflow size={48} className="mx-auto mb-4 opacity-50" />
                <p className="text-lg">Workflow content will be displayed here</p>
                <p className="text-sm mt-2">This is where you can design and configure your workflow</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center h-full text-gray-500">
          <div className="text-center">
            <Workflow size={48} className="mx-auto mb-4 opacity-50" />
            <p className="text-lg">Select a workflow to get started</p>
            <p className="text-sm mt-2">Choose from the list on the left or create a new workflow</p>
          </div>
        </div>
      )}
    </div>
  );
}
