import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  IsOptional,
  IsObject,
  IsEnum,
} from 'class-validator';

export enum ThreadType {
  CHAT = 'chat',
  MINDMAP = 'mindmap',
  WORKFLOW = 'workflow',
}

export class CreateThreadDto {
  @ApiProperty({ description: 'Thread title', type: String })
  @IsString()
  title: string;

  @ApiPropertyOptional({
    description: 'Thread type',
    enum: ThreadType,
    type: String,
  })
  @IsOptional()
  @IsEnum(ThreadType)
  type?: ThreadType;

  @ApiPropertyOptional({
    description: 'Initial metadata',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateThreadDto {
  @ApiPropertyOptional({ description: 'Updated title', type: String })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    description: 'Updated metadata',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class SetRoleDto {
  @ApiProperty({ description: 'Role/system prompt', type: String })
  @IsString()
  role: string;

  @ApiPropertyOptional({
    description: 'Role configuration',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
