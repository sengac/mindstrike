import {
  Controller,
  Get,
  Post,
  Body,
  HttpStatus,
  HttpCode,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { SetMusicRootDto } from './dto/music.dto';
import { MusicService } from './music.service';

@ApiTags('music')
@Controller('api/music')
export class MusicController {
  constructor(private readonly musicService: MusicService) {}

  @Get('root')
  @ApiOperation({ summary: 'Get music root directory' })
  @ApiResponse({
    status: 200,
    description: 'Music root path',
    schema: {
      type: 'object',
      properties: {
        musicRoot: { type: 'string' },
      },
    },
  })
  async getMusicRoot() {
    try {
      const musicRootInfo = await this.musicService.getMusicRoot();
      return {
        musicRoot: musicRootInfo.root,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(errorMessage);
    }
  }

  @Post('root')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set music root directory' })
  @ApiBody({ type: SetMusicRootDto })
  @ApiResponse({
    status: 200,
    description: 'Music root set successfully',
    schema: {
      type: 'object',
      properties: {
        musicRoot: { type: 'string' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid directory path' })
  async setMusicRoot(@Body() dto: SetMusicRootDto) {
    try {
      if (!dto.path) {
        throw new BadRequestException('Path is required');
      }

      const result = await this.musicService.setMusicRoot(dto.path);
      return result;
    } catch (error: unknown) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new Error('Failed to set music root');
    }
  }
}
