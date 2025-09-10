import { useEffect, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

interface MarkdownViewerProps {
  content: string;
}

export function MarkdownViewer({ content }: MarkdownViewerProps) {
  const [html, setHtml] = useState<string>('');

  useEffect(() => {
    const parseMarkdown = async () => {
      try {
        // Configure marked for better rendering
        marked.setOptions({
          breaks: true,
          gfm: true, // GitHub Flavored Markdown
        });

        // Configure renderer to open external links in new window
        const renderer = new marked.Renderer();
        const originalLinkRenderer = renderer.link;
        renderer.link = function(href, title, text) {
          const link = originalLinkRenderer.call(this, href, title, text);
          // Check if it's an external link (starts with http:// or https://)
          if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
            return link.replace('<a ', '<a target="_blank" rel="noopener noreferrer" ');
          }
          return link;
        };

        marked.setOptions({ renderer });

        const rawHtml = await marked(content);
        const cleanHtml = DOMPurify.sanitize(rawHtml);
        setHtml(cleanHtml);
      } catch (error) {
        console.error('Error parsing markdown:', error);
        setHtml('<p>Error rendering markdown</p>');
      }
    };

    parseMarkdown();
  }, [content]);

  return (
    <div 
      className="prose prose-invert max-w-none p-6 bg-gray-900 text-gray-100 h-full overflow-auto"
      dangerouslySetInnerHTML={{ __html: html }}
      style={{
        // Custom CSS for better markdown styling in dark mode
        '--tw-prose-body': '#f3f4f6',
        '--tw-prose-headings': '#ffffff',
        '--tw-prose-lead': '#d1d5db',
        '--tw-prose-links': '#60a5fa',
        '--tw-prose-bold': '#ffffff',
        '--tw-prose-counters': '#9ca3af',
        '--tw-prose-bullets': '#9ca3af',
        '--tw-prose-hr': '#374151',
        '--tw-prose-quotes': '#d1d5db',
        '--tw-prose-quote-borders': '#374151',
        '--tw-prose-captions': '#9ca3af',
        '--tw-prose-code': '#f3f4f6',
        '--tw-prose-pre-code': '#f3f4f6',
        '--tw-prose-pre-bg': '#1f2937',
        '--tw-prose-th-borders': '#374151',
        '--tw-prose-td-borders': '#374151',
      } as React.CSSProperties}
    />
  );
}
