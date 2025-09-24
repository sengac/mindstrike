import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockedFunction,
} from 'vitest';
import { LlamaSessionManager } from '../sessionManager.js';
import type {
  LlamaModel,
  LlamaContext,
  LlamaChatSession,
  ChatHistoryItem,
} from 'node-llama-cpp';

// Create a proper mock interface
interface MockLlamaChatSession {
  context: LlamaContext;
  sequence: { id: string };
  getChatHistory: MockedFunction<() => ChatHistoryItem[]>;
  setChatHistory: MockedFunction<(newHistory: ChatHistoryItem[]) => void>;
  onDispose: MockedFunction<(callback: () => void) => void>;
  dispose: MockedFunction<() => void>;
  disposed: boolean;
  chatWrapper: unknown;
}

// Mock logger
vi.mock('../../logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('LlamaSessionManager', () => {
  let manager: LlamaSessionManager;
  let mockModel: Partial<LlamaModel>;
  let mockContext: Partial<LlamaContext>;
  let mockSession: MockLlamaChatSession;
  let mockLlamaChatSession: MockedFunction<
    new (options: unknown) => LlamaChatSession
  >;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset the mock implementation for each test
    mockLlamaChatSession = vi.fn() as MockedFunction<
      new (options: unknown) => LlamaChatSession
    >;

    // Mock the module
    vi.doMock('node-llama-cpp', () => ({
      LlamaChatSession: mockLlamaChatSession,
    }));

    manager = new LlamaSessionManager();

    // Mock context
    mockContext = {
      dispose: vi.fn().mockResolvedValue(undefined),
      getSequence: vi.fn().mockReturnValue({
        id: 'test-sequence',
      }),
    };

    // Mock model
    mockModel = {
      createContext: vi.fn().mockResolvedValue(mockContext),
    };

    // Create mock session
    const chatHistory: ChatHistoryItem[] = [];
    mockSession = {
      context: mockContext as LlamaContext,
      sequence: {
        id: 'test-sequence',
      },
      getChatHistory: vi.fn(() => chatHistory.slice()),
      setChatHistory: vi.fn((newHistory: ChatHistoryItem[]) => {
        chatHistory.length = 0;
        chatHistory.push(...newHistory);
      }),
      onDispose: vi.fn(),
      dispose: vi.fn(),
      disposed: false,
      chatWrapper: {},
    } as MockLlamaChatSession;

    // Setup the constructor mock to return our session
    mockLlamaChatSession.mockImplementation(
      () => mockSession as LlamaChatSession & MockLlamaChatSession
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.doUnmock('node-llama-cpp');
  });

  describe('createSession', () => {
    it('should create a new session with specified config', async () => {
      const sessionId = 'test-session';
      const config = {
        contextSize: 4096,
        batchSize: 512,
        systemPrompt: 'You are a helpful assistant.',
      };

      const session = await manager.createSession(
        sessionId,
        mockModel as LlamaModel,
        config
      );

      expect(mockModel.createContext).toHaveBeenCalledWith({
        contextSize: 4096,
        batchSize: 512,
      });
      expect(session).toBeDefined();
      expect(manager.getSession(sessionId)).toBe(session);
      expect(manager.getSessionConfig(sessionId)).toEqual(config);
    });

    it('should handle creation errors', async () => {
      const error = new Error('Failed to create context');
      vi.mocked(mockModel.createContext).mockRejectedValue(error);

      await expect(
        manager.createSession('test-session', mockModel as LlamaModel, {
          contextSize: 4096,
          batchSize: 512,
        })
      ).rejects.toThrow('Failed to create context');
    });
  });

  describe('getSession', () => {
    it('should return existing session', async () => {
      const sessionId = 'test-session';
      await manager.createSession(sessionId, mockModel as LlamaModel, {
        contextSize: 4096,
        batchSize: 512,
      });

      const session = manager.getSession(sessionId);
      expect(session).toBeDefined();
    });

    it('should return undefined for non-existent session', () => {
      const session = manager.getSession('non-existent');
      expect(session).toBeUndefined();
    });
  });

  describe('recreateSession', () => {
    it('should recreate session with new config', async () => {
      const sessionId = 'test-session';
      const oldConfig = { contextSize: 2048, batchSize: 256 };
      const newConfig = { contextSize: 4096, batchSize: 512 };

      // Create initial session
      await manager.createSession(
        sessionId,
        mockModel as LlamaModel,
        oldConfig
      );

      // Create new mock session for the recreation
      const newChatHistory: ChatHistoryItem[] = [];
      const newMockSession = {
        context: mockContext,
        sequence: {
          id: 'test-sequence-new',
        },
        getChatHistory: vi.fn(() => newChatHistory.slice()),
        setChatHistory: vi.fn(newHistory => {
          newChatHistory.length = 0;
          newChatHistory.push(...newHistory);
        }),
      } as LlamaChatSession;

      // Update mock to return new session on next instantiation
      mockLlamaChatSession.mockImplementation(
        () => newMockSession as LlamaChatSession
      );

      // Recreate with new config
      await manager.recreateSession(
        sessionId,
        mockModel as LlamaModel,
        newConfig
      );

      expect(mockContext.dispose).toHaveBeenCalled();
      expect(mockModel.createContext).toHaveBeenCalledTimes(2);
      expect(mockModel.createContext).toHaveBeenLastCalledWith({
        contextSize: 4096,
        batchSize: 512,
      });
      expect(manager.getSessionConfig(sessionId)).toEqual(newConfig);
    });

    it('should preserve history when requested', async () => {
      const sessionId = 'test-session';
      const config = { contextSize: 2048, batchSize: 256 };

      // Create initial session with history
      const session = await manager.createSession(
        sessionId,
        mockModel as LlamaModel,
        config
      );
      const mockHistory = [
        { type: 'user' as const, text: 'Hello' },
        { type: 'model' as const, response: ['Hi there!'] },
      ] as ChatHistoryItem[];
      vi.mocked(session.getChatHistory).mockReturnValue(mockHistory);

      // Create new mock session for the recreation
      const newChatHistory: ChatHistoryItem[] = [];
      const newMockSession: Partial<LlamaChatSession> = {
        context: mockContext as LlamaContext,
        sequence: {
          id: 'test-sequence-new',
        },
        getChatHistory: vi.fn(() => newChatHistory.slice()),
        setChatHistory: vi.fn((newHistory: ChatHistoryItem[]) => {
          newChatHistory.length = 0;
          newChatHistory.push(...newHistory);
        }),
      };

      // Update mock to return new session on next instantiation
      mockLlamaChatSession.mockImplementation(
        () => newMockSession as LlamaChatSession
      );

      // Recreate preserving history
      const newSession = await manager.recreateSession(
        sessionId,
        mockModel as LlamaModel,
        config,
        true
      );

      expect(newSession.setChatHistory).toHaveBeenCalledWith([
        { type: 'user', text: 'Hello' },
        { type: 'model', response: ['Hi there!'] },
      ]);
    });

    it('should not preserve history when not requested', async () => {
      const sessionId = 'test-session';
      const config = { contextSize: 2048, batchSize: 256 };

      // Create initial session with history
      const session = await manager.createSession(
        sessionId,
        mockModel as LlamaModel,
        config
      );
      const mockHistory = [
        { type: 'user' as const, text: 'Hello' },
        { type: 'model' as const, response: ['Hi there!'] },
      ] as ChatHistoryItem[];
      vi.mocked(session.getChatHistory).mockReturnValue(mockHistory);

      // Create new mock session for the recreation
      const newChatHistory: ChatHistoryItem[] = [];
      const newMockSession: Partial<LlamaChatSession> = {
        context: mockContext as LlamaContext,
        sequence: {
          id: 'test-sequence-new',
        },
        getChatHistory: vi.fn(() => newChatHistory.slice()),
        setChatHistory: vi.fn((newHistory: ChatHistoryItem[]) => {
          newChatHistory.length = 0;
          newChatHistory.push(...newHistory);
        }),
      };

      // Update mock to return new session on next instantiation
      mockLlamaChatSession.mockImplementation(
        () => newMockSession as LlamaChatSession
      );

      // Recreate without preserving history
      const newSession = await manager.recreateSession(
        sessionId,
        mockModel as LlamaModel,
        config,
        false
      );

      expect(newSession.setChatHistory).not.toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ type: 'user', text: 'Hello' }),
        ])
      );
    });
  });

  describe('updateSessionHistory', () => {
    it('should update session with new history', async () => {
      const sessionId = 'test-session';
      const session = await manager.createSession(
        sessionId,
        mockModel as LlamaModel,
        {
          contextSize: 2048,
          batchSize: 256,
          systemPrompt: 'You are helpful.',
        }
      );

      const history = [
        { role: 'user' as const, content: 'What is 2+2?' },
        { role: 'assistant' as const, content: '2+2 equals 4.' },
      ];

      await manager.updateSessionHistory(sessionId, history);

      expect(session.setChatHistory).toHaveBeenCalledWith([
        {
          type: 'system',
          text: 'You are helpful.',
        },
        {
          type: 'user',
          text: 'What is 2+2?',
        },
        {
          type: 'model',
          response: ['2+2 equals 4.'],
        },
      ]);
    });

    it('should throw error if session not found', async () => {
      await expect(
        manager.updateSessionHistory('non-existent', [])
      ).rejects.toThrow('Session non-existent not found');
    });
  });

  describe('populateSessionWithHistory', () => {
    it('should populate session with initial history', async () => {
      const chatHistory: ChatHistoryItem[] = [];
      const session: Partial<LlamaChatSession> = {
        getChatHistory: vi.fn(() => chatHistory.slice()),
        setChatHistory: vi.fn((newHistory: ChatHistoryItem[]) => {
          chatHistory.length = 0;
          chatHistory.push(...newHistory);
        }),
      };

      const messages = [
        { role: 'user' as const, content: 'Hello' },
        { role: 'assistant' as const, content: 'Hi!' },
      ];

      await manager.populateSessionWithHistory(
        session as LlamaChatSession,
        messages,
        'System prompt'
      );

      expect(
        (session as MockLlamaChatSession).setChatHistory
      ).toHaveBeenCalledWith([
        {
          type: 'system',
          text: 'System prompt',
        },
        {
          type: 'user',
          text: 'Hello',
        },
        {
          type: 'model',
          response: ['Hi!'],
        },
      ]);
    });

    it('should handle missing setChatHistory', async () => {
      const session: Partial<LlamaChatSession> = {};

      await expect(
        manager.populateSessionWithHistory(
          session as LlamaChatSession,
          [],
          'System'
        )
      ).rejects.toThrow();
    });
  });

  describe('disposeSession', () => {
    it('should dispose session and free resources', async () => {
      const sessionId = 'test-session';
      await manager.createSession(sessionId, mockModel as LlamaModel, {
        contextSize: 2048,
        batchSize: 256,
      });

      await manager.disposeSession(sessionId);

      expect(mockContext.dispose).toHaveBeenCalled();
      expect(manager.getSession(sessionId)).toBeUndefined();
      expect(manager.getSessionConfig(sessionId)).toBeUndefined();
    });

    it('should handle disposal of non-existent session', async () => {
      await expect(
        manager.disposeSession('non-existent')
      ).resolves.not.toThrow();
    });

    it('should handle disposal errors gracefully', async () => {
      const sessionId = 'test-session';
      await manager.createSession(sessionId, mockModel as LlamaModel, {
        contextSize: 2048,
        batchSize: 256,
      });

      vi.mocked(mockContext.dispose).mockRejectedValue(
        new Error('Disposal error')
      );

      await manager.disposeSession(sessionId);

      // Despite error, session should be removed
      expect(manager.getSession(sessionId)).toBeUndefined();
    });
  });

  describe('disposeAllSessions', () => {
    it('should dispose all active sessions', async () => {
      // Create multiple sessions
      await manager.createSession('session1', mockModel as LlamaModel, {
        contextSize: 2048,
        batchSize: 256,
      });
      await manager.createSession('session2', mockModel as LlamaModel, {
        contextSize: 4096,
        batchSize: 512,
      });

      await manager.disposeAllSessions();

      expect(manager.getSessionCount()).toBe(0);
      expect(manager.getActiveSessionIds()).toHaveLength(0);
    });
  });

  describe('utility methods', () => {
    it('should check if session exists', async () => {
      const sessionId = 'test-session';
      expect(manager.hasSession(sessionId)).toBe(false);

      await manager.createSession(sessionId, mockModel as LlamaModel, {
        contextSize: 2048,
        batchSize: 256,
      });

      expect(manager.hasSession(sessionId)).toBe(true);
    });

    it('should get active session IDs', async () => {
      await manager.createSession('session1', mockModel as LlamaModel, {
        contextSize: 2048,
        batchSize: 256,
      });
      await manager.createSession('session2', mockModel as LlamaModel, {
        contextSize: 2048,
        batchSize: 256,
      });

      const ids = manager.getActiveSessionIds();
      expect(ids).toHaveLength(2);
      expect(ids).toContain('session1');
      expect(ids).toContain('session2');
    });

    it('should get session count', async () => {
      expect(manager.getSessionCount()).toBe(0);

      await manager.createSession('session1', mockModel as LlamaModel, {
        contextSize: 2048,
        batchSize: 256,
      });

      expect(manager.getSessionCount()).toBe(1);
    });

    it('should get session history', async () => {
      const sessionId = 'test-session';
      const session = await manager.createSession(
        sessionId,
        mockModel as LlamaModel,
        {
          contextSize: 2048,
          batchSize: 256,
        }
      );

      const mockHistory = [
        { type: 'user' as const, text: 'Test' },
        { type: 'model' as const, response: ['Response'] },
      ] as ChatHistoryItem[];
      vi.mocked(session.getChatHistory).mockReturnValue(mockHistory);

      const history = manager.getSessionHistory(sessionId);
      expect(history).toHaveLength(2);
      expect(history[0]).toEqual({ type: 'user', text: 'Test' });
    });

    it('should return empty history for non-existent session', () => {
      const history = manager.getSessionHistory('non-existent');
      expect(history).toEqual([]);
    });
  });
});
