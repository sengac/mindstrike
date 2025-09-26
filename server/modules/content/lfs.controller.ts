import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { LfsService } from './services/lfs.service';

@ApiTags('lfs')
@Controller('api/lfs')
export class LfsController {
  constructor(private readonly lfsService: LfsService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get LFS statistics' })
  @ApiResponse({
    status: 200,
    description: 'LFS statistics',
    schema: {
      type: 'object',
      properties: {
        totalSize: { type: 'number' },
        fileCount: { type: 'number' },
        cacheHits: { type: 'number' },
        cacheMisses: { type: 'number' },
      },
    },
  })
  async getLfsStats() {
    const stats = this.lfsService.getStats();
    return {
      totalSize: stats.memoryUsage,
      fileCount: stats.totalItems,
      cacheHits: stats.memoryItems,
      cacheMisses: stats.diskItems,
    };
  }

  @Get(':lfsId')
  @ApiOperation({ summary: 'Get LFS content by ID' })
  @ApiParam({ name: 'lfsId', type: 'string', description: 'LFS content ID' })
  @ApiResponse({
    status: 200,
    description: 'LFS content',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        content: { type: 'string' },
        size: { type: 'number' },
        hash: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'LFS content not found' })
  async getLfsContent(@Param('lfsId') lfsId: string) {
    const reference = `lfs://${lfsId}`;
    const content = this.lfsService.retrieveContent(reference);

    if (!content) {
      throw new NotFoundException(`LFS content with ID ${lfsId} not found`);
    }

    return {
      id: lfsId,
      content,
      size: content.length,
      hash: lfsId.split('_')[0] || '',
    };
  }

  @Get(':lfsId/summary')
  @ApiOperation({ summary: 'Get LFS content summary' })
  @ApiParam({ name: 'lfsId', type: 'string', description: 'LFS content ID' })
  @ApiResponse({
    status: 200,
    description: 'LFS content summary',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        type: { type: 'string' },
        preview: { type: 'string' },
        metadata: { type: 'object' },
      },
    },
  })
  async getLfsSummary(@Param('lfsId') lfsId: string) {
    const reference = `lfs://${lfsId}`;
    const summary = this.lfsService.getSummaryByReference(reference);

    if (!summary) {
      throw new NotFoundException(`LFS summary with ID ${lfsId} not found`);
    }

    return {
      id: lfsId,
      type: 'text',
      preview: summary.summary.substring(0, 200),
      metadata: {
        originalSize: summary.originalSize,
        keyPoints: summary.keyPoints || [],
        summaryLength: summary.summary.length,
      },
    };
  }
}
