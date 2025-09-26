import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Res,
  HttpStatus,
  HttpCode,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ModelScanService } from './model-scan.service';
import { ModelSearchDto, StartScanDto } from './dto/model-scan.dto';

@ApiTags('model-scan')
@Controller('api/model-scan')
export class ModelScanController {
  constructor(private readonly modelScanService: ModelScanService) {}

  @Get('progress')
  @ApiOperation({ summary: 'SSE endpoint for real-time scan progress updates' })
  @ApiResponse({
    status: 200,
    description: 'SSE stream established',
  })
  async getProgress(@Res() res: Response) {
    const clientId = `scan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.modelScanService.addProgressClient(clientId, res);
    return;
  }

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start a new model search' })
  @ApiBody({ type: ModelSearchDto })
  @ApiResponse({
    status: 200,
    description: 'Search started successfully',
    schema: {
      type: 'object',
      properties: {
        searchId: { type: 'string' },
        message: { type: 'string' },
      },
    },
  })
  async searchModels(@Body() searchParams: ModelSearchDto) {
    try {
      const searchId = await this.modelScanService.startSearch(searchParams);
      return {
        searchId,
        message: 'Model search started',
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(
        `Failed to start search: ${errorMessage}`
      );
    }
  }

  @Post('start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start a new model scan' })
  @ApiBody({ type: StartScanDto })
  @ApiResponse({
    status: 200,
    description: 'Scan started successfully',
    schema: {
      type: 'object',
      properties: {
        scanId: { type: 'string' },
        message: { type: 'string' },
      },
    },
  })
  async startScan(@Body() scanParams: StartScanDto) {
    try {
      const scanId = await this.modelScanService.startScan(scanParams);
      return {
        scanId,
        message: 'Model scan started',
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(
        `Failed to start scan: ${errorMessage}`
      );
    }
  }

  @Post('cancel/:scanId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an active model scan' })
  @ApiParam({ name: 'scanId', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Scan cancelled successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Scan session not found' })
  @ApiResponse({ status: 400, description: 'Scan is not currently running' })
  async cancelScan(@Param('scanId') scanId: string) {
    try {
      const result = await this.modelScanService.cancelScan(scanId);
      if (!result) {
        throw new NotFoundException('Scan session not found');
      }
      return { message: 'Scan cancelled successfully' };
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      if (
        error instanceof Error &&
        error.message.includes('not currently running')
      ) {
        throw new BadRequestException('Scan is not currently running');
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(
        `Failed to cancel scan: ${errorMessage}`
      );
    }
  }

  @Get('status/:scanId')
  @ApiOperation({ summary: 'Get status of a specific scan' })
  @ApiParam({ name: 'scanId', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Scan status retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        scanId: { type: 'string' },
        status: {
          type: 'string',
          enum: ['running', 'completed', 'cancelled', 'error'],
        },
        startTime: { type: 'number' },
        duration: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Scan not found' })
  async getScanStatus(@Param('scanId') scanId: string) {
    try {
      const status = await this.modelScanService.getScanStatus(scanId);
      if (!status) {
        throw new NotFoundException('Scan not found');
      }
      return status;
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(
        `Failed to get scan status: ${errorMessage}`
      );
    }
  }
}
