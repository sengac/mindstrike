import { Workflow } from 'lucide-react';
import type { Workflow as WorkflowType } from '../hooks/useWorkflows';
import { ListPanel } from './shared/ListPanel';

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
  onWorkflowDelete,
}: WorkflowsPanelProps) {
  return (
    <ListPanel
      items={workflows}
      activeItemId={activeWorkflowId}
      onItemSelect={onWorkflowSelect}
      onItemCreate={onWorkflowCreate}
      onItemRename={onWorkflowRename}
      onItemDelete={onWorkflowDelete}
      emptyState={{
        icon: Workflow,
        title: 'No workflows yet',
        subtitle: 'Create a new workflow to begin',
      }}
      createButtonTitle="New workflow"
      renameButtonTitle="Rename workflow"
      deleteButtonTitle="Delete workflow"
      testId="workflows-slider"
    />
  );
}
