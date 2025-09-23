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
import { ChatPerplexity } from '@langchain/community/chat_models/perplexity';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import type { DynamicStructuredTool } from '@langchain/core/tools';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { ChatLocalLLM } from './chat-local-llm.js';
import { logger } from '../logger.js';
import { cleanContentForLLM } from '../utils/content-filter.js';
import { LLMConfigManager } from '../llm-config-manager.js';
import { serverDebugLogger } from '../debug-logger.js';
import { sseManager } from '../sse-manager.js';
import { ConversationManager } from '../conversation-manager.js';
import { mcpManager } from '../mcp-manager.js';
import { lfsManager } from '../lfs-manager.js';

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
}

export abstract class BaseAgent {
  protected chatModel: BaseChatModel;

  protected systemPrompt: string;
  protected config: AgentConfig;
  protected agentId: string;
  protected conversationManager: ConversationManager;
  protected langChainTools: DynamicStructuredTool[] = [];
  protected agentExecutor?: AgentExecutor;
  protected promptTemplate: ChatPromptTemplate;
  protected streamId?: string; // For SSE filtering

  // Public getter for LLM config
  get llmConfig(): AgentConfig['llmConfig'] {
    return this.config.llmConfig;
  }

  constructor(config: AgentConfig, agentId?: string) {
    this.config = config;
    this.agentId = agentId || this.generateId();

    // Initialize chat model based on type
    this.chatModel = this.createChatModel(config.llmConfig);

    // Initialize conversation manager
    this.conversationManager = new ConversationManager(config.workspaceRoot);

    // Initialize LangChain tools FIRST before creating system prompt
    this.initializeLangChainTools();

    // Create system prompt after tools are loaded
    this.systemPrompt = this.createSystemPrompt();

    // Create prompt template - escape curly braces in system prompt for LangChain
    const escapedSystemPrompt = this.systemPrompt
      .replace(/{/g, '{{')
      .replace(/}/g, '}}');
    this.promptTemplate = ChatPromptTemplate.fromMessages([
      ['system', escapedSystemPrompt],
      ['placeholder', '{chat_history}'],
      ['human', '{input}'],
      ['placeholder', '{agent_scratchpad}'],
    ]);

    // Initialize agent executor
    this.initializeAgentExecutor();
  }

  // Abstract methods that must be implemented by derived classes
  abstract createSystemPrompt(): string;
  abstract getDefaultPrompt(): string;

  // Set stream ID for SSE filtering
  setStreamId(streamId: string): void {
    this.streamId = streamId;
  }

  protected createChatModel(
    llmConfig: AgentConfig['llmConfig'],
    threadId?: string
  ): BaseChatModel {
    const baseConfig = {
      temperature: llmConfig.temperature || 0.7,
      maxTokens: llmConfig.maxTokens || 4000,
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
        return new ChatPerplexity({
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
        // Convert relative URLs to full URLs for local models
        let baseURL = llmConfig.baseURL;
        if (baseURL && baseURL.startsWith('/api/')) {
          baseURL = `http://localhost:3001${baseURL}`;
        }

        return new ChatOpenAI({
          openAIApiKey: llmConfig.apiKey || 'dummy-key',
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
    // Only use MCP tools - no built-in tools
    const mcpTools = mcpManager.getLangChainTools();
    this.langChainTools = mcpTools;
  }

  protected async initializeAgentExecutor(): Promise<void> {
    if (this.chatModel.bindTools && this.langChainTools.length > 0) {
      // Create tool-calling agent - recreate prompt template with escaped system prompt
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

  // Method to refresh tools when MCP servers change
  async refreshTools(): Promise<void> {
    this.initializeLangChainTools();

    // Regenerate system prompt with new tools
    this.systemPrompt = this.createSystemPrompt();

    // Update the prompt template with new system prompt
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
      // Only include the last user message (system message will be added dynamically)
      const userMessages = allMessages.filter(msg => msg.role === 'user');
      const lastUserMessage = userMessages.slice(-1);

      if (lastUserMessage.length > 0) {
        messages = lastUserMessage;
      } else {
        // Fallback to all non-system messages
        messages = allMessages.filter(msg => msg.role !== 'system');
      }
    } else {
      // Filter out any existing system messages from stored messages
      messages = allMessages.filter(msg => msg.role !== 'system');
    }

    // Filter out messages with empty content (except final assistant message)
    const filteredMessages = messages.filter((msg, index) => {
      // Always filter out messages with no content
      if (
        !msg.content ||
        (typeof msg.content === 'string' && msg.content.trim() === '')
      ) {
        // Allow empty final assistant message as per LLM requirements
        const shouldKeep =
          msg.role === 'assistant' && index === messages.length - 1;
        return shouldKeep;
      }
      return true;
    });

    // Check if this is Perplexity to apply special message formatting
    const isPerplexity =
      this.config.llmConfig.baseURL?.includes('perplexity') ||
      this.config.llmConfig.type === 'perplexity' ||
      this.config.llmConfig.model?.includes('sonar');

    const langChainMessages = filteredMessages.map(msg => {
      // Ensure content is a string before cleaning
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
          // Handle images and notes for user messages
          if (msg.images && msg.images.length > 0) {
            // Check if this is Anthropic vs Perplexity vs OpenAI-compatible vs Ollama
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
              // For Anthropic APIs, use their specific image format
              const contentArray: Array<{
                type: 'text' | 'image';
                text?: string;
                source?: { type: 'base64'; media_type: string; data: string };
              }> = [];

              // Add text content if present
              if (content && content.trim()) {
                contentArray.push({
                  type: 'text',
                  text: content,
                });
              }

              // Add images - use full-size image for better LLM analysis
              for (const image of msg.images) {
                let imageData = image.fullImage || image.thumbnail;
                let mediaType = image.mimeType || 'image/jpeg';

                // Extract base64 data if it's a data URL
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

              // Add notes content to the text portion
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
              // Perplexity doesn't support images, so just return text content
              return new HumanMessage(content);
            } else if (isGoogle) {
              // Google supports images, use OpenAI-compatible format
              const contentArray: Array<{
                type: 'text' | 'image_url';
                text?: string;
                image_url?: { url: string };
              }> = [];

              // Add text content if present
              if (content && content.trim()) {
                contentArray.push({
                  type: 'text',
                  text: content,
                });
              }

              // Add images
              for (const image of msg.images) {
                contentArray.push({
                  type: 'image_url',
                  image_url: {
                    url: image.fullImage, // Use fullImage property from ImageAttachment
                  },
                });
              }

              return new HumanMessage({ content: contentArray });
            } else if (isOllama) {
              // For Ollama vision models, use proper LangChain format
              // The convertToOllamaMessages utility will handle the conversion to Ollama's expected format
              const contentArray: Array<{
                type: 'text' | 'image_url';
                text?: string;
                image_url?: string;
              }> = [];

              // Handle text content and notes
              let textContent = content;
              if (msg.notes && msg.notes.length > 0) {
                const notesText = this.formatAttachedNotes(msg.notes);
                textContent += notesText;
              }

              // Add text content if present
              if (textContent && textContent.trim()) {
                contentArray.push({
                  type: 'text',
                  text: textContent,
                });
              }

              // Add images - use proper data URL format for LangChain
              for (const image of msg.images) {
                let imageUrl = image.fullImage || image.thumbnail;

                // Ensure it's a proper data URL
                if (!imageUrl.startsWith('data:')) {
                  const mimeType = image.mimeType || 'image/jpeg';
                  imageUrl = `data:${mimeType};base64,${imageUrl}`;
                }

                contentArray.push({
                  type: 'image_url',
                  image_url: imageUrl,
                });
              }

              return new HumanMessage({ content: contentArray });
            } else {
              // For OpenAI-compatible APIs, use proper image format
              const contentArray: Array<{
                type: 'text' | 'image_url';
                text?: string;
                image_url?: { url: string };
              }> = [];

              // Add text content if present
              if (content && content.trim()) {
                contentArray.push({
                  type: 'text',
                  text: content,
                });
              }

              // Add images - use full-size image for better LLM analysis
              for (const image of msg.images) {
                let imageUrl = image.fullImage || image.thumbnail;

                // Ensure it's a proper data URL
                if (!imageUrl.startsWith('data:')) {
                  imageUrl = `data:${image.mimeType || 'image/jpeg'};base64,${imageUrl}`;
                }

                contentArray.push({
                  type: 'image_url',
                  image_url: {
                    url: imageUrl,
                  },
                });
              }

              // Add notes content to the text portion
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
            // No images, just handle text and notes
            let userContent = content || '';
            if (msg.notes && msg.notes.length > 0) {
              const notesText = this.formatAttachedNotes(msg.notes);
              userContent += notesText;
            }
            return new HumanMessage(userContent);
          }
        case 'assistant':
          return new AIMessage(content || '');
        default:
          return new HumanMessage(content || '');
      }
    });

    // Ensure system messages come first, as required by most LLM APIs
    // Merge multiple system messages into one (Anthropic only allows one system message)
    const systemMessages = langChainMessages.filter(
      msg => msg instanceof SystemMessage
    );
    const nonSystemMessages = langChainMessages.filter(
      msg => !(msg instanceof SystemMessage)
    );

    // Combine all system message content into a single system message
    const mergedSystemMessage =
      systemMessages.length > 0
        ? new SystemMessage(systemMessages.map(msg => msg.content).join('\n\n'))
        : null;

    const reorderedMessages = mergedSystemMessage
      ? [mergedSystemMessage, ...nonSystemMessages]
      : nonSystemMessages;

    // Ensure we have at least one message for the LLM API
    if (reorderedMessages.length === 0) {
      // Create a fallback system message if no messages exist
      const fallbackMessage = new SystemMessage(
        this.systemPrompt ||
          this.createSystemPrompt() ||
          'You are a helpful AI assistant.'
      );
      return [fallbackMessage];
    }

    // Add system message at the beginning
    const systemPromptContent = this.systemPrompt || this.createSystemPrompt();
    const systemMessage = new SystemMessage(systemPromptContent);
    const finalMessages = [systemMessage, ...reorderedMessages];

    // Special handling for Perplexity: ensure proper message alternation
    if (isPerplexity && finalMessages.length > 0) {
      return this.reorderMessagesForPerplexity(finalMessages);
    }

    return finalMessages;
  }

  private reorderMessagesForPerplexity(messages: BaseMessage[]): BaseMessage[] {
    // Perplexity requires:
    // 1. Optional system messages first
    // 2. Then strict alternation starting with user message: User, Assistant, User, Assistant...
    // 3. Must end with a user message

    const systemMessages = messages.filter(msg => msg instanceof SystemMessage);
    const conversationMessages = messages.filter(
      msg => !(msg instanceof SystemMessage)
    );

    // If no conversation messages, just return system messages
    if (conversationMessages.length === 0) {
      return systemMessages;
    }

    // Separate user and assistant messages while preserving order
    const userMessages = conversationMessages.filter(
      msg => msg instanceof HumanMessage
    );
    const assistantMessages = conversationMessages.filter(
      msg => msg instanceof AIMessage
    );

    // If no user messages, we can't create a valid Perplexity conversation
    if (userMessages.length === 0) {
      return messages; // Return original, let Perplexity handle the error
    }

    // Create properly alternating conversation: System, User, Assistant, User, Assistant...
    const result = [...systemMessages];

    // Start with first user message
    result.push(userMessages[0]);

    // Now alternate between assistant and user messages
    let userIndex = 1;
    let assistantIndex = 0;

    while (
      userIndex < userMessages.length ||
      assistantIndex < assistantMessages.length
    ) {
      // Add assistant message if available
      if (assistantIndex < assistantMessages.length) {
        result.push(assistantMessages[assistantIndex]);
        assistantIndex++;
      }

      // Add user message if available
      if (userIndex < userMessages.length) {
        result.push(userMessages[userIndex]);
        userIndex++;
      }
    }

    // Ensure we end with a user message
    const lastMessage = result[result.length - 1];
    if (!(lastMessage instanceof HumanMessage)) {
      // If the last message is not a user message, remove the last assistant message
      // This ensures we end with the previous user message
      if (
        result.length > 1 &&
        result[result.length - 2] instanceof HumanMessage
      ) {
        result.pop(); // Remove the last assistant message
      }
    }

    return result;
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
    // Extract options with defaults
    const {
      images,
      notes,
      onUpdate,
      userMessageId,
      includePriorConversation = true,
      signal,
    } = options || {};
    // Initialize conversation manager and load existing data
    await this.conversationManager.load();

    // Ensure thread exists, create if needed
    let thread = this.conversationManager.getThread(threadId);
    if (!thread) {
      thread = await this.conversationManager.createThread();
      threadId = thread.id;
    }

    // Ensure we have a valid system prompt but don't persist it
    const systemPromptContent = this.systemPrompt || this.createSystemPrompt();

    if (!systemPromptContent || systemPromptContent.trim() === '') {
      throw new Error(
        'System prompt is empty. Agent must implement createSystemPrompt() method.'
      );
    }

    // System message is now handled dynamically in convertToLangChainMessages
    // and not persisted to chat history

    // Validate user message input
    if (!userMessage || typeof userMessage !== 'string') {
      throw new Error(
        `Invalid user message: received ${typeof userMessage} instead of string`
      );
    }

    // For local models, recreate the chat model with the thread ID to ensure proper history loading
    if (this.config.llmConfig.type === 'local') {
      this.chatModel = this.createChatModel(this.config.llmConfig, threadId);
    }

    // Session switching is handled at the AgentPool level when setCurrentThread is called

    // Check if user message already exists (it might have been added by the main handler)
    let userMsg: ConversationMessage | undefined;
    if (userMessageId) {
      await this.conversationManager.load();
      const thread = this.conversationManager.getThread(threadId);
      userMsg = thread?.messages.find(msg => msg.id === userMessageId);
    }

    // Only add user message if it doesn't already exist
    if (!userMsg) {
      userMsg = {
        id: userMessageId || this.generateId(),
        role: 'user',
        content: userMessage,
        timestamp: new Date(),
        status: 'completed',
        images: images || [],
        notes: notes || [],
      };

      await this.conversationManager.addMessage(threadId, userMsg);

      // Send user message creation event to frontend only if we created it
      sseManager.broadcast('unified-events', {
        type: 'create',
        entityType: 'message',
        entity: userMsg,
        threadId,
        streamId: this.streamId,
      });
    }

    // Start timing for debug logging
    const startTime = Date.now();

    try {
      // Create assistant message in streaming state
      const assistantMsgId = this.generateId();
      const assistantMsg: ConversationMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        status: 'processing',
        model: this.config.llmConfig.displayName || this.config.llmConfig.model,
      };
      await this.conversationManager.addMessage(threadId, assistantMsg);

      // Send assistant message creation event to frontend
      sseManager.broadcast('unified-events', {
        type: 'create',
        entityType: 'message',
        entity: assistantMsg,
        threadId,
        streamId: this.streamId,
      });

      // Always use direct streaming with tool parsing for consistent behavior
      const messages = this.convertToLangChainMessages(
        threadId,
        includePriorConversation
      );

      // Log the request for debugging
      serverDebugLogger.logRequest(
        `LLM Request: ${this.config.llmConfig.model}`,
        JSON.stringify(
          {
            messages: messages.map(msg => ({
              role: msg._getType(),
              content:
                typeof msg.content === 'string'
                  ? msg.content
                  : '[Complex Content]',
            })),
            model: this.config.llmConfig.model,
          },
          null,
          2
        ),
        this.config.llmConfig.model,
        this.config.llmConfig.baseURL
      );

      // Use bound model with tools for proper tool call streaming
      // Note: ChatOllama has issues with token-level streaming when tools are bound
      const isOllamaModel = this.config.llmConfig.type === 'ollama';
      const boundModel =
        this.chatModel.bindTools &&
        this.langChainTools.length > 0 &&
        !isOllamaModel
          ? this.chatModel.bindTools(this.langChainTools)
          : this.chatModel;

      const stream = await boundModel.stream(messages);
      let fullContent = '';
      let tokenCount = 0; // Track tokens generated
      let lastTokenUpdate = startTime; // Track last token stats update
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
        | undefined = undefined; // To accumulate tool call chunks

      // Set up abort controller for cancellation
      const abortController = new AbortController();

      // Connect external signal to local abort controller
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
          sseManager.broadcast('unified-events', {
            type: 'update',
            entityType: 'message',
            entity: { id: assistantMsgId, status: 'cancelled' },
            threadId,
            streamId: this.streamId,
          });
          break;
        }

        // Accumulate chunks for tool calls (using concat utility)
        if (!accumulatedMessage) {
          accumulatedMessage = {
            tool_calls:
              chunk.tool_calls?.map(tc => ({
                id: tc.id || '',
                name: tc.name,
                args: tc.args,
              })) || [],
            tool_call_chunks:
              chunk.tool_call_chunks?.map(tcc => ({
                index: tcc.index || 0,
                id: tcc.id,
                name: tcc.name,
                args: tcc.args,
              })) || [],
          };
        } else {
          // Simple manual concatenation for tool call chunks
          if (chunk.tool_call_chunks && chunk.tool_call_chunks.length > 0) {
            if (!accumulatedMessage.tool_call_chunks) {
              accumulatedMessage.tool_call_chunks = [];
            }
            // Merge tool call chunks by index
            for (const newChunk of chunk.tool_call_chunks) {
              const existingIndex =
                accumulatedMessage.tool_call_chunks.findIndex(
                  (existing: {
                    index: number;
                    id?: string;
                    name?: string;
                    args?: string;
                  }) => existing.index === (newChunk.index || 0)
                );
              if (existingIndex >= 0) {
                // Merge existing chunk
                const existing =
                  accumulatedMessage.tool_call_chunks[existingIndex];
                accumulatedMessage.tool_call_chunks[existingIndex] = {
                  ...existing,
                  name: newChunk.name || existing.name,
                  args: (existing.args || '') + (newChunk.args || ''),
                  id: newChunk.id || existing.id,
                };
              } else {
                // Add new chunk
                accumulatedMessage.tool_call_chunks.push({
                  index: newChunk.index || 0,
                  id: newChunk.id,
                  name: newChunk.name,
                  args: newChunk.args,
                });
              }
            }
          }
        }

        // Extract content properly - handle different content types from LangChain
        let chunkContent = '';
        if (typeof chunk.content === 'string') {
          chunkContent = chunk.content;
        } else if (Array.isArray(chunk.content)) {
          // Handle array of content objects
          chunkContent = chunk.content
            .map((item: unknown) =>
              typeof item === 'string'
                ? item
                : (item as { text?: string }).text || ''
            )
            .join('');
        } else if (chunk.content && typeof chunk.content === 'object') {
          // Handle content objects
          chunkContent =
            (chunk.content as { text?: string; content?: string }).text ||
            (chunk.content as { text?: string; content?: string }).content ||
            '';
        }

        fullContent += chunkContent;
        await this.conversationManager.updateMessage(threadId, assistantMsgId, {
          content: fullContent,
        });

        // Count tokens (approximate: 1 token ≈ 4 characters)
        tokenCount += Math.max(1, Math.floor(chunkContent.length / 4));

        // Send token stats update every 1 second during streaming
        const now = Date.now();
        if (now - lastTokenUpdate > 1000) {
          const elapsed = (now - startTime) / 1000;
          if (elapsed > 0.5 && tokenCount > 0) {
            const tokensPerSecond = tokenCount / elapsed;
            sseManager.broadcast('unified-events', {
              type: 'token',
              tokensPerSecond: tokensPerSecond,
              totalTokens: tokenCount,
              streamId: this.streamId, // Add streamId for filtering
            });
            lastTokenUpdate = now;
          }
        }

        // Send real-time update via callback and SSE
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

            // Send update event to frontend
            sseManager.broadcast('unified-events', {
              type: 'update',
              entityType: 'message',
              entity: { id: assistantMsgId, content: fullContent },
              threadId,
              streamId: this.streamId,
            });
          }
        }
      }

      // Use tool calls from accumulated stream chunks or fallback to text parsing
      let toolCalls: Array<{
        id: string;
        name: string;
        parameters: Record<string, unknown>;
      }> = [];

      // Check if we got tool calls from streaming
      if (
        accumulatedMessage?.tool_calls &&
        accumulatedMessage.tool_calls.length > 0
      ) {
        // Convert LangChain tool calls to our format
        toolCalls = accumulatedMessage.tool_calls.map(
          (toolCall: {
            id?: string;
            name: string;
            args: string | Record<string, unknown>;
          }) => ({
            id: toolCall.id || this.generateId(),
            name: toolCall.name,
            parameters:
              typeof toolCall.args === 'string'
                ? JSON.parse(toolCall.args)
                : toolCall.args,
          })
        );
      } else if (
        accumulatedMessage?.tool_call_chunks &&
        accumulatedMessage.tool_call_chunks.length > 0
      ) {
        // Convert tool call chunks to our format
        toolCalls = accumulatedMessage.tool_call_chunks
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
              id: chunk.id || this.generateId(),
              name: chunk.name!,
              parameters:
                typeof chunk.args === 'string'
                  ? JSON.parse(chunk.args)
                  : chunk.args,
            })
          );
      } else {
        // Fallback to text parsing for models that don't support tool call streaming
        const { toolCalls: parsedToolCalls } = this.parseToolCalls(fullContent);
        toolCalls = parsedToolCalls || [];
      }

      // Log the response for debugging
      const duration = Date.now() - startTime;
      const tokensPerSecond = duration > 0 ? tokenCount / (duration / 1000) : 0;
      serverDebugLogger.logResponse(
        `LLM Response: ${this.config.llmConfig.model}`,
        JSON.stringify(
          {
            content: fullContent,
            toolCalls: toolCalls,
            duration: `${duration}ms`,
            tokens: tokenCount,
            tokensPerSecond: tokensPerSecond.toFixed(2),
          },
          null,
          2
        ),
        duration,
        this.config.llmConfig.model,
        this.config.llmConfig.baseURL,
        tokensPerSecond,
        tokenCount
      );

      // Update message with final content and tool calls
      await this.conversationManager.updateMessage(threadId, assistantMsgId, {
        content: fullContent, // Keep the content even with tool calls
        toolCalls,
        status: toolCalls && toolCalls.length > 0 ? 'processing' : 'completed',
      });

      // Execute tool calls if present
      if (toolCalls && toolCalls.length > 0) {
        // Send update for tool execution
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

        // Check if cancelled during tool execution
        const currentMessage = this.conversationManager
          .getThreadMessages(threadId)
          .find((m: ConversationMessage) => m.id === assistantMsgId);
        if (currentMessage?.status === 'cancelled') {
          return currentMessage;
        }

        // Update message with tool results
        await this.conversationManager.updateMessage(threadId, assistantMsgId, {
          toolResults,
          status: 'processing', // Still processing while getting follow-up response
        });

        // Get follow-up response after tool execution
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

        // Create follow-up messages, ensuring no empty assistant messages
        const followUpMessages = [
          ...messages,
          // Only include the assistant message if it has content
          ...(fullContent && fullContent.trim()
            ? [new AIMessage(fullContent)]
            : []),
          new HumanMessage(
            `Tool execution results:\n${toolResultContent}\n\nPlease respond to the user with the relevant information from the tool results. Include the actual content/data from the tools when it's helpful to the user.`
          ),
        ];

        // Stream the follow-up response
        await this.conversationManager.updateMessage(threadId, assistantMsgId, {
          content: '',
        });

        const followUpStream = await boundModel.stream(followUpMessages);
        let followUpContent = '';
        let followUpTokenCount = 0; // Track tokens in follow-up response

        for await (const chunk of followUpStream) {
          // Check if streaming was cancelled
          if (abortController.signal.aborted) {
            await this.conversationManager.updateMessage(
              threadId,
              assistantMsgId,
              { status: 'cancelled' }
            );
            sseManager.broadcast('unified-events', {
              type: 'update',
              entityType: 'message',
              entity: { id: assistantMsgId, status: 'cancelled' },
              threadId,
              streamId: this.streamId,
            });
            break;
          }

          // Extract content properly for follow-up response
          let chunkContent = '';
          if (typeof chunk.content === 'string') {
            chunkContent = chunk.content;
          } else if (Array.isArray(chunk.content)) {
            chunkContent = chunk.content
              .map((item: unknown) =>
                typeof item === 'string'
                  ? item
                  : (item as { text?: string }).text || ''
              )
              .join('');
          } else if (chunk.content && typeof chunk.content === 'object') {
            chunkContent =
              (chunk.content as { text?: string; content?: string }).text ||
              (chunk.content as { text?: string; content?: string }).content ||
              '';
          }

          followUpContent += chunkContent;
          await this.conversationManager.updateMessage(
            threadId,
            assistantMsgId,
            { content: followUpContent }
          );

          // Count tokens in follow-up response
          followUpTokenCount += Math.max(
            1,
            Math.floor(chunkContent.length / 4)
          );

          // Send real-time update via callback
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

        // Update total token count
        tokenCount += followUpTokenCount;

        await this.conversationManager.updateMessage(threadId, assistantMsgId, {
          status: 'completed',
        });
      }

      // Get final message
      const finalMessage = this.conversationManager
        .getThreadMessages(threadId)
        .find((m: ConversationMessage) => m.id === assistantMsgId);
      if (!finalMessage) {
        throw new Error('Message not found');
      }

      // Send final update event to frontend
      sseManager.broadcast('unified-events', {
        type: 'update',
        entityType: 'message',
        entity: { id: assistantMsgId, status: 'completed' },
        threadId,
        streamId: this.streamId,
      });

      // Send final update via callback
      if (onUpdate) {
        onUpdate(finalMessage);
      }

      return finalMessage;
    } catch (error: unknown) {
      logger.error('Error in processMessage:', error);

      // Log the error for debugging
      const duration = Date.now() - startTime;
      serverDebugLogger.logError(
        `LLM Error: ${this.config.llmConfig.model}`,
        JSON.stringify(
          {
            error: error instanceof Error ? error.message : String(error),
            duration: `${duration}ms`,
          },
          null,
          2
        ),
        this.config.llmConfig.model,
        this.config.llmConfig.baseURL
      );

      // Create user-friendly error message
      const userFriendlyMessage = this.getUserFriendlyErrorMessage(error);

      // Find the assistant message and mark it as error
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
            status: 'cancelled', // Use 'cancelled' instead of 'error' to match ConversationMessage status type
            content: assistantMsg.content + '\n\n' + userFriendlyMessage,
          }
        );

        // Send error update event to frontend
        sseManager.broadcast('unified-events', {
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
    // Extract error information
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Handle specific API errors gracefully
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

    // For unknown errors, show a generic but helpful message
    return `❌ **Error Occurred**\n\nSomething went wrong: ${errorMessage}\n\nPlease try again or check your settings.`;
  }

  // Chain-specific methods
  async invokeChain(
    threadId: string,
    input: string,
    options?: { streaming?: boolean }
  ): Promise<string> {
    const messages = this.convertToLangChainMessages(threadId);
    messages.push(new HumanMessage(input));

    // Use bound model with tools
    const boundModel =
      this.chatModel.bindTools && this.langChainTools.length > 0
        ? this.chatModel.bindTools(this.langChainTools)
        : this.chatModel;

    if (options?.streaming) {
      const stream = await boundModel.stream(messages);
      let result = '';
      for await (const chunk of stream) {
        // Extract content properly
        if (typeof chunk.content === 'string') {
          result += chunk.content;
        } else if (Array.isArray(chunk.content)) {
          result += chunk.content
            .map((item: unknown) =>
              typeof item === 'string'
                ? item
                : (item as { text?: string }).text || ''
            )
            .join('');
        } else if (chunk.content && typeof chunk.content === 'object') {
          const contentObj = chunk.content as {
            text?: string;
            content?: string;
          };
          result += contentObj.text || contentObj.content || '';
        }
      }
      return result;
    } else {
      const result = await boundModel.invoke(messages);
      return result.content.toString();
    }
  }

  // Existing interface methods
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
      // Update LLM session history for all provider types
      try {
        const { globalSessionManager } = await import('../session-manager.js');
        await globalSessionManager.updateSessionHistory(
          this.config.llmConfig.type || 'openai',
          this.config.llmConfig.model || 'gpt-4',
          threadId,
          []
        );
      } catch (error) {
        logger.error(
          `Failed to update session history after message deletion:`,
          error
        );
      }

      // Send delete event to frontend using the same format as the API endpoint
      sseManager.broadcast('unified-events', {
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
      // Send update event to frontend
      sseManager.broadcast('unified-events', {
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
    // System message is now handled dynamically in convertToLangChainMessages
  }

  async loadConversation(
    threadId: string,
    messages: ConversationMessage[]
  ): Promise<void> {
    await this.conversationManager.clearThread(threadId);

    // Load all non-system messages from conversation history
    // System messages are now handled dynamically in convertToLangChainMessages
    for (const msg of messages.filter(
      (m: ConversationMessage) => m.role !== 'system'
    )) {
      await this.conversationManager.addMessage(threadId, msg);
    }
  }

  updateLLMConfig(newLlmConfig: AgentConfig['llmConfig']): void {
    this.config.llmConfig = newLlmConfig;
    this.chatModel = this.createChatModel(newLlmConfig);
    this.initializeAgentExecutor(); // Reinitialize agent executor with new model
  }

  updateWorkspaceRoot(newWorkspaceRoot: string): void {
    this.config.workspaceRoot = newWorkspaceRoot;
    this.conversationManager.updateWorkspaceRoot(newWorkspaceRoot);
  }

  async updatePrompt(threadId: string, customPrompt?: string): Promise<void> {
    this.config.customPrompt = customPrompt;
    this.systemPrompt = this.createSystemPrompt();

    // System messages are now handled dynamically, no need to update stored messages
    // Reinitialize agent executor with new system prompt
    this.initializeAgentExecutor();
  }

  getCurrentPrompt(): string {
    return this.config.customPrompt || this.getDefaultPrompt();
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

  // Access to LangChain components
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
      // Check if message was cancelled
      const currentMessage = this.conversationManager
        .getThreadMessages(threadId)
        .find((m: ConversationMessage) => m.id === messageId);
      if (currentMessage?.status === 'cancelled') {
        break;
      }

      try {
        // Parse MCP tool name: mcp_${serverId}_${toolName}
        if (toolCall.name.startsWith('mcp_')) {
          const parts = toolCall.name.split('_');
          if (parts.length >= 3) {
            const serverId = parts[1];
            const toolName = parts.slice(2).join('_'); // Handle tool names with underscores

            const mcpResult = await mcpManager.executeTool(
              serverId,
              toolName,
              toolCall.parameters
            );

            // Extract content from MCP result
            let content = '';
            if (Array.isArray(mcpResult)) {
              // MCP returns array of content objects
              content = mcpResult
                .map(item => {
                  if (typeof item === 'string') {
                    return item;
                  } else if (item.text) {
                    return item.text;
                  } else if (item.type === 'text') {
                    return item.text || '';
                  } else {
                    return JSON.stringify(item);
                  }
                })
                .join('\n');
            } else if (typeof mcpResult === 'string') {
              content = mcpResult;
            } else if (mcpResult && typeof mcpResult === 'object') {
              content = mcpResult.text || JSON.stringify(mcpResult);
            } else {
              content = String(mcpResult);
            }

            // Handle LFS content - use summary for chat display
            if (lfsManager.isLFSReference(content)) {
              const summary = lfsManager.getSummaryByReference(content);
              if (summary) {
                // Format summary for display
                const formattedSummary = this.formatLFSSummary(
                  summary,
                  content
                );
                content = formattedSummary;
              } else {
                // Fallback to original content if no summary available
                const retrievedContent = lfsManager.retrieveContent(content);
                content = retrievedContent || content;
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
    logger.debug('Parsing content for tool calls:', { content });
    const toolCalls: Array<{
      id: string;
      name: string;
      parameters: Record<string, unknown>;
    }> = [];
    let cleanContent = content;
    const jsonBlocksToRemove: string[] = [];

    // Look for JSON blocks within ```json ... ``` code blocks
    const jsonBlockRegex = /```json\s*\n([\s\S]*?)\n```/g;
    let match;

    while ((match = jsonBlockRegex.exec(content)) !== null) {
      logger.debug('Found JSON block:', { jsonBlock: match[1] });
      try {
        const jsonStr = match[1];
        const parsed = JSON.parse(jsonStr);

        // Handle correct format: {"tool": "name", "parameters": {...}}
        if (parsed.tool && parsed.parameters) {
          logger.debug('Parsed tool call:', {
            tool: parsed.tool,
            parameters: parsed.parameters,
          });
          toolCalls.push({
            id: this.generateId(),
            name: parsed.tool,
            parameters: parsed.parameters,
          });

          jsonBlocksToRemove.push(match[0]);
        }
        // Handle alternate format: {"tool_name": {...}}
        else {
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
                logger.debug('Parsed alternate tool call:', {
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
        logger.debug('Failed to parse JSON block:', {
          jsonBlock: match[1],
          error: e,
        });
      }
    }

    // Remove all identified JSON blocks from the content
    for (const block of jsonBlocksToRemove) {
      cleanContent = cleanContent.replace(block, '');
    }

    // Also check for standalone JSON without code blocks
    if (toolCalls.length === 0) {
      logger.debug('No JSON blocks found, checking for standalone JSON');
      try {
        const trimmed = content.trim();
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
          logger.debug('Found standalone JSON:', { json: trimmed });
          const parsed = JSON.parse(trimmed);
          if (parsed.tool && parsed.parameters) {
            logger.debug('Parsed standalone tool call:', {
              tool: parsed.tool,
              parameters: parsed.parameters,
            });
            toolCalls.push({
              id: this.generateId(),
              name: parsed.tool,
              parameters: parsed.parameters,
            });
            cleanContent = '';
          }
        }
      } catch (e) {
        logger.debug('Failed to parse standalone JSON:', { error: e });
      }
    }

    if (toolCalls.length > 0) {
      logger.debug('Parsed tool calls:', { toolCalls });
    }

    // Clean up the content by removing extra whitespace and newlines
    cleanContent = cleanContent.replace(/\n\s*\n\s*\n/g, '\n\n').trim();

    return {
      content: cleanContent || content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  /**
   * Format LFS summary for chat display
   */
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

  /**
   * Calculate remaining context length for the current model
   */
  protected async calculateRemainingContext(): Promise<number> {
    try {
      const configManager = new LLMConfigManager();
      const config = await configManager.loadConfiguration();

      // Find the current model
      const currentModel = config.models.find(
        m =>
          m.model === this.config.llmConfig.model &&
          m.baseURL === this.config.llmConfig.baseURL
      );

      if (!currentModel?.contextLength) {
        // Default fallback if we can't determine context length
        return 4000; // Conservative estimate
      }

      // Estimate tokens used so far (rough approximation: 1 token ≈ 4 characters)
      // Note: This method would need threadId parameter to work with conversation manager
      // For now, return a conservative estimate
      const conversationText = ''; // Would need to be fixed when this method is used

      const estimatedTokensUsed = Math.ceil(conversationText.length / 4);
      const availableTokens = currentModel.contextLength - estimatedTokensUsed;

      // Reserve some tokens for the response and convert to characters (conservative estimate)
      const reservedTokens = 500; // Reserve for the JSON response structure
      const remainingTokens = Math.max(availableTokens - reservedTokens, 1000); // Minimum safety buffer

      // Convert tokens back to characters (conservative: 3 characters per token for output)
      return remainingTokens * 3;
    } catch (error) {
      logger.error('Failed to calculate remaining context:', error);
      return 4000; // Fallback
    }
  }
}
