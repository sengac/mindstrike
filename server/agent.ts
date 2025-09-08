import { LLMClient, LLMMessage, ToolCall } from './llm-client.js';
import { ToolSystem } from './tools.js';

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
}

export class Agent {
  private llmClient: LLMClient;
  private toolSystem: ToolSystem;
  private conversation: ConversationMessage[] = [];
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
    return `You are PowerAgent, a powerful AI coding agent. You help users with software engineering tasks including adding functionality, fixing bugs, refactoring code, and explaining systems.

CORE PRINCIPLES:
- Take initiative and action when asked to do something
- Use tools extensively to understand codebases and complete tasks
- Be concise and direct in communication (1-4 lines unless asked for detail)
- Always run diagnostics and build commands after making changes
- Use multiple tools simultaneously for efficiency

AVAILABLE TOOLS:
You have access to these tools for interacting with the codebase. Use tools proactively to answer questions about the project, understand code, make changes, or explore the workspace.

CRITICAL: You MUST use tools to answer questions. DO NOT say you cannot do something if a tool exists for it.

MANDATORY TOOL USAGE - RESPOND WITH JSON IMMEDIATELY:
- User says "list files" / "show files" / "list all files" / "what files" → IMMEDIATELY respond with:
\`\`\`json
{
  "tool": "list_directory",
  "parameters": {}
}
\`\`\`

- User says "read file X" → IMMEDIATELY respond with:
\`\`\`json
{
  "tool": "read_file", 
  "parameters": {"path": "filename"}
}
\`\`\`

NEVER say "I don't have the capability" or "I cannot" - ALWAYS use tools first!

To use a tool, respond with a JSON block in this EXACT format:
\`\`\`json
{
  "tool": "tool_name",
  "parameters": {
    "param1": "value1"
  }
}
\`\`\`

Available tools:
- read_file: Read file contents with line numbers
  Parameters: {"path": "file/path"}
- create_file: Create or overwrite files  
  Parameters: {"path": "file/path", "content": "file content"}
- edit_file: Edit files by replacing text
  Parameters: {"path": "file/path", "old_str": "text to find", "new_str": "replacement text"}
- list_directory: List directory contents
  Parameters: {"path": "directory/path"} (optional, defaults to workspace root)
- bash: Execute shell commands
  Parameters: {"cmd": "command to run", "cwd": "working/directory"} (cwd optional)
- glob: Find files by pattern
  Parameters: {"filePattern": "**/*.js", "limit": 10} (limit optional)
- grep: Search text in files
  Parameters: {"pattern": "search text", "path": "search/path", "caseSensitive": true} (path and caseSensitive optional)
- todo_write: Write or update todo list for task management
  Parameters: {"todos": [{"id": "1", "content": "task", "status": "todo", "priority": "high"}]}
- todo_read: Read current todo list
  Parameters: {}
- mermaid: Render Mermaid diagrams
  Parameters: {"code": "graph TD; A-->B"}
- get_diagnostics: Get errors/warnings for files or directories
  Parameters: {"path": "file/or/directory"}
- format_file: Format code files using standard formatters
  Parameters: {"path": "file/path"}
- undo_edit: Undo last edit to a file
  Parameters: {"path": "file/path"}
- web_search: Search the web for information
  Parameters: {"query": "search terms", "num_results": 5} (num_results optional)
- delete_file: Delete a file (use with caution)
  Parameters: {"path": "file/path"}

WORKFLOW:
1. ALWAYS start by reading relevant files to understand the project/question
2. Use tools to explore, search, and analyze the codebase
3. For project questions: read README.md, package.json, main source files
4. Plan implementation or provide informed answers based on actual code
5. Make changes using file tools when requested
6. Test and verify with build/lint commands
7. Provide accurate, evidence-based responses

EXLE - EXACT RESPONSE FORMAT:
User: "list all the files in this directory"
You: \`\`\`json
{
  "tool": "list_directory",
  "parameters": {}
}
\`\`\`

User: "what does this project do?"
You: \`\`\`json
{
  "tool": "read_file",
  "parameters": {"path": "README.md"}
}
\`\`\`

CRITICAL RULES:
1. NEVER say "I don't have the capability" or "I cannot"
2. ALWAYS use tools when the user asks you to do something
3. If user asks to list files, immediately use list_directory tool
4. If user asks about files/code, immediately read the relevant files
5. Use tools first, explain after

Always be helpful, accurate, and focused on getting things done efficiently.`;
  }

  async processMessage(userMessage: string): Promise<ConversationMessage> {
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
        content,
        timest: new Date(),
        toolCalls
      };

      // Execute tool calls if present
      if (toolCalls && toolCalls.length > 0) {
        const toolResults = await this.executeToolCalls(toolCalls);
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
        assistantMsg.content = content + '\n\n' + followUpResponse.content;
      }

      this.conversation.push(assistantMsg);
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

  private async executeToolCalls(toolCalls: ToolCall[]): Promise<Array<{ name: string; result: any }>> {
    const results = [];
    
    for (const toolCall of toolCalls) {
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

  clearConversation(): void {
    this.conversation = [{
      id: 'system',
      role: 'system',
      content: this.systemPrompt,
      timest: new Date()
    }];
  }

  private parseToolCalls(content: string): { content: string; toolCalls?: ToolCall[] } {
    const toolCalls: ToolCall[] = [];
    let cleanContent = content;

    // Look for JSON blocks that represent tool calls
    const jsonBlockRegex = /```json\s*\n([\s\S]*?)\n```/g;
    let match;

    while ((match = jsonBlockRegex.exec(content)) !== null) {
      try {
        const jsonStr = match[1];
        const parsed = JSON.parse(jsonStr);
        
        // Handle correct format: {"tool": "name", "parameters": {...}}
        if (parsed.tool && parsed.parameters) {
          toolCalls.push({
            id: this.generateId(),
            name: parsed.tool,
            parameters: parsed.parameters
          });
          
          // Remove the JSON block from the content
          cleanContent = cleanContent.replace(match[0], '');
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
                toolCalls.push({
                  id: this.generateId(),
                  name: key,
                  parameters: value as Record<string, any>
                });
                
                // Remove the JSON block from the content
                cleanContent = cleanContent.replace(match[0], '');
                break;
              }
            }
          }
        }
      } catch (e) {
        console.log('Failed to parse JSON block:', match[1], e);
      }
    }

    if (toolCalls.length > 0) {
      console.log('Parsed tool calls:', toolCalls);
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
