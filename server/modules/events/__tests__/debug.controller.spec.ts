import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { DebugController } from '../debug.controller.js';
import type { EventsService } from '../events.service.js';
import type { AgentPoolService } from '../../agents/services/agent-pool.service.js';
import type { BaseAgentService } from '../../agents/services/base-agent.service.js';
import type { ConversationMessage } from '../../chat/types/conversation.types.js';

interface DebugFixRequest {
  request: {
    contentType: string;
    language?: string;
    errorMessage: string;
    originalContent: string;
  };
  retryCount?: number;
}

interface InvalidDebugFixRequest {
  request?: null;
  retryCount?: number;
}

// Mock Logger - create a proper mock class
const mockLogger = {
  error: vi.fn(),
  debug: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
};

describe('DebugController', () => {
  let controller: DebugController;
  let mockEventsService: Partial<EventsService>;
  let mockAgentPoolService: Partial<AgentPoolService>;
  let mockBaseAgent: Partial<BaseAgentService>;

  const validMermaidRequest = {
    request: {
      contentType: 'mermaid',
      language: 'mermaid',
      errorMessage: 'Invalid syntax error',
      originalContent: 'graph TD\nA --> B',
    },
    retryCount: 0,
  };

  const mockConversationMessage: ConversationMessage = {
    id: 'msg-123',
    role: 'assistant',
    content: 'Fixed content response',
    timestamp: new Date('2024-01-01T00:00:00Z'),
    status: 'completed',
  };

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create mock BaseAgent
    mockBaseAgent = {
      processMessage: vi.fn().mockResolvedValue(mockConversationMessage),
    };

    // Create mock AgentPoolService
    mockAgentPoolService = {
      getCurrentAgent: vi.fn().mockResolvedValue(mockBaseAgent),
    };

    // Create mock EventsService
    mockEventsService = {
      getEventStream: vi.fn(),
      sendEvent: vi.fn(),
      broadcastToTopic: vi.fn(),
    };

    // Create controller instance
    controller = new DebugController(
      mockEventsService as EventsService,
      mockAgentPoolService as AgentPoolService
    );

    // Replace the logger with our mock
    Object.defineProperty(controller, 'logger', {
      value: mockLogger,
      writable: true,
    });
  });

  describe('debugFix', () => {
    const validLatexRequest = {
      request: {
        contentType: 'latex',
        errorMessage: 'Missing brace',
        originalContent: '\\frac{1}{2',
      },
      retryCount: 1,
    };

    const validCodeRequest = {
      request: {
        contentType: 'code',
        language: 'javascript',
        errorMessage: 'Syntax error',
        originalContent: 'function test() {\n  console.log("hello"',
      },
      retryCount: 2,
    };

    describe('Success Cases', () => {
      it('should process mermaid content successfully', async () => {
        // Mock successful LLM response with mermaid code block
        (
          mockBaseAgent.processMessage as ReturnType<typeof vi.fn>
        ).mockResolvedValue({
          ...mockConversationMessage,
          content:
            'Here is the fixed mermaid diagram:\n```mermaid\ngraph TD\n    A --> B\n    B --> C\n```',
        });

        const result = await controller.debugFix(validMermaidRequest);

        expect(result).toEqual({
          success: true,
          fixedContent: 'graph TD\n    A --> B\n    B --> C',
          explanation: 'Content has been automatically corrected',
          retryCount: 0,
        });

        expect(mockAgentPoolService.getCurrentAgent).toHaveBeenCalled();
        expect(mockBaseAgent.processMessage).toHaveBeenCalledWith(
          expect.stringMatching(/^debug-\d+$/),
          expect.stringContaining('mermaid')
        );
      });

      it('should process latex content successfully', async () => {
        // Mock successful LLM response with latex code block
        (
          mockBaseAgent.processMessage as ReturnType<typeof vi.fn>
        ).mockResolvedValue({
          ...mockConversationMessage,
          content: 'Here is the corrected LaTeX:\n```latex\n\\frac{1}{2}\n```',
        });

        const result = await controller.debugFix(validLatexRequest);

        expect(result).toEqual({
          success: true,
          fixedContent: '\\frac{1}{2}',
          explanation: 'Content has been automatically corrected',
          retryCount: 1,
        });

        expect(mockBaseAgent.processMessage).toHaveBeenCalledWith(
          expect.stringMatching(/^debug-\d+$/),
          expect.stringContaining('LaTeX')
        );
      });

      it('should process code content successfully', async () => {
        // Mock successful LLM response with code block
        (
          mockBaseAgent.processMessage as ReturnType<typeof vi.fn>
        ).mockResolvedValue({
          ...mockConversationMessage,
          content:
            'Here is the fixed code:\n```javascript\nfunction test() {\n  console.log("hello");\n}\n```',
        });

        const result = await controller.debugFix(validCodeRequest);

        expect(result).toEqual({
          success: true,
          fixedContent: 'function test() {\n  console.log("hello");\n}',
          explanation: 'Content has been automatically corrected',
          retryCount: 2,
        });

        expect(mockBaseAgent.processMessage).toHaveBeenCalledWith(
          expect.stringMatching(/^debug-\d+$/),
          expect.stringContaining('javascript')
        );
      });

      it('should handle content without language specified', async () => {
        const requestWithoutLanguage = {
          request: {
            contentType: 'code',
            errorMessage: 'Syntax error',
            originalContent: 'some code',
          },
        };

        (
          mockBaseAgent.processMessage as ReturnType<typeof vi.fn>
        ).mockResolvedValue({
          ...mockConversationMessage,
          content: 'Here is the fixed code:\n```text\nfixed code\n```',
        });

        const result = await controller.debugFix(requestWithoutLanguage);

        expect(result).toEqual({
          success: true,
          fixedContent: 'fixed code',
          explanation: 'Content has been automatically corrected',
          retryCount: 0,
        });
      });

      it('should use fallback code block extraction when specific language fails', async () => {
        // Mock LLM response with generic code block (no language specified)
        (
          mockBaseAgent.processMessage as ReturnType<typeof vi.fn>
        ).mockResolvedValue({
          ...mockConversationMessage,
          content: 'Here is the fix:\n```\ngeneric fixed content\n```',
        });

        const result = await controller.debugFix(validMermaidRequest);

        expect(result).toEqual({
          success: true,
          fixedContent: 'generic fixed content',
          explanation: 'Content has been automatically corrected',
          retryCount: 0,
        });
      });
    });

    describe('Error Cases', () => {
      it('should throw BadRequestException when request is missing', async () => {
        // Simulate the controller receiving malformed data
        await expect(
          // @ts-expect-error Testing invalid input on purpose
          controller.debugFix({})
        ).rejects.toThrow(BadRequestException);

        await expect(
          // @ts-expect-error Testing invalid input on purpose
          controller.debugFix({})
        ).rejects.toThrow('Debug request is required');
      });

      it('should throw BadRequestException when request is null', async () => {
        const invalidBody: InvalidDebugFixRequest = { request: null };

        await expect(
          // @ts-expect-error Testing invalid input on purpose
          controller.debugFix(invalidBody)
        ).rejects.toThrow(BadRequestException);
      });

      it('should return failure when no fixed content can be extracted', async () => {
        // Mock LLM response without code blocks
        (
          mockBaseAgent.processMessage as ReturnType<typeof vi.fn>
        ).mockResolvedValue({
          ...mockConversationMessage,
          content: 'I cannot fix this content. There are no code blocks here.',
        });

        const result = await controller.debugFix(validMermaidRequest);

        expect(result).toEqual({
          success: false,
          error: 'Failed to extract valid fixed content from LLM response',
          retryCount: 0,
        });
      });

      it('should handle AgentPoolService.getCurrentAgent errors', async () => {
        const testError = new Error('Agent pool error');
        (
          mockAgentPoolService.getCurrentAgent as ReturnType<typeof vi.fn>
        ).mockImplementation(() => {
          throw testError;
        });

        await expect(controller.debugFix(validMermaidRequest)).rejects.toThrow(
          InternalServerErrorException
        );

        try {
          await controller.debugFix(validMermaidRequest);
        } catch (error) {
          expect(error).toBeInstanceOf(InternalServerErrorException);
          const exception = error as InternalServerErrorException;
          expect(exception.getResponse()).toEqual({
            success: false,
            error: 'Agent pool error',
            retryCount: 0,
          });
        }
      });

      it('should handle BaseAgent.processMessage errors', async () => {
        const testError = new Error('LLM processing failed');
        (
          mockBaseAgent.processMessage as ReturnType<typeof vi.fn>
        ).mockRejectedValue(testError);

        await expect(controller.debugFix(validLatexRequest)).rejects.toThrow(
          InternalServerErrorException
        );

        try {
          await controller.debugFix(validLatexRequest);
        } catch (error) {
          expect(error).toBeInstanceOf(InternalServerErrorException);
          const exception = error as InternalServerErrorException;
          expect(exception.getResponse()).toEqual({
            success: false,
            error: 'LLM processing failed',
            retryCount: 1,
          });
        }
      });

      it('should handle non-Error exceptions', async () => {
        const nonErrorException = 'String error';
        (
          mockBaseAgent.processMessage as ReturnType<typeof vi.fn>
        ).mockRejectedValue(nonErrorException);

        try {
          await controller.debugFix(validCodeRequest);
        } catch (error) {
          expect(error).toBeInstanceOf(InternalServerErrorException);
          const exception = error as InternalServerErrorException;
          expect(exception.getResponse()).toEqual({
            success: false,
            error: 'Internal server error',
            retryCount: 2,
          });
        }
      });

      it('should handle missing retryCount in body when error occurs', async () => {
        const bodyWithoutRetryCount = {
          request: validMermaidRequest.request,
        };

        const testError = new Error('Test error');
        (
          mockBaseAgent.processMessage as ReturnType<typeof vi.fn>
        ).mockRejectedValue(testError);

        try {
          await controller.debugFix(bodyWithoutRetryCount);
        } catch (error) {
          expect(error).toBeInstanceOf(InternalServerErrorException);
          const exception = error as InternalServerErrorException;
          expect(exception.getResponse()).toEqual({
            success: false,
            error: 'Test error',
            retryCount: 0,
          });
        }
      });
    });

    describe('Retry Count Handling', () => {
      it('should use default retry count of 0 when not provided', async () => {
        const requestWithoutRetryCount = {
          request: validMermaidRequest.request,
        };

        (
          mockBaseAgent.processMessage as ReturnType<typeof vi.fn>
        ).mockResolvedValue({
          ...mockConversationMessage,
          content: '```mermaid\nfixed\n```',
        });

        const result = await controller.debugFix(requestWithoutRetryCount);

        expect(result.retryCount).toBe(0);
      });

      it('should preserve provided retry count in success response', async () => {
        const requestWithRetryCount = {
          ...validLatexRequest,
          retryCount: 5,
        };

        (
          mockBaseAgent.processMessage as ReturnType<typeof vi.fn>
        ).mockResolvedValue({
          ...mockConversationMessage,
          content: '```latex\nfixed\n```',
        });

        const result = await controller.debugFix(requestWithRetryCount);

        expect(result.retryCount).toBe(5);
      });

      it('should preserve retry count in failure response', async () => {
        const requestWithRetryCount = {
          ...validCodeRequest,
          retryCount: 3,
        };

        (
          mockBaseAgent.processMessage as ReturnType<typeof vi.fn>
        ).mockResolvedValue({
          ...mockConversationMessage,
          content: 'No code blocks here',
        });

        const result = await controller.debugFix(requestWithRetryCount);

        expect(result).toEqual({
          success: false,
          error: 'Failed to extract valid fixed content from LLM response',
          retryCount: 3,
        });
      });
    });
  });

  describe('generateDebugFixPrompt (private method)', () => {
    // Test private method through public interface
    it('should generate correct prompt for mermaid content', async () => {
      const request = {
        contentType: 'mermaid',
        language: 'mermaid',
        errorMessage: 'Invalid node syntax',
        originalContent: 'graph TD\nA -> B',
      };

      // Call the public method to trigger private method
      (
        mockBaseAgent.processMessage as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        ...mockConversationMessage,
        content: '```mermaid\nfixed\n```',
      });

      await controller.debugFix({ request });

      // Verify that processMessage was called with a prompt containing mermaid-specific content
      const calledPrompt = (
        mockBaseAgent.processMessage as ReturnType<typeof vi.fn>
      ).mock.calls[0][1];
      expect(calledPrompt).toContain('mermaid');
      expect(calledPrompt).toContain('Invalid node syntax');
      expect(calledPrompt).toContain('graph TD\nA -> B');
      expect(calledPrompt).toContain('Common Mermaid issues to check:');
      expect(calledPrompt).toContain('Syntax errors in node definitions');
      expect(calledPrompt).toContain(
        '```mermaid\n[corrected diagram here]\n```'
      );
    });

    it('should generate correct prompt for latex content', async () => {
      const request = {
        contentType: 'latex',
        errorMessage: 'Unmatched brace',
        originalContent: '\\frac{1}{2',
      };

      (
        mockBaseAgent.processMessage as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        ...mockConversationMessage,
        content: '```latex\nfixed\n```',
      });

      await controller.debugFix({ request });

      const calledPrompt = (
        mockBaseAgent.processMessage as ReturnType<typeof vi.fn>
      ).mock.calls[0][1];
      expect(calledPrompt).toContain('latex');
      expect(calledPrompt).toContain('Unmatched brace');
      expect(calledPrompt).toContain('\\frac{1}{2');
      expect(calledPrompt).toContain('Common LaTeX issues to check:');
      expect(calledPrompt).toContain('Unmatched braces or brackets');
      expect(calledPrompt).toContain('```latex\n[corrected LaTeX here]\n```');
    });

    it('should generate correct prompt for code content with language', async () => {
      const request = {
        contentType: 'code',
        language: 'python',
        errorMessage: 'IndentationError',
        originalContent: 'def test():\nprint("hello")',
      };

      (
        mockBaseAgent.processMessage as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        ...mockConversationMessage,
        content: '```python\nfixed\n```',
      });

      await controller.debugFix({ request });

      const calledPrompt = (
        mockBaseAgent.processMessage as ReturnType<typeof vi.fn>
      ).mock.calls[0][1];
      expect(calledPrompt).toContain('code');
      expect(calledPrompt).toContain('python');
      expect(calledPrompt).toContain('IndentationError');
      expect(calledPrompt).toContain('def test():\nprint("hello")');
      expect(calledPrompt).toContain('Common python issues to check:');
      expect(calledPrompt).toContain('```python\n[corrected code here]\n```');
    });

    it('should generate correct prompt for code content without language', async () => {
      const request = {
        contentType: 'code',
        errorMessage: 'Syntax error',
        originalContent: 'some code',
      };

      (
        mockBaseAgent.processMessage as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        ...mockConversationMessage,
        content: '```text\nfixed\n```',
      });

      await controller.debugFix({ request });

      const calledPrompt = (
        mockBaseAgent.processMessage as ReturnType<typeof vi.fn>
      ).mock.calls[0][1];
      expect(calledPrompt).toContain('Common code issues to check:');
      expect(calledPrompt).toContain('```text\n[corrected code here]\n```');
    });

    it('should generate base prompt for unknown content types', async () => {
      const request = {
        contentType: 'unknown',
        errorMessage: 'Some error',
        originalContent: 'some content',
      };

      (
        mockBaseAgent.processMessage as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        ...mockConversationMessage,
        content: '```\nfixed\n```',
      });

      await controller.debugFix({ request });

      const calledPrompt = (
        mockBaseAgent.processMessage as ReturnType<typeof vi.fn>
      ).mock.calls[0][1];
      expect(calledPrompt).toContain('unknown');
      expect(calledPrompt).toContain('Some error');
      expect(calledPrompt).toContain('some content');
      // Should not contain specific issue checks
      expect(calledPrompt).not.toContain('Common Mermaid issues');
      expect(calledPrompt).not.toContain('Common LaTeX issues');
      expect(calledPrompt).not.toContain('Common code issues');
    });
  });

  describe('extractFixedContent (private method)', () => {
    // Test private method through the public interface by examining behavior
    it('should extract content from exact language match', async () => {
      const request = {
        request: {
          contentType: 'mermaid',
          language: 'mermaid',
          errorMessage: 'Error',
          originalContent: 'original',
        },
      };

      // Test exact match
      (
        mockBaseAgent.processMessage as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        ...mockConversationMessage,
        content: 'Some text\n```mermaid\nextracted content\n```\nMore text',
      });

      const result = await controller.debugFix(request);

      expect(result.success).toBe(true);
      expect(result.fixedContent).toBe('extracted content');
    });

    it('should extract content from case-insensitive match', async () => {
      const request = {
        request: {
          contentType: 'mermaid',
          language: 'MERMAID',
          errorMessage: 'Error',
          originalContent: 'original',
        },
      };

      (
        mockBaseAgent.processMessage as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        ...mockConversationMessage,
        content: '```mermaid\ncase insensitive match\n```',
      });

      const result = await controller.debugFix(request);

      expect(result.success).toBe(true);
      expect(result.fixedContent).toBe('case insensitive match');
    });

    it('should fallback to any code block when specific language fails', async () => {
      const request = {
        request: {
          contentType: 'mermaid',
          language: 'mermaid',
          errorMessage: 'Error',
          originalContent: 'original',
        },
      };

      // Response with different language but still valid code block
      (
        mockBaseAgent.processMessage as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        ...mockConversationMessage,
        content: 'Here is a fix:\n```javascript\nfallback content\n```',
      });

      const result = await controller.debugFix(request);

      expect(result.success).toBe(true);
      expect(result.fixedContent).toBe('fallback content');
    });

    it('should trim whitespace from extracted content', async () => {
      const request = {
        request: {
          contentType: 'code',
          errorMessage: 'Error',
          originalContent: 'original',
        },
      };

      (
        mockBaseAgent.processMessage as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        ...mockConversationMessage,
        content: '```\n  \n  content with whitespace  \n  \n```',
      });

      const result = await controller.debugFix(request);

      expect(result.success).toBe(true);
      expect(result.fixedContent).toBe('content with whitespace');
    });

    it('should return null when no code blocks found', async () => {
      const request = {
        request: {
          contentType: 'mermaid',
          errorMessage: 'Error',
          originalContent: 'original',
        },
      };

      (
        mockBaseAgent.processMessage as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        ...mockConversationMessage,
        content: 'No code blocks in this response at all!',
      });

      const result = await controller.debugFix(request);

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        'Failed to extract valid fixed content from LLM response'
      );
    });

    it('should handle empty code blocks as failure', async () => {
      const request = {
        request: {
          contentType: 'mermaid',
          errorMessage: 'Error',
          originalContent: 'original',
        },
      };

      (
        mockBaseAgent.processMessage as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        ...mockConversationMessage,
        content: '```mermaid\n\n```',
      });

      const result = await controller.debugFix(request);

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        'Failed to extract valid fixed content from LLM response'
      );
    });
  });

  describe('Logging', () => {
    it('should log errors when exceptions occur', async () => {
      const testError = new Error('Test logging error');
      (
        mockAgentPoolService.getCurrentAgent as ReturnType<typeof vi.fn>
      ).mockImplementation(() => {
        throw testError;
      });

      const loggerErrorSpy = vi.spyOn(mockLogger, 'error');

      try {
        await controller.debugFix(validMermaidRequest);
      } catch {
        // Expected to throw
      }

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Debug fix request failed:',
        testError
      );
    });
  });

  describe('Thread ID Generation', () => {
    it('should generate unique debug thread IDs', async () => {
      (
        mockBaseAgent.processMessage as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        ...mockConversationMessage,
        content: '```mermaid\nfixed\n```',
      });

      // Mock Date.now to return different values
      const originalDateNow = Date.now;
      let callCount = 0;
      vi.spyOn(Date, 'now').mockImplementation(() => {
        callCount++;
        return 1000000000000 + callCount;
      });

      try {
        // Call multiple times - each should get different timestamps
        await controller.debugFix(validMermaidRequest);
        await controller.debugFix(validMermaidRequest);

        const calls = (mockBaseAgent.processMessage as ReturnType<typeof vi.fn>)
          .mock.calls;
        const threadId1 = calls[0][0];
        const threadId2 = calls[1][0];

        expect(threadId1).toMatch(/^debug-\d+$/);
        expect(threadId2).toMatch(/^debug-\d+$/);
        expect(threadId1).not.toBe(threadId2);
      } finally {
        // Restore original Date.now
        Date.now = originalDateNow;
      }
    });
  });
});
