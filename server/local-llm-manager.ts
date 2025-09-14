import { getLlama, LlamaModel, LlamaContext, LlamaChatSession } from 'node-llama-cpp';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createHash } from 'crypto';
import { getLocalModelsDirectory } from './utils/settings-directory.js';
import { modelFetcher, DynamicModelInfo } from './model-fetcher.js';
import { logger } from './logger.js';

export interface LocalModelInfo {
  id: string;
  name: string;
  filename: string;
  path: string;
  size: number;
  downloaded: boolean;
  downloading: boolean;
  downloadProgress?: number;
  modelType: string;
  contextLength?: number;
  parameterCount?: string;
  quantization?: string;
}

export interface ModelDownloadInfo {
  name: string;
  url: string;
  filename: string;
  size?: number;
  description?: string;
  modelType: string;
  contextLength?: number;
  parameterCount?: string;
  quantization?: string;
}



export class LocalLLMManager {
  private modelsDir: string;
  private activeModels = new Map<string, { model: LlamaModel; context: LlamaContext; session: LlamaChatSession }>();
  private downloadingModels = new Set<string>();
  private downloadControllers = new Map<string, AbortController>();
  private downloadProgress = new Map<string, { progress: number; speed: string }>();

  constructor() {
    // Use a dedicated directory for local LLM models
    this.modelsDir = getLocalModelsDirectory();
    this.ensureModelsDirectory();
  }

  private ensureModelsDirectory() {
    if (!fs.existsSync(this.modelsDir)) {
      fs.mkdirSync(this.modelsDir, { recursive: true });
    }
  }

  /**
   * Get all locally available models
   */
  async getLocalModels(): Promise<LocalModelInfo[]> {
    const models: LocalModelInfo[] = [];

    if (!fs.existsSync(this.modelsDir)) {
      return models;
    }

    const files = fs.readdirSync(this.modelsDir);
    const ggufFiles = files.filter(file => file.endsWith('.gguf'));

    for (const filename of ggufFiles) {
      const fullPath = path.join(this.modelsDir, filename);
      const stats = fs.statSync(fullPath);
      
      // Generate a unique ID for this model
      const id = createHash('md5').update(fullPath).digest('hex');
      
      // Try to extract model info from filename
      const modelInfo = this.parseModelFilename(filename);
      
      // Try to get remote model info from cache if available
      const remoteModels = await modelFetcher.getAvailableModels();
      const matchingRemoteModel = remoteModels.find(rm => rm.filename === filename);
      
      models.push({
        id,
        name: matchingRemoteModel?.name || modelInfo.name || filename.replace('.gguf', ''),
        filename,
        path: fullPath,
        size: stats.size,
        downloaded: true,
        downloading: false,
        modelType: matchingRemoteModel?.modelType || modelInfo.modelType || 'unknown',
        contextLength: matchingRemoteModel?.contextLength || modelInfo.contextLength,
        parameterCount: matchingRemoteModel?.parameterCount || modelInfo.parameterCount,
        quantization: matchingRemoteModel?.quantization || modelInfo.quantization
      });
    }

    return models;
  }

  /**
   * Get available models for download (dynamic from Hugging Face)
   */
  async getAvailableModels(): Promise<(ModelDownloadInfo | DynamicModelInfo)[]> {
    try {
      // Get dynamic models from Hugging Face
      const dynamicModels = await modelFetcher.getAvailableModels();
      return dynamicModels;
    } catch (error) {
      logger.error('Failed to fetch dynamic models:', error);
      throw error;
    }
  }

  /**
   * Search for models by query
   */
  async searchModels(query: string): Promise<(ModelDownloadInfo | DynamicModelInfo)[]> {
    try {
      const dynamicModels = await modelFetcher.searchModels(query);
      
      // For search results, don't include static models - just return the search results
      return dynamicModels;
    } catch (error) {
      logger.error('Failed to search models:', error);
      throw error;
    }
  }

  /**
   * Download a model
   */
  async downloadModel(
    modelInfo: ModelDownloadInfo | DynamicModelInfo,
    onProgress?: (progress: number, speed?: string) => void
  ): Promise<string> {
    const filename = modelInfo.filename;
    const outputPath = path.join(this.modelsDir, filename);
    
    // Check if already exists
    if (fs.existsSync(outputPath)) {
      throw new Error('Model already exists');
    }

    // Check if already downloading
    if (this.downloadingModels.has(filename)) {
      throw new Error('Model is already being downloaded');
    }

    this.downloadingModels.add(filename);
    
    // Create abort controller for this download
    const abortController = new AbortController();
    this.downloadControllers.set(filename, abortController);

    try {
      console.log(`Starting download of ${modelInfo.name}...`);
      
      // Get Hugging Face token if available
      const headers: Record<string, string> = {
        'User-Agent': 'mindstrike-local-llm/1.0'
      };
      
      try {
        const { modelFetcher } = await import('./model-fetcher.js');
        if (modelFetcher.hasHuggingFaceToken()) {
          // Note: We don't expose the actual token, just check if it exists
          const fs = await import('fs/promises');
          const path = await import('path');
          const { getMindstrikeDirectory } = await import('./utils/settings-directory.js');
          
          const tokenFile = path.join(getMindstrikeDirectory(), 'hf-token');
          const token = await fs.readFile(tokenFile, 'utf-8');
          headers['Authorization'] = `Bearer ${token.trim()}`;
        }
      } catch (error) {
        logger.debug('No Hugging Face token available for download');
      }
      
      const response = await fetch(modelInfo.url, {
        signal: abortController.signal,
        headers
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('UNAUTHORIZED_HF_TOKEN_REQUIRED');
        } else if (response.status === 403) {
          throw new Error('FORBIDDEN_MODEL_ACCESS_REQUIRED');
        } else {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
      }

      const contentLength = response.headers.get('Content-Length');
      const totalSize = contentLength ? parseInt(contentLength, 10) : 0;
      
      const fileStream = fs.createWriteStream(outputPath);
      const reader = response.body?.getReader();
      
      if (!reader) {
        throw new Error('No response body');
      }

      let downloadedBytes = 0;
      let lastUpdate = Date.now();
      let lastBytes = 0;

      while (true) {
        if (abortController.signal.aborted) {
          fileStream.destroy();
          throw new Error('Download cancelled');
        }
        
        const { done, value } = await reader.read();
        
        if (done) break;
        
        fileStream.write(value);
        downloadedBytes += value.length;
        
        const now = Date.now();
        const timeDiff = now - lastUpdate;
        
        if (totalSize > 0 && timeDiff >= 1000) { // Update every second
          const progress = (downloadedBytes / totalSize) * 100;
          const bytesDiff = downloadedBytes - lastBytes;
          const speed = this.formatSpeed(bytesDiff / (timeDiff / 1000));
          
          this.downloadProgress.set(filename, { progress: Math.round(progress), speed });
          
          if (onProgress) {
            onProgress(Math.round(progress), speed);
          }
          
          lastUpdate = now;
          lastBytes = downloadedBytes;
        }
      }

      fileStream.end();
      
      // Final progress update
      if (totalSize > 0) {
        this.downloadProgress.set(filename, { progress: 100, speed: '0 B/s' });
        if (onProgress) {
          onProgress(100, '0 B/s');
        }
      }
      
      console.log(`Successfully downloaded ${modelInfo.name} to ${outputPath}`);
      return outputPath;
      
    } catch (error) {
      // Clean up partial download
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
      
      if (error instanceof Error && error.message === 'Download cancelled') {
        console.log(`Download cancelled: ${filename}`);
      } else {
        console.error(`Download failed: ${filename}`, error);
      }
      
      throw error;
    } finally {
      this.downloadingModels.delete(filename);
      this.downloadControllers.delete(filename);
      this.downloadProgress.delete(filename);
    }
  }

  /**
   * Delete a local model
   */
  async deleteModel(modelId: string): Promise<void> {
    const models = await this.getLocalModels();
    const model = models.find(m => m.id === modelId);
    
    if (!model) {
      throw new Error('Model not found');
    }

    // Close the model if it's active
    if (this.activeModels.has(modelId)) {
      const activeModel = this.activeModels.get(modelId)!;
      activeModel.context.dispose();
      this.activeModels.delete(modelId);
    }

    // Delete the file
    fs.unlinkSync(model.path);
  }

  /**
   * Load a model for inference (supports both model ID and model name)
   */
  async loadModel(modelIdOrName: string): Promise<void> {
    // Try to find by ID first
    let modelInfo: any = null;
    const models = await this.getLocalModels();
    
    modelInfo = models.find(m => m.id === modelIdOrName);
    
    // If not found by ID, try by name
    if (!modelInfo) {
      modelInfo = models.find(m => m.name === modelIdOrName || m.filename === modelIdOrName);
    }
    
    if (!modelInfo) {
      throw new Error('Model not found');
    }

    // Use the actual model ID for storage
    const modelId = modelInfo.id;
    
    if (this.activeModels.has(modelId)) {
      return; // Already loaded
    }

    // Unload all other models first to free up memory
    // This ensures only one local model is loaded at a time
    const otherModelIds = Array.from(this.activeModels.keys()).filter(id => id !== modelId);
    for (const otherModelId of otherModelIds) {
      console.log(`Unloading previous model: ${otherModelId}`);
      await this.unloadModel(otherModelId);
    }

    console.log(`Loading model: ${modelInfo.name}`);
    
    const llama = await getLlama();
    const model = await llama.loadModel({
      modelPath: modelInfo.path
    });

    const context = await model.createContext({
      contextSize: modelInfo.contextLength || 4096
    });

    const session = new LlamaChatSession({
      contextSequence: context.getSequence()
    });

    this.activeModels.set(modelId, { model, context, session });
    console.log(`Model loaded successfully: ${modelInfo.name}`);
  }

  /**
   * Unload a model
   */
  async unloadModel(modelId: string): Promise<void> {
    const activeModel = this.activeModels.get(modelId);
    if (!activeModel) {
      return; // Not loaded
    }

    activeModel.context.dispose();
    this.activeModels.delete(modelId);
    console.log(`Model unloaded: ${modelId}`);
  }

  /**
   * Find model ID by name (filename without extension)
   */
  private async findModelIdByName(modelName: string): Promise<string | null> {
    const models = await this.getLocalModels();
    const model = models.find(m => m.name === modelName || m.filename === modelName);
    return model ? model.id : null;
  }

  /**
   * Generate response using a loaded model (supports both model ID and model name)
   */
  async generateResponse(
    modelIdOrName: string,
    messages: Array<{ role: string; content: string }>,
    options?: {
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<string> {
    // Removed verbose logging - only log errors and important events

    // First try to use it as an ID
    let activeModel = this.activeModels.get(modelIdOrName);
    
    // If not found, try to find by name
    if (!activeModel) {
      const modelId = await this.findModelIdByName(modelIdOrName);
      if (modelId) {
        activeModel = this.activeModels.get(modelId);
      }
    }
    
    if (!activeModel) {
      logger.error('Model not loaded', { modelIdOrName, activeModelKeys: Array.from(this.activeModels.keys()) });
      throw new Error('Model not loaded. Please load the model first.');
    }

    // Removed verbose logging

    // Use proper chat session with message history
    const { session } = activeModel;
    
    // Process messages in order to build conversation context
    let systemMessage = '';
    let lastUserMessage = '';
    
    for (const message of messages) {
      if (message.role === 'system') {
        systemMessage = message.content;
      } else if (message.role === 'user') {
        lastUserMessage = message.content;
      } else if (message.role === 'assistant') {
        // Previous assistant responses are part of conversation history
        // The session should maintain this context automatically
        continue;
      }
    }
    
    if (!lastUserMessage) {
      logger.error('No user message found in messages', { messages });
      throw new Error('No user message found');
    }

    // For LlamaChatSession, combine system and user message without chat formatting
    // The session.prompt() method handles chat formatting internally
    const finalPrompt = systemMessage 
      ? `${systemMessage}\n\n${lastUserMessage}` 
      : lastUserMessage;

    // Removed verbose logging

    // Removed verbose logging

    const response = await session.prompt(finalPrompt, {
      temperature: options?.temperature || 0.7,
      maxTokens: options?.maxTokens || 2048
    });

    // Removed verbose logging

    return response;
  }

  /**
   * Generate streaming response (supports both model ID and model name)
   */
  async *generateStreamResponse(
    modelIdOrName: string,
    messages: Array<{ role: string; content: string }>,
    options?: {
      temperature?: number;
      maxTokens?: number;
    }
  ): AsyncGenerator<string> {
    // First try to use it as an ID
    let activeModel = this.activeModels.get(modelIdOrName);
    
    // If not found, try to find by name
    if (!activeModel) {
      const modelId = await this.findModelIdByName(modelIdOrName);
      if (modelId) {
        activeModel = this.activeModels.get(modelId);
      }
    }
    
    if (!activeModel) {
      throw new Error('Model not loaded. Please load the model first.');
    }

    // Use proper chat session with message history
    const { session } = activeModel;
    
    // Process messages to find the last user message
    let lastUserMessage = '';
    
    for (const message of messages) {
      if (message.role === 'system') {
        // System messages should be handled at session creation, skip for now
        continue;
      } else if (message.role === 'user') {
        lastUserMessage = message.content;
      } else if (message.role === 'assistant') {
        // Previous assistant responses are part of conversation history
        // The session should maintain this context automatically
        continue;
      }
    }
    
    if (!lastUserMessage) {
      throw new Error('No user message found');
    }

    // Generate streaming response
    // Since node-llama-cpp doesn't have proper streaming yet, we'll simulate it
    // by yielding the response character by character with small delays
    const response = await session.prompt(lastUserMessage, {
      temperature: options?.temperature || 0.7,
      maxTokens: options?.maxTokens || 2048
    });
    
    // Simulate streaming by yielding characters/words with small delays
    const words = response.split(' ');
    let currentText = '';
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      currentText += (i === 0 ? '' : ' ') + word;
      
      // Yield word by word for more realistic streaming
      yield (i === 0 ? '' : ' ') + word;
      
      // Add a small delay to simulate real streaming (only if not the last word)
      if (i < words.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 50)); // 50ms delay between words
      }
    }
  }

  /**
   * Get model info and status
   */
  async getModelStatus(modelId: string): Promise<{
    loaded: boolean;
    info?: LocalModelInfo;
  }> {
    const models = await this.getLocalModels();
    const info = models.find(m => m.id === modelId);
    
    return {
      loaded: this.activeModels.has(modelId),
      info
    };
  }

  /**
   * Parse model filename to extract metadata
   */
  private parseModelFilename(filename: string): {
    name?: string;
    modelType?: string;
    contextLength?: number;
    parameterCount?: string;
    quantization?: string;
  } {
    const lower = filename.toLowerCase();
    
    let name = filename.replace('.gguf', '');
    let modelType = 'unknown';
    let contextLength: number | undefined;
    let parameterCount: string | undefined;
    let quantization: string | undefined;

    // Enhanced model type detection
    if (lower.includes('code') || lower.includes('coder') || lower.includes('starcoder') || 
        lower.includes('codellama') || lower.includes('deepseek-coder') || lower.includes('phind')) {
      modelType = 'code';
    } else if (lower.includes('embed') || lower.includes('bge-') || lower.includes('e5-') || 
               lower.includes('sentence') || lower.includes('minilm')) {
      modelType = 'embedding';
    } else if (lower.includes('vision') || lower.includes('llava') || lower.includes('moondream') || 
               lower.includes('cogvlm') || lower.includes('qwen-vl') || lower.includes('minicpm-v')) {
      modelType = 'vision';
    } else if (lower.includes('chat') || lower.includes('instruct') || lower.includes('alpaca') || 
               lower.includes('vicuna') || lower.includes('mistral') || lower.includes('llama') || 
               lower.includes('gemma') || lower.includes('qwen') || lower.includes('phi-') || 
               lower.includes('yi-') || lower.includes('baichuan') || lower.includes('chatglm')) {
      modelType = 'chat';
    }

    // Extract parameter count
    const paramMatch = filename.match(/(\d+\.?\d*)B/i);
    if (paramMatch) {
      parameterCount = paramMatch[1] + 'B';
    }

    // Enhanced quantization extraction
    const quantPatterns = [
      /(Q\d+_[A-Z]+_?[A-Z]*)/i,
      /(IQ\d+_[A-Z]+_?[A-Z]*)/i,
      /(Q\d+)/i,
      /(IQ\d+)/i,
      /(f16|f32|fp16|fp32)/i
    ];
    
    for (const pattern of quantPatterns) {
      const match = filename.match(pattern);
      if (match) {
        quantization = match[1].toUpperCase();
        break;
      }
    }
    
    // Default quantization for GGUF files if none detected
    if (!quantization && lower.includes('.gguf')) {
      quantization = 'F16';
    }

    // Extract context length (if specified)
    const contextMatch = filename.match(/(\d+)k/i);
    if (contextMatch) {
      contextLength = parseInt(contextMatch[1]) * 1024;
    }

    return {
      name,
      modelType,
      contextLength,
      parameterCount,
      quantization
    };
  }

  /**
   * Cancel a download
   */
  cancelDownload(filename: string): boolean {
    const controller = this.downloadControllers.get(filename);
    if (controller) {
      controller.abort();
      return true;
    }
    return false;
  }

  /**
   * Get download progress for a model
   */
  getDownloadProgress(filename: string): { isDownloading: boolean; progress: number; speed?: string } {
    const isDownloading = this.downloadingModels.has(filename);
    const progressInfo = this.downloadProgress.get(filename);
    
    return {
      isDownloading,
      progress: progressInfo?.progress || 0,
      speed: progressInfo?.speed
    };
  }

  /**
   * Format download speed
   */
  private formatSpeed(bytesPerSecond: number): string {
    const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    let speed = bytesPerSecond;
    let unitIndex = 0;

    while (speed >= 1024 && unitIndex < units.length - 1) {
      speed /= 1024;
      unitIndex++;
    }

    return `${speed.toFixed(1)} ${units[unitIndex]}`;
  }


}
