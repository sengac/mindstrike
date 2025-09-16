import React, { useEffect, useState, useRef } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import 'katex/dist/katex.min.css';
import katex from 'katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Download, Maximize2 } from 'lucide-react';
import { MermaidModal } from './MermaidModal';
import { renderMermaidDiagramsDelayed } from '../utils/mermaidRenderer';

interface MarkdownViewerProps {
  content: string;
}

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

const getSupportedLanguage = (language?: string): string => {
  if (!language) return 'text';

  const lowerLang = language.toLowerCase();

  // Return mapped language or original if it exists in common languages
  return languageMap[lowerLang] || language || 'text';
};

export function MarkdownViewer({ content }: MarkdownViewerProps) {
  const [modalMermaidCode, setModalMermaidCode] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const mermaidRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Render mermaid diagrams when content changes
    if (mermaidRef.current) {
      renderMermaidDiagramsDelayed(mermaidRef.current, false, () => {
        // Dispatch custom event when mermaid rendering completes
        mermaidRef.current?.dispatchEvent(
          new CustomEvent('mermaidRenderComplete', { bubbles: true })
        );
      });
    }
  }, [content]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Clipboard API failed, trying fallback:', err);
      try {
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
          console.error('Fallback copy failed');
        }
      } catch (fallbackErr) {
        console.error('Both copy methods failed:', fallbackErr);
      }
    }
  };

  const downloadMermaidDiagram = async (diagramId: string) => {
    try {
      const diagramElement = document.getElementById(diagramId);
      if (!diagramElement) return;

      const svgElement = diagramElement.querySelector('svg');
      if (!svgElement) return;

      const svgData = new XMLSerializer().serializeToString(svgElement);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml' });

      const url = URL.createObjectURL(svgBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `mermaid-diagram-${Date.now()}.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download diagram:', err);
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

    return (
      <div className="my-4 relative group">
        <button
          onClick={() => copyToClipboard(code)}
          className="absolute top-2 right-2 p-2 bg-gray-700 hover:bg-gray-600 rounded opacity-80 hover:opacity-100 transition-opacity z-10 flex items-center space-x-1 text-xs text-gray-300 hover:text-white"
          title="Copy code"
        >
          <Copy size={14} />
          <span>Copy</span>
        </button>
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
            overflowX: 'auto',
            maxWidth: '100%',
          }}
          wrapLines={true}
          wrapLongLines={true}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    );
  };

  const processLatexInContent = (content: string): React.ReactNode => {
    const hasBlockLatex = /\$\$([^$]+)\$\$/.test(content);
    const hasInlineLatex = /\$([^$\n]+)\$/.test(content);

    if (!hasBlockLatex && !hasInlineLatex) {
      const html = String(marked.parse(content));
      const sanitizedHtml = DOMPurify.sanitize(html);
      return <div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />;
    }

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
    let sanitizedHtml = DOMPurify.sanitize(html);

    // Create a component that will replace placeholders with LaTeX
    const LatexProcessor = ({ html }: { html: string }) => {
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
              processedHtml = processedHtml.replace(
                placeholder,
                `<div class="my-4 text-center">${latexHtml}</div>`
              );
            } else {
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

  const renderContent = (content: string) => {
    // Check for code blocks
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)\n```/g;
    const hasCodeBlocks = codeBlockRegex.test(content);

    if (hasCodeBlocks) {
      const parts: JSX.Element[] = [];
      let lastIndex = 0;

      const allBlocks: Array<{
        type: 'code';
        match: RegExpExecArray;
        language?: string;
        content: string;
      }> = [];

      // Find code blocks
      const codeRegex = /```(\w+)?\n([\s\S]*?)\n```/g;
      let codeMatch;
      while ((codeMatch = codeRegex.exec(content)) !== null) {
        allBlocks.push({
          type: 'code',
          match: codeMatch,
          language: codeMatch[1],
          content: codeMatch[2],
        });
      }

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
                className="prose prose-invert prose-sm max-w-full overflow-hidden"
              >
                {processLatexInContent(beforeContent)}
              </div>
            );
          }
        }

        // Add the block
        parts.push(
          <div key={`code-${blockId}`}>
            {renderCodeBlock(block.content, block.language)}
          </div>
        );

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
              className="prose prose-invert prose-sm max-w-full overflow-hidden"
            >
              {processLatexInContent(afterContent)}
            </div>
          );
        }
      }

      return <div ref={mermaidRef}>{parts}</div>;
    } else {
      return (
        <div className="prose prose-invert prose-sm max-w-full overflow-hidden">
          {processLatexInContent(content)}
        </div>
      );
    }
  };

  return (
    <>
      <MermaidModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        mermaidCode={modalMermaidCode}
      />
      <div
        className="prose prose-invert max-w-none p-6 bg-gray-800 text-dark-text-primary h-full overflow-auto"
        style={
          {
            // Custom CSS for better markdown styling in dark mode
            '--tw-prose-body': '#f3f4f6',
            '--tw-prose-headings': '#ffffff',
            '--tw-prose-lead': '#d1d5db',
            '--tw-prose-links': '#60a5fa',
            '--tw-prose-bold': '#ffffff',
            '--tw-prose-counters': '#a3a3a3',
            '--tw-prose-bullets': '#a3a3a3',
            '--tw-prose-hr': '#404040',
            '--tw-prose-quotes': '#d1d5db',
            '--tw-prose-quote-borders': '#404040',
            '--tw-prose-captions': '#a3a3a3',
            '--tw-prose-code': '#f3f4f6',
            '--tw-prose-pre-code': '#f3f4f6',
            '--tw-prose-pre-bg': '#262626',
            '--tw-prose-th-borders': '#404040',
            '--tw-prose-td-borders': '#404040',
          } as React.CSSProperties
        }
      >
        {renderContent(content)}
      </div>
    </>
  );
}
