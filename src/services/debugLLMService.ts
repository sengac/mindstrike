import type { RenderableContent } from './responseValidator';

export interface DebugRequest {
  originalContent: string;
  errorType: string;
  errorMessage: string;
  contentType: 'mermaid' | 'latex' | 'code' | 'markdown' | 'image';
  language?: string;
}

export interface DebugResponse {
  success: boolean;
  fixedContent?: string;
  explanation?: string;
  error?: string;
}

/**
 * Service for connecting to LLM to fix rendering errors
 */
export class DebugLLMService {
  private static readonly MAX_RETRIES = 3;
  private static readonly DEBUG_ENDPOINT = '/api/debug-fix';

  /**
   * Request a fix for broken renderable content
   */
  static async requestFix(
    item: RenderableContent,
    validationError: string,
    retryCount = 0
  ): Promise<DebugResponse> {
    if (retryCount >= this.MAX_RETRIES) {
      return {
        success: false,
        error: `Max retry attempts (${this.MAX_RETRIES}) exceeded`,
      };
    }

    const debugRequest: DebugRequest = {
      originalContent: item.content,
      errorType: item.type,
      errorMessage: validationError,
      contentType: item.type,
      language: item.language,
    };

    try {
      const response = await fetch(this.DEBUG_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          request: debugRequest,
          retryCount,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `HTTP error! status: ${response.status}`
        );
      }

      const result = await response.json();
      return result;
    } catch (error) {
      return {
        success: false,
        error: `Debug LLM request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Generate a comprehensive fix prompt for the LLM
   */
  static generateFixPrompt(request: DebugRequest): string {
    const basePrompt = `You are a debugging assistant helping to fix rendering errors in content. A piece of ${request.contentType} content failed to render with the following error:

ERROR: ${request.errorMessage}

ORIGINAL CONTENT:
\`\`\`${request.language || request.contentType}
${request.originalContent}
\`\`\`

Please analyze the error and provide a corrected version of the content. Focus only on fixing the specific issue mentioned in the error while preserving the original intent and structure as much as possible.

Your response should contain ONLY the corrected content within a code block of the same type. Do not include explanations, comments, or additional text outside the code block.`;

    // Add content-specific guidance
    switch (request.contentType) {
      case 'mermaid':
        return (
          basePrompt +
          `

Common Mermaid issues to check:
- Syntax errors in node definitions
- Missing arrows or connections
- Invalid characters in node names
- Incorrect diagram type declarations
- Missing quotes around labels with spaces

Respond with only the corrected Mermaid diagram:
\`\`\`mermaid
[corrected diagram here]
\`\`\``
        );

      case 'latex':
        return (
          basePrompt +
          `

Common LaTeX issues to check:
- Unmatched braces or brackets
- Invalid command syntax
- Missing required packages/commands
- Incorrect mathematical notation
- Invalid escape sequences

Respond with only the corrected LaTeX:
\`\`\`latex
[corrected LaTeX here]
\`\`\``
        );

      case 'code':
        return (
          basePrompt +
          `

Common ${request.language ?? 'code'} issues to check:
- Syntax errors
- Missing brackets, parentheses, or quotes
- Invalid indentation
- Typos in keywords or function names
- Missing semicolons or other required punctuation

Respond with only the corrected code:
\`\`\`${request.language ?? 'text'}
[corrected code here]
\`\`\``
        );

      default:
        return basePrompt;
    }
  }
}
