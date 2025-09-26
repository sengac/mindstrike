import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { TasksService } from './tasks.service';

@ApiTags('tasks')
@Controller('api/tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

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
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Send initial connection
    res.write(`event: connected\n`);
    res.write(
      `data: {"workflowId": "${workflowId}", "status": "connected"}\n\n`
    );

    // Stubbed - would subscribe to actual task updates
    const mockUpdate = () => {
      res.write(`event: task-update\n`);
      res.write(
        `data: {"workflowId": "${workflowId}", "progress": 50, "status": "running"}\n\n`
      );
    };

    // Send a mock update after 1 second
    const timeout = setTimeout(mockUpdate, 1000);

    // Clean up on disconnect
    res.on('close', () => {
      clearTimeout(timeout);
      res.end();
    });
  }
}
