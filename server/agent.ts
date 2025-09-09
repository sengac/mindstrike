import { LLMClient, LLMMessage, ToolCall } from './llm-client.js';
import { ToolSystem } from './tools.js';
import { logger } from './logger.js';

export interface AgentConfig {
  workspaceRoot: string;
  llmConfig: {
    baseURL: string;
    model: string;
    apiKey?: string;
  };
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timest: Date;
  toolCalls?: ToolCall[];
  toolResults?: Array<{ name: string; result: any }>;
  status?: 'processing' | 'completed' | 'cancelled';
}

export class Agent {
  private llmClient: LLMClient;
  private toolSystem: ToolSystem;
  private conversation: ConversationMessage[] = [];
  private cancelledMessages: Set<string> = new Set();
  private systemPrompt: string;

  constructor(config: AgentConfig) {
    this.llmClient = new LLMClient(config.llmConfig);
    this.toolSystem = new ToolSystem(config.workspaceRoot);
    this.systemPrompt = this.createSystemPrompt();
    
    // Initialize with system message
    this.conversation.push({
      id: 'system',
      role: 'system',
      content: this.systemPrompt,
      timest: new Date()
    });
  }

  private createSystemPrompt(): string {
    return `You are PowerAgent, a powerful AI coding agent. You help users with software engineering tasks.

CRITICAL: You MUST use tools to answer questions. When a user asks you to do something, respond IMMEDIATELY with the appropriate tool call in the "TOOL CALL FORMAT" detailed below.

MANDATORY TOOL RESPONSES:
- User asks about files/directories → use the tools "list_directory" or "read_file"
- User asks to search, lookup, or requests unavailable information → use the tool "web_search"
- User asks about code → use the "read_file", "grep", or "glob" tools to find the code
- User asks to create/edit files → use the "create_file" or "edit_file" tools

TOOL CALL FORMAT - RESPOND EXACTLY LIKE THIS:
\`\`\`json
{
  "tool": "tool_name",
  "parameters": {"param": "value"}
}
\`\`\`

WEB SEARCH EXLES:
User: "search the web for code"
Response:
\`\`\`json
{
  "tool": "web_search",
  "parameters": {"query": "code"}
}
\`\`\`

User: "look up react documentation online"  
Response:
\`\`\`json
{
  "tool": "web_search", 
  "parameters": {"query": "react documentation"}
}
\`\`\`

NEVER say "I don't know or I don't have the capability" - ALWAYS use tools first!

NEVER forget to prefix tool JSON with \`\`\`json and suffix with \`\`\`

Available tools: read_file, create_file, edit_file, list_directory, bash, glob, grep, todo_write, todo_read, mermaid, get_diagnostics, format_file, undo_edit, web_search, delete_file

RULES:
1. ALWAYS use tools when asked to do something
2. Respond with JSON tool calls immediately 
3. Don't explain unless asked - just execute tools`;
  }

  async processMessage(userMessage: string, onUpdate?: (message: ConversationMessage) => void): Promise<ConversationMessage> {
    console.log('🚀 processMessage called with onUpdate callback:', !!onUpdate);
    
    // Add user message to conversation
    const userMsg: ConversationMessage = {
      id: this.generateId(),
      role: 'user',
      content: userMessage,
      timest: new Date()
    };
    this.conversation.push(userMsg);

    // Convert conversation to LLM format
    const llmMessages: LLMMessage[] = this.conversation.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

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
        timest: new Date(),
        toolCalls,
        status: toolCalls && toolCalls.length > 0 ? 'processing' : 'completed'
      };

      console.log('🔧 Created assistant message - Status:', assistantMsg.status, 'Tool calls:', assistantMsg.toolCalls?.length || 0);

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
          .map(result => `Tool ${result.name} result:\n${JSON.stringify(result.result, null, 2)}`)
          .join('\n\n');

        llmMessages.push({
          role: 'assistant',
          content: response.content
        });
        
        llmMessages.push({
          role: 'user',
          content: `Tool execution results:\n${toolResultContent}\n\nPlease provide a summary of what you accomplished.`
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
      const errorMsg: ConversationMessage = {
        id: this.generateId(),
        role: 'assistant',
        content: `Error: ${error.message}`,
        timest: new Date()
      };
      this.conversation.push(errorMsg);
      return errorMsg;
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
      timest: new Date()
    }];
  }

  loadConversation(messages: ConversationMessage[]): void {
    // Start with system message
    this.conversation = [{
      id: 'system',
      role: 'system',
      content: this.systemPrompt,
      timest: new Date()
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

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}
