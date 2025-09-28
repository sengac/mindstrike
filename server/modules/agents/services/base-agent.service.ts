import { Injectable, Logger } from '@nestjs/common';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { ChatOllama } from '@langchain/ollama';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPerplexityExtended } from './chat-perplexity-extended';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import type { DynamicStructuredTool } from '@langchain/core/tools';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { ChatLocalLLM } from './chat-local-llm.service';
import { cleanContentForLLM } from '../../../shared/utils/content-filter';
import { LLMConfigManager } from '../../../shared/utils/llm-config-manager';
import { McpManagerService } from '../../mcp/services/mcp-manager.service';
import { SseService } from '../../events/services/sse.service';
import { ConversationService } from '../../chat/services/conversation.service';
import { LfsService } from '../../content/services/lfs.service';

export interface AgentConfig {
  workspaceRoot: string;
  llmConfig: {
    baseURL: string;
    model: string;
    displayName?: string;
    apiKey?: string;
    type?:
      | 'ollama'
      | 'vllm'
      | 'openai-compatible'
      | 'openai'
      | 'anthropic'
      | 'perplexity'
      | 'google'
      | 'local';
    temperature?: number;
    maxTokens?: number;
  };
  customPrompt?: string;
  disableFunctions?: boolean;
  disableChatHistory?: boolean;
}

interface MCPTextContent {
  type: 'text';
  text: string;
}

interface MCPContentWithText {
  text: string;
  [key: string]: unknown;
}

export interface ImageAttachment {
  id: string;
  filename: string;
  filepath: string;
  mimeType: string;
  size: number;
  thumbnail: string;
  fullImage: string;
  uploadedAt: Date;
}

export interface NotesAttachment {
  id: string;
  title: string;
  content: string;
  nodeLabel?: string;
  attachedAt: Date;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  toolCalls?: Array<{
    id: string;
    name: string;
    parameters: Record<string, unknown>;
  }>;
  toolResults?: Array<{ name: string; result: unknown }>;
  status?: 'processing' | 'completed' | 'cancelled';
  model?: string;
  images?: ImageAttachment[];
  notes?: NotesAttachment[];
  citations?: string[];
}

@Injectable()
export abstract class BaseAgentService {
  protected readonly logger = new Logger(BaseAgentService.name);
  protected chatModel: BaseChatModel;
  protected systemPrompt: string;
  protected config: AgentConfig;
  protected agentId: string;
  protected conversationManager: ConversationService;
  protected langChainTools: DynamicStructuredTool[] = [];
  protected agentExecutor?: AgentExecutor;
  protected promptTemplate: ChatPromptTemplate;
  protected streamId?: string;

  constructor(
    protected readonly mcpManagerService: McpManagerService,
    protected readonly sseService: SseService,
    protected readonly lfsService: LfsService,
    protected readonly conversationService: ConversationService
  ) {
    this.conversationManager = conversationService;
  }

  get llmConfig(): AgentConfig['llmConfig'] {
    return this.config.llmConfig;
  }

  private isStringContent(item: unknown): item is string {
    return typeof item === 'string';
  }

  private isTextContent(item: unknown): item is MCPTextContent {
    return (
      typeof item === 'object' &&
      item !== null &&
      'type' in item &&
      (item as MCPTextContent).type === 'text' &&
      'text' in item
    );
  }

  private isContentWithText(item: unknown): item is MCPContentWithText {
    return typeof item === 'object' && item !== null && 'text' in item;
  }

  private extractTextFromMCPItem(item: unknown): string {
    if (this.isStringContent(item)) {
      return item;
    } else if (this.isTextContent(item)) {
      return item.text ?? '';
    } else if (this.isContentWithText(item)) {
      return typeof item.text === 'string' ? item.text : '';
    } else {
      return JSON.stringify(item);
    }
  }

  protected async initialize(
    config: AgentConfig,
    agentId?: string
  ): Promise<void> {
    this.logger.debug(`[NEST] BaseAgentService.initialize called`);
    this.logger.debug(`[NEST] Config received:`, config);

    this.config = config;
    this.agentId = agentId ?? this.generateId();
    this.logger.debug(`[NEST] Agent ID: ${this.agentId}`);

    try {
      this.logger.debug(`[NEST] Creating chat model...`);
      this.chatModel = this.createChatModel(config.llmConfig);
      this.logger.debug(`[NEST] Chat model created`);
    } catch (error) {
      this.logger.error(`[NEST] Failed to create chat model:`, error);
      throw error;
    }

    // ConversationService is now injected via constructor, no need to create it
    this.logger.debug(`[NEST] Using injected ConversationService`);
    // Ensure it's loaded
    await this.conversationManager.load();

    try {
      this.logger.debug(`[NEST] Initializing LangChain tools...`);
      this.initializeLangChainTools();
      this.logger.debug(`[NEST] LangChain tools initialized`);
    } catch (error) {
      this.logger.error(`[NEST] Failed to initialize LangChain tools:`, error);
      throw error;
    }

    try {
      this.logger.debug(`[NEST] Creating system prompt...`);
      this.logger.debug(`[NEST] this.config is:`, this.config);
      this.systemPrompt = this.createSystemPrompt();
      this.logger.debug(`[NEST] System prompt created: ${this.systemPrompt}`);
    } catch (error) {
      this.logger.error(`[NEST] Failed to create system prompt:`, error);
      throw error;
    }

    const escapedSystemPrompt = this.systemPrompt
      .replace(/{/g, '{{')
      .replace(/}/g, '}}');
    this.promptTemplate = ChatPromptTemplate.fromMessages([
      ['system', escapedSystemPrompt],
      ['placeholder', '{chat_history}'],
      ['human', '{input}'],
      ['placeholder', '{agent_scratchpad}'],
    ]);
    this.logger.debug(`[NEST] Prompt template created`);

    await this.initializeAgentExecutor().catch(error => {
      this.logger.error('[NEST] Failed to initialize agent executor:', error);
    });
    this.logger.debug(`[NEST] BaseAgentService.initialize completed`);
  }

  abstract createSystemPrompt(): string;
  abstract getDefaultPrompt(): string;

  setStreamId(streamId: string): void {
    this.streamId = streamId;
  }

  protected createChatModel(
    llmConfig: AgentConfig['llmConfig'],
    threadId?: string
  ): BaseChatModel {
    const baseConfig = {
      temperature: llmConfig.temperature ?? 0.7,
      maxTokens: llmConfig.maxTokens ?? 4000,
    };

    switch (llmConfig.type) {
      case 'ollama':
        return new ChatOllama({
          baseUrl: llmConfig.baseURL,
          model: llmConfig.model,
          ...baseConfig,
        });

      case 'openai':
        return new ChatOpenAI({
          openAIApiKey: llmConfig.apiKey,
          modelName: llmConfig.model,
          ...baseConfig,
        });

      case 'anthropic':
        return new ChatAnthropic({
          anthropicApiKey: llmConfig.apiKey,
          modelName: llmConfig.model,
          ...baseConfig,
        });

      case 'perplexity':
        return new ChatPerplexityExtended({
          apiKey: llmConfig.apiKey,
          model: llmConfig.model,
          ...baseConfig,
        });

      case 'google':
        return new ChatGoogleGenerativeAI({
          apiKey: llmConfig.apiKey,
          model: llmConfig.model,
          ...baseConfig,
        });

      case 'local':
        return new ChatLocalLLM({
          modelName: llmConfig.model,
          threadId: threadId,
          disableFunctions: this.config.disableFunctions,
          disableChatHistory: this.config.disableChatHistory,
          ...baseConfig,
        });

      case 'openai-compatible':
      case 'vllm':
      default: {
        let baseURL = llmConfig.baseURL;
        if (baseURL?.startsWith('/api/')) {
          baseURL = `http://localhost:3001${baseURL}`;
        }

        return new ChatOpenAI({
          openAIApiKey: llmConfig.apiKey ?? 'dummy-key',
          modelName: llmConfig.model,
          configuration: {
            baseURL: baseURL,
          },
          ...baseConfig,
        });
      }
    }
  }

  protected initializeLangChainTools(): void {
    const mcpTools = this.mcpManagerService.getLangChainTools();
    this.langChainTools = mcpTools;
  }

  protected async initializeAgentExecutor(): Promise<void> {
    if (this.chatModel.bindTools && this.langChainTools.length > 0) {
      const escapedSystemPrompt = this.systemPrompt
        .replace(/{/g, '{{')
        .replace(/}/g, '}}');
      const promptTemplate = ChatPromptTemplate.fromMessages([
        ['system', escapedSystemPrompt],
        ['placeholder', '{chat_history}'],
        ['human', '{input}'],
        ['placeholder', '{agent_scratchpad}'],
      ]);

      const boundModel = this.chatModel.bindTools(this.langChainTools);
      const agent = createToolCallingAgent({
        llm: boundModel,
        tools: this.langChainTools,
        prompt: promptTemplate,
      });

      this.agentExecutor = new AgentExecutor({
        agent,
        tools: this.langChainTools,
        verbose: true,
        returnIntermediateSteps: true,
      });
    }
  }

  async refreshTools(): Promise<void> {
    this.initializeLangChainTools();
    this.systemPrompt = this.createSystemPrompt();

    const escapedSystemPrompt = this.systemPrompt
      .replace(/{/g, '{{')
      .replace(/}/g, '}}');
    this.promptTemplate = ChatPromptTemplate.fromMessages([
      ['system', escapedSystemPrompt],
      ['placeholder', '{chat_history}'],
      ['human', '{input}'],
      ['placeholder', '{agent_scratchpad}'],
    ]);

    await this.initializeAgentExecutor();
  }

  protected formatAttachedNotes(notes: NotesAttachment[]): string {
    if (!notes || !Array.isArray(notes) || notes.length === 0) {
      return '';
    }

    return notes
      .map(
        note =>
          `\n\n--- ATTACHED NOTES: ${note.title} ---${note.nodeLabel ? ` (from node: ${note.nodeLabel})` : ''}\n${note.content}\n--- END NOTES ---`
      )
      .join('');
  }

  protected convertToLangChainMessages(
    threadId: string,
    includePriorConversation: boolean = true
  ): BaseMessage[] {
    const allMessages = this.conversationManager.getThreadMessages(threadId);

    let messages = allMessages;
    if (!includePriorConversation && allMessages.length > 0) {
      const userMessages = allMessages.filter(msg => msg.role === 'user');
      const lastUserMessage = userMessages.slice(-1);

      if (lastUserMessage.length > 0) {
        messages = lastUserMessage;
      } else {
        messages = allMessages.filter(msg => msg.role !== 'system');
      }
    } else {
      messages = allMessages.filter(msg => msg.role !== 'system');
    }

    const filteredMessages = messages.filter((msg, index) => {
      if (
        !msg.content ||
        (typeof msg.content === 'string' && msg.content.trim() === '')
      ) {
        const shouldKeep =
          msg.role === 'assistant' && index === messages.length - 1;
        return shouldKeep;
      }
      return true;
    });

    const isPerplexity =
      this.config.llmConfig.baseURL?.includes('perplexity') ||
      this.config.llmConfig.type === 'perplexity' ||
      this.config.llmConfig.model?.includes('sonar');

    const langChainMessages = filteredMessages.map(msg => {
      const rawContent =
        typeof msg.content === 'string'
          ? msg.content
          : msg.content
            ? String(msg.content)
            : '';
      const content = cleanContentForLLM(rawContent);

      switch (msg.role) {
        case 'system':
          return new SystemMessage(content);
        case 'user':
          if (msg.images && msg.images.length > 0) {
            const isAnthropic =
              this.config.llmConfig.baseURL?.includes('anthropic') ||
              this.config.llmConfig.type === 'anthropic' ||
              this.config.llmConfig.model?.includes('claude');

            const isPerplexity =
              this.config.llmConfig.baseURL?.includes('perplexity') ||
              this.config.llmConfig.type === 'perplexity' ||
              this.config.llmConfig.model?.includes('sonar');

            const isGoogle =
              this.config.llmConfig.baseURL?.includes('generativelanguage') ||
              this.config.llmConfig.type === 'google' ||
              this.config.llmConfig.model?.includes('gemini');

            const isOllama =
              this.config.llmConfig.baseURL?.includes('ollama') ||
              this.config.llmConfig.type === 'ollama';

            if (isAnthropic) {
              const contentArray: Array<{
                type: 'text' | 'image';
                text?: string;
                source?: { type: 'base64'; media_type: string; data: string };
              }> = [];

              if (content?.trim()) {
                contentArray.push({
                  type: 'text',
                  text: content,
                });
              }

              for (const image of msg.images) {
                let imageData = image.fullImage ?? image.thumbnail;
                if (!imageData) {
                  this.logger.warn(
                    'Image missing both fullImage and thumbnail data'
                  );
                  continue;
                }
                let mediaType = image.mimeType ?? 'image/jpeg';

                if (imageData.startsWith('data:')) {
                  const parts = imageData.split(',');
                  if (parts.length === 2) {
                    const dataUrlMatch = parts[0].match(/data:([^;]+)/);
                    if (dataUrlMatch) {
                      mediaType = dataUrlMatch[1];
                    }
                    imageData = parts[1];
                  }
                }

                contentArray.push({
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: mediaType,
                    data: imageData,
                  },
                });
              }

              if (msg.notes && msg.notes.length > 0) {
                const notesText = this.formatAttachedNotes(msg.notes);

                if (
                  contentArray.length > 0 &&
                  contentArray[0].type === 'text'
                ) {
                  contentArray[0].text += notesText;
                } else {
                  contentArray.unshift({
                    type: 'text',
                    text: content + notesText,
                  });
                }
              }

              return new HumanMessage({ content: contentArray });
            } else if (isPerplexity) {
              // Perplexity requires a specific format for images with our extended class
              const contentArray: Array<{
                type: 'text' | 'image_url';
                text?: string;
                image_url?: { url: string };
              }> = [];

              // Add text content if present
              let textContent = content ?? '';
              if (msg.notes && msg.notes.length > 0) {
                const notesText = this.formatAttachedNotes(msg.notes);
                textContent += notesText;
              }

              if (textContent?.trim()) {
                contentArray.push({
                  type: 'text',
                  text: textContent,
                });
              }

              // Add images for Perplexity
              for (const image of msg.images) {
                let imageUrl = image.fullImage ?? image.thumbnail;
                if (!imageUrl) {
                  this.logger.warn(
                    'Image missing both fullImage and thumbnail data'
                  );
                  continue;
                }

                // Ensure the image has a proper data URL format
                if (!imageUrl.startsWith('data:')) {
                  const mimeType = image.mimeType ?? 'image/jpeg';
                  imageUrl = `data:${mimeType};base64,${imageUrl}`;
                }

                contentArray.push({
                  type: 'image_url',
                  image_url: {
                    url: imageUrl,
                  },
                });
              }

              // If no content array items, just return plain text message
              if (contentArray.length === 0) {
                return new HumanMessage('');
              }

              // For Perplexity, wrap the content array in an object
              // This ensures HumanMessage sets it as the content property
              return new HumanMessage({ content: contentArray });
            } else if (isGoogle) {
              const contentArray: Array<{
                type: 'text' | 'image_url';
                text?: string;
                image_url?: { url: string };
              }> = [];

              if (content?.trim()) {
                contentArray.push({
                  type: 'text',
                  text: content,
                });
              }

              for (const image of msg.images) {
                contentArray.push({
                  type: 'image_url',
                  image_url: {
                    url: image.fullImage,
                  },
                });
              }

              return new HumanMessage({ content: contentArray });
            } else if (isOllama) {
              const contentArray: Array<{
                type: 'text' | 'image_url';
                text?: string;
                image_url?: string;
              }> = [];

              let textContent = content;
              if (msg.notes?.length) {
                const notesText = this.formatAttachedNotes(msg.notes);
                textContent += notesText;
              }

              if (textContent?.trim()) {
                contentArray.push({
                  type: 'text',
                  text: textContent,
                });
              }

              for (const image of msg.images) {
                let imageUrl = image.fullImage ?? image.thumbnail;
                if (!imageUrl) {
                  this.logger.warn(
                    'Image missing both fullImage and thumbnail data'
                  );
                  continue;
                }

                if (!imageUrl.startsWith('data:')) {
                  const mimeType = image.mimeType ?? 'image/jpeg';
                  imageUrl = `data:${mimeType};base64,${imageUrl}`;
                }

                contentArray.push({
                  type: 'image_url',
                  image_url: imageUrl,
                });
              }

              return new HumanMessage({ content: contentArray });
            } else {
              const contentArray: Array<{
                type: 'text' | 'image_url';
                text?: string;
                image_url?: { url: string };
              }> = [];

              if (content?.trim()) {
                contentArray.push({
                  type: 'text',
                  text: content,
                });
              }

              for (const image of msg.images) {
                let imageUrl = image.fullImage ?? image.thumbnail;
                if (!imageUrl) {
                  this.logger.warn(
                    'Image missing both fullImage and thumbnail data'
                  );
                  continue;
                }

                if (!imageUrl.startsWith('data:')) {
                  imageUrl = `data:${image.mimeType ?? 'image/jpeg'};base64,${imageUrl}`;
                }

                contentArray.push({
                  type: 'image_url',
                  image_url: {
                    url: imageUrl,
                  },
                });
              }

              if (msg.notes && msg.notes.length > 0) {
                const notesText = this.formatAttachedNotes(msg.notes);

                if (
                  contentArray.length > 0 &&
                  contentArray[0].type === 'text'
                ) {
                  contentArray[0].text += notesText;
                } else {
                  contentArray.unshift({
                    type: 'text',
                    text: content + notesText,
                  });
                }
              }

              return new HumanMessage({ content: contentArray });
            }
          } else {
            let userContent = content ?? '';
            if (msg.notes && msg.notes.length > 0) {
              const notesText = this.formatAttachedNotes(msg.notes);
              userContent += notesText;
            }
            return new HumanMessage(userContent);
          }
        case 'assistant':
          return new AIMessage(content ?? '');
        default:
          return new HumanMessage(content ?? '');
      }
    });

    const systemMessages = langChainMessages.filter(
      msg => msg instanceof SystemMessage
    );
    const nonSystemMessages = langChainMessages.filter(
      msg => !(msg instanceof SystemMessage)
    );

    const mergedSystemMessage =
      systemMessages.length > 0
        ? new SystemMessage(systemMessages.map(msg => msg.content).join('\n\n'))
        : null;

    const reorderedMessages = mergedSystemMessage
      ? [mergedSystemMessage, ...nonSystemMessages]
      : nonSystemMessages;

    if (reorderedMessages.length === 0) {
      const fallbackMessage = new SystemMessage(
        this.systemPrompt ??
          this.createSystemPrompt() ??
          'You are a helpful AI assistant.'
      );
      return [fallbackMessage];
    }

    const systemPromptContent = this.systemPrompt ?? this.createSystemPrompt();
    const systemMessage = new SystemMessage(systemPromptContent);
    const finalMessages = [systemMessage, ...reorderedMessages];

    if (isPerplexity && finalMessages.length > 0) {
      return this.reorderMessagesForPerplexity(finalMessages);
    }

    return finalMessages;
  }

  private reorderMessagesForPerplexity(messages: BaseMessage[]): BaseMessage[] {
    // Separate system messages from conversation messages
    const systemMessages = messages.filter(msg => msg instanceof SystemMessage);
    const conversationMessages = messages.filter(
      msg => !(msg instanceof SystemMessage)
    );

    if (conversationMessages.length === 0) {
      // No conversation messages, just return system + a user message
      return [...systemMessages, new HumanMessage('Please respond.')];
    }

    // First, merge consecutive messages of the same role
    const mergedMessages: BaseMessage[] = [];
    let currentMessage: BaseMessage | null = null;

    for (const msg of conversationMessages) {
      if (!currentMessage) {
        currentMessage = msg;
      } else if (
        (currentMessage instanceof HumanMessage &&
          msg instanceof HumanMessage) ||
        (currentMessage instanceof AIMessage && msg instanceof AIMessage)
      ) {
        // Merge consecutive messages of the same role
        const combinedContent = this.combineMessageContent(
          currentMessage.content,
          msg.content
        );
        if (currentMessage instanceof HumanMessage) {
          currentMessage = new HumanMessage(combinedContent);
        } else {
          currentMessage = new AIMessage(combinedContent);
        }
      } else {
        // Different role, push the current message and start a new one
        mergedMessages.push(currentMessage);
        currentMessage = msg;
      }
    }

    // Don't forget the last message
    if (currentMessage) {
      mergedMessages.push(currentMessage);
    }

    // Now build the final result ensuring proper alternation
    const result: BaseMessage[] = [...systemMessages];

    // Ensure we start with a user message
    let processedMessages = [...mergedMessages];

    // If first message is not a user message, prepend a user message
    if (
      processedMessages.length > 0 &&
      !(processedMessages[0] instanceof HumanMessage)
    ) {
      // Find the first user message
      const firstUserIndex = processedMessages.findIndex(
        msg => msg instanceof HumanMessage
      );

      if (firstUserIndex === -1) {
        // No user messages at all - add one at the beginning
        processedMessages.unshift(
          new HumanMessage('Please continue with the conversation.')
        );
      } else if (firstUserIndex > 0) {
        // There are assistant messages before the first user message
        // Merge them into the first user message as context
        const assistantPrefix = processedMessages.slice(0, firstUserIndex);
        const firstUser = processedMessages[firstUserIndex];
        const remaining = processedMessages.slice(firstUserIndex + 1);

        const contextContent = assistantPrefix
          .map(msg => `[Previous assistant response: ${msg.content}]`)
          .join('\n\n');

        const combinedContent = contextContent + '\n\n' + firstUser.content;
        processedMessages = [new HumanMessage(combinedContent), ...remaining];
      }
    }

    // Now ensure strict alternation and that we end with a user message
    let expectingUser = true;

    for (const msg of processedMessages) {
      const isUser = msg instanceof HumanMessage;

      if (expectingUser && isUser) {
        result.push(msg);
        expectingUser = false;
      } else if (!expectingUser && !isUser) {
        result.push(msg);
        expectingUser = true;
      } else if (expectingUser && !isUser) {
        // Expected user but got assistant - insert a continuation message
        result.push(new HumanMessage('Continue.'));
        result.push(msg);
        expectingUser = true;
      } else if (!expectingUser && isUser) {
        // Expected assistant but got user - skip the alternation
        result.push(msg);
        expectingUser = false;
      }
    }

    // CRITICAL: Ensure the last message is always a user message
    const lastMessage = result[result.length - 1];
    if (!(lastMessage instanceof HumanMessage)) {
      // If the last message is not a user message, add one
      result.push(new HumanMessage('Please provide your response.'));
    }

    return result;
  }

  private combineMessageContent(
    content1: string | Record<string, unknown> | unknown[],
    content2: string | Record<string, unknown> | unknown[]
  ): string {
    // Convert both contents to strings and combine
    const str1 =
      typeof content1 === 'string' ? content1 : JSON.stringify(content1);
    const str2 =
      typeof content2 === 'string' ? content2 : JSON.stringify(content2);

    return str1 + '\n\n' + str2;
  }

  async processMessage(
    threadId: string,
    userMessage: string,
    options?: {
      images?: ImageAttachment[];
      notes?: NotesAttachment[];
      onUpdate?: (message: ConversationMessage) => void;
      userMessageId?: string;
      includePriorConversation?: boolean;
      signal?: AbortSignal;
    }
  ): Promise<ConversationMessage> {
    const {
      images,
      notes,
      onUpdate,
      userMessageId,
      includePriorConversation = true,
      signal,
    } = options ?? {};

    await this.conversationManager.load();

    let thread = this.conversationManager.getThread(threadId);
    if (!thread) {
      thread = await this.conversationManager.createThread();
      threadId = thread.id;
    }

    const systemPromptContent = this.systemPrompt ?? this.createSystemPrompt();

    if (!systemPromptContent || systemPromptContent.trim() === '') {
      throw new Error(
        'System prompt is empty. Agent must implement createSystemPrompt() method.'
      );
    }

    if (!userMessage || typeof userMessage !== 'string') {
      throw new Error(
        `Invalid user message: received ${typeof userMessage} instead of string`
      );
    }

    if (this.config.llmConfig.type === 'local') {
      this.chatModel = this.createChatModel(this.config.llmConfig, threadId);
    }

    let userMsg: ConversationMessage | undefined;
    if (userMessageId) {
      await this.conversationManager.load();
      const thread = this.conversationManager.getThread(threadId);
      userMsg = thread?.messages.find(msg => msg.id === userMessageId);
    }

    if (!userMsg) {
      userMsg = {
        id: userMessageId ?? this.generateId(),
        role: 'user',
        content: userMessage,
        timestamp: new Date(),
        status: 'completed',
        images: images ?? [],
        notes: notes ?? [],
      };

      await this.conversationManager.addMessage(threadId, userMsg);

      this.sseService.broadcast('unified-events', {
        type: 'create',
        entityType: 'message',
        entity: userMsg,
        threadId,
        streamId: this.streamId,
      });
    }

    const startTime = Date.now();

    try {
      const assistantMsgId = this.generateId();
      const assistantMsg: ConversationMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        status: 'processing',
        model: this.config.llmConfig.displayName ?? this.config.llmConfig.model,
      };
      await this.conversationManager.addMessage(threadId, assistantMsg);

      this.sseService.broadcast('unified-events', {
        type: 'create',
        entityType: 'message',
        entity: assistantMsg,
        threadId,
        streamId: this.streamId,
      });

      const messages = this.convertToLangChainMessages(
        threadId,
        includePriorConversation
      );

      this.logger.debug(`LLM Request: ${this.config.llmConfig.model}`, {
        messages: messages.map(msg => ({
          role: msg._getType(),
          content:
            typeof msg.content === 'string' ? msg.content : '[Complex Content]',
        })),
        model: this.config.llmConfig.model,
      });

      const isOllamaModel = this.config.llmConfig.type === 'ollama';
      const boundModel =
        this.chatModel.bindTools &&
        this.langChainTools.length > 0 &&
        !isOllamaModel
          ? this.chatModel.bindTools(this.langChainTools)
          : this.chatModel;

      const stream = await boundModel.stream(messages);
      let fullContent = '';
      let tokenCount = 0;
      let lastTokenUpdate = startTime;
      let citations: string[] | undefined = undefined;
      let accumulatedMessage:
        | {
            tool_calls?: Array<{
              id: string;
              name: string;
              args: string | Record<string, unknown>;
            }>;
            tool_call_chunks?: Array<{
              index: number;
              id?: string;
              name?: string;
              args?: string;
            }>;
          }
        | undefined = undefined;

      const abortController = new AbortController();

      if (signal) {
        signal.addEventListener('abort', () => {
          abortController.abort();
        });
      }

      for await (const chunk of stream) {
        if (abortController.signal.aborted || signal?.aborted) {
          await this.conversationManager.updateMessage(
            threadId,
            assistantMsgId,
            { status: 'cancelled' }
          );
          this.sseService.broadcast('unified-events', {
            type: 'update',
            entityType: 'message',
            entity: { id: assistantMsgId, status: 'cancelled' },
            threadId,
            streamId: this.streamId,
          });
          break;
        }

        // Extract citations from chunk if present (for Perplexity models)
        if (chunk.additional_kwargs?.citations) {
          citations = chunk.additional_kwargs.citations as string[];
        }

        if (!accumulatedMessage) {
          accumulatedMessage = {
            tool_calls:
              chunk.tool_calls?.map(tc => ({
                id: tc.id ?? '',
                name: tc.name,
                args: tc.args,
              })) ?? [],
            tool_call_chunks:
              chunk.tool_call_chunks?.map(tcc => ({
                index: tcc.index ?? 0,
                id: tcc.id,
                name: tcc.name,
                args: tcc.args,
              })) ?? [],
          };
        } else {
          if (chunk.tool_call_chunks && chunk.tool_call_chunks.length > 0) {
            accumulatedMessage.tool_call_chunks ??= [];
            for (const newChunk of chunk.tool_call_chunks) {
              const existingIndex =
                accumulatedMessage.tool_call_chunks.findIndex(
                  (existing: {
                    index: number;
                    id?: string;
                    name?: string;
                    args?: string;
                  }) => existing.index === (newChunk.index ?? 0)
                );
              if (existingIndex >= 0) {
                const existing =
                  accumulatedMessage.tool_call_chunks[existingIndex];
                accumulatedMessage.tool_call_chunks[existingIndex] = {
                  ...existing,
                  name: newChunk.name ?? existing.name,
                  args: (existing.args ?? '') + (newChunk.args ?? ''),
                  id: newChunk.id ?? existing.id,
                };
              } else {
                accumulatedMessage.tool_call_chunks.push({
                  index: newChunk.index ?? 0,
                  id: newChunk.id,
                  name: newChunk.name,
                  args: newChunk.args,
                });
              }
            }
          }
        }

        let chunkContent = '';
        if (typeof chunk.content === 'string') {
          chunkContent = chunk.content;
        } else if (Array.isArray(chunk.content)) {
          chunkContent = chunk.content
            .map((item: unknown) =>
              typeof item === 'string'
                ? item
                : ((item as { text?: string }).text ?? '')
            )
            .join('');
        } else if (chunk.content && typeof chunk.content === 'object') {
          chunkContent =
            (chunk.content as { text?: string; content?: string }).text ??
            (chunk.content as { text?: string; content?: string }).content ??
            '';
        }

        fullContent += chunkContent;
        await this.conversationManager.updateMessage(threadId, assistantMsgId, {
          content: fullContent,
          ...(citations && { citations }),
        });

        tokenCount += Math.max(1, Math.floor(chunkContent.length / 4));

        const now = Date.now();
        if (now - lastTokenUpdate > 1000) {
          const elapsed = (now - startTime) / 1000;
          if (elapsed > 0.5 && tokenCount > 0) {
            const tokensPerSecond = tokenCount / elapsed;
            this.sseService.broadcast('unified-events', {
              type: 'token',
              tokensPerSecond: tokensPerSecond,
              totalTokens: tokenCount,
              streamId: this.streamId,
            });
            lastTokenUpdate = now;
          }
        }

        if (onUpdate) {
          const currentMessage = this.conversationManager
            .getThreadMessages(threadId)
            .find((m: ConversationMessage) => m.id === assistantMsgId);
          if (currentMessage) {
            const conversationMsg: ConversationMessage = {
              ...currentMessage,
              status: 'processing',
            };
            onUpdate(conversationMsg);

            this.sseService.broadcast('unified-events', {
              type: 'update',
              entityType: 'message',
              entity: { id: assistantMsgId, content: fullContent },
              threadId,
              streamId: this.streamId,
            });
          }
        }
      }

      let toolCalls: Array<{
        id: string;
        name: string;
        parameters: Record<string, unknown>;
      }> = [];

      if (
        accumulatedMessage?.tool_calls &&
        accumulatedMessage.tool_calls.length > 0
      ) {
        toolCalls.push(
          ...accumulatedMessage.tool_calls.map(
            (toolCall: {
              id?: string;
              name: string;
              args: string | Record<string, unknown>;
            }) => ({
              id: toolCall.id ?? this.generateId(),
              name: toolCall.name,
              parameters:
                typeof toolCall.args === 'string'
                  ? (JSON.parse(toolCall.args) as Record<string, unknown>)
                  : toolCall.args,
            })
          )
        );
      }

      if (
        accumulatedMessage?.tool_call_chunks &&
        accumulatedMessage.tool_call_chunks.length > 0
      ) {
        const chunkToolCalls = accumulatedMessage.tool_call_chunks
          .filter(
            (chunk: {
              index: number;
              id?: string;
              name?: string;
              args?: string;
            }) => chunk.name && chunk.args
          )
          .map(
            (chunk: {
              index: number;
              id?: string;
              name?: string;
              args?: string;
            }) => ({
              id: chunk.id ?? this.generateId(),
              name: chunk.name!,
              parameters:
                typeof chunk.args === 'string'
                  ? (JSON.parse(chunk.args) as Record<string, unknown>)
                  : (chunk.args ?? {}),
            })
          );
        toolCalls.push(...chunkToolCalls);
      }

      if (toolCalls.length === 0) {
        const { toolCalls: parsedToolCalls } = this.parseToolCalls(fullContent);
        toolCalls = parsedToolCalls ?? [];
      }

      const duration = Date.now() - startTime;
      const tokensPerSecond = duration > 0 ? tokenCount / (duration / 1000) : 0;
      this.logger.debug(`LLM Response: ${this.config.llmConfig.model}`, {
        content: fullContent,
        toolCalls: toolCalls,
        duration: `${duration}ms`,
        tokens: tokenCount,
        tokensPerSecond: tokensPerSecond.toFixed(2),
      });

      await this.conversationManager.updateMessage(threadId, assistantMsgId, {
        content: fullContent,
        toolCalls,
        status: toolCalls && toolCalls.length > 0 ? 'processing' : 'completed',
        ...(citations && { citations }),
      });

      if (toolCalls && toolCalls.length > 0) {
        if (onUpdate) {
          const currentMessage = this.conversationManager
            .getThreadMessages(threadId)
            .find((m: ConversationMessage) => m.id === assistantMsgId);
          if (currentMessage) {
            const conversationMsg: ConversationMessage = {
              ...currentMessage,
              status: 'processing',
            };
            onUpdate(conversationMsg);
          }
        }

        const toolResults = await this.executeToolCalls(
          threadId,
          toolCalls,
          assistantMsgId
        );

        const currentMessage = this.conversationManager
          .getThreadMessages(threadId)
          .find((m: ConversationMessage) => m.id === assistantMsgId);
        if (currentMessage?.status === 'cancelled') {
          return currentMessage;
        }

        await this.conversationManager.updateMessage(threadId, assistantMsgId, {
          toolResults,
          status: 'processing',
        });

        const toolResultContent = toolResults
          .map((result: { name: string; result: unknown }) => {
            let resultText = '';
            if (typeof result.result === 'string') {
              resultText = result.result;
            } else if (result.result && typeof result.result === 'object') {
              const resultObj = result.result as Record<string, unknown>;
              if (resultObj.success === false && resultObj.error) {
                resultText = `Error: ${resultObj.error}`;
              } else if (resultObj.content) {
                resultText = String(resultObj.content);
              } else if (resultObj.text) {
                resultText = String(resultObj.text);
              } else {
                resultText = Object.entries(resultObj)
                  .map(([key, value]) => `${key}: ${value}`)
                  .join(', ');
              }
            } else {
              resultText = String(result.result);
            }
            return `Tool ${result.name} result:\n${resultText}`;
          })
          .join('\n\n');

        const followUpMessages = [
          ...messages,
          ...(fullContent?.trim() ? [new AIMessage(fullContent)] : []),
          new HumanMessage(
            `Tool execution results:\n${toolResultContent}\n\nPlease respond to the user with the relevant information from the tool results. Include the actual content/data from the tools when it's helpful to the user.`
          ),
        ];

        await this.conversationManager.updateMessage(threadId, assistantMsgId, {
          content: '',
        });

        const followUpStream = await boundModel.stream(followUpMessages);
        let followUpContent = '';
        let followUpTokenCount = 0;

        for await (const chunk of followUpStream) {
          if (abortController.signal.aborted) {
            await this.conversationManager.updateMessage(
              threadId,
              assistantMsgId,
              { status: 'cancelled' }
            );
            this.sseService.broadcast('unified-events', {
              type: 'update',
              entityType: 'message',
              entity: { id: assistantMsgId, status: 'cancelled' },
              threadId,
              streamId: this.streamId,
            });
            break;
          }

          let chunkContent = '';
          if (typeof chunk.content === 'string') {
            chunkContent = chunk.content;
          } else if (Array.isArray(chunk.content)) {
            chunkContent = chunk.content
              .map((item: unknown) =>
                typeof item === 'string'
                  ? item
                  : ((item as { text?: string }).text ?? '')
              )
              .join('');
          } else if (chunk.content && typeof chunk.content === 'object') {
            chunkContent =
              (chunk.content as { text?: string; content?: string }).text ??
              (chunk.content as { text?: string; content?: string }).content ??
              '';
          }

          followUpContent += chunkContent;
          await this.conversationManager.updateMessage(
            threadId,
            assistantMsgId,
            { content: followUpContent }
          );

          followUpTokenCount += Math.max(
            1,
            Math.floor(chunkContent.length / 4)
          );

          if (onUpdate) {
            const currentMessage = this.conversationManager
              .getThreadMessages(threadId)
              .find((m: ConversationMessage) => m.id === assistantMsgId);
            if (currentMessage) {
              const conversationMsg: ConversationMessage = {
                ...currentMessage,
                status: 'processing',
              };
              onUpdate(conversationMsg);
            }
          }
        }

        tokenCount += followUpTokenCount;

        await this.conversationManager.updateMessage(threadId, assistantMsgId, {
          status: 'completed',
        });
      }

      const finalMessage = this.conversationManager
        .getThreadMessages(threadId)
        .find((m: ConversationMessage) => m.id === assistantMsgId);
      if (!finalMessage) {
        throw new Error('Message not found');
      }

      this.sseService.broadcast('unified-events', {
        type: 'update',
        entityType: 'message',
        entity: {
          id: assistantMsgId,
          status: 'completed',
          ...(citations && { citations }),
        },
        threadId,
        streamId: this.streamId,
      });

      if (onUpdate) {
        onUpdate(finalMessage);
      }

      return finalMessage;
    } catch (error: unknown) {
      this.logger.error('Error in processMessage:', error);

      const duration = Date.now() - startTime;
      this.logger.error(`LLM Error: ${this.config.llmConfig.model}`, {
        error: error instanceof Error ? error.message : String(error),
        duration: `${duration}ms`,
      });

      const userFriendlyMessage = this.getUserFriendlyErrorMessage(error);

      const messages = this.conversationManager.getThreadMessages(threadId);
      const assistantMsg = messages.find(
        (m: ConversationMessage) =>
          m.role === 'assistant' && m.status === 'processing'
      );
      if (assistantMsg) {
        await this.conversationManager.updateMessage(
          threadId,
          assistantMsg.id,
          {
            status: 'cancelled',
            content: assistantMsg.content + '\n\n' + userFriendlyMessage,
          }
        );

        this.sseService.broadcast('unified-events', {
          type: 'update',
          entityType: 'message',
          entity: {
            id: assistantMsg.id,
            status: 'cancelled',
            content: assistantMsg.content + '\n\n' + userFriendlyMessage,
          },
          threadId,
          streamId: this.streamId,
        });

        if (onUpdate) {
          onUpdate({
            ...assistantMsg,
            status: 'cancelled',
            content: assistantMsg.content + '\n\n' + userFriendlyMessage,
          });
        }
        return {
          ...assistantMsg,
          status: 'cancelled',
          content: assistantMsg.content + '\n\n' + userFriendlyMessage,
        };
      }

      throw error;
    }
  }

  private getUserFriendlyErrorMessage(error: Error | unknown): string {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('credit balance is too low')) {
      return '💳 **API Credits Exhausted**\n\nYour API credits have run out. Please:\n- Check your billing dashboard\n- Add more credits or upgrade your plan\n- Switch to a different model if available';
    }

    if (errorMessage.includes('rate limit')) {
      return '⏱️ **Rate Limit Reached**\n\nToo many requests sent. Please wait a moment before trying again.';
    }

    if (
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('authentication')
    ) {
      return '🔐 **Authentication Error**\n\nAPI key may be invalid or expired. Please check your API configuration.';
    }

    if (
      errorMessage.includes('model not found') ||
      errorMessage.includes('model_not_found')
    ) {
      return '🤖 **Model Not Available**\n\nThe requested AI model is not available. Please try a different model.';
    }

    if (errorMessage.includes('timeout') || errorMessage.includes('TIMEOUT')) {
      return '⏰ **Request Timeout**\n\nThe request took too long to complete. Please try again.';
    }

    if (
      errorMessage.includes('network') ||
      errorMessage.includes('connection')
    ) {
      return '🌐 **Network Error**\n\nConnection problem occurred. Please check your internet connection and try again.';
    }

    return `❌ **Error Occurred**\n\nSomething went wrong: ${errorMessage}\n\nPlease try again or check your settings.`;
  }

  async invokeChain(
    threadId: string,
    input: string,
    options?: { streaming?: boolean }
  ): Promise<string> {
    const messages = this.convertToLangChainMessages(threadId);
    messages.push(new HumanMessage(input));

    const boundModel =
      this.chatModel.bindTools && this.langChainTools.length > 0
        ? this.chatModel.bindTools(this.langChainTools)
        : this.chatModel;

    if (options?.streaming) {
      const stream = await boundModel.stream(messages);
      let result = '';
      for await (const chunk of stream) {
        if (typeof chunk.content === 'string') {
          result += chunk.content;
        } else if (Array.isArray(chunk.content)) {
          result += chunk.content
            .map((item: unknown) =>
              typeof item === 'string'
                ? item
                : ((item as { text?: string }).text ?? '')
            )
            .join('');
        } else if (chunk.content && typeof chunk.content === 'object') {
          const contentObj = chunk.content as {
            text?: string;
            content?: string;
          };
          result += contentObj.text ?? contentObj.content ?? '';
        }
      }
      return result;
    } else {
      const result = await boundModel.invoke(messages);
      return result.content.toString();
    }
  }

  getConversation(threadId: string): ConversationMessage[] {
    return this.conversationManager
      .getThreadMessages(threadId)
      .filter((msg: ConversationMessage) => msg.role !== 'system');
  }

  async deleteMessage(threadId: string, messageId: string): Promise<boolean> {
    const deleted = await this.conversationManager.deleteMessage(
      threadId,
      messageId
    );
    if (deleted) {
      try {
        const { SessionService } = await import(
          '../../chat/services/session.service'
        );
        const sessionService = new SessionService();
        await sessionService.updateSessionHistory(
          this.config.llmConfig.type ?? 'local',
          this.config.llmConfig.model ?? 'unknown',
          threadId,
          []
        );
      } catch (error) {
        this.logger.error(
          `Failed to update session history after message deletion:`,
          error
        );
      }

      this.sseService.broadcast('unified-events', {
        type: 'messages-deleted',
        messageIds: [messageId],
      });
    }
    return deleted;
  }

  async cancelMessage(threadId: string, messageId: string): Promise<boolean> {
    const message = this.conversationManager
      .getThreadMessages(threadId)
      .find((msg: ConversationMessage) => msg.id === messageId);
    if (message && message.status === 'processing') {
      await this.conversationManager.updateMessage(threadId, messageId, {
        status: 'cancelled',
      });
      this.sseService.broadcast('unified-events', {
        type: 'update',
        entityType: 'message',
        entity: { id: messageId, status: 'cancelled' },
        threadId,
        streamId: this.streamId,
      });
      return true;
    }
    return false;
  }

  async clearConversation(threadId: string): Promise<void> {
    await this.conversationManager.clearThread(threadId);
  }

  async loadConversation(
    threadId: string,
    messages: ConversationMessage[]
  ): Promise<void> {
    await this.conversationManager.clearThread(threadId);

    for (const msg of messages.filter(
      (m: ConversationMessage) => m.role !== 'system'
    )) {
      await this.conversationManager.addMessage(threadId, msg);
    }
  }

  updateLLMConfig(newLlmConfig: AgentConfig['llmConfig']): void {
    this.config.llmConfig = newLlmConfig;
    this.chatModel = this.createChatModel(newLlmConfig);
    this.initializeAgentExecutor().catch(error => {
      this.logger.error('Failed to reinitialize agent executor:', error);
    });
  }

  updateWorkspaceRoot(newWorkspaceRoot: string): void {
    this.config.workspaceRoot = newWorkspaceRoot;
    this.conversationManager.updateWorkspaceRoot(newWorkspaceRoot);
  }

  async updatePrompt(threadId: string, customPrompt?: string): Promise<void> {
    this.config.customPrompt = customPrompt;
    this.systemPrompt = this.createSystemPrompt();

    this.initializeAgentExecutor().catch(error => {
      this.logger.error(
        'Failed to reinitialize agent executor with new prompt:',
        error
      );
    });
  }

  getCurrentPrompt(): string {
    return this.config.customPrompt ?? this.getDefaultPrompt();
  }

  protected generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  getAgentId(): string {
    return this.agentId;
  }

  getConversationManager() {
    return this.conversationManager;
  }

  getChatModel(): BaseChatModel {
    return this.chatModel;
  }

  getTools(): DynamicStructuredTool[] {
    return this.langChainTools;
  }

  getAgentExecutor(): AgentExecutor | undefined {
    return this.agentExecutor;
  }

  protected async executeToolCalls(
    threadId: string,
    toolCalls: Array<{
      id: string;
      name: string;
      parameters: Record<string, unknown>;
    }>,
    messageId: string
  ): Promise<Array<{ name: string; result: unknown }>> {
    const results = [];

    for (const toolCall of toolCalls) {
      const currentMessage = this.conversationManager
        .getThreadMessages(threadId)
        .find((m: ConversationMessage) => m.id === messageId);
      if (currentMessage?.status === 'cancelled') {
        break;
      }

      try {
        if (toolCall.name.startsWith('mcp_')) {
          const parts = toolCall.name.split('_');
          if (parts.length >= 3) {
            const serverId = parts[1];
            const toolName = parts.slice(2).join('_');

            const mcpResult = await this.mcpManagerService.executeTool(
              serverId,
              toolName,
              toolCall.parameters
            );

            let content = '';
            if (Array.isArray(mcpResult)) {
              content = mcpResult
                .map(item => this.extractTextFromMCPItem(item))
                .join('\n');
            } else if (typeof mcpResult === 'string') {
              content = mcpResult;
            } else if (mcpResult && typeof mcpResult === 'object') {
              content =
                'text' in mcpResult && typeof mcpResult.text === 'string'
                  ? mcpResult.text
                  : JSON.stringify(mcpResult);
            } else {
              content = String(mcpResult);
            }

            if (this.lfsService.isLFSReference(content)) {
              const summary = this.lfsService.getSummaryByReference(content);
              if (summary) {
                const formattedSummary = this.formatLFSSummary(
                  summary,
                  content
                );
                content = formattedSummary;
              } else {
                const retrievedContent =
                  this.lfsService.retrieveContent(content);
                content = retrievedContent ?? content;
              }
            }

            results.push({
              name: toolCall.name,
              result: { success: true, output: content },
            });
          } else {
            results.push({
              name: toolCall.name,
              result: {
                success: false,
                error: `Invalid MCP tool name format: ${toolCall.name}`,
              },
            });
          }
        } else {
          results.push({
            name: toolCall.name,
            result: {
              success: false,
              error: `Tool '${toolCall.name}' not available - all tools are now provided by MCP servers`,
            },
          });
        }
      } catch (error: unknown) {
        results.push({
          name: toolCall.name,
          result: {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }

    return results;
  }

  protected parseToolCalls(content: string): {
    content: string;
    toolCalls?: Array<{
      id: string;
      name: string;
      parameters: Record<string, unknown>;
    }>;
  } {
    this.logger.debug('Parsing content for tool calls:', { content });
    const toolCalls: Array<{
      id: string;
      name: string;
      parameters: Record<string, unknown>;
    }> = [];
    let cleanContent = content;
    const jsonBlocksToRemove: string[] = [];

    const jsonBlockRegex = /```json\s*\n([\s\S]*?)\n```/g;
    let match;

    while ((match = jsonBlockRegex.exec(content)) !== null) {
      this.logger.debug('Found JSON block:', { jsonBlock: match[1] });
      try {
        const jsonStr = match[1];
        const parsed = JSON.parse(jsonStr) as {
          tool?: string;
          parameters?: Record<string, unknown>;
          [key: string]: unknown;
        };

        if (parsed.tool && parsed.parameters) {
          this.logger.debug('Parsed tool call:', {
            tool: parsed.tool,
            parameters: parsed.parameters,
          });
          toolCalls.push({
            id: this.generateId(),
            name: parsed.tool,
            parameters: parsed.parameters,
          });

          jsonBlocksToRemove.push(match[0]);
        } else {
          for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === 'object' && value !== null) {
              const validTools = [
                'read_file',
                'create_file',
                'edit_file',
                'list_directory',
                'bash',
                'glob',
                'grep',
                'todo_write',
                'todo_read',
                'mermaid',
                'get_diagnostics',
                'format_file',
                'undo_edit',
                'web_search',
                'delete_file',
              ];
              if (validTools.includes(key)) {
                this.logger.debug('Parsed alternate tool call:', {
                  tool: key,
                  parameters: value,
                });
                toolCalls.push({
                  id: this.generateId(),
                  name: key,
                  parameters: value as Record<string, unknown>,
                });

                jsonBlocksToRemove.push(match[0]);
                break;
              }
            }
          }
        }
      } catch (e) {
        this.logger.debug('Failed to parse JSON block:', {
          jsonBlock: match[1],
          error: e,
        });
      }
    }

    for (const block of jsonBlocksToRemove) {
      cleanContent = cleanContent.replace(block, '');
    }

    if (toolCalls.length === 0) {
      this.logger.debug('No JSON blocks found, checking for standalone JSON');
      try {
        const trimmed = content.trim();
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
          this.logger.debug('Found standalone JSON:', { json: trimmed });
          const parsed = JSON.parse(trimmed) as {
            tool?: string;
            parameters?: Record<string, unknown>;
          };
          if (parsed.tool && parsed.parameters) {
            this.logger.debug('Parsed standalone tool call:', {
              tool: parsed.tool,
              parameters: parsed.parameters,
            });
            toolCalls.push({
              id: this.generateId(),
              name: parsed.tool,
              parameters: parsed.parameters,
            });
            cleanContent = content;
          }
        }
      } catch (e) {
        this.logger.debug('Failed to parse standalone JSON:', { error: e });
      }
    }

    if (toolCalls.length > 0) {
      this.logger.debug('Parsed tool calls:', { toolCalls });
    }

    cleanContent = cleanContent.replace(/\n\s*\n\s*\n/g, '\n\n').trim();

    return {
      content: cleanContent ?? content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  private formatLFSSummary(
    summary: {
      summary: string;
      originalSize: number;
      keyPoints?: string[];
    },
    lfsReference: string
  ): string {
    const keyPointsText = summary.keyPoints?.length
      ? `\n\n**Key Points:**\n${summary.keyPoints.map(point => `• ${point}`).join('\n')}`
      : '';

    return `📄 **Large Content Summary** (${summary.originalSize} characters)\n\n${summary.summary}${keyPointsText}\n\n*Full content available: ${lfsReference}*`;
  }

  protected async calculateRemainingContext(): Promise<number> {
    try {
      const configManager = new LLMConfigManager();
      const config = await configManager.loadConfiguration();

      const currentModel = config.models.find(
        m =>
          m.model === this.config.llmConfig.model &&
          m.baseURL === this.config.llmConfig.baseURL
      );

      if (!currentModel?.contextLength) {
        return 4000;
      }

      const conversationText = '';

      const estimatedTokensUsed = Math.ceil(conversationText.length / 4);
      const availableTokens = currentModel.contextLength - estimatedTokensUsed;

      const reservedTokens = 500;
      const remainingTokens = Math.max(availableTokens - reservedTokens, 1000);

      return remainingTokens * 3;
    } catch (error) {
      this.logger.error('Failed to calculate remaining context:', error);
      return 4000;
    }
  }
}
