import { LLMClient, LLMMessage, ToolCall } from '../llm-client.js';
import { ToolSystem } from '../tools.js';
import { logger } from '../logger.js';
import { cleanContentForLLM } from '../utils/content-filter.js';
import { LLMConfigManager } from '../llm-config-manager.js';
import { getAgentStore, StreamingMessage } from '../../src/store/useAgentStore.js';

export interface AgentConfig {
  workspaceRoot: string;
  llmConfig: {
    baseURL: string;
    model: string;
    displayName?: string;
    apiKey?: string;
    type?: 'ollama' | 'vllm' | 'openai-compatible' | 'openai' | 'anthropic' | 'local';
  };
  customRole?: string;
}

export interface ImageAttachment {
  id: string;
  filename: string;
  filepath: string;
  mimeType: string;
  size: number;
  thumbnail: string; // base64 encoded thumbnail for UI display
  fullImage: string; // base64 encoded full-size image for LLM
  uploadedAt: Date;
}

export interface NotesAttachment {
  id: string;
  title: string;
  content: string;
  nodeLabel?: string; // Optional label of the source node
  attachedAt: Date;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  toolResults?: Array<{ name: string; result: any }>;
  status?: 'processing' | 'completed' | 'cancelled';
  model?: string; // LLM model used for assistant messages
  images?: ImageAttachment[]; // Image attachments for user messages
  notes?: NotesAttachment[]; // Notes attachments for user messages
}

export abstract class BaseAgent {
  protected llmClient: LLMClient;
  protected toolSystem: ToolSystem;
  protected systemPrompt: string;
  protected config: AgentConfig;
  protected agentId: string;
  protected store: ReturnType<typeof getAgentStore>;

  constructor(config: AgentConfig, agentId?: string) {
    this.config = config;
    this.agentId = agentId || this.generateId();
    this.llmClient = new LLMClient(config.llmConfig);
    this.toolSystem = new ToolSystem(config.workspaceRoot);
    this.systemPrompt = this.createSystemPrompt();
    
    // Initialize the agent store
    this.store = getAgentStore(this.agentId, this.constructor.name, config.workspaceRoot);
    
    // Update store with current config
    this.store.getState().updateLLMConfig(config.llmConfig);
    this.store.getState().updateCustomRole(config.customRole);
    
    // Add system message if not already present
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

  // Common LLM message conversion logic
  protected convertToLLMMessages(): LLMMessage[] {
    const isOllama = this.config.llmConfig.baseURL.includes('11434') || this.config.llmConfig.baseURL.includes('ollama');
    const messages = this.store.getState().messages;
    
    // Get the latest user message ID to determine which message can have images
    const latestUserMessage = messages[messages.length - 1];
    const isLatestUserMessage = latestUserMessage && latestUserMessage.role === 'user';
    
    return messages.map(msg => {
      // For user messages with images
      if (msg.role === 'user' && msg.images && msg.images.length > 0) {
        // Only include images if this is the latest user message
        if (isLatestUserMessage && msg.id === latestUserMessage.id) {
          if (isOllama) {
            // For Ollama vision models, include images directly in the message
            const images: string[] = [];
            
            for (const image of msg.images) {
              let imageData = image.fullImage || image.thumbnail;
              
              // Extract base64 data from data URL
              if (imageData.startsWith('data:')) {
                const base64Data = imageData.split(',')[1];
                images.push(base64Data);
              } else {
                // Assume it's already base64
                images.push(imageData);
              }
            }
            
            return {
              role: msg.role,
              content: cleanContentForLLM(msg.content),
              images: images
            };
          } else {
            // Check if this is Anthropic vs OpenAI-compatible
            const isAnthropic = this.config.llmConfig.baseURL.includes('anthropic') || this.config.llmConfig.type === 'anthropic';
            
            if (isAnthropic) {
              // For Anthropic APIs, use their specific image format
              const contentArray: Array<{type: 'text' | 'image'; text?: string; source?: {type: 'base64'; media_type: string; data: string}}> = [];
              
              // Add text content if present
              if (msg.content && msg.content.trim()) {
                contentArray.push({
                  type: 'text',
                  text: cleanContentForLLM(msg.content)
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
              
              return {
                role: msg.role,
                content: contentArray
              };
            } else {
              // For OpenAI-compatible APIs, use proper image format
              const contentArray: Array<{type: 'text' | 'image_url'; text?: string; image_url?: {url: string}}> = [];
              
              // Add text content if present
              if (msg.content && msg.content.trim()) {
                contentArray.push({
                  type: 'text',
                  text: cleanContentForLLM(msg.content)
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

              // Add notes content
              if (msg.notes && msg.notes.length > 0) {
                let allNotesText = '';
                for (const note of msg.notes) {
                  allNotesText += `\n\n--- ATTACHED NOTES: ${note.title} ---${note.nodeLabel ? ` (from node: ${note.nodeLabel})` : ''}\n${note.content}\n--- END NOTES ---`;
                }
                
                if (contentArray.length > 0 && contentArray[0].type === 'text') {
                  contentArray[0].text += allNotesText;
                } else {
                  contentArray.unshift({
                    type: 'text',
                    text: msg.content + allNotesText
                  });
                }
              }
              
              return {
                role: msg.role,
                content: contentArray
              };
            }
          }
        } else {
          // For historical messages, strip images and just send text content
          const textContent = msg.content || 'Please analyze the uploaded image.';
          const imageNote = msg.images.length === 1 
            ? '\n[Note: An image was uploaded with this message. The assistant response that follows should contain the image analysis.]'
            : `\n[Note: ${msg.images.length} images were uploaded with this message. The assistant response that follows should contain the image analysis.]`;
          
          return {
            role: msg.role,
            content: cleanContentForLLM(textContent + imageNote)
          };
        }
      } else {
        // Regular text message
        let messageContent = msg.content;
        
        // Add notes content for user messages
        if (msg.role === 'user' && msg.notes && msg.notes.length > 0) {
          let allNotesText = '';
          for (const note of msg.notes) {
            allNotesText += `\n\n--- ATTACHED NOTES: ${note.title} ---${note.nodeLabel ? ` (from node: ${note.nodeLabel})` : ''}\n${note.content}\n--- END NOTES ---`;
          }
          messageContent += allNotesText;
        }
        
        return {
          role: msg.role,
          content: cleanContentForLLM(messageContent)
        };
      }
    });
  }

  async processMessageStreaming(userMessage: string, images?: ImageAttachment[], notes?: NotesAttachment[]): Promise<string> {
    // Add user message to store
    const userMsgId = this.store.getState().addMessage({
      role: 'user',
      content: userMessage,
      status: 'completed',
      images: images || [],
      notes: notes || []
    });

    // Convert conversation to LLM format
    const llmMessages = this.convertToLLMMessages();

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

      let fullContent = '';
      const streamGenerator = this.llmClient.generateStreamResponse(llmMessages);

      for await (const chunk of streamGenerator) {
        // Check if streaming was cancelled
        if (abortController.signal.aborted) {
          this.store.getState().setStreamingStatus(assistantMsgId, 'cancelled');
          return assistantMsgId;
        }

        fullContent += chunk;
        this.store.getState().appendToMessage(assistantMsgId, chunk);
      }

      // Parse the full response for tool calls
      const { content, toolCalls } = this.parseToolCalls(fullContent);

      // Update message with final content and tool calls
      this.store.getState().updateMessage(assistantMsgId, {
        content: toolCalls && toolCalls.length > 0 ? '' : content,
        toolCalls,
        status: toolCalls && toolCalls.length > 0 ? 'streaming' : 'completed'
      });

      // Execute tool calls if present
      if (toolCalls && toolCalls.length > 0) {
        const toolResults = await this.executeToolCalls(toolCalls, assistantMsgId);
        
        // Check if cancelled during tool execution
        const currentMessage = this.store.getState().messages.find(m => m.id === assistantMsgId);
        if (currentMessage?.status === 'cancelled') {
          return assistantMsgId;
        }

        // Update message with tool results
        this.store.getState().updateMessage(assistantMsgId, {
          toolResults,
          status: 'streaming' // Still streaming while getting follow-up response
        });

        // Get follow-up response after tool execution
        const toolResultContent = toolResults
          .map(result => {
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

        const followUpMessages = [
          ...llmMessages,
          {
            role: 'assistant' as const,
            content: fullContent
          },
          {
            role: 'user' as const,
            content: `Tool execution results:\n${toolResultContent}\n\nPlease respond to the user with the relevant information from the tool results. Include the actual content/data from the tools when it's helpful to the user.`
          }
        ];

        // Stream the follow-up response
        this.store.getState().updateMessage(assistantMsgId, { content: '' });
        
        const followUpGenerator = this.llmClient.generateStreamResponse(followUpMessages);
        let followUpContent = '';

        for await (const chunk of followUpGenerator) {
          // Check if streaming was cancelled
          if (abortController.signal.aborted) {
            this.store.getState().setStreamingStatus(assistantMsgId, 'cancelled');
            return assistantMsgId;
          }

          followUpContent += chunk;
          this.store.getState().appendToMessage(assistantMsgId, chunk);
        }

        this.store.getState().updateMessage(assistantMsgId, {
          status: 'completed'
        });
      }

      return assistantMsgId;

    } catch (error: any) {
      logger.error('Error in processMessageStreaming:', error);
      
      // Find the assistant message and mark it as error
      const messages = this.store.getState().messages;
      const assistantMsg = messages.find(m => m.role === 'assistant' && m.status === 'streaming');
      if (assistantMsg) {
        this.store.getState().updateMessage(assistantMsg.id, {
          status: 'error',
          content: assistantMsg.content + '\n\n[Error: ' + error.message + ']'
        });
        return assistantMsg.id;
      }
      
      throw error;
    }
  }

  // Legacy method with streaming support
  async processMessage(userMessage: string, images?: ImageAttachment[], notes?: NotesAttachment[], onUpdate?: (message: ConversationMessage) => void): Promise<ConversationMessage> {
    
    // Add user message to store
    const userMsgId = this.store.getState().addMessage({
      role: 'user',
      content: userMessage,
      status: 'completed',
      images: images || [],
      notes: notes || []
    });

    // Convert conversation to LLM format
    const llmMessages = this.convertToLLMMessages();

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

      let fullContent = '';
      const streamGenerator = this.llmClient.generateStreamResponse(llmMessages);

      for await (const chunk of streamGenerator) {
        // Check if streaming was cancelled
        if (abortController.signal.aborted) {
          this.store.getState().setStreamingStatus(assistantMsgId, 'cancelled');
          break;
        }

        fullContent += chunk;
        this.store.getState().updateMessage(assistantMsgId, { content: fullContent });
        
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

      // Parse the full response for tool calls
      const { content, toolCalls } = this.parseToolCalls(fullContent);

      // Update message with final content and tool calls
      this.store.getState().updateMessage(assistantMsgId, {
        content: toolCalls && toolCalls.length > 0 ? '' : content,
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
          .map(result => {
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

        const followUpMessages = [
          ...llmMessages,
          {
            role: 'assistant' as const,
            content: fullContent
          },
          {
            role: 'user' as const,
            content: `Tool execution results:\n${toolResultContent}\n\nPlease respond to the user with the relevant information from the tool results. Include the actual content/data from the tools when it's helpful to the user.`
          }
        ];

        // Stream the follow-up response
        this.store.getState().updateMessage(assistantMsgId, { content: '' });
        
        const followUpGenerator = this.llmClient.generateStreamResponse(followUpMessages);
        let followUpContent = '';

        for await (const chunk of followUpGenerator) {
          // Check if streaming was cancelled
          if (abortController.signal.aborted) {
            this.store.getState().setStreamingStatus(assistantMsgId, 'cancelled');
            break;
          }

          followUpContent += chunk;
          this.store.getState().updateMessage(assistantMsgId, { content: followUpContent });
          
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

  private convertToConversationMessage(streamingMsg: StreamingMessage): ConversationMessage {
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

  protected async executeToolCalls(toolCalls: ToolCall[], messageId: string): Promise<Array<{ name: string; result: any }>> {
    const results = [];
    
    for (const toolCall of toolCalls) {
      // Check if message was cancelled
      const currentMessage = this.store.getState().messages.find(m => m.id === messageId);
      if (currentMessage?.status === 'cancelled') {
        break;
      }
      
      try {
        const result = await this.toolSystem.executeTool(toolCall.name, toolCall.parameters);
        results.push({
          name: toolCall.name,
          result
        });
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

  protected parseToolCalls(content: string): { content: string; toolCalls?: ToolCall[] } {
    logger.debug('Parsing content for tool calls:', { content });
    const toolCalls: ToolCall[] = [];
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

  // Common interface methods
  getConversation(): ConversationMessage[] {
    return this.store.getState().messages
      .filter(msg => msg.role !== 'system')
      .map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        toolCalls: msg.toolCalls,
        toolResults: msg.toolResults,
        status: msg.status === 'streaming' ? 'processing' : 
                msg.status === 'completed' ? 'completed' :
                msg.status === 'cancelled' ? 'cancelled' : 'completed',
        model: msg.model,
        images: msg.images,
        notes: msg.notes
      }));
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
    
    // Re-add system message
    this.store.getState().addMessage({
      role: 'system',
      content: this.systemPrompt,
      status: 'completed'
    });
  }

  loadConversation(messages: ConversationMessage[]): void {
    this.store.getState().clearConversation();
    
    // Add system message
    this.store.getState().addMessage({
      role: 'system',
      content: this.systemPrompt,
      status: 'completed'
    });
    
    // Convert and add messages
    messages.forEach(msg => {
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
    this.llmClient = new LLMClient(newLlmConfig);
    this.store.getState().updateLLMConfig(newLlmConfig);
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
  }

  getCurrentRole(): string {
    return this.config.customRole || this.getDefaultRole();
  }

  abstract getDefaultRole(): string;

  protected generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // Public methods to access agent store
  getAgentId(): string {
    return this.agentId;
  }

  getAgentStore() {
    return this.store;
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
