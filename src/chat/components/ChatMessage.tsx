import React, { memo } from 'react';
import {
  User,
  Bot,
  Wrench,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronRight,
  FileText,
  Code,
  Trash2,
  RotateCcw,
  Loader2,
  X,
  Edit2,
  Check,
  Copy,
  Download,
  Maximize2,
  Brain,
  StickyNote,
} from 'lucide-react';
import type { ConversationMessage } from '../../types';
import { useState, useEffect, useRef } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import 'katex/dist/katex.min.css';
import katex from 'katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { MermaidModal } from '../../components/MermaidModal';
import { renderMermaidDiagramsDelayed } from '../../utils/mermaidRenderer';
import { CitationRenderer } from './CitationRenderer';
import { logger } from '../../utils/logger';

// Common language mappings for syntax highlighting
const languageMap: Record<string, string> = {
  sh: 'bash',
  shell: 'bash',
  console: 'bash',
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  rb: 'ruby',
  yml: 'yaml',
  json: 'json',
  md: 'markdown',
  html: 'markup',
  xml: 'markup',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  sql: 'sql',
  c: 'c',
  cpp: 'cpp',
  cxx: 'cpp',
  'c++': 'cpp',
  cs: 'csharp',
  java: 'java',
  php: 'php',
  go: 'go',
  rust: 'rust',
  swift: 'swift',
  kotlin: 'kotlin',
  scala: 'scala',
  r: 'r',
  matlab: 'matlab',
  lua: 'lua',
  perl: 'perl',
  powershell: 'powershell',
  dockerfile: 'docker',
  makefile: 'makefile',
  ini: 'ini',
  toml: 'toml',
  graphql: 'graphql',
  diff: 'diff',
  patch: 'diff',
};

// Function to map language aliases to supported languages or fallback to 'text'
const getSupportedLanguage = (language?: string): string => {
  if (!language) {
    return 'text';
  }

  const lowerLang = language.toLowerCase();

  // Return mapped language or original if it exists in common languages
  return (languageMap[lowerLang] || language) ?? 'text';
};

interface ChatMessageProps {
  message: ConversationMessage;
  onDelete?: (messageId: string) => void;
  onRegenerate?: (messageId: string) => void;
  onCancelToolCalls?: (messageId: string) => void;
  onEdit?: (messageId: string, newContent: string) => void;
  onCopyToNotes?: (content: string) => void;
  fontSize?: number;
}

function ChatMessageComponent({
  message,
  onDelete,
  onRegenerate,
  onCancelToolCalls,
  onEdit,
  onCopyToNotes,
  fontSize = 14,
}: ChatMessageProps) {
  const isUser = message.role === 'user';
  const [toolCallsExpanded, setToolCallsExpanded] = useState(false);
  const [resultsExpanded, setResultsExpanded] = useState(false);
  const [showMarkdown, setShowMarkdown] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [modalMermaidCode, setModalMermaidCode] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [thinkingExpanded, setThinkingExpanded] = useState<{
    [key: number]: boolean;
  }>({});
  const mermaidRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Note: This component is memoized to prevent unnecessary re-renders

  useEffect(() => {
    // Render mermaid diagrams when content changes or when switching to markdown view
    if (mermaidRef.current && showMarkdown) {
      renderMermaidDiagramsDelayed(mermaidRef.current, false, () => {
        // Dispatch event that bubbles up to ChatPanel
        mermaidRef.current?.dispatchEvent(
          new CustomEvent('mermaidRenderComplete', { bubbles: true })
        );
      });
    }
  }, [message.content, showMarkdown]);

  useEffect(() => {
    // Focus and auto-resize textarea when editing starts
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height =
        textareaRef.current.scrollHeight + 'px';
    }
  }, [isEditing]);

  const handleEditSubmit = () => {
    if (onEdit && editContent.trim() !== message.content) {
      onEdit(message.id, editContent.trim());
    }
    setIsEditing(false);
  };

  const handleEditCancel = () => {
    setEditContent(message.content);
    setIsEditing(false);
  };

  const handleCopyToNotes = () => {
    if (onCopyToNotes) {
      onCopyToNotes(message.content);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleEditSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleEditCancel();
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      logger.error('Clipboard API failed, trying fallback:', err);
      try {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (!successful) {
          logger.error('Fallback copy failed');
        }
      } catch (fallbackErr) {
        logger.error('Both copy methods failed:', fallbackErr);
      }
    }
  };

  const downloadMermaidDiagram = async (diagramId: string) => {
    try {
      const diagramElement = document.getElementById(diagramId);
      if (!diagramElement) {
        return;
      }

      const svgElement = diagramElement.querySelector('svg');
      if (!svgElement) {
        return;
      }

      // Get SVG string
      const svgData = new XMLSerializer().serializeToString(svgElement);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml' });

      // Create download link
      const url = URL.createObjectURL(svgBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `mermaid-diagram-${Date.now()}.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      logger.error('Failed to download diagram:', err);
    }
  };

  const renderCodeBlock = (code: string, language?: string) => {
    if (language === 'mermaid') {
      const diagramId = `mermaid-${Date.now()}-${Math.random()}`;
      return (
        <div
          key={`${diagramId}-${code.substring(0, 20)}`}
          className="my-4 relative group"
        >
          <div
            id={diagramId}
            className="mermaid bg-gray-800 p-4 rounded border border-gray-700"
            data-mermaid-code={code}
          >
            {code}
          </div>
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 flex space-x-1">
            <button
              onClick={() => {
                setModalMermaidCode(code);
                setIsModalOpen(true);
              }}
              className="p-2 bg-gray-700 hover:bg-gray-600 rounded flex items-center space-x-1 text-xs text-gray-300 hover:text-white"
              title="View fullscreen"
            >
              <Maximize2 size={12} />
            </button>
            <button
              onClick={() => downloadMermaidDiagram(diagramId)}
              className="p-2 bg-gray-700 hover:bg-gray-600 rounded flex items-center space-x-1 text-xs text-gray-300 hover:text-white"
              title="Download diagram"
            >
              <Download size={12} />
            </button>
          </div>
        </div>
      );
    }

    // Always show copy button for all code blocks
    const showCopyButton = true;

    // For other languages, use syntax highlighting
    return (
      <div className="my-4 relative group">
        {showCopyButton && (
          <button
            onClick={() => copyToClipboard(code)}
            className="absolute top-2 right-2 p-2 bg-gray-700 hover:bg-gray-600 rounded opacity-80 hover:opacity-100 transition-opacity z-10 flex items-center space-x-1 text-xs text-gray-300 hover:text-white"
            title="Copy code"
          >
            <Copy size={14} />
          </button>
        )}
        {language && code.includes('\n') && (
          <div className="absolute bottom-2 right-2 bg-gray-800/90 backdrop-blur-sm border border-gray-600 px-2 py-1 rounded text-xs text-gray-300 font-mono opacity-80 transition-opacity z-10">
            {language}
          </div>
        )}
        <SyntaxHighlighter
          language={getSupportedLanguage(language)}
          style={vscDarkPlus}
          customStyle={{
            margin: 0,
            borderRadius: '0.375rem',
            fontSize: `var(--dynamic-font-size, ${fontSize}px)`,
            overflowX: 'auto',
            maxWidth: '100%',
          }}
          codeTagProps={{
            style: { fontSize: `var(--dynamic-font-size, ${fontSize}px)` },
          }}
          wrapLines={true}
          wrapLongLines={true}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    );
  };

  const renderThinkingBlock = (content: string, blockId: number) => {
    const isExpanded = thinkingExpanded[blockId] || false;

    const toggleExpanded = () => {
      setThinkingExpanded(prev => ({
        ...prev,
        [blockId]: !prev[blockId],
      }));
    };

    return (
      <div
        key={`think-${blockId}`}
        className="my-4 bg-amber-900/20 border border-amber-700/50 rounded-lg relative"
      >
        <button
          onClick={toggleExpanded}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-amber-900/30 transition-colors rounded-lg"
        >
          <div className="flex items-center space-x-2">
            <Brain size={16} className="text-amber-400" />
            <span className="text-sm font-medium text-amber-300">
              AI Thinking
            </span>
          </div>
          <div className="flex items-center space-x-1">
            {isExpanded ? (
              <ChevronDown size={14} className="text-amber-400" />
            ) : (
              <ChevronRight size={14} className="text-amber-400" />
            )}
          </div>
        </button>
        {isExpanded && (
          <div className="px-4 pb-4">
            <div
              className="text-sm text-amber-100/90 leading-relaxed whitespace-pre-wrap break-words"
              style={{ fontSize: `var(--dynamic-font-size, ${fontSize}px)` }}
            >
              {content}
            </div>
          </div>
        )}
      </div>
    );
  };

  const processLatexInContent = (
    content: string,
    citations?: string[]
  ): React.ReactNode => {
    // Check if content has citations - process them first if present
    if (citations && citations.length > 0) {
      return (
        <CitationRenderer
          content={content}
          citations={citations}
          className="inline"
        />
      );
    }

    // Check if content has LaTeX expressions
    const hasBlockLatex = /\$\$([^$]+)\$\$/.test(content);
    const hasInlineLatex = /\$([^$\n]+)\$/.test(content);

    if (!hasBlockLatex && !hasInlineLatex) {
      // No LaTeX, just process markdown normally
      const html = String(marked.parse(content));
      const sanitizedHtml = DOMPurify.sanitize(html);
      return <div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />;
    }

    // Replace LaTeX with placeholders, process markdown, then restore LaTeX
    const latexExpressions: Array<{ latex: string; isBlock: boolean }> = [];
    let processedContent = content;

    // First replace block LaTeX
    processedContent = processedContent.replace(
      /\$\$([^$]+)\$\$/g,
      (_, latex) => {
        const index = latexExpressions.length;
        latexExpressions.push({ latex: latex.trim(), isBlock: true });
        return `LATEXPLACEHOLDER${index}ENDLATEX`;
      }
    );

    // Then replace inline LaTeX
    processedContent = processedContent.replace(
      /\$([^$\n]+)\$/g,
      (_, latex) => {
        const index = latexExpressions.length;
        latexExpressions.push({ latex: latex.trim(), isBlock: false });
        return `LATEXPLACEHOLDER${index}ENDLATEX`;
      }
    );

    // Process markdown
    const html = String(marked.parse(processedContent));
    const sanitizedHtml = DOMPurify.sanitize(html);

    // Create a component that will replace placeholders with LaTeX
    const LatexProcessor = ({ html }: { html: string }) => {
      // Replace placeholders directly in the HTML string with rendered LaTeX
      let processedHtml = html;

      latexExpressions.forEach((latexInfo, index) => {
        const placeholder = `LATEXPLACEHOLDER${index}ENDLATEX`;
        if (processedHtml.includes(placeholder)) {
          try {
            const latexHtml = katex.renderToString(latexInfo.latex, {
              throwOnError: false,
              displayMode: latexInfo.isBlock,
              strict: false,
            });

            if (latexInfo.isBlock) {
              // For block LaTeX, wrap in a div with proper spacing
              processedHtml = processedHtml.replace(
                placeholder,
                `<div class="my-4 text-center">${latexHtml}</div>`
              );
            } else {
              // For inline LaTeX, insert directly without wrapper
              processedHtml = processedHtml.replace(placeholder, latexHtml);
            }
          } catch {
            const fallback = `$${latexInfo.isBlock ? '$' : ''}${latexInfo.latex}${latexInfo.isBlock ? '$' : ''}$`;
            processedHtml = processedHtml.replace(
              placeholder,
              `<span class="text-red-400 bg-red-900/20 px-1 rounded">${fallback}</span>`
            );
          }
        }
      });

      return <div dangerouslySetInnerHTML={{ __html: processedHtml }} />;
    };

    return <LatexProcessor html={sanitizedHtml} />;
  };

  const renderContent = (content: string, citations?: string[]) => {
    if (showMarkdown) {
      // Check for code blocks and think blocks
      const allBlocks: Array<{
        type: 'code' | 'think';
        match: RegExpExecArray;
        language?: string;
        content: string;
      }> = [];

      // Find code blocks - improved regex to handle blocks without language
      const codeRegex = /```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)\n?```/g;
      let codeMatch;
      while ((codeMatch = codeRegex.exec(content)) !== null) {
        allBlocks.push({
          type: 'code',
          match: codeMatch,
          language: codeMatch[1] || undefined,
          content: codeMatch[2].trim(),
        });
      }

      // Find think blocks
      const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
      let thinkMatch;
      while ((thinkMatch = thinkRegex.exec(content)) !== null) {
        allBlocks.push({
          type: 'think',
          match: thinkMatch,
          content: thinkMatch[1],
        });
      }

      if (allBlocks.length > 0) {
        const parts: JSX.Element[] = [];
        let lastIndex = 0;

        // Sort blocks by position
        allBlocks.sort((a, b) => a.match.index - b.match.index);

        let blockId = 0;

        for (const block of allBlocks) {
          // Add content before this block
          if (block.match.index > lastIndex) {
            const beforeContent = content.slice(lastIndex, block.match.index);
            if (beforeContent.trim()) {
              parts.push(
                <div
                  key={`before-${blockId}`}
                  className={`prose prose-invert prose-sm max-w-full overflow-hidden markdown-content ${isUser ? 'prose-p:my-0 prose-headings:my-0 prose-ul:my-0 prose-ol:my-0' : ''}`}
                  style={{
                    fontSize: `var(--dynamic-font-size, ${fontSize}px)`,
                  }}
                >
                  {processLatexInContent(beforeContent, citations)}
                </div>
              );
            }
          }

          // Add the block
          if (block.type === 'code') {
            parts.push(
              <div key={`code-${blockId}`}>
                {renderCodeBlock(block.content, block.language)}
              </div>
            );
          } else if (block.type === 'think') {
            parts.push(renderThinkingBlock(block.content, blockId));
          }

          lastIndex = block.match.index + block.match[0].length;
          blockId++;
        }

        // Add remaining content after last block
        if (lastIndex < content.length) {
          const afterContent = content.slice(lastIndex);
          if (afterContent.trim()) {
            parts.push(
              <div
                key="after"
                className={`prose prose-invert prose-sm max-w-full overflow-hidden markdown-content ${isUser ? 'prose-p:my-0 prose-headings:my-0 prose-ul:my-0 prose-ol:my-0' : ''}`}
                style={{ fontSize: `var(--dynamic-font-size, ${fontSize}px)` }}
              >
                {processLatexInContent(afterContent, citations)}
              </div>
            );
          }
        }

        return <div ref={mermaidRef}>{parts}</div>;
      } else {
        return (
          <div
            className={`prose prose-invert prose-sm max-w-full overflow-hidden markdown-content ${isUser ? 'prose-p:my-0 prose-headings:my-0 prose-ul:my-0 prose-ol:my-0' : ''}`}
            style={{ fontSize: `var(--dynamic-font-size, ${fontSize}px)` }}
          >
            {processLatexInContent(content, citations)}
          </div>
        );
      }
    }
    return (
      <div
        className="whitespace-pre-wrap text-sm break-words"
        style={{ fontSize: `var(--dynamic-font-size, ${fontSize}px)` }}
      >
        {content}
      </div>
    );
  };

  return (
    <>
      <MermaidModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        mermaidCode={modalMermaidCode}
      />
      <div
        className={`flex space-x-3 ${isUser ? 'justify-end' : 'justify-start'}`}
      >
        {!isUser && (
          <div className="shrink-0">
            <div className="w-8 h-8 border-2 border-purple-400 bg-linear-to-br from-purple-500 to-blue-600 rounded-full flex items-center justify-center shadow-lg">
              <Bot size={16} className="text-white drop-shadow-sm" />
            </div>
          </div>
        )}

        <div
          className={`max-w-[80%] ${isUser ? 'min-w-0 order-2' : 'min-w-[80%]'}`}
        >
          <div
            className={`rounded-lg px-4 py-2 relative group overflow-hidden ${
              isUser ? 'text-white bg-gray-700' : 'bg-gray-800'
            }`}
          >
            {((onDelete || onEdit) && isUser) || (onRegenerate && !isUser) ? (
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-1">
                {onRegenerate && !isUser && (
                  <button
                    onClick={() => onRegenerate(message.id)}
                    className="p-1 hover:bg-gray-600 rounded"
                    title="Regenerate response"
                  >
                    <RotateCcw size={12} />
                  </button>
                )}
                {onEdit && isUser && !isEditing && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="p-1 hover:bg-blue-600 rounded"
                    title="Edit message"
                  >
                    <Edit2 size={12} />
                  </button>
                )}
                {onDelete && isUser && (
                  <button
                    onClick={() => onDelete(message.id)}
                    className="p-1 hover:bg-red-600 rounded"
                    title="Delete message"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ) : null}
            {!isUser && (
              <div className="flex items-center justify-between mb-2 border-b border-gray-700 pb-2">
                <div className="flex space-x-1">
                  <button
                    onClick={() => setShowMarkdown(true)}
                    className={`flex items-center space-x-1 px-2 py-1 rounded text-xs transition-colors ${
                      showMarkdown
                        ? 'border border-gray-600 text-white'
                        : 'text-gray-4  00 hover:text-gray-200'
                    }`}
                  >
                    <FileText size={12} />
                    <span>Markdown</span>
                  </button>
                  <button
                    onClick={() => setShowMarkdown(false)}
                    className={`flex items-center space-x-1 px-2 py-1 rounded text-xs transition-colors ${
                      !showMarkdown
                        ? 'border border-gray-600 text-white'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    <Code size={12} />
                    <span>Raw</span>
                  </button>
                </div>
              </div>
            )}

            {/* Processing interface for tool calls */}
            {message.status === 'processing' &&
              message.toolCalls &&
              message.toolCalls.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Loader2
                        size={16}
                        className="animate-spin text-gray-400"
                      />
                      <span className="text-sm font-medium">
                        Processing {message.toolCalls.length} tool call
                        {message.toolCalls.length > 1 ? 's' : ''}...
                      </span>
                    </div>
                    {onCancelToolCalls && (
                      <button
                        onClick={() => onCancelToolCalls(message.id)}
                        className="flex items-center space-x-1 px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs transition-colors ml-4"
                      >
                        <X size={12} />
                        <span>Cancel</span>
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    {message.toolCalls.map((toolCall, index) => (
                      <div
                        key={index}
                        className="bg-gray-700 rounded p-3 border-l-4 border-gray-500"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Wrench size={14} className="text-gray-400" />
                            <span className="font-medium text-sm">
                              {toolCall.name}
                            </span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Loader2
                              size={12}
                              className="animate-spin text-gray-400"
                            />
                            <span className="text-xs text-gray-400">
                              Running...
                            </span>
                          </div>
                        </div>
                        {Object.keys(toolCall.parameters).length > 0 && (
                          <div className="mt-2 text-xs text-gray-300">
                            <div className="font-medium mb-1">Parameters:</div>
                            <pre className="text-gray-400 overflow-x-auto bg-gray-800 p-2 rounded break-all whitespace-pre-wrap">
                              {JSON.stringify(toolCall.parameters, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {/* Show content only if not processing tool calls */}
            {!(
              message.status === 'processing' &&
              message.toolCalls &&
              message.toolCalls.length > 0
            ) && (
              <>
                {isEditing && isUser ? (
                  <div className="space-y-2">
                    <textarea
                      ref={textareaRef}
                      value={editContent}
                      onChange={e => setEditContent(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="w-full bg-gray-700 text-white border border-gray-500 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                      placeholder="Edit your message..."
                    />
                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={handleEditCancel}
                        className="px-3 py-1 text-xs bg-gray-600 hover:bg-gray-700 rounded text-white"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleEditSubmit}
                        className="px-3 py-1 text-xs bg-green-600 hover:bg-green-700 rounded text-white flex items-center space-x-1"
                      >
                        <Check size={12} />
                        <span>Save</span>
                      </button>
                    </div>
                    <div className="text-xs text-gray-200">
                      Press Ctrl+Enter to save, Escape to cancel
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Display attached images for user messages */}
                    {isUser && message.images && message.images.length > 0 && (
                      <div className="mb-3">
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                          {message.images.map(image => (
                            <div key={image.id} className="relative group">
                              <img
                                src={image.thumbnail}
                                alt={image.filename}
                                className="w-full h-32 object-cover rounded border border-gray-600 hover:border-gray-400 transition-colors cursor-pointer"
                                onClick={() => {
                                  // Open image in new tab or modal
                                  const newWindow = window.open();
                                  if (newWindow) {
                                    newWindow.document.write(
                                      `<img src="${image.thumbnail}" alt="${image.filename}" style="max-width: 100%; height: auto;" />`
                                    );
                                  }
                                }}
                              />
                              <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-60 text-xs text-white p-1 rounded-b truncate">
                                {image.filename}
                              </div>
                              <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => {
                                    const newWindow = window.open();
                                    if (newWindow) {
                                      newWindow.document.write(
                                        `<img src="${image.thumbnail}" alt="${image.filename}" style="max-width: 100%; height: auto;" />`
                                      );
                                    }
                                  }}
                                  className="p-1 bg-black bg-opacity-70 hover:bg-opacity-90 rounded text-white"
                                  title="View full size"
                                >
                                  <Maximize2 size={12} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Display attached notes for user messages */}
                    {isUser && message.notes && message.notes.length > 0 && (
                      <div className="mb-3">
                        <div className="space-y-2">
                          {message.notes.map(note => (
                            <div
                              key={note.id}
                              className="bg-gray-700 rounded-lg p-3 border border-gray-600"
                            >
                              <div className="flex items-start gap-2">
                                <StickyNote
                                  size={16}
                                  className="text-blue-400 mt-0.5 shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-blue-400 mb-1">
                                    {note.title}
                                  </div>
                                  {note.nodeLabel && (
                                    <div className="text-xs text-gray-400 mb-2">
                                      From: {note.nodeLabel}
                                    </div>
                                  )}
                                  <div className="text-sm text-gray-300 whitespace-pre-wrap">
                                    {note.content}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {renderContent(message.content, message.citations)}
                  </>
                )}
              </>
            )}

            {/* Tool calls */}
            {message.toolCalls && message.toolCalls.length > 0 && (
              <div className="mt-3 space-y-2">
                <button
                  onClick={() => setToolCallsExpanded(!toolCallsExpanded)}
                  className="flex items-center space-x-1 text-xs text-gray-300 font-medium hover:text-gray-100 transition-colors"
                >
                  {toolCallsExpanded ? (
                    <ChevronDown size={12} />
                  ) : (
                    <ChevronRight size={12} />
                  )}
                  <span>Tool calls ({message.toolCalls.length})</span>
                </button>
                {toolCallsExpanded &&
                  message.toolCalls.map((toolCall, index) => (
                    <div
                      key={index}
                      className="bg-gray-700 rounded p-2 text-xs"
                    >
                      <div className="flex items-center space-x-2 mb-1">
                        <Wrench size={12} />
                        <span className="font-medium">{toolCall.name}</span>
                      </div>
                      <pre className="text-gray-300 overflow-x-auto break-all whitespace-pre-wrap">
                        {JSON.stringify(toolCall.parameters, null, 2)}
                      </pre>
                    </div>
                  ))}
              </div>
            )}

            {/* Tool results */}
            {message.toolResults && message.toolResults.length > 0 && (
              <div className="mt-3 space-y-2">
                <button
                  onClick={() => setResultsExpanded(!resultsExpanded)}
                  className="flex items-center space-x-1 text-xs text-gray-300 font-medium hover:text-gray-100 transition-colors"
                >
                  {resultsExpanded ? (
                    <ChevronDown size={12} />
                  ) : (
                    <ChevronRight size={12} />
                  )}
                  <span>Results ({message.toolResults.length})</span>
                </button>
                {resultsExpanded &&
                  message.toolResults.map((result, index) => (
                    <div
                      key={index}
                      className="bg-gray-700 rounded p-2 text-xs"
                    >
                      <div className="flex items-center space-x-2 mb-1">
                        {(result.result as { success?: boolean }).success ? (
                          <CheckCircle size={12} className="text-green-400" />
                        ) : (
                          <XCircle size={12} className="text-red-400" />
                        )}
                        <span className="font-medium">{result.name}</span>
                      </div>
                      <div className="text-gray-300">
                        {(result.result as { success?: boolean }).success ? (
                          <pre className="overflow-x-auto whitespace-pre-wrap break-all">
                            {(result.result as { output?: string }).output ??
                              'Success'}
                          </pre>
                        ) : (
                          <div className="text-red-300">
                            {String(
                              (result.result as { error?: unknown }).error
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div
            className={`text-xs text-gray-500 mt-1 ${isUser ? 'text-right' : 'flex items-center justify-between'}`}
          >
            <div>
              <span>
                {(() => {
                  const date = new Date(message.timestamp);
                  return isNaN(date.getTime())
                    ? 'Now'
                    : date.toLocaleTimeString();
                })()}
              </span>
              {!isUser && message.model && (
                <span className="ml-2 text-gray-400">
                  via {message.model}
                  {message.medianTokensPerSecond && (
                    <> • {message.medianTokensPerSecond.toFixed(1)} tok/s</>
                  )}
                  {message.totalTokens && (
                    <> • {message.totalTokens.toLocaleString()} tokens</>
                  )}
                </span>
              )}
            </div>
            {!isUser && onCopyToNotes && (
              <button
                onClick={handleCopyToNotes}
                className="flex items-center space-x-1 px-2 py-1 rounded text-xs transition-colors text-gray-400 hover:text-gray-200 hover:bg-gray-700"
                title="Copy to Notes"
              >
                <StickyNote size={12} />
                <span>Copy to Notes</span>
              </button>
            )}
          </div>
        </div>

        {isUser && (
          <div className="shrink-0">
            <div className="w-8 h-8 mr-3 border-2 border-emerald-400 bg-linear-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center shadow-lg">
              <User size={16} className="text-white drop-shadow-sm" />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// Memoize the component to prevent unnecessary re-renders when parent state changes
export const ChatMessage = memo(
  ChatMessageComponent,
  (prevProps, nextProps) => {
    // Only re-render if message content, ID, or callbacks actually change
    return (
      prevProps.message.id === nextProps.message.id &&
      prevProps.message.content === nextProps.message.content &&
      prevProps.message.status === nextProps.message.status &&
      prevProps.fontSize === nextProps.fontSize &&
      prevProps.onDelete === nextProps.onDelete &&
      prevProps.onRegenerate === nextProps.onRegenerate &&
      prevProps.onCancelToolCalls === nextProps.onCancelToolCalls &&
      prevProps.onEdit === nextProps.onEdit &&
      prevProps.onCopyToNotes === nextProps.onCopyToNotes
    );
  }
);
