import {
  BaseChatModel,
  type BaseChatModelParams,
} from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import {
  AIMessage,
  AIMessageChunk,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type { ChatResult, ChatGeneration } from '@langchain/core/outputs';
import { ChatGenerationChunk } from '@langchain/core/outputs';
import { getEnvironmentVariable } from '@langchain/core/utils/env';
import { Logger } from '@nestjs/common';

interface PerplexityMessageContent {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

interface PerplexityMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | PerplexityMessageContent[];
}

interface PerplexityStreamChunk {
  choices: Array<{
    delta: {
      content?: string;
      role?: string;
    };
    index: number;
  }>;
  citations?: string[];
}

interface PerplexityResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    index: number;
  }>;
  citations?: string[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ChatPerplexityExtendedInput extends BaseChatModelParams {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  apiKey?: string;
  baseURL?: string;
  timeout?: number;
  searchDomainFilter?: string[];
  returnImages?: boolean;
  returnRelatedQuestions?: boolean;
  searchRecencyFilter?: string;
}

/**
 * Clean implementation of Perplexity chat model with proper citation and multimodal support
 */
export class ChatPerplexityExtended extends BaseChatModel<ChatPerplexityExtendedInput> {
  private readonly logger = new Logger(ChatPerplexityExtended.name);

  model = 'llama-3.1-sonar-small-128k-online';
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  apiKey: string;
  baseURL: string;
  timeout?: number;
  searchDomainFilter?: string[];
  returnImages?: boolean;
  returnRelatedQuestions?: boolean;
  searchRecencyFilter?: string;

  constructor(fields?: ChatPerplexityExtendedInput) {
    super(fields ?? {});

    this.model = fields?.model ?? this.model;
    this.temperature = fields?.temperature;
    this.maxTokens = fields?.maxTokens;
    this.topP = fields?.topP;
    this.topK = fields?.topK;
    this.presencePenalty = fields?.presencePenalty;
    this.frequencyPenalty = fields?.frequencyPenalty;
    this.timeout = fields?.timeout;
    this.searchDomainFilter = fields?.searchDomainFilter;
    this.returnImages = fields?.returnImages;
    this.returnRelatedQuestions = fields?.returnRelatedQuestions;
    this.searchRecencyFilter = fields?.searchRecencyFilter;

    this.apiKey =
      fields?.apiKey ?? getEnvironmentVariable('PERPLEXITY_API_KEY') ?? '';
    this.baseURL = fields?.baseURL ?? 'https://api.perplexity.ai';

    if (!this.apiKey) {
      throw new Error(
        'Perplexity API key is required. Set PERPLEXITY_API_KEY environment variable or pass apiKey in constructor.'
      );
    }
  }

  _llmType(): string {
    return 'perplexity';
  }

  invocationParams() {
    return {
      model: this.model,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      top_p: this.topP,
      top_k: this.topK,
      presence_penalty: this.presencePenalty,
      frequency_penalty: this.frequencyPenalty,
      search_domain_filter: this.searchDomainFilter,
      return_images: this.returnImages,
      return_related_questions: this.returnRelatedQuestions,
      search_recency_filter: this.searchRecencyFilter,
    };
  }

  /**
   * Convert BaseMessage to Perplexity message format
   */
  private formatMessage(message: BaseMessage): PerplexityMessage {
    // Handle multimodal content for HumanMessage
    if (message instanceof HumanMessage && Array.isArray(message.content)) {
      return {
        role: 'user',
        content: message.content as PerplexityMessageContent[],
      };
    }

    // Determine role
    let role: 'system' | 'user' | 'assistant';
    if (message instanceof SystemMessage) {
      role = 'system';
    } else if (message instanceof HumanMessage) {
      role = 'user';
    } else if (message instanceof AIMessage) {
      role = 'assistant';
    } else {
      // Default to user for unknown message types
      role = 'user';
    }

    // Handle content
    const content =
      typeof message.content === 'string'
        ? message.content
        : JSON.stringify(message.content);

    return { role, content };
  }

  /**
   * Make API request to Perplexity
   */
  private async makeRequest(
    messages: PerplexityMessage[],
    stream: boolean
  ): Promise<Response> {
    const params = this.invocationParams();

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...params,
        messages,
        stream,
      }),
      signal: this.timeout ? AbortSignal.timeout(this.timeout) : undefined,
    });

    if (!response.ok) {
      const error = await response.text().catch(() => 'Unknown error');
      throw new Error(`Perplexity API error (${response.status}): ${error}`);
    }

    return response;
  }

  /**
   * Generate a chat completion
   */
  async _generate(
    messages: BaseMessage[],
    _options?: this['ParsedCallOptions'],
    _runManager?: CallbackManagerForLLMRun
  ): Promise<ChatResult> {
    const formattedMessages = messages.map(msg => this.formatMessage(msg));

    try {
      const response = await this.makeRequest(formattedMessages, false);
      const data = (await response.json()) as PerplexityResponse;

      const { message } = data.choices[0];

      const generation: ChatGeneration = {
        text: message.content,
        message: new AIMessage({
          content: message.content,
          additional_kwargs: {
            citations: data.citations,
          },
        }),
      };

      return {
        generations: [generation],
        llmOutput: {
          tokenUsage: data.usage
            ? {
                promptTokens: data.usage.prompt_tokens,
                completionTokens: data.usage.completion_tokens,
                totalTokens: data.usage.total_tokens,
              }
            : {},
        },
      };
    } catch (error) {
      this.logger.error('Perplexity API error:', error);
      throw error;
    }
  }

  /**
   * Stream chat completion with proper citation accumulation
   */
  async *_streamResponseChunks(
    messages: BaseMessage[],
    _options?: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun
  ): AsyncGenerator<ChatGenerationChunk> {
    const formattedMessages = messages.map(msg => this.formatMessage(msg));
    let accumulatedCitations: string[] = [];

    try {
      const response = await this.makeRequest(formattedMessages, true);

      if (!response.body) {
        throw new Error('No response body for streaming');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            if (data === '[DONE]') {
              return;
            }

            try {
              const chunk = JSON.parse(data) as PerplexityStreamChunk;

              // Update citations if present in this chunk
              if (chunk.citations && chunk.citations.length > 0) {
                accumulatedCitations = chunk.citations;
              }

              const content = chunk.choices[0]?.delta?.content ?? '';

              if (content) {
                // Create message chunk with accumulated citations
                const messageChunk = new AIMessageChunk({
                  content,
                  additional_kwargs: {
                    citations:
                      accumulatedCitations.length > 0
                        ? accumulatedCitations
                        : undefined,
                  },
                });

                yield new ChatGenerationChunk({
                  text: content,
                  message: messageChunk,
                });

                // Notify run manager if provided
                if (runManager) {
                  await runManager.handleLLMNewToken(content);
                }
              }
            } catch {
              // Skip invalid JSON lines
              this.logger.debug('Skipping invalid JSON line:', data);
            }
          }
        }
      }
    } catch (error) {
      this.logger.error('Perplexity streaming error:', error);
      throw error;
    }
  }
}
