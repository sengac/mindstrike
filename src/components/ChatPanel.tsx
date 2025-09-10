import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Send, Loader2, Github, Youtube, Trash2, User } from 'lucide-react';
import { MindStrikeIcon } from './MindStrikeIcon';
import { ChatMessage } from './ChatMessage';
import { PersonalityModal } from './PersonalityModal';

import { useChat } from '../hooks/useChat';
import { useAppStore } from '../store/useAppStore';
import { ConversationMessage, Thread } from '../types';

interface ChatPanelProps {
  threadId?: string;
  messages?: ConversationMessage[];
  onMessagesUpdate?: (messages: ConversationMessage[]) => void;
  onFirstMessage?: () => void;
  onDeleteMessage?: (messageId: string) => void;
  activeThread?: Thread | null;
  onRoleUpdate?: (threadId: string, customRole?: string) => void;
}

export interface ChatPanelRef {
  clearConversation: () => void;
}

export const ChatPanel = forwardRef<ChatPanelRef, ChatPanelProps>(({ threadId, messages: initialMessages = [], onMessagesUpdate, onFirstMessage, onDeleteMessage, activeThread, onRoleUpdate }, ref) => {
  const [input, setInput] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showPersonalityModal, setShowPersonalityModal] = useState(false);
  const [defaultRole, setDefaultRole] = useState('');
  const { fontSize, workspaceRoot, defaultCustomRole } = useAppStore();
  const { messages, isLoading, sendMessage, clearConversation, regenerateMessage, cancelToolCalls, editMessage } = useChat({
    threadId,
    messages: initialMessages,
    onMessagesUpdate,
    onFirstMessage
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    clearConversation
  }));

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Scroll to bottom when thread changes (with delay for mermaid rendering)
  useEffect(() => {
    if (threadId) {
      // Delay scroll to allow mermaid diagrams to render
      setTimeout(() => {
        scrollToBottom();
      }, 100);
    }
  }, [threadId]);

  // Auto-focus input when loading finishes (response completes)
  useEffect(() => {
    if (!isLoading && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const message = input.trim();
    setInput('');
    await sendMessage(message);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [input]);

  // Fetch default role when component mounts or thread changes
  useEffect(() => {
    const fetchDefaultRole = async () => {
      try {
        const response = await fetch(`/api/role/${threadId || 'default'}`);
        if (response.ok) {
          const data = await response.json();
          setDefaultRole(data.defaultRole);
        }
      } catch (error) {
        console.error('Failed to fetch default role:', error);
      }
    };

    fetchDefaultRole();
  }, [threadId]);

  // Get current role from activeThread or fallback to default
  const currentRole = activeThread?.customRole || defaultCustomRole || defaultRole;

  const handleRoleChange = async (customRole?: string) => {
    const currentThreadId = threadId || 'default';
    
    // Update thread data through parent callback
    if (onRoleUpdate) {
      await onRoleUpdate(currentThreadId, customRole);
    }
    
    // Update server agent
    try {
      const response = await fetch(`/api/role/${currentThreadId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ customRole })
      });

      if (!response.ok) {
        console.error('Failed to update role on server');
      }
    } catch (error) {
      console.error('Failed to update role:', error);
    }
  };



  return (
    <div className="flex flex-col h-full flex-1 relative" key={`chat-panel-${fontSize}`}>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 relative" style={{ '--dynamic-font-size': `${fontSize}px` } as React.CSSProperties}>
        {messages.length === 0 && (
          <div className="text-center text-gray-500 mt-8">
            <div className="mb-4">
              <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <MindStrikeIcon className="text-white" size={64} />
              </div>
              <h3 className="text-lg font-medium mb-2">
                Welcome to <a 
                  href="https://mindstrike.ai" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-600 underline"
                >
                  MindStrike
                </a>
              </h3>
              <div className="flex justify-center space-x-4 mb-4">
                <a 
                  href="https://github.com/rquast/mindstrike" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-white transition-colors"
                  title="MindStrike GitHub Repository"
                >
                  <Github size={24} />
                </a>
                <a 
                  href="https://www.youtube.com/@mindstrike" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-red-500 transition-colors"
                  title="MindStrike YouTube Channel"
                >
                  <Youtube size={24} />
                </a>
              </div>
              <p className="text-sm">Start a conversation with your current workspace:</p>
              <p className="text-xs font-mono text-gray-400 mt-1">{workspaceRoot || 'No workspace selected'}</p>
            </div>
            <div className="text-left max-w-md mx-auto space-y-2 text-sm">
              <p className="font-medium">Try asking:</p>
              <ul className="space-y-1">
                <li>• "List the files in this directory"</li>
                <li>• "Read the package.json file"</li>
                <li>• "Create a simple React component"</li>
                <li>• "Help me fix this bug in my code"</li>
              </ul>
            </div>
          </div>
        )}
        
        {messages.map((message) => (
          <ChatMessage 
            key={message.id} 
            message={message} 
            fontSize={fontSize}
            onDelete={onDeleteMessage ? () => onDeleteMessage(message.id) : undefined}
            onRegenerate={message.role === 'assistant' ? () => regenerateMessage(message.id) : undefined}
            onEdit={message.role === 'user' ? (newContent: string) => editMessage(message.id, newContent) : undefined}
            onCancelToolCalls={
              message.status === 'processing' && message.toolCalls && message.toolCalls.length > 0 
                ? () => cancelToolCalls(message.id) 
                : undefined
            }
          />
        ))}
        
        {isLoading && (
          <div className="flex items-center space-x-2 text-gray-400">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">MindStrike is thinking...</span>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-700 p-4">
        <form onSubmit={handleSubmit} className="flex items-center space-x-4">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask MindStrike anything..."
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 pr-12 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent overflow-y-auto"
              style={{ overflowY: input.includes('\n') ? 'auto' : 'hidden' }}
              rows={1}
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="absolute right-2 bottom-2 p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              <Send size={16} className="text-white" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setShowPersonalityModal(true)}
            className="relative p-2 border border-gray-600 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-gray-200"
            title="Change personality"
          >
            <User size={16} />
            {activeThread?.customRole && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"></div>
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowClearConfirm(true)}
            disabled={messages.length === 0}
            className="p-2 border border-gray-600 hover:bg-gray-800 disabled:bg-gray-900 disabled:border-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors text-gray-400 hover:text-gray-200 disabled:text-gray-600"
            title="Clear conversation"
          >
            <Trash2 size={16} />
          </button>
        </form>
        <p className="text-xs text-gray-500 mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>

      {/* Clear Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-gray-600 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <Trash2 size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-white">Clear Conversation</h3>
                <p className="text-sm text-gray-400">This action cannot be undone.</p>
              </div>
            </div>
            
            <p className="text-gray-300 mb-6">
              Are you sure you want to clear the entire conversation? All messages will be permanently deleted.
            </p>
            
            <div className="flex space-x-3 justify-end">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  clearConversation();
                  setShowClearConfirm(false);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
              >
                Clear Chat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Personality Modal */}
      {showPersonalityModal && (
        <PersonalityModal
          isOpen={showPersonalityModal}
          onClose={() => setShowPersonalityModal(false)}
          currentRole={currentRole}
          defaultRole={defaultRole}
          onRoleChange={handleRoleChange}
        />
      )}
    </div>
  );
});
