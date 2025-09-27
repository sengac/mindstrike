import {
  Controller,
  Get,
  Post,
  Body,
  HttpStatus,
  HttpCode,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { WorkspaceService } from './workspace.service';
import { WorkspaceFileService } from './services/workspace-file.service';
import { AgentPoolService } from '../agents/services/agent-pool.service';
import { ConversationService } from '../chat/services/conversation.service';
import { GlobalConfigService } from '../shared/services/global-config.service';
import * as path from 'path';
import { existsSync, statSync } from 'fs';

@ApiTags('workspace')
@Controller('api/workspace')
export class WorkspaceController {
  private readonly logger = new Logger(WorkspaceController.name);

  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly workspaceFileService: WorkspaceFileService,
    private readonly agentPoolService: AgentPoolService,
    private readonly conversationService: ConversationService,
    private readonly globalConfigService: GlobalConfigService
  ) {}

  @Get('directory')
  @ApiOperation({ summary: 'Get current workspace directory' })
  @ApiResponse({
    status: 200,
    description: 'Current workspace directory',
    schema: {
      type: 'object',
      properties: {
        currentDirectory: { type: 'string' },
        absolutePath: { type: 'string' },
      },
    },
  })
  async getWorkspaceDirectory() {
    try {
      const currentDir = this.globalConfigService.getCurrentWorkingDirectory();
      return {
        currentDirectory: currentDir,
        absolutePath: currentDir,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(errorMessage);
    }
  }

  @Post('directory')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set workspace directory' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
      },
      required: ['path'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Directory set successfully',
    schema: {
      type: 'object',
      properties: {
        currentDirectory: { type: 'string' },
        absolutePath: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid directory path' })
  @ApiResponse({ status: 404, description: 'Directory does not exist' })
  async setWorkspaceDirectory(@Body() body: { path: string }) {
    try {
      const { path: newPath } = body;
      if (!newPath) {
        throw new BadRequestException('Path is required');
      }

      // Allow both absolute and relative paths
      const currentDir = this.globalConfigService.getCurrentWorkingDirectory();
      let fullPath: string;
      if (path.isAbsolute(newPath)) {
        fullPath = newPath;
      } else {
        fullPath = path.resolve(currentDir, newPath);
      }

      // Check if the path exists and is a directory
      if (!existsSync(fullPath)) {
        throw new NotFoundException('Directory does not exist');
      }

      const stats = statSync(fullPath);
      if (!stats.isDirectory()) {
        throw new BadRequestException('Path is not a directory');
      }

      this.globalConfigService.updateCurrentWorkingDirectory(fullPath);
      return {
        currentDirectory: fullPath,
        absolutePath: fullPath,
      };
    } catch (error: unknown) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(errorMessage);
    }
  }

  @Get('root')
  @ApiOperation({ summary: 'Get workspace root directory' })
  @ApiResponse({
    status: 200,
    description: 'Workspace root path',
    schema: {
      type: 'object',
      properties: {
        workspaceRoot: { type: 'string' },
        currentDirectory: { type: 'string' },
      },
    },
  })
  async getWorkspaceRoot() {
    try {
      return {
        workspaceRoot: this.globalConfigService.getWorkspaceRoot(),
        currentDirectory: this.globalConfigService.getCurrentWorkingDirectory(),
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(errorMessage);
    }
  }

  @Post('root')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set workspace root directory' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
      },
      required: ['path'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Root directory set successfully',
    schema: {
      type: 'object',
      properties: {
        workspaceRoot: { type: 'string' },
        currentDirectory: { type: 'string' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid directory path' })
  @ApiResponse({ status: 404, description: 'Directory does not exist' })
  async setWorkspaceRoot(@Body() body: { path: string }) {
    try {
      const { path: newPath } = body;
      if (!newPath) {
        throw new BadRequestException('Path is required');
      }

      // Resolve path - can be relative to current working directory or absolute
      const currentDir = this.globalConfigService.getCurrentWorkingDirectory();
      let fullPath: string;
      if (path.isAbsolute(newPath)) {
        fullPath = newPath;
      } else {
        fullPath = path.resolve(currentDir, newPath);
      }

      // Check if the path exists and is a directory
      if (!existsSync(fullPath)) {
        throw new NotFoundException('Directory does not exist');
      }

      const stats = statSync(fullPath);
      if (!stats.isDirectory()) {
        throw new BadRequestException('Path is not a directory');
      }

      // Only update and log if workspace root actually changed
      const currentRoot = this.globalConfigService.getWorkspaceRoot();
      if (currentRoot !== fullPath) {
        // Update workspace root globally (also updates current directory and persists)
        await this.globalConfigService.updateWorkspaceRoot(fullPath);

        // Update workspace root for all agents in the pool
        this.agentPoolService.updateAllAgentsWorkspace(fullPath);

        // Update conversation manager workspace
        this.conversationService.updateWorkspaceRoot(fullPath);

        this.logger.log(`Workspace root changed to: ${fullPath}`);
      }

      return {
        workspaceRoot: this.globalConfigService.getWorkspaceRoot(),
        currentDirectory: this.globalConfigService.getCurrentWorkingDirectory(),
        message: 'Workspace root changed successfully',
      };
    } catch (error: unknown) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(errorMessage);
    }
  }
}
