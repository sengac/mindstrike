import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface GenerationOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  repeatPenalty?: number;
  systemPrompt?: string;
  threadId?: string;
  signal?: AbortSignal;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: Date;
}

@Injectable()
export class ResponseGeneratorService {
  private readonly logger = new Logger(ResponseGeneratorService.name);
  private conversationHistory = new Map<string, ChatMessage[]>();

  constructor(private configService: ConfigService) {}

  async generateResponse(
    prompt: string,
    options: GenerationOptions = {}
  ): Promise<string> {
    try {
      const { threadId, systemPrompt, ...generationOptions } = options;

      // Build conversation context if threadId is provided
      let fullPrompt = prompt;
      if (threadId) {
        const history = this.getConversationHistory(threadId);
        if (history.length > 0) {
          fullPrompt = this.buildPromptWithHistory(
            prompt,
            history,
            systemPrompt
          );
        } else if (systemPrompt) {
          fullPrompt = `${systemPrompt}\n\nUser: ${prompt}\nAssistant:`;
        }

        // Add user message to history
        this.addToHistory(threadId, { role: 'user', content: prompt });
      } else if (systemPrompt) {
        fullPrompt = `${systemPrompt}\n\nUser: ${prompt}\nAssistant:`;
      }

      // Stub implementation - generate mock response
      const response = `This is a stub response to: ${prompt.substring(0, 50)}...`;

      // Add assistant response to history if threadId is provided
      if (threadId) {
        this.addToHistory(threadId, { role: 'assistant', content: response });
      }

      return response;
    } catch (error) {
      this.logger.error('Error generating response:', error);
      throw error;
    }
  }

  async *streamResponse(
    prompt: string,
    options: GenerationOptions = {}
  ): AsyncGenerator<string> {
    try {
      const { threadId, systemPrompt, ...generationOptions } = options;

      // Build conversation context
      let fullPrompt = prompt;
      if (threadId) {
        const history = this.getConversationHistory(threadId);
        if (history.length > 0) {
          fullPrompt = this.buildPromptWithHistory(
            prompt,
            history,
            systemPrompt
          );
        } else if (systemPrompt) {
          fullPrompt = `${systemPrompt}\n\nUser: ${prompt}\nAssistant:`;
        }

        // Add user message to history
        this.addToHistory(threadId, { role: 'user', content: prompt });
      } else if (systemPrompt) {
        fullPrompt = `${systemPrompt}\n\nUser: ${prompt}\nAssistant:`;
      }

      // Stub implementation - simulate streaming
      const fullResponse = `This is a stub streaming response to: ${prompt.substring(0, 50)}...`;

      // Simulate chunked response
      const words = fullResponse.split(' ');
      for (const word of words) {
        yield word + ' ';
      }

      // Add complete response to history
      if (threadId) {
        this.addToHistory(threadId, {
          role: 'assistant',
          content: fullResponse,
        });
      }
    } catch (error) {
      this.logger.error('Error streaming response:', error);
      throw error;
    }
  }

  getConversationHistory(threadId: string): ChatMessage[] {
    return this.conversationHistory.get(threadId) ?? [];
  }

  clearConversationHistory(threadId: string): void {
    this.conversationHistory.delete(threadId);
  }

  private addToHistory(threadId: string, message: ChatMessage): void {
    const history = this.conversationHistory.get(threadId) ?? [];
    history.push({
      ...message,
      timestamp: new Date(),
    });

    // Keep only last 50 messages to prevent memory issues
    if (history.length > 50) {
      history.splice(0, history.length - 50);
    }

    this.conversationHistory.set(threadId, history);
  }

  private buildPromptWithHistory(
    currentPrompt: string,
    history: ChatMessage[],
    systemPrompt?: string
  ): string {
    const parts: string[] = [];

    if (systemPrompt) {
      parts.push(systemPrompt);
      parts.push('');
    }

    // Add conversation history
    for (const message of history) {
      if (message.role === 'user') {
        parts.push(`User: ${message.content}`);
      } else if (message.role === 'assistant') {
        parts.push(`Assistant: ${message.content}`);
      } else if (message.role === 'system') {
        parts.push(`System: ${message.content}`);
      }
      parts.push('');
    }

    // Add current prompt
    parts.push(`User: ${currentPrompt}`);
    parts.push('Assistant:');

    return parts.join('\n');
  }

  async abortGeneration(threadId: string): Promise<void> {
    // Stub implementation
    this.logger.log(`Aborting generation for thread: ${threadId}`);
  }
}
