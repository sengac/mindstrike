import React from 'react';
import { BarChart3 } from 'lucide-react';
import { ConversationMessage } from '../types';
import { LLMModel } from '../hooks/useAvailableModels';
import { 
  calculateConversationTokens, 
  calculateConversationSize, 
  formatBytes,
  calculateContextUsage 
} from '../utils/conversationTokens';
import { formatTokenCount } from '../utils/tokenUtils';

interface HeaderStatsProps {
  messages: ConversationMessage[];
  selectedModel?: LLMModel;
}

export function HeaderStats({ messages, selectedModel }: HeaderStatsProps) {
  const tokenCount = calculateConversationTokens(messages);
  const conversationSize = calculateConversationSize(messages);
  const maxTokens = selectedModel?.contextLength || 0;
  const usagePercentage = calculateContextUsage(tokenCount, maxTokens);
  
  // Don't show if no messages
  if (messages.length === 0) return null;

  const getUsageColor = (percentage: number) => {
    if (percentage < 50) return 'bg-green-400';
    if (percentage < 80) return 'bg-yellow-400';
    return 'bg-red-400';
  };

  return (
    <div className="flex items-center gap-3 text-xs text-gray-400">
      <div className="flex items-center gap-1">
        <BarChart3 size={14} className="text-gray-500" />
        <span 
          className="font-mono" 
          title="Token count - approximate number of text tokens in this conversation"
        >
          {formatTokenCount(tokenCount)}
        </span>
        <span>•</span>
        <span 
          className="font-mono"
          title="Conversation size - total data size of messages, tool calls, and results"
        >
          {formatBytes(conversationSize)}
        </span>
      </div>
      
      {selectedModel && maxTokens > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-gray-500">Context:</span>
          <div 
            className="flex items-center gap-1"
            title={`Context usage - ${usagePercentage}% of ${formatTokenCount(maxTokens)} token context window used`}
          >
            <span className="font-mono">{usagePercentage}%</span>
            <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-300 ${getUsageColor(usagePercentage)}`}
                style={{ width: `${Math.min(usagePercentage, 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
