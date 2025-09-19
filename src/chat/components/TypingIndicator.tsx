import React from 'react';
import { Bot } from 'lucide-react';

interface TypingIndicatorProps {
  className?: string;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({
  className = '',
}) => {
  return (
    <div className={`flex space-x-3 justify-start ${className}`}>
      {/* Assistant avatar - matching ChatMessage styling */}
      <div className="flex-shrink-0">
        <div className="w-8 h-8 border-2 border-purple-400 bg-gradient-to-br from-purple-500 to-blue-600 rounded-full flex items-center justify-center shadow-lg">
          <Bot size={16} className="text-white drop-shadow-sm" />
        </div>
      </div>

      {/* Typing bubble */}
      <div className="max-w-[80%] min-w-[80%]">
        <div className="bg-gray-800 rounded-lg px-4 py-3 inline-block">
          <div className="flex space-x-1">
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
          </div>
        </div>
      </div>
    </div>
  );
};
