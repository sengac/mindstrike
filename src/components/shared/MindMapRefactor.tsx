import { useState } from 'react';
import { Plus, Edit2, Trash2, Save, X } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';
import { logger } from '../../utils/logger';

interface MindMapRefactorProps {
  nodeId: string;
  nodeLabel: string;
  onNodeAdd?: (parentId: string, text: string) => Promise<void>;
  onNodeUpdate?: (nodeId: string, text: string) => Promise<void>;
  onNodeDelete?: (nodeId: string) => Promise<void>;
}

export function MindMapRefactor({
  nodeId,
  nodeLabel,
  onNodeAdd,
  onNodeUpdate,
  onNodeDelete,
}: MindMapRefactorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedLabel, setEditedLabel] = useState(nodeLabel);
  const [newChildText, setNewChildText] = useState('');
  const [isAddingChild, setIsAddingChild] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleUpdateNode = async () => {
    if (!onNodeUpdate || editedLabel.trim() === nodeLabel) {
      setIsEditing(false);
      return;
    }

    setIsLoading(true);
    try {
      await onNodeUpdate(nodeId, editedLabel.trim());
      setIsEditing(false);
    } catch (error) {
      logger.error('Failed to update node:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddChild = async () => {
    if (!onNodeAdd || !newChildText.trim()) {
      setIsAddingChild(false);
      setNewChildText('');
      return;
    }

    setIsLoading(true);
    try {
      await onNodeAdd(nodeId, newChildText.trim());
      setNewChildText('');
      setIsAddingChild(false);
    } catch (error) {
      logger.error('Failed to add child node:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteNode = () => {
    if (!onNodeDelete) {
      return;
    }
    setShowDeleteConfirm(true);
  };

  const confirmDeleteNode = async () => {
    if (!onNodeDelete) {
      return;
    }

    setIsLoading(true);
    try {
      await onNodeDelete(nodeId);
    } catch (error) {
      logger.error('Failed to delete node:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setEditedLabel(nodeLabel);
    setIsEditing(false);
  };

  const handleCancelAdd = () => {
    setNewChildText('');
    setIsAddingChild(false);
  };

  return (
    <div className="flex flex-col h-full p-4 space-y-4">
      <div className="flex-shrink-0">
        <h3 className="text-lg font-medium text-white mb-4">
          Refactor MindMap
        </h3>

        {/* Current Node Section */}
        <div className="bg-gray-800 rounded-lg p-4 mb-4">
          <h4 className="text-sm font-medium text-gray-300 mb-3">
            Current Node
          </h4>

          {isEditing ? (
            <div className="space-y-3">
              <input
                type="text"
                value={editedLabel}
                onChange={e => setEditedLabel(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Node text..."
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    handleUpdateNode();
                  } else if (e.key === 'Escape') {
                    handleCancelEdit();
                  }
                }}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleUpdateNode}
                  disabled={isLoading}
                  className="flex items-center gap-2 px-3 py-1 bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white rounded text-sm font-medium transition-colors"
                >
                  <Save size={14} />
                  Save
                </button>
                <button
                  onClick={handleCancelEdit}
                  disabled={isLoading}
                  className="flex items-center gap-2 px-3 py-1 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-800 text-white rounded text-sm font-medium transition-colors"
                >
                  <X size={14} />
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-white font-medium">{nodeLabel}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsEditing(true)}
                  disabled={isLoading}
                  className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded text-sm font-medium transition-colors"
                  title="Edit node text"
                >
                  <Edit2 size={12} />
                  Edit
                </button>
                {onNodeDelete && (
                  <button
                    onClick={handleDeleteNode}
                    disabled={isLoading}
                    className="flex items-center gap-1 px-2 py-1 bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white rounded text-sm font-medium transition-colors"
                    title="Delete this node"
                  >
                    <Trash2 size={12} />
                    Delete
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Add Child Node Section */}
        {onNodeAdd && (
          <div className="bg-gray-800 rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-300 mb-3">
              Add Child Node
            </h4>

            {isAddingChild ? (
              <div className="space-y-3">
                <input
                  type="text"
                  value={newChildText}
                  onChange={e => setNewChildText(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="New child node text..."
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      handleAddChild();
                    } else if (e.key === 'Escape') {
                      handleCancelAdd();
                    }
                  }}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleAddChild}
                    disabled={isLoading || !newChildText.trim()}
                    className="flex items-center gap-2 px-3 py-1 bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white rounded text-sm font-medium transition-colors"
                  >
                    <Save size={14} />
                    Add
                  </button>
                  <button
                    onClick={handleCancelAdd}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-3 py-1 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-800 text-white rounded text-sm font-medium transition-colors"
                  >
                    <X size={14} />
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsAddingChild(true)}
                disabled={isLoading}
                className="flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 text-white rounded text-sm font-medium transition-colors w-full justify-center"
              >
                <Plus size={16} />
                Add Child Node
              </button>
            )}
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="bg-gray-800 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-300 mb-3">
            Instructions
          </h4>
          <div className="text-sm text-gray-400 space-y-2">
            <p>Use this tab to modify your mind map structure:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>
                <strong>Edit:</strong> Change the text of the current node
              </li>
              <li>
                <strong>Add Child:</strong> Create a new child node under the
                current node
              </li>
              <li>
                <strong>Delete:</strong> Remove the current node and all its
                children
              </li>
            </ul>
            <p className="mt-3 text-xs text-gray-500">
              Changes are applied immediately to your mind map. Use keyboard
              shortcuts:
              <br />• Enter to save • Escape to cancel
            </p>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDeleteNode}
        title="Delete Node"
        message={`Are you sure you want to delete the node "${nodeLabel}"? This action cannot be undone and will remove all child nodes as well.`}
        confirmText="Delete Node"
        type="danger"
        icon={<Trash2 size={20} />}
      />
    </div>
  );
}
