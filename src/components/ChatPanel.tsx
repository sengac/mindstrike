import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { ChatMessage } from './ChatMessage';
import { useChat } from '../hooks/useChat';
import { usePreferences } from '../hooks/usePreferences';
import { ConversationMessage } from '../types';

interface ChatPanelProps {
  threadId?: string;
  messages?: ConversationMessage[];
  onMessagesUpdate?: (messages: ConversationMessage[]) => void;
  onFirstMessage?: () => void;
  onDeleteMessage?: (messageId: string) => void;
}

export function ChatPanel({ threadId, messages: initialMessages = [], onMessagesUpdate, onFirstMessage, onDeleteMessage }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const { fontSize, setFontSize } = usePreferences();
  const { messages, isLoading, sendMessage, clearConversation, regenerateMessage, cancelToolCalls, editMessage } = useChat({
    threadId,
    messages: initialMessages,
    onMessagesUpdate,
    onFirstMessage
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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



  return (
    <div className="flex flex-col h-full flex-1">

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ fontSize: `${fontSize}px` }}>
        {messages.length === 0 && (
          <div className="text-center text-gray-500 mt-8">
            <div className="mb-4">
              <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-white font-bold text-xl">P</span>
              </div>
              <h3 className="text-lg font-medium mb-2">Welcome to PowerAgent</h3>
              <p className="text-sm">Start a conversation with your local AI coding assistant</p>
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
            <span className="text-sm">PowerAgent is thinking...</span>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-700 p-4">
        <form onSubmit={handleSubmit} className="flex items-end space-x-2">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask PowerAgent anything..."
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
        </form>
        <p className="text-xs text-gray-500 mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
