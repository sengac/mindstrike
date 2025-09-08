import { useState } from 'react';
import { Eye, Edit3, Save } from 'lucide-react';
import { CodeEditor } from './CodeEditor';
import { MarkdownViewer } from './MarkdownViewer';
import { clsx } from 'clsx';

interface TabbedEditorProps {
  filePath: string;
  content: string;
  language: string;
  onSave: (content: string) => void;
}

type TabType = 'preview' | 'edit';

export function TabbedEditor({ content, language, onSave }: TabbedEditorProps) {
  const [activeTab, setActiveTab] = useState<TabType>('preview');
  const [editedContent, setEditedContent] = useState(content);
  const [hasChanges, setHasChanges] = useState(false);

  const isMarkdown = language === 'markdown';

  const handleContentChange = (newContent: string) => {
    setEditedContent(newContent);
    setHasChanges(newContent !== content);
  };

  const handleSave = () => {
    onSave(editedContent);
    setHasChanges(false);
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tab Header */}
      <div className="border-b border-gray-700 bg-gray-800">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex space-x-1">
            {isMarkdown && (
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
            )}
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
              <span>{isMarkdown ? 'Edit' : 'Code'}</span>
            </button>
          </div>

          {/* Save button - only show when editing and has changes */}
          {activeTab === 'edit' && hasChanges && (
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

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'preview' && isMarkdown ? (
          <MarkdownViewer content={hasChanges ? editedContent : content} />
        ) : (
          <div className="h-full p-4">
            <CodeEditor
              value={editedContent}
              language={language}
              onChange={handleContentChange}
              readOnly={false}
              height="100%"
            />
          </div>
        )}
      </div>
    </div>
  );
}
