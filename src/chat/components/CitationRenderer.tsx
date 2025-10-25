import { useRef, useState, useCallback, useMemo } from 'react';
import { FloatingTooltip } from '../../components/shared/FloatingTooltip';
import { ExternalLink } from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

interface CitationRendererProps {
  content: string;
  citations?: string[];
  className?: string;
}

/**
 * Renders content with interactive citation links that show tooltips and open in new tabs
 */
export function CitationRenderer({
  content,
  citations,
  className = '',
}: CitationRendererProps) {
  const [hoveredCitation, setHoveredCitation] = useState<number | null>(null);
  const citationRefs = useRef<Map<number, HTMLElement>>(new Map());

  const handleCitationClick = useCallback(
    (e: React.MouseEvent, citationIndex: number) => {
      e.preventDefault();
      e.stopPropagation();

      if (citations?.[citationIndex]) {
        const url = citations[citationIndex];
        // Open URL in new tab
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    },
    [citations]
  );

  const setCitationRef = useCallback(
    (index: number, el: HTMLElement | null) => {
      if (el) {
        citationRefs.current.set(index, el);
      } else {
        citationRefs.current.delete(index);
      }
    },
    []
  );

  // Process content to replace [^1], [^2] etc with interactive elements
  const processedContent = useMemo(() => {
    if (!citations || citations.length === 0) {
      // No citations, just render markdown normally
      const html = String(marked.parse(content));
      const sanitizedHtml = DOMPurify.sanitize(html);
      return <div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />;
    }

    // First, replace citation markers with placeholders to protect them from markdown processing
    // Handle both [^1] format (Perplexity style) and [1] format (standard)
    let processedText = content;
    const citationPlaceholders: string[] = [];

    // Try both citation formats: [^1] and [1]
    processedText = processedText.replace(/\[\^?(\d+)\]/g, (match, num) => {
      const placeholder = `CITATION_PLACEHOLDER_${citationPlaceholders.length}`;
      citationPlaceholders.push(num);
      return placeholder;
    });

    // Process markdown
    const html = String(marked.parse(processedText));
    let sanitizedHtml = DOMPurify.sanitize(html);

    // Now replace placeholders with citation buttons
    citationPlaceholders.forEach((num, index) => {
      const citationNumber = parseInt(num, 10);
      const citationIndex = citationNumber - 1;
      const placeholder = `CITATION_PLACEHOLDER_${index}`;

      if (citationIndex >= 0 && citationIndex < citations.length) {
        const citation = citations[citationIndex];

        // Extract domain from URL for display
        let displayDomain = 'Source';
        try {
          const url = new URL(citation);
          displayDomain = url.hostname.replace('www.', '');
        } catch {
          displayDomain =
            citation.substring(0, 30) + (citation.length > 30 ? '...' : '');
        }

        // Create the citation button HTML
        const buttonHtml = `<span class="citation-wrapper" data-citation-index="${citationIndex}">
          <button 
            class="citation-button inline-flex items-center px-1.5 py-0.5 mx-0.5 text-xs font-medium rounded-md transition-all duration-200 cursor-pointer bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
            data-citation-index="${citationIndex}"
            title="Click to open ${displayDomain}"
          >
            <span>${citationNumber}</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ml-0.5 inline-block">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </button>
        </span>`;

        sanitizedHtml = sanitizedHtml.replace(placeholder, buttonHtml);
      } else {
        // Fallback for invalid citation index
        sanitizedHtml = sanitizedHtml.replace(
          placeholder,
          `[^${citationNumber}]`
        );
      }
    });

    // Create a wrapper div with event handlers
    return (
      <div
        className={className}
        onClick={e => {
          const target = e.target as HTMLElement;
          const button = target.closest('.citation-button') as HTMLElement;
          if (button) {
            const index = parseInt(
              button.getAttribute('data-citation-index') || '0',
              10
            );
            handleCitationClick(e, index);
          }
        }}
        onMouseOver={e => {
          const target = e.target as HTMLElement;
          const button = target.closest('.citation-button') as HTMLElement;
          if (button) {
            const index = parseInt(
              button.getAttribute('data-citation-index') || '0',
              10
            );
            setHoveredCitation(index);
            setCitationRef(index, button);
          }
        }}
        onMouseOut={e => {
          const target = e.target as HTMLElement;
          const button = target.closest('.citation-button');
          if (button) {
            setHoveredCitation(null);
          }
        }}
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
    );
  }, [content, citations, handleCitationClick, setCitationRef]);

  return (
    <>
      {processedContent}
      {/* Floating tooltip */}
      {hoveredCitation !== null &&
        citationRefs.current.get(hoveredCitation) &&
        citations?.[hoveredCitation] && (
          <FloatingTooltip
            targetRef={{ current: citationRefs.current.get(hoveredCitation)! }}
            isVisible={true}
            placement="top"
            className="max-w-md"
          >
            <div className="space-y-2">
              <div className="text-xs font-semibold text-blue-300">
                Citation {hoveredCitation + 1}
              </div>
              <div className="text-xs text-gray-300 break-all">
                {citations[hoveredCitation]}
              </div>
              <div className="text-xs text-gray-400 italic">
                Click to open in new tab
              </div>
            </div>
          </FloatingTooltip>
        )}
    </>
  );
}
