import { getLlama, LlamaModel, LlamaContext, LlamaChatSession } from 'node-llama-cpp';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createHash } from 'crypto';
import { getLocalModelsDirectory } from './utils/settings-directory.js';

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

// Popular GGUF models for download
export const AVAILABLE_MODELS: ModelDownloadInfo[] = [
  {
    name: "Llama 2 7B Chat Q4_K_M",
    url: "https://huggingface.co/TheBloke/Llama-2-7B-Chat-GGUF/resolve/main/llama-2-7b-chat.Q4_K_M.gguf",
    filename: "llama-2-7b-chat.Q4_K_M.gguf",
    size: 4370000000, // ~4.37GB
    description: "Llama 2 7B Chat model, Q4_K_M quantization - good balance of quality and speed",
    modelType: "chat",
    contextLength: 4096,
    parameterCount: "7B",
    quantization: "Q4_K_M"
  },
  {
    name: "Llama 2 13B Chat Q4_K_M",
    url: "https://huggingface.co/TheBloke/Llama-2-13B-Chat-GGUF/resolve/main/llama-2-13b-chat.Q4_K_M.gguf",
    filename: "llama-2-13b-chat.Q4_K_M.gguf",
    size: 7870000000, // ~7.87GB
    description: "Llama 2 13B Chat model, Q4_K_M quantization - higher quality, requires more RAM",
    modelType: "chat",
    contextLength: 4096,
    parameterCount: "13B",
    quantization: "Q4_K_M"
  },
  {
    name: "CodeLlama 7B Instruct Q4_K_M",
    url: "https://huggingface.co/TheBloke/CodeLlama-7B-Instruct-GGUF/resolve/main/codellama-7b-instruct.Q4_K_M.gguf",
    filename: "codellama-7b-instruct.Q4_K_M.gguf",
    size: 4370000000, // ~4.37GB
    description: "CodeLlama 7B Instruct model optimized for code generation",
    modelType: "code",
    contextLength: 16384,
    parameterCount: "7B",
    quantization: "Q4_K_M"
  },
  {
    name: "Mistral 7B Instruct v0.2 Q4_K_M",
    url: "https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF/resolve/main/mistral-7b-instruct-v0.2.Q4_K_M.gguf",
    filename: "mistral-7b-instruct-v0.2.Q4_K_M.gguf",
    size: 4370000000, // ~4.37GB
    description: "Mistral 7B Instruct v0.2 - fast and efficient instruction-following model",
    modelType: "chat",
    contextLength: 32768,
    parameterCount: "7B",
    quantization: "Q4_K_M"
  },
  {
    name: "Phi-3 Mini 4K Instruct Q4_K_M",
    url: "https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf",
    filename: "phi-3-mini-4k-instruct-q4.gguf",
    size: 2600000000, // ~2.6GB
    description: "Microsoft Phi-3 Mini - small but capable model, good for resource-constrained environments",
    modelType: "chat",
    contextLength: 4096,
    parameterCount: "3.8B",
    quantization: "Q4_K_M"
  }
];

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
      
      models.push({
        id,
        name: modelInfo.name || filename.replace('.gguf', ''),
        filename,
        path: fullPath,
        size: stats.size,
        downloaded: true,
        downloading: false,
        modelType: modelInfo.modelType || 'unknown',
        contextLength: modelInfo.contextLength,
        parameterCount: modelInfo.parameterCount,
        quantization: modelInfo.quantization
      });
    }

    return models;
  }

  /**
   * Get available models for download
   */
  getAvailableModels(): ModelDownloadInfo[] {
    return AVAILABLE_MODELS;
  }

  /**
   * Download a model
   */
  async downloadModel(
    modelInfo: ModelDownloadInfo,
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
      
      const response = await fetch(modelInfo.url, {
        signal: abortController.signal
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
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
    
    // Process messages in order to build conversation context
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

    const response = await session.prompt(lastUserMessage, {
      temperature: options?.temperature || 0.7,
      maxTokens: options?.maxTokens || 2048
    });

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
    // For now, just use the regular prompt method and yield the complete response
    // TODO: Implement proper streaming when node-llama-cpp supports it properly
    const response = await session.prompt(lastUserMessage, {
      temperature: options?.temperature || 0.7,
      maxTokens: options?.maxTokens || 2048
    });
    
    yield response;
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

    // Detect model type
    if (lower.includes('chat') || lower.includes('instruct')) {
      modelType = 'chat';
    } else if (lower.includes('code')) {
      modelType = 'code';
    }

    // Extract parameter count
    const paramMatch = filename.match(/(\d+\.?\d*)B/i);
    if (paramMatch) {
      parameterCount = paramMatch[1] + 'B';
    }

    // Extract quantization
    const quantMatch = filename.match(/(Q\d+_[A-Z]+_?[A-Z]*)/i);
    if (quantMatch) {
      quantization = quantMatch[1];
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
