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

export interface MessageImage {
  data: string;
  mimeType: string;
}

export interface MessageNote {
  content: string;
  metadata?: Record<string, unknown>;
}

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
        data: { type: 'string', description: 'Base64 encoded image data' },
        mimeType: { type: 'string', example: 'image/png' },
      },
    },
  })
  @IsOptional()
  @IsArray()
  images?: MessageImage[];

  @ApiPropertyOptional({
    description: 'Array of notes attached to the message',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        metadata: { type: 'object' },
      },
    },
  })
  @IsOptional()
  @IsArray()
  notes?: MessageNote[];

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
    description: 'Messages to generate title from',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        role: { type: 'string' },
        content: { type: 'string' },
      },
    },
  })
  @IsArray()
  messages: Array<{ role: string; content: string }>;

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
