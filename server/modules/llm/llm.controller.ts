import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Delete,
  HttpStatus,
  HttpCode,
  BadRequestException,
  InternalServerErrorException,
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
import {
  ModelSettingsDto,
  GenerateResponseDto,
  DownloadModelDto,
} from './dto/llm.dto';

@ApiTags('llm')
@Controller('api/local-llm')
export class LlmController {
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

  @Post('unload')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unload the current model' })
  @ApiResponse({ status: 200, description: 'Model unloaded successfully' })
  async unloadModel() {
    return this.localLlmService.unloadCurrentModel();
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

  @Post('abort/:threadId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Abort generation for a thread' })
  @ApiParam({ name: 'threadId', description: 'Thread ID to abort' })
  @ApiResponse({ status: 200, description: 'Generation aborted' })
  async abortGeneration(@Param('threadId') threadId: string) {
    return this.llmService.abortGeneration(threadId);
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

  @Get('system-info')
  @ApiOperation({ summary: 'Get system information for LLM' })
  @ApiResponse({
    status: 200,
    description: 'System information',
    schema: {
      type: 'object',
      properties: {
        gpuInfo: { type: 'object', additionalProperties: true },
        cpuInfo: { type: 'object', additionalProperties: true },
        memoryInfo: { type: 'object', additionalProperties: true },
        recommendedSettings: { type: 'object', additionalProperties: true },
      },
    },
  })
  async getSystemInfo() {
    return this.llmService.getSystemInfo();
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

  @Get('ollama/models')
  @ApiOperation({ summary: 'Get Ollama models' })
  @ApiResponse({
    status: 200,
    description: 'List of Ollama models',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          size: { type: 'number' },
          digest: { type: 'string' },
          modifiedAt: { type: 'string' },
        },
        additionalProperties: true,
      },
    },
  })
  async getOllamaModels() {
    return this.discoveryService.getOllamaModels();
  }

  @Post('scan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Scan for local models' })
  @ApiResponse({ status: 200, description: 'Scan completed' })
  async scanForModels() {
    return this.discoveryService.scanForModels();
  }
}
