export interface RenderableContent {
  type: 'mermaid' | 'code' | 'latex' | 'markdown' | 'image';
  content: string;
  language?: string;
  startIndex: number;
  endIndex: number;
  id: string;
}

export interface ValidationResult {
  success: boolean;
  error?: string;
  fixedContent?: string;
  retryCount?: number;
}

export interface ValidationReport {
  hasRenderableContent: boolean;
  renderableItems: RenderableContent[];
  validationResults: ValidationResult[];
  needsCorrection: boolean;
  finalContent?: string;
}

/**
 * Scans response content for renderable elements that need validation
 */
export class ResponseScanner {
  /**
   * Scans a message for renderable content that needs validation
   */
  static scanForRenderableContent(content: string): RenderableContent[] {
    const renderableItems: RenderableContent[] = [];

    // Scan for Mermaid diagrams
    const mermaidMatches = this.findMatches(
      content,
      /```mermaid\n([\s\S]*?)\n```/g
    );
    mermaidMatches.forEach((match, index) => {
      renderableItems.push({
        type: 'mermaid',
        content: match.content,
        startIndex: match.startIndex,
        endIndex: match.endIndex,
        id: `mermaid-${index}-${Date.now()}`,
      });
    });

    // Scan for other code blocks that might have syntax issues
    const codeMatches = this.findMatches(
      content,
      /```(\w+)?\n([\s\S]*?)\n```/g
    );
    codeMatches.forEach((match, index) => {
      const language = match.groups?.[0];
      if (language && language !== 'mermaid') {
        renderableItems.push({
          type: 'code',
          content: match.content,
          language,
          startIndex: match.startIndex,
          endIndex: match.endIndex,
          id: `code-${language}-${index}-${Date.now()}`,
        });
      }
    });

    // Scan for LaTeX expressions
    const latexBlockMatches = this.findMatches(content, /\$\$([^$]+)\$\$/g);
    latexBlockMatches.forEach((match, index) => {
      renderableItems.push({
        type: 'latex',
        content: match.content,
        startIndex: match.startIndex,
        endIndex: match.endIndex,
        id: `latex-block-${index}-${Date.now()}`,
      });
    });

    const latexInlineMatches = this.findMatches(content, /\$([^$\n]+)\$/g);
    latexInlineMatches.forEach((match, index) => {
      renderableItems.push({
        type: 'latex',
        content: match.content,
        startIndex: match.startIndex,
        endIndex: match.endIndex,
        id: `latex-inline-${index}-${Date.now()}`,
      });
    });

    return renderableItems.sort((a, b) => a.startIndex - b.startIndex);
  }

  private static findMatches(
    content: string,
    regex: RegExp
  ): Array<{
    content: string;
    startIndex: number;
    endIndex: number;
    groups?: string[];
  }> {
    const matches: Array<{
      content: string;
      startIndex: number;
      endIndex: number;
      groups?: string[];
    }> = [];

    let match;
    const globalRegex = new RegExp(regex.source, regex.flags);

    while ((match = globalRegex.exec(content)) !== null) {
      matches.push({
        content: match[1] || match[2] || match[0], // Get the captured group content
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        groups: match.slice(1),
      });
    }

    return matches;
  }
}

/**
 * Off-screen validator for testing renderable content
 */
export class OffScreenValidator {
  private static testContainer: HTMLElement | null = null;

  /**
   * Initialize the off-screen test container
   */
  static initialize() {
    if (!this.testContainer) {
      this.testContainer = document.createElement('div');
      this.testContainer.style.position = 'absolute';
      this.testContainer.style.top = '-9999px';
      this.testContainer.style.left = '-9999px';
      this.testContainer.style.visibility = 'hidden';
      this.testContainer.style.pointerEvents = 'none';
      this.testContainer.style.width = '800px'; // Give it realistic dimensions
      this.testContainer.style.height = '600px';
      this.testContainer.id = 'response-validator-container';
      document.body.appendChild(this.testContainer);
    }
  }

  /**
   * Validate a piece of renderable content off-screen
   */
  static async validateContent(
    item: RenderableContent
  ): Promise<ValidationResult> {
    this.initialize();

    if (!this.testContainer) {
      return { success: false, error: 'Failed to create test container' };
    }

    try {
      switch (item.type) {
        case 'mermaid':
          return await this.validateMermaid(item.content);
        case 'latex':
          return await this.validateLatex(item.content);
        case 'code':
          return this.validateCode(item.content, item.language);
        default:
          return { success: true };
      }
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown validation error',
      };
    }
  }

  private static async validateMermaid(
    content: string
  ): Promise<ValidationResult> {
    try {
      // Import mermaid dynamically to avoid issues
      const mermaid = (await import('mermaid')).default;

      // Create a test element
      const testElement = document.createElement('div');
      testElement.className = 'mermaid';
      testElement.textContent = content;
      this.testContainer!.appendChild(testElement);

      // Try to render
      await mermaid.run({ nodes: [testElement] });

      // Check if rendering succeeded (mermaid replaces text content with SVG)
      const hasValidSVG = testElement.querySelector('svg') !== null;

      // Cleanup
      this.testContainer!.removeChild(testElement);

      if (hasValidSVG) {
        return { success: true };
      } else {
        return {
          success: false,
          error: 'Mermaid failed to generate valid SVG',
        };
      }
    } catch (error) {
      return {
        success: false,
        error: `Mermaid validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  private static async validateLatex(
    content: string
  ): Promise<ValidationResult> {
    try {
      // Import katex dynamically
      const katex = (await import('katex')).default;

      // Try to render the LaTeX
      const result = katex.renderToString(content, {
        throwOnError: true,
        displayMode: content.includes('\\begin') || content.includes('\\end'),
        strict: false,
      });

      if (result && result.length > 0) {
        return { success: true };
      } else {
        return { success: false, error: 'LaTeX rendered empty result' };
      }
    } catch (error) {
      return {
        success: false,
        error: `LaTeX validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  private static validateCode(
    content: string,
    language?: string
  ): ValidationResult {
    // Basic validation for code blocks
    if (!content.trim()) {
      return { success: false, error: 'Empty code block' };
    }

    // Check for common syntax issues based on language
    if (language) {
      switch (language.toLowerCase()) {
        // TODO: fix this, it doesn't work properly
        // case 'json':
        //   try {
        //     JSON.parse(content);
        //   } catch (error) {
        //     return {
        //       success: false,
        //       error: `Invalid JSON: ${error instanceof Error ? error.message : 'Parse error'}`
        //     };
        //   }
        //   break;
        case 'javascript':
        case 'js':
          // Basic JS validation - check for obvious syntax errors
          if (content.includes('function') && !content.includes('{')) {
            return {
              success: false,
              error: 'Function declaration missing opening brace',
            };
          }
          break;
      }
    }

    return { success: true };
  }

  /**
   * Cleanup the test container
   */
  static cleanup() {
    if (this.testContainer) {
      document.body.removeChild(this.testContainer);
      this.testContainer = null;
    }
  }
}
