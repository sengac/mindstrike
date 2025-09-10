import React, { useState } from 'react';
import { Edit2, Trash2, Plus, Workflow } from 'lucide-react';
import { Workflow as WorkflowType } from '../hooks/useWorkflows';
import { clsx } from 'clsx';

interface WorkflowsPanelProps {
  workflows: WorkflowType[];
  activeWorkflowId?: string;
  onWorkflowSelect: (workflowId: string) => void;
  onWorkflowCreate: () => void;
  onWorkflowRename: (workflowId: string, newName: string) => void;
  onWorkflowDelete: (workflowId: string) => void;
}

export function WorkflowsPanel({
  workflows,
  activeWorkflowId,
  onWorkflowSelect,
  onWorkflowCreate,
  onWorkflowRename,
  onWorkflowDelete
}: WorkflowsPanelProps) {
  const [editingWorkflowId, setEditingWorkflowId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [hoveredWorkflowId, setHoveredWorkflowId] = useState<string | null>(null);

  const handleStartEdit = (workflow: WorkflowType) => {
    setEditingWorkflowId(workflow.id);
    setEditingName(workflow.name);
  };

  const handleSaveEdit = () => {
    if (editingWorkflowId && editingName.trim()) {
      onWorkflowRename(editingWorkflowId, editingName.trim());
    }
    setEditingWorkflowId(null);
    setEditingName('');
  };

  const handleCancelEdit = () => {
    setEditingWorkflowId(null);
    setEditingName('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  return (
    <div className="w-[20%] min-w-[200px] max-w-[500px] bg-gray-800 border-r border-gray-700 flex flex-col relative">
      {/* Workflows List */}
      <div className="flex-1 overflow-y-auto">
        {workflows.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            <Workflow size={24} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No workflows yet</p>
            <p className="text-xs mt-1">Create a new workflow to begin</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {workflows.map((workflow) => (
              <div
                key={workflow.id}
                className={clsx(
                  'group relative p-3 rounded-lg cursor-pointer transition-colors',
                  'hover:bg-gray-700',
                  activeWorkflowId === workflow.id ? 'bg-gray-700 border border-blue-500' : 'border border-transparent'
                )}
                onMouseEnter={() => setHoveredWorkflowId(workflow.id)}
                onMouseLeave={() => setHoveredWorkflowId(null)}
                onClick={() => !editingWorkflowId && onWorkflowSelect(workflow.id)}
              >
                {editingWorkflowId === workflow.id ? (
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={handleSaveEdit}
                    className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    autoFocus
                  />
                ) : (
                  <>
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-medium text-gray-200 truncate">
                            {workflow.name}
                          </h3>
                        </div>
                        {workflow.description && (
                          <p className="text-xs text-gray-400 mt-1 line-cl-2">
                            {workflow.description}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(workflow.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                      
                      {hoveredWorkflowId === workflow.id && (
                        <div className="flex items-center space-x-1 ml-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEdit(workflow);
                            }}
                            className="p-1 hover:bg-gray-600 rounded text-gray-400 hover:text-gray-200 transition-colors"
                            title="Rename workflow"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onWorkflowDelete(workflow.id);
                            }}
                            className="p-1 hover:bg-gray-600 rounded text-gray-400 hover:text-red-400 transition-colors"
                            title="Delete workflow"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating New Workflow Button */}
      <button
        onClick={onWorkflowCreate}
        className="absolute bottom-4 right-4 p-3 bg-blue-600 hover:bg-blue-700 rounded-full shadow-lg transition-colors text-white z-10"
        title="New workflow"
      >
        <Plus size={20} />
      </button>
    </div>
  );
}
