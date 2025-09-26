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
  OnModuleInit,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { WorkspaceService } from './workspace.service';
import { WorkspaceFileService } from './services/workspace-file.service';
import { AgentPoolService } from '../agents/services/agent-pool.service';
import { ConversationService } from '../chat/services/conversation.service';
import * as path from 'path';
import { existsSync, statSync } from 'fs';
import {
  setWorkspaceRoot,
  getWorkspaceRoot,
} from '../../shared/utils/settings-directory';
import { getHomeDirectory } from '../../utils/settingsDirectory';

@ApiTags('workspace')
@Controller('api/workspace')
export class WorkspaceController implements OnModuleInit {
  private readonly logger = new Logger(WorkspaceController.name);
  private currentWorkingDirectory: string = process.cwd();
  private workspaceRoot: string = process.cwd();

  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly workspaceFileService: WorkspaceFileService,
    private readonly agentPoolService: AgentPoolService,
    private readonly conversationService: ConversationService
  ) {}

  async onModuleInit() {
    // Load persisted workspace root from settings
    const persistedWorkspaceRoot = await getWorkspaceRoot();

    if (persistedWorkspaceRoot) {
      this.workspaceRoot = persistedWorkspaceRoot;
      this.currentWorkingDirectory = persistedWorkspaceRoot;
      this.logger.log(
        `Loaded workspace root from settings: ${this.workspaceRoot}`
      );
    } else {
      // Use default if no persisted root
      const defaultRoot = process.env.WORKSPACE_ROOT || getHomeDirectory();
      this.workspaceRoot = defaultRoot;
      this.currentWorkingDirectory = defaultRoot;
      this.logger.log(`Using default workspace root: ${this.workspaceRoot}`);
    }
  }

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
      return {
        currentDirectory: this.currentWorkingDirectory,
        absolutePath: this.currentWorkingDirectory,
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
      let fullPath: string;
      if (path.isAbsolute(newPath)) {
        fullPath = newPath;
      } else {
        fullPath = path.resolve(this.currentWorkingDirectory, newPath);
      }

      // Check if the path exists and is a directory
      if (!existsSync(fullPath)) {
        throw new NotFoundException('Directory does not exist');
      }

      const stats = statSync(fullPath);
      if (!stats.isDirectory()) {
        throw new BadRequestException('Path is not a directory');
      }

      this.currentWorkingDirectory = fullPath;
      return {
        currentDirectory: this.currentWorkingDirectory,
        absolutePath: this.currentWorkingDirectory,
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
        workspaceRoot: this.workspaceRoot,
        currentDirectory: this.currentWorkingDirectory,
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
      let fullPath: string;
      if (path.isAbsolute(newPath)) {
        fullPath = newPath;
      } else {
        fullPath = path.resolve(this.currentWorkingDirectory, newPath);
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
      if (this.workspaceRoot !== fullPath) {
        // Update workspace root and reset current directory to the new root
        this.workspaceRoot = fullPath;
        this.currentWorkingDirectory = this.workspaceRoot;

        // Update workspace root for all agents in the pool
        this.agentPoolService.updateAllAgentsWorkspace(this.workspaceRoot);

        // Update conversation manager workspace
        this.conversationService.updateWorkspaceRoot(this.workspaceRoot);

        // Save workspace root to persistent storage
        await setWorkspaceRoot(this.workspaceRoot);

        this.logger.log(`Workspace root changed to: ${this.workspaceRoot}`);
      }

      return {
        workspaceRoot: this.workspaceRoot,
        currentDirectory: this.currentWorkingDirectory,
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
