import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsArray,
  Min,
  Max,
  IsObject,
} from 'class-validator';

export class LoadModelDto {
  @ApiProperty({ description: 'Path to the model file' })
  @IsString()
  modelPath: string;

  @ApiPropertyOptional({ description: 'GPU layers to offload', minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  gpuLayers?: number;

  @ApiPropertyOptional({
    description: 'Context size',
    minimum: 128,
    maximum: 131072,
  })
  @IsOptional()
  @IsNumber()
  @Min(128)
  @Max(131072)
  contextSize?: number;

  @ApiPropertyOptional({ description: 'Batch size', minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  batchSize?: number;

  @ApiPropertyOptional({ description: 'Number of threads', minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  threads?: number;

  @ApiPropertyOptional({
    description: 'Temperature for generation',
    minimum: 0,
    maximum: 2,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;
}

export class ModelSettingsDto {
  @ApiPropertyOptional({ description: 'GPU layers to offload', minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  gpuLayers?: number;

  @ApiPropertyOptional({
    description: 'Context size',
    minimum: 128,
    maximum: 131072,
  })
  @IsOptional()
  @IsNumber()
  @Min(128)
  @Max(131072)
  contextSize?: number;

  @ApiPropertyOptional({ description: 'Batch size', minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  batchSize?: number;

  @ApiPropertyOptional({ description: 'Number of threads', minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  threads?: number;

  @ApiPropertyOptional({
    description: 'Temperature',
    minimum: 0,
    maximum: 2,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @ApiPropertyOptional({
    description: 'Top P sampling',
    minimum: 0,
    maximum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  topP?: number;

  @ApiPropertyOptional({
    description: 'Top K sampling',
    minimum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  topK?: number;

  @ApiPropertyOptional({
    description: 'Repeat penalty',
    minimum: 0,
    maximum: 2,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  repeatPenalty?: number;
}

export class GenerateResponseDto {
  @ApiProperty({ description: 'Input prompt' })
  @IsString()
  prompt: string;

  @ApiPropertyOptional({ description: 'Thread ID for context' })
  @IsOptional()
  @IsString()
  threadId?: string;

  @ApiPropertyOptional({
    description: 'Temperature',
    minimum: 0,
    maximum: 2,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @ApiPropertyOptional({ description: 'Maximum tokens to generate' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxTokens?: number;

  @ApiPropertyOptional({ description: 'Stream the response' })
  @IsOptional()
  @IsBoolean()
  stream?: boolean;

  @ApiPropertyOptional({ description: 'System prompt' })
  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @ApiPropertyOptional({ description: 'Disable function calling' })
  @IsOptional()
  @IsBoolean()
  disableFunctions?: boolean;

  @ApiPropertyOptional({ description: 'Disable chat history' })
  @IsOptional()
  @IsBoolean()
  disableChatHistory?: boolean;
}

export class DownloadModelDto {
  @ApiPropertyOptional({ description: 'Model URL' })
  @IsOptional()
  @IsString()
  modelUrl?: string;

  @ApiPropertyOptional({ description: 'Model name' })
  @IsOptional()
  @IsString()
  modelName?: string;

  @ApiPropertyOptional({ description: 'Filename' })
  @IsOptional()
  @IsString()
  filename?: string;

  @ApiPropertyOptional({ description: 'File size in bytes' })
  @IsOptional()
  @IsNumber()
  size?: number;

  @ApiPropertyOptional({ description: 'Model description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Context length' })
  @IsOptional()
  @IsNumber()
  contextLength?: number;

  @ApiPropertyOptional({ description: 'Trained context length' })
  @IsOptional()
  @IsNumber()
  trainedContextLength?: number;

  @ApiPropertyOptional({ description: 'Max context length' })
  @IsOptional()
  @IsNumber()
  maxContextLength?: number;

  @ApiPropertyOptional({ description: 'Parameter count' })
  @IsOptional()
  @IsString()
  parameterCount?: string;

  @ApiPropertyOptional({ description: 'Quantization type' })
  @IsOptional()
  @IsString()
  quantization?: string;

  @ApiPropertyOptional({ description: 'Is multi-part model' })
  @IsOptional()
  @IsBoolean()
  isMultiPart?: boolean;

  @ApiPropertyOptional({ description: 'Total parts' })
  @IsOptional()
  @IsNumber()
  totalParts?: number;

  @ApiPropertyOptional({ description: 'All part files' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allPartFiles?: string[];

  @ApiPropertyOptional({ description: 'Total size for multi-part' })
  @IsOptional()
  @IsNumber()
  totalSize?: number;
}

export class ChatMessageDto {
  @ApiProperty({
    description: 'Message role',
    enum: ['user', 'assistant', 'system'],
  })
  @IsString()
  role: 'user' | 'assistant' | 'system';

  @ApiProperty({ description: 'Message content' })
  @IsString()
  content: string;

  @ApiPropertyOptional({ description: 'Message timestamp' })
  @IsOptional()
  timestamp?: Date;
}

export class StreamRequestDto {
  @ApiProperty({ description: 'Messages for chat' })
  @IsArray()
  messages: ChatMessageDto[];

  @ApiPropertyOptional({ description: 'Thread ID' })
  @IsOptional()
  @IsString()
  threadId?: string;

  @ApiPropertyOptional({ description: 'Model parameters' })
  @IsOptional()
  @IsObject()
  parameters?: Record<string, unknown>;
}
