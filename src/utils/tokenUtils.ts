import { formatBytesInteger } from './formatUtils';

/**
 * Convert context length (in tokens) to approximate memory size
 * This is a rough estimate based on typical token storage requirements
 */
export function formatContextLength(tokens: number): string {
  if (!tokens || tokens <= 0) {
    return 'N/A';
  }

  // Rough estimate: each token requires ~4 bytes in memory for context
  // This includes embeddings, attention weights, etc.
  const bytesPerToken = 4;
  const totalBytes = tokens * bytesPerToken;

  return formatBytesInteger(totalBytes);
}

/**
 * Format token count with thousands separator
 */
export function formatTokenCount(tokens: number): string {
  if (!tokens || tokens <= 0) {
    return 'N/A';
  }
  return tokens.toLocaleString();
}

/**
 * Get a short, human-readable context description
 */
export function getContextDescription(tokens: number): string {
  if (!tokens || tokens <= 0) {
    return '';
  }

  const memorySize = formatContextLength(tokens);
  const tokenCount = formatTokenCount(tokens);

  return `${tokenCount} tokens (${memorySize})`;
}

/**
 * Get the actual context size for a model, using the same priority logic as ModelCard:
 * 1. User settings (contextSize)
 * 2. GGUF metadata (maxContextLength)
 * 3. Model info (contextLength)
 * 4. Default (4096)
 */
interface ModelWithContext {
  loadingSettings?: {
    contextSize?: number;
  };
  maxContextLength?: number;
  contextLength?: number;
}

export function getActualContextSize(model: ModelWithContext): number {
  return (
    model.loadingSettings?.contextSize ||
    model.maxContextLength ||
    model.contextLength ||
    4096
  );
}
