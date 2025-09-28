import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LoadModelDto,
  ModelSettingsDto,
  GenerateResponseDto,
} from '../dto/llm.dto';
import { SseService } from '../../events/services/sse.service';
import { getLocalLLMManager } from '../../../localLlmSingleton';
import type { LLMWorkerProxy } from '../../../llmWorkerProxy';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { existsSync } from 'fs';

export interface LocalModelInfo {
  id: string;
  name: string;
  filename: string;
  path: string;
  size: number;
  downloaded: boolean;
  downloading: boolean;
  trainedContextLength?: number;
  maxContextLength?: number;
  parameterCount?: string;
  quantization?: string;
  layerCount?: number;
}

export interface ModelLoadingSettings {
  gpuLayers?: number;
  contextSize?: number;
  batchSize?: number;
  threads?: number;
  temperature?: number;
}

export interface LoadedModelInfo {
  modelPath: string;
  modelInfo: LocalModelInfo;
  settings: ModelLoadingSettings;
  loadedAt: Date;
  lastUsedAt: Date;
  contextSize: number;
  gpuLayers: number;
}

@Injectable()
export class LlmService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LlmService.name);
  private abortControllers = new Map<string, AbortController>();
  private loadedModel: LoadedModelInfo | null = null;
  private modelDirectory: string;
  private settingsPath: string;
  private modelSettings = new Map<string, ModelLoadingSettings>();
  private activeGenerations = new Map<
    string,
    { threadId: string; startTime: Date }
  >();
  private llmManager: LLMWorkerProxy;

  constructor(
    private configService: ConfigService,
    private sseService: SseService
  ) {
    const homeDir = os.homedir();
    this.modelDirectory = path.join(homeDir, '.mindstrike', 'models');
    this.settingsPath = path.join(
      homeDir,
      '.mindstrike',
      'model-settings.json'
    );
    this.llmManager = getLocalLLMManager();
  }

  async onModuleInit() {
    await this.ensureDirectories();
    await this.loadSettings();

    // Initialize model fetcher to load HuggingFace token
    try {
      const { modelFetcher } = await import('../../../modelFetcher');
      await modelFetcher.initialize();
      this.logger.log('Model fetcher initialized');
    } catch (error) {
      this.logger.warn('Failed to initialize model fetcher:', error);
    }
  }

  async onModuleDestroy() {
    // Clean up any active generations
    for (const controller of this.abortControllers.values()) {
      controller.abort();
    }
    this.abortControllers.clear();
    this.activeGenerations.clear();
  }

  private async ensureDirectories() {
    try {
      await fs.mkdir(this.modelDirectory, { recursive: true });
    } catch (error) {
      this.logger.error('Failed to create model directory:', error);
    }
  }

  private async loadSettings() {
    try {
      if (existsSync(this.settingsPath)) {
        const data = await fs.readFile(this.settingsPath, 'utf-8');
        const settings = JSON.parse(data) as Record<
          string,
          ModelLoadingSettings
        >;
        this.modelSettings = new Map(Object.entries(settings));
        this.logger.log(
          `Loaded settings for ${this.modelSettings.size} models`
        );
      }
    } catch (error) {
      this.logger.error('Failed to load model settings:', error);
    }
  }

  private async saveSettings() {
    try {
      const settings: Record<string, ModelLoadingSettings> = {};
      for (const [id, setting] of this.modelSettings.entries()) {
        settings[id] = setting;
      }
      await fs.writeFile(this.settingsPath, JSON.stringify(settings, null, 2));
    } catch (error) {
      this.logger.error('Failed to save model settings:', error);
    }
  }

  async getLoadedModel() {
    const memoryUsage = process.memoryUsage();

    if (!this.loadedModel) {
      return {
        loaded: false,
        modelPath: null,
        modelInfo: null,
        memoryUsage: {
          rss: Math.round(memoryUsage.rss / 1024 / 1024),
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          external: Math.round(memoryUsage.external / 1024 / 1024),
        },
      };
    }

    return {
      loaded: true,
      modelPath: this.loadedModel.modelPath,
      modelInfo: this.loadedModel.modelInfo,
      settings: this.loadedModel.settings,
      loadedAt: this.loadedModel.loadedAt,
      lastUsedAt: this.loadedModel.lastUsedAt,
      memoryUsage: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        external: Math.round(memoryUsage.external / 1024 / 1024),
      },
    };
  }

  async loadModel(dto: LoadModelDto) {
    const { modelPath, ...settings } = dto;

    try {
      // Unload current model if one is loaded
      if (this.loadedModel) {
        await this.unloadModel();
      }

      this.logger.log(`Loading model: ${modelPath}`);

      // Load model using the real LocalLLMManager
      const modelId = path.basename(modelPath, path.extname(modelPath));
      await this.llmManager.loadModel(modelId);

      // Get model info from LLM manager
      const localModels = await this.llmManager.getLocalModels();
      const modelInfo = localModels.find(m => m.id === modelId);

      if (!modelInfo) {
        throw new NotFoundException(`Model not found: ${modelPath}`);
      }

      // Determine optimal settings
      const modelSettings: ModelLoadingSettings = {
        gpuLayers: settings.gpuLayers ?? 0,
        contextSize: settings.contextSize ?? 2048,
        batchSize: settings.batchSize ?? 512,
        threads: settings.threads ?? Math.min(4, os.cpus().length),
        temperature: settings.temperature ?? 0.7,
      };

      // Store the loaded model info
      this.loadedModel = {
        modelPath: modelInfo.path,
        modelInfo,
        settings: modelSettings,
        loadedAt: new Date(),
        lastUsedAt: new Date(),
        contextSize: modelSettings.contextSize!,
        gpuLayers: modelSettings.gpuLayers!,
      };

      // Save settings for this model
      this.modelSettings.set(modelInfo.id, modelSettings);
      await this.saveSettings();

      // Broadcast model loaded event
      this.sseService.broadcast('model-status', {
        type: 'model-loaded',
        modelPath: modelInfo.path,
        modelInfo,
        settings: modelSettings,
        timestamp: new Date(),
      });

      this.logger.log(`Model loaded successfully: ${modelPath}`);

      return {
        success: true,
        message: `Model ${modelInfo.name} loaded successfully`,
        modelInfo,
        settings: modelSettings,
      };
    } catch (error) {
      this.logger.error(`Failed to load model ${modelPath}:`, error);
      throw error;
    }
  }

  async unloadModel() {
    if (!this.loadedModel) {
      return {
        success: false,
        message: 'No model is currently loaded',
      };
    }

    const modelName = this.loadedModel.modelInfo.name;
    const modelId = this.loadedModel.modelInfo.id;
    this.logger.log(`Unloading model: ${modelName}`);

    try {
      // Abort any active generations
      for (const [id, controller] of this.abortControllers.entries()) {
        controller.abort();
        this.logger.debug(`Aborted generation: ${id}`);
      }
      this.abortControllers.clear();
      this.activeGenerations.clear();

      // Unload model using the real LocalLLMManager
      await this.llmManager.unloadModel(modelId);

      // Clear loaded model
      this.loadedModel = null;

      // Broadcast model unloaded event
      this.sseService.broadcast('model-status', {
        type: 'model-unloaded',
        modelName,
        timestamp: new Date(),
      });

      this.logger.log(`Model unloaded successfully: ${modelName}`);

      return {
        success: true,
        message: `Model ${modelName} unloaded successfully`,
      };
    } catch (error) {
      this.logger.error(`Failed to unload model ${modelName}:`, error);
      throw error;
    }
  }

  async getModelSettings(modelPath: string) {
    const modelId = path.basename(modelPath, path.extname(modelPath));
    const settings = this.modelSettings.get(modelId);

    if (settings) {
      return settings;
    }

    // Return default settings if not found
    return {
      gpuLayers: 0,
      contextSize: 2048,
      batchSize: 512,
      threads: Math.min(4, os.cpus().length),
      temperature: 0.7,
    };
  }

  async updateModelSettings(modelPath: string, settings: ModelSettingsDto) {
    const modelId = path.basename(modelPath, path.extname(modelPath));

    const currentSettings = this.modelSettings.get(modelId) || {};
    const updatedSettings = { ...currentSettings, ...settings };

    this.modelSettings.set(modelId, updatedSettings);
    await this.saveSettings();

    // If this is the currently loaded model, update its settings
    if (this.loadedModel && this.loadedModel.modelInfo.id === modelId) {
      this.loadedModel.settings = updatedSettings;

      // Broadcast settings update
      this.sseService.broadcast('model-status', {
        type: 'settings-updated',
        modelId,
        settings: updatedSettings,
        timestamp: new Date(),
      });
    }

    this.logger.log(`Updated settings for model: ${modelId}`);

    return {
      success: true,
      message: `Settings updated for ${modelPath}`,
      settings: updatedSettings,
    };
  }

  async generateResponse(dto: GenerateResponseDto) {
    const { prompt, threadId, stream, ...options } = dto;

    if (!this.loadedModel) {
      throw new BadRequestException('No model is currently loaded');
    }

    const generationId = threadId ?? `gen-${Date.now()}`;
    const abortController = new AbortController();

    // Store abort controller for this generation
    this.abortControllers.set(generationId, abortController);
    this.activeGenerations.set(generationId, {
      threadId: generationId,
      startTime: new Date(),
    });

    // Update last used time
    this.loadedModel.lastUsedAt = new Date();

    this.logger.log(`Generating response for thread: ${generationId}`);

    try {
      // Apply temperature from options or use model settings
      const temperature =
        options.temperature ?? this.loadedModel.settings.temperature ?? 0.7;
      const maxTokens = options.maxTokens ?? 1024;

      if (stream) {
        // Streaming response using LocalLLMManager
        const response = await this.generateStreamingResponse(
          prompt,
          generationId,
          temperature,
          maxTokens,
          abortController.signal
        );

        return {
          success: true,
          response,
          streamed: true,
          modelUsed: this.loadedModel.modelInfo.name,
          tokensGenerated: response.split(' ').length,
        };
      } else {
        // Generate complete response using LocalLLMManager
        const response = await this.generateCompleteResponse(
          prompt,
          temperature,
          maxTokens,
          abortController.signal
        );

        return {
          success: true,
          response,
          streamed: false,
          modelUsed: this.loadedModel.modelInfo.name,
          tokensGenerated: response.split(' ').length,
        };
      }
    } finally {
      // Clean up
      this.abortControllers.delete(generationId);
      this.activeGenerations.delete(generationId);
    }
  }

  private async generateStreamingResponse(
    prompt: string,
    generationId: string,
    temperature: number,
    maxTokens: number,
    signal: AbortSignal
  ): Promise<string> {
    if (!this.loadedModel) {
      throw new BadRequestException('No model is currently loaded');
    }

    const messages = [{ role: 'user', content: prompt }];
    let fullResponse = '';

    try {
      const responseGenerator = this.llmManager.generateStreamResponse(
        this.loadedModel.modelInfo.id,
        messages,
        {
          temperature,
          maxTokens,
          threadId: generationId,
          signal,
        }
      );

      for await (const token of responseGenerator) {
        if (signal.aborted) {
          this.sseService.broadcast(`llm-stream-${generationId}`, {
            type: 'aborted',
            reason: 'User cancelled generation',
          });
          break;
        }

        fullResponse += token;

        // Broadcast token
        this.sseService.broadcast(`llm-stream-${generationId}`, {
          type: 'token',
          content: token,
          tokenCount: fullResponse.split(' ').length,
        });
      }

      if (!signal.aborted) {
        this.sseService.broadcast(`llm-stream-${generationId}`, {
          type: 'complete',
          content: fullResponse,
          tokenCount: fullResponse.split(' ').length,
        });
      }

      return fullResponse;
    } catch (error) {
      this.logger.error('Error in streaming response generation:', error);
      throw new BadRequestException('Failed to generate streaming response');
    }
  }

  private async generateCompleteResponse(
    prompt: string,
    temperature: number,
    maxTokens: number,
    signal: AbortSignal
  ): Promise<string> {
    if (!this.loadedModel) {
      throw new BadRequestException('No model is currently loaded');
    }

    const messages = [{ role: 'user', content: prompt }];

    try {
      return await this.llmManager.generateResponse(
        this.loadedModel.modelInfo.id,
        messages,
        {
          temperature,
          maxTokens,
          signal,
        }
      );
    } catch (error) {
      this.logger.error('Error in response generation:', error);
      throw new BadRequestException('Failed to generate response');
    }
  }

  async abortGeneration(threadId: string) {
    const controller = this.abortControllers.get(threadId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(threadId);

      // Send abort event
      this.sseService.broadcast(`llm-stream-${threadId}`, {
        type: 'aborted',
      });

      return {
        success: true,
        message: 'Generation aborted',
      };
    }

    return {
      success: false,
      message: 'No active generation found for this thread',
    };
  }

  async deleteModel(modelPath: string) {
    // If this is the loaded model, unload it first
    if (this.loadedModel && this.loadedModel.modelPath === modelPath) {
      await this.unloadModel();
    }

    const fullPath = path.isAbsolute(modelPath)
      ? modelPath
      : path.join(this.modelDirectory, modelPath);

    try {
      await fs.unlink(fullPath);

      // Remove settings for this model
      const modelId = path.basename(modelPath, path.extname(modelPath));
      this.modelSettings.delete(modelId);
      await this.saveSettings();

      this.logger.log(`Deleted model: ${modelPath}`);

      return {
        success: true,
        message: `Model ${path.basename(modelPath)} deleted successfully`,
      };
    } catch (error) {
      this.logger.error(`Failed to delete model: ${modelPath}`, error);
      throw new BadRequestException(`Failed to delete model: ${error}`);
    }
  }

  async getSystemInfo() {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    // Check for GPU (simplified - would need actual GPU detection)
    const hasGPU =
      process.platform === 'darwin' || // macOS with Metal
      process.platform === 'win32'; // Windows likely has GPU

    const cpuCores = cpus.length;
    const recommendedThreads = Math.min(4, Math.floor(cpuCores / 2));
    const recommendedContext = freeMem > 8 * 1024 * 1024 * 1024 ? 4096 : 2048;

    return {
      gpuInfo: {
        available: hasGPU,
        type: hasGPU
          ? process.platform === 'darwin'
            ? 'Metal'
            : 'CUDA/DirectX'
          : 'None',
      },
      cpuInfo: {
        cores: cpuCores,
        model: cpus[0]?.model || 'Unknown',
        speed: cpus[0]?.speed || 0,
      },
      memoryInfo: {
        total: Math.round(totalMem / 1024 / 1024),
        available: Math.round(freeMem / 1024 / 1024),
        used: Math.round((totalMem - freeMem) / 1024 / 1024),
      },
      platform: process.platform,
      arch: process.arch,
      recommendedSettings: {
        gpuLayers: hasGPU ? 20 : 0,
        contextSize: recommendedContext,
        threads: recommendedThreads,
        batchSize: 512,
      },
    };
  }

  /**
   * Get list of local models using the real LocalLLMManager
   */
  async getLocalModels(): Promise<LocalModelInfo[]> {
    try {
      return await this.llmManager.getLocalModels();
    } catch (error) {
      this.logger.error('Failed to get local models:', error);
      return [];
    }
  }

  private estimateParameterCount(sizeInBytes: number): string {
    const sizeInGB = sizeInBytes / (1024 * 1024 * 1024);

    // Rough estimation based on file size
    if (sizeInGB < 2) {
      return '1B';
    }
    if (sizeInGB < 4) {
      return '3B';
    }
    if (sizeInGB < 6) {
      return '7B';
    }
    if (sizeInGB < 10) {
      return '13B';
    }
    if (sizeInGB < 20) {
      return '30B';
    }
    if (sizeInGB < 40) {
      return '65B';
    }
    return '70B+';
  }

  private detectQuantization(filename: string): string {
    const lower = filename.toLowerCase();

    if (lower.includes('q2')) {
      return 'Q2';
    }
    if (lower.includes('q3')) {
      return 'Q3';
    }
    if (lower.includes('q4_0')) {
      return 'Q4_0';
    }
    if (lower.includes('q4_1')) {
      return 'Q4_1';
    }
    if (lower.includes('q4_k_m')) {
      return 'Q4_K_M';
    }
    if (lower.includes('q4_k_s')) {
      return 'Q4_K_S';
    }
    if (lower.includes('q4')) {
      return 'Q4';
    }
    if (lower.includes('q5_0')) {
      return 'Q5_0';
    }
    if (lower.includes('q5_1')) {
      return 'Q5_1';
    }
    if (lower.includes('q5_k_m')) {
      return 'Q5_K_M';
    }
    if (lower.includes('q5_k_s')) {
      return 'Q5_K_S';
    }
    if (lower.includes('q5')) {
      return 'Q5';
    }
    if (lower.includes('q6_k')) {
      return 'Q6_K';
    }
    if (lower.includes('q6')) {
      return 'Q6';
    }
    if (lower.includes('q8')) {
      return 'Q8';
    }
    if (lower.includes('f16')) {
      return 'F16';
    }
    if (lower.includes('f32')) {
      return 'F32';
    }

    return 'Unknown';
  }

  /**
   * Get active generation status
   */
  async getActiveGenerations() {
    const generations = [];

    for (const [id, info] of this.activeGenerations.entries()) {
      generations.push({
        id,
        threadId: info.threadId,
        startTime: info.startTime,
        duration: Date.now() - info.startTime.getTime(),
        canAbort: this.abortControllers.has(id),
      });
    }

    return generations;
  }

  async getOptimalSettings(modelId: string) {
    try {
      const systemInfo = await this.getSystemInfo();
      const modelInfo = await this.llmManager.getModelInfo(modelId);

      // Calculate optimal settings based on system resources and model size
      const gpuLayers = systemInfo.gpuInfo.available
        ? Math.min(35, Math.floor(modelInfo.layerCount || 32))
        : 0;

      const contextSize = Math.min(
        4096,
        systemInfo.memoryInfo.available > 8192 ? 4096 : 2048
      );

      const threads = Math.min(
        systemInfo.cpuInfo.cores,
        Math.floor(systemInfo.cpuInfo.cores / 2)
      );

      return {
        gpuLayers,
        contextSize,
        threads,
      };
    } catch (error) {
      this.logger.error('Error getting optimal settings:', error);
      throw error;
    }
  }

  async getAllSettings() {
    try {
      await this.loadSettings();
      const settings: Record<string, ModelLoadingSettings> = {};

      for (const [modelId, modelSettings] of this.modelSettings) {
        settings[modelId] = modelSettings;
      }

      return settings;
    } catch (error) {
      this.logger.error('Error getting all settings:', error);
      throw error;
    }
  }

  async generateStream(
    modelId: string,
    generateDto: GenerateResponseDto,
    res: import('express').Response
  ) {
    try {
      const { prompt, threadId, ...options } = generateDto;

      // Set up SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      const generationId = threadId ?? `gen-${Date.now()}`;
      const abortController = new AbortController();

      this.abortControllers.set(generationId, abortController);
      this.activeGenerations.set(generationId, {
        threadId: generationId,
        startTime: new Date(),
      });

      try {
        // Generate streaming response
        const responseStream = await this.llmManager.generateStreamingResponse(
          modelId,
          [{ role: 'user', content: prompt }],
          {
            temperature: options.temperature ?? 0.7,
            maxTokens: options.maxTokens ?? 1024,
            signal: abortController.signal,
          }
        );

        // Stream the response
        for await (const chunk of responseStream) {
          res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
        }

        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      } finally {
        this.abortControllers.delete(generationId);
        this.activeGenerations.delete(generationId);
      }
    } catch (error) {
      this.logger.error('Error generating stream:', error);
      res.write(
        `data: ${JSON.stringify({
          error: error instanceof Error ? error.message : 'Unknown error',
        })}\n\n`
      );
      res.end();
    }
  }
}
