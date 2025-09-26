import { Controller, Get, Res, Req } from '@nestjs/common';
import type { Response, Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { EventsService } from './events.service';
import { SseService } from './services/sse.service';

@ApiTags('events')
@Controller('api')
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly sseService: SseService
  ) {}

  @Get('events/stream')
  @ApiOperation({ summary: 'Server-sent events stream' })
  @ApiResponse({
    status: 200,
    description: 'SSE stream established',
    content: {
      'text/event-stream': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async streamEvents(@Req() req: Request, @Res() res: Response) {
    const clientId = `events-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.sseService.addClient(clientId, res, 'unified-events');

    // Send a test event after connection to verify it's working
    setTimeout(() => {
      this.sseService.broadcast('unified-events', {
        type: 'connection-test',
        message: 'Unified SSE connection working',
        timestamp: Date.now(),
      });
    }, 100);
  }

  @Get('debug/stream')
  @ApiOperation({ summary: 'Debug SSE stream' })
  @ApiResponse({
    status: 200,
    description: 'Debug SSE stream',
    content: {
      'text/event-stream': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async debugStream(@Req() req: Request, @Res() res: Response) {
    const clientId = `debug_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.sseService.addClient(clientId, res, 'debug');
  }
}
