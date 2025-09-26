import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SystemService } from './system.service';

@ApiTags('system')
@Controller('api')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('system/info')
  @ApiOperation({ summary: 'Get system information' })
  @ApiResponse({
    status: 200,
    description: 'System information',
    schema: {
      type: 'object',
      properties: {
        hasGpu: { type: 'boolean' },
        gpuType: { type: 'string', nullable: true },
        vramState: {
          type: 'object',
          nullable: true,
          properties: {
            total: { type: 'number' },
            used: { type: 'number' },
            free: { type: 'number' },
          },
        },
        totalRAM: { type: 'number' },
        freeRAM: { type: 'number' },
        cpuThreads: { type: 'number' },
        diskSpace: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            free: { type: 'number' },
            used: { type: 'number' },
          },
        },
        lastUpdated: { type: 'number' },
      },
    },
  })
  async getSystemInfo() {
    return this.systemService.getSystemInfo();
  }
}
