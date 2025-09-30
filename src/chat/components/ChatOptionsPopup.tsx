import React, { useState, useRef, useEffect } from 'react';
import { ChevronUp, Settings, Trash2, Terminal, Bot } from 'lucide-react';

interface ChatOptionsPopupProps {
  onClearConversation?: () => void;
  messagesLength?: number;
  onCustomizePrompts?: () => void;
  onToggleAgentMode?: () => void;
  hasCustomPrompt?: boolean;
  isAgentActive?: boolean;
}

const ChatOptionsPopup: React.FC<ChatOptionsPopupProps> = ({
  onClearConversation,
  messagesLength = 0,
  onCustomizePrompts,
  onToggleAgentMode,
  hasCustomPrompt = false,
  isAgentActive = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleClearConversation = () => {
    onClearConversation?.();
    setIsOpen(false);
  };

  const handleCustomizePrompts = () => {
    onCustomizePrompts?.();
    setIsOpen(false);
  };

  const handleToggleAgentMode = () => {
    onToggleAgentMode?.();
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 bg-gray-600 hover:bg-gray-700 rounded-md transition-colors text-white flex items-center gap-1"
        title="Chat Options"
      >
        <Settings size={14} />
        <ChevronUp
          size={14}
          className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          ref={popupRef}
          className="absolute bottom-full left-0 mb-2 w-80 bg-dark-bg border border-gray-600 rounded-lg shadow-lg z-50"
        >
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Settings size={16} className="text-gray-400" />
              <h3 className="text-sm font-medium text-gray-200">
                Chat Options
              </h3>
            </div>

            <div className="space-y-2">
              <button
                onClick={handleCustomizePrompts}
                className="w-full flex items-center gap-3 p-3 bg-dark-hover hover:bg-gray-700 rounded-lg transition-colors text-left group relative"
              >
                <div className="shrink-0 text-purple-400 group-hover:text-purple-300">
                  <Terminal size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-200 group-hover:text-white">
                    Customize Prompts
                  </div>
                  <div className="text-xs text-gray-400 truncate">
                    Set custom system prompts
                  </div>
                </div>
                {hasCustomPrompt && (
                  <div className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full"></div>
                )}
              </button>

              <button
                onClick={handleToggleAgentMode}
                className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all duration-300 text-left group relative ${
                  isAgentActive
                    ? 'bg-blue-900/30 hover:bg-blue-900/40'
                    : 'bg-dark-hover hover:bg-gray-700'
                }`}
              >
                <div
                  className={`shrink-0 transition-all duration-300 ${
                    isAgentActive
                      ? 'text-blue-300 group-hover:text-blue-200'
                      : 'text-blue-400 group-hover:text-blue-300'
                  }`}
                >
                  <Bot
                    size={16}
                    className={isAgentActive ? 'animate-pulse' : ''}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className={`text-sm font-medium transition-colors ${
                      isAgentActive
                        ? 'text-blue-200 group-hover:text-blue-100'
                        : 'text-gray-200 group-hover:text-white'
                    }`}
                  >
                    Agent Mode
                  </div>
                  <div
                    className={`text-xs truncate ${
                      isAgentActive ? 'text-blue-300/70' : 'text-gray-400'
                    }`}
                  >
                    {isAgentActive
                      ? 'Active - Click to disable'
                      : 'Switch to workflow execution mode'}
                  </div>
                </div>
                {isAgentActive && (
                  <div className="absolute inset-0 rounded-lg bg-blue-400/20 animate-ping"></div>
                )}
              </button>

              <button
                onClick={handleClearConversation}
                disabled={messagesLength === 0}
                className="w-full flex items-center gap-3 p-3 bg-dark-hover hover:bg-gray-700 disabled:bg-gray-800 disabled:cursor-not-allowed rounded-lg transition-colors text-left group"
              >
                <div className="shrink-0 text-red-400 group-hover:text-red-300 group-disabled:text-gray-500">
                  <Trash2 size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-200 group-hover:text-white group-disabled:text-gray-500">
                    Clear Conversation
                  </div>
                  <div className="text-xs text-gray-400 group-disabled:text-gray-600 truncate">
                    Delete all messages in this chat
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatOptionsPopup;
