import { User, Bot, Wrench, CheckCircle, XCircle, ChevronDown, ChevronRight, FileText, Code, Trash2 } from 'lucide-react';
import { ConversationMessage } from '../types';
import { useState, useEffect, useRef } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import mermaid from 'mermaid';

interface ChatMessageProps {
  message: ConversationMessage;
  onDelete?: () => void;
}

export function ChatMessage({ message, onDelete }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const [toolCallsExpanded, setToolCallsExpanded] = useState(false);
  const [resultsExpanded, setResultsExpanded] = useState(false);
  const [showMarkdown, setShowMarkdown] = useState(true);
  const mermaidRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Initialize mermaid
    mermaid.initialize({
      startOnLoad: true,
      theme: 'dark',
      securityLevel: 'loose',
      flowchart: {
        useMaxWidth: true,
        htmlLabels: true
      }
    });
    
    // Re-render mermaid diagrams when content changes
    if (mermaidRef.current) {
      const mermaidElements = mermaidRef.current.querySelectorAll('.mermaid');
      mermaidElements.forEach((element) => {
        mermaid.run({
          nodes: [element as HTMLElement]
        });
      });
    }
  }, [message.content]);

  const renderContent = (content: string) => {
    if (showMarkdown) {
      // Check for mermaid code blocks
      const mermaidRegex = /```mermaid\n([\s\S]*?)\n```/g;
      const hasMermaid = mermaidRegex.test(content);
      
      if (hasMermaid) {
        const parts: JSX.Element[] = [];
        let lastIndex = 0;
        const regex = /```mermaid\n([\s\S]*?)\n```/g;
        let match;
        let mermaidId = 0;
        
        while ((match = regex.exec(content)) !== null) {
          // Add content before mermaid
          if (match.index > lastIndex) {
            const beforeContent = content.slice(lastIndex, match.index);
            if (beforeContent.trim()) {
              const html = String(marked.parse(beforeContent));
              const sanitizedHtml = DOMPurify.sanitize(html);
              parts.push(
                <div key={`before-${mermaidId}`} className="prose prose-invert prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
              );
            }
          }
          
          // Add mermaid diagram
          const mermaidCode = match[1];
          const diagramId = `mermaid-${Date.now()}-${mermaidId}`;
          parts.push(
            <div key={`mermaid-${mermaidId}`} className="my-4">
              <div id={diagramId} className="mermaid bg-white p-4 rounded border">
                {mermaidCode}
              </div>
            </div>
          );
          
          lastIndex = match.index + match[0].length;
          mermaidId++;
        }
        
        // Add remaining content after last mermaid
        if (lastIndex < content.length) {
          const afterContent = content.slice(lastIndex);
          if (afterContent.trim()) {
            const html = String(marked.parse(afterContent));
            const sanitizedHtml = DOMPurify.sanitize(html);
            parts.push(
              <div key="after" className="prose prose-invert prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
            );
          }
        }
        
        return <div ref={mermaidRef}>{parts}</div>;
      } else {
        const html = String(marked.parse(content));
        const sanitizedHtml = DOMPurify.sanitize(html);
        return <div className="prose prose-invert prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />;
      }
    }
    return <div className="whitespace-pre-wrap text-sm">{content}</div>;
  };

  return (
    <div className={`flex space-x-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="flex-shrink-0">
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
            <Bot size={16} className="text-white" />
          </div>
        </div>
      )}
      
      <div className={`max-w-[80%] ${isUser ? 'order-2' : ''}`}>
        <div className={`rounded-lg px-4 py-2 relative group ${
          isUser 
            ? 'bg-blue-600 text-white' 
            : 'bg-gray-800 border border-gray-700'
        }`}>
          {onDelete && (
            <button
              onClick={onDelete}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-600 rounded"
              title="Delete message"
            >
              <Trash2 size={12} />
            </button>
          )}
          {!isUser && (
            <div className="flex items-center justify-between mb-2 border-b border-gray-700 pb-2">
              <div className="flex space-x-1">
                <button
                  onClick={() => setShowMarkdown(true)}
                  className={`flex items-center space-x-1 px-2 py-1 rounded text-xs transition-colors ${
                    showMarkdown 
                      ? 'bg-blue-600 text-white' 
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <FileText size={12} />
                  <span>Markdown</span>
                </button>
                <button
                  onClick={() => setShowMarkdown(false)}
                  className={`flex items-center space-x-1 px-2 py-1 rounded text-xs transition-colors ${
                    !showMarkdown 
                      ? 'bg-blue-600 text-white' 
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <Code size={12} />
                  <span>Raw</span>
                </button>
              </div>
            </div>
          )}
          {renderContent(message.content)}
          
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
              {toolCallsExpanded && message.toolCalls.map((toolCall, index) => (
                <div key={index} className="bg-gray-700 rounded p-2 text-xs">
                  <div className="flex items-center space-x-2 mb-1">
                    <Wrench size={12} />
                    <span className="font-medium">{toolCall.name}</span>
                  </div>
                  <pre className="text-gray-300 overflow-x-auto">
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
              {resultsExpanded && message.toolResults.map((result, index) => (
                <div key={index} className="bg-gray-700 rounded p-2 text-xs">
                  <div className="flex items-center space-x-2 mb-1">
                    {result.result.success ? (
                      <CheckCircle size={12} className="text-green-400" />
                    ) : (
                      <XCircle size={12} className="text-red-400" />
                    )}
                    <span className="font-medium">{result.name}</span>
                  </div>
                  <div className="text-gray-300">
                    {result.result.success ? (
                      <pre className="overflow-x-auto whitespace-pre-wrap">
                        {result.result.output || 'Success'}
                      </pre>
                    ) : (
                      <div className="text-red-300">
                        {result.result.error}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className={`text-xs text-gray-500 mt-1 ${isUser ? 'text-right' : 'text-left'}`}>
          {message.timest.toLocaleTimeString()}
        </div>
      </div>
      
      {isUser && (
        <div className="flex-shrink-0 order-1">
          <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center">
            <User size={16} className="text-white" />
          </div>
        </div>
      )}
    </div>
  );
}
