import { useState, useRef, useEffect } from 'react';
import { Brain, Send } from 'lucide-react';
import { clsx } from 'clsx';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface InferenceChatContentProps {
  nodeLabel: string;
  nodeId: string;
}

export function InferenceChatContent({ nodeLabel, nodeId }: InferenceChatContentProps) {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize chat when component mounts
  useEffect(() => {
    if (chatMessages.length === 0) {
      setChatMessages([{
        role: 'assistant',
        content: `Hi! I'm here to help you explore inferences and insights about "${nodeLabel}". What would you like to know or discuss about this concept?`
      }]);
    }
  }, [nodeLabel, chatMessages.length]);

  // Focus input when component mounts
  useEffect(() => {
    if (chatInputRef.current) {
      setTimeout(() => {
        chatInputRef.current?.focus();
      }, 100);
    }
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isLoading) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setIsLoading(true);

    const newMessages = [...chatMessages, { role: 'user' as const, content: userMessage }];
    setChatMessages(newMessages);

    try {
      const response = await fetch('/api/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `I need insights and inferences about the concept "${nodeLabel}". The user asks: ${userMessage}. Please provide thoughtful analysis, connections to related ideas, potential applications, and deeper implications about this concept.`,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      const assistantMessage = result.content || result.message || 'I apologize, but I could not generate a response at this time.';
      
      setChatMessages([...newMessages, { role: 'assistant', content: assistantMessage }]);
    } catch (error) {
      console.error('Error calling AI API:', error);
      setChatMessages([...newMessages, { role: 'assistant', content: 'Sorry, I encountered an error connecting to the AI service. Please try again.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSubmit(e);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 p-3 border-b border-gray-600 flex items-center gap-2">
        <Brain size={16} className="text-blue-400" />
        <span className="text-white text-sm font-medium">Node Panel</span>
        <span className="text-gray-400 text-xs">• {nodeLabel}</span>
      </div>
      
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {chatMessages.map((message, index) => (
          <div
            key={index}
            className={clsx(
              'p-2 rounded text-sm',
              message.role === 'user'
                ? 'bg-blue-600 text-white ml-8'
                : 'bg-gray-700 text-gray-100 mr-8'
            )}
          >
            {message.content}
          </div>
        ))}
        {isLoading && (
          <div className="bg-gray-700 text-gray-100 p-2 rounded text-sm mr-8">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Input */}
      <form onSubmit={handleChatSubmit} className="flex-shrink-0 p-3 border-t border-gray-600">
        <div className="flex gap-2">
          <input
            ref={chatInputRef}
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={handleChatKeyDown}
            placeholder="Ask about this concept..."
            className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-blue-400"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!chatInput.trim() || isLoading}
            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={14} />
          </button>
        </div>
      </form>
    </div>
  );
}
