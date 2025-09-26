import { Injectable, Logger } from '@nestjs/common';
import { SseService } from '../../events/services/sse.service';
import { ConversationMessage } from '../types/conversation.types';

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

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private sessions = new Map<string, Session>();

  constructor(private readonly sseService: SseService) {}

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
    // For local LLMs that maintain server-side sessions
    if (llmType === 'local') {
      try {
        // Dynamic import to avoid circular dependencies
        const { getLocalLLMManager } = await import(
          '../../../localLlmSingleton'
        );
        const localLLMManager = getLocalLLMManager();

        // Update the session history in the local LLM
        await localLLMManager.updateSessionHistory(modelName, threadId);

        this.logger.debug(
          `Updated session history for local model: ${modelName}, thread: ${threadId}, messages: ${messages.length}`
        );
      } catch (error) {
        // Model might not be loaded yet, which is fine
        this.logger.debug(
          `Could not update session history for model ${modelName}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    } else {
      // Stateless LLMs (OpenAI, Anthropic, etc.) don't need session management
      // They receive the full message history with each request
      this.logger.debug(
        `Stateless session update (no-op) for ${llmType} model: ${modelName}, thread: ${threadId}`
      );
    }
  }
}
