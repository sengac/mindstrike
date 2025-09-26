import {
  Controller,
  Get,
  Post,
  Param,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { ConversationService } from './services/conversation.service';
import { AgentPoolService } from '../agents/services/agent-pool.service';

@ApiTags('chat')
@Controller('api/conversation')
export class ConversationController {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly agentPoolService: AgentPoolService
  ) {}

  @Get(':threadId')
  @ApiOperation({ summary: 'Get conversation by thread ID' })
  @ApiParam({ name: 'threadId', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Conversation retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          role: { type: 'string' },
          content: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Thread ID is required' })
  @ApiResponse({ status: 500, description: 'Failed to get conversation' })
  async getConversation(@Param('threadId') threadId: string) {
    if (!threadId) {
      throw new BadRequestException('Thread ID is required');
    }

    // Temporarily set the thread to get its conversation
    const previousThreadId = this.agentPoolService.getCurrentThreadId();
    try {
      await this.agentPoolService.setCurrentThread(threadId);
      const agent = this.agentPoolService.getCurrentAgent();

      // Check if getConversation method exists
      if (typeof agent.getConversation !== 'function') {
        throw new Error('getConversation method not implemented');
      }

      const conversation = agent.getConversation(threadId);

      return conversation;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to get conversation';
      throw new InternalServerErrorException(errorMessage);
    } finally {
      // Always restore the previous thread
      await this.agentPoolService.setCurrentThread(previousThreadId);
    }
  }

  @Post(':threadId/clear')
  @ApiOperation({ summary: 'Clear conversation for a thread' })
  @ApiParam({ name: 'threadId', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Conversation cleared successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Thread ID is required' })
  async clearConversation(@Param('threadId') threadId: string) {
    if (!threadId) {
      throw new BadRequestException('Thread ID is required');
    }

    // Temporarily set the thread to clear its conversation
    const previousThreadId = this.agentPoolService.getCurrentThreadId();
    await this.agentPoolService.setCurrentThread(threadId);
    await this.agentPoolService.getCurrentAgent().clearConversation(threadId);

    // Restore the previous thread
    await this.agentPoolService.setCurrentThread(previousThreadId);

    return { success: true };
  }
}
