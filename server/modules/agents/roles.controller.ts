import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpStatus,
  HttpCode,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { AgentPoolService } from './services/agent-pool.service';

@ApiTags('agents')
@Controller('api/role')
export class RolesController {
  private threadPrompts: Map<string, string> = new Map();

  constructor(private readonly agentPoolService: AgentPoolService) {}

  @Get()
  @ApiOperation({ summary: 'Get prompt configuration (default)' })
  @ApiResponse({
    status: 200,
    description: 'Prompt configuration',
    schema: {
      type: 'object',
      properties: {
        currentPrompt: { type: 'string' },
        defaultPrompt: { type: 'string' },
        isDefault: { type: 'boolean' },
        hasCustomPrompt: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 500, description: 'Error getting prompt' })
  async getPromptHandlerDefault() {
    return this.getPrompt('default');
  }

  @Get(':threadId')
  @ApiOperation({ summary: 'Get prompt configuration for thread' })
  @ApiParam({ name: 'threadId', type: 'string', required: true })
  @ApiResponse({
    status: 200,
    description: 'Prompt configuration',
    schema: {
      type: 'object',
      properties: {
        currentPrompt: { type: 'string' },
        defaultPrompt: { type: 'string' },
        isDefault: { type: 'boolean' },
        hasCustomPrompt: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 500, description: 'Error getting prompt' })
  async getPromptHandlerWithThread(@Param('threadId') threadId: string) {
    const effectiveThreadId =
      threadId && threadId.trim() !== '' ? threadId : 'default';
    return this.getPrompt(effectiveThreadId);
  }

  private async getPrompt(threadId: string) {
    try {
      const agent = await this.agentPoolService.getAgent(threadId);
      const currentPrompt = agent.getCurrentPrompt();
      const defaultPrompt = agent.getDefaultPrompt();

      return {
        currentPrompt,
        defaultPrompt,
        isDefault: currentPrompt === defaultPrompt,
        hasCustomPrompt: this.threadPrompts.has(threadId),
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(errorMessage);
    }
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set prompt configuration (default)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        customPrompt: { type: 'string', nullable: true },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Prompt set successfully' })
  @ApiResponse({ status: 500, description: 'Error updating prompt' })
  async setPromptHandlerDefault(@Body() body: { customPrompt?: string }) {
    return this.setPrompt('default', body.customPrompt);
  }

  @Post(':threadId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set prompt configuration for thread' })
  @ApiParam({ name: 'threadId', type: 'string', required: true })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        customPrompt: { type: 'string', nullable: true },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Prompt set successfully' })
  @ApiResponse({ status: 500, description: 'Error updating prompt' })
  async setPromptHandlerWithThread(
    @Param('threadId') threadId: string,
    @Body() body: { customPrompt?: string }
  ) {
    const effectiveThreadId =
      threadId && threadId.trim() !== '' ? threadId : 'default';
    return this.setPrompt(effectiveThreadId, body.customPrompt);
  }

  private async setPrompt(threadId: string, customPrompt?: string) {
    try {
      // Store the custom prompt for the thread
      if (customPrompt) {
        this.threadPrompts.set(threadId, customPrompt);
      } else {
        this.threadPrompts.delete(threadId);
      }

      // Update the agent's prompt
      const agent = await this.agentPoolService.getAgent(threadId);
      await agent.updatePrompt(threadId, customPrompt);

      return { success: true };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(errorMessage);
    }
  }
}
