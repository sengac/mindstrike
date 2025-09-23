import type {
  LlamaChatSession,
  ChatHistoryItem,
  Token,
  ChatSessionModelFunctions,
} from 'node-llama-cpp';
import { parentPort } from 'worker_threads';
import type { MCPTool } from '../mcp-manager.js';
import { logger } from '../logger.js';

// Type definitions for worker messages
interface MCPToolsMessage {
  type: 'mcpTools';
  tools: MCPTool[];
}

interface MCPToolsResponseMessage {
  id: string;
  type: 'mcpToolsResponse';
  data: MCPTool[];
}

interface ToolExecutionResponseMessage {
  id: string;
  type: 'toolExecutionResponse';
  error?: string;
  result?: unknown;
}

type WorkerMessage =
  | MCPToolsMessage
  | MCPToolsResponseMessage
  | ToolExecutionResponseMessage;

export interface GenerateOptions {
  threadId?: string;
  disableFunctions?: boolean;
  disableChatHistory?: boolean;
  signal?: AbortSignal;
  onToken?: (tokens: Token[]) => void;
  temperature?: number;
  maxTokens?: number;
  topK?: number;
  topP?: number;
  seed?: number;
}

export interface GenerateResponse {
  content: string;
  tokensGenerated: number;
  stopReason?: 'maxTokens' | 'stopSequence' | 'abort';
}

export class ModelResponseGenerator {
  private mcpTools: MCPTool[] = [];
  private mcpToolsPromise: Promise<MCPTool[]> | null = null;

  constructor() {
    // Set up listener for MCP tools from parent process
    if (parentPort) {
      parentPort.on('message', (message: unknown) => {
        const msg = message as WorkerMessage;
        if (msg.type === 'mcpTools') {
          this.mcpTools = msg.tools ?? [];
          logger.debug(`Received ${this.mcpTools.length} MCP tools`);
        }
      });
    }
  }

  /**
   * Get MCP tools, requesting from parent if needed
   */
  private async getMCPTools(): Promise<MCPTool[] | undefined> {
    if (!parentPort) {
      return undefined;
    }

    // If we already have tools, return them
    if (this.mcpTools.length > 0) {
      return this.mcpTools;
    }

    // If already requesting, wait for that request
    if (this.mcpToolsPromise) {
      return this.mcpToolsPromise;
    }

    // Request tools from parent
    this.mcpToolsPromise = new Promise<MCPTool[]>(resolve => {
      const messageId = Math.random().toString(36).substring(7);

      const handleMessage = (message: unknown) => {
        const msg = message as MCPToolsResponseMessage;
        if (msg.id === messageId && msg.type === 'mcpToolsResponse') {
          parentPort!.off('message', handleMessage);
          resolve(msg.data ?? []);
        }
      };

      parentPort!.on('message', handleMessage);
      parentPort!.postMessage({ type: 'getMCPTools', id: messageId });

      // Timeout after 5 seconds
      setTimeout(() => {
        parentPort!.off('message', handleMessage);
        resolve([]);
      }, 5000);
    });

    const tools = await this.mcpToolsPromise;
    this.mcpToolsPromise = null;
    this.mcpTools = tools;
    return tools;
  }

  /**
   * Convert MCP tools to node-llama-cpp format
   */
  private convertMCPToolsToNodeLlamaFormat(
    mcpTools: MCPTool[]
  ): ChatSessionModelFunctions | undefined {
    if (!mcpTools?.length) {
      return undefined;
    }

    // Build tools object with proper typing
    const toolEntries: Array<[string, unknown]> = mcpTools.map(tool => [
      tool.name,
      {
        description: tool.description,
        params: tool.inputSchema as Record<string, unknown>,
        handler: async (params: unknown) => {
          if (!parentPort) {
            throw new Error('No parent port available for tool execution');
          }

          return new Promise((resolve, reject) => {
            const messageId = Math.random().toString(36).substring(7);

            const handleMessage = (message: unknown) => {
              const msg = message as ToolExecutionResponseMessage;
              if (
                msg.id === messageId &&
                msg.type === 'toolExecutionResponse'
              ) {
                parentPort!.off('message', handleMessage);
                if (msg.error) {
                  reject(new Error(msg.error));
                } else {
                  resolve(msg.result);
                }
              }
            };

            parentPort!.on('message', handleMessage);
            parentPort!.postMessage({
              type: 'executeTool',
              id: messageId,
              tool: tool.name,
              params,
            });

            // Timeout after 30 seconds
            setTimeout(() => {
              parentPort!.off('message', handleMessage);
              reject(new Error('Tool execution timeout'));
            }, 30000);
          });
        },
      },
    ]);

    return Object.fromEntries(toolEntries) as ChatSessionModelFunctions;
  }

  /**
   * Generate a non-streaming response
   */
  async generateResponse(
    session: LlamaChatSession,
    message: string,
    options: GenerateOptions = {}
  ): Promise<GenerateResponse> {
    try {
      // Get functions if not disabled
      let functions: ChatSessionModelFunctions | undefined;
      if (!options.disableFunctions) {
        const mcpTools = await this.getMCPTools();
        if (mcpTools) {
          functions = this.convertMCPToolsToNodeLlamaFormat(mcpTools);
        }
      }

      // Store initial chat history if we need to restore it
      let initialChatHistory: ChatHistoryItem[] | undefined;
      if (options.disableChatHistory) {
        initialChatHistory = session.getChatHistory();
      }

      // Log sampling chance (10%)
      if (Math.random() < 0.1) {
        logger.debug('Generating response with options:', {
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          hasFunctions: !!functions,
          disableChatHistory: options.disableChatHistory,
        });
      }

      // Generate response
      const response = await session.prompt(message, {
        signal: options.signal,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        topK: options.topK,
        topP: options.topP,
        seed: options.seed,
        functions,
        onToken: options.onToken,
      });

      // Restore chat history if needed
      if (options.disableChatHistory && initialChatHistory) {
        session.setChatHistory(initialChatHistory);
      }

      return {
        content: response,
        tokensGenerated: response.length, // Approximation
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          content: '',
          tokensGenerated: 0,
          stopReason: 'abort',
        };
      }
      throw error;
    }
  }

  /**
   * Generate a streaming response
   */
  async *generateStreamResponse(
    session: LlamaChatSession,
    message: string,
    options: GenerateOptions = {}
  ): AsyncGenerator<string, GenerateResponse, unknown> {
    try {
      let generatedContent = '';
      let tokenCount = 0;

      // Get functions if not disabled
      let functions: ChatSessionModelFunctions | undefined;
      if (!options.disableFunctions) {
        const mcpTools = await this.getMCPTools();
        if (mcpTools) {
          functions = this.convertMCPToolsToNodeLlamaFormat(mcpTools);
        }
      }

      // Store initial chat history if we need to restore it
      let initialChatHistory: ChatHistoryItem[] | undefined;
      if (options.disableChatHistory) {
        initialChatHistory = session.getChatHistory();
      }

      // Create token queue for streaming
      const tokenQueue: string[] = [];
      let resolveToken: ((value: string | null) => void) | null = null;
      let streamEnded = false;

      const pushToken = (token: string | null) => {
        if (token === null) {
          streamEnded = true;
        }

        if (resolveToken) {
          resolveToken(token);
          resolveToken = null;
        } else {
          tokenQueue.push(token!);
        }
      };

      const getNextToken = async (): Promise<string | null> => {
        if (tokenQueue.length > 0) {
          return tokenQueue.shift()!;
        }

        if (streamEnded) {
          return null;
        }

        return new Promise(resolve => {
          resolveToken = resolve;
        });
      };

      // Start generation
      session
        .prompt(message, {
          signal: options.signal,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          topK: options.topK,
          topP: options.topP,
          seed: options.seed,
          functions,
          onToken: tokens => {
            // Convert tokens to string using proper detokenization
            const tokenString = session.model.detokenize(tokens);
            pushToken(tokenString);
            tokenCount++;
          },
        })
        .then(fullResponse => {
          generatedContent = fullResponse;
          // Restore chat history if needed
          if (options.disableChatHistory && initialChatHistory) {
            session.setChatHistory(initialChatHistory);
          }
          pushToken(null);
        })
        .catch(error => {
          logger.error('Stream generation error:', error);
          if (options.disableChatHistory && initialChatHistory) {
            session.setChatHistory(initialChatHistory);
          }
          pushToken(null);
        });

      // Yield tokens as they come
      let token: string | null;
      while ((token = await getNextToken()) !== null) {
        yield token;
        if (options.signal?.aborted) {
          return {
            content: generatedContent,
            tokensGenerated: tokenCount,
            stopReason: 'abort',
          };
        }
      }

      return {
        content: generatedContent,
        tokensGenerated: tokenCount,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          content: '',
          tokensGenerated: 0,
          stopReason: 'abort',
        };
      }
      throw error;
    }
  }

  /**
   * Clear cached MCP tools
   */
  clearMCPTools(): void {
    this.mcpTools = [];
    this.mcpToolsPromise = null;
  }
}
