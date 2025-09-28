import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { ChatService } from '../chat.service';
import { GlobalLlmConfigService } from '../../shared/services/global-llm-config.service';
import { GlobalConfigService } from '../../shared/services/global-config.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

// Mock the modules
vi.mock('../../../agents/chatAgent', () => {
  return {
    ChatAgent: vi.fn(),
  };
});

vi.mock('../../../utils/contentFilter', () => {
  return {
    cleanContentForLLM: vi.fn(),
  };
});

// Import after mocking
import { ChatAgent } from '../../../agents/chatAgent';
import { cleanContentForLLM } from '../../../utils/contentFilter';

describe('ChatService', () => {
  let service: ChatService;
  let mockGlobalLlmConfigService: Partial<GlobalLlmConfigService>;
  let mockGlobalConfigService: Partial<GlobalConfigService>;
  let mockEventEmitter: Partial<EventEmitter2>;

  const mockLlmConfig = {
    baseURL: 'http://localhost:11434',
    model: 'llama2',
    apiKey: 'test-key',
    displayName: 'Test Model',
    type: 'ollama' as const,
    contextLength: 4096,
  };

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();

    // Mock the load method to return a resolved promise
    const mockLoad = vi.fn().mockResolvedValue(undefined);

    // Ensure mock services are properly initialized
    mockGlobalLlmConfigService = {
      getCurrentLlmConfig: vi.fn().mockReturnValue(mockLlmConfig),
    };

    mockGlobalConfigService = {
      getWorkspaceRoot: vi.fn().mockReturnValue('/test/workspace'),
    };

    mockEventEmitter = {
      emit: vi.fn(),
    };

    // Mock fs.readFile to prevent actual file reading
    vi.mock('fs/promises', () => ({
      readFile: vi.fn().mockResolvedValue('[]'),
    }));

    // Directly instantiate the service with mocks
    service = new ChatService(
      mockEventEmitter as EventEmitter2,
      mockGlobalLlmConfigService as GlobalLlmConfigService,
      mockGlobalConfigService as GlobalConfigService
    );
    // Override the private loadThreads method to prevent file system access
    service['loadThreads'] = mockLoad;
  });

  describe('generatePrompt', () => {
    it('should throw BadRequestException if personality is empty', async () => {
      await expect(service.generatePrompt('')).rejects.toThrow(
        BadRequestException
      );
      await expect(service.generatePrompt('')).rejects.toThrow(
        'Prompt description is required'
      );
    });

    it('should throw BadRequestException if no model is configured', async () => {
      mockGlobalLlmConfigService.getCurrentLlmConfig = vi
        .fn()
        .mockReturnValue({ ...mockLlmConfig, model: '' });

      // Create a new service instance with the updated mock
      const serviceWithEmptyModel = new ChatService(
        mockEventEmitter as EventEmitter2,
        mockGlobalLlmConfigService as GlobalLlmConfigService,
        mockGlobalConfigService as GlobalConfigService
      );
      serviceWithEmptyModel['loadThreads'] = vi
        .fn()
        .mockResolvedValue(undefined);

      await expect(
        serviceWithEmptyModel.generatePrompt('friendly assistant')
      ).rejects.toThrow(BadRequestException);
      await expect(
        serviceWithEmptyModel.generatePrompt('friendly assistant')
      ).rejects.toThrow('No LLM model configured');
    });

    it('should generate a prompt using ChatAgent', async () => {
      const mockProcessMessage = vi.fn().mockResolvedValue({
        content: 'You are a friendly assistant who helps users.',
      });

      const mockAgentInstance = {
        processMessage: mockProcessMessage,
      };

      vi.mocked(ChatAgent).mockImplementation(() => mockAgentInstance);
      vi.mocked(cleanContentForLLM).mockImplementation((text: string) => text);

      const result = await service.generatePrompt('friendly assistant');

      // Verify ChatAgent was created with correct config
      expect(ChatAgent).toHaveBeenCalledWith({
        workspaceRoot: '/test/workspace',
        llmConfig: {
          model: 'llama2',
          baseURL: 'http://localhost:11434',
          apiKey: 'test-key',
          displayName: 'Test Model',
          type: 'ollama',
          contextLength: 4096,
        },
      });

      // Verify processMessage was called with correct prompt
      expect(mockProcessMessage).toHaveBeenCalledWith(
        expect.stringContaining('role-'),
        expect.stringContaining('friendly assistant'),
        { includePriorConversation: false }
      );

      // Verify the result
      expect(result).toBe('You are a friendly assistant who helps users.');
    });

    it('should include user description in the system prompt', async () => {
      const mockProcessMessage = vi.fn().mockResolvedValue({
        content: 'You are an enthusiastic coding mentor.',
      });

      const mockAgentInstance = {
        processMessage: mockProcessMessage,
      };

      vi.mocked(ChatAgent).mockImplementation(() => mockAgentInstance);
      vi.mocked(cleanContentForLLM).mockImplementation((text: string) => text);

      const personality = 'enthusiastic coding mentor who explains clearly';
      await service.generatePrompt(personality);

      // Check that the system prompt includes the user's description
      const calledPrompt = mockProcessMessage.mock.calls[0][1];
      expect(calledPrompt).toContain(personality);
      expect(calledPrompt).toContain("User's Description:");
      expect(calledPrompt).toContain('Transform this into a role definition');
    });

    it('should clean the generated content before returning', async () => {
      const rawContent = '  You are a helper.  \n\n  ';
      const cleanedContent = 'You are a helper.';

      const mockProcessMessage = vi.fn().mockResolvedValue({
        content: rawContent,
      });

      const mockAgentInstance = {
        processMessage: mockProcessMessage,
      };

      vi.mocked(ChatAgent).mockImplementation(() => mockAgentInstance);
      vi.mocked(cleanContentForLLM).mockImplementation(() => cleanedContent);

      const result = await service.generatePrompt('helper');

      expect(cleanContentForLLM).toHaveBeenCalledWith(rawContent);
      expect(result).toBe(cleanedContent);
    });
  });

  describe('generateTitle', () => {
    it('should generate a title for conversation context', async () => {
      const mockInvoke = vi.fn().mockResolvedValue({
        content: 'Discussion about TypeScript',
      });

      const mockChatModel = {
        invoke: mockInvoke,
      };

      const mockAgentInstance = {
        getChatModel: vi.fn().mockReturnValue(mockChatModel),
      };

      vi.mocked(ChatAgent).mockImplementation(() => mockAgentInstance);
      vi.mocked(cleanContentForLLM).mockImplementation((text: string) => text);

      const result = await service.generateTitle('talking about typescript');

      expect(result).toBe('Discussion about TypeScript');
      expect(mockInvoke).toHaveBeenCalledWith(
        expect.stringContaining('talking about typescript')
      );
    });
  });
});
