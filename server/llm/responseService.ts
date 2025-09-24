import type { StreamResponseOptions } from '../localLlmManager';
import type { ModelRegistry, ModelRuntimeInfo } from './modelRegistry';
import type { LlamaSessionManager } from './sessionManager';
import type { ModelResponseGenerator } from './responseGenerator';
import type { ModelFileManager } from './modelFileManager';
import { PROGRESS } from './constants';

/**
 * Handles response generation and session management
 */
export class ResponseService {
  constructor(
    private registry: ModelRegistry,
    private sessionManager: LlamaSessionManager,
    private responseGenerator: ModelResponseGenerator,
    private fileManager?: ModelFileManager
  ) {}

  /**
   * Update session history (matches original interface)
   */
  async updateSessionHistory(
    modelIdOrName: string,
    threadId: string
  ): Promise<void> {
    // Log session update for debugging and future thread-specific functionality
    console.debug(
      `Updating session history for model: ${modelIdOrName}, thread: ${threadId}`
    );

    // First try to use it as an ID
    let activeModel = this.registry.getModelRuntimeInfo(modelIdOrName);

    if (!activeModel) {
      // Try to find by name using the file manager
      const modelId = await this.findModelIdByName(modelIdOrName);
      if (modelId) {
        activeModel = this.registry.getModelRuntimeInfo(modelId);
      }
    }

    if (!activeModel) {
      // Model not loaded, silently skip session update (matches original behavior)
      return;
    }

    // TODO: Populate session with history from thread (matches original behavior)
    // For now, this is a placeholder that matches the original interface
    // Original code: await this.populateSessionWithHistory(activeModel.session, threadId);
  }

  /**
   * Find model ID by name (filename without extension) - matches original logic
   */
  private async findModelIdByName(modelName: string): Promise<string | null> {
    if (!this.fileManager) {
      return null;
    }

    const models = await this.fileManager.getLocalModels();
    const model = models.find(
      m => m.name === modelName || m.filename === modelName
    );
    return model ? model.id : null;
  }

  /**
   * Generate a non-streaming response
   */
  async generateResponse(
    modelId: string,
    previousMessages: Array<{ role: string; content: string }>,
    options?: {
      temperature?: number;
      maxTokens?: number;
      threadId?: string;
      disableFunctions?: boolean;
      disableChatHistory?: boolean;
      signal?: AbortSignal;
    }
  ): Promise<string> {
    const { threadId } = options ?? {};

    // Find active model
    const activeModel = await this.findActiveModel(modelId, threadId);
    const sessionId = this.findModelId(activeModel);
    const session = this.getSession(sessionId);

    // Find the last user message
    const message = this.extractUserMessage(previousMessages);

    const response = await this.responseGenerator.generateResponse(
      session,
      message,
      {
        threadId,
        disableFunctions: options?.disableFunctions,
        disableChatHistory: options?.disableChatHistory,
        signal: options?.signal,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
      }
    );

    // Record usage
    this.registry.recordPromptUsage(sessionId, response.tokensGenerated);

    return response.content;
  }

  /**
   * Generate a streaming response
   */
  async *generateStreamResponse(
    modelId: string,
    previousMessages: Array<{ role: string; content: string }>,
    options?: StreamResponseOptions
  ): AsyncGenerator<string, void, unknown> {
    const { threadId } = options ?? {};

    // Find active model
    const activeModel = await this.findActiveModel(modelId, threadId);
    const sessionId = this.findModelId(activeModel);
    const session = this.getSession(sessionId);

    // Find the last user message
    const message = this.extractUserMessage(previousMessages);

    const generator = this.responseGenerator.generateStreamResponse(
      session,
      message,
      {
        threadId,
        disableFunctions: options?.disableFunctions,
        disableChatHistory: options?.disableChatHistory,
        signal: options?.signal,
      }
    );

    let tokensGenerated = PROGRESS.INITIAL;
    for await (const chunk of generator) {
      tokensGenerated++;
      yield chunk;
    }

    // Record usage
    this.registry.recordPromptUsage(sessionId, tokensGenerated);
  }

  /**
   * Get model status
   */
  async getModelStatus(modelId: string) {
    return this.registry.getModelStatus(modelId);
  }

  /**
   * Find an active model by ID or name (matches original logic)
   */
  private async findActiveModel(modelIdOrName: string, threadId?: string) {
    // Log model search for debugging and future thread-specific functionality
    console.debug(
      `Finding active model: ${modelIdOrName}${threadId ? ` for thread: ${threadId}` : ''}`
    );

    // First try to use it as an ID
    let activeModel = this.registry.getModelRuntimeInfo(modelIdOrName);

    // If not found, try to find by name
    if (!activeModel) {
      const modelId = await this.findModelIdByName(modelIdOrName);
      if (modelId) {
        activeModel = this.registry.getModelRuntimeInfo(modelId);
      }
    }

    // TODO: In original code, if still not found and threadId provided, try to load model
    // This would require access to the model loader, which we don't have here
    // For now, throw error to match simplified behavior

    if (!activeModel) {
      throw new Error(`Model ${modelIdOrName} is not loaded`);
    }

    return activeModel;
  }

  /**
   * Find model ID from runtime info
   */
  private findModelId(activeModel: ModelRuntimeInfo): string {
    // The activeModel is the runtime info, we need to find which model ID it belongs to
    const allModels = this.registry.getAllModelsInfo();
    for (const model of allModels) {
      if (model.info === activeModel) {
        return model.modelId;
      }
    }

    throw new Error('Could not find model ID for active model');
  }

  /**
   * Get session by ID
   */
  private getSession(sessionId: string) {
    const session = this.sessionManager.getSession(`${sessionId}-main`);
    if (!session) {
      throw new Error('Session not found');
    }
    return session;
  }

  /**
   * Extract last user message from message history
   */
  private extractUserMessage(
    previousMessages: Array<{ role: string; content: string }>
  ): string {
    const message = previousMessages
      .slice()
      .reverse()
      .find(msg => msg.role === 'user')?.content;

    if (!message) {
      throw new Error('No user message found');
    }

    return message;
  }
}
