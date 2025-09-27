import { Injectable } from '@nestjs/common';
import type { BaseChatModelParams } from '@langchain/core/language_models/chat_models';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import { AIMessage, AIMessageChunk } from '@langchain/core/messages';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type { ChatResult } from '@langchain/core/outputs';
import { ChatGenerationChunk } from '@langchain/core/outputs';
import type { DynamicStructuredTool } from '@langchain/core/tools';
import { getLocalLLMManager } from '../../../localLlmSingleton';

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

@Injectable()
export class ChatLocalLLM extends BaseChatModel {
  modelName: string;
  temperature: number;
  maxTokens: number;
  threadId?: string;
  disableFunctions?: boolean;
  disableChatHistory?: boolean;
  private tools: DynamicStructuredTool[] = [];
  private lastOptions?: this['ParsedCallOptions'] = undefined;
  private lastRunManager?: CallbackManagerForLLMRun = undefined;
  private localLlmManager: LocalLLMManagerInterface;

  constructor(fields: ChatLocalLLMInput) {
    super(fields);
    this.modelName = fields.modelName;
    this.temperature = fields.temperature ?? 0.7;
    this.maxTokens = fields.maxTokens ?? 4000;
    this.threadId = fields.threadId;
    this.disableFunctions = fields.disableFunctions;
    this.disableChatHistory = fields.disableChatHistory;

    // Get singleton instance directly
    this.localLlmManager = getLocalLLMManager();
  }

  _llmType(): string {
    return 'local-llm';
  }

  bindTools(tools: DynamicStructuredTool[]): ChatLocalLLM {
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
    options?: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun
  ): Promise<ChatResult> {
    this.lastOptions = options;
    this.lastRunManager = runManager;

    await this.ensureModelLoaded(this.localLlmManager);

    const formattedMessages = this.formatMessages(messages);

    try {
      const response = await this.localLlmManager.generateResponse(
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
    options?: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun
  ): AsyncGenerator<ChatGenerationChunk> {
    this.lastOptions = options;
    this.lastRunManager = runManager;

    await this.ensureModelLoaded(this.localLlmManager);

    const formattedMessages = this.formatMessages(messages);

    try {
      const stream = this.localLlmManager.generateStreamResponse(
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
      await localLlmManager.loadModel(this.modelName, this.threadId);

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
