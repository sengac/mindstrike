import { Injectable, Logger } from '@nestjs/common';
import { SseService } from '../../events/services/sse.service';
import { ConversationMessage } from '../types/conversation.types';
import { ConversationService } from './conversation.service';
import { ConfigService } from '@nestjs/config';

// Session Manager Interfaces
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

export interface Session {
  id: string;
  threadId: string;
  active: boolean;
  messages: Array<{
    id: string;
    content: string;
    role: 'user' | 'assistant';
    timestamp: Date;
  }>;
  context: Record<string, unknown>;
  createdAt: Date;
  lastActivity: Date;
}

// Local LLM Session Manager Implementation
@Injectable()
export class LocalLLMSessionManager implements SessionManager {
  private readonly logger = new Logger(LocalLLMSessionManager.name);

  async updateSessionHistory(
    modelName: string,
    threadId: string,
    messages: ConversationMessage[]
  ): Promise<void> {
    this.logger.debug(
      `Updating session history for model: ${modelName}, thread: ${threadId}, messages: ${messages.length}`
    );

    try {
      // Dynamic import to avoid circular dependencies
      const { getLocalLLMManager } = await import('../../../localLlmSingleton');
      const localLLMManager = getLocalLLMManager();

      // Only update session if model is actually loaded
      await localLLMManager.updateSessionHistory(modelName, threadId);
    } catch {
      // If model is not loaded, the updateSessionHistory will handle it gracefully
      // We don't need to log this as it's expected behavior
    }
  }

  async clearSessionHistory(
    modelName: string,
    threadId: string
  ): Promise<void> {
    this.logger.debug(
      `Clearing session history for model: ${modelName}, thread: ${threadId}`
    );

    try {
      const { getLocalLLMManager } = await import('../../../localLlmSingleton');
      const localLLMManager = getLocalLLMManager();

      // Only clear session if model is actually loaded
      await localLLMManager.updateSessionHistory(modelName, threadId);
    } catch {
      // If model is not loaded, the updateSessionHistory will handle it gracefully
      // We don't need to log this as it's expected behavior
    }
  }

  supportsSessionManagement(): boolean {
    return true;
  }
}

// Stateless LLM Session Manager Implementation
@Injectable()
export class StatelessLLMSessionManager implements SessionManager {
  private readonly logger = new Logger(StatelessLLMSessionManager.name);

  async updateSessionHistory(
    modelName: string,
    threadId: string,
    messages: ConversationMessage[]
  ): Promise<void> {
    // Stateless LLMs (OpenAI, Anthropic, etc.) don't maintain server-side sessions
    // They receive the full message history with each request
    this.logger.debug(
      `Stateless session update (no-op) for model: ${modelName}, thread: ${threadId}, messages: ${messages.length}`
    );
  }

  async clearSessionHistory(
    modelName: string,
    threadId: string
  ): Promise<void> {
    this.logger.debug(
      `Stateless session clear (no-op) for model: ${modelName}, thread: ${threadId}`
    );
  }

  supportsSessionManagement(): boolean {
    return false;
  }
}

// Ollama Session Manager Implementation
@Injectable()
export class OllamaSessionManager implements SessionManager {
  private readonly logger = new Logger(OllamaSessionManager.name);

  async updateSessionHistory(
    modelName: string,
    threadId: string,
    messages: ConversationMessage[]
  ): Promise<void> {
    // Ollama may have its own session management
    // For now, treat it as stateless, but this can be extended
    this.logger.debug(
      `Ollama session update (no-op) for model: ${modelName}, thread: ${threadId}, messages: ${messages.length}`
    );
  }

  async clearSessionHistory(
    modelName: string,
    threadId: string
  ): Promise<void> {
    this.logger.debug(
      `Ollama session clear (no-op) for model: ${modelName}, thread: ${threadId}`
    );
  }

  supportsSessionManagement(): boolean {
    return false;
  }
}

// Session Manager Factory
@Injectable()
export class SessionManagerFactory {
  constructor(
    private readonly localLLMSessionManager: LocalLLMSessionManager,
    private readonly statelessLLMSessionManager: StatelessLLMSessionManager,
    private readonly ollamaSessionManager: OllamaSessionManager
  ) {}

  createSessionManager(llmType: string): SessionManager {
    switch (llmType) {
      case 'local':
        return this.localLLMSessionManager;

      case 'ollama':
        return this.ollamaSessionManager;

      case 'openai':
      case 'anthropic':
      case 'google':
      case 'perplexity':
      case 'openai-compatible':
      case 'vllm':
      default:
        return this.statelessLLMSessionManager;
    }
  }
}

// Global Session Manager Service
@Injectable()
export class GlobalSessionManager {
  private readonly logger = new Logger(GlobalSessionManager.name);
  private readonly sessionManagers = new Map<string, SessionManager>();

  constructor(
    private readonly sessionManagerFactory: SessionManagerFactory,
    private readonly conversationService: ConversationService,
    private readonly configService: ConfigService
  ) {}

  private getSessionManager(llmType: string): SessionManager {
    let manager = this.sessionManagers.get(llmType);
    if (!manager) {
      manager = this.sessionManagerFactory.createSessionManager(llmType);
      this.sessionManagers.set(llmType, manager);
    }
    return manager;
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
          threadMessages = this.conversationService.getThreadMessages(threadId);
        }

        await sessionManager.updateSessionHistory(
          modelName,
          threadId,
          threadMessages
        );
        this.logger.log(
          `Updated session history for ${llmType} model ${modelName} in thread ${threadId} with ${threadMessages.length} messages`
        );
      } catch (error) {
        this.logger.error(
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
        this.logger.log(
          `Cleared session history for ${llmType} model ${modelName} in thread ${threadId}`
        );
      } catch (error) {
        this.logger.error(
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
        const messages = this.conversationService.getThreadMessages(threadId);

        // Update session with new thread's history
        await sessionManager.updateSessionHistory(
          modelName,
          threadId,
          messages
        );
        this.logger.log(
          `Switched to thread ${threadId} for ${llmType} model ${modelName} with ${messages.length} messages`
        );
      } catch (error) {
        this.logger.error(
          `Failed to switch to thread ${threadId} for ${llmType} model ${modelName}:`,
          error
        );
      }
    }
  }
}

// Main Session Service (for UI sessions)
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private sessions = new Map<string, Session>();

  constructor(
    private readonly sseService: SseService,
    private readonly globalSessionManager: GlobalSessionManager
  ) {}

  createSession(threadId: string): string {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const session: Session = {
      id: sessionId,
      threadId,
      active: true,
      messages: [],
      context: {},
      createdAt: new Date(),
      lastActivity: new Date(),
    };

    this.sessions.set(sessionId, session);
    return sessionId;
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  updateSession(
    sessionId: string,
    updates: Partial<Omit<Session, 'id' | 'threadId' | 'createdAt'>>
  ): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    Object.assign(session, updates);
    session.lastActivity = new Date();

    this.sseService.broadcast('session-update', {
      sessionId,
      updates,
    });

    return true;
  }

  deleteSession(sessionId: string): boolean {
    const exists = this.sessions.has(sessionId);
    if (exists) {
      this.sessions.delete(sessionId);
      this.sseService.broadcast('session-deleted', { sessionId });
    }
    return exists;
  }

  addMessageToSession(
    sessionId: string,
    message: {
      id: string;
      content: string;
      role: 'user' | 'assistant';
      timestamp: Date;
    }
  ): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    session.messages.push(message);
    session.lastActivity = new Date();
    return true;
  }

  getSessionsByThread(threadId: string): Session[] {
    return Array.from(this.sessions.values()).filter(
      session => session.threadId === threadId
    );
  }

  getActiveSessions(): Session[] {
    return Array.from(this.sessions.values()).filter(session => session.active);
  }

  cleanupInactiveSessions(timeoutMinutes: number): number {
    const now = Date.now();
    const timeoutMs = timeoutMinutes * 60 * 1000;
    let removedCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      // Don't remove active sessions regardless of age
      if (session.active) {
        continue;
      }

      const inactiveTime = now - session.lastActivity.getTime();
      if (inactiveTime > timeoutMs) {
        this.sessions.delete(sessionId);
        removedCount++;
      }
    }

    return removedCount;
  }

  /**
   * Update session history for local LLM models that maintain server-side state
   * This is mainly used for local models that need to maintain conversation context
   */
  async updateSessionHistory(
    llmType: string,
    modelName: string,
    threadId: string,
    messages: ConversationMessage[]
  ): Promise<void> {
    return this.globalSessionManager.updateSessionHistory(
      llmType,
      modelName,
      threadId,
      messages
    );
  }

  /**
   * Clear session history for a specific thread
   */
  async clearSessionHistory(
    llmType: string,
    modelName: string,
    threadId: string
  ): Promise<void> {
    return this.globalSessionManager.clearSessionHistory(
      llmType,
      modelName,
      threadId
    );
  }

  /**
   * Switch to a different thread for the current model
   */
  async switchToThread(
    llmType: string,
    modelName: string,
    threadId: string
  ): Promise<void> {
    return this.globalSessionManager.switchToThread(
      llmType,
      modelName,
      threadId
    );
  }
}
