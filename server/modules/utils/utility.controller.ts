import { Controller, Post, Body, HttpStatus, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import {
  GenerateTitleDto,
  GeneratePromptDto,
} from '../chat/dto/create-message.dto';
import { ChatService } from '../chat/chat.service';

@ApiTags('utility')
@Controller('api')
export class UtilityController {
  constructor(private readonly chatService: ChatService) {}

  @Post('generate-title')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate a title for a conversation' })
  @ApiBody({ type: GenerateTitleDto })
  @ApiResponse({
    status: 200,
    description: 'Title generated successfully',
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async generateTitle(@Body() dto: GenerateTitleDto) {
    const title = await this.chatService.generateTitle(dto.context);
    return { title };
  }

  @Post('generate-prompt')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate a prompt based on context' })
  @ApiBody({ type: GeneratePromptDto })
  @ApiResponse({
    status: 200,
    description: 'Prompt generated successfully',
    schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        metadata: { type: 'object' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async generatePrompt(@Body() dto: GeneratePromptDto) {
    const prompt = await this.chatService.generatePrompt(dto.context, dto.type);
    return {
      prompt,
      metadata: {},
    };
  }
}
