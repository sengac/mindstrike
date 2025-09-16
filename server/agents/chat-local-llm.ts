import { BaseChatModel, BaseChatModelParams } from '@langchain/core/language_models/chat_models';
import { BaseMessage, AIMessage, HumanMessage, AIMessageChunk } from '@langchain/core/messages';
import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { ChatGenerationChunk, ChatResult } from '@langchain/core/outputs';
import { getLocalLLMManager } from '../local-llm-singleton.js';

export interface ChatLocalLLMInput extends BaseChatModelParams {
  modelName: string;
  temperature?: number;
  maxTokens?: number;
}

export class ChatLocalLLM extends BaseChatModel {
  modelName: string;
  temperature: number;
  maxTokens: number;

  constructor(fields: ChatLocalLLMInput) {
    super(fields);
    this.modelName = fields.modelName;
    this.temperature = fields.temperature ?? 0.7;
    this.maxTokens = fields.maxTokens ?? 4000;
  }

  _llmType(): string {
    return 'local-llm';
  }

  async _generate(
    messages: BaseMessage[],
    options?: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun
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
          maxTokens: this.maxTokens
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
      throw new Error(`Local LLM generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async *_streamResponseChunks(
    messages: BaseMessage[],
    options?: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun
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
          maxTokens: this.maxTokens
        }
      );

      for await (const chunk of stream) {
        yield new ChatGenerationChunk({
          text: chunk,
          message: new AIMessageChunk(chunk),
        });
      }
    } catch (error) {
      throw new Error(`Local LLM streaming failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async ensureModelLoaded(localLlmManager: any): Promise<void> {
    try {
      // Check if model is already loaded by attempting to get model info
      // The loadModel method automatically unloads other models and loads this one
      await localLlmManager.loadModel(this.modelName);
    } catch (error) {
      throw new Error(`Failed to load model ${this.modelName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private formatMessages(messages: BaseMessage[]): { role: string; content: string; }[] {
    // Convert LangChain messages to the format expected by LocalLLMManager
    return messages.map((message) => {
      const role = message._getType();
      const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
      
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
