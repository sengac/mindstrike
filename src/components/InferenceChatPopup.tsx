import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Brain, X, Send } from 'lucide-react';
import { clsx } from 'clsx';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface InferenceChatPopupProps {
  isOpen: boolean;
  onClose: () => void;
  nodeLabel: string;
  nodeId: string;
  position: { x: number; y: number } | null;
}

export function InferenceChatPopup({ isOpen, onClose, nodeLabel, nodeId, position }: InferenceChatPopupProps) {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [, forceUpdate] = useState({});
  const chatInputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Initialize chat when opening
  useEffect(() => {
    if (isOpen && chatMessages.length === 0) {
      setChatMessages([{
        role: 'assistant',
        content: `Hi! I'm here to help you explore inferences and insights about "${nodeLabel}". What would you like to know or discuss about this concept?`
      }]);
    }
  }, [isOpen, nodeLabel, chatMessages.length]);

  // Focus input when opening
  useEffect(() => {
    if (isOpen && chatInputRef.current) {
      setTimeout(() => {
        chatInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Handle clicking outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  // Handle window resize to reposition popup
  useEffect(() => {
    if (!isOpen) return;

    const handleResize = () => {
      // Force re-render to recalculate position
      forceUpdate({});
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isOpen]);

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

  if (!isOpen) return null;

  // Calculate smart position based on viewport boundaries (synchronously during render)
  const calculatePosition = (): React.CSSProperties => {
    if (!position) {
      return {
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 1000
      };
    }

    const popupWidth = 320; // 20rem = 320px
    const popupHeight = 400; // Approximate height including header + chat + footer
    const padding = 20; // Minimum distance from viewport edges
    
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let left = position.x - popupWidth - 10; // Default: to the left of the button
    let top = position.y - popupHeight / 2; // Default: centered vertically
    
    // Check if popup would go off the left edge
    if (left < padding) {
      // Try positioning to the right of the button
      left = position.x + 50; // 50px to account for button width and some spacing
      
      // If still off the right edge, center horizontally
      if (left + popupWidth > viewportWidth - padding) {
        left = Math.max(padding, (viewportWidth - popupWidth) / 2);
      }
    }
    
    // Check if popup would go off the right edge
    if (left + popupWidth > viewportWidth - padding) {
      left = viewportWidth - popupWidth - padding;
    }
    
    // Check if popup would go off the top edge
    if (top < padding) {
      top = padding;
    }
    
    // Check if popup would go off the bottom edge
    if (top + popupHeight > viewportHeight - padding) {
      top = viewportHeight - popupHeight - padding;
    }
    
    // Ensure we don't go negative
    left = Math.max(padding, left);
    top = Math.max(padding, top);

    return {
      position: 'fixed',
      left: left,
      top: top,
      zIndex: 1000
    };
  };

  const popupStyle = calculatePosition();

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-30 z-50" />
      
      {/* Popup */}
      <div
        ref={popupRef}
        className="w-80 bg-gray-800 border border-gray-600 rounded-lg shadow-xl"
        style={popupStyle}
      >
        <div className="p-3 border-b border-gray-600 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain size={16} className="text-blue-400" />
            <span className="text-white text-sm font-medium">AI Inferences</span>
            <span className="text-gray-400 text-xs">• {nodeLabel}</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        
        <div className="h-64 overflow-y-auto p-3 space-y-3">
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
        </div>
        
        <form onSubmit={handleChatSubmit} className="p-3 border-t border-gray-600">
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
    </>
  );
}
