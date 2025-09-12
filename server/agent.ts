import { LLMClient, LLMMessage, ToolCall } from './llm-client.js';
import { ToolSystem } from './tools.js';
import { logger } from './logger.js';
import { cleanContentForLLM } from './utils/content-filter.js';

const DEFAULT_ROLE = `You are an autonomous support agent responsible for resolving user requests by independently determining the necessary steps and invoking appropriate tools when required.`;

export interface AgentConfig {
  workspaceRoot: string;
  llmConfig: {
    baseURL: string;
    model: string;
    apiKey?: string;
    type?: 'ollama' | 'vllm' | 'openai-compatible' | 'openai' | 'anthropic';
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
}

export class Agent {
  private llmClient: LLMClient;
  private toolSystem: ToolSystem;
  private conversation: ConversationMessage[] = [];
  private cancelledMessages: Set<string> = new Set();
  private systemPrompt: string;
  private config: AgentConfig;

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

  private createRoleDefinition(): string {
    return this.config.customRole || DEFAULT_ROLE;
  }

  private createGoalSpecification(): string {
    return `Your goal is to fully resolve the user's issue without human intervention whenever possible, ensuring a seamless and efficient experience.`;
  }

  private createExplicitToolUsage(): string {
    return `Use the following tools as needed:
    - "list_directory(directory)": Lists all the files in a specified directory.
    - "read_file(file)": Reads the contents of a specified file.
    - "web_search(query)": Asks another AI assistant a question that knows the answer to everything.

    All tools must be invoked in the following format, with the tool and parameters as specified in this format:

    \`\`\`json
    {
      "tool": "tool_name",
      "parameters": {"param": "value"}
    }
    \`\`\`

    For example, to list the files in the current directory, you would use:
    
    \`\`\`json
    {
      "tool": "list_directory",
      "parameters": {"directory": "."}
    }
    \`\`\`
    `;
  }

  private createStepByStepInstructions(): string {
    return [
      "Step-by-step process:",
      "1. Receive the user's request.",
      "2. Determine which tools are required for resolution.",
      "3. Sequentially invoke the necessary tools, handling outputs as needed.",
      "4. If all steps succeed, confirm resolution to the user.",
      "5. If a step fails and cannot be resolved, escalate the issue back to the user, providing a summary of actions taken and the error encountered."
    ].join('\n');
  }

  private createErrorHandling(): string {
    return [
      "If a tool call fails or you encounter an error:",
      "- Retry the operation once if appropriate.",
      "- If the issue persists, escalate the issue back to the user, providing a summary of actions taken and the error encountered."
    ].join('\n');
  }

  private createOutputRequirements(): string {
    return [
      "For each user interaction:",
      "- Clearly summarize the actions you have taken.",
      "- Provide the outcome or next steps.",
      "- If a tool was used, mention which tool and the result.",
      "- If escalation occurs, summarize the context for the human agent.",
      "- Don't mention that you used a tool to resolve the issue unless it's relevant to the user.",
      "- Don't explain how you got the information unless it's relevant to the user.",
      "- All code should be wrapped with ```(language) at the beginning and ``` at the end.",
      "- All diagrams are to be rendered with Mermaid and should be wrapped with ```mermaid and ``` at the beginning and end and the syntax should be heavily checked for its validity first.",
      "- All json should be wrapped with ```json at the beginning and ``` at the end.",
      "- All mathematical formulas are to be written in LaTeX",
      "- When writing code examples, preference them to be written in TypeScript unless otherwise specified or it makes sense to use a different language."
    ].join('\n');
  }

  private createSystemPrompt(): string {
    return [
      this.createRoleDefinition(),
      '',
      this.createGoalSpecification(),
      '',
      this.createExplicitToolUsage(),
      '',
      this.createErrorHandling(),
      '',
      this.createOutputRequirements(),
      '',
      this.createStepByStepInstructions()
    ].join('\n');
  }

  async processMessage(userMessage: string, images?: ImageAttachment[], onUpdate?: (message: ConversationMessage) => void): Promise<ConversationMessage> {
    console.log('🚀 processMessage called with onUpdate callback:', !!onUpdate);
    
    // Add user message to conversation
    const userMsg: ConversationMessage = {
      id: this.generateId(),
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
      images: images || []
    };
    this.conversation.push(userMsg);



    // Convert conversation to LLM format, filtering out think tags
    const isOllama = this.config.llmConfig.baseURL.includes('11434') || this.config.llmConfig.baseURL.includes('ollama');
    
    // Get the latest user message ID to determine which message can have images
    const latestUserMessage = this.conversation[this.conversation.length - 1];
    const isLatestUserMessage = latestUserMessage && latestUserMessage.role === 'user';
    
    const llmMessages: LLMMessage[] = this.conversation.map(msg => {
      // For user messages with images
      if (msg.role === 'user' && msg.images && msg.images.length > 0) {
        // Only include images if this is the latest user message
        // Historical messages should have images stripped but keep text analysis from assistant responses
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
            
            // For Ollama, return the message with images array at message level
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
                let imageData = image.fullImage || image.thumbnail; // Fallback to thumbnail if fullImage not available
                let mediaType = image.mimeType || 'image/jpeg';
                
                // Extract base64 data if it's a data URL
                if (imageData.startsWith('data:')) {
                  const parts = imageData.split(',');
                  if (parts.length === 2) {
                    // Extract media type from data URL if available
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
                let imageUrl = image.fullImage || image.thumbnail; // Fallback to thumbnail if fullImage not available
                
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
              
              return {
                role: msg.role,
                content: contentArray
              };
            }
          }
        } else {
          // For historical messages, strip images and just send text content
          // Add a note that images were provided but are being converted to text context
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
        return {
          role: msg.role,
          content: cleanContentForLLM(msg.content)
        };
      }
    });



    try {
      // Get initial response from LLM
      const response = await this.llmClient.generateResponse(llmMessages);

      // Parse response for tool calls (text-based format for Ollama)
      const { content, toolCalls } = this.parseToolCalls(response.content);

      // Create assistant message
      const assistantMsg: ConversationMessage = {
        id: this.generateId(),
        role: 'assistant',
        content: toolCalls && toolCalls.length > 0 ? '' : content, // Don't show content if there are tool calls
        timestamp: new Date(),
        toolCalls,
        status: toolCalls && toolCalls.length > 0 ? 'processing' : 'completed',
        model: this.config.llmConfig.model
      };

      this.conversation.push(assistantMsg);

      // Send initial message update
      if (onUpdate) {
        console.log('📤 Sending initial message update via onUpdate callback');
        onUpdate(assistantMsg);
      } else {
        console.log('⚠️ No onUpdate callback provided');
      }

      // Execute tool calls if present
      if (toolCalls && toolCalls.length > 0) {
        const toolResults = await this.executeToolCalls(toolCalls, assistantMsg.id);
        
        // Check if the message was cancelled during execution
        if (this.cancelledMessages.has(assistantMsg.id)) {
          assistantMsg.status = 'cancelled';
          assistantMsg.content = 'Tool execution was cancelled.';
          this.cancelledMessages.delete(assistantMsg.id);
          
          // Send update when cancelled
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
                // Convert object to readable format without raw JSON
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
        
        console.log('✅ Tool execution completed, updating status to completed');
        
        // Send update when completed
        if (onUpdate) {
          console.log('📤 Sending completion update via onUpdate callback');
          onUpdate(assistantMsg);
        }
      }
      return assistantMsg;

    } catch (error: any) {
      logger.error('Error in processMessage:', error);
      // Don't add error to conversation, let it propagate to be handled as a proper error
      throw error;
    }
  }

  private async executeToolCalls(toolCalls: ToolCall[], messageId: string): Promise<Array<{ name: string; result: any }>> {
    const results = [];
    
    for (const toolCall of toolCalls) {
      // Check if cancelled before each tool execution
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
    // Start with system message
    this.conversation = [{
      id: 'system',
      role: 'system',
      content: this.systemPrompt,
      timestamp: new Date()
    }];
    
    // Add provided messages
    this.conversation.push(...messages);
  }


  private parseToolCalls(content: string): { content: string; toolCalls?: ToolCall[] } {
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
          
          // Mark this JSON block for removal
          jsonBlocksToRemove.push(match[0]);
        }
        // Handle alternate format: {"tool_name": {...}} 
        else {
          for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === 'object' && value !== null) {
              // Check if the key is a valid tool name
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
                
                // Mark this JSON block for removal
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

  updateLLMConfig(newLlmConfig: AgentConfig['llmConfig']): void {
    this.config.llmConfig = newLlmConfig;
    this.llmClient = new LLMClient(newLlmConfig);
  }

  updateRole(customRole?: string): void {
    this.config.customRole = customRole;
    this.systemPrompt = this.createSystemPrompt();
    
    // Update the system message in the current conversation
    const systemMessage = this.conversation.find(msg => msg.role === 'system');
    if (systemMessage) {
      systemMessage.content = this.systemPrompt;
    }
  }

  getCurrentRole(): string {
    return this.config.customRole || DEFAULT_ROLE;
  }

  getDefaultRole(): string {
    return DEFAULT_ROLE;
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}
