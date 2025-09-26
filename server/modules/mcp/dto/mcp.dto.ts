import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsObject,
  IsBoolean,
  IsArray,
  IsUrl,
} from 'class-validator';

export class CreateMcpServerDto {
  @ApiProperty({ description: 'Server name', type: String })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Server command', type: String })
  @IsString()
  command: string;

  @ApiPropertyOptional({
    description: 'Command arguments',
    type: 'array',
    items: { type: 'string' },
  })
  @IsOptional()
  @IsArray()
  args?: string[];

  @ApiPropertyOptional({
    description: 'Environment variables',
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  @IsOptional()
  @IsObject()
  env?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Server enabled', type: Boolean })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateMcpServerDto {
  @ApiPropertyOptional({ description: 'Updated server name', type: String })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Updated command', type: String })
  @IsOptional()
  @IsString()
  command?: string;

  @ApiPropertyOptional({
    description: 'Updated arguments',
    type: 'array',
    items: { type: 'string' },
  })
  @IsOptional()
  @IsArray()
  args?: string[];

  @ApiPropertyOptional({
    description: 'Updated environment variables',
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  @IsOptional()
  @IsObject()
  env?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Server enabled status', type: Boolean })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class McpConfigDto {
  @ApiProperty({
    description: 'MCP configuration',
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  config: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Validate configuration', type: Boolean })
  @IsOptional()
  @IsBoolean()
  validate?: boolean;
}
