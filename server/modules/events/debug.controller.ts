import {
  Controller,
  Post,
  Body,
  HttpStatus,
  HttpCode,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { EventsService } from './events.service';
import { AgentPoolService } from '../agents/services/agent-pool.service';

@ApiTags('debug')
@Controller('api')
export class DebugController {
  private readonly logger = new Logger(DebugController.name);

  constructor(
    private readonly eventsService: EventsService,
    private readonly agentPoolService: AgentPoolService
  ) {}

  @Post('debug-fix')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'AI-Powered Content Debugging and Auto-Repair',
    description: `
      **Intelligent Content Debugging Service**
      
      This endpoint provides AI-powered debugging and automatic repair for content that fails to render correctly. 
      It uses advanced LLM analysis to identify issues and generate corrected versions of broken content.

      **Supported Content Types:**
      
      🔧 **Mermaid Diagrams** - Fixes syntax errors, invalid node definitions, missing connections, incorrect arrows, invalid characters in names, missing quotes around labels
      
      📐 **LaTeX Mathematical Expressions** - Corrects unmatched braces/brackets, invalid command syntax, missing packages, incorrect mathematical notation, invalid escape sequences
      
      💻 **Programming Code** - Repairs syntax errors, missing brackets/parentheses/quotes, invalid indentation, typos in keywords, missing semicolons
      
      ⚙️ **Generic Content** - Attempts to fix any structured content with basic error correction

      **How It Works:**
      1. Analyzes the original content and error message
      2. Generates content-type specific debugging prompts with common issue patterns
      3. Uses AI to understand the intent and fix the specific problem
      4. Extracts the corrected content from the AI response
      5. Returns the fixed content ready for immediate use

      **Retry Logic:**
      The \`retryCount\` parameter enables iterative debugging for complex issues that may require multiple attempts to resolve.

      **Error Handling:**
      - Returns specific error messages when content cannot be automatically repaired
      - Preserves retry count for client-side retry logic
      - Logs detailed error information for debugging
    `,
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        request: {
          type: 'object',
          properties: {
            contentType: { type: 'string' },
            language: { type: 'string' },
            errorMessage: { type: 'string' },
            originalContent: { type: 'string' },
          },
          required: ['contentType', 'errorMessage', 'originalContent'],
        },
        retryCount: { type: 'number', default: 0 },
      },
      required: ['request'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Debug fix completed',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        fixedContent: { type: 'string' },
        explanation: { type: 'string' },
        retryCount: { type: 'number' },
        error: { type: 'string' },
      },
    },
  })
  async debugFix(
    @Body()
    body: {
      request: {
        contentType: string;
        language?: string;
        errorMessage: string;
        originalContent: string;
      };
      retryCount?: number;
    }
  ) {
    const { request, retryCount = 0 } = body;

    if (!request) {
      throw new BadRequestException('Debug request is required');
    }

    try {
      const { contentType, language } = request;

      // Generate fix prompt
      const fixPrompt = this.generateDebugFixPrompt(request);

      // Create a simple agent instance for debugging
      const agent = await this.agentPoolService.getCurrentAgent();

      // Send request to LLM with debugging context
      const debugThreadId = `debug-${Date.now()}`;
      const result = await agent.processMessage(debugThreadId, fixPrompt);

      // Extract the fixed content from the response
      const fixedContent = this.extractFixedContent(
        result.content,
        contentType,
        language
      );

      if (fixedContent) {
        return {
          success: true,
          fixedContent,
          explanation: 'Content has been automatically corrected',
          retryCount,
        };
      } else {
        return {
          success: false,
          error: 'Failed to extract valid fixed content from LLM response',
          retryCount,
        };
      }
    } catch (error) {
      this.logger.error('Debug fix request failed:', error);
      throw new InternalServerErrorException({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        retryCount: body.retryCount || 0,
      });
    }
  }

  private generateDebugFixPrompt(request: {
    contentType: string;
    language?: string;
    errorMessage: string;
    originalContent: string;
  }): string {
    const basePrompt = `You are a debugging assistant helping to fix rendering errors in content. A piece of ${request.contentType} content failed to render with the following error:

ERROR: ${request.errorMessage}

ORIGINAL CONTENT:
\`\`\`${request.language || request.contentType}
${request.originalContent}
\`\`\`

Please analyze the error and provide a corrected version of the content. Focus only on fixing the specific issue mentioned in the error while preserving the original intent and structure as much as possible.

Your response should contain ONLY the corrected content within a code block of the same type. Do not include explanations, comments, or additional text outside the code block.`;

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

Common ${request.language || 'code'} issues to check:
- Syntax errors
- Missing brackets, parentheses, or quotes
- Invalid indentation
- Typos in keywords or function names
- Missing semicolons or other required punctuation

Respond with only the corrected code:
\`\`\`${request.language || 'text'}
[corrected code here]
\`\`\``
        );

      default:
        return basePrompt;
    }
  }

  private extractFixedContent(
    llmResponse: string,
    contentType: string,
    language?: string
  ): string | null {
    const codeBlockRegex = new RegExp(
      `\`\`\`${language || contentType}\\n([\\s\\S]*?)\\n\`\`\``,
      'i'
    );
    const match = llmResponse.match(codeBlockRegex);

    if (match && match[1]) {
      return match[1].trim();
    }

    // Fallback: try to extract any code block
    const anyCodeBlockRegex = /```[\w]*\n([\s\S]*?)\n```/;
    const fallbackMatch = llmResponse.match(anyCodeBlockRegex);

    if (fallbackMatch && fallbackMatch[1]) {
      return fallbackMatch[1].trim();
    }

    return null;
  }
}
