import {
  BaseChatModel,
  BaseChatModelParams,
} from '@langchain/core/language_models/chat_models';
import {
  BaseMessage,
  AIMessage,
  AIMessageChunk,
} from '@langchain/core/messages';
import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { ChatGenerationChunk, ChatResult } from '@langchain/core/outputs';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { getLocalLLMManager } from '../local-llm-singleton.js';

interface LocalLLMManagerInterface {
  loadModel: (modelName: string, threadId?: string) => Promise<void>;
  updateSessionHistory: (modelName: string, threadId: string) => Promise<void>;
  generateResponse: (
    modelName: string,
    messages: { role: string; content: string }[],
    options?: {
      temperature?: number;
      maxTokens?: number;
      threadId?: string;
      disableFunctions?: boolean;
    }
  ) => Promise<string>;
  generateStreamResponse: (
    modelName: string,
    messages: { role: string; content: string }[],
    options?: {
      temperature?: number;
      maxTokens?: number;
      signal?: AbortSignal;
      threadId?: string;
      disableFunctions?: boolean;
      disableChatHistory?: boolean;
    }
  ) => AsyncIterable<string>;
}

export interface ChatLocalLLMInput extends BaseChatModelParams {
  modelName: string;
  temperature?: number;
  maxTokens?: number;
  threadId?: string;
  disableFunctions?: boolean;
  disableChatHistory?: boolean;
}

export class ChatLocalLLM extends BaseChatModel {
  modelName: string;
  temperature: number;
  maxTokens: number;
  threadId?: string;
  disableFunctions?: boolean;
  disableChatHistory?: boolean;
  private tools: DynamicStructuredTool[] = [];

  constructor(fields: ChatLocalLLMInput) {
    super(fields);
    this.modelName = fields.modelName;
    this.temperature = fields.temperature ?? 0.7;
    this.maxTokens = fields.maxTokens ?? 4000;
    this.threadId = fields.threadId;
    this.disableFunctions = fields.disableFunctions;
    this.disableChatHistory = fields.disableChatHistory;
  }

  _llmType(): string {
    return 'local-llm';
  }

  bindTools(tools: DynamicStructuredTool[]): ChatLocalLLM {
    // Built-in local models don't support native tool calling,
    // but we provide this method so they can be treated the same as other models.
    // Tool calls will be handled via text parsing in the base agent.
    const bound = new ChatLocalLLM({
      modelName: this.modelName,
      temperature: this.temperature,
      maxTokens: this.maxTokens,
      threadId: this.threadId,
      disableFunctions: this.disableFunctions,
      disableChatHistory: this.disableChatHistory,
    });
    bound.tools = [...tools];
    return bound;
  }

  async _generate(
    messages: BaseMessage[],
    _options?: this['ParsedCallOptions'],
    _runManager?: CallbackManagerForLLMRun
  ): Promise<ChatResult> {
    const localLlmManager = getLocalLLMManager();

    // Ensure model is loaded
    await this.ensureModelLoaded(localLlmManager);

    // Convert messages to the format expected by local LLM
    const formattedMessages = this.formatMessages(messages);

    try {
      const response = await localLlmManager.generateResponse(
        this.modelName,
        formattedMessages,
        {
          temperature: this.temperature,
          maxTokens: this.maxTokens,
          threadId: this.threadId,
          disableFunctions: this.disableFunctions,
          disableChatHistory: this.disableChatHistory,
        }
      );

      return {
        generations: [
          {
            text: response,
            message: new AIMessage(response),
          },
        ],
      };
    } catch (error) {
      throw new Error(
        `Local LLM generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async *_streamResponseChunks(
    messages: BaseMessage[],
    _options?: this['ParsedCallOptions'],
    _runManager?: CallbackManagerForLLMRun
  ): AsyncGenerator<ChatGenerationChunk> {
    const localLlmManager = getLocalLLMManager();

    // Ensure model is loaded
    await this.ensureModelLoaded(localLlmManager);

    // Convert messages to the format expected by local LLM
    const formattedMessages = this.formatMessages(messages);

    try {
      const stream = localLlmManager.generateStreamResponse(
        this.modelName,
        formattedMessages,
        {
          temperature: this.temperature,
          maxTokens: this.maxTokens,
          threadId: this.threadId,
          disableFunctions: this.disableFunctions,
          disableChatHistory: this.disableChatHistory,
        }
      );

      for await (const chunk of stream) {
        yield new ChatGenerationChunk({
          text: chunk,
          message: new AIMessageChunk(chunk),
        });
      }
    } catch (error) {
      throw new Error(
        `Local LLM streaming failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async ensureModelLoaded(
    localLlmManager: LocalLLMManagerInterface
  ): Promise<void> {
    try {
      // Check if model is already loaded by attempting to get model info
      // The loadModel method automatically unloads other models and loads this one
      await localLlmManager.loadModel(this.modelName, this.threadId);

      // Always update session history for the current thread
      if (this.threadId) {
        await localLlmManager.updateSessionHistory(
          this.modelName,
          this.threadId
        );
      }
    } catch (error) {
      throw new Error(
        `Failed to load model ${this.modelName}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private formatMessages(
    messages: BaseMessage[]
  ): { role: string; content: string }[] {
    // Convert LangChain messages to the format expected by LocalLLMManager
    return messages.map(message => {
      const role = message._getType();
      const content =
        typeof message.content === 'string'
          ? message.content
          : JSON.stringify(message.content);

      switch (role) {
        case 'human':
          return { role: 'user', content };
        case 'ai':
          return { role: 'assistant', content };
        case 'system':
          return { role: 'system', content };
        default:
          return { role: role, content };
      }
    });
  }
}
