import {
  Controller,
  Post,
  Delete,
  Body,
  Param,
  HttpStatus,
  HttpCode,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import {
  CreateMessageDto,
  StreamMessageDto,
  CancelMessageDto,
  LoadThreadDto,
} from './dto/create-message.dto';
import { ChatService } from './chat.service';
import { MessageService } from './services/message.service';

@ApiTags('chat')
@Controller('api')
export class MessageController {
  constructor(
    private readonly chatService: ChatService,
    private readonly messageService: MessageService
  ) {}

  @Post('message')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a message' })
  @ApiBody({ type: CreateMessageDto })
  @ApiResponse({
    status: 200,
    description: 'Message processing started',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'processing' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async sendMessage(@Body() dto: CreateMessageDto) {
    return this.messageService.processMessage(dto);
  }

  @Post('message/stream')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stream a message response' })
  @ApiBody({ type: StreamMessageDto })
  @ApiResponse({
    status: 200,
    description: 'Streaming response',
    content: {
      'text/event-stream': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async streamMessage(@Body() dto: StreamMessageDto, @Res() res: Response) {
    return this.messageService.streamMessage(dto, res);
  }

  @Post('message/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an ongoing message' })
  @ApiBody({ type: CancelMessageDto })
  @ApiResponse({ status: 200, description: 'Message cancelled successfully' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  async cancelMessage(@Body() dto: CancelMessageDto) {
    return this.messageService.cancelMessage(dto);
  }

  @Delete('message/:messageId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a message' })
  @ApiParam({ name: 'messageId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Message deleted successfully' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  async deleteMessage(@Param('messageId') messageId: string) {
    return this.messageService.deleteMessage(messageId);
  }

  @Post('load-thread/:threadId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Load thread messages' })
  @ApiParam({ name: 'threadId', type: 'string', format: 'uuid' })
  @ApiBody({ type: LoadThreadDto, required: false })
  @ApiResponse({
    status: 200,
    description: 'Thread loaded successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  })
  async loadThread(
    @Param('threadId') threadId: string,
    @Body() dto?: LoadThreadDto
  ) {
    // dto parameter is for API compatibility but not used in implementation
    return this.messageService.loadThread(threadId);
  }
}
