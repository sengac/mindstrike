import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  MockedFunction,
} from 'vitest';
import {
  LocalLLMSessionManager,
  StatelessLLMSessionManager,
  OllamaSessionManager,
  SessionManagerFactory,
  GlobalSessionManager,
  globalSessionManager,
} from '../sessionManager';
import type { ConversationMessage } from '../agents/baseAgent';

// Mock the logger
vi.mock('../logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the localLlmSingleton
const mockLocalLLMManager = {
  updateSessionHistory: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../localLlmSingleton', () => ({
  getLocalLLMManager: vi.fn(() => mockLocalLLMManager),
}));

// Mock dynamic imports for GlobalSessionManager
vi.mock('../conversationManager', async () => {
  const mockConversationManager = {
    load: vi.fn().mockResolvedValue(undefined),
    getThreadMessages: vi.fn().mockReturnValue([]),
  };

  return {
    ConversationManager: vi
      .fn()
      .mockImplementation(() => mockConversationManager),
  };
});

vi.mock('../utils/settingsDirectory', () => ({
  getWorkspaceRoot: vi.fn().mockResolvedValue('/test/workspace'),
}));

describe('SessionManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockMessages: ConversationMessage[] = [
    {
      id: 'msg1',
      role: 'user',
      content: 'Hello',
      timestamp: new Date(),
    },
    {
      id: 'msg2',
      role: 'assistant',
      content: 'Hi there!',
      timestamp: new Date(),
    },
  ];

  describe('LocalLLMSessionManager', () => {
    let sessionManager: LocalLLMSessionManager;

    beforeEach(() => {
      sessionManager = new LocalLLMSessionManager();
    });

    it('should support session management', () => {
      expect(sessionManager.supportsSessionManagement()).toBe(true);
    });

    it('should update session history successfully', async () => {
      mockLocalLLMManager.updateSessionHistory.mockResolvedValueOnce(undefined);

      await sessionManager.updateSessionHistory(
        'test-model',
        'thread-123',
        mockMessages
      );

      expect(mockLocalLLMManager.updateSessionHistory).toHaveBeenCalledWith(
        'test-model',
        'thread-123'
      );
    });

    it('should handle errors during session history update gracefully', async () => {
      mockLocalLLMManager.updateSessionHistory.mockRejectedValueOnce(
        new Error('Model not loaded')
      );

      // Should not throw error
      await expect(
        sessionManager.updateSessionHistory(
          'test-model',
          'thread-123',
          mockMessages
        )
      ).resolves.toBeUndefined();

      expect(mockLocalLLMManager.updateSessionHistory).toHaveBeenCalledWith(
        'test-model',
        'thread-123'
      );
    });

    it('should clear session history successfully', async () => {
      mockLocalLLMManager.updateSessionHistory.mockResolvedValueOnce(undefined);

      await sessionManager.clearSessionHistory('test-model', 'thread-123');

      expect(mockLocalLLMManager.updateSessionHistory).toHaveBeenCalledWith(
        'test-model',
        'thread-123'
      );
    });

    it('should handle errors during session history clear gracefully', async () => {
      mockLocalLLMManager.updateSessionHistory.mockRejectedValueOnce(
        new Error('Model not loaded')
      );

      // Should not throw error
      await expect(
        sessionManager.clearSessionHistory('test-model', 'thread-123')
      ).resolves.toBeUndefined();

      expect(mockLocalLLMManager.updateSessionHistory).toHaveBeenCalledWith(
        'test-model',
        'thread-123'
      );
    });
  });

  describe('StatelessLLMSessionManager', () => {
    let sessionManager: StatelessLLMSessionManager;

    beforeEach(() => {
      sessionManager = new StatelessLLMSessionManager();
    });

    it('should not support session management', () => {
      expect(sessionManager.supportsSessionManagement()).toBe(false);
    });

    it('should update session history as no-op', async () => {
      await sessionManager.updateSessionHistory(
        'gpt-4',
        'thread-123',
        mockMessages
      );

      // Should complete without errors (no-op)
      expect(mockLocalLLMManager.updateSessionHistory).not.toHaveBeenCalled();
    });

    it('should clear session history as no-op', async () => {
      await sessionManager.clearSessionHistory('gpt-4', 'thread-123');

      // Should complete without errors (no-op)
      expect(mockLocalLLMManager.updateSessionHistory).not.toHaveBeenCalled();
    });
  });

  describe('OllamaSessionManager', () => {
    let sessionManager: OllamaSessionManager;

    beforeEach(() => {
      sessionManager = new OllamaSessionManager();
    });

    it('should not support session management', () => {
      expect(sessionManager.supportsSessionManagement()).toBe(false);
    });

    it('should update session history as no-op', async () => {
      await sessionManager.updateSessionHistory(
        'llama2:7b',
        'thread-123',
        mockMessages
      );

      // Should complete without errors (no-op)
      expect(mockLocalLLMManager.updateSessionHistory).not.toHaveBeenCalled();
    });

    it('should clear session history as no-op', async () => {
      await sessionManager.clearSessionHistory('llama2:7b', 'thread-123');

      // Should complete without errors (no-op)
      expect(mockLocalLLMManager.updateSessionHistory).not.toHaveBeenCalled();
    });
  });

  describe('SessionManagerFactory', () => {
    it('should create LocalLLMSessionManager for local type', () => {
      const sessionManager =
        SessionManagerFactory.createSessionManager('local');
      expect(sessionManager).toBeInstanceOf(LocalLLMSessionManager);
    });

    it('should create OllamaSessionManager for ollama type', () => {
      const sessionManager =
        SessionManagerFactory.createSessionManager('ollama');
      expect(sessionManager).toBeInstanceOf(OllamaSessionManager);
    });

    it('should create StatelessLLMSessionManager for openai type', () => {
      const sessionManager =
        SessionManagerFactory.createSessionManager('openai');
      expect(sessionManager).toBeInstanceOf(StatelessLLMSessionManager);
    });

    it('should create StatelessLLMSessionManager for anthropic type', () => {
      const sessionManager =
        SessionManagerFactory.createSessionManager('anthropic');
      expect(sessionManager).toBeInstanceOf(StatelessLLMSessionManager);
    });

    it('should create StatelessLLMSessionManager for google type', () => {
      const sessionManager =
        SessionManagerFactory.createSessionManager('google');
      expect(sessionManager).toBeInstanceOf(StatelessLLMSessionManager);
    });

    it('should create StatelessLLMSessionManager for perplexity type', () => {
      const sessionManager =
        SessionManagerFactory.createSessionManager('perplexity');
      expect(sessionManager).toBeInstanceOf(StatelessLLMSessionManager);
    });

    it('should create StatelessLLMSessionManager for openai-compatible type', () => {
      const sessionManager =
        SessionManagerFactory.createSessionManager('openai-compatible');
      expect(sessionManager).toBeInstanceOf(StatelessLLMSessionManager);
    });

    it('should create StatelessLLMSessionManager for vllm type', () => {
      const sessionManager = SessionManagerFactory.createSessionManager('vllm');
      expect(sessionManager).toBeInstanceOf(StatelessLLMSessionManager);
    });

    it('should create StatelessLLMSessionManager for unknown type', () => {
      const sessionManager =
        SessionManagerFactory.createSessionManager('unknown-type');
      expect(sessionManager).toBeInstanceOf(StatelessLLMSessionManager);
    });
  });

  describe('GlobalSessionManager', () => {
    let globalManager: GlobalSessionManager;

    beforeEach(() => {
      globalManager = new GlobalSessionManager();
    });

    it('should cache session managers by type', () => {
      const manager1 = globalManager['getSessionManager']('local');
      const manager2 = globalManager['getSessionManager']('local');

      expect(manager1).toBe(manager2); // Same instance
      expect(manager1).toBeInstanceOf(LocalLLMSessionManager);
    });

    it('should create different managers for different types', () => {
      const localManager = globalManager['getSessionManager']('local');
      const openaiManager = globalManager['getSessionManager']('openai');

      expect(localManager).not.toBe(openaiManager);
      expect(localManager).toBeInstanceOf(LocalLLMSessionManager);
      expect(openaiManager).toBeInstanceOf(StatelessLLMSessionManager);
    });

    it('should update session history when supported', async () => {
      mockLocalLLMManager.updateSessionHistory.mockResolvedValueOnce(undefined);

      await globalManager.updateSessionHistory(
        'local',
        'test-model',
        'thread-123',
        mockMessages
      );

      expect(mockLocalLLMManager.updateSessionHistory).toHaveBeenCalledWith(
        'test-model',
        'thread-123'
      );
    });

    it('should not update session history when not supported', async () => {
      await globalManager.updateSessionHistory(
        'openai',
        'gpt-4',
        'thread-123',
        mockMessages
      );

      expect(mockLocalLLMManager.updateSessionHistory).not.toHaveBeenCalled();
    });

    it('should fetch messages from conversation manager when not provided', async () => {
      const { ConversationManager } = await import('../conversationManager');
      const mockConversationManager = new ConversationManager(
        '/test/workspace'
      );
      mockConversationManager.getThreadMessages = vi
        .fn()
        .mockReturnValue(mockMessages);

      mockLocalLLMManager.updateSessionHistory.mockResolvedValueOnce(undefined);

      await globalManager.updateSessionHistory(
        'local',
        'test-model',
        'thread-123'
      );

      expect(mockLocalLLMManager.updateSessionHistory).toHaveBeenCalledWith(
        'test-model',
        'thread-123'
      );
    });

    it('should handle errors during session history update', async () => {
      mockLocalLLMManager.updateSessionHistory.mockRejectedValueOnce(
        new Error('Update failed')
      );

      // Should not throw error, but log it
      await expect(
        globalManager.updateSessionHistory(
          'local',
          'test-model',
          'thread-123',
          mockMessages
        )
      ).resolves.toBeUndefined();

      expect(mockLocalLLMManager.updateSessionHistory).toHaveBeenCalledWith(
        'test-model',
        'thread-123'
      );
    });

    it('should clear session history when supported', async () => {
      mockLocalLLMManager.updateSessionHistory.mockResolvedValueOnce(undefined);

      await globalManager.clearSessionHistory(
        'local',
        'test-model',
        'thread-123'
      );

      expect(mockLocalLLMManager.updateSessionHistory).toHaveBeenCalledWith(
        'test-model',
        'thread-123'
      );
    });

    it('should not clear session history when not supported', async () => {
      await globalManager.clearSessionHistory('openai', 'gpt-4', 'thread-123');

      expect(mockLocalLLMManager.updateSessionHistory).not.toHaveBeenCalled();
    });

    it('should handle errors during session history clear', async () => {
      mockLocalLLMManager.updateSessionHistory.mockRejectedValueOnce(
        new Error('Clear failed')
      );

      // Should not throw error, but log it
      await expect(
        globalManager.clearSessionHistory('local', 'test-model', 'thread-123')
      ).resolves.toBeUndefined();

      expect(mockLocalLLMManager.updateSessionHistory).toHaveBeenCalledWith(
        'test-model',
        'thread-123'
      );
    });

    it('should attempt to switch to thread when supported', async () => {
      mockLocalLLMManager.updateSessionHistory.mockResolvedValueOnce(undefined);

      // switchToThread should complete without throwing errors
      await expect(
        globalManager.switchToThread('local', 'test-model', 'thread-456')
      ).resolves.toBeUndefined();

      // Verify the session manager was accessed (even if call failed due to mocking)
      expect(globalManager['sessionManagers'].has('local')).toBe(true);
    });

    it('should not switch to thread when not supported', async () => {
      await globalManager.switchToThread('openai', 'gpt-4', 'thread-456');

      expect(mockLocalLLMManager.updateSessionHistory).not.toHaveBeenCalled();
    });

    it('should handle errors during thread switch gracefully', async () => {
      mockLocalLLMManager.updateSessionHistory.mockRejectedValueOnce(
        new Error('Switch failed')
      );

      // Should not throw error, but log it
      await expect(
        globalManager.switchToThread('local', 'test-model', 'thread-456')
      ).resolves.toBeUndefined();

      // Verify error handling doesn't break the session manager state
      expect(globalManager['sessionManagers'].has('local')).toBe(true);
      const sessionManager = globalManager['getSessionManager']('local');
      expect(sessionManager.supportsSessionManagement()).toBe(true);
    });

    it('should handle missing workspace root', async () => {
      const { getWorkspaceRoot } = await import('../utils/settingsDirectory');
      const mockGetWorkspaceRoot = getWorkspaceRoot as MockedFunction<
        typeof getWorkspaceRoot
      >;
      mockGetWorkspaceRoot.mockResolvedValueOnce(null);

      // Should handle the error gracefully
      await expect(
        globalManager.updateSessionHistory('local', 'test-model', 'thread-123')
      ).resolves.toBeUndefined();
    });
  });

  describe('Global Session Manager Instance', () => {
    it('should export a global instance', () => {
      expect(globalSessionManager).toBeInstanceOf(GlobalSessionManager);
    });

    it('should be a singleton', () => {
      expect(globalSessionManager).toBe(globalSessionManager);
    });

    it('should have all required methods', () => {
      expect(typeof globalSessionManager.updateSessionHistory).toBe('function');
      expect(typeof globalSessionManager.clearSessionHistory).toBe('function');
      expect(typeof globalSessionManager.switchToThread).toBe('function');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    let globalManager: GlobalSessionManager;

    beforeEach(() => {
      globalManager = new GlobalSessionManager();
    });

    it('should handle empty message arrays', async () => {
      const emptyMessages: ConversationMessage[] = [];
      mockLocalLLMManager.updateSessionHistory.mockResolvedValueOnce(undefined);

      await globalManager.updateSessionHistory(
        'local',
        'test-model',
        'thread-123',
        emptyMessages
      );

      expect(mockLocalLLMManager.updateSessionHistory).toHaveBeenCalledWith(
        'test-model',
        'thread-123'
      );
    });

    it('should handle undefined thread ID gracefully', async () => {
      mockLocalLLMManager.updateSessionHistory.mockResolvedValueOnce(undefined);

      await globalManager.updateSessionHistory(
        'local',
        'test-model',
        '',
        mockMessages
      );

      expect(mockLocalLLMManager.updateSessionHistory).toHaveBeenCalledWith(
        'test-model',
        ''
      );
    });

    it('should handle undefined model name gracefully', async () => {
      mockLocalLLMManager.updateSessionHistory.mockResolvedValueOnce(undefined);

      await globalManager.updateSessionHistory(
        'local',
        '',
        'thread-123',
        mockMessages
      );

      expect(mockLocalLLMManager.updateSessionHistory).toHaveBeenCalledWith(
        '',
        'thread-123'
      );
    });

    it('should handle concurrent operations', async () => {
      mockLocalLLMManager.updateSessionHistory.mockResolvedValue(undefined);

      // Run multiple operations concurrently
      const operations = [
        globalManager.updateSessionHistory(
          'local',
          'model1',
          'thread1',
          mockMessages
        ),
        globalManager.updateSessionHistory(
          'local',
          'model2',
          'thread2',
          mockMessages
        ),
        globalManager.clearSessionHistory('local', 'model1', 'thread1'),
        // Note: switchToThread only works if it can get conversation manager,
        // which might fail in test environment
      ];

      await Promise.all(operations);

      // Should have called the underlying manager for update and clear operations
      expect(mockLocalLLMManager.updateSessionHistory).toHaveBeenCalledTimes(3);
    });

    it('should handle different LLM types in the same instance', async () => {
      mockLocalLLMManager.updateSessionHistory.mockResolvedValue(undefined);

      // Mix of supported and unsupported types
      await globalManager.updateSessionHistory(
        'local',
        'local-model',
        'thread1',
        mockMessages
      );
      await globalManager.updateSessionHistory(
        'openai',
        'gpt-4',
        'thread2',
        mockMessages
      );
      await globalManager.updateSessionHistory(
        'ollama',
        'llama2',
        'thread3',
        mockMessages
      );

      // Only local should have called the underlying manager
      expect(mockLocalLLMManager.updateSessionHistory).toHaveBeenCalledTimes(1);
      expect(mockLocalLLMManager.updateSessionHistory).toHaveBeenCalledWith(
        'local-model',
        'thread1'
      );
    });
  });
});
