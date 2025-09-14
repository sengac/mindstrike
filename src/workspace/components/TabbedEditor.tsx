import { CodeEditor } from './CodeEditor';
import { MarkdownEditor } from '../../components/shared/MarkdownEditor';

interface TabbedEditorProps {
  filePath: string;
  content: string;
  language: string;
  onSave: (content: string) => void;
}

export function TabbedEditor({ content, language, onSave }: TabbedEditorProps) {
  const isMarkdown = language === 'markdown';

  if (isMarkdown) {
    return (
      <MarkdownEditor
        value={content}
        onChange={() => {}} // MarkdownEditor handles its own state
        showTabs={true}
        defaultMode="preview"
        autoSave={false}
        onSave={onSave}
        className="h-full"
      />
    );
  }

  // For non-markdown files, use the original simple editor
  return (
    <div className="h-full p-4">
      <CodeEditor
        value={content}
        language={language}
        onChange={onSave}
        readOnly={false}
        height="100%"
      />
    </div>
  );
}
