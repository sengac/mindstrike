import { Controller, Get, Param, Res, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { SseService } from '../events/services/sse.service';

@ApiTags('tasks')
@Controller('api/tasks')
export class TasksController {
  private readonly logger = new Logger(TasksController.name);
  private static clientCounter = 0;

  constructor(
    private readonly tasksService: TasksService,
    private readonly sseService: SseService
  ) {}

  @Get('stream/:workflowId')
  @ApiOperation({ summary: 'SSE stream for task progress updates' })
  @ApiParam({
    name: 'workflowId',
    type: 'string',
    description: 'Workflow ID to track',
  })
  @ApiResponse({
    status: 200,
    description: 'Task SSE stream established',
    content: {
      'text/event-stream': {
        schema: {
          type: 'string',
          format: 'binary',
          description: 'Server-sent events stream for task updates',
        },
      },
    },
  })
  async streamTaskUpdates(
    @Param('workflowId') workflowId: string,
    @Res() res: Response
  ) {
    const clientId = `task-${workflowId}-${Date.now()}-${++TasksController.clientCounter}`;
    const topic = `tasks-${workflowId}`;

    this.logger.log('Task SSE client connected', {
      clientId,
      workflowId,
      topic,
    });

    try {
      this.sseService.addClient(clientId, res, topic);
    } catch (error) {
      this.logger.error('Failed to add task SSE client:', error);
      res.status(500).json({ error: 'Failed to establish SSE connection' });
    }
  }
}
