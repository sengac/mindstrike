import { User, Bot, Wrench, CheckCircle, XCircle, ChevronDown, ChevronRight, FileText, Code, Trash2, RotateCcw, Loader2, X, Edit2, Check } from 'lucide-react';
import { ConversationMessage } from '../types';
import { useState, useEffect, useRef } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import mermaid from 'mermaid';

interface ChatMessageProps {
  message: ConversationMessage;
  onDelete?: () => void;
  onRegenerate?: () => void;
  onCancelToolCalls?: () => void;
  onEdit?: (newContent: string) => void;
}

export function ChatMessage({ message, onDelete, onRegenerate, onCancelToolCalls, onEdit }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const [toolCallsExpanded, setToolCallsExpanded] = useState(false);
  const [resultsExpanded, setResultsExpanded] = useState(false);
  const [showMarkdown, setShowMarkdown] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const mermaidRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  useEffect(() => {
    // Focus and auto-resize textarea when editing starts
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [isEditing]);

  const handleEditSubmit = () => {
    if (onEdit && editContent.trim() !== message.content) {
      onEdit(editContent.trim());
    }
    setIsEditing(false);
  };

  const handleEditCancel = () => {
    setEditContent(message.content);
    setIsEditing(false);
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
          {((onDelete || onEdit) && isUser) || (onRegenerate && !isUser) ? (
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-1">
              {onRegenerate && !isUser && (
                <button
                  onClick={onRegenerate}
                  className="p-1 hover:bg-blue-600 rounded"
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
                  onClick={onDelete}
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
          
          {/* Processing interface for tool calls */}
          {(message.status === 'processing' && message.toolCalls && message.toolCalls.length > 0) && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Loader2 size={16} className="animate-spin text-blue-400" />
                  <span className="text-sm font-medium">Processing {message.toolCalls.length} tool call{message.toolCalls.length > 1 ? 's' : ''}...</span>
                </div>
                {onCancelToolCalls && (
                  <button
                    onClick={onCancelToolCalls}
                    className="flex items-center space-x-1 px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs transition-colors ml-4"
                  >
                    <X size={12} />
                    <span>Cancel</span>
                  </button>
                )}
              </div>
              
              <div className="space-y-2">
                {message.toolCalls.map((toolCall, index) => (
                  <div key={index} className="bg-gray-700 rounded p-3 border-l-4 border-blue-500">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Wrench size={14} className="text-blue-400" />
                        <span className="font-medium text-sm">{toolCall.name}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Loader2 size={12} className="animate-spin text-blue-400" />
                        <span className="text-xs text-gray-400">Running...</span>
                      </div>
                    </div>
                    {Object.keys(toolCall.parameters).length > 0 && (
                      <div className="mt-2 text-xs text-gray-300">
                        <div className="font-medium mb-1">Parameters:</div>
                        <pre className="text-gray-400 overflow-x-auto bg-gray-800 p-2 rounded">
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
          {!(message.status === 'processing' && message.toolCalls && message.toolCalls.length > 0) && (
            <>
              {isEditing && isUser ? (
                <div className="space-y-2">
                  <textarea
                    ref={textareaRef}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full bg-blue-700 text-white border border-blue-500 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
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
                  <div className="text-xs text-blue-200">
                    Press Ctrl+Enter to save, Escape to cancel
                  </div>
                </div>
              ) : (
                renderContent(message.content)
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
        <div className="flex-shrink-0">
          <div className="w-8 h-8 mr-3 bg-gray-600 rounded-full flex items-center justify-center">
            <User size={16} className="text-white" />
          </div>
        </div>
      )}
    </div>
  );
}
