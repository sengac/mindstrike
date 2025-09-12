import { useState } from 'react';
import { Plus, Edit2, Trash2, BookOpen, FileText, ExternalLink, Link } from 'lucide-react';
import { Source } from './ChatContentViewer';

const typeIcons = {
  file: FileText,
  url: ExternalLink, 
  document: BookOpen,
  reference: Link
};

const typeColors = {
  file: 'text-blue-400',
  url: 'text-green-400',
  document: 'text-orange-400', 
  reference: 'text-purple-400'
};

interface SourcesListProps {
  sources: Source[];
  onSourcesUpdate?: (sources: Source[]) => Promise<void>;
}

export function SourcesList({ sources, onSourcesUpdate }: SourcesListProps) {
  const [hoveredSourceId, setHoveredSourceId] = useState<string | null>(null);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [editingSource, setEditingSource] = useState<Partial<Source>>({});
  const [isCreating, setIsCreating] = useState(false);
  const [newSource, setNewSource] = useState<Partial<Source>>({
    name: '',
    directory: '',
    type: 'file'
  });

  const handleStartCreate = () => {
    setIsCreating(true);
    setNewSource({
      name: '',
      directory: '',
      type: 'file'
    });
  };

  const handleFinishCreate = async () => {
    if (newSource.name?.trim() && newSource.directory?.trim() && onSourcesUpdate) {
      const source: Source = {
        id: `source-${Date.now()}`,
        name: newSource.name.trim(),
        directory: newSource.directory.trim(),
        type: newSource.type || 'file'
      };
      const updatedSources = [...(sources || []), source];
      
      try {
        await onSourcesUpdate(updatedSources);
        setIsCreating(false);
        setNewSource({ name: '', directory: '', type: 'file' });
      } catch (error) {
        console.error('Failed to save source:', error);
      }
    } else {
      setIsCreating(false);
      setNewSource({ name: '', directory: '', type: 'file' });
    }
  };

  const handleCancelCreate = () => {
    setIsCreating(false);
    setNewSource({ name: '', directory: '', type: 'file' });
  };

  const handleStartEdit = (source: Source) => {
    setEditingSourceId(source.id);
    setEditingSource({
      name: source.name,
      directory: source.directory,
      type: source.type
    });
  };

  const handleFinishEdit = async (sourceId: string) => {
    if (editingSource.name?.trim() && editingSource.directory?.trim() && onSourcesUpdate) {
      const updatedSources = (sources || []).map(source =>
        source.id === sourceId
          ? {
              ...source,
              name: editingSource.name!.trim(),
              directory: editingSource.directory!.trim(),
              type: editingSource.type || source.type
            }
          : source
      );
      
      try {
        await onSourcesUpdate(updatedSources);
        setEditingSourceId(null);
        setEditingSource({});
      } catch (error) {
        console.error('Failed to update source:', error);
      }
    } else {
      setEditingSourceId(null);
      setEditingSource({});
    }
  };

  const handleCancelEdit = () => {
    setEditingSourceId(null);
    setEditingSource({});
  };

  const handleDeleteSource = async (sourceId: string) => {
    if (onSourcesUpdate) {
      const updatedSources = (sources || []).filter(source => source.id !== sourceId);
      
      try {
        await onSourcesUpdate(updatedSources);
      } catch (error) {
        console.error('Failed to delete source:', error);
      }
    }
  };

  const renderSourceForm = (
    source: Partial<Source>,
    onSourceChange: (updates: Partial<Source>) => void,
    onSave: () => void,
    onCancel: () => void
  ) => (
    <div className="p-3 bg-gray-700 rounded-lg border border-gray-600 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Name</label>
          <input
            type="text"
            value={source.name || ''}
            onChange={(e) => onSourceChange({ name: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSave();
              else if (e.key === 'Escape') onCancel();
            }}
            className="w-full bg-gray-600 border border-gray-500 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-400"
            placeholder="Source name"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Type</label>
          <select
            value={source.type || 'file'}
            onChange={(e) => onSourceChange({ type: e.target.value as Source['type'] })}
            className="w-full bg-gray-600 border border-gray-500 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-400"
          >
            <option value="file">File</option>
            <option value="url">URL</option>
            <option value="document">Document</option>
            <option value="reference">Reference</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Directory/Location</label>
        <input
          type="text"
          value={source.directory || ''}
          onChange={(e) => onSourceChange({ directory: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSave();
            else if (e.key === 'Escape') onCancel();
          }}
          className="w-full bg-gray-600 border border-gray-500 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-400"
          placeholder="File path, URL, or location"
        />
      </div>
      <div className="flex justify-end space-x-2">
        <button
          onClick={onCancel}
          className="px-3 py-1 text-xs bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full relative">
      {/* Sources List */}
      <div className="flex-1 overflow-y-auto">
        {(!sources || sources.length === 0) && !isCreating ? (
          <div className="p-4 text-center text-gray-500">
            <BookOpen size={24} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No sources added yet</p>
            <p className="text-xs mt-1">Add sources to track references and files</p>
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {/* Create Form */}
            {isCreating && renderSourceForm(
              newSource,
              (updates: Partial<Source>) => setNewSource({ ...newSource, ...updates }),
              handleFinishCreate,
              handleCancelCreate
            )}

            {/* Sources List */}
            {(sources || []).map((source) => {
              const IconComponent = typeIcons[source.type];
              const iconColor = typeColors[source.type];
              
              return (
                <div
                  key={source.id}
                  className="group relative p-3 rounded-lg cursor-pointer transition-colors border border-transparent hover:bg-gray-700 hover:border-gray-600"
                  onMouseEnter={() => setHoveredSourceId(source.id)}
                  onMouseLeave={() => setHoveredSourceId(null)}
                >
                  {editingSourceId === source.id ? 
                    renderSourceForm(
                      editingSource,
                      (updates: Partial<Source>) => setEditingSource({ ...editingSource, ...updates }),
                      () => handleFinishEdit(source.id),
                      handleCancelEdit
                    ) : (
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <IconComponent size={16} className={iconColor} />
                          <h4 className="text-sm font-medium text-gray-200 truncate">
                            {source.name}
                          </h4>
                          <span className="text-xs px-2 py-0.5 bg-gray-600 rounded-full text-gray-300 capitalize">
                            {source.type}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1 truncate">
                          {source.directory}
                        </p>
                      </div>
                      
                      {hoveredSourceId === source.id && editingSourceId !== source.id && (
                        <div className="flex items-center space-x-1 ml-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEdit(source);
                            }}
                            className="p-1 hover:bg-gray-600 rounded text-gray-400 hover:text-gray-200 transition-colors"
                            title="Edit source"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSource(source.id);
                            }}
                            className="p-1 hover:bg-gray-600 rounded text-gray-400 hover:text-red-400 transition-colors"
                            title="Delete source"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating New Source Button */}
      {!isCreating && onSourcesUpdate && (
        <button
          onClick={handleStartCreate}
          className="absolute bottom-4 right-4 p-3 bg-orange-600 hover:bg-orange-700 rounded-full shadow-lg transition-colors text-white z-10"
          title="Add New Source"
        >
          <Plus size={20} />
        </button>
      )}
    </div>
  );
}
