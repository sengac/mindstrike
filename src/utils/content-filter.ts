/**
 * Utility functions for filtering content on the client side
 */

/**
 * Remove <think></think> tags and their content from text
 */
export function stripThinkTags(content: string): string {
  if (!content) return content;

  // Remove <think>content</think> patterns, including multiline content
  return content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

/**
 * Clean content for LLM consumption by removing internal tags
 */
export function cleanContentForLLM(content: string): string {
  return stripThinkTags(content);
}
