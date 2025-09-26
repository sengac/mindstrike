import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { ContentService } from './content.service';
import { SseService } from '../events/services/sse.service';

@ApiTags('content')
@Controller('api')
export class ContentController {
  constructor(
    private readonly contentService: ContentService,
    private readonly sseService: SseService
  ) {}

  @Get('large-content/:contentId')
  @ApiOperation({ summary: 'Get large content by ID' })
  @ApiParam({ name: 'contentId', type: 'string', description: 'Content ID' })
  @ApiResponse({
    status: 200,
    description: 'Large content data',
    schema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Content not found' })
  async getLargeContent(@Param('contentId') contentId: string) {
    const content = this.sseService.getLargeContent(contentId);
    if (content) {
      return { content };
    } else {
      throw new NotFoundException('Content not found');
    }
  }
}
