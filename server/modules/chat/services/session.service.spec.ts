import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionService } from './session.service';
import type { SseService } from '../../events/services/sse.service';

describe('SessionService', () => {
  let service: SessionService;
  let sseService: Partial<SseService>;

  beforeEach(() => {
    // Create mock SSE service
    sseService = {
      broadcast: vi.fn(),
      sendToClient: vi.fn(),
    };

    // Directly instantiate the service with mocked dependency
    service = new SessionService(sseService as SseService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('createSession', () => {
    it('should create a new session', () => {
      const threadId = 'thread-123';
      const sessionId = service.createSession(threadId);

      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');
      expect(service.getSession(sessionId)).toBeDefined();
    });

    it('should initialize session with correct properties', () => {
      const threadId = 'thread-123';
      const sessionId = service.createSession(threadId);
      const session = service.getSession(sessionId);

      expect(session).toMatchObject({
        id: sessionId,
        threadId,
        active: true,
        messages: [],
        context: {},
      });
      expect(session?.createdAt).toBeInstanceOf(Date);
      expect(session?.lastActivity).toBeInstanceOf(Date);
    });

    it('should generate unique session IDs', () => {
      const sessionId1 = service.createSession('thread-1');
      const sessionId2 = service.createSession('thread-2');

      expect(sessionId1).not.toBe(sessionId2);
    });
  });

  describe('getSession', () => {
    it('should return session by ID', () => {
      const sessionId = service.createSession('thread-123');
      const session = service.getSession(sessionId);

      expect(session).toBeDefined();
      expect(session?.id).toBe(sessionId);
    });

    it('should return undefined for non-existent session', () => {
      const session = service.getSession('non-existent');

      expect(session).toBeUndefined();
    });
  });

  describe('updateSession', () => {
    it('should update existing session', () => {
      const sessionId = service.createSession('thread-123');

      const updates = {
        active: false,
        context: { key: 'value' },
      };

      const updated = service.updateSession(sessionId, updates);

      expect(updated).toBe(true);

      const session = service.getSession(sessionId);
      expect(session?.active).toBe(false);
      expect(session?.context).toEqual({ key: 'value' });
    });

    it('should update lastActivity timestamp', () => {
      const sessionId = service.createSession('thread-123');
      const originalSession = service.getSession(sessionId);
      const originalActivity = originalSession?.lastActivity;

      // Wait a bit to ensure timestamp difference
      const waitPromise = new Promise(resolve => setTimeout(resolve, 10));

      return waitPromise.then(() => {
        service.updateSession(sessionId, { active: false });
        const updatedSession = service.getSession(sessionId);

        expect(updatedSession?.lastActivity).not.toEqual(originalActivity);
        expect(updatedSession?.lastActivity.getTime()).toBeGreaterThan(
          originalActivity?.getTime() ?? 0
        );
      });
    });

    it('should return false for non-existent session', () => {
      const updated = service.updateSession('non-existent', { active: false });

      expect(updated).toBe(false);
    });

    it('should broadcast session update event', () => {
      const sessionId = service.createSession('thread-123');
      service.updateSession(sessionId, { active: false });

      expect(sseService.broadcast).toHaveBeenCalledWith(
        'session-update',
        expect.objectContaining({
          sessionId,
          updates: { active: false },
        })
      );
    });
  });

  describe('deleteSession', () => {
    it('should delete existing session', () => {
      const sessionId = service.createSession('thread-123');

      const deleted = service.deleteSession(sessionId);

      expect(deleted).toBe(true);
      expect(service.getSession(sessionId)).toBeUndefined();
    });

    it('should return false for non-existent session', () => {
      const deleted = service.deleteSession('non-existent');

      expect(deleted).toBe(false);
    });

    it('should broadcast session deletion event', () => {
      const sessionId = service.createSession('thread-123');
      service.deleteSession(sessionId);

      expect(sseService.broadcast).toHaveBeenCalledWith('session-deleted', {
        sessionId,
      });
    });
  });

  describe('addMessageToSession', () => {
    it('should add message to session', () => {
      const sessionId = service.createSession('thread-123');
      const message = {
        id: 'msg-1',
        content: 'Test message',
        role: 'user' as const,
        timestamp: new Date(),
      };

      const added = service.addMessageToSession(sessionId, message);

      expect(added).toBe(true);

      const session = service.getSession(sessionId);
      expect(session?.messages).toContainEqual(message);
    });

    it('should return false for non-existent session', () => {
      const message = {
        id: 'msg-1',
        content: 'Test message',
        role: 'user' as const,
        timestamp: new Date(),
      };

      const added = service.addMessageToSession('non-existent', message);

      expect(added).toBe(false);
    });

    it('should update lastActivity when adding message', () => {
      const sessionId = service.createSession('thread-123');
      const originalActivity = service.getSession(sessionId)?.lastActivity;

      // Wait to ensure timestamp difference
      const waitPromise = new Promise(resolve => setTimeout(resolve, 10));

      return waitPromise.then(() => {
        const message = {
          id: 'msg-1',
          content: 'Test message',
          role: 'user' as const,
          timestamp: new Date(),
        };

        service.addMessageToSession(sessionId, message);
        const updatedActivity = service.getSession(sessionId)?.lastActivity;

        expect(updatedActivity?.getTime()).toBeGreaterThan(
          originalActivity?.getTime() ?? 0
        );
      });
    });
  });

  describe('getSessionsByThread', () => {
    it('should return all sessions for a thread', () => {
      const threadId = 'thread-123';
      const sessionId1 = service.createSession(threadId);
      const sessionId2 = service.createSession(threadId);
      service.createSession('other-thread');

      const sessions = service.getSessionsByThread(threadId);

      expect(sessions).toHaveLength(2);
      expect(sessions.map(s => s.id)).toContain(sessionId1);
      expect(sessions.map(s => s.id)).toContain(sessionId2);
    });

    it('should return empty array for thread with no sessions', () => {
      const sessions = service.getSessionsByThread('no-sessions');

      expect(sessions).toEqual([]);
    });
  });

  describe('getActiveSessions', () => {
    it('should return only active sessions', () => {
      const activeId1 = service.createSession('thread-1');
      const activeId2 = service.createSession('thread-2');
      const inactiveId = service.createSession('thread-3');

      service.updateSession(inactiveId, { active: false });

      const activeSessions = service.getActiveSessions();

      expect(activeSessions).toHaveLength(2);
      expect(activeSessions.map(s => s.id)).toContain(activeId1);
      expect(activeSessions.map(s => s.id)).toContain(activeId2);
      expect(activeSessions.map(s => s.id)).not.toContain(inactiveId);
    });

    it('should return empty array when no active sessions', () => {
      const sessionId = service.createSession('thread-1');
      service.updateSession(sessionId, { active: false });

      const activeSessions = service.getActiveSessions();

      expect(activeSessions).toEqual([]);
    });
  });

  describe('cleanupInactiveSessions', () => {
    it('should remove sessions inactive for longer than timeout', () => {
      vi.useFakeTimers();

      const sessionId1 = service.createSession('thread-1');
      const sessionId2 = service.createSession('thread-2');

      // Make session1 old AND inactive
      const session1 = service.getSession(sessionId1);
      if (session1) {
        session1.lastActivity = new Date(Date.now() - 31 * 60 * 1000); // 31 minutes ago
        session1.active = false; // Mark as inactive
      }

      const removed = service.cleanupInactiveSessions(30); // 30 minute timeout

      expect(removed).toBe(1);
      expect(service.getSession(sessionId1)).toBeUndefined();
      expect(service.getSession(sessionId2)).toBeDefined();

      vi.useRealTimers();
    });

    it('should not remove recently active sessions', () => {
      vi.useFakeTimers();

      const sessionId = service.createSession('thread-1');

      const removed = service.cleanupInactiveSessions(30);

      expect(removed).toBe(0);
      expect(service.getSession(sessionId)).toBeDefined();
    });

    it('should not remove active sessions regardless of age', () => {
      const sessionId = service.createSession('thread-1');

      // Make session old but keep it active
      const session = service.getSession(sessionId);
      if (session) {
        session.lastActivity = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
        session.active = true;
      }

      const removed = service.cleanupInactiveSessions(30);

      expect(removed).toBe(0);
      expect(service.getSession(sessionId)).toBeDefined();
    });
  });
});
