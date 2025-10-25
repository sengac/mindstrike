/**
 * CLI Controller
 *
 * HTTP endpoints for CLI commands
 */

import { Controller, Post, Get, Body, Logger } from '@nestjs/common';
import { CliService } from './services/cli.service';
import {
  SelectNodeDto,
  type SelectNodeResponseDto,
  CreateNodeDto,
  type CreateNodeResponseDto,
  type GetMindmapResponseDto,
  SendMessageDto,
  type SendMessageResponseDto,
} from './dto/cli.dto';

@Controller('api/cli')
export class CliController {
  private readonly logger = new Logger(CliController.name);

  constructor(private readonly cliService: CliService) {}

  @Post('mindmap/select-node')
  async selectNode(@Body() dto: SelectNodeDto): Promise<SelectNodeResponseDto> {
    this.logger.log(`POST /api/cli/mindmap/select-node: ${dto.nodeId}`);
    return this.cliService.selectNode(dto.nodeId);
  }

  @Post('mindmap/create-node')
  async createNode(@Body() dto: CreateNodeDto): Promise<CreateNodeResponseDto> {
    this.logger.log(`POST /api/cli/mindmap/create-node: ${dto.label}`);
    return this.cliService.createNode(dto.label, dto.parentId);
  }

  @Get('mindmap/query')
  async getMindmap(): Promise<GetMindmapResponseDto> {
    this.logger.log('GET /api/cli/mindmap/query');
    return this.cliService.getMindmap();
  }

  @Post('chat/send-message')
  async sendMessage(
    @Body() dto: SendMessageDto
  ): Promise<SendMessageResponseDto> {
    this.logger.log(
      `POST /api/cli/chat/send-message: ${dto.message.substring(0, 50)}...`
    );
    return this.cliService.sendMessage(dto.message, dto.clientId);
  }
}
