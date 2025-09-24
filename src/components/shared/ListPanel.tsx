import React, { useState } from 'react';
import { Edit2, Trash2, Plus, X } from 'lucide-react';
import { clsx } from 'clsx';

interface ListItem {
  id: string;
  name: string;
  description?: string;
  updatedAt: string | Date;
  [key: string]: unknown; // Allow additional properties
}

interface EmptyState {
  icon: React.ComponentType<{ className?: string; size?: number | string }>;
  title: string;
  subtitle: string;
}

interface ListPanelProps<T extends ListItem> {
  items: T[];
  activeItemId?: string;
  onItemSelect: (itemId: string) => void;
  onItemCreate: () => void;
  onItemRename: (itemId: string, newName: string) => void;
  onItemDelete: (itemId: string) => void;
  emptyState: EmptyState;
  createButtonTitle: string;
  renameButtonTitle: string;
  deleteButtonTitle: string;
  testId: string;
  renderItemContent?: (item: T) => React.ReactNode;
  className?: string;
  // New props for child component mode
  showChildComponent?: boolean;
  onChildComponentClose?: () => void;
  childComponent?: React.ReactNode;
  childComponentTitle?: string;
  showChildComponentHeader?: boolean;
}

export function ListPanel<T extends ListItem>({
  items,
  activeItemId,
  onItemSelect,
  onItemCreate,
  onItemRename,
  onItemDelete,
  emptyState,
  createButtonTitle,
  renameButtonTitle,
  deleteButtonTitle,
  testId,
  renderItemContent,
  className,
  showChildComponent = false,
  onChildComponentClose,
  childComponent,
  childComponentTitle,
  showChildComponentHeader = true,
}: ListPanelProps<T>) {
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);

  const handleStartEdit = (item: T) => {
    setEditingItemId(item.id);
    setEditingName(item.name);
  };

  const handleSaveEdit = () => {
    if (editingItemId && editingName.trim()) {
      onItemRename(editingItemId, editingName.trim());
    }
    setEditingItemId(null);
    setEditingName('');
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
    setEditingName('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const EmptyIcon = emptyState.icon;

  return (
    <div
      className={clsx(
        'bg-dark-panel border-r border-dark-border flex flex-col relative shrink-0 overflow-hidden transition-all duration-300 ease-in-out',
        showChildComponent
          ? 'w-[50%] min-w-[400px] max-w-[800px]'
          : 'w-[20%] min-w-[200px] max-w-[500px]',
        className
      )}
      data-testid={testId}
    >
      {/* List Container - slides left when child component is shown */}
      <div
        className={clsx(
          'absolute inset-0 flex flex-col transition-transform duration-300 ease-in-out',
          showChildComponent ? '-translate-x-full' : 'translate-x-0'
        )}
      >
        {/* Items List */}
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              <EmptyIcon size={24} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">{emptyState.title}</p>
              <p className="text-xs mt-1">{emptyState.subtitle}</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {items.map(item => (
                <div
                  key={item.id}
                  className={clsx(
                    'group relative p-3 rounded-lg cursor-pointer transition-colors',
                    'hover:bg-dark-hover',
                    activeItemId === item.id
                      ? 'bg-dark-hover border border-blue-500'
                      : 'border border-transparent'
                  )}
                  onMouseEnter={() => setHoveredItemId(item.id)}
                  onMouseLeave={() => setHoveredItemId(null)}
                  onClick={() => !editingItemId && onItemSelect(item.id)}
                >
                  {editingItemId === item.id ? (
                    <input
                      type="text"
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
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
                              {item.name}
                            </h3>
                            {renderItemContent?.(item)}
                          </div>
                          {item.description && (
                            <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                              {item.description}
                            </p>
                          )}
                          <p className="text-xs text-gray-500 mt-1">
                            {item.updatedAt instanceof Date
                              ? item.updatedAt.toLocaleDateString()
                              : new Date(item.updatedAt).toLocaleDateString()}
                          </p>
                        </div>

                        {hoveredItemId === item.id && (
                          <div className="flex items-center space-x-1 ml-2">
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                handleStartEdit(item);
                              }}
                              className="p-1 hover:bg-gray-600 rounded text-gray-400 hover:text-gray-200 transition-colors"
                              title={renameButtonTitle}
                            >
                              <Edit2 size={12} />
                            </button>
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                onItemDelete(item.id);
                              }}
                              className="p-1 hover:bg-gray-600 rounded text-gray-400 hover:text-red-400 transition-colors"
                              title={deleteButtonTitle}
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

        {/* Floating Add Button */}
        <button
          onClick={onItemCreate}
          className="absolute bottom-4 right-4 p-3 bg-blue-600 hover:bg-blue-700 rounded-full shadow-lg transition-colors text-white z-10"
          title={createButtonTitle}
        >
          <Plus size={20} />
        </button>
      </div>

      {/* Child Component - slides in from right when shown */}
      <div
        className={clsx(
          'absolute inset-0 flex flex-col bg-dark-panel transition-transform duration-300 ease-in-out',
          showChildComponent ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Child Component Header with Close Button - optional */}
        {showChildComponentHeader && (
          <div className="flex-shrink-0 p-3 border-b border-gray-600 flex items-center justify-between">
            <h3 className="text-white text-sm font-medium">
              {childComponentTitle ?? 'Details'}
            </h3>
            <button
              onClick={onChildComponentClose}
              className="text-gray-400 hover:text-white transition-colors"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Child Component Content */}
        <div className="flex-1 overflow-hidden">
          {showChildComponent && childComponent}
        </div>
      </div>
    </div>
  );
}
