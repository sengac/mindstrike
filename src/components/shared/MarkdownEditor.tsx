import { useState, useEffect } from 'react';
import { Eye, Edit3, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { CodeEditor } from '../../workspace/components/CodeEditor';
import { MarkdownViewer } from '../MarkdownViewer';
import { clsx } from 'clsx';
import { logger } from '../../utils/logger';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  showTabs?: boolean;
  defaultMode?: 'preview' | 'edit';
  activeMode?: 'preview' | 'edit';
  onSave?: (value: string) => Promise<void> | void;
  className?: string;
  additionalButtons?: React.ReactNode;
}

type TabType = 'preview' | 'edit';

export function MarkdownEditor({
  value,
  onChange: _onChange,
  placeholder = 'Enter markdown content...',
  showTabs = true,
  defaultMode = 'preview',
  activeMode,
  onSave,
  className = '',
  additionalButtons,
}: MarkdownEditorProps) {
  const [activeTab, setActiveTab] = useState<TabType>(
    activeMode || defaultMode
  );
  const [content, setContent] = useState(value);

  // Update content when value prop changes
  useEffect(() => {
    setContent(value);
  }, [value]);

  // Update active tab when activeMode prop changes
  useEffect(() => {
    if (activeMode) {
      setActiveTab(activeMode);
    }
  }, [activeMode]);

  const handleContentChange = (newContent: string) => {
    setContent(newContent);
  };

  const handleSave = async () => {
    if (onSave) {
      try {
        await onSave(content);
        toast.success('Notes saved successfully');
      } catch (error) {
        logger.error('Save failed:', error);
        toast.error('Failed to save notes');
      }
    }
  };

  // If no tabs are shown, render in a simpler layout
  if (!showTabs) {
    return (
      <div className={clsx('flex flex-col h-full', className)}>
        <div className="h-full">
          <CodeEditor
            value={content}
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
    <div className={clsx('flex flex-col h-full', className)}>
      {/* Tab Header */}
      <div className="border-b border-gray-700 bg-gray-800">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex space-x-1">
            <button
              onClick={() => setActiveTab('preview')}
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
              onClick={() => setActiveTab('edit')}
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

          <div className="flex items-center space-x-2">
            {/* Additional buttons */}
            {additionalButtons}

            {/* Save button */}
            {activeTab === 'edit' && onSave && (
              <button
                onClick={handleSave}
                className="flex items-center space-x-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded text-sm font-medium transition-colors"
              >
                <Save size={14} />
                <span>Save</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'preview' ? (
          <MarkdownViewer content={content || placeholder} />
        ) : (
          <div className="h-full">
            <CodeEditor
              value={content}
              language="markdown"
              onChange={handleContentChange}
              readOnly={false}
              height="100%"
              noBorder={true}
            />
          </div>
        )}
      </div>
    </div>
  );
}
