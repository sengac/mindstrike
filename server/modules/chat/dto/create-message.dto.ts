import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  IsOptional,
  IsObject,
  IsArray,
  IsNumber,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import type {
  ImageAttachment,
  NotesAttachment,
} from '../types/conversation.types';

export class CreateMessageDto {
  @ApiPropertyOptional({ description: 'The message content', type: String })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({
    description: 'Unique message identifier',
    type: String,
  })
  @IsOptional()
  @IsString()
  messageId?: string;

  @ApiPropertyOptional({
    description: 'Thread ID for the conversation',
    type: String,
  })
  @IsOptional()
  @IsString()
  threadId?: string;

  @ApiPropertyOptional({
    description: 'Array of images attached to the message',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        filename: { type: 'string' },
        filepath: { type: 'string' },
        mimeType: { type: 'string', example: 'image/png' },
        size: { type: 'number' },
        thumbnail: { type: 'string', description: 'Base64 encoded thumbnail' },
        fullImage: { type: 'string', description: 'Base64 encoded full image' },
        uploadedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @IsOptional()
  @IsArray()
  @Type(() => Object) // Add explicit type transformation
  images?: ImageAttachment[];

  @ApiPropertyOptional({
    description: 'Array of notes attached to the message',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string' },
        nodeLabel: { type: 'string', required: false },
        attachedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @IsOptional()
  @IsArray()
  @Type(() => Object) // Add explicit type transformation
  notes?: NotesAttachment[];

  @ApiPropertyOptional({
    description: 'Whether to use agent mode processing',
    type: Boolean,
  })
  @IsOptional()
  @IsBoolean()
  isAgentMode?: boolean;
}

export class StreamMessageDto extends CreateMessageDto {
  @ApiPropertyOptional({
    description: 'Enable streaming response',
    default: true,
    type: Boolean,
  })
  @IsOptional()
  stream?: boolean;
}

export class GenerateTitleDto {
  @ApiProperty({
    description: 'Context to generate title from',
    type: String,
  })
  @IsString()
  context: string;

  @ApiPropertyOptional({
    description: 'Model to use for title generation',
    type: String,
  })
  @IsOptional()
  @IsString()
  model?: string;
}

export class GeneratePromptDto {
  @ApiProperty({ description: 'Context for prompt generation', type: String })
  @IsString()
  context: string;

  @ApiPropertyOptional({ description: 'Prompt type', type: String })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({
    description: 'Additional parameters',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  parameters?: Record<string, unknown>;
}

export class CancelMessageDto {
  @ApiProperty({ description: 'Thread ID to cancel message in', type: String })
  @IsUUID()
  threadId: string;

  @ApiPropertyOptional({
    description: 'Specific message ID to cancel',
    type: String,
  })
  @IsOptional()
  @IsUUID()
  messageId?: string;
}

export class LoadThreadDto {
  @ApiPropertyOptional({
    description: 'Number of messages to load',
    default: 50,
    type: Number,
  })
  @IsOptional()
  @IsNumber()
  limit?: number;

  @ApiPropertyOptional({ description: 'Offset for pagination', type: Number })
  @IsOptional()
  @IsNumber()
  offset?: number;
}
