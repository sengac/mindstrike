import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpStatus,
  HttpCode,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { CreateThreadDto, UpdateThreadDto } from './dto/thread.dto';
import { AgentsService } from './agents.service';
import { ConversationService } from '../chat/services/conversation.service';

@ApiTags('agents')
@Controller('api/threads')
export class ThreadsController {
  constructor(
    private readonly agentsService: AgentsService,
    @Inject(ConversationService)
    private readonly conversationService: ConversationService
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all threads' })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Filter by thread type',
  })
  @ApiQuery({ name: 'limit', required: false, type: 'number' })
  @ApiQuery({ name: 'offset', required: false, type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'List of threads',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          type: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  })
  async getAllThreads(
    @Query('type') _type?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number
  ) {
    if (!this.conversationService) {
      return [];
    }
    const threads = this.conversationService.getThreadList();

    // Apply filtering and pagination
    let result = threads;
    if (offset !== undefined) {
      result = result.slice(offset);
    }
    if (limit !== undefined) {
      result = result.slice(0, limit);
    }

    return result.map(thread => ({
      id: thread.id,
      title: thread.name,
      type: 'chat',
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      messageCount: thread.messageCount,
    }));
  }

  @Get(':threadId')
  @ApiOperation({ summary: 'Get thread by ID' })
  @ApiParam({ name: 'threadId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Thread details',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        type: { type: 'string' },
        metadata: { type: 'object' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Thread not found' })
  async getThread(@Param('threadId') threadId: string) {
    const thread = this.conversationService.getThread(threadId);

    if (!thread) {
      throw new NotFoundException(`Thread ${threadId} not found`);
    }

    return {
      id: thread.id,
      title: thread.name,
      type: 'chat',
      metadata: {
        customPrompt: thread.customPrompt,
        messageCount: thread.messages.length,
      },
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new thread' })
  @ApiBody({ type: CreateThreadDto })
  @ApiResponse({
    status: 201,
    description: 'Thread created successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        type: { type: 'string' },
      },
    },
  })
  async createThread(@Body() dto: CreateThreadDto) {
    const thread = await this.conversationService.createThread(dto.title);

    // Update with metadata if provided
    if (dto.metadata?.customPrompt) {
      await this.conversationService.updateThreadPrompt(
        thread.id,
        dto.metadata.customPrompt as string
      );
    }

    return {
      id: thread.id,
      title: thread.name,
      type: dto.type || 'chat',
    };
  }

  @Put(':threadId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a thread' })
  @ApiParam({ name: 'threadId', type: 'string', format: 'uuid' })
  @ApiBody({ type: UpdateThreadDto })
  @ApiResponse({ status: 200, description: 'Thread updated successfully' })
  @ApiResponse({ status: 404, description: 'Thread not found' })
  async updateThread(
    @Param('threadId') threadId: string,
    @Body() dto: UpdateThreadDto
  ) {
    await this.conversationService.load();

    if (dto.title !== undefined) {
      await this.conversationService.renameThread(threadId, dto.title);
    }
    if ('customPrompt' in dto.metadata) {
      await this.conversationService.updateThreadPrompt(
        threadId,
        dto.metadata.customPrompt as string
      );
    }

    return { success: true };
  }

  @Delete(':threadId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a thread' })
  @ApiParam({ name: 'threadId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Thread deleted successfully' })
  @ApiResponse({ status: 404, description: 'Thread not found' })
  async deleteThread(@Param('threadId') threadId: string) {
    await Promise.race([
      this.conversationService.load(),
      new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error('Conversation manager load timeout in delete thread')
            ),
          3000
        )
      ),
    ]);

    const deleted = await this.conversationService.deleteThread(threadId);
    if (deleted) {
      return { success: true };
    } else {
      throw new NotFoundException(`Thread ${threadId} not found`);
    }
  }

  @Post(':threadId/fork')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Fork a thread' })
  @ApiParam({ name: 'threadId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 201,
    description: 'Thread forked successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        originalId: { type: 'string' },
        title: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Thread not found' })
  async forkThread(@Param('threadId') threadId: string) {
    // TODO: Implement fork functionality when available in ConversationService
    // This functionality doesn't exist in the Express server yet
    return {
      id: 'thread_fork_stub',
      originalId: threadId,
      title: 'Forked Thread',
    };
  }

  @Post(':threadId/clear')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear all messages in a thread' })
  @ApiParam({ name: 'threadId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Thread cleared successfully' })
  @ApiResponse({ status: 404, description: 'Thread not found' })
  async clearThread(@Param('threadId') threadId: string) {
    await this.conversationService.load();
    const cleared = await this.conversationService.clearThread(threadId);
    if (cleared) {
      return { success: true };
    } else {
      throw new NotFoundException(`Thread ${threadId} not found`);
    }
  }
}
