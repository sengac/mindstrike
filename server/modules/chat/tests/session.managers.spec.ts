import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  LocalLLMSessionManager,
  StatelessLLMSessionManager,
  OllamaSessionManager,
  SessionManagerFactory,
  GlobalSessionManager,
  SessionService,
} from '../services/session.service';
import type { ConversationService } from '../services/conversation.service';
import type { ConversationMessage } from '../types/conversation.types';
import type { SseService } from '../../events/services/sse.service';
import type { ConfigService } from '@nestjs/config';

// Mock the localLlmSingleton module
const mockUpdateSessionHistory = vi.fn();
vi.mock('../../../localLlmSingleton', () => ({
  getLocalLLMManager: vi.fn(() => ({
    updateSessionHistory: mockUpdateSessionHistory,
  })),
}));

describe('Session Managers', () => {
  describe('LocalLLMSessionManager', () => {
    let manager: LocalLLMSessionManager;

    beforeEach(() => {
      manager = new LocalLLMSessionManager();
      vi.clearAllMocks();
    });

    it('should support session management', () => {
      expect(manager.supportsSessionManagement()).toBe(true);
    });

    it('should update session history', async () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'Hello' } as ConversationMessage,
        { role: 'assistant', content: 'Hi there!' } as ConversationMessage,
      ];

      await manager.updateSessionHistory('test-model', 'thread-1', messages);

      expect(mockUpdateSessionHistory).toHaveBeenCalledWith(
        'test-model',
        'thread-1'
      );
    });

    it('should clear session history', async () => {
      await manager.clearSessionHistory('test-model', 'thread-1');

      expect(mockUpdateSessionHistory).toHaveBeenCalledWith(
        'test-model',
        'thread-1'
      );
    });

    it('should handle errors gracefully', async () => {
      const { getLocalLLMManager } = await import('../../../localLlmSingleton');
      vi.mocked(getLocalLLMManager).mockImplementationOnce(() => {
        throw new Error('Model not loaded');
      });

      // Should not throw
      await expect(
        manager.updateSessionHistory('test-model', 'thread-1', [])
      ).resolves.toBeUndefined();
    });
  });

  describe('StatelessLLMSessionManager', () => {
    let manager: StatelessLLMSessionManager;

    beforeEach(() => {
      manager = new StatelessLLMSessionManager();
    });

    it('should not support session management', () => {
      expect(manager.supportsSessionManagement()).toBe(false);
    });

    it('should no-op on update session history', async () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'Hello' } as ConversationMessage,
      ];

      // Should not throw and essentially do nothing
      await expect(
        manager.updateSessionHistory('openai-model', 'thread-1', messages)
      ).resolves.toBeUndefined();
    });

    it('should no-op on clear session history', async () => {
      await expect(
        manager.clearSessionHistory('openai-model', 'thread-1')
      ).resolves.toBeUndefined();
    });
  });

  describe('OllamaSessionManager', () => {
    let manager: OllamaSessionManager;

    beforeEach(() => {
      manager = new OllamaSessionManager();
    });

    it('should not support session management', () => {
      expect(manager.supportsSessionManagement()).toBe(false);
    });

    it('should no-op on update session history', async () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'Hello' } as ConversationMessage,
      ];

      await expect(
        manager.updateSessionHistory('ollama-model', 'thread-1', messages)
      ).resolves.toBeUndefined();
    });

    it('should no-op on clear session history', async () => {
      await expect(
        manager.clearSessionHistory('ollama-model', 'thread-1')
      ).resolves.toBeUndefined();
    });
  });

  describe('SessionManagerFactory', () => {
    let factory: SessionManagerFactory;
    let localManager: LocalLLMSessionManager;
    let statelessManager: StatelessLLMSessionManager;
    let ollamaManager: OllamaSessionManager;

    beforeEach(() => {
      localManager = new LocalLLMSessionManager();
      statelessManager = new StatelessLLMSessionManager();
      ollamaManager = new OllamaSessionManager();
      factory = new SessionManagerFactory(
        localManager,
        statelessManager,
        ollamaManager
      );
    });

    it('should create LocalLLMSessionManager for local type', () => {
      const manager = factory.createSessionManager('local');
      expect(manager).toBe(localManager);
    });

    it('should create OllamaSessionManager for ollama type', () => {
      const manager = factory.createSessionManager('ollama');
      expect(manager).toBe(ollamaManager);
    });

    it('should create StatelessLLMSessionManager for openai type', () => {
      const manager = factory.createSessionManager('openai');
      expect(manager).toBe(statelessManager);
    });

    it('should create StatelessLLMSessionManager for anthropic type', () => {
      const manager = factory.createSessionManager('anthropic');
      expect(manager).toBe(statelessManager);
    });

    it('should create StatelessLLMSessionManager for google type', () => {
      const manager = factory.createSessionManager('google');
      expect(manager).toBe(statelessManager);
    });

    it('should create StatelessLLMSessionManager for unknown types', () => {
      const manager = factory.createSessionManager('unknown-llm');
      expect(manager).toBe(statelessManager);
    });
  });

  describe('GlobalSessionManager', () => {
    let globalManager: GlobalSessionManager;
    let mockFactory: SessionManagerFactory;
    let mockConversationService: Partial<ConversationService>;
    let mockConfigService: Partial<ConfigService>;
    let localManager: LocalLLMSessionManager;

    beforeEach(() => {
      // Clear mock calls between tests
      mockUpdateSessionHistory.mockClear();

      localManager = new LocalLLMSessionManager();
      const statelessManager = new StatelessLLMSessionManager();
      const ollamaManager = new OllamaSessionManager();

      mockFactory = new SessionManagerFactory(
        localManager,
        statelessManager,
        ollamaManager
      );

      mockConversationService = {
        getThreadMessages: vi.fn().mockReturnValue([
          { role: 'user', content: 'Test message' },
          { role: 'assistant', content: 'Test response' },
        ]),
      };

      mockConfigService = {
        get: vi.fn(),
      };

      globalManager = new GlobalSessionManager(
        mockFactory,
        mockConversationService as ConversationService,
        mockConfigService as ConfigService
      );

      vi.clearAllMocks();
    });

    it('should update session history for local LLM', async () => {
      const updateSpy = vi.spyOn(localManager, 'updateSessionHistory');

      await globalManager.updateSessionHistory(
        'local',
        'test-model',
        'thread-1'
      );

      expect(mockConversationService.getThreadMessages).toHaveBeenCalledWith(
        'thread-1'
      );
      expect(updateSpy).toHaveBeenCalledWith(
        'test-model',
        'thread-1',
        expect.arrayContaining([
          expect.objectContaining({ content: 'Test message' }),
        ])
      );
    });

    it('should use provided messages if available', async () => {
      const updateSpy = vi.spyOn(localManager, 'updateSessionHistory');
      const customMessages: ConversationMessage[] = [
        { role: 'user', content: 'Custom' } as ConversationMessage,
      ];

      await globalManager.updateSessionHistory(
        'local',
        'test-model',
        'thread-1',
        customMessages
      );

      expect(mockConversationService.getThreadMessages).not.toHaveBeenCalled();
      expect(updateSpy).toHaveBeenCalledWith(
        'test-model',
        'thread-1',
        customMessages
      );
    });

    it('should not update session for stateless LLMs', async () => {
      await globalManager.updateSessionHistory('openai', 'gpt-4', 'thread-1');

      expect(mockConversationService.getThreadMessages).not.toHaveBeenCalled();
    });

    it('should clear session history for local LLM', async () => {
      const clearSpy = vi.spyOn(localManager, 'clearSessionHistory');

      await globalManager.clearSessionHistory(
        'local',
        'test-model',
        'thread-1'
      );

      expect(clearSpy).toHaveBeenCalledWith('test-model', 'thread-1');
    });

    it('should switch to thread for local LLM', async () => {
      const updateSpy = vi.spyOn(localManager, 'updateSessionHistory');

      await globalManager.switchToThread('local', 'test-model', 'thread-2');

      expect(mockConversationService.getThreadMessages).toHaveBeenCalledWith(
        'thread-2'
      );
      expect(updateSpy).toHaveBeenCalledWith(
        'test-model',
        'thread-2',
        expect.arrayContaining([
          expect.objectContaining({ content: 'Test message' }),
        ])
      );
    });

    it('should cache session managers', async () => {
      // First call
      await globalManager.updateSessionHistory(
        'local',
        'test-model',
        'thread-1'
      );

      // Second call - should use cached manager
      await globalManager.updateSessionHistory(
        'local',
        'test-model',
        'thread-2'
      );

      // Factory should only be called once per type (cached after first use)
      const factorySpy = vi.spyOn(mockFactory, 'createSessionManager');
      await globalManager.updateSessionHistory(
        'local',
        'test-model',
        'thread-3'
      );

      expect(factorySpy).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      vi.spyOn(localManager, 'updateSessionHistory').mockRejectedValueOnce(
        new Error('Update failed')
      );

      // Should not throw
      await expect(
        globalManager.updateSessionHistory('local', 'test-model', 'thread-1')
      ).resolves.toBeUndefined();
    });
  });

  describe('SessionService with GlobalSessionManager', () => {
    let sessionService: SessionService;
    let mockSseService: Partial<SseService>;
    let mockGlobalSessionManager: Partial<GlobalSessionManager>;

    beforeEach(() => {
      mockSseService = {
        broadcast: vi.fn(),
      };

      mockGlobalSessionManager = {
        updateSessionHistory: vi.fn(),
        clearSessionHistory: vi.fn(),
        switchToThread: vi.fn(),
      };

      sessionService = new SessionService(
        mockSseService as SseService,
        mockGlobalSessionManager as GlobalSessionManager
      );
    });

    it('should delegate updateSessionHistory to GlobalSessionManager', async () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'Test' } as ConversationMessage,
      ];

      await sessionService.updateSessionHistory(
        'local',
        'test-model',
        'thread-1',
        messages
      );

      expect(
        mockGlobalSessionManager.updateSessionHistory
      ).toHaveBeenCalledWith('local', 'test-model', 'thread-1', messages);
    });

    it('should delegate clearSessionHistory to GlobalSessionManager', async () => {
      await sessionService.clearSessionHistory(
        'local',
        'test-model',
        'thread-1'
      );

      expect(mockGlobalSessionManager.clearSessionHistory).toHaveBeenCalledWith(
        'local',
        'test-model',
        'thread-1'
      );
    });

    it('should delegate switchToThread to GlobalSessionManager', async () => {
      await sessionService.switchToThread('local', 'test-model', 'thread-2');

      expect(mockGlobalSessionManager.switchToThread).toHaveBeenCalledWith(
        'local',
        'test-model',
        'thread-2'
      );
    });

    it('should create UI sessions', () => {
      const sessionId = sessionService.createSession('thread-1');

      expect(sessionId).toMatch(/^session-\d+-[a-z0-9]+$/);

      const session = sessionService.getSession(sessionId);
      expect(session).toBeDefined();
      expect(session?.threadId).toBe('thread-1');
      expect(session?.active).toBe(true);
    });

    it('should update UI sessions and broadcast', () => {
      const sessionId = sessionService.createSession('thread-1');

      const result = sessionService.updateSession(sessionId, {
        active: false,
        context: { test: 'value' },
      });

      expect(result).toBe(true);
      expect(mockSseService.broadcast).toHaveBeenCalledWith('session-update', {
        sessionId,
        updates: { active: false, context: { test: 'value' } },
      });
    });

    it('should delete UI sessions', () => {
      const sessionId = sessionService.createSession('thread-1');

      const result = sessionService.deleteSession(sessionId);

      expect(result).toBe(true);
      expect(sessionService.getSession(sessionId)).toBeUndefined();
      expect(mockSseService.broadcast).toHaveBeenCalledWith('session-deleted', {
        sessionId,
      });
    });

    it('should cleanup inactive sessions', () => {
      // Create active session
      const activeId = sessionService.createSession('thread-1');

      // Create inactive session
      const inactiveId = sessionService.createSession('thread-2');
      const session = sessionService.getSession(inactiveId)!;
      session.active = false;
      session.lastActivity = new Date(Date.now() - 61 * 60 * 1000); // 61 minutes ago

      const removedCount = sessionService.cleanupInactiveSessions(60);

      expect(removedCount).toBe(1);
      expect(sessionService.getSession(activeId)).toBeDefined();
      expect(sessionService.getSession(inactiveId)).toBeUndefined();
    });
  });
});
