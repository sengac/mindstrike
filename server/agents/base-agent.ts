import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOllama } from '@langchain/ollama';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPerplexity } from '@langchain/community/chat_models/perplexity';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';
import { Runnable } from '@langchain/core/runnables';

import { ChatLocalLLM } from './chat-local-llm.js';
import { logger } from '../logger.js';
import { cleanContentForLLM } from '../utils/content-filter.js';
import { LLMConfigManager } from '../llm-config-manager.js';
import { serverDebugLogger } from '../debug-logger.js';
import { sseManager } from '../sse-manager.js';
import { getAgentStore, StreamingMessage } from '../../src/store/useAgentStore.js';
import { mcpManager } from '../mcp-manager.js';

export interface AgentConfig {
  workspaceRoot: string;
  llmConfig: {
    baseURL: string;
    model: string;
    displayName?: string;
    apiKey?: string; 
    type?: 'ollama' | 'vllm' | 'openai-compatible' | 'openai' | 'anthropic' | 'perplexity' | 'google' | 'local';
    temperature?: number;
    maxTokens?: number;
  };
  customRole?: string;
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
  toolCalls?: Array<{id: string; name: string; parameters: Record<string, any>}>;
  toolResults?: Array<{ name: string; result: any }>;
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
  protected store: ReturnType<typeof getAgentStore>;
  protected langChainTools: DynamicStructuredTool[] = [];
  protected agentExecutor?: AgentExecutor;
  protected promptTemplate: ChatPromptTemplate;

  constructor(config: AgentConfig, agentId?: string) {
    this.config = config;
    this.agentId = agentId || this.generateId();
    
    // Initialize chat model based on type
    this.chatModel = this.createChatModel(config.llmConfig);
    
    // Initialize store
    this.store = getAgentStore(this.agentId, this.constructor.name, config.workspaceRoot);
    this.store.getState().updateLLMConfig(config.llmConfig);
    this.store.getState().updateCustomRole(config.customRole);
    
    // Initialize LangChain tools FIRST before creating system prompt
    this.initializeLangChainTools();
    
    // Create system prompt after tools are loaded
    this.systemPrompt = this.createSystemPrompt();
    
    // Create prompt template - escape curly braces in system prompt for LangChain
    const escapedSystemPrompt = this.systemPrompt.replace(/{/g, '{{').replace(/}/g, '}}');
    this.promptTemplate = ChatPromptTemplate.fromMessages([
      ['system', escapedSystemPrompt],
      ['placeholder', '{chat_history}'],
      ['human', '{input}'],
      ['placeholder', '{agent_scratchpad}']
    ]);
    
    // Initialize agent executor
    this.initializeAgentExecutor();
    
    // Add system message if not present
    const messages = this.store.getState().messages;
    if (messages.length === 0 || messages[0].role !== 'system') {
      this.store.getState().addMessage({
        role: 'system',
        content: this.systemPrompt,
        status: 'completed'
      });
    }
  }

  // Abstract methods that must be implemented by derived classes
  abstract createSystemPrompt(): string;
  abstract getDefaultRole(): string;

  // Helper method to create tool descriptions for system prompt
  protected createToolDescriptions(): string {
    if (this.langChainTools.length === 0) {
      return '';
    }

    const toolDescriptions = this.langChainTools.map(tool => {
      return `- ${tool.name}: ${tool.description}`;
    }).join('\n');

    return `\nYou have access to the following tools:\n${toolDescriptions}\n\nThese tools are available through function calling. Use them when you need to perform actions to help the user.`;
  }

  protected createChatModel(llmConfig: AgentConfig['llmConfig']): BaseChatModel {
    const baseConfig = {
      temperature: llmConfig.temperature || 0.7,
      maxTokens: llmConfig.maxTokens || 4000,
    };

    switch (llmConfig.type) {
      case 'ollama':
        return new ChatOllama({
          baseUrl: llmConfig.baseURL,
          model: llmConfig.model,
          ...baseConfig
        });
      
      case 'openai':
        return new ChatOpenAI({
          openAIApiKey: llmConfig.apiKey,
          modelName: llmConfig.model,
          ...baseConfig
        });
      
      case 'anthropic':
        return new ChatAnthropic({
          anthropicApiKey: llmConfig.apiKey,
          modelName: llmConfig.model,
          ...baseConfig
        });
      
      case 'perplexity':
        return new ChatPerplexity({
          apiKey: llmConfig.apiKey,
          model: llmConfig.model,
          ...baseConfig
        });
      
      case 'google':
        return new ChatGoogleGenerativeAI({
          apiKey: llmConfig.apiKey,
          model: llmConfig.model,
          ...baseConfig
        });
      
      case 'local':
        return new ChatLocalLLM({
          modelName: llmConfig.model,
          ...baseConfig
        });
      
      case 'openai-compatible':
      case 'vllm':
      default:
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
          ...baseConfig
        });
    }
  }

  protected initializeLangChainTools(): void {
    // Only use MCP tools - no built-in tools
    const mcpTools = mcpManager.getLangChainTools();
    this.langChainTools = mcpTools;
    
    logger.info(`[BaseAgent] Initialized ${mcpTools.length} MCP tools`);
  }

  protected async initializeAgentExecutor(): Promise<void> {
    if (this.chatModel.bindTools && this.langChainTools.length > 0) {
      // Create tool-calling agent - recreate prompt template with escaped system prompt
      const escapedSystemPrompt = this.systemPrompt.replace(/{/g, '{{').replace(/}/g, '}}');
      const promptTemplate = ChatPromptTemplate.fromMessages([
        ['system', escapedSystemPrompt],
        ['placeholder', '{chat_history}'],
        ['human', '{input}'],
        ['placeholder', '{agent_scratchpad}']
      ]);
      
      const boundModel = this.chatModel.bindTools(this.langChainTools);
      const agent = createToolCallingAgent({
        llm: boundModel,
        tools: this.langChainTools,
        prompt: promptTemplate
      });
      
      this.agentExecutor = new AgentExecutor({
        agent,
        tools: this.langChainTools,
        verbose: true,
        returnIntermediateSteps: true
      });
    }
  }

  // Method to refresh tools when MCP servers change
  async refreshTools(): Promise<void> {
    this.initializeLangChainTools();
    
    // Regenerate system prompt with new tools
    this.systemPrompt = this.createSystemPrompt();
    
    // Update the prompt template with new system prompt
    const escapedSystemPrompt = this.systemPrompt.replace(/{/g, '{{').replace(/}/g, '}}');
    this.promptTemplate = ChatPromptTemplate.fromMessages([
      ['system', escapedSystemPrompt],
      ['placeholder', '{chat_history}'],
      ['human', '{input}'],
      ['placeholder', '{agent_scratchpad}']
    ]);
    
    await this.initializeAgentExecutor();
    logger.info(`[BaseAgent] Refreshed tools - now have ${this.langChainTools.length} tools available`);
    
    // Update the system message in the store
    const messages = this.store.getState().messages;
    if (messages.length > 0 && messages[0].role === 'system') {
      this.store.getState().updateMessage(messages[0].id, {
        content: this.systemPrompt
      });
    }
  }

  protected formatAttachedNotes(notes: NotesAttachment[]): string {
    if (!notes || notes.length === 0) {
      return '';
    }
    
    return notes.map(note => 
      `\n\n--- ATTACHED NOTES: ${note.title} ---${note.nodeLabel ? ` (from node: ${note.nodeLabel})` : ''}\n${note.content}\n--- END NOTES ---`
    ).join('');
  }

  protected convertToLangChainMessages(): BaseMessage[] {
    const messages = this.store.getState().messages;
    
    // Filter out empty assistant messages (typically streaming placeholders)
    const filteredMessages = messages.filter(msg => 
      !(msg.role === 'assistant' && (!msg.content || msg.content.trim() === ''))
    );
    
    // Check if this is Perplexity to apply special message formatting
    const isPerplexity = this.config.llmConfig.baseURL?.includes('perplexity') || 
                       this.config.llmConfig.type === 'perplexity' ||
                       this.config.llmConfig.model?.includes('sonar');
    
    const langChainMessages = filteredMessages.map(msg => {
      const content = cleanContentForLLM(msg.content);
      
      switch (msg.role) {
        case 'system':
          return new SystemMessage(content);
        case 'user':
          // Handle images and notes for user messages
          if (msg.images && msg.images.length > 0) {
            // Check if this is Anthropic vs Perplexity vs OpenAI-compatible vs Ollama
            const isAnthropic = this.config.llmConfig.baseURL?.includes('anthropic') || 
                              this.config.llmConfig.type === 'anthropic' ||
                              this.config.llmConfig.model?.includes('claude');
            
            const isPerplexity = this.config.llmConfig.baseURL?.includes('perplexity') || 
                               this.config.llmConfig.type === 'perplexity' ||
                               this.config.llmConfig.model?.includes('sonar');
            
            const isGoogle = this.config.llmConfig.baseURL?.includes('generativelanguage') || 
                           this.config.llmConfig.type === 'google' ||
                           this.config.llmConfig.model?.includes('gemini');
            
            const isOllama = this.config.llmConfig.baseURL?.includes('ollama') || 
                           this.config.llmConfig.type === 'ollama';
            
            if (isAnthropic) {
              // For Anthropic APIs, use their specific image format
              const contentArray: Array<{type: 'text' | 'image'; text?: string; source?: {type: 'base64'; media_type: string; data: string}}> = [];
              
              // Add text content if present
              if (msg.content && msg.content.trim()) {
                contentArray.push({
                  type: 'text',
                  text: content
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
                    data: imageData
                  }
                });
              }

              // Add notes content to the text portion
              if (msg.notes && msg.notes.length > 0) {
                const notesText = this.formatAttachedNotes(msg.notes);
                
                if (contentArray.length > 0 && contentArray[0].type === 'text') {
                  contentArray[0].text += notesText;
                } else {
                  contentArray.unshift({
                    type: 'text',
                    text: content + notesText
                  });
                }
              }
              
              return new HumanMessage({ content: contentArray });
            } else if (isPerplexity) {
              // Perplexity doesn't support images, so just return text content
              return new HumanMessage(content);
            } else if (isGoogle) {
              // Google supports images, use OpenAI-compatible format
              const contentArray: Array<{type: 'text' | 'image_url'; text?: string; image_url?: {url: string}}> = [];
              
              // Add text content if present
              if (msg.content && msg.content.trim()) {
                contentArray.push({
                  type: 'text',
                  text: content
                });
              }
              
              // Add images
              for (const image of msg.images) {
                contentArray.push({
                  type: 'image_url',
                  image_url: {
                    url: image.fullImage // Use fullImage property from ImageAttachment
                  }
                });
              }
              
              return new HumanMessage({ content: contentArray });
            } else if (isOllama) {
              // For Ollama vision models, use proper LangChain format
              // The convertToOllamaMessages utility will handle the conversion to Ollama's expected format
              const contentArray: Array<{type: 'text' | 'image_url'; text?: string; image_url?: string}> = [];
              
              // Handle text content and notes
              let textContent = content;
              if (msg.notes && msg.notes.length > 0) {
                const notesText = this.formatAttachedNotes(msg.notes);
                textContent += notesText;
              }
              
              // Add text content if present
              if (textContent && textContent.trim()) {
                contentArray.push({
                  type: "text",
                  text: textContent
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
                  type: "image_url",
                  image_url: imageUrl
                });
              }
              
              return new HumanMessage({ content: contentArray });
            } else {
              // For OpenAI-compatible APIs, use proper image format
              const contentArray: Array<{type: 'text' | 'image_url'; text?: string; image_url?: {url: string}}> = [];
              
              // Add text content if present
              if (msg.content && msg.content.trim()) {
                contentArray.push({
                  type: 'text',
                  text: content
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
                    url: imageUrl
                  }
                });
              }

              // Add notes content to the text portion
              if (msg.notes && msg.notes.length > 0) {
                const notesText = this.formatAttachedNotes(msg.notes);
                
                if (contentArray.length > 0 && contentArray[0].type === 'text') {
                  contentArray[0].text += notesText;
                } else {
                  contentArray.unshift({
                    type: 'text',
                    text: content + notesText
                  });
                }
              }
              
              return new HumanMessage({ content: contentArray });
            }
          } else {
            // No images, just handle text and notes
            let userContent = content;
            if (msg.notes && msg.notes.length > 0) {
              const notesText = this.formatAttachedNotes(msg.notes);
              userContent += notesText;
            }
            return new HumanMessage(userContent);
          }
        case 'assistant':
          return new AIMessage(content);
        default:
          return new HumanMessage(content);
      }
    });

    // Special handling for Perplexity: ensure proper message alternation
    if (isPerplexity && langChainMessages.length > 0) {
      return this.reorderMessagesForPerplexity(langChainMessages);
    }

    return langChainMessages;
  }

  private reorderMessagesForPerplexity(messages: BaseMessage[]): BaseMessage[] {
    // Perplexity requires:
    // 1. Optional system messages first
    // 2. Then strict alternation starting with user message: User, Assistant, User, Assistant...
    // 3. Must end with a user message
    
    const systemMessages = messages.filter(msg => msg instanceof SystemMessage);
    const conversationMessages = messages.filter(msg => !(msg instanceof SystemMessage));
    
    // If no conversation messages, just return system messages
    if (conversationMessages.length === 0) {
      return systemMessages;
    }
    
    // Separate user and assistant messages while preserving order
    const userMessages = conversationMessages.filter(msg => msg instanceof HumanMessage);
    const assistantMessages = conversationMessages.filter(msg => msg instanceof AIMessage);
    
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
    
    while (userIndex < userMessages.length || assistantIndex < assistantMessages.length) {
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
      if (result.length > 1 && result[result.length - 2] instanceof HumanMessage) {
        result.pop(); // Remove the last assistant message
      }
    }
    
    return result;
  }

  async processMessage(userMessage: string, images?: ImageAttachment[], notes?: NotesAttachment[], onUpdate?: (message: ConversationMessage) => void): Promise<ConversationMessage> {
    // Add user message to store
    const userMsgId = this.store.getState().addMessage({
      role: 'user',
      content: userMessage,
      status: 'completed',
      images: images || [],
      notes: notes || []
    });

    // Start timing for debug logging
    const startTime = Date.now();
    
    try {
      // Create assistant message in streaming state
      const assistantMsgId = this.store.getState().addMessage({
        role: 'assistant',
        content: '',
        status: 'streaming',
        model: this.config.llmConfig.displayName || this.config.llmConfig.model
      });

      // Set up abort controller for cancellation
      const abortController = new AbortController();
      this.store.getState().setAbortController(abortController);

      // Always use direct streaming with tool parsing for consistent behavior
      const messages = this.convertToLangChainMessages();
      
      // Log the request for debugging
      serverDebugLogger.logRequest(
        `LLM Request: ${this.config.llmConfig.model}`,
        JSON.stringify({
          messages: messages.map(msg => ({
            role: msg._getType(),
            content: typeof msg.content === 'string' ? msg.content : '[Complex Content]'
          })),
          model: this.config.llmConfig.model
        }, null, 2),
        this.config.llmConfig.model,
        this.config.llmConfig.baseURL
      );
      
      // Use bound model with tools for proper tool call streaming
      const boundModel = this.chatModel.bindTools && this.langChainTools.length > 0 
        ? this.chatModel.bindTools(this.langChainTools)
        : this.chatModel;
      
      const stream = await boundModel.stream(messages);
      let fullContent = '';
      let tokenCount = 0; // Track tokens generated
      let lastTokenUpdate = startTime; // Track last token stats update
      let accumulatedMessage: any = undefined; // To accumulate tool call chunks

      for await (const chunk of stream) {
        if (abortController.signal.aborted) {
          this.store.getState().setStreamingStatus(assistantMsgId, 'cancelled');
          break;
        }

        // Accumulate chunks for tool calls (using concat utility)
        if (!accumulatedMessage) {
          accumulatedMessage = chunk;
        } else {
          // Simple manual concatenation for tool call chunks
          if (chunk.tool_call_chunks && chunk.tool_call_chunks.length > 0) {
            if (!accumulatedMessage.tool_call_chunks) {
              accumulatedMessage.tool_call_chunks = [];
            }
            // Merge tool call chunks by index
            for (const newChunk of chunk.tool_call_chunks) {
              const existingIndex = accumulatedMessage.tool_call_chunks.findIndex(
                (existing: any) => existing.index === newChunk.index
              );
              if (existingIndex >= 0) {
                // Merge existing chunk
                const existing = accumulatedMessage.tool_call_chunks[existingIndex];
                accumulatedMessage.tool_call_chunks[existingIndex] = {
                  ...existing,
                  name: newChunk.name || existing.name,
                  args: (existing.args || '') + (newChunk.args || ''),
                  id: newChunk.id || existing.id,
                };
              } else {
                // Add new chunk
                accumulatedMessage.tool_call_chunks.push(newChunk);
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
            .map((item: any) => typeof item === 'string' ? item : item.text || '')
            .join('');
        } else if (chunk.content && typeof chunk.content === 'object') {
          // Handle content objects
          chunkContent = (chunk.content as any).text || (chunk.content as any).content || '';
        }
        
        fullContent += chunkContent;
        this.store.getState().updateMessage(assistantMsgId, { content: fullContent });
        
        // Count tokens (approximate: 1 token ≈ 4 characters)
        tokenCount += Math.max(1, Math.floor(chunkContent.length / 4));
        
        // Send token stats update every 1 second during streaming
        const now = Date.now();
        if (now - lastTokenUpdate > 1000) {
          const elapsed = (now - startTime) / 1000;
          if (elapsed > 0.5 && tokenCount > 0) {
            const tokensPerSecond = tokenCount / elapsed;
            sseManager.broadcast('debug', {
              type: 'token-stats',
              tokensPerSecond: tokensPerSecond,
              totalTokens: tokenCount
            });
            lastTokenUpdate = now;
          }
        }
        
        // Send real-time update via callback
        if (onUpdate) {
          const currentMessage = this.store.getState().messages.find(m => m.id === assistantMsgId);
          if (currentMessage) {
            const conversationMsg: ConversationMessage = {
              id: currentMessage.id,
              role: currentMessage.role,
              content: currentMessage.content,
              timestamp: currentMessage.timestamp,
              toolCalls: currentMessage.toolCalls,
              toolResults: currentMessage.toolResults,
              status: 'processing',
              model: currentMessage.model,
              images: currentMessage.images,
              notes: currentMessage.notes
            };
            onUpdate(conversationMsg);
          }
        }
      }

      // Use tool calls from accumulated stream chunks or fallback to text parsing
      let toolCalls: Array<{id: string; name: string; parameters: Record<string, any>}> = [];
      
      // Check if we got tool calls from streaming
      if (accumulatedMessage?.tool_calls && accumulatedMessage.tool_calls.length > 0) {
        // Convert LangChain tool calls to our format
        toolCalls = accumulatedMessage.tool_calls.map((toolCall: any) => ({
          id: toolCall.id || this.generateId(),
          name: toolCall.name,
          parameters: typeof toolCall.args === 'string' ? JSON.parse(toolCall.args) : toolCall.args
        }));
      } else if (accumulatedMessage?.tool_call_chunks && accumulatedMessage.tool_call_chunks.length > 0) {
        // Convert tool call chunks to our format
        toolCalls = accumulatedMessage.tool_call_chunks
          .filter((chunk: any) => chunk.name && chunk.args)
          .map((chunk: any) => ({
            id: chunk.id || this.generateId(),
            name: chunk.name,
            parameters: typeof chunk.args === 'string' ? JSON.parse(chunk.args) : chunk.args
          }));
      } else {
        // Fallback to text parsing for models that don't support tool call streaming
        const { content, toolCalls: parsedToolCalls } = this.parseToolCalls(fullContent);
        toolCalls = parsedToolCalls || [];
      }
      
      // Log the response for debugging
      const duration = Date.now() - startTime;
      const tokensPerSecond = duration > 0 ? (tokenCount / (duration / 1000)) : 0;
      serverDebugLogger.logResponse(
        `LLM Response: ${this.config.llmConfig.model}`,
        JSON.stringify({
          content: fullContent,
          toolCalls: toolCalls,
          duration: `${duration}ms`,
          tokens: tokenCount,
          tokensPerSecond: tokensPerSecond.toFixed(2)
        }, null, 2),
        duration,
        this.config.llmConfig.model,
        this.config.llmConfig.baseURL,
        tokensPerSecond,
        tokenCount
      );

      // Update message with final content and tool calls
      this.store.getState().updateMessage(assistantMsgId, {
        content: fullContent, // Keep the content even with tool calls
        toolCalls,
        status: toolCalls && toolCalls.length > 0 ? 'streaming' : 'completed'
      });

      // Execute tool calls if present
      if (toolCalls && toolCalls.length > 0) {
        // Send update for tool execution
        if (onUpdate) {
          const currentMessage = this.store.getState().messages.find(m => m.id === assistantMsgId);
          if (currentMessage) {
            const conversationMsg: ConversationMessage = {
              id: currentMessage.id,
              role: currentMessage.role,
              content: currentMessage.content,
              timestamp: currentMessage.timestamp,
              toolCalls: currentMessage.toolCalls,
              toolResults: currentMessage.toolResults,
              status: 'processing',
              model: currentMessage.model,
              images: currentMessage.images,
              notes: currentMessage.notes
            };
            onUpdate(conversationMsg);
          }
        }

        const toolResults = await this.executeToolCalls(toolCalls, assistantMsgId);
        
        // Check if cancelled during tool execution
        const currentMessage = this.store.getState().messages.find(m => m.id === assistantMsgId);
        if (currentMessage?.status === 'cancelled') {
          return this.convertToConversationMessage(currentMessage);
        }

        // Update message with tool results
        this.store.getState().updateMessage(assistantMsgId, {
          toolResults,
          status: 'streaming' // Still streaming while getting follow-up response
        });

        // Get follow-up response after tool execution
        const toolResultContent = toolResults
          .map((result: any) => {
            let resultText = '';
            if (typeof result.result === 'string') {
              resultText = result.result;
            } else if (result.result && typeof result.result === 'object') {
              if (result.result.success === false && result.result.error) {
                resultText = `Error: ${result.result.error}`;
              } else if (result.result.content) {
                resultText = result.result.content;
              } else if (result.result.text) {
                resultText = result.result.text;
              } else {
                resultText = Object.entries(result.result)
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
          ...(fullContent && fullContent.trim() ? [new AIMessage(fullContent)] : []),
          new HumanMessage(`Tool execution results:\n${toolResultContent}\n\nPlease respond to the user with the relevant information from the tool results. Include the actual content/data from the tools when it's helpful to the user.`)
        ];

        // Stream the follow-up response
        this.store.getState().updateMessage(assistantMsgId, { content: '' });
        
        const followUpStream = await boundModel.stream(followUpMessages);
        let followUpContent = '';
        let followUpTokenCount = 0; // Track tokens in follow-up response

        for await (const chunk of followUpStream) {
          // Check if streaming was cancelled
          if (abortController.signal.aborted) {
            this.store.getState().setStreamingStatus(assistantMsgId, 'cancelled');
            break;
          }

          // Extract content properly for follow-up response
          let chunkContent = '';
          if (typeof chunk.content === 'string') {
            chunkContent = chunk.content;
          } else if (Array.isArray(chunk.content)) {
            chunkContent = chunk.content
              .map((item: any) => typeof item === 'string' ? item : item.text || '')
              .join('');
          } else if (chunk.content && typeof chunk.content === 'object') {
            chunkContent = (chunk.content as any).text || (chunk.content as any).content || '';
          }
          
          followUpContent += chunkContent;
          this.store.getState().updateMessage(assistantMsgId, { content: followUpContent });
          
          // Count tokens in follow-up response
          followUpTokenCount += Math.max(1, Math.floor(chunkContent.length / 4));
          
          // Send real-time update via callback
          if (onUpdate) {
            const currentMessage = this.store.getState().messages.find(m => m.id === assistantMsgId);
            if (currentMessage) {
              const conversationMsg: ConversationMessage = {
                id: currentMessage.id,
                role: currentMessage.role,
                content: currentMessage.content,
                timestamp: currentMessage.timestamp,
                toolCalls: currentMessage.toolCalls,
                toolResults: currentMessage.toolResults,
                status: 'processing',
                model: currentMessage.model,
                images: currentMessage.images,
                notes: currentMessage.notes
              };
              onUpdate(conversationMsg);
            }
          }
        }
        
        // Update total token count
        tokenCount += followUpTokenCount;

        this.store.getState().updateMessage(assistantMsgId, {
          status: 'completed'
        });
      }

      // Get final message and convert to ConversationMessage format
      const finalMessage = this.store.getState().messages.find(m => m.id === assistantMsgId);
      if (!finalMessage) {
        throw new Error('Message not found');
      }

      const conversationMsg = this.convertToConversationMessage(finalMessage);
      
      // Send final update via callback
      if (onUpdate) {
        onUpdate(conversationMsg);
      }

      return conversationMsg;

    } catch (error: any) {
      logger.error('Error in processMessage:', error);
      
      // Log the error for debugging
      const duration = Date.now() - startTime;
      serverDebugLogger.logError(
        `LLM Error: ${this.config.llmConfig.model}`,
        JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
          duration: `${duration}ms`
        }, null, 2),
        this.config.llmConfig.model,
        this.config.llmConfig.baseURL
      );
      
      // Find the assistant message and mark it as error
      const messages = this.store.getState().messages;
      const assistantMsg = messages.find(m => m.role === 'assistant' && m.status === 'streaming');
      if (assistantMsg) {
        this.store.getState().updateMessage(assistantMsg.id, {
          status: 'error',
          content: assistantMsg.content + '\n\n[Error: ' + error.message + ']'
        });
        
        const conversationMsg = this.convertToConversationMessage(assistantMsg);
        if (onUpdate) {
          onUpdate(conversationMsg);
        }
        return conversationMsg;
      }
      
      throw error;
    }
  }

  protected convertToConversationMessage(streamingMsg: StreamingMessage): ConversationMessage {
    return {
      id: streamingMsg.id,
      role: streamingMsg.role,
      content: streamingMsg.content,
      timestamp: streamingMsg.timestamp,
      toolCalls: streamingMsg.toolCalls,
      toolResults: streamingMsg.toolResults,
      status: streamingMsg.status === 'streaming' ? 'processing' : 
              streamingMsg.status === 'completed' ? 'completed' :
              streamingMsg.status === 'cancelled' ? 'cancelled' : 'completed',
      model: streamingMsg.model,
      images: streamingMsg.images,
      notes: streamingMsg.notes
    };
  }

  // Chain-specific methods
  async invokeChain(input: string, options?: { streaming?: boolean }): Promise<string> {
    const messages = this.convertToLangChainMessages();
    messages.push(new HumanMessage(input));

    // Use bound model with tools
    const boundModel = this.chatModel.bindTools && this.langChainTools.length > 0 
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
            .map((item: any) => typeof item === 'string' ? item : item.text || '')
            .join('');
        } else if (chunk.content && typeof chunk.content === 'object') {
          result += (chunk.content as any).text || (chunk.content as any).content || '';
        }
      }
      return result;
    } else {
      const result = await boundModel.invoke(messages);
      return result.content.toString();
    }
  }

  // Existing interface methods
  getConversation(): ConversationMessage[] {
    return this.store.getState().messages
      .filter(msg => msg.role !== 'system')
      .map(msg => this.convertToConversationMessage(msg));
  }

  deleteMessage(messageId: string): boolean {
    const messages = this.store.getState().messages;
    const messageExists = messages.some(msg => msg.id === messageId);
    if (messageExists) {
      this.store.getState().deleteMessage(messageId);
      return true;
    }
    return false;
  }

  cancelMessage(messageId: string): boolean {
    const message = this.store.getState().messages.find(msg => msg.id === messageId);
    if (message && message.status === 'streaming') {
      this.store.getState().cancelStreaming();
      return true;
    }
    return false;
  }

  clearConversation(): void {
    this.store.getState().clearConversation();
    this.store.getState().addMessage({
      role: 'system',
      content: this.systemPrompt,
      status: 'completed'
    });
  }

  loadConversation(messages: ConversationMessage[]): void {
    this.store.getState().clearConversation();
    
    // Find the first system message from conversation history (if any)
    const firstSystemMessage = messages.find(msg => msg.role === 'system');
    
    // Add system message first (either from conversation history or default)
    if (firstSystemMessage) {
      this.store.getState().addMessage({
        role: 'system',
        content: firstSystemMessage.content,
        status: 'completed'
      });
    } else {
      this.store.getState().addMessage({
        role: 'system',
        content: this.systemPrompt,
        status: 'completed'
      });
    }
    
    // Load all non-system messages from conversation history
    messages.filter(msg => msg.role !== 'system').forEach(msg => {
      this.store.getState().addMessage({
        role: msg.role,
        content: msg.content,
        status: msg.status === 'processing' ? 'streaming' : 
                msg.status === 'completed' ? 'completed' :
                msg.status === 'cancelled' ? 'cancelled' : 'completed',
        model: msg.model,
        toolCalls: msg.toolCalls,
        toolResults: msg.toolResults,
        images: msg.images,
        notes: msg.notes
      });
    });
  }

  updateLLMConfig(newLlmConfig: AgentConfig['llmConfig']): void {
    this.config.llmConfig = newLlmConfig;
    this.chatModel = this.createChatModel(newLlmConfig);
    this.store.getState().updateLLMConfig(newLlmConfig);
    this.initializeAgentExecutor(); // Reinitialize agent executor with new model
  }

  updateRole(customRole?: string): void {
    this.config.customRole = customRole;
    this.systemPrompt = this.createSystemPrompt();
    this.store.getState().updateCustomRole(customRole);
    
    // Update system message in store
    const messages = this.store.getState().messages;
    const systemMessage = messages.find(msg => msg.role === 'system');
    if (systemMessage) {
      this.store.getState().updateMessage(systemMessage.id, {
        content: this.systemPrompt
      });
    }
    
    // Reinitialize agent executor with new system prompt
    this.initializeAgentExecutor();
  }

  getCurrentRole(): string {
    return this.config.customRole || this.getDefaultRole();
  }

  protected generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  getAgentId(): string {
    return this.agentId;
  }

  getAgentStore() {
    return this.store;
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

  protected async executeToolCalls(toolCalls: Array<{id: string; name: string; parameters: Record<string, any>}>, messageId: string): Promise<Array<{ name: string; result: any }>> {
    const results = [];
    
    for (const toolCall of toolCalls) {
      // Check if message was cancelled
      const currentMessage = this.store.getState().messages.find(m => m.id === messageId);
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
            
            logger.info(`[BaseAgent] Executing MCP tool: ${serverId}:${toolName}`);
            const mcpResult = await mcpManager.executeTool(serverId, toolName, toolCall.parameters);
            
            // Extract content from MCP result
            let content = '';
            if (Array.isArray(mcpResult)) {
              // MCP returns array of content objects
              content = mcpResult.map(item => {
                if (typeof item === 'string') {
                  return item;
                } else if (item.text) {
                  return item.text;
                } else if (item.type === 'text' && item.text) {
                  return item.text;
                } else {
                  return JSON.stringify(item);
                }
              }).join('\n');
            } else if (typeof mcpResult === 'string') {
              content = mcpResult;
            } else if (mcpResult && typeof mcpResult === 'object') {
              content = mcpResult.text || JSON.stringify(mcpResult);
            } else {
              content = String(mcpResult);
            }

            // Warn if content is very large (but don't truncate here - let SSE manager handle it)
            if (content.length > 100000) {
              logger.warn(`[BaseAgent] Large tool result from ${serverId}:${toolName}: ${content.length} characters`);
            }
            
            results.push({
              name: toolCall.name,
              result: content // Return content directly, not wrapped in object
            });
          } else {
            results.push({
              name: toolCall.name,
              result: { success: false, error: `Invalid MCP tool name format: ${toolCall.name}` }
            });
          }
        } else {
          results.push({
            name: toolCall.name,
            result: { success: false, error: `Tool '${toolCall.name}' not available - all tools are now provided by MCP servers` }
          });
        }
      } catch (error: any) {
        results.push({
          name: toolCall.name,
          result: {
            success: false,
            error: error.message
          }
        });
      }
    }
    
    return results;
  }

  protected parseToolCalls(content: string): { content: string; toolCalls?: Array<{id: string; name: string; parameters: Record<string, any>}> } {
    logger.debug('Parsing content for tool calls:', { content });
    const toolCalls: Array<{id: string; name: string; parameters: Record<string, any>}> = [];
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
          logger.debug('Parsed tool call:', { tool: parsed.tool, parameters: parsed.parameters });
          toolCalls.push({
            id: this.generateId(),
            name: parsed.tool,
            parameters: parsed.parameters
          });
          
          jsonBlocksToRemove.push(match[0]);
        }
        // Handle alternate format: {"tool_name": {...}} 
        else {
          for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === 'object' && value !== null) {
              const validTools = [
                'read_file', 'create_file', 'edit_file', 'list_directory', 'bash', 'glob', 'grep',
                'todo_write', 'todo_read', 'mermaid', 'get_diagnostics', 'format_file', 'undo_edit', 'web_search', 'delete_file'
              ];
              if (validTools.includes(key)) {
                logger.debug('Parsed alternate tool call:', { tool: key, parameters: value });
                toolCalls.push({
                  id: this.generateId(),
                  name: key,
                  parameters: value as Record<string, any>
                });
                
                jsonBlocksToRemove.push(match[0]);
                break;
              }
            }
          }
        }
      } catch (e) {
        logger.debug('Failed to parse JSON block:', { jsonBlock: match[1], error: e });
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
            logger.debug('Parsed standalone tool call:', { tool: parsed.tool, parameters: parsed.parameters });
            toolCalls.push({
              id: this.generateId(),
              name: parsed.tool,
              parameters: parsed.parameters
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
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined
    };
  }

  /**
   * Calculate remaining context length for the current model
   */
  protected async calculateRemainingContext(): Promise<number> {
    try {
      const configManager = new LLMConfigManager();
      const config = await configManager.loadConfiguration();
      
      // Find the current model
      const currentModel = config.models.find(m => 
        m.model === this.config.llmConfig.model && 
        m.baseURL === this.config.llmConfig.baseURL
      );
      
      if (!currentModel || !currentModel.contextLength) {
        // Default fallback if we can't determine context length
        return 4000; // Conservative estimate
      }
      
      // Estimate tokens used so far (rough approximation: 1 token ≈ 4 characters)
      const conversationText = this.store.getState().messages
        .map(msg => typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content))
        .join('\n');
      
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
