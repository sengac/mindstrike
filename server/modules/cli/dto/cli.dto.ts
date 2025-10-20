/**
 * CLI DTOs
 *
 * Data Transfer Objects for CLI API endpoints
 */

import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

// Select Node DTOs
export class SelectNodeDto {
  @IsString()
  @IsNotEmpty()
  nodeId: string;
}

export interface SelectNodeResponseDto {
  success: boolean;
  nodeId: string;
  timestamp: number;
}

// Create Node DTOs
export class CreateNodeDto {
  @IsString()
  @IsNotEmpty()
  label: string;

  @IsString()
  @IsOptional()
  parentId?: string;
}

export interface CreateNodeResponseDto {
  success: boolean;
  nodeId: string;
  label: string;
  parentId?: string;
  timestamp: number;
}

// Get Mindmap Response DTO
export interface GetMindmapResponseDto {
  nodes: Array<{
    id: string;
    label: string;
    position: {
      x: number;
      y: number;
    };
    data?: unknown;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    label?: string;
  }>;
  metadata?: {
    title?: string;
    created?: string;
    modified?: string;
  };
}

// Send Message DTOs
export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  message: string;

  @IsString()
  @IsOptional()
  clientId?: string;
}

export interface SendMessageResponseDto {
  success: boolean;
  messageId: string;
  threadId: string;
  timestamp: number;
}
