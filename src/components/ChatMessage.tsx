import { User, Bot, Wrench, CheckCircle, XCircle, ChevronDown, ChevronRight, FileText, Code } from 'lucide-react';
import { ConversationMessage } from '../types';
import { useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

interface ChatMessageProps {
  message: ConversationMessage;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const [toolCallsExpanded, setToolCallsExpanded] = useState(false);
  const [resultsExpanded, setResultsExpanded] = useState(false);
  const [showMarkdown, setShowMarkdown] = useState(true);

  const renderContent = (content: string) => {
    if (showMarkdown) {
      const html = marked(content);
      const sanitizedHtml = DOMPurify.sanitize(html);
      return <div className="prose prose-invert prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />;
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
        <div className={`rounded-lg px-4 py-2 ${
          isUser 
            ? 'bg-blue-600 text-white' 
            : 'bg-gray-800 border border-gray-700'
        }`}>
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
