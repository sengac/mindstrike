import React, { useState } from 'react';
import { Edit2, Trash2, Plus, Network } from 'lucide-react';
import { KnowledgeGraph } from '../hooks/useKnowledgeGraphs';
import { clsx } from 'clsx';

interface KnowledgeGraphsPanelProps {
  knowledgeGraphs: KnowledgeGraph[];
  activeKnowledgeGraphId?: string;
  onKnowledgeGraphSelect: (graphId: string) => void;
  onKnowledgeGraphCreate: () => void;
  onKnowledgeGraphRename: (graphId: string, newName: string) => void;
  onKnowledgeGraphDelete: (graphId: string) => void;
}

export function KnowledgeGraphsPanel({
  knowledgeGraphs,
  activeKnowledgeGraphId,
  onKnowledgeGraphSelect,
  onKnowledgeGraphCreate,
  onKnowledgeGraphRename,
  onKnowledgeGraphDelete
}: KnowledgeGraphsPanelProps) {
  const [editingGraphId, setEditingGraphId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [hoveredGraphId, setHoveredGraphId] = useState<string | null>(null);

  const handleStartEdit = (graph: KnowledgeGraph) => {
    setEditingGraphId(graph.id);
    setEditingName(graph.name);
  };

  const handleSaveEdit = () => {
    if (editingGraphId && editingName.trim()) {
      onKnowledgeGraphRename(editingGraphId, editingName.trim());
    }
    setEditingGraphId(null);
    setEditingName('');
  };

  const handleCancelEdit = () => {
    setEditingGraphId(null);
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
    <div className="w-[300px] bg-gray-800 border-r border-gray-700 flex flex-col relative shrink-0">
      {/* Knowledge Graphs List */}
      <div className="flex-1 overflow-y-auto">
        {knowledgeGraphs.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            <Network size={24} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No knowledge graphs yet</p>
            <p className="text-xs mt-1">Create a new knowledge graph to begin</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {knowledgeGraphs.map((graph) => (
              <div
                key={graph.id}
                className={clsx(
                  'group relative p-3 rounded-lg cursor-pointer transition-colors',
                  'hover:bg-gray-700',
                  activeKnowledgeGraphId === graph.id ? 'bg-gray-700 border border-blue-500' : 'border border-transparent'
                )}
                onMouseEnter={() => setHoveredGraphId(graph.id)}
                onMouseLeave={() => setHoveredGraphId(null)}
                onClick={() => !editingGraphId && onKnowledgeGraphSelect(graph.id)}
              >
                {editingGraphId === graph.id ? (
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
                            {graph.name}
                          </h3>
                        </div>
                        {graph.description && (
                          <p className="text-xs text-gray-400 mt-1 line-cl-2">
                            {graph.description}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(graph.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                      
                      {hoveredGraphId === graph.id && (
                        <div className="flex items-center space-x-1 ml-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEdit(graph);
                            }}
                            className="p-1 hover:bg-gray-600 rounded text-gray-400 hover:text-gray-200 transition-colors"
                            title="Rename knowledge graph"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onKnowledgeGraphDelete(graph.id);
                            }}
                            className="p-1 hover:bg-gray-600 rounded text-gray-400 hover:text-red-400 transition-colors"
                            title="Delete knowledge graph"
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

      {/* Floating New Knowledge Graph Button */}
      <button
        onClick={onKnowledgeGraphCreate}
        className="absolute bottom-4 right-4 p-3 bg-blue-600 hover:bg-blue-700 rounded-full shadow-lg transition-colors text-white z-10"
        title="New knowledge graph"
      >
        <Plus size={20} />
      </button>
    </div>
  );
}
