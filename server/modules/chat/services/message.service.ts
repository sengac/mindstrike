import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import { ModuleRef } from '@nestjs/core';
import { ConversationService } from './conversation.service';
import { SseService } from '../../events/services/sse.service';
import type { AgentPoolService } from '../../agents/services/agent-pool.service';
import {
  CreateMessageDto,
  MessageImage,
  MessageNote,
} from '../dto/create-message.dto';
import { SSEEventType, ConversationMessage, Thread } from '../../../types';

export interface MessageCancellationManager {
  startTask(threadId: string): AbortController;
  cancelTask(threadId: string): boolean;
  isTaskActive(threadId: string): boolean;
  cleanup(): void;
}

export interface ToolCall {
  id: string;
  name: string;
  parameters: Record<string, unknown>;
}

export interface ToolResult {
  name: string;
  result: unknown;
}

export interface MessageWithTools {
  id: string;
  content: string;
  timestamp: Date;
  status?: 'completed' | 'cancelled' | 'processing';
  model?: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  images?: MessageImage[];
  notes?: MessageNote[];
}

export interface CurrentLlmConfig {
  baseURL?: string;
  model?: string;
  displayName?: string;
  apiKey?: string;
  type?: string;
  contextLength?: number;
}

export interface AgentWithProcessMessage {
  processMessage(
    threadId: string,
    message: string,
    options: {
      images?: MessageImage[];
      notes?: MessageNote[];
      onUpdate: (message: MessageWithTools) => Promise<void>;
      userMessageId?: string;
      signal: AbortSignal;
    }
  ): Promise<MessageWithTools>;
}

class MessageCancellationManagerImpl implements MessageCancellationManager {
  private readonly activeTasks = new Map<string, AbortController>();

  startTask(threadId: string): AbortController {
    // Cancel any existing task for this thread
    this.cancelTask(threadId);

    const controller = new AbortController();
    this.activeTasks.set(threadId, controller);
    return controller;
  }

  cancelTask(threadId: string): boolean {
    const controller = this.activeTasks.get(threadId);
    if (controller) {
      controller.abort();
      this.activeTasks.delete(threadId);
      return true;
    }
    return false;
  }

  isTaskActive(threadId: string): boolean {
    return this.activeTasks.has(threadId);
  }

  cleanup() {
    for (const controller of this.activeTasks.values()) {
      controller.abort();
    }
    this.activeTasks.clear();
  }
}

@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name);
  private readonly cancellationManager = new MessageCancellationManagerImpl();
  private agentPoolService: AgentPoolService | null = null;

  // Mock current LLM config - this should be injected from a proper config service
  private readonly currentLlmConfig: CurrentLlmConfig = {
    baseURL: '',
    model: '',
    displayName: '',
    apiKey: '',
    type: '',
    contextLength: 4096,
  };

  constructor(
    private readonly conversationService: ConversationService,
    private readonly sseService: SseService,
    private readonly moduleRef: ModuleRef
  ) {}

  private async getAgentPoolService(): Promise<AgentPoolService> {
    if (!this.agentPoolService) {
      // Lazy load the AgentPoolService to avoid circular dependency
      const { AgentPoolService } = await import(
        '../../agents/services/agent-pool.service'
      );
      this.agentPoolService = this.moduleRef.get(AgentPoolService, {
        strict: false,
      });
    }
    return this.agentPoolService;
  }

  async processMessage(dto: CreateMessageDto): Promise<{ status: string }> {
    const { message, messageId, threadId, images, notes, isAgentMode } = dto;

    // Validate input - exactly like Express
    if (!message && (!images || images.length === 0)) {
      throw new BadRequestException('Message or images are required');
    }

    // Check if LLM model is configured - exactly like Express
    if (
      !this.currentLlmConfig.model ||
      this.currentLlmConfig.model.trim() === ''
    ) {
      throw new BadRequestException(
        'No LLM model configured. Please select a model from the available options.'
      );
    }

    // Set current thread if provided - exactly like Express
    if (threadId) {
      const agentPoolService = await this.getAgentPoolService();
      await agentPoolService.setCurrentThread(threadId);
    }

    // Persist the user message - exactly like Express
    await this.conversationService.load();
    const userMessage: ConversationMessage = {
      id:
        messageId ??
        `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role: 'user' as const,
      content: message ?? '',
      timestamp: new Date(),
      status: 'completed' as const,
      images: images ?? [],
      notes: notes ?? [],
    };
    await this.conversationService.addMessage(
      threadId ?? 'default',
      userMessage
    );

    // Create a streaming callback that sends SSE events - exactly like Express
    let assistantMessage: MessageWithTools | null = null;
    let lastContentLength = 0;

    const streamingCallback = async (updatedMessage: MessageWithTools) => {
      // For the first update, create the assistant message
      if (!assistantMessage) {
        assistantMessage = updatedMessage;

        // Persist the new assistant message
        await this.conversationService.load();
        await this.conversationService.addMessage(threadId ?? 'default', {
          id: updatedMessage.id,
          role: 'assistant',
          content: updatedMessage.content,
          timestamp: updatedMessage.timestamp,
          status: updatedMessage.status,
          model: updatedMessage.model,
          toolCalls: updatedMessage.toolCalls,
          toolResults: updatedMessage.toolResults,
          images: updatedMessage.images ?? [],
          notes: updatedMessage.notes ?? [],
        });

        this.sseService.broadcast('unified-events', {
          type: SSEEventType.MESSAGE_UPDATE,
          message: updatedMessage,
        });
        lastContentLength = updatedMessage.content.length;
        return;
      }

      // Check if content has grown (new characters added)
      if (updatedMessage.content.length > lastContentLength) {
        const newContent = updatedMessage.content.slice(lastContentLength);
        if (newContent) {
          // Send the new content as a chunk
          this.sseService.broadcast('unified-events', {
            type: SSEEventType.CONTENT_CHUNK,
            chunk: newContent,
            threadId: threadId ?? 'default',
          });
          lastContentLength = updatedMessage.content.length;
        }
      }

      // Always send the full message update for status changes
      assistantMessage = updatedMessage;

      // Update the persisted message
      await this.conversationService.load();
      await this.conversationService.updateMessage(
        threadId ?? 'default',
        updatedMessage.id,
        {
          content: updatedMessage.content,
          status: updatedMessage.status,
          model: updatedMessage.model,
          toolCalls: updatedMessage.toolCalls,
          toolResults: updatedMessage.toolResults,
          timestamp: updatedMessage.timestamp,
        }
      );

      this.sseService.broadcast('unified-events', {
        type: SSEEventType.MESSAGE_UPDATE,
        message: updatedMessage,
        threadId: threadId ?? 'default',
      });
    };

    // Process message in background - response will stream via SSE
    const processInBackground = async () => {
      const abortController = this.cancellationManager.startTask(
        threadId ?? 'default'
      );

      try {
        const agentPoolService = await this.getAgentPoolService();
        const agent = isAgentMode
          ? agentPoolService.getAgent(threadId ?? 'default') // Note: Express uses getWorkflowAgent but AgentPoolService doesn't have it
          : agentPoolService.getCurrentAgent();

        // Note: This will fail because the agent doesn't have processMessage method yet
        // This is expected since agents haven't been ported yet from Express
        // Create a type guard to check if agent has processMessage method
        const hasProcessMessage = (
          obj: unknown
        ): obj is AgentWithProcessMessage => {
          return (
            obj !== null && typeof obj === 'object' && 'processMessage' in obj
          );
        };

        if (!hasProcessMessage(agent)) {
          throw new Error(
            'Agent does not have processMessage method - agents not yet ported from Express'
          );
        }

        const response = await agent.processMessage(
          threadId ?? 'default',
          message,
          {
            images,
            notes,
            onUpdate: streamingCallback,
            userMessageId: messageId,
            signal: abortController.signal, // Pass abort signal for cancellation
          }
        );

        // Persist the final completed message
        await this.conversationService.load();
        await this.conversationService.updateMessage(
          threadId ?? 'default',
          response.id,
          {
            content: response.content,
            status: 'completed',
            model: response.model,
            toolCalls: response.toolCalls,
            toolResults: response.toolResults,
            timestamp: response.timestamp,
          }
        );

        // Send final completion event
        this.sseService.broadcast('unified-events', {
          type: SSEEventType.COMPLETED,
          message: response,
          threadId: threadId ?? 'default',
        });

        // Clean up successful task
        this.cancellationManager.cancelTask(threadId ?? 'default');
      } catch (processingError: unknown) {
        // Clean up failed task
        this.cancellationManager.cancelTask(threadId ?? 'default');

        // Check if this was a cancellation
        if (
          processingError instanceof Error &&
          processingError.name === 'AbortError'
        ) {
          this.sseService.broadcast('unified-events', {
            type: 'cancelled',
            threadId: threadId ?? 'default',
          });
          return;
        }

        // Check if this is a local model not loaded error
        if (
          processingError instanceof Error &&
          processingError.message === 'LOCAL_MODEL_NOT_LOADED'
        ) {
          this.sseService.broadcast('unified-events', {
            type: SSEEventType.LOCAL_MODEL_NOT_LOADED,
            error:
              (processingError as Error & { originalMessage?: string })
                ?.originalMessage ??
              'Model not loaded. Please load the model first.',
            modelId: (processingError as Error & { modelId?: string })?.modelId,
          });
        } else {
          const errorMessage =
            processingError instanceof Error
              ? processingError.message
              : 'Unknown error';
          this.sseService.broadcast('unified-events', {
            type: SSEEventType.ERROR,
            error: errorMessage,
          });
        }
      }
    };

    // Start processing without awaiting
    processInBackground().catch(error => {
      this.logger.error('Background processing error:', error);
    });

    // Return immediately - streaming will happen via SSE
    return { status: 'processing' };
  }

  async streamMessage(dto: CreateMessageDto, res: Response): Promise<void> {
    const { message, messageId, threadId, images, notes, isAgentMode } = dto;

    // Validate input - exactly like Express
    if (!message && (!images || images.length === 0)) {
      res.status(400).json({ error: 'Message or images are required' });
      return;
    }

    // Check if LLM model is configured - exactly like Express
    if (
      !this.currentLlmConfig.model ||
      this.currentLlmConfig.model.trim() === ''
    ) {
      res.status(400).json({
        error:
          'No LLM model configured. Please select a model from the available options.',
      });
      return;
    }

    // Set current thread if provided - exactly like Express
    if (threadId) {
      const agentPoolService = await this.getAgentPoolService();
      await agentPoolService.setCurrentThread(threadId);
    }

    // Generate unique client ID for this streaming session
    const clientId = `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Add client to unified events topic
    this.sseService.addClient(clientId, res, 'unified-events');

    // Persist the user message - exactly like Express
    await this.conversationService.load();
    const userMessage: ConversationMessage = {
      id:
        messageId ??
        `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role: 'user' as const,
      content: message ?? '',
      timestamp: new Date(),
      status: 'completed' as const,
      images: images ?? [],
      notes: notes ?? [],
    };
    await this.conversationService.addMessage(
      threadId ?? 'default',
      userMessage
    );

    // Create a custom streaming callback that sends character-by-character updates
    let assistantMessage: MessageWithTools | null = null;
    let lastContentLength = 0;

    const streamingCallback = async (updatedMessage: MessageWithTools) => {
      // For the first update, create the assistant message
      if (!assistantMessage) {
        assistantMessage = updatedMessage;

        // Persist the new assistant message
        await this.conversationService.load();
        await this.conversationService.addMessage(threadId ?? 'default', {
          id: updatedMessage.id,
          role: 'assistant',
          content: updatedMessage.content,
          timestamp: updatedMessage.timestamp,
          status: updatedMessage.status,
          model: updatedMessage.model,
          toolCalls: updatedMessage.toolCalls,
          toolResults: updatedMessage.toolResults,
          images: updatedMessage.images ?? [],
          notes: updatedMessage.notes ?? [],
        });

        this.sseService.broadcast('unified-events', {
          type: SSEEventType.MESSAGE_UPDATE,
          message: updatedMessage,
        });
        lastContentLength = updatedMessage.content.length;
        return;
      }

      // Check if content has grown (new characters added)
      if (updatedMessage.content.length > lastContentLength) {
        const newContent = updatedMessage.content.slice(lastContentLength);
        if (newContent) {
          // Send the new content as a chunk
          this.sseService.broadcast('unified-events', {
            type: SSEEventType.CONTENT_CHUNK,
            chunk: newContent,
            threadId: threadId ?? 'default',
          });
          lastContentLength = updatedMessage.content.length;
        }
      }

      // Always send the full message update for status changes
      assistantMessage = updatedMessage;

      // Update the persisted message
      await this.conversationService.load();
      await this.conversationService.updateMessage(
        threadId ?? 'default',
        updatedMessage.id,
        {
          content: updatedMessage.content,
          status: updatedMessage.status,
          model: updatedMessage.model,
          toolCalls: updatedMessage.toolCalls,
          toolResults: updatedMessage.toolResults,
          timestamp: updatedMessage.timestamp,
        }
      );

      this.sseService.broadcast('unified-events', {
        type: SSEEventType.MESSAGE_UPDATE,
        message: updatedMessage,
        threadId: threadId ?? 'default',
      });
    };

    try {
      // Get the appropriate agent
      const agentPoolService = await this.getAgentPoolService();
      const agent = isAgentMode
        ? agentPoolService.getAgent(threadId ?? 'default')
        : agentPoolService.getCurrentAgent();

      // Create abort controller for cancellation
      const abortController = this.cancellationManager.startTask(
        threadId ?? 'default'
      );

      // Type guard to check if agent has processMessage method
      const hasProcessMessage = (
        obj: unknown
      ): obj is AgentWithProcessMessage => {
        return (
          obj !== null && typeof obj === 'object' && 'processMessage' in obj
        );
      };

      if (!hasProcessMessage(agent)) {
        throw new Error(
          'Agent does not have processMessage method - agents not yet ported from Express'
        );
      }

      // Use the standard processMessage method with streaming callback
      const response = await agent.processMessage(
        threadId ?? 'default',
        message,
        {
          images,
          notes,
          onUpdate: streamingCallback,
          userMessageId: messageId,
          signal: abortController.signal,
        }
      );

      // Persist the final completed message
      await this.conversationService.load();
      await this.conversationService.updateMessage(
        threadId ?? 'default',
        response.id,
        {
          content: response.content,
          status: 'completed',
          model: response.model,
          toolCalls: response.toolCalls,
          toolResults: response.toolResults,
          timestamp: response.timestamp,
        }
      );

      // Send final completion event
      this.sseService.broadcast('unified-events', {
        type: SSEEventType.COMPLETED,
        message: response,
      });

      // Close the response stream to signal completion to the client
      setTimeout(() => {
        res.end();
        this.sseService.removeClient(clientId);
      }, 100); // Small delay to ensure the completion event is sent
    } catch (processingError: unknown) {
      // Check if this is a local model not loaded error
      if (
        processingError instanceof Error &&
        processingError.message === 'LOCAL_MODEL_NOT_LOADED'
      ) {
        this.sseService.broadcast('unified-events', {
          type: SSEEventType.LOCAL_MODEL_NOT_LOADED,
          error:
            (processingError as Error & { originalMessage?: string })
              ?.originalMessage ??
            'Model not loaded. Please load the model first.',
          modelId: (processingError as Error & { modelId?: string })?.modelId,
        });
      } else {
        const errorMessage =
          processingError instanceof Error
            ? processingError.message
            : 'Unknown error';
        this.sseService.broadcast('unified-events', {
          type: SSEEventType.ERROR,
          error: errorMessage,
        });
      }

      // Close the response stream on error too
      setTimeout(() => {
        res.end();
        this.sseService.removeClient(clientId);
      }, 100);
    }
  }

  async cancelMessage(dto: { messageId: string; threadId: string }) {
    const { messageId, threadId } = dto;

    if (!messageId) {
      throw new BadRequestException('Message ID is required');
    }
    if (!threadId) {
      throw new BadRequestException('Thread ID is required');
    }

    // Cancel the active task for this thread
    const cancelled = this.cancellationManager.cancelTask(threadId);

    if (cancelled) {
      // Also update the message status in conversation manager
      try {
        await this.conversationService.load();
        await this.conversationService.updateMessage(threadId, messageId, {
          status: 'cancelled',
        });

        // Broadcast cancellation event
        this.sseService.broadcast('unified-events', {
          type: 'cancelled',
          threadId: threadId,
          messageId: messageId,
        });
      } catch (error) {
        this.logger.error('Error updating cancelled message:', error);
      }

      return { success: true };
    } else {
      throw new BadRequestException(
        'No active processing found for this thread'
      );
    }
  }

  async deleteMessage(messageId: string) {
    if (!messageId) {
      throw new BadRequestException('Message ID is required');
    }

    try {
      await this.conversationService.load();
      const result =
        (await this.conversationService.deleteMessageFromAllThreads(
          messageId
        )) as {
          deletedMessageIds: string[];
          affectedThreadIds: string[];
        };
      const { deletedMessageIds, affectedThreadIds } = result;

      if (deletedMessageIds.length > 0) {
        await this.conversationService.save();

        // Sync current agent with updated thread history after message deletion
        const agentPoolService = await this.getAgentPoolService();
        for (const threadId of affectedThreadIds) {
          const currentThreadId = agentPoolService.getCurrentThreadId();
          if (threadId === currentThreadId) {
            await agentPoolService.syncCurrentAgentWithThread(threadId);
          }
        }

        // Broadcast update to all clients with ALL deleted message IDs
        this.sseService.broadcast('unified-events', {
          type: 'messages-deleted',
          messageIds: deletedMessageIds,
        });

        return { success: true, deletedMessageIds };
      } else {
        throw new BadRequestException('Message not found');
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error('Error deleting message:', error);
      throw new BadRequestException('Internal server error');
    }
  }

  async loadThread(threadId: string) {
    if (!threadId) {
      throw new BadRequestException('Thread ID is required');
    }

    try {
      // Set the current thread in the agent pool
      const agentPoolService = await this.getAgentPoolService();
      await agentPoolService.setCurrentThread(threadId);

      // Load conversation data
      await this.conversationService.load();
      const conversations =
        this.conversationService.getConversations() as Thread[];
      const thread = conversations.find(t => t.id === threadId);

      if (!thread) {
        // Thread doesn't exist yet, clear any existing conversation
        const currentAgent = agentPoolService.getCurrentAgent();
        // Type guard to check if agent has clearConversation method
        const hasClearConversation = (
          obj: unknown
        ): obj is {
          clearConversation: (threadId: string) => Promise<void>;
        } => {
          return (
            obj !== null &&
            typeof obj === 'object' &&
            'clearConversation' in obj
          );
        };

        if (hasClearConversation(currentAgent)) {
          await currentAgent.clearConversation(threadId);
        }
        return { success: true };
      }

      // Load the thread's messages into the thread-specific agent's conversation context
      const currentAgent = agentPoolService.getCurrentAgent();

      // Type guard to check if agent has loadConversation method
      const hasLoadConversation = (
        obj: unknown
      ): obj is {
        loadConversation: (
          threadId: string,
          messages: unknown[]
        ) => Promise<void>;
        updatePrompt: (threadId: string, prompt?: string) => Promise<void>;
      } => {
        return (
          obj !== null &&
          typeof obj === 'object' &&
          'loadConversation' in obj &&
          'updatePrompt' in obj
        );
      };

      if (hasLoadConversation(currentAgent)) {
        await currentAgent.loadConversation(threadId, thread.messages);

        // Set the custom prompt if it exists in the thread
        if (thread.customPrompt) {
          await currentAgent.updatePrompt(threadId, thread.customPrompt);
        } else {
          await currentAgent.updatePrompt(threadId, undefined);
        }
      }

      return { success: true };
    } catch (error) {
      this.logger.error('Error loading thread:', error);
      throw new BadRequestException('Failed to load thread');
    }
  }

  getCancellationManager(): MessageCancellationManager {
    return this.cancellationManager;
  }

  // For testing purposes - allows setting LLM config
  setCurrentLlmConfig(config: Partial<CurrentLlmConfig>): void {
    Object.assign(this.currentLlmConfig, config);
  }
}
