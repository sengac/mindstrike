import { Injectable, Logger } from '@nestjs/common';
import { getLocalLLMManager } from '../../../localLlmSingleton';
import { SseService } from '../../events/services/sse.service';
import { SSEEventType } from '../../../../src/types';

@Injectable()
export class LocalLlmService {
  private readonly logger = new Logger(LocalLlmService.name);
  private llmManager: ReturnType<typeof getLocalLLMManager>;
  private currentlyLoadedModelId: string | null = null;

  constructor(private sseService: SseService) {
    this.llmManager = getLocalLLMManager();
  }

  async loadModel(modelId: string): Promise<{ message: string }> {
    try {
      await this.llmManager.loadModel(modelId);
      this.currentlyLoadedModelId = modelId;

      // Broadcast model updates to connected clients
      this.sseService.broadcast('unified-events', {
        type: SSEEventType.MODELS_UPDATED,
        timestamp: Date.now(),
      });

      this.logger.log(`Model loaded successfully: ${modelId}`);
      return { message: 'Model loaded successfully' };
    } catch (error) {
      this.logger.error('Error loading model:', error);
      throw error;
    }
  }

  async unloadModel(modelId: string): Promise<{ message: string }> {
    try {
      await this.llmManager.unloadModel(modelId);

      if (this.currentlyLoadedModelId === modelId) {
        this.currentlyLoadedModelId = null;
      }

      // Broadcast model updates to connected clients
      this.sseService.broadcast('unified-events', {
        type: SSEEventType.MODELS_UPDATED,
        timestamp: Date.now(),
      });

      this.logger.log(`Model unloaded successfully: ${modelId}`);
      return { message: 'Model unloaded successfully' };
    } catch (error) {
      this.logger.error('Error unloading model:', error);
      throw error;
    }
  }

  async unloadCurrentModel(): Promise<{ message: string }> {
    if (!this.currentlyLoadedModelId) {
      return { message: 'No model is currently loaded' };
    }

    return this.unloadModel(this.currentlyLoadedModelId);
  }

  async getModelStatus(modelId: string) {
    try {
      const status = await this.llmManager.getModelStatus(modelId);
      const runtimeInfo = await this.llmManager.getModelRuntimeInfo(modelId);
      return { ...status, runtimeInfo };
    } catch (error) {
      this.logger.error('Error getting model status:', error);
      throw error;
    }
  }

  async getLocalModels() {
    try {
      return await this.llmManager.getLocalModels();
    } catch (error) {
      this.logger.error('Error getting local models:', error);
      throw error;
    }
  }

  async generateResponse(
    modelId: string,
    messages: Array<{ role: string; content: string }>,
    options?: {
      temperature?: number;
      maxTokens?: number;
      signal?: AbortSignal;
    }
  ) {
    try {
      return await this.llmManager.generateResponse(modelId, messages, options);
    } catch (error) {
      this.logger.error('Error generating response:', error);
      throw error;
    }
  }

  async *generateStreamResponse(
    modelId: string,
    messages: Array<{ role: string; content: string }>,
    options?: {
      temperature?: number;
      maxTokens?: number;
      threadId?: string;
      signal?: AbortSignal;
    }
  ) {
    try {
      for await (const token of this.llmManager.generateStreamResponse(
        modelId,
        messages,
        options
      )) {
        yield token;
      }
    } catch (error) {
      this.logger.error('Error generating stream response:', error);
      throw error;
    }
  }

  async getAvailableModels() {
    try {
      return await this.llmManager.getAvailableModels();
    } catch (error) {
      this.logger.error('Error getting available models:', error);
      throw error;
    }
  }

  async deleteModel(modelId: string) {
    try {
      await this.llmManager.deleteModel(modelId);

      // Broadcast model updates to connected clients
      this.sseService.broadcast('unified-events', {
        type: SSEEventType.MODELS_UPDATED,
        timestamp: Date.now(),
      });

      this.logger.log(`Model deleted successfully: ${modelId}`);
      return { message: 'Model deleted successfully' };
    } catch (error) {
      this.logger.error('Error deleting model:', error);
      throw error;
    }
  }

  async getModelSettings(modelId: string) {
    try {
      return await this.llmManager.getModelSettings(modelId);
    } catch (error) {
      this.logger.error('Error getting model settings:', error);
      throw error;
    }
  }

  async setModelSettings(modelId: string, settings: Record<string, unknown>) {
    try {
      await this.llmManager.setModelSettings(modelId, settings);

      this.logger.log(`Model settings updated: ${modelId}`);
      return { message: 'Model settings updated successfully', settings };
    } catch (error) {
      this.logger.error('Error setting model settings:', error);
      throw error;
    }
  }

  getCurrentlyLoadedModelId(): string | null {
    return this.currentlyLoadedModelId;
  }

  async getLoadedModel() {
    if (!this.currentlyLoadedModelId) {
      return {
        loaded: false,
        modelPath: null,
        modelInfo: null,
      };
    }

    try {
      const status = await this.llmManager.getModelStatus(
        this.currentlyLoadedModelId
      );
      const models = await this.llmManager.getLocalModels();
      const modelInfo = models.find(m => m.id === this.currentlyLoadedModelId);

      return {
        loaded: true,
        modelPath: modelInfo?.path || null,
        modelInfo,
        ...status,
      };
    } catch (error) {
      this.logger.error('Error getting loaded model info:', error);
      return {
        loaded: false,
        modelPath: null,
        modelInfo: null,
      };
    }
  }
}
