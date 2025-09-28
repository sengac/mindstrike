import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNotEmpty, IsObject } from 'class-validator';
import { Transform } from 'class-transformer';

export class ModelSearchDto {
  @ApiProperty({ description: 'Search query string' })
  @IsString()
  @IsNotEmpty()
  query: string;

  @ApiProperty({
    description: 'Type of search to perform',
    default: 'all',
  })
  @Transform(({ value }) => value || 'all')
  @IsString()
  searchType: string;

  @ApiPropertyOptional({
    description: 'Additional search filters',
    type: 'object',
  })
  @IsObject()
  @IsOptional()
  filters?: Record<string, unknown>;
}

export class StartScanDto {
  @ApiPropertyOptional({ description: 'Optional scan configuration' })
  @IsOptional()
  config?: Record<string, unknown>;
}

export class ScanProgressDto {
  @ApiProperty({ description: 'Current scan stage' })
  stage: string;

  @ApiProperty({ description: 'Progress message' })
  message: string;

  @ApiPropertyOptional({ description: 'Progress percentage (0-100)' })
  progress?: number;

  @ApiPropertyOptional({ description: 'Current item being processed' })
  currentItem?: string;

  @ApiPropertyOptional({ description: 'Total number of items' })
  totalItems?: number;

  @ApiPropertyOptional({ description: 'Number of completed items' })
  completedItems?: number;

  @ApiPropertyOptional({ description: 'Operation type' })
  operationType?: 'scan' | 'search';

  @ApiPropertyOptional({ description: 'Error message if applicable' })
  error?: string;

  @ApiPropertyOptional({ description: 'Results if completed' })
  results?: unknown[];
}

export class ScanStatusDto {
  @ApiProperty({ description: 'Scan ID' })
  scanId: string;

  @ApiProperty({
    description: 'Current scan status',
    enum: ['running', 'completed', 'cancelled', 'error'],
  })
  status: 'running' | 'completed' | 'cancelled' | 'error';

  @ApiProperty({ description: 'Start time as Unix timestamp' })
  startTime: number;

  @ApiProperty({ description: 'Duration in milliseconds' })
  duration: number;
}
