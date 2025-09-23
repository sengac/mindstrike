import type { ConversationMessage } from './agents/base-agent.js';
import { getLocalLLMManager } from './local-llm-singleton.js';
import { logger } from './logger.js';

export interface SessionManager {
  /**
   * Update session history for a specific thread
   */
  updateSessionHistory(
    modelName: string,
    threadId: string,
    messages: ConversationMessage[]
  ): Promise<void>;

  /**
   * Clear session history for a specific thread
   */
  clearSessionHistory(modelName: string, threadId: string): Promise<void>;

  /**
   * Check if this LLM type supports session management
   */
  supportsSessionManagement(): boolean;
}

export class LocalLLMSessionManager implements SessionManager {
  async updateSessionHistory(
    modelName: string,
    threadId: string,
    messages: ConversationMessage[]
  ): Promise<void> {
    const localLLMManager = getLocalLLMManager();

    // Only update session if model is actually loaded
    try {
      await localLLMManager.updateSessionHistory(modelName, threadId);
    } catch (error) {
      // If model is not loaded, the updateSessionHistory will handle it gracefully
      // We don't need to log this as it's expected behavior
    }
  }

  async clearSessionHistory(
    modelName: string,
    threadId: string
  ): Promise<void> {
    const localLLMManager = getLocalLLMManager();

    // Only clear session if model is actually loaded
    try {
      await localLLMManager.updateSessionHistory(modelName, threadId);
    } catch (error) {
      // If model is not loaded, the updateSessionHistory will handle it gracefully
      // We don't need to log this as it's expected behavior
    }
  }

  supportsSessionManagement(): boolean {
    return true;
  }
}

export class StatelessLLMSessionManager implements SessionManager {
  async updateSessionHistory(
    modelName: string,
    threadId: string,
    messages: ConversationMessage[]
  ): Promise<void> {
    // Stateless LLMs (OpenAI, Anthropic, etc.) don't maintain server-side sessions
    // They receive the full message history with each request
    // So no session update is needed
  }

  async clearSessionHistory(
    modelName: string,
    threadId: string
  ): Promise<void> {
    // Nothing to clear for stateless LLMs
  }

  supportsSessionManagement(): boolean {
    return false;
  }
}

export class OllamaSessionManager implements SessionManager {
  async updateSessionHistory(
    modelName: string,
    threadId: string,
    messages: ConversationMessage[]
  ): Promise<void> {
    // Ollama may have its own session management
    // For now, treat it as stateless, but this can be extended
    // if Ollama provides session management capabilities
  }

  async clearSessionHistory(
    modelName: string,
    threadId: string
  ): Promise<void> {
    // Nothing to clear for Ollama (currently stateless)
  }

  supportsSessionManagement(): boolean {
    return false;
  }
}

export class SessionManagerFactory {
  static createSessionManager(llmType: string): SessionManager {
    switch (llmType) {
      case 'local':
        return new LocalLLMSessionManager();

      case 'ollama':
        return new OllamaSessionManager();

      case 'openai':
      case 'anthropic':
      case 'google':
      case 'perplexity':
      case 'openai-compatible':
      case 'vllm':
      default:
        return new StatelessLLMSessionManager();
    }
  }
}

export class GlobalSessionManager {
  private readonly sessionManagers = new Map<string, SessionManager>();

  private getSessionManager(llmType: string): SessionManager {
    if (!this.sessionManagers.has(llmType)) {
      this.sessionManagers.set(
        llmType,
        SessionManagerFactory.createSessionManager(llmType)
      );
    }
    return this.sessionManagers.get(llmType)!;
  }

  private async getConversationManager() {
    const { ConversationManager } = await import('./conversation-manager.js');
    const { getWorkspaceRoot } = await import('./utils/settings-directory.js');

    const workspaceRoot = await getWorkspaceRoot();
    if (!workspaceRoot) {
      throw new Error('No workspace root found');
    }

    const conversationManager = new ConversationManager(workspaceRoot);
    await conversationManager.load();
    return conversationManager;
  }

  async updateSessionHistory(
    llmType: string,
    modelName: string,
    threadId: string,
    messages?: ConversationMessage[]
  ): Promise<void> {
    const sessionManager = this.getSessionManager(llmType);
    if (sessionManager.supportsSessionManagement()) {
      try {
        // If messages not provided, fetch from conversation manager
        let threadMessages = messages;
        if (!threadMessages) {
          const conversationManager = await this.getConversationManager();
          threadMessages = conversationManager.getThreadMessages(threadId);
        }

        await sessionManager.updateSessionHistory(
          modelName,
          threadId,
          threadMessages
        );
        logger.info(
          `Updated session history for ${llmType} model ${modelName} in thread ${threadId} with ${threadMessages.length} messages`
        );
      } catch (error) {
        logger.error(
          `Failed to update session history for ${llmType} model ${modelName} in thread ${threadId}:`,
          error
        );
      }
    }
  }

  async clearSessionHistory(
    llmType: string,
    modelName: string,
    threadId: string
  ): Promise<void> {
    const sessionManager = this.getSessionManager(llmType);
    if (sessionManager.supportsSessionManagement()) {
      try {
        await sessionManager.clearSessionHistory(modelName, threadId);
        logger.info(
          `Cleared session history for ${llmType} model ${modelName} in thread ${threadId}`
        );
      } catch (error) {
        logger.error(
          `Failed to clear session history for ${llmType} model ${modelName} in thread ${threadId}:`,
          error
        );
      }
    }
  }

  async switchToThread(
    llmType: string,
    modelName: string,
    threadId: string
  ): Promise<void> {
    const sessionManager = this.getSessionManager(llmType);
    if (sessionManager.supportsSessionManagement()) {
      try {
        // Get conversation history for the new thread
        const conversationManager = await this.getConversationManager();
        const messages = conversationManager.getThreadMessages(threadId);

        // Update session with new thread's history
        await sessionManager.updateSessionHistory(
          modelName,
          threadId,
          messages
        );
        logger.info(
          `Switched to thread ${threadId} for ${llmType} model ${modelName} with ${messages.length} messages`
        );
      } catch (error) {
        logger.error(
          `Failed to switch to thread ${threadId} for ${llmType} model ${modelName}:`,
          error
        );
      }
    }
  }
}

// Global instance
export const globalSessionManager = new GlobalSessionManager();
