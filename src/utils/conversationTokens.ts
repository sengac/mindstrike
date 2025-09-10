import { ConversationMessage } from '../types';
export { formatBytes } from './formatUtils';

/**
 * Estimates token count for a text string using a simple heuristic
 * This is an approximation since exact tokenization depends on the specific model
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  
  // Rough heuristic: average ~4 characters per token for English text
  // This varies by model but gives a reasonable estimate
  const avgCharsPerToken = 4;
  return Math.ceil(text.length / avgCharsPerToken);
}

/**
 * Calculate total token count for a conversation
 */
export function calculateConversationTokens(messages: ConversationMessage[]): number {
  return messages.reduce((total, message) => {
    let messageTokens = estimateTokenCount(message.content);
    
    // Add tokens for tool calls if present
    if (message.toolCalls) {
      const toolCallText = message.toolCalls.map(tc => 
        JSON.stringify(tc)
      ).join('');
      messageTokens += estimateTokenCount(toolCallText);
    }
    
    // Add tokens for tool results if present  
    if (message.toolResults) {
      const toolResultText = message.toolResults.map(tr => 
        JSON.stringify(tr.result)
      ).join('');
      messageTokens += estimateTokenCount(toolResultText);
    }
    
    return total + messageTokens;
  }, 0);
}

/**
 * Calculate approximate size in bytes for the conversation
 */
export function calculateConversationSize(messages: ConversationMessage[]): number {
  return messages.reduce((total, message) => {
    // Calculate size of message content
    let messageSize = new Blob([message.content]).size;
    
    // Add size for tool calls
    if (message.toolCalls) {
      messageSize += new Blob([JSON.stringify(message.toolCalls)]).size;
    }
    
    // Add size for tool results
    if (message.toolResults) {
      messageSize += new Blob([JSON.stringify(message.toolResults)]).size;
    }
    
    return total + messageSize;
  }, 0);
}



/**
 * Calculate context usage percentage
 */
export function calculateContextUsage(usedTokens: number, maxTokens: number): number {
  if (!maxTokens || maxTokens <= 0) return 0;
  return Math.round((usedTokens / maxTokens) * 100);
}
