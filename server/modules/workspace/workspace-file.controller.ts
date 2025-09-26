import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { SaveFileDto, DeleteFileDto } from './dto/workspace.dto';
import { WorkspaceService } from './workspace.service';
import { WorkspaceFileService } from './services/workspace-file.service';

@ApiTags('workspace')
@Controller('api/workspace')
export class WorkspaceFileController {
  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly workspaceFileService: WorkspaceFileService
  ) {}

  @Get('files')
  @ApiOperation({ summary: 'List workspace files' })
  @ApiResponse({
    status: 200,
    description: 'List of files',
    schema: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
  })
  async getWorkspaceFiles() {
    // Express returns a simple string array with directories having trailing slash
    const files = await this.workspaceFileService.listFiles();
    return files.map(file => (file.isDirectory ? `${file.name}/` : file.name));
  }

  @Get('file/*')
  @ApiOperation({ summary: 'Get file content' })
  @ApiParam({ name: '0', type: 'string', description: 'File path' })
  @ApiResponse({
    status: 200,
    description: 'File content',
    schema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'File not found' })
  async getFile(@Param('0') path: string) {
    // Express returns only { content }
    const fileContent = await this.workspaceFileService.readFile(path);
    return {
      content: fileContent.content,
    };
  }

  @Post('save')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save file to workspace' })
  @ApiBody({ type: SaveFileDto })
  @ApiResponse({
    status: 200,
    description: 'File saved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid file path or content' })
  async saveFile(@Body() dto: SaveFileDto) {
    // Express returns only { success: true }
    await this.workspaceFileService.saveFile(dto.path, dto.content);
    return {
      success: true,
    };
  }

  @Post('delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete file from workspace' })
  @ApiBody({ type: DeleteFileDto })
  @ApiResponse({
    status: 200,
    description: 'File deleted successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'File not found' })
  async deleteFile(@Body() dto: DeleteFileDto) {
    // Express returns { success: true, message: "Successfully deleted file: ..." }
    await this.workspaceFileService.deleteFile(dto.path);
    return {
      success: true,
      message: `Successfully deleted file: ${dto.path}`,
    };
  }
}
