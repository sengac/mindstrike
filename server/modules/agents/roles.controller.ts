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
  @ApiOperation({ summary: 'Get default prompt configuration' })
  @ApiResponse({
    status: 200,
    description: 'Default prompt configuration',
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
  async getDefaultPrompt() {
    return this.getPrompt('default');
  }

  @Get(':threadId')
  @ApiOperation({ summary: 'Get prompt for specific thread' })
  @ApiParam({ name: 'threadId', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Thread prompt configuration',
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
  async getThreadPrompt(@Param('threadId') threadId: string) {
    return this.getPrompt(threadId);
  }

  private async getPrompt(threadId: string) {
    try {
      const agent = this.agentPoolService.getAgent(threadId);
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
  @ApiOperation({ summary: 'Set default prompt configuration' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        customPrompt: { type: 'string', nullable: true },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Default prompt set successfully' })
  async setDefaultPrompt(@Body() body: { customPrompt?: string }) {
    return this.setPrompt('default', body.customPrompt);
  }

  @Post(':threadId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set prompt for specific thread' })
  @ApiParam({ name: 'threadId', type: 'string' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        customPrompt: { type: 'string', nullable: true },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Thread prompt set successfully' })
  @ApiResponse({ status: 500, description: 'Error updating prompt' })
  async setThreadPrompt(
    @Param('threadId') threadId: string,
    @Body() body: { customPrompt?: string }
  ) {
    return this.setPrompt(threadId, body.customPrompt);
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
      const agent = this.agentPoolService.getAgent(threadId);
      await agent.updatePrompt(threadId, customPrompt);

      return { success: true };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(errorMessage);
    }
  }
}
