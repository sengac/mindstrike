import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  IsNumber,
  IsUUID,
} from 'class-validator';

export class SetMusicRootDto {
  @ApiProperty({ description: 'Music root directory path', type: String })
  @IsString()
  path: string;
}

export class SavePlaylistDto {
  @ApiProperty({ description: 'Playlist name', type: String })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'List of tracks',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        path: { type: 'string' },
        title: { type: 'string' },
        artist: { type: 'string' },
        duration: { type: 'number' },
      },
    },
  })
  @IsArray()
  tracks: Array<{
    id: string;
    path: string;
    title: string;
    artist?: string;
    duration?: number;
  }>;

  @ApiPropertyOptional({ description: 'Playlist description', type: String })
  @IsOptional()
  @IsString()
  description?: string;
}

export class GetAudioFilesDto {
  @ApiPropertyOptional({ description: 'Directory path', type: String })
  @IsOptional()
  @IsString()
  path?: string;

  @ApiPropertyOptional({ description: 'Include subdirectories', type: Boolean })
  @IsOptional()
  recursive?: boolean;

  @ApiPropertyOptional({
    description: 'File extensions to include',
    type: 'array',
    items: { type: 'string' },
  })
  @IsOptional()
  @IsArray()
  extensions?: string[];
}
