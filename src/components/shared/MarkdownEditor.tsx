import { useState, useEffect } from 'react';
import { Eye, Edit3, Save, Trash2, Loader2 } from 'lucide-react';
import { CodeEditor } from '../CodeEditor';
import { MarkdownViewer } from '../MarkdownViewer';
import { clsx } from 'clsx';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  showTabs?: boolean;
  defaultMode?: 'preview' | 'edit';
  autoSave?: boolean;
  autoSaveDelay?: number;
  onSave?: (value: string) => Promise<void> | void;
  className?: string;
}

type TabType = 'preview' | 'edit';

export function MarkdownEditor({ 
  value, 
  onChange, 
  placeholder = "Enter markdown content...",
  showTabs = true,
  defaultMode = 'preview',
  autoSave = false,
  autoSaveDelay = 1000,
  onSave,
  className = ""
}: MarkdownEditorProps) {
  const [activeTab, setActiveTab] = useState<TabType>(defaultMode);
  const [editedContent, setEditedContent] = useState(value);
  const [hasChanges, setHasChanges] = useState(false);
  const [lastSavedValue, setLastSavedValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);

  // Update edited content when value prop changes
  useEffect(() => {
    if (value !== editedContent) {
      setEditedContent(value);
      setLastSavedValue(value);
      setHasChanges(false);
    }
  }, [value]);

  // Auto-save functionality
  useEffect(() => {
    if (autoSave && hasChanges && onSave) {
      const timer = setTimeout(() => {
        handleSave();
      }, autoSaveDelay);
      
      return () => clearTimeout(timer);
    }
  }, [editedContent, hasChanges, autoSave, autoSaveDelay, onSave]);

  const handleContentChange = (newContent: string) => {
    setEditedContent(newContent);
    setHasChanges(newContent !== lastSavedValue);
    onChange(newContent);
  };

  const handleSave = async () => {
    if (isSaving) return;
    
    setIsSaving(true);
    try {
      if (onSave) {
        await onSave(editedContent);
      }
      setHasChanges(false);
      setLastSavedValue(editedContent);
    } catch (error) {
      console.error('Save failed:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = () => {
    setEditedContent('');
    setHasChanges(true);
    onChange('');
    if (onSave) {
      onSave('');
    }
    setLastSavedValue('');
    setHasChanges(false);
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
  };

  // If no tabs are shown, render in a simpler layout
  if (!showTabs) {
    return (
      <div className={clsx("flex flex-col h-full", className)}>
        <div className="h-full">
          <CodeEditor
            value={editedContent}
            language="markdown"
            onChange={handleContentChange}
            readOnly={false}
            height="100%"
            noBorder={true}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={clsx("flex flex-col h-full", className)}>
      {/* Tab Header */}
      <div className="border-b border-gray-700 bg-gray-800">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex space-x-1">
            <button
              onClick={() => handleTabChange('preview')}
              className={clsx(
                'flex items-center space-x-2 px-3 py-1.5 rounded text-sm font-medium transition-colors',
                activeTab === 'preview'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:text-white hover:bg-gray-700'
              )}
            >
              <Eye size={14} />
              <span>Preview</span>
            </button>
            <button
              onClick={() => handleTabChange('edit')}
              className={clsx(
                'flex items-center space-x-2 px-3 py-1.5 rounded text-sm font-medium transition-colors',
                activeTab === 'edit'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:text-white hover:bg-gray-700'
              )}
            >
              <Edit3 size={14} />
              <span>Edit</span>
            </button>
          </div>

          {/* Clear and Save buttons - only show when editing, has content or changes, and manual save */}
          {activeTab === 'edit' && !autoSave && onSave && (editedContent.trim() || hasChanges) && (
            <div className="flex items-center space-x-2">
              {editedContent.trim() && (
                <button
                  onClick={handleClear}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-sm font-medium transition-colors"
                >
                  <Trash2 size={14} />
                  <span>Clear</span>
                </button>
              )}
              {hasChanges && editedContent.trim() && (
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className={clsx(
                    "flex items-center space-x-1 px-3 py-1.5 rounded text-sm font-medium transition-colors",
                    isSaving 
                      ? "bg-green-500 cursor-not-allowed" 
                      : "bg-green-600 hover:bg-green-700"
                  )}
                >
                  {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  <span>{isSaving ? 'Saving...' : 'Save'}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'preview' ? (
          <MarkdownViewer content={editedContent || placeholder} />
        ) : (
          <div className="h-full">
            <CodeEditor
              value={editedContent}
              language="markdown"
              onChange={handleContentChange}
              readOnly={false}
              height="100%"
              noBorder={true}
            />
          </div>
        )}
      </div>
      
      {/* Status indicator for auto-save */}
      {autoSave && hasChanges && (
        <div className="px-4 py-1 bg-gray-800 border-t border-gray-700">
          <div className="text-xs text-yellow-400">
            Auto-saving...
          </div>
        </div>
      )}
    </div>
  );
}
