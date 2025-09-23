import type {
  LlamaModel,
  LlamaChatSession,
  ChatHistoryItem,
  LlamaChatSessionOptions,
} from 'node-llama-cpp';
// SystemInformation type is imported but not used in this file
import { logger } from '../logger.js';

export interface SessionConfig {
  contextSize: number;
  batchSize: number;
  systemPrompt?: string;
}

export interface SessionHistory {
  threadId: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
}

export class LlamaSessionManager {
  private sessions = new Map<string, LlamaChatSession>();
  private sessionConfigs = new Map<string, SessionConfig>();

  /**
   * Create a new session for a model
   */
  async createSession(
    sessionId: string,
    model: LlamaModel,
    config: SessionConfig
  ): Promise<LlamaChatSession> {
    try {
      // Create context with specified settings
      const context = await model.createContext({
        contextSize: config.contextSize,
        batchSize: config.batchSize,
      });

      // Get a sequence from the context
      const sequence = context.getSequence();

      // Create chat session
      const sessionOptions: LlamaChatSessionOptions = {
        contextSequence: sequence,
        systemPrompt: config.systemPrompt,
      };
      const { LlamaChatSession: NodeLlamaChatSession } = await import(
        'node-llama-cpp'
      );
      const session = new NodeLlamaChatSession(sessionOptions);

      // Store session and config
      this.sessions.set(sessionId, session);
      this.sessionConfigs.set(sessionId, config);

      logger.info(
        `Created session ${sessionId} with context size ${config.contextSize}`
      );
      return session;
    } catch (error) {
      logger.error(`Failed to create session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Get an existing session
   */
  getSession(sessionId: string): LlamaChatSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get session configuration
   */
  getSessionConfig(sessionId: string): SessionConfig | undefined {
    return this.sessionConfigs.get(sessionId);
  }

  /**
   * Recreate a session with new configuration
   */
  async recreateSession(
    sessionId: string,
    model: LlamaModel,
    newConfig: SessionConfig,
    preserveHistory = true
  ): Promise<LlamaChatSession> {
    const existingSession = this.sessions.get(sessionId);
    let history: ChatHistoryItem[] = [];

    // Preserve history if requested and session exists
    if (preserveHistory && existingSession) {
      try {
        history = existingSession.getChatHistory();
      } catch (error) {
        logger.warn(
          `Failed to preserve history for session ${sessionId}:`,
          error
        );
      }
    }

    // Dispose of existing session
    if (existingSession) {
      await this.disposeSession(sessionId);
    }

    // Create new session
    const newSession = await this.createSession(sessionId, model, newConfig);

    // Restore history if available
    if (history.length > 0) {
      try {
        newSession.setChatHistory(history);
        logger.info(
          `Restored ${history.length} history items to session ${sessionId}`
        );
      } catch (error) {
        logger.warn(
          `Failed to restore history to session ${sessionId}:`,
          error
        );
      }
    }

    return newSession;
  }

  /**
   * Update session with chat history
   */
  async updateSessionHistory(
    sessionId: string,
    history: SessionHistory['messages']
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    try {
      const newHistory: ChatHistoryItem[] = [];

      // Add system prompt if it exists
      const config = this.sessionConfigs.get(sessionId);
      if (config?.systemPrompt) {
        newHistory.push({
          type: 'system',
          text: config.systemPrompt,
        });
      }

      // Convert and add messages
      for (const msg of history) {
        if (msg.role === 'system') {
          newHistory.push({
            type: 'system',
            text: msg.content,
          });
        } else if (msg.role === 'user') {
          newHistory.push({
            type: 'user',
            text: msg.content,
          });
        } else if (msg.role === 'assistant') {
          newHistory.push({
            type: 'model',
            response: [msg.content],
          });
        }
      }

      session.setChatHistory(newHistory);

      logger.debug(
        `Updated session ${sessionId} with ${history.length} messages`
      );
    } catch (error) {
      logger.error(`Failed to update session history for ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Populate session with initial history
   */
  async populateSessionWithHistory(
    session: LlamaChatSession,
    messages: SessionHistory['messages'],
    systemPrompt?: string
  ): Promise<void> {
    try {
      const newHistory: ChatHistoryItem[] = [];

      // Add system prompt first if provided
      if (systemPrompt) {
        newHistory.push({
          type: 'system',
          text: systemPrompt,
        });
      }

      // Add messages
      for (const msg of messages) {
        if (msg.role === 'system' && msg.content !== systemPrompt) {
          newHistory.push({
            type: 'system',
            text: msg.content,
          });
        } else if (msg.role === 'user') {
          newHistory.push({
            type: 'user',
            text: msg.content,
          });
        } else if (msg.role === 'assistant') {
          newHistory.push({
            type: 'model',
            response: [msg.content],
          });
        }
      }

      session.setChatHistory(newHistory);

      logger.debug(`Populated session with ${messages.length} messages`);
    } catch (error) {
      logger.error('Failed to populate session with history:', error);
      throw error;
    }
  }

  /**
   * Get chat history from a session
   */
  getSessionHistory(sessionId: string): ChatHistoryItem[] {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return [];
    }

    return session.getChatHistory();
  }

  /**
   * Dispose of a session and free resources
   */
  async disposeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      try {
        // Dispose of the context if it exists
        const context = session.context;
        if (context && typeof context.dispose === 'function') {
          await context.dispose();
        }
      } catch (error) {
        logger.warn(`Error disposing session ${sessionId}:`, error);
      }

      this.sessions.delete(sessionId);
      this.sessionConfigs.delete(sessionId);
      logger.info(`Disposed session ${sessionId}`);
    }
  }

  /**
   * Dispose of all sessions
   */
  async disposeAllSessions(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());

    await Promise.all(sessionIds.map(id => this.disposeSession(id)));

    logger.info(`Disposed all ${sessionIds.length} sessions`);
  }

  /**
   * Get all active session IDs
   */
  getActiveSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Check if a session exists
   */
  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }
}
