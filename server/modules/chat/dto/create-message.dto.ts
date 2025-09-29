import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  IsOptional,
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
  @ApiProperty({
    description: 'Personality description for prompt generation',
    type: String,
  })
  @IsString()
  personality: string;
}

export class CancelMessageDto {
  @ApiProperty({ description: 'Message ID to cancel', type: String })
  @IsString()
  messageId: string;

  @ApiProperty({ description: 'Thread ID to cancel message in', type: String })
  @IsString()
  threadId: string;
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
