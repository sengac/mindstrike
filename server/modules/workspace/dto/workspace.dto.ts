import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class SetWorkspaceDirectoryDto {
  @ApiProperty({ description: 'Workspace directory path', type: String })
  @IsString()
  directory: string;
}

export class GetWorkspaceFilesDto {
  @ApiPropertyOptional({
    description: 'Directory path to list files from',
    type: String,
  })
  @IsOptional()
  @IsString()
  path?: string;

  @ApiPropertyOptional({ description: 'Include hidden files', type: Boolean })
  @IsOptional()
  @IsBoolean()
  includeHidden?: boolean;
}

export class SaveFileDto {
  @ApiProperty({ description: 'File path', type: String })
  @IsString()
  path: string;

  @ApiProperty({ description: 'File content', type: String })
  @IsString()
  content: string;

  @ApiPropertyOptional({ description: 'Create backup', type: Boolean })
  @IsOptional()
  @IsBoolean()
  backup?: boolean;
}

export class DeleteFileDto {
  @ApiProperty({ description: 'File path to delete', type: String })
  @IsString()
  path: string;

  @ApiPropertyOptional({
    description: 'Move to trash instead of permanent delete',
    type: Boolean,
  })
  @IsOptional()
  @IsBoolean()
  moveToTrash?: boolean;
}
