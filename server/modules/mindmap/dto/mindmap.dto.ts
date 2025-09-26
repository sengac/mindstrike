import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  IsOptional,
  IsObject,
  IsArray,
  IsNumber,
} from 'class-validator';

export class CreateMindmapDto {
  @ApiProperty({ description: 'Mindmap title', type: String })
  @IsString()
  title: string;

  @ApiPropertyOptional({
    description: 'Initial nodes',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        type: { type: 'string' },
        data: { type: 'object', additionalProperties: true },
        position: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
          },
          additionalProperties: false,
        },
      },
    },
  })
  @IsOptional()
  @IsArray()
  nodes?: Array<{
    id: string;
    type?: string;
    data: Record<string, unknown>;
    position?: { x: number; y: number };
  }>;

  @ApiPropertyOptional({
    description: 'Initial edges',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        source: { type: 'string' },
        target: { type: 'string' },
        type: { type: 'string' },
        data: { type: 'object', additionalProperties: true },
      },
    },
  })
  @IsOptional()
  @IsArray()
  edges?: Array<{
    id: string;
    source: string;
    target: string;
    type?: string;
    data?: Record<string, unknown>;
  }>;

  @ApiPropertyOptional({
    description: 'Mindmap metadata',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateMindmapDto {
  @ApiPropertyOptional({
    description: 'Updated nodes',
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  @IsOptional()
  @IsArray()
  nodes?: Array<Record<string, unknown>>;

  @ApiPropertyOptional({
    description: 'Updated edges',
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  @IsOptional()
  @IsArray()
  edges?: Array<Record<string, unknown>>;

  @ApiPropertyOptional({
    description: 'Updated metadata',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class IterateMindmapDto {
  @ApiProperty({ description: 'Iteration prompt or context', type: String })
  @IsString()
  prompt: string;

  @ApiPropertyOptional({ description: 'Target node ID', type: String })
  @IsOptional()
  @IsString()
  nodeId?: string;

  @ApiPropertyOptional({
    description: 'Iteration parameters',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  parameters?: Record<string, unknown>;
}

export class GenerateMindmapDto {
  @ApiProperty({ description: 'Generation prompt', type: String })
  @IsString()
  prompt: string;

  @ApiPropertyOptional({ description: 'Generation style', type: String })
  @IsOptional()
  @IsString()
  style?: string;

  @ApiPropertyOptional({ description: 'Max nodes to generate', type: Number })
  @IsOptional()
  @IsNumber()
  maxNodes?: number;
}
