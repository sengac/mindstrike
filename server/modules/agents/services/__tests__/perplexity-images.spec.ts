import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseAgentService } from '../base-agent.service';
import type { McpManagerService } from '../../../mcp/services/mcp-manager.service';
import type { SseService } from '../../../events/services/sse.service';
import type { LfsService } from '../../../content/services/lfs.service';
import type { ConversationService } from '../../../chat/services/conversation.service';
import { HumanMessage } from '@langchain/core/messages';
import type { ImageAttachment } from '../base-agent.service';

// Create a concrete implementation for testing
class TestAgentService extends BaseAgentService {
  createSystemPrompt(): string {
    return 'You are a test assistant.';
  }

  getDefaultPrompt(): string {
    return 'Default test prompt';
  }

  // Expose protected method for testing
  public testConvertToLangChainMessages(
    threadId: string,
    includePriorConversation: boolean = true
  ) {
    return this.convertToLangChainMessages(threadId, includePriorConversation);
  }
}

describe('Perplexity Image Support', () => {
  let service: TestAgentService;
  let mockMcpManagerService: Partial<McpManagerService>;
  let mockSseService: Partial<SseService>;
  let mockLfsService: Partial<LfsService>;
  let mockConversationService: Partial<ConversationService>;

  beforeEach(async () => {
    mockMcpManagerService = {
      getLangChainTools: vi.fn().mockReturnValue([]),
    };

    mockSseService = {
      broadcast: vi.fn(),
    };

    mockLfsService = {
      isLFSReference: vi.fn().mockReturnValue(false),
      retrieveContent: vi.fn(),
      getSummaryByReference: vi.fn(),
    };

    mockConversationService = {
      load: vi.fn().mockResolvedValue(undefined),
      getThreadMessages: vi.fn().mockReturnValue([]),
      getThread: vi.fn(),
      createThread: vi.fn(),
      addMessage: vi.fn(),
      updateMessage: vi.fn(),
      deleteMessage: vi.fn(),
      clearThread: vi.fn(),
      updateWorkspaceRoot: vi.fn(),
    };

    service = new TestAgentService(
      mockMcpManagerService as McpManagerService,
      mockSseService as SseService,
      mockLfsService as LfsService,
      mockConversationService as ConversationService
    );

    // Initialize with Perplexity configuration
    await service['initialize'](
      {
        workspaceRoot: '/test',
        llmConfig: {
          baseURL: 'https://api.perplexity.ai',
          model: 'sonar-pro',
          type: 'perplexity',
          apiKey: 'test-key',
        },
      },
      'test-agent-id'
    );
  });

  it('should format images correctly for Perplexity API', () => {
    const testImage: ImageAttachment = {
      id: 'img1',
      filename: 'test.png',
      filepath: '/test/test.png',
      mimeType: 'image/png',
      size: 1024,
      thumbnail: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA',
      fullImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA',
      uploadedAt: new Date(),
    };

    const messages = [
      {
        id: 'msg1',
        role: 'user' as const,
        content: 'What is in this image?',
        timestamp: new Date(),
        status: 'completed' as const,
        images: [testImage],
        notes: [],
      },
    ];

    vi.mocked(mockConversationService.getThreadMessages!).mockReturnValue(
      messages
    );

    const langChainMessages = service.testConvertToLangChainMessages('thread1');

    // Should have system message and user message
    expect(langChainMessages).toHaveLength(2);

    // Check the user message (second message after system)
    const userMessage = langChainMessages[1];
    expect(userMessage).toBeInstanceOf(HumanMessage);

    // Check that content is an array for Perplexity
    const content = (userMessage as HumanMessage).content;
    expect(Array.isArray(content)).toBe(true);

    const contentArray = content as Array<{
      type: string;
      text?: string;
      image_url?: { url: string };
    }>;

    // Should have text and image_url items
    expect(contentArray).toHaveLength(2);
    expect(contentArray[0]).toEqual({
      type: 'text',
      text: 'What is in this image?',
    });
    expect(contentArray[1]).toEqual({
      type: 'image_url',
      image_url: {
        url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA',
      },
    });
  });

  it('should handle multiple images for Perplexity', () => {
    const testImages: ImageAttachment[] = [
      {
        id: 'img1',
        filename: 'test1.png',
        filepath: '/test/test1.png',
        mimeType: 'image/png',
        size: 1024,
        thumbnail: 'data:image/png;base64,image1',
        fullImage: 'data:image/png;base64,image1',
        uploadedAt: new Date(),
      },
      {
        id: 'img2',
        filename: 'test2.jpg',
        filepath: '/test/test2.jpg',
        mimeType: 'image/jpeg',
        size: 2048,
        thumbnail: 'data:image/jpeg;base64,image2',
        fullImage: 'data:image/jpeg;base64,image2',
        uploadedAt: new Date(),
      },
    ];

    const messages = [
      {
        id: 'msg1',
        role: 'user' as const,
        content: 'Compare these images',
        timestamp: new Date(),
        status: 'completed' as const,
        images: testImages,
        notes: [],
      },
    ];

    vi.mocked(mockConversationService.getThreadMessages!).mockReturnValue(
      messages
    );

    const langChainMessages = service.testConvertToLangChainMessages('thread1');
    const userMessage = langChainMessages[1];
    const content = (userMessage as HumanMessage).content;

    const contentArray = content as Array<{
      type: string;
      text?: string;
      image_url?: { url: string };
    }>;

    // Should have 1 text + 2 images = 3 items
    expect(contentArray).toHaveLength(3);
    expect(contentArray[0].type).toBe('text');
    expect(contentArray[1].type).toBe('image_url');
    expect(contentArray[2].type).toBe('image_url');
    expect(contentArray[1].image_url?.url).toContain('data:image/png;base64');
    expect(contentArray[2].image_url?.url).toContain('data:image/jpeg;base64');
  });

  it('should add data URL prefix if missing for Perplexity', () => {
    const testImage: ImageAttachment = {
      id: 'img1',
      filename: 'test.png',
      filepath: '/test/test.png',
      mimeType: 'image/png',
      size: 1024,
      thumbnail: 'base64ImageDataWithoutPrefix',
      fullImage: 'base64ImageDataWithoutPrefix',
      uploadedAt: new Date(),
    };

    const messages = [
      {
        id: 'msg1',
        role: 'user' as const,
        content: 'What is this?',
        timestamp: new Date(),
        status: 'completed' as const,
        images: [testImage],
        notes: [],
      },
    ];

    vi.mocked(mockConversationService.getThreadMessages!).mockReturnValue(
      messages
    );

    const langChainMessages = service.testConvertToLangChainMessages('thread1');
    const userMessage = langChainMessages[1];
    const content = (userMessage as HumanMessage).content;

    const contentArray = content as Array<{
      type: string;
      text?: string;
      image_url?: { url: string };
    }>;

    // Should have added the data URL prefix
    expect(contentArray[1].image_url?.url).toBe(
      'data:image/png;base64,base64ImageDataWithoutPrefix'
    );
  });

  it('should handle messages without images for Perplexity', () => {
    const messages = [
      {
        id: 'msg1',
        role: 'user' as const,
        content: 'Just a text message',
        timestamp: new Date(),
        status: 'completed' as const,
        images: [],
        notes: [],
      },
    ];

    vi.mocked(mockConversationService.getThreadMessages!).mockReturnValue(
      messages
    );

    const langChainMessages = service.testConvertToLangChainMessages('thread1');
    const userMessage = langChainMessages[1];

    // Should return plain text message when no images
    expect(userMessage).toBeInstanceOf(HumanMessage);
    const content = (userMessage as HumanMessage).content;
    expect(typeof content).toBe('string');
    expect(content).toBe('Just a text message');
  });

  it('should handle notes with images for Perplexity', () => {
    const testImage: ImageAttachment = {
      id: 'img1',
      filename: 'test.png',
      filepath: '/test/test.png',
      mimeType: 'image/png',
      size: 1024,
      thumbnail: 'data:image/png;base64,imageData',
      fullImage: 'data:image/png;base64,imageData',
      uploadedAt: new Date(),
    };

    const messages = [
      {
        id: 'msg1',
        role: 'user' as const,
        content: 'Analyze this',
        timestamp: new Date(),
        status: 'completed' as const,
        images: [testImage],
        notes: [
          {
            id: 'note1',
            title: 'Important Note',
            content: 'This is a note about the image',
            attachedAt: new Date(),
          },
        ],
      },
    ];

    vi.mocked(mockConversationService.getThreadMessages!).mockReturnValue(
      messages
    );

    const langChainMessages = service.testConvertToLangChainMessages('thread1');
    const userMessage = langChainMessages[1];
    const content = (userMessage as HumanMessage).content;

    const contentArray = content as Array<{
      type: string;
      text?: string;
      image_url?: { url: string };
    }>;

    // Should have text with notes and image
    expect(contentArray).toHaveLength(2);
    expect(contentArray[0].type).toBe('text');
    expect(contentArray[0].text).toContain('Analyze this');
    expect(contentArray[0].text).toContain('Important Note');
    expect(contentArray[0].text).toContain('This is a note about the image');
    expect(contentArray[1].type).toBe('image_url');
  });
});
