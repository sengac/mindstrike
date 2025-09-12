import { forwardRef, useState, useEffect } from 'react';
import { MessageSquare, X, StickyNote } from 'lucide-react';
import { Thread } from '../../types';
import { MarkdownEditor } from './MarkdownEditor';
import { ThreadList } from './ThreadList';

interface MindMapInferenceViewerProps {
  nodeId: string;
  nodeLabel: string;
  nodeNotes?: string | null;
  focusNotes?: boolean;
  threads: Thread[];
  onThreadSelect: (threadId: string) => void;
  onThreadCreate?: () => void;
  onThreadRename?: (threadId: string, newName: string) => void;
  onThreadDelete?: (threadId: string) => void;
  onClose?: () => void;
  onNotesUpdate?: (notes: string) => Promise<void>;
}

export const MindMapInferenceViewer = forwardRef<HTMLDivElement, MindMapInferenceViewerProps>(({
  nodeId,
  nodeLabel,
  nodeNotes,
  focusNotes,
  threads,
  onThreadSelect,
  onThreadCreate,
  onThreadRename,
  onThreadDelete,
  onClose,
  onNotesUpdate
}, ref) => {
  const [activeTab, setActiveTab] = useState<'chat' | 'notes'>(focusNotes ? 'notes' : 'chat');

  // Update active tab when focusNotes prop changes
  useEffect(() => {
    if (focusNotes) {
      setActiveTab('notes');
    }
  }, [focusNotes]);

  const handleSaveNotes = async (value: string) => {
    if (onNotesUpdate) {
      await onNotesUpdate(value);
    }
  };

  // Format node label for tab title with 40 character limit
  const formatNodeTitle = (label: string) => {
    if (label.length <= 40) {
      return label;
    }
    return label.substring(0, 37) + '...';
  };

  return (
    <div ref={ref} className="flex flex-col h-full">
      {/* Header with Tabs */}
      <div className="flex-shrink-0 border-b border-gray-600">
        <div className="flex items-center justify-between p-3" data-testid="inference-viewer-header">
          {/* Tab Navigation */}
          <div className="flex items-center">
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex items-center gap-2 px-3 py-1 rounded-t text-sm font-medium transition-colors ${
                activeTab === 'chat'
                  ? 'text-white bg-gray-700'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <MessageSquare size={16} className="text-blue-400" />
              <span>Chat Threads</span>
            </button>
            <button
              onClick={() => setActiveTab('notes')}
              className={`flex items-center gap-2 px-3 py-1 rounded-t text-sm font-medium transition-colors ml-1 ${
                activeTab === 'notes'
                  ? 'text-white bg-gray-700'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <StickyNote size={16} className="text-green-400" />
              <span>{formatNodeTitle(nodeLabel)}</span>
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1">
            {onClose && (
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white transition-colors p-1 rounded"
                title="Close"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 relative">
        {activeTab === 'chat' ? (
          <ThreadList
            threads={threads}
            onThreadSelect={onThreadSelect}
            onThreadCreate={onThreadCreate}
            onThreadRename={onThreadRename}
            onThreadDelete={onThreadDelete}
            emptyStateTitle="No chat threads yet"
            emptyStateSubtitle="Create a new conversation to get started"
            createButtonTitle="New Chat"
          />
        ) : (
          <div className="flex flex-col h-full">
            <MarkdownEditor
              value={nodeNotes || ''}
              onChange={() => {}} // MarkdownEditor handles its own state
              placeholder="Add notes and context for this node using markdown..."
              showTabs={true}
              defaultMode={nodeNotes && nodeNotes.trim() ? "preview" : "edit"}
              autoSave={false}
              onSave={handleSaveNotes}
              className="flex-1"
            />
          </div>
        )}
      </div>
    </div>
  );
});

MindMapInferenceViewer.displayName = 'MindMapInferenceViewer';
