import { LLMClient, LLMMessage, ToolCall } from '../llm-client.js';
import { ToolSystem } from '../tools.js';
import { logger } from '../logger.js';
import { cleanContentForLLM } from '../utils/content-filter.js';
import { LLMConfigManager } from '../llm-config-manager.js';

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
  protected conversation: ConversationMessage[] = [];
  protected cancelledMessages: Set<string> = new Set();
  protected systemPrompt: string;
  protected config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
    this.llmClient = new LLMClient(config.llmConfig);
    this.toolSystem = new ToolSystem(config.workspaceRoot);
    this.systemPrompt = this.createSystemPrompt();
    
    // Initialize with system message
    this.conversation.push({
      id: 'system',
      role: 'system',
      content: this.systemPrompt,
      timestamp: new Date()
    });
  }

  // Abstract methods that must be implemented by derived classes
  abstract createSystemPrompt(): string;

  // Common LLM message conversion logic
  protected convertToLLMMessages(): LLMMessage[] {
    const isOllama = this.config.llmConfig.baseURL.includes('11434') || this.config.llmConfig.baseURL.includes('ollama');
    
    // Get the latest user message ID to determine which message can have images
    const latestUserMessage = this.conversation[this.conversation.length - 1];
    const isLatestUserMessage = latestUserMessage && latestUserMessage.role === 'user';
    
    return this.conversation.map(msg => {
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

  async processMessage(userMessage: string, images?: ImageAttachment[], notes?: NotesAttachment[], onUpdate?: (message: ConversationMessage) => void): Promise<ConversationMessage> {
    
    // Add user message to conversation
    const userMsg: ConversationMessage = {
      id: this.generateId(),
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
      images: images || [],
      notes: notes || []
    };
    this.conversation.push(userMsg);

    // Convert conversation to LLM format
    const llmMessages = this.convertToLLMMessages();

    try {
      // Get initial response from LLM
      const response = await this.llmClient.generateResponse(llmMessages);

      // Parse response for tool calls
      const { content, toolCalls } = this.parseToolCalls(response.content);

      // Create assistant message
      const assistantMsg: ConversationMessage = {
        id: this.generateId(),
        role: 'assistant',
        content: toolCalls && toolCalls.length > 0 ? '' : content,
        timestamp: new Date(),
        toolCalls,
        status: toolCalls && toolCalls.length > 0 ? 'processing' : 'completed',
        model: this.config.llmConfig.displayName || this.config.llmConfig.model
      };

      this.conversation.push(assistantMsg);

      // Send initial message update
      if (onUpdate) {
        onUpdate(assistantMsg);
      }

      // Execute tool calls if present
      if (toolCalls && toolCalls.length > 0) {
        const toolResults = await this.executeToolCalls(toolCalls, assistantMsg.id);
        
        // Check if the message was cancelled during execution
        if (this.cancelledMessages.has(assistantMsg.id)) {
          assistantMsg.status = 'cancelled';
          assistantMsg.content = 'Tool execution was cancelled.';
          this.cancelledMessages.delete(assistantMsg.id);
          
          if (onUpdate) {
            onUpdate(assistantMsg);
          }
          return assistantMsg;
        }
        
        assistantMsg.toolResults = toolResults;

        // Add tool results to conversation and get follow-up response
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

        llmMessages.push({
          role: 'assistant',
          content: response.content
        });
        
        llmMessages.push({
          role: 'user',
          content: `Tool execution results:\n${toolResultContent}\n\nPlease respond to the user with the relevant information from the tool results. Include the actual content/data from the tools when it's helpful to the user.`
        });

        // Get follow-up response after tool execution
        const followUpResponse = await this.llmClient.generateResponse(llmMessages);
        assistantMsg.content = followUpResponse.content;
        assistantMsg.status = 'completed';
        
        if (onUpdate) {
          onUpdate(assistantMsg);
        }
      }
      return assistantMsg;

    } catch (error: any) {
      logger.error('Error in processMessage:', error);
      throw error;
    }
  }

  protected async executeToolCalls(toolCalls: ToolCall[], messageId: string): Promise<Array<{ name: string; result: any }>> {
    const results = [];
    
    for (const toolCall of toolCalls) {
      if (this.cancelledMessages.has(messageId)) {
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
    return this.conversation.filter(msg => msg.role !== 'system');
  }

  deleteMessage(messageId: string): boolean {
    const initialLength = this.conversation.length;
    this.conversation = this.conversation.filter(msg => msg.id !== messageId);
    return this.conversation.length < initialLength;
  }

  cancelMessage(messageId: string): boolean {
    const message = this.conversation.find(msg => msg.id === messageId);
    if (message && message.status === 'processing') {
      this.cancelledMessages.add(messageId);
      return true;
    }
    return false;
  }

  clearConversation(): void {
    this.conversation = [{
      id: 'system',
      role: 'system',
      content: this.systemPrompt,
      timestamp: new Date()
    }];
  }

  loadConversation(messages: ConversationMessage[]): void {
    this.conversation = [{
      id: 'system',
      role: 'system',
      content: this.systemPrompt,
      timestamp: new Date()
    }];
    
    this.conversation.push(...messages);
  }

  updateLLMConfig(newLlmConfig: AgentConfig['llmConfig']): void {
    this.config.llmConfig = newLlmConfig;
    this.llmClient = new LLMClient(newLlmConfig);
  }

  updateRole(customRole?: string): void {
    this.config.customRole = customRole;
    this.systemPrompt = this.createSystemPrompt();
    
    const systemMessage = this.conversation.find(msg => msg.role === 'system');
    if (systemMessage) {
      systemMessage.content = this.systemPrompt;
    }
  }

  getCurrentRole(): string {
    return this.config.customRole || this.getDefaultRole();
  }

  abstract getDefaultRole(): string;

  protected generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
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
      const conversationText = this.conversation
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
