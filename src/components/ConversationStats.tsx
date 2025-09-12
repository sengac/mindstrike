import React from 'react';
import { BarChart3 } from 'lucide-react';
import { ConversationMessage } from '../types';
import { LLMModel } from '../hooks/useModels';
import { 
  calculateConversationTokens, 
  calculateConversationSize, 
  formatBytes,
  calculateContextUsage 
} from '../utils/conversationTokens';
import { formatTokenCount } from '../utils/tokenUtils';

interface ConversationStatsProps {
  messages: ConversationMessage[];
  selectedModel?: LLMModel;
}

export function ConversationStats({ messages, selectedModel }: ConversationStatsProps) {
  const tokenCount = calculateConversationTokens(messages);
  const conversationSize = calculateConversationSize(messages);
  const maxTokens = selectedModel?.contextLength || 0;
  const usagePercentage = calculateContextUsage(tokenCount, maxTokens);
  
  // Don't show if no messages
  if (messages.length === 0) return null;

  const getUsageColor = (percentage: number) => {
    if (percentage < 50) return 'text-green-400';
    if (percentage < 80) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="absolute bottom-4 right-4 bg-black bg-opacity-40 backdrop-blur-sm border border-gray-600 rounded-lg p-3 text-xs text-gray-300 z-40 max-w-xs pointer-events-none">
      <div className="flex items-center gap-2 mb-2">
        <BarChart3 size={14} className="text-gray-400" />
        <span className="font-medium">Conversation Stats</span>
      </div>
      
      <div className="space-y-1">
        <div className="flex justify-between">
          <span>Tokens:</span>
          <span className="font-mono">{formatTokenCount(tokenCount)}</span>
        </div>
        
        <div className="flex justify-between">
          <span>Size:</span>
          <span className="font-mono">{formatBytes(conversationSize)}</span>
        </div>
        
        {selectedModel && maxTokens > 0 && (
          <>
            <div className="flex justify-between">
              <span>Model:</span>
              <span className="font-mono text-gray-400 truncate max-w-[120px]" title={selectedModel.model}>
                {selectedModel.model}
              </span>
            </div>
            
            <div className="flex justify-between">
              <span>Context:</span>
              <span className="font-mono">{formatTokenCount(maxTokens)}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span>Usage:</span>
              <div className="flex items-center gap-1">
                <span className={`font-mono ${getUsageColor(usagePercentage)}`}>
                  {usagePercentage}%
                </span>
                <div className="w-12 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-300 ${
                      usagePercentage < 50 ? 'bg-green-400' :
                      usagePercentage < 80 ? 'bg-yellow-400' : 'bg-red-400'
                    }`}
                    style={{ width: `${Math.min(usagePercentage, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
