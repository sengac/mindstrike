/**
 * Health Controller
 *
 * Provides health check endpoint for CLI and monitoring
 */

import { Controller, Get, Logger } from '@nestjs/common';

interface HealthResponseDto {
  status: string;
  timestamp: number;
  uptime: number;
}

@Controller('api')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);
  private readonly startTime = Date.now();

  @Get('health')
  getHealth(): HealthResponseDto {
    return {
      status: 'ok',
      timestamp: Date.now(),
      uptime: Date.now() - this.startTime,
    };
  }
}
