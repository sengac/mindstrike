import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpStatus,
  HttpException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { ModuleRef } from '@nestjs/core';
import { LlmConfigService } from './services/llm-config.service';
import type { CustomLLMService } from '../../llmConfigManager';
import { GlobalLlmConfigService } from '../shared/services/global-llm-config.service';

interface CustomServiceDto {
  id?: string;
  name: string;
  baseURL: string;
  type:
    | 'ollama'
    | 'vllm'
    | 'openai-compatible'
    | 'openai'
    | 'anthropic'
    | 'perplexity'
    | 'google';
  apiKey?: string;
  enabled?: boolean;
}

@ApiTags('llm')
@Controller('api/llm')
export class LlmConfigController {
  constructor(
    private readonly llmConfigService: LlmConfigService,
    private readonly globalLlmConfigService: GlobalLlmConfigService,
    private readonly moduleRef: ModuleRef
  ) {}

  @Get('models')
  @ApiOperation({ summary: 'Get all configured LLM models' })
  @ApiResponse({
    status: 200,
    description: 'List of configured LLM models',
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
    return this.llmConfigService.getModels();
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
        type: { type: 'string' },
        available: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'No default model configured',
  })
  async getDefaultModel() {
    const defaultModel = await this.llmConfigService.getDefaultModel();
    if (!defaultModel) {
      throw new HttpException(
        'No default model configured',
        HttpStatus.NOT_FOUND
      );
    }
    return defaultModel;
  }

  @Post('default-model')
  @ApiOperation({ summary: 'Set default LLM model' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        modelId: { type: 'string' },
      },
      required: ['modelId'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Default model updated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid model ID',
  })
  async setDefaultModel(@Body() body: { modelId: string }) {
    if (!body.modelId) {
      throw new HttpException('Model ID is required', HttpStatus.BAD_REQUEST);
    }

    await this.llmConfigService.setDefaultModel(body.modelId);

    // Update global LLM config like Express does
    await this.globalLlmConfigService.refreshLLMConfig();

    // Update all agents with new LLM config (like Express does) - use dynamic import to avoid circular dependency
    try {
      const { AgentPoolService } = await import(
        '../agents/services/agent-pool.service'
      );
      const agentPoolService = this.moduleRef.get(AgentPoolService, {
        strict: false,
      });
      if (agentPoolService) {
        const currentLlmConfig =
          this.globalLlmConfigService.getCurrentLlmConfig();
        await agentPoolService.updateAllAgentsLLMConfig(currentLlmConfig);
      }
    } catch (error) {
      // AgentPoolService might not be available during testing
      console.warn('Could not update agents with new LLM config:', error);
    }

    return { message: 'Default model updated successfully' };
  }

  @Get('custom-services')
  @ApiOperation({ summary: 'Get custom LLM services' })
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
          type: { type: 'string' },
          apiKey: { type: 'string' },
          enabled: { type: 'boolean' },
          custom: { type: 'boolean' },
        },
      },
    },
  })
  async getCustomServices() {
    return this.llmConfigService.getCustomServices();
  }

  @Post('custom-services')
  @ApiOperation({ summary: 'Add or update custom LLM service' })
  @ApiBody({
    schema: {
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
          ],
        },
        apiKey: { type: 'string' },
        enabled: { type: 'boolean' },
      },
      required: ['name', 'baseURL', 'type'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Custom service saved successfully',
  })
  async saveCustomService(@Body() service: CustomServiceDto) {
    // The service expects either addCustomService for new or updateCustomService for existing
    if (service.id) {
      await this.llmConfigService.updateCustomService(service.id, service);
    } else {
      await this.llmConfigService.addCustomService(service);
    }
    return { message: 'Custom service saved successfully' };
  }

  @Post('rescan')
  @ApiOperation({ summary: 'Rescan for available LLM services' })
  @ApiResponse({
    status: 200,
    description: 'Services rescanned successfully',
    schema: {
      type: 'object',
      properties: {
        scannedServices: { type: 'array' },
        addedServices: { type: 'array' },
        removedServices: { type: 'array' },
      },
    },
  })
  async rescanServices() {
    try {
      return await this.llmConfigService.rescanServices();
    } catch (error) {
      if (error instanceof Error) {
        throw new InternalServerErrorException(error.message);
      }
      throw new InternalServerErrorException('Failed to rescan LLM services');
    }
  }

  @Post('test-service')
  @ApiOperation({ summary: 'Test connection to an LLM service' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
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
          ],
        },
        apiKey: { type: 'string' },
      },
      required: ['baseURL', 'type'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Service test result',
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
    @Body() body: { baseURL: string; type: string; apiKey?: string }
  ) {
    if (!body.baseURL || !body.type) {
      throw new BadRequestException('baseURL and type are required');
    }

    try {
      return await this.llmConfigService.testService(
        body.baseURL,
        body.type,
        body.apiKey
      );
    } catch (error) {
      if (error instanceof Error) {
        throw new InternalServerErrorException(error.message);
      }
      throw new InternalServerErrorException('Failed to test service');
    }
  }
}
