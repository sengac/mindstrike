import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpStatus,
  HttpCode,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { LlmConfigService } from './services/llm-config.service';

@ApiTags('llm-config')
@Controller('api/llm')
export class LlmConfigController {
  constructor(private readonly llmConfigService: LlmConfigService) {}

  @Get('models')
  @ApiOperation({ summary: 'Get all configured LLM models' })
  @ApiResponse({
    status: 200,
    description:
      'List of all configured models (OpenAI, Anthropic, local, etc.)',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          serviceId: { type: 'string' },
          serviceName: { type: 'string' },
          model: { type: 'string' },
          displayName: { type: 'string' },
          baseURL: { type: 'string' },
          apiKey: { type: 'string' },
          type: {
            type: 'string',
            enum: [
              'ollama',
              'vllm',
              'openai-compatible',
              'openai',
              'anthropic',
              'perplexity',
              'google',
              'local',
            ],
          },
          contextLength: { type: 'number' },
          parameterCount: { type: 'string' },
          quantization: { type: 'string' },
          available: { type: 'boolean' },
          isDefault: { type: 'boolean' },
        },
      },
    },
  })
  async getModels() {
    try {
      const models = await this.llmConfigService.getModels();
      return models;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to get models';
      throw new InternalServerErrorException(errorMessage);
    }
  }

  @Get('default-model')
  @ApiOperation({ summary: 'Get default LLM model' })
  @ApiResponse({
    status: 200,
    description: 'Default model information',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        serviceId: { type: 'string' },
        serviceName: { type: 'string' },
        model: { type: 'string' },
        displayName: { type: 'string' },
        baseURL: { type: 'string' },
        type: {
          type: 'string',
          enum: [
            'ollama',
            'vllm',
            'openai-compatible',
            'openai',
            'anthropic',
            'perplexity',
            'google',
            'local',
          ],
        },
        contextLength: { type: 'number' },
        parameterCount: { type: 'string' },
        quantization: { type: 'string' },
        available: { type: 'boolean' },
        isDefault: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'No default model configured' })
  async getDefaultModel() {
    try {
      const defaultModel = await this.llmConfigService.getDefaultModel();
      if (!defaultModel) {
        throw new InternalServerErrorException('No default model configured');
      }
      return defaultModel;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to get default model';
      throw new InternalServerErrorException(errorMessage);
    }
  }

  @Post('default-model')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set default LLM model' })
  @ApiResponse({
    status: 200,
    description: 'Default model set successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        modelId: { type: 'string' },
      },
    },
  })
  async setDefaultModel(@Body() body: { modelId: string }) {
    try {
      await this.llmConfigService.setDefaultModel(body.modelId);
      return {
        success: true,
        modelId: body.modelId,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to set default model';
      throw new InternalServerErrorException(errorMessage);
    }
  }

  @Post('rescan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rescan LLM services and update model list' })
  @ApiResponse({
    status: 200,
    description: 'LLM services rescanned successfully',
    schema: {
      type: 'object',
      properties: {
        scannedServices: { type: 'array', items: { type: 'object' } },
        addedServices: { type: 'array', items: { type: 'object' } },
        removedServices: { type: 'array', items: { type: 'object' } },
      },
    },
  })
  @ApiResponse({ status: 500, description: 'Failed to rescan LLM services' })
  async rescanServices() {
    try {
      const result = await this.llmConfigService.rescanServices();
      return result;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to rescan LLM services';
      throw new InternalServerErrorException(errorMessage);
    }
  }

  @Get('custom-services')
  @ApiOperation({ summary: 'Get all custom LLM services' })
  @ApiResponse({
    status: 200,
    description: 'List of custom LLM services',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          baseURL: { type: 'string' },
          type: {
            type: 'string',
            enum: [
              'ollama',
              'vllm',
              'openai-compatible',
              'openai',
              'anthropic',
              'perplexity',
              'google',
              'local',
            ],
          },
          apiKey: { type: 'string' },
          enabled: { type: 'boolean' },
          custom: { type: 'boolean' },
        },
      },
    },
  })
  async getCustomServices() {
    try {
      const customServices = await this.llmConfigService.getCustomServices();
      return customServices;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to get custom services';
      throw new InternalServerErrorException(errorMessage);
    }
  }

  @Post('custom-services')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add a new custom LLM service' })
  @ApiResponse({
    status: 200,
    description: 'Custom service added successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        baseURL: { type: 'string' },
        type: { type: 'string' },
        apiKey: { type: 'string' },
        enabled: { type: 'boolean' },
        custom: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid service configuration' })
  async addCustomService(
    @Body()
    body: {
      name: string;
      baseURL: string;
      type:
        | 'ollama'
        | 'vllm'
        | 'openai-compatible'
        | 'openai'
        | 'anthropic'
        | 'perplexity'
        | 'google'
        | 'local';
      apiKey?: string;
      enabled?: boolean;
    }
  ) {
    try {
      const { name, baseURL, type, apiKey, enabled } = body;

      if (!name || !baseURL || !type) {
        throw new BadRequestException('Name, baseURL, and type are required');
      }

      const newService = await this.llmConfigService.addCustomService({
        name,
        baseURL,
        type,
        apiKey,
        enabled: enabled !== false,
      });

      return newService;
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to add custom service';
      throw new InternalServerErrorException(errorMessage);
    }
  }

  @Put('custom-services/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a custom LLM service' })
  @ApiResponse({
    status: 200,
    description: 'Custom service updated successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        baseURL: { type: 'string' },
        type: { type: 'string' },
        apiKey: { type: 'string' },
        enabled: { type: 'boolean' },
        custom: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Service not found' })
  async updateCustomService(
    @Param('id') id: string,
    @Body()
    updates: {
      name?: string;
      baseURL?: string;
      type?: string;
      apiKey?: string;
      enabled?: boolean;
    }
  ) {
    try {
      const updatedService = await this.llmConfigService.updateCustomService(
        id,
        updates
      );
      return updatedService;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to update custom service';
      throw new InternalServerErrorException(errorMessage);
    }
  }

  @Delete('custom-services/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a custom LLM service' })
  @ApiResponse({
    status: 200,
    description: 'Custom service removed successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Service not found' })
  async removeCustomService(@Param('id') id: string) {
    try {
      await this.llmConfigService.removeCustomService(id);
      return { success: true };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to remove custom service';
      throw new InternalServerErrorException(errorMessage);
    }
  }

  @Post('test-service')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test a custom LLM service' })
  @ApiResponse({
    status: 200,
    description: 'Service test results',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        available: { type: 'boolean' },
        models: { type: 'array', items: { type: 'string' } },
        error: { type: 'string' },
      },
    },
  })
  async testService(
    @Body()
    body: {
      baseURL: string;
      type: string;
      apiKey?: string;
    }
  ) {
    try {
      const { baseURL, type, apiKey } = body;

      if (!baseURL || !type) {
        throw new BadRequestException('BaseURL and type are required');
      }

      const result = await this.llmConfigService.testService(
        baseURL,
        type,
        apiKey
      );
      return result;
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to test service';
      throw new InternalServerErrorException(errorMessage);
    }
  }
}
