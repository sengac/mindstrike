import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Delete,
  Res,
  HttpStatus,
  HttpCode,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { LlmService } from './services/llm.service';
import { ModelDiscoveryService } from './services/model-discovery.service';
import { ModelDownloadService } from './services/model-download.service';
import { LocalLlmService } from './services/local-llm.service';
import { modelSettingsManager } from '../../utils/modelSettingsManager';
import {
  ModelSettingsDto,
  GenerateResponseDto,
  DownloadModelDto,
} from './dto/llm.dto';
import type { Response } from 'express';

@ApiTags('llm')
@Controller('api/local-llm')
export class LlmController {
  private readonly logger = new Logger(LlmController.name);
  constructor(
    private readonly llmService: LlmService,
    private readonly discoveryService: ModelDiscoveryService,
    private readonly downloadService: ModelDownloadService,
    private readonly localLlmService: LocalLlmService
  ) {}

  @Get('models')
  @ApiOperation({ summary: 'Get all local models' })
  @ApiResponse({
    status: 200,
    description: 'List of local models',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          filename: { type: 'string' },
          path: { type: 'string' },
          size: { type: 'number' },
          downloaded: { type: 'boolean' },
          downloading: { type: 'boolean' },
          trainedContextLength: { type: 'number' },
          maxContextLength: { type: 'number' },
          parameterCount: { type: 'string' },
          quantization: { type: 'string' },
          layerCount: { type: 'number' },
          hasVramData: { type: 'boolean' },
          vramError: { type: 'string' },
        },
        additionalProperties: true,
      },
    },
  })
  async getLocalModels() {
    return this.localLlmService.getLocalModels();
  }

  @Get('available-models')
  @ApiOperation({ summary: 'Get available models for download' })
  @ApiResponse({
    status: 200,
    description: 'List of available models',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          url: { type: 'string' },
          filename: { type: 'string' },
          size: { type: 'number' },
          description: { type: 'string' },
          contextLength: { type: 'number' },
          parameterCount: { type: 'string' },
          quantization: { type: 'string' },
        },
        additionalProperties: true,
      },
    },
  })
  async getAvailableModels() {
    return this.localLlmService.getAvailableModels();
  }

  @Get('available-models-cached')
  @ApiOperation({ summary: 'Get cached available models only' })
  @ApiResponse({
    status: 200,
    description: 'Cached model list',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
      },
    },
  })
  async getCachedModels() {
    return this.discoveryService.getCachedModels();
  }

  @Post('check-model-updates')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check for model updates' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        modelIds: {
          type: 'array',
          items: { type: 'string' },
        },
        visibleModelIds: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['modelIds'],
    },
  })
  @ApiResponse({ status: 200, description: 'Model update status' })
  async checkModelUpdates(
    @Body() body: { modelIds: string[]; visibleModelIds?: string[] }
  ) {
    if (!Array.isArray(body.modelIds)) {
      throw new BadRequestException('modelIds must be an array');
    }
    // Transform modelIds to the format expected by checkModelUpdates
    const models = body.modelIds.map(id => ({ modelId: id }));
    return this.discoveryService.checkModelUpdates(models);
  }

  @Post('retry-vram-fetch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry VRAM fetching for models' })
  @ApiResponse({ status: 200, description: 'VRAM fetch retry initiated' })
  async retryVramFetch() {
    return this.discoveryService.retryVramFetch();
  }

  @Get('models/:modelId/status')
  @ApiOperation({ summary: 'Get model status' })
  @ApiParam({ name: 'modelId', description: 'Model ID to get status for' })
  @ApiResponse({
    status: 200,
    description: 'Model status information',
    schema: {
      type: 'object',
      properties: {
        loaded: { type: 'boolean' },
        modelPath: { type: 'string' },
        runtimeInfo: { type: 'object', additionalProperties: true },
      },
    },
  })
  async getModelStatus(@Param('modelId') modelId: string) {
    return this.localLlmService.getModelStatus(modelId);
  }

  @Get('models/:modelId/settings')
  @ApiOperation({ summary: 'Get model settings' })
  @ApiParam({ name: 'modelId', description: 'Model ID to get settings for' })
  @ApiResponse({
    status: 200,
    description: 'Model settings',
    type: ModelSettingsDto,
  })
  async getModelSettings(@Param('modelId') modelId: string) {
    return this.localLlmService.getModelSettings(modelId);
  }

  @Put('models/:modelId/settings')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update model settings' })
  @ApiParam({ name: 'modelId', description: 'Model ID to update settings for' })
  @ApiBody({ type: ModelSettingsDto })
  @ApiResponse({ status: 200, description: 'Settings updated successfully' })
  async updateModelSettings(
    @Param('modelId') modelId: string,
    @Body() settings: ModelSettingsDto
  ) {
    return this.localLlmService.setModelSettings(modelId, settings);
  }

  @Post('models/:modelId/generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate response using a specific model' })
  @ApiParam({ name: 'modelId', description: 'Model ID to use for generation' })
  @ApiBody({ type: GenerateResponseDto })
  @ApiResponse({ status: 200, description: 'Response generated' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  async generateResponse(
    @Param('modelId') modelId: string,
    @Body() dto: GenerateResponseDto
  ) {
    const messages = [{ role: 'user', content: dto.prompt }];
    const options = {
      temperature: dto.temperature,
      maxTokens: dto.maxTokens,
    };

    const response = await this.localLlmService.generateResponse(
      modelId,
      messages,
      options
    );

    return {
      success: true,
      response,
      streamed: false,
      tokensGenerated: response.split(' ').length,
    };
  }

  @Post('download')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Download a model' })
  @ApiBody({ type: DownloadModelDto })
  @ApiResponse({ status: 200, description: 'Download started' })
  async downloadModel(@Body() dto: DownloadModelDto) {
    return this.downloadService.downloadModel(dto);
  }

  @Delete('models/:modelId')
  @ApiOperation({ summary: 'Delete a local model' })
  @ApiParam({ name: 'modelId', description: 'Model ID to delete' })
  @ApiResponse({ status: 200, description: 'Model deleted successfully' })
  async deleteModel(@Param('modelId') modelId: string) {
    return this.localLlmService.deleteModel(modelId);
  }

  @Post('models/:modelId/load')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Load a specific model by ID' })
  @ApiParam({ name: 'modelId', description: 'Model ID to load' })
  @ApiResponse({
    status: 200,
    description: 'Model loaded successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 500, description: 'Failed to load model' })
  async loadModelById(@Param('modelId') modelId: string) {
    try {
      return await this.localLlmService.loadModel(modelId);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to load model';
      throw new InternalServerErrorException(errorMessage);
    }
  }

  @Post('models/:modelId/unload')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unload a specific model by ID' })
  @ApiParam({ name: 'modelId', description: 'Model ID to unload' })
  @ApiResponse({
    status: 200,
    description: 'Model unloaded successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 500, description: 'Failed to unload model' })
  async unloadModelById(@Param('modelId') modelId: string) {
    try {
      return await this.localLlmService.unloadModel(modelId);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to unload model';
      throw new InternalServerErrorException(errorMessage);
    }
  }

  @Post('refresh-models')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh available models cache' })
  @ApiResponse({
    status: 200,
    description: 'Models refreshed successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        models: { type: 'array' },
      },
    },
  })
  async refreshModels() {
    return this.discoveryService.refreshModels();
  }

  @Post('open-models-directory')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Open models directory in file explorer' })
  @ApiResponse({
    status: 200,
    description: 'Directory opened successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        directory: { type: 'string' },
      },
    },
  })
  async openModelsDirectory() {
    return this.localLlmService.openModelsDirectory();
  }

  @Post('refresh-accessibility')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear accessibility cache and recheck all models' })
  @ApiResponse({
    status: 200,
    description: 'Accessibility refreshed successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        models: { type: 'array' },
      },
    },
  })
  async refreshAccessibility() {
    return this.discoveryService.refreshAccessibility();
  }

  @Post('hf-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set Hugging Face token' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        token: { type: 'string' },
      },
      required: ['token'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Token saved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  async setHfToken(@Body('token') token: string) {
    if (!token) {
      throw new BadRequestException('Token is required');
    }
    return this.discoveryService.setHuggingFaceToken(token);
  }

  @Delete('hf-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove Hugging Face token' })
  @ApiResponse({
    status: 200,
    description: 'Token removed successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  async removeHfToken() {
    return this.discoveryService.removeHuggingFaceToken();
  }

  @Get('hf-token')
  @ApiOperation({ summary: 'Get Hugging Face token' })
  @ApiResponse({
    status: 200,
    description: 'Token retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        token: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Token not found' })
  async getHfToken() {
    return this.discoveryService.getHuggingFaceToken();
  }

  @Get('hf-token/status')
  @ApiOperation({ summary: 'Check if Hugging Face token is set' })
  @ApiResponse({
    status: 200,
    description: 'Token status retrieved',
    schema: {
      type: 'object',
      properties: {
        hasToken: { type: 'boolean' },
      },
    },
  })
  async getHfTokenStatus() {
    return this.discoveryService.getHuggingFaceTokenStatus();
  }

  @Get('update-models-stream')
  @ApiOperation({
    summary: 'Update model list with real-time progress via SSE',
  })
  @ApiResponse({
    status: 200,
    description: 'SSE stream established',
  })
  async updateModelsStream(@Res() res: Response) {
    return this.discoveryService.updateModelsStream(res);
  }

  @Post('update-models')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update model list (non-streaming)' })
  @ApiResponse({
    status: 200,
    description: 'Models updated successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        models: { type: 'array' },
      },
    },
  })
  async updateModels() {
    return this.discoveryService.updateModels();
  }

  @Post('search-models')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Search for models' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        searchType: { type: 'string', enum: ['all', 'name', 'description'] },
      },
      required: ['query'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Search results',
    schema: {
      type: 'object',
      properties: {
        models: { type: 'array' },
      },
    },
  })
  async searchModels(
    @Body() searchParams: { query: string; searchType?: string }
  ) {
    return this.discoveryService.searchModels(
      searchParams.query,
      searchParams.searchType
    );
  }

  @Post('clear-search-cache')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear search cache' })
  @ApiResponse({
    status: 200,
    description: 'Cache cleared successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  async clearSearchCache() {
    return this.discoveryService.clearSearchCache();
  }

  @Post('download/:filename/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel model download' })
  @ApiParam({ name: 'filename', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Download cancelled',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  async cancelDownload(@Param('filename') filename: string) {
    return this.downloadService.cancelDownload(filename);
  }

  @Get('models/:modelId/optimal-settings')
  @ApiOperation({ summary: 'Get optimal settings for a model' })
  @ApiParam({ name: 'modelId', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Optimal settings retrieved',
    schema: {
      type: 'object',
      properties: {
        gpuLayers: { type: 'number' },
        contextSize: { type: 'number' },
        threads: { type: 'number' },
      },
    },
  })
  async getOptimalSettings(@Param('modelId') modelId: string) {
    return this.llmService.getOptimalSettings(modelId);
  }

  @Get('settings')
  @ApiOperation({ summary: 'Get all model settings' })
  @ApiResponse({
    status: 200,
    description: 'Settings retrieved',
    schema: {
      type: 'object',
      additionalProperties: true,
    },
  })
  async getSettings() {
    try {
      const settings = await modelSettingsManager.loadAllModelSettings();
      return settings;
    } catch (error) {
      this.logger.error('Error getting all model settings:', error);
      throw new InternalServerErrorException(
        error instanceof Error
          ? error.message
          : 'Failed to get all model settings'
      );
    }
  }

  @Post('models/:modelId/generate-stream')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate response with streaming' })
  @ApiParam({ name: 'modelId', type: 'string' })
  @ApiBody({ type: GenerateResponseDto })
  @ApiResponse({
    status: 200,
    description: 'SSE stream established',
  })
  async generateStream(
    @Param('modelId') modelId: string,
    @Body() generateDto: GenerateResponseDto,
    @Res() res: Response
  ) {
    return this.llmService.generateStream(modelId, generateDto, res);
  }
}
